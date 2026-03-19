# sol-server Current State

> This document tracks what is actually implemented. Updated as the codebase changes.

---

## What's Built

### Agent WebSocket Server
**Files:**
- `src/lib/agent-ws.ts` — core module
- `src/routes/api/agent/+server.ts` — REST dispatch endpoint
- `src/routes/api/agent/ws/+server.ts` — WebSocket endpoint (HTTP side)
- `src/routes/api/agent/poll/+server.ts` — long-poll fallback
- `vite.config.ts` — dev-mode WebSocket upgrade interception
- `server.ts` — production HTTP server with WebSocket upgrade handler

**What it does:**
- Accepts WebSocket connections from Test Server Agents at `ws://[host]/api/agent/ws`
- Authenticates agents via `AGENT_TOKEN` query param
- Maintains an in-memory registry keyed by `serverId`
- Tracks heartbeat (PING every 30s; OFFLINE after 90s with no ping)
- Sends typed `COMMAND` and `DISPATCH` messages to agents
- Receives typed `ACK`, `PING`, and `STATUS` messages from agents
- Exposes `GET /api/agent` to list connected agents
- Exposes `POST /api/agent` to dispatch commands (to one or all agents)
- Provides long-poll fallback at `GET /api/agent/poll?serverId=xxx`

**Limitations / TODOs:**
- Token validation compares plain-text against `AGENT_TOKEN` env var — needs hashed DB lookup via `TestServer` table once Prisma is set up
- Long-poll waiter map is in-process only — replace with Redis pub/sub for multi-instance deployments
- No ACK/STATUS handlers actually do anything yet beyond logging — need to hook into workflow engine

---

### Terminal Log Streaming
**Files:**
- `src/lib/server/services/agentWs.ts` — `LOG`/`STATUS` message types, `logBus` (EventEmitter), per-runId log buffer
- `src/routes/api/test-runs/[id]/logs/+server.ts` — SSE endpoint

**What it does:**
- Agent sends `{ type: 'LOG', testRunId, line, ts }` WebSocket frames while a test runs
- Agent sends `{ type: 'STATUS', testRunId, event }` frames for run progress (STARTED / PASSED / FAILED(N) / ERROR)
- App receives both and emits onto `logBus` keyed by `runId`; `STATUS` frames are forwarded as `[status] <event>` lines
- Log lines are **buffered per `runId`** in `globalThis.__runLogs`; late SSE subscribers receive all buffered lines immediately on connect
- Buffers are cleaned up 60 s after the run completes (`PASSED`, `FAILED*`, or `ERROR` event)
- SSE endpoint subscribes to `logBus` (subscribe-first-then-replay pattern) and forwards each line to the browser as `data: {"line":"...","ts":"..."}`
- Keep-alive comment sent every 15 s to prevent proxy timeouts
- Cleans up listener on client disconnect
- `RUN_SCRIPT` (`AppToAgentMessage`) — sends `{ scriptName, runId }` to an agent to run a named script

**Agent sends:**
```json
{ "type": "LOG", "testRunId": "abc123", "line": "I (1234) wifi: connected", "ts": "2026-03-13T10:00:00.000Z" }
```

**Browser subscribes:**
```ts
const es = new EventSource('/api/test-runs/abc123/logs');
es.onmessage = (e) => console.log(JSON.parse(e.data).line);
```

---

### Terminal Streaming UI
**File:** `src/routes/test-runs/[id]/+page.svelte`

**What it does:**
- Full-screen **agent terminal view** at `/test-runs/<agentId>`
- Scripts sidebar — lists `.sh`/`.py`/`.ts`/`.js` files from the agent's scripts directory; polled via `agents.getScripts` every 5 s
- Clicking **Run** calls `agents.runScript`, receives a `runId`, and opens an SSE connection to `/api/test-runs/<runId>/logs`
- SSE connection is opened dynamically per run (not fixed on mount); previous run's stream is closed before opening a new one
- Displays each log line with a `HH:MM:SS.mmm` timestamp prefix
- Auto-scrolls to bottom; pauses when user scrolls up, resumes on scroll back down
- Shows connection status (connecting / connected / disconnected) with a pulsing dot
- "Reconnect" button when stream ends
- Line count in footer

---

### Shared State Store + Switch UI
**Files:**
- `src/lib/server/state.ts` — in-memory key/value store; broadcasts `STATE_UPDATE` to all agents on change
- `src/routes/api/switch/+server.ts` — `GET` returns `{ value: boolean }`, `POST` sets and broadcasts
- `src/routes/+page.server.ts` — loads initial switch value server-side
- `src/routes/+page.svelte` — toggle switch UI (Svelte 5 runes)

**What it does:**
- Switch value is loaded from the server on page load (no flash of wrong state)
- Toggling the switch POSTs to `/api/switch`, which updates the store and immediately broadcasts `STATE_UPDATE` to all connected agents
- On agent connect, the full current state is pushed as `{ type: 'STATE_UPDATE', key: '__full__', value: { switch: true/false, ... } }`
- On individual change, agents receive `{ type: 'STATE_UPDATE', key: 'switch', value: true/false }`

**Agent receives:**
```json
{ "type": "STATE_UPDATE", "key": "switch", "value": true }
```
On connect, receives full state snapshot:
```json
{ "type": "STATE_UPDATE", "key": "__full__", "value": { "switch": true } }
```

---

---

### Prisma + PostgreSQL
**Files:**
- `prisma/schema.prisma` — `TestServer` model
- `prisma.config.ts` — datasource URL for migrations
- `src/lib/server/db.ts` — Prisma client singleton (globalThis HMR-safe, PrismaPg adapter)

**Setup:**
```bash
# After setting DATABASE_URL in .env:
bunx prisma migrate dev --name init
bunx prisma generate
```

**Version:** Prisma v7 — uses `prisma-client` generator, `@prisma/adapter-pg` for direct DB connections. Client imports from `$lib/generated/prisma/client.js`.

---

### Agent Registration
**File:** `src/routes/api/agent/register/+server.ts`

**What it does:**
- `POST /api/agent/register` — agent sends `{ name, token }`, server bcrypt-hashes (cost 10) the token and upserts a `TestServer` record
- Returns `{ ok: true, id, name }` — agent stores `id` as its `serverId` for WS connections
- Re-registration with the same `name` rotates the token hash

**Token validation updated** (`src/lib/agent-ws.ts`):
- `validateToken` is now `async`
- Looks up DB record by `serverId` (= DB `id`) and bcrypt-compares
- Falls back to `AGENT_TOKEN` env var if no DB record; if unset, allows all (dev)

---

### Home Page — Agents List
**Files:**
- `src/routes/+page.server.ts` — async load; queries DB agents, merges online status from WS registry
- `src/routes/+page.svelte` — shows "Test Servers" list below the switch

**What it does:**
- Each registered agent shows as a clickable card with name + online/offline badge + coloured dot
- Click navigates to `/test-runs/<id>` (terminal stream for that agent)
- Online status: green = agent currently connected via WS, grey = offline

---

### Tango-RPC Layer
**Files:**
- `src/lib/server/tango-api.ts` — procedure definitions
- `src/lib/tango.ts` — typed client instance
- `src/hooks.server.ts` — routes `/api/tango/*` to the handler

**What it does:**
- Replaces the ad-hoc REST routes for switch control and agent management with a type-safe RPC layer
- `agents.list` — queries DB agents merged with live WS connection status
- `agents.dispatch` — sends a command to one agent (by `serverId`) or broadcasts to all
- `agents.register` — bcrypt-hashes a token and upserts a `TestServer` record
- `agents.runScript` — sends `RUN_SCRIPT` to an agent with a generated `runId`; returns `{ runId }` for SSE subscription
- `agents.getScripts` — returns the `scripts` list last received from a connected agent via the `SCRIPTS` WS frame
- `switch.set` — updates in-memory state and broadcasts `STATE_UPDATE` to all agents
- Client is typed via `Definition` export — no code generation required

**Note:** Raw WS, long-poll, and SSE routes remain unchanged as they cannot be expressed as tango procedures.

---

### @atom-forge/ui Adoption
**Components in use:** `Switch`, `Badge`, `AtomForge` wrapper

**Where:**
- `src/routes/+layout.svelte` — `<AtomForge dark>` wraps all pages
- `src/routes/+page.svelte` — `<Switch bind:value={on}>` + `<Badge color={...}>`

**Key API notes:**
- `Badge` uses `color` prop (`'accent' | 'red' | 'green' | 'blue'`), not `variant`
- `Switch` uses `bind:value`; no `onchange` — use `$effect` to react
- `AtomForge` requires runes mode — must not be excluded from Svelte runes transform

See `docs/atom-forge-ui.md` for full reference.

---

## What's Next (Phase 2)

1. **Device API** (`/api/devices`)
   - `GET` — list devices
   - `POST` — register (called by udev watcher)
   - `PATCH /:id` — update usbPath, status, alias

3. **Build API** (`/api/builds`)
   - `POST` — register build artifact from GitHub runner

4. **TestRun API + workflow engine**
   - `POST /api/test-runs` — dispatch
   - Workflow step executor (POWER_ON → FLASH → RUN_VALIDATION → POWER_OFF → REPORT)

---

## Dependencies Installed

| Package | Version | Purpose |
|---------|---------|---------|
| `ws` | 8.19.0 | WebSocket server (dev + production) |
| `@types/ws` | 8.18.1 | TypeScript types for ws |
| `@atom-forge/tango-rpc` | — | Type-safe HTTP RPC (server + client) |
| `@atom-forge/ui` | — | UI component library (Switch, Badge, Button, AtomForge) |
| `bcryptjs` | — | Token hashing for agent registration |
| `@prisma/adapter-pg` | — | Prisma direct-connection adapter for PostgreSQL |

---

## Running

```bash
# Development
bun run dev

# Production
bun run build
bun server.ts
```

Agent connects with:
```
ws://localhost:5173/api/agent/ws?serverId=test-server-01&token=<AGENT_TOKEN>
```
