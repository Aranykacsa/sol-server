# Agent API Reference

## 1. Overview

A Test Server Agent is a process that runs on a test machine and connects to the sol-server application to receive commands and stream test output. Agents identify themselves with a `serverId` (a CUID assigned at registration) and authenticate with a plain-text token that is stored bcrypt-hashed in the database. The primary transport is WebSocket; agents that cannot establish a WebSocket connection may use the HTTP long-poll fallback instead.

---

## 2. Authentication & Registration

### Register an agent

**Tango procedure:** `agents.register` (command)
**HTTP path:** `POST /api/tango`

Registration stores a bcrypt hash of the supplied token in the database and returns the agent's permanent `serverId`. Call this once before the first connection; call it again to rotate the token.

**Request:**
```json
{
  "proc": "agents.register",
  "args": {
    "name": "rack-01",
    "token": "my-secret-token"
  }
}
```

**Response:**
```json
{
  "id": "clxyz1234567890abcdef",
  "name": "rack-01"
}
```

- `id` is a CUID — save it; it is required for all subsequent connections.
- `token` is only ever sent in plain text over the wire. The database stores only the bcrypt hash.

### Token validation chain

When an agent connects, the app validates the token in this order:

1. **DB lookup** — finds the `TestServer` record by `serverId` and runs `bcrypt.compare(token, record.token)`.
2. **`AGENT_TOKEN` env var** — if the DB is unreachable or the record does not exist, compares the plain-text token against `process.env.AGENT_TOKEN`.
3. **Allow-all** — if `AGENT_TOKEN` is also unset, every connection is accepted (dev mode).

### Dev shortcut

In development you can skip registration entirely. Connect without a `serverId` query parameter; the app assigns a random UUID for the session. Token validation falls through to allow-all if `AGENT_TOKEN` is not set.

---

## 3. WebSocket Connection

**URL:**
```
ws://<host>/api/agent/ws?serverId=<id>&token=<plain-text-token>
```

- The WS upgrade is handled before SvelteKit routing: by the Vite plugin in dev, by `server.ts` in production.
- A bad or missing token results in an **HTTP 401** at the upgrade step — the WebSocket is never established.
- On successful connection the app immediately sends a `STATE_UPDATE` with `key: "__full__"` containing the full current state snapshot, so the agent is in sync before any commands arrive.

### App → Agent messages

| Type | When sent | Required fields |
|------|-----------|----------------|
| `STATE_UPDATE` | On connect (`key="__full__"`); whenever any state key changes | `key: string`, `value: unknown` |
| `COMMAND` | Dashboard or API sends a device command | `deviceId: string`, `action: "POWER_ON" \| "POWER_OFF"` |
| `DISPATCH` | A test run is triggered | `testRunId: string` |
| `RUN_SCRIPT` | After `agents.runScript` Tango call | `scriptName: string`, `runId: string` |

**STATE_UPDATE — full snapshot (on connect):**
```json
{ "type": "STATE_UPDATE", "key": "__full__", "value": { "switch": true } }
```

**STATE_UPDATE — single key:**
```json
{ "type": "STATE_UPDATE", "key": "switch", "value": false }
```

**COMMAND:**
```json
{ "type": "COMMAND", "deviceId": "device-42", "action": "POWER_ON" }
```

**DISPATCH:**
```json
{ "type": "DISPATCH", "testRunId": "clrun9876543210abcdef" }
```

**RUN_SCRIPT:**
```json
{ "type": "RUN_SCRIPT", "scriptName": "smoke-test.sh", "runId": "550e8400-e29b-41d4-a716-446655440000" }
```

### Agent → App messages

| Type | When to send | Required fields |
|------|--------------|----------------|
| `PING` | Every ~30 s (heartbeat) | — |
| `ACK` | After handling a `COMMAND` | `deviceId: string`, `status: "ON" \| "OFF"`, `ts: string` (ISO-8601) |
| `STATUS` | Progress events during a test run | `testRunId: string`, `event: string` |
| `LOG` | Each line of test output | `testRunId: string`, `line: string`, `ts: string` (ISO-8601) |
| `SCRIPTS` | On connect | `scripts: string[]` |

**PING:**
```json
{ "type": "PING" }
```

**ACK:**
```json
{ "type": "ACK", "deviceId": "device-42", "status": "ON", "ts": "2026-03-16T12:00:00.000Z" }
```

**STATUS:**
```json
{ "type": "STATUS", "testRunId": "clrun9876543210abcdef", "event": "suite:started" }
```

**LOG:**
```json
{ "type": "LOG", "testRunId": "clrun9876543210abcdef", "line": "PASS src/foo.test.ts", "ts": "2026-03-16T12:00:01.234Z" }
```

**SCRIPTS:**
```json
{ "type": "SCRIPTS", "scripts": ["smoke-test.sh", "flash.sh"] }
```

### Heartbeat rules

- The app checks all connections every **15 seconds**.
- Any agent that has not sent a `PING` within the last **90 seconds** is marked `online: false`.
- The WebSocket connection itself is not closed — the agent may recover by sending another `PING`.
- Send a `PING` at least once every 30 seconds to stay reliably online.

---

## 4. Long-Poll Fallback

Use this transport only when a persistent WebSocket connection is not feasible.

**URL:**
```
GET /api/agent/poll?serverId=<id>
```

- The request blocks for up to **30 seconds**.
- Returns `{ "commands": [<AppToAgentMessage>] }` as soon as a command is queued, or `{ "commands": [] }` on timeout.
- The agent must **immediately re-poll** after each response to avoid missing commands.
- Returns **HTTP 400** if `serverId` is missing.
- Commands queued while no poll is open are **dropped** — the WebSocket transport is strongly preferred.
- Does not support streaming `LOG` frames; use the SSE endpoint for log output.

**Timeout response:**
```json
{ "commands": [] }
```

**Command delivery response:**
```json
{ "commands": [{ "type": "DISPATCH", "testRunId": "clrun9876543210abcdef" }] }
```

---

## 5. SSE Log Stream

Clients (browser dashboard, CI runners) subscribe to a test run's log output via Server-Sent Events. The agent drives this stream by sending `LOG` frames over its WebSocket connection.

**URL:**
```
GET /api/test-runs/<testRunId>/logs
```

**Response headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Each log event:**
```
data: {"line":"PASS src/foo.test.ts","ts":"2026-03-16T12:00:01.234Z"}

```

**Keep-alive comment** (every 15 s, prevents proxy timeouts):
```
: keep-alive

```

- The stream stays open until the client disconnects.
- Logs are **buffered per `runId`** in memory on the server. An SSE subscriber that connects after the agent has already emitted lines receives all buffered lines immediately on connect, then live lines from that point on. Buffers are cleaned up 60 s after the run completes (`PASSED`, `FAILED*`, or `ERROR` status event).
- `STATUS` frames are also forwarded to SSE subscribers as `[status] <event>` lines.

---

## 6. Tango-RPC Reference

All procedures share the same HTTP endpoint:

```
POST /api/tango
Content-Type: application/json

{ "proc": "<namespace>.<procedure>", "args": <args> }
```

### Procedures relevant to agents

| Procedure | Type | Purpose |
|-----------|------|---------|
| `agents.register` | command | Register or rotate token; returns `{ id, name }` |
| `agents.list` | query | List all registered servers with live online status |
| `agents.dispatch` | command | Send a `COMMAND` or `DISPATCH` to one or all agents |
| `agents.runScript` | command | Send `RUN_SCRIPT` to an agent; returns `{ runId }` for SSE subscription |
| `agents.getScripts` | command | Get the script list last reported by a connected agent |
| `switch.set` | command | Update the shared switch value and broadcast `STATE_UPDATE` |
| `switch.get` | command | Read the current switch value |

### `agents.register`

**Request args:**
```json
{ "name": "rack-01", "token": "my-secret-token" }
```
**Response:**
```json
{ "id": "clxyz1234567890abcdef", "name": "rack-01" }
```
Upserts by `name` — safe to call on every startup to rotate the token.

### `agents.dispatch`

Sends a message to one specific agent (by `serverId`) or broadcasts to all connected agents.

**Send to one agent:**
```json
{
  "serverId": "clxyz1234567890abcdef",
  "type": "COMMAND",
  "deviceId": "device-42",
  "action": "POWER_ON"
}
```
**Response:**
```json
{ "ok": true, "serverId": "clxyz1234567890abcdef" }
```

**Broadcast to all agents:**
```json
{
  "type": "DISPATCH",
  "testRunId": "clrun9876543210abcdef"
}
```
**Response:**
```json
{ "ok": true, "broadcast": true }
```

If the targeted agent is not connected, the procedure throws an error.

---

## 7. Full Connection Sequence

```
Agent                                    App
  |                                        |
  |-- POST /api/tango (agents.register) -->|
  |<-- { id: "clxyz...", name: "..." } ----|   [save id + token]
  |                                        |
  |-- WS upgrade: /api/agent/ws           |
  |   ?serverId=clxyz...&token=secret ---->|   [validateToken → bcrypt.compare]
  |<-- HTTP 101 Switching Protocols -------|
  |                                        |
  |<-- STATE_UPDATE key="__full__"         |   [full state snapshot on connect]
  |    { switch: true }                    |
  |-- SCRIPTS { scripts: ["..."] } ------->   [on connect: list of available scripts]
  |                                        |
  |-- PING -------------------------------->   [every ~30 s]
  |-- PING -------------------------------->
  |                                        |
  |<-- COMMAND { deviceId, action } -------|   [dashboard action]
  |-- ACK { deviceId, status, ts } ------->
  |                                        |
  |<-- DISPATCH { testRunId } -------------|   [test run triggered]
  |-- STATUS { testRunId, event } -------->   [run progress]
  |-- LOG { testRunId, line, ts } -------->   [each output line, buffered + forwarded to SSE]
  |-- LOG { testRunId, line, ts } -------->
  |-- STATUS { testRunId, event:"done" } ->
  |                                        |
  |<-- RUN_SCRIPT { scriptName, runId } ---|   [browser triggers script run]
  |-- STATUS { runId, event:"STARTED" } -->
  |-- LOG { runId, line, ts } ------------>   [each output line, buffered + forwarded to SSE]
  |-- STATUS { runId, event:"PASSED" } --->
  |                                        |
  |<-- STATE_UPDATE { key:"switch", ... } -|   [broadcast when switch changes]
  |                                        |
```

---

## 8. Dev vs Production

| | Development | Production |
|--|-------------|------------|
| **WS URL** | `ws://localhost:5173/api/agent/ws` | `ws://<host>:<PORT>/api/agent/ws` |
| **HTTP base** | `http://localhost:5173` | `http://<host>:<PORT>` (default `PORT=3000`) |
| **Token validation** | Allows all connections if `AGENT_TOKEN` is unset | Requires a valid DB record or `AGENT_TOKEN` env var |
| **Registration** | Optional — connect without `serverId` for a session UUID | Recommended — persist `serverId` and rotate token on deploy |
| **WS upgrade handler** | Vite plugin (`vite.config.ts`) | `server.ts` wraps SvelteKit adapter |

---

## 9. Error Reference

| Scenario | Behaviour |
|----------|-----------|
| Bad or missing token at WS upgrade | HTTP 401 — WebSocket is never established |
| No `PING` received for 90 s | Agent marked `online: false`; connection stays open; recovers on next `PING` |
| Malformed JSON WebSocket frame | Silently ignored |
| `agents.dispatch` to offline/disconnected agent | Tango error: `"Agent <id> is not connected"` |
| Long-poll timeout (30 s, no command) | `{ "commands": [] }` — re-poll immediately |
| Missing `serverId` on poll request | HTTP 400 |
| Command queued while no poll is open | Command is dropped — prefer WebSocket |
| No SSE subscriber when LOG arrives | Log line is **buffered** — late SSE subscribers receive all buffered lines on connect |
