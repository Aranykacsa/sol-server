# sol-server Current State

> This document tracks what is actually implemented. Updated as the codebase changes.

---

## What's Built

### Authentication & User Management

**Files:**
- `src/lib/server/services/session.ts` — in-memory session store (HMR-safe via globalThis)
- `src/lib/server/modules/users.ts` — user CRUD with bcrypt hashing
- `src/routes/login/+page.svelte` + `+page.server.ts` — login form + action
- `src/routes/logout/+server.ts` — POST logout handler
- `src/hooks.server.ts` — session guard + API key auth for Tango RPC

**What it does:**
- All web routes (except `/login`, `/logout`) require a valid session cookie (`__session`)
- Sessions are created at login; stored in-memory; invalidated on logout or server restart
- The `/api/tango` endpoint accepts either a valid session cookie OR an `X-Api-Key: {API_KEY}` header
- `agents.register` is exempt from auth (agents call it during first-time setup)
- Admin users can create/delete/change passwords for other users via the dashboard

**User model:**
```
User { id, username, passwordHash, role: ADMIN|VIEWER, createdAt }
```

**First admin:** Set `INITIAL_ADMIN_PASSWORD` env var. On startup, if the users table is empty, an `admin` user is created with that password.

---

### Agent WebSocket Server

**Files:**
- `src/lib/server/services/agentWs.ts` — core module
- `src/routes/api/agent/ws/+server.ts` — WebSocket endpoint (HTTP side)
- `src/routes/api/agent/poll/+server.ts` — long-poll fallback
- `vite.config.ts` — dev-mode WebSocket upgrade interception
- `server.ts` — production HTTP server with WebSocket upgrade handler

**What it does:**
- Accepts WebSocket connections at `ws://[host]/api/agent/ws?serverId=<id>&token=<token>`
- **Token is always required** — no allow-all dev mode
- Authenticates via bcrypt DB lookup, falls back to `AGENT_TOKEN` env var
- Maintains an in-memory registry keyed by `serverId`
- Tracks heartbeat (PING every 30s; OFFLINE after 90s with no ping)
- Sends typed `COMMAND`, `DISPATCH`, and `RUN_SCRIPT` messages to agents
- Receives `ACK`, `PING`, `STATUS`, `LOG`, `SCRIPTS` messages from agents

---

### Text-Based Log Persistence

**Files:**
- `src/lib/server/services/agentWs.ts` — `writeLogLine()` helper
- `src/lib/server/config.ts` — `logDir` config field

**What it does:**
- Every `LOG` frame received from an agent is appended to `{LOG_DIR}/{runId}.log`
- Every `STATUS` frame is written as `[timestamp] [STATUS] event`
- Format: `[<ISO-8601>] <line content>`
- Log directory is created automatically on first write
- In-memory SSE buffers remain unchanged — log files are for archival

---

### Terminal Log Streaming

**Files:**
- `src/lib/server/services/agentWs.ts` — `logBus` (EventEmitter), per-runId log buffer
- `src/routes/api/test-runs/[id]/logs/+server.ts` — SSE endpoint

**What it does:**
- Agent `LOG`/`STATUS` frames → `logBus` → SSE subscribers
- Buffered per `runId`; late SSE subscribers receive all buffered lines immediately
- Buffers cleaned up 60 s after run completes
- Keep-alive comments every 15 s

---

### Terminal Streaming UI

**File:** `src/routes/test-runs/[id]/+page.svelte`

Scripts sidebar, run button, SSE log viewer with timestamps, auto-scroll, line count.

---

### Prisma + PostgreSQL

**Files:**
- `prisma/schema.prisma` — `TestServer`, `Environment`, `User`, `Role` enum
- `src/lib/server/services/db.ts` — Prisma client singleton

**Migrations:**
- `20260313101840_init` — TestServer table
- `20260317092012_add_environments` — Environment table
- `20260320105421_add_user_model` — User table + Role enum

---

### Tango-RPC Layer

**Files:**
- `src/lib/server/tango-api.ts` — procedure definitions
- `src/lib/tango.ts` — typed client instance
- `src/hooks.server.ts` — routes `/api/tango/*` with auth gate

**Procedures:**
- `agents.list`, `agents.dispatch`, `agents.register`, `agents.runScript`, `agents.getScripts`
- `environments.list`, `environments.create`, `environments.delete`
- `users.list`, `users.create`, `users.delete`, `users.changePassword`

---

## What's Next (Phase 2)

1. **Device API** — CRUD for ESP32/USB devices
2. **Build API** — register firmware artifacts from GitHub runners
3. **TestRun API + workflow engine** — POWER_ON → FLASH → RUN → POWER_OFF → REPORT
4. **Persistent sessions** — replace in-memory Map with Redis or DB-backed sessions
5. **Log viewer** — UI to browse archived log files

---

## Dependencies Installed

| Package | Purpose |
|---------|---------|
| `ws` | WebSocket server (dev + production) |
| `@atom-forge/tango-rpc` | Type-safe HTTP RPC |
| `@atom-forge/ui` | UI components (Badge, Button, AtomForge) |
| `bcryptjs` | Token + password hashing |
| `@prisma/adapter-pg` | Prisma PostgreSQL adapter |

---

## Running

```bash
# Development
bun run dev

# Production
bun run build
bun server.ts
```
