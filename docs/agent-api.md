# Agent API Reference

## 1. Overview

A Test Server Agent is a process that runs on a test machine and connects to sol-server to receive commands and stream test output. Agents identify themselves with a `serverId` (a CUID assigned at registration) and authenticate with a plain-text token stored bcrypt-hashed in the database. The primary transport is WebSocket; agents that cannot establish a WebSocket connection may use the HTTP long-poll fallback instead.

---

## 2. Authentication & Registration

### Register an agent

**Tango procedure:** `agents.register` (command)
**HTTP path:** `POST /api/tango`

This procedure is **public** — it does not require an API key or session cookie. Registration stores a bcrypt hash of the supplied token and returns the agent's permanent `serverId`.

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

When an agent connects, the token is validated in this order:

1. **Token required** — if no token is provided, the connection is rejected immediately.
2. **DB lookup** — finds the `TestServer` record by `serverId` and runs `bcrypt.compare(token, record.token)`.
3. **`AGENT_TOKEN` env var** — if the DB is unreachable or the record does not exist, compares the plain-text token against `AGENT_TOKEN`. If `AGENT_TOKEN` is also unset, the connection is **rejected**.

There is no allow-all dev mode. A valid token is always required.

---

## 3. WebSocket Connection

**URL:**
```
ws://<host>/api/agent/ws?serverId=<id>&token=<plain-text-token>
```

- The WS upgrade is handled before SvelteKit routing: by the Vite plugin in dev, by `server.ts` in production.
- A bad or missing token results in an **HTTP 401** at the upgrade step — the WebSocket is never established.
- On successful connection the agent should immediately send a `SCRIPTS` message to announce available scripts.

### App → Agent messages

| Type | When sent | Required fields |
|------|-----------|----------------|
| `COMMAND` | Dashboard or API sends a device command | `deviceId: string`, `action: "POWER_ON" \| "POWER_OFF"` |
| `DISPATCH` | A test run is triggered | `testRunId: string` |
| `RUN_SCRIPT` | After `agents.runScript` Tango call | `scriptName: string`, `runId: string` |

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
{ "type": "STATUS", "testRunId": "clrun9876543210abcdef", "event": "STARTED" }
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

---

## 5. SSE Log Stream

Clients subscribe to a test run's log output via Server-Sent Events. The agent drives this stream by sending `LOG` frames over its WebSocket connection. Logs are also written to disk at `{LOG_DIR}/{runId}.log` on the server for archival.

**URL:**
```
GET /api/test-runs/<testRunId>/logs
```

**Each log event:**
```
data: {"line":"PASS src/foo.test.ts","ts":"2026-03-16T12:00:01.234Z"}

```

**Keep-alive comment** (every 15 s):
```
: keep-alive

```

- The stream stays open until the client disconnects.
- Logs are **buffered per `runId`** in memory on the server. Late SSE subscribers receive all buffered lines on connect. Buffers are cleaned up 60 s after the run completes.
- `STATUS` frames are also forwarded to SSE subscribers as `[status] <event>` lines.

### Log file format

Each run produces a file at `{LOG_DIR}/{runId}.log` (default `./logs/runs/{runId}.log`):
```
[2026-03-16T12:00:00.000Z] [STATUS] STARTED
[2026-03-16T12:00:01.234Z] PASS src/foo.test.ts
[2026-03-16T12:00:02.000Z] [STATUS] PASSED
```

---

## 6. Tango-RPC Authentication

All Tango procedures (except `agents.register`) require authentication via one of:

1. **Valid session cookie** (`__session`) — set after logging in at `/login`
2. **`X-Api-Key` header** — must match the `API_KEY` environment variable

```http
POST /api/tango
X-Api-Key: your-api-key
Content-Type: application/json
```

Requests without valid auth receive **HTTP 401**.

### Tango procedure reference

| Procedure | Type | Auth required | Purpose |
|-----------|------|--------------|---------|
| `agents.register` | command | No | Register or rotate token; returns `{ id, name }` |
| `agents.list` | query | Yes | List all registered servers with live online status |
| `agents.dispatch` | command | Yes | Send a `COMMAND` or `DISPATCH` to one or all agents |
| `agents.runScript` | command | Yes | Send `RUN_SCRIPT` to an agent; returns `{ runId }` |
| `agents.getScripts` | command | Yes | Get the script list last reported by a connected agent |
| `environments.list` | query | Yes | List all environments |
| `environments.create` | command | Yes | Create an environment |
| `environments.delete` | command | Yes | Delete an environment |
| `users.list` | query | Yes | List all users |
| `users.create` | command | Yes | Create a user |
| `users.delete` | command | Yes | Delete a user |
| `users.changePassword` | command | Yes | Change a user's password |

---

## 7. Full Connection Sequence

```
Agent                                    App
  |                                        |
  |-- POST /api/tango (agents.register) -->|   [no auth required]
  |<-- { id: "clxyz...", name: "..." } ----|   [save id + token]
  |                                        |
  |-- WS upgrade: /api/agent/ws           |
  |   ?serverId=clxyz...&token=secret ---->|   [validateToken → bcrypt.compare]
  |<-- HTTP 101 Switching Protocols -------|
  |                                        |
  |-- SCRIPTS { scripts: ["..."] } ------->   [on connect: list of available scripts]
  |                                        |
  |-- PING -------------------------------->   [every ~30 s]
  |-- PING -------------------------------->
  |                                        |
  |<-- COMMAND { deviceId, action } -------|   [dashboard action]
  |-- ACK { deviceId, status, ts } ------->
  |                                        |
  |<-- DISPATCH { testRunId } -------------|   [test run triggered]
  |-- STATUS { testRunId, "STARTED" } ---->   [run progress]
  |-- LOG { testRunId, line, ts } -------->   [each output line → buffered + SSE + log file]
  |-- STATUS { testRunId, "PASSED" } ----->
  |                                        |
  |<-- RUN_SCRIPT { scriptName, runId } ---|   [browser triggers script run]
  |-- STATUS { runId, "STARTED" } -------->
  |-- LOG { runId, line, ts } ------------>   [each output line → buffered + SSE + log file]
  |-- STATUS { runId, "PASSED" } --------->
  |                                        |
```

---

## 8. Dev vs Production

| | Development | Production |
|--|-------------|------------|
| **WS URL** | `ws://localhost:5173/api/agent/ws` | `ws://<host>:<PORT>/api/agent/ws` |
| **HTTP base** | `http://localhost:5173` | `http://<host>:<PORT>` (default `PORT=3000`) |
| **Token validation** | Requires valid DB record or `AGENT_TOKEN` | Same — no allow-all mode |
| **WS upgrade handler** | Vite plugin (`vite.config.ts`) | `server.ts` wraps SvelteKit adapter |

---

## 9. Error Reference

| Scenario | Behaviour |
|----------|-----------|
| Missing or invalid token at WS upgrade | HTTP 401 — WebSocket is never established |
| Tango request without auth | HTTP 401 |
| No `PING` received for 90 s | Agent marked `online: false`; connection stays open |
| Malformed JSON WebSocket frame | Silently ignored |
| `agents.dispatch` to offline agent | Tango error: `"Agent <id> is not connected"` |
| Long-poll timeout (30 s, no command) | `{ "commands": [] }` — re-poll immediately |
| Missing `serverId` on poll request | HTTP 400 |
