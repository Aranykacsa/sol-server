# sol-server

A SvelteKit web dashboard for managing test server agents, running scripts, and streaming real-time test output. Agents connect via WebSocket; the browser connects via SSE for live log streaming.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.x
- PostgreSQL ≥ 14

## Setup

```bash
# Install dependencies
bun install

# Configure environment (see Environment Variables below)
# Create .env with at minimum DATABASE_URL and INITIAL_ADMIN_PASSWORD

# Run database migrations
bunx prisma migrate dev

# Start development server
bun run dev
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/dbname` |
| `API_KEY` | No | — | API key for programmatic Tango RPC access via `X-Api-Key` header |
| `AGENT_TOKEN` | No | — | Fallback token for agent WebSocket auth. If unset and no DB record matches, connections are rejected. |
| `INITIAL_ADMIN_PASSWORD` | No | — | Creates an `admin` user on first startup if no users exist in the database |
| `LOG_DIR` | No | `./logs/runs` | Directory where script run logs are saved as `{runId}.log` |
| `PORT` | No | `3000` | HTTP listen port (production only) |

## First Login

1. Set `INITIAL_ADMIN_PASSWORD=your-password` in `.env`
2. Start the server — it creates an `admin` user automatically
3. Open `http://localhost:5173` (dev) or `http://localhost:3000` (prod)
4. Sign in as `admin` with the password you set
5. Remove `INITIAL_ADMIN_PASSWORD` from `.env` after logging in

## User Management

Admins can create, delete, and change passwords for users via the dashboard "Users" section. Roles:

- **ADMIN** — full access including user management
- **VIEWER** — read-only access to the dashboard

## API Key

For programmatic access to Tango RPC (e.g. from CI systems):

```bash
curl -X POST http://localhost:3000/api/tango \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: your-api-key" \
  -d '{"proc": "agents.list", "args": null}'
```

The `agents.register` procedure does **not** require an API key — agents call it during first-time setup.

## Agent Registration

Agents (venus-agent) register via their Settings page. The registration POST is:

```http
POST /api/tango
Content-Type: application/json

{"proc": "agents.register", "args": {"name": "rack-01", "token": "secret"}}
```

The returned `id` is the agent's `serverId` for subsequent WebSocket connections.

## Log Files

Script output is archived at `{LOG_DIR}/{runId}.log` (default `./logs/runs/`):

```
[2026-03-16T12:00:00Z] [STATUS] STARTED
[2026-03-16T12:00:01Z] PASS src/foo.test.ts
[2026-03-16T12:00:02Z] [STATUS] PASSED
```

## Production

```bash
bun run build
bun server.ts
```

The production server listens on `PORT` (default `3000`) and handles both HTTP and WebSocket connections.

## Docs

See `docs/` for detailed references:

- `agent-api.md` — WebSocket protocol, Tango RPC, authentication
- `Environment Configuration.md` — all environment variables
- `sol-server Architecture.md` — module/service pattern
- `atom-forge-ui.md` — UI component reference
- `tango-rpc.md` — Tango RPC protocol details
