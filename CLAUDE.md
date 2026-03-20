# CI-LIMS UI — Claude Code Reference

## What this project is
CI-LIMS (Continuous Integration Lab Information Management System) is a SvelteKit web app that:
- Manages test server agents connected via WebSocket
- Streams real-time test run logs to the browser via SSE and saves them to disk
- Provides web-based authentication and user management
- Stores agent registrations and users in PostgreSQL via Prisma

## Key commands
```bash
bun run dev              # dev server (Vite + custom WS upgrade)
bun run build            # production build
bun server.ts            # production server
bun run check            # svelte-check type checking
bunx prisma migrate dev --name <name>   # create + apply migration
bunx prisma generate     # regenerate client after schema changes
```

## Architecture
- **Runtime:** SvelteKit + Bun (not Node)
- **Database:** PostgreSQL, accessed via Prisma v7 with `@prisma/adapter-pg` (direct connection, no query engine binary)
- **Tango-RPC:** `@atom-forge/tango-rpc` — type-safe RPC over HTTP, routed through `hooks.server.ts`
- **UI library:** `@atom-forge/ui` — Switch, Badge, Button, AtomForge wrapper
- **WS:** `ws` package — agent protocol runs on the same port as the HTTP server; Vite intercepts upgrades in dev, `server.ts` handles in prod
- **SSE:** Raw `ReadableStream` responses for real-time log streaming

## Critical file map

| File | Purpose |
|------|---------|
| `src/hooks.server.ts` | Auth guard, API key check, routes `/api/tango/*` to tango handler |
| `src/lib/server/tango-api.ts` | All tango procedures (`agents.*`, `environments.*`, `users.*`) |
| `src/lib/tango.ts` | Client-side tango API instance, typed via `Definition` |
| `src/lib/server/services/db.ts` | Prisma client singleton (HMR-safe, loads `.env` via `dotenv/config`) |
| `src/lib/server/services/session.ts` | In-memory session store |
| `src/lib/server/services/agentWs.ts` | WS registry, protocol types, heartbeat, `logBus`, log file writing |
| `src/lib/server/modules/users.ts` | User CRUD (bcrypt hashing) |
| `src/routes/login/` | Login page + server action |
| `src/routes/logout/+server.ts` | Logout POST handler |
| `src/routes/api/agent/ws/+server.ts` | HTTP side of WS upgrade (passes to `createAgentWss()`) |
| `src/routes/api/agent/poll/+server.ts` | Long-poll fallback for agents |
| `src/routes/api/test-runs/[id]/logs/+server.ts` | SSE log streaming endpoint |
| `src/routes/+page.svelte` | Home page — agents list + users management (admin) |
| `src/routes/+layout.svelte` | Wraps everything in `<AtomForge dark>`, imports `layout.css` |
| `prisma/schema.prisma` | DB schema (`TestServer`, `Environment`, `User`, `Role`) |

## How to add a new tango procedure

**1. Add to `src/lib/server/tango-api.ts`:**
```ts
myNs: {
  myQuery: tango.query(async (_args: undefined) => {
    return { data: 'value' };
  }),
  myCommand: tango.command(async (args: { foo: string }) => {
    // do something
    return { ok: true };
  }),
},
```
Use plain TypeScript types, not Zod.

**2. Client usage (in `.svelte` files or `$lib/tango.ts` consumers):**
```ts
import { api } from '$lib/tango.js';
const result = await api.myNs.myQuery.$query(undefined);
await api.myNs.myCommand.$command({ foo: 'bar' });
```

No other wiring needed — `hooks.server.ts` and `createHandler` do the routing automatically.

## WS protocol (agent ↔ app)

App → Agent:
```ts
{ type: 'COMMAND';    deviceId: string; action: 'POWER_ON' | 'POWER_OFF' }
{ type: 'DISPATCH';   testRunId: string }
{ type: 'RUN_SCRIPT'; scriptName: string; runId: string }
```

Agent → App:
```ts
{ type: 'PING' }
{ type: 'ACK';     deviceId: string; status: 'ON' | 'OFF'; ts: string }
{ type: 'STATUS';  testRunId: string; event: string }
{ type: 'LOG';     testRunId: string; line: string; ts: string }
{ type: 'SCRIPTS'; scripts: string[] }
```

Token is always required on WS connect. No allow-all dev mode.

## Routes that CANNOT be tango routes
These use raw streaming protocols and must stay as SvelteKit `+server.ts` routes:
- `GET /api/agent/ws` — WebSocket upgrade
- `GET /api/agent/poll` — long-poll (streaming)
- `GET /api/test-runs/[id]/logs` — SSE log stream

## @atom-forge/ui gotchas

- **AtomForge wrapper** — must be in runes mode. `svelte.config.js` must NOT exclude `@atom-forge` from the runes transform. Usage: `<AtomForge dark>{@render children()}</AtomForge>`
- **Badge** — use `color` prop, not `variant`. Values: `'accent' | 'red' | 'green' | 'blue'` (omit for default/grey)
- **Button** — boolean variant props: `ghost`, `secondary`, `destructive`. Boolean size props: `small`, `compact`, `micro`
- **Switch** — use `bind:value`. No `onchange` prop — react to changes with `$effect`

```svelte
<Switch bind:value={on} />
$effect(() => { /* runs when `on` changes */ });
```

## Prisma notes
- Client imports from `$generated/prisma/client.js` (not the standard `@prisma/client`)
- `db.ts` calls `import 'dotenv/config'` at module top — `DATABASE_URL` must be in `.env`
- Prisma v7 uses `prisma-client` generator (not `client`) and `@prisma/adapter-pg`
- `prisma.config.ts` sets the datasource URL for the migration CLI

## Design tokens (Tailwind CSS custom properties)
`bg-base`, `bg-raised`, `border-canvas`, `text-control-c`, `text-muted-c`, `bg-accent`

## Required env vars
```
DATABASE_URL=postgresql://user:pass@host:5432/dbname
AGENT_TOKEN=<fallback WS token; if unset and no DB record, connections are rejected>
API_KEY=<optional; required for programmatic Tango RPC via X-Api-Key header>
INITIAL_ADMIN_PASSWORD=<optional; creates admin user on first startup if no users exist>
LOG_DIR=./logs/runs  # default; directory for run log files
```
