# Environment Configuration

All environment variables are loaded from `.env` at startup via `dotenv/config`. Required variables throw at startup if missing; optional variables have defaults.

## Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/dbname` |

## Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_TOKEN` | `null` | Plain-text fallback token for WebSocket auth. If unset and the DB record is unreachable, the connection is rejected. |
| `API_KEY` | `null` | API key for programmatic Tango RPC access via `X-Api-Key` header. If unset, only session-cookie auth works. |
| `LOG_DIR` | `./logs/runs` | Directory where script run logs are written as `{runId}.log` files. Created automatically. |
| `INITIAL_ADMIN_PASSWORD` | `null` | If set and no users exist in the DB, creates an `admin` user with this password on startup. Useful for first-time setup. |
| `PORT` | `3000` | HTTP/WS listen port in production (`bun server.ts`). |

## Example `.env`

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/sol-server

# Security
API_KEY=a-strong-random-api-key
AGENT_TOKEN=agent-shared-secret

# Auth
INITIAL_ADMIN_PASSWORD=change-me-on-first-login

# Logging
LOG_DIR=./logs/runs
```

## Notes

- `SESSION_SECRET` is no longer required — sessions use cryptographically random UUIDs (128-bit entropy) and are stored in-memory. Sessions are invalidated on server restart.
- `INITIAL_ADMIN_PASSWORD` is only used once (when the users table is empty). After the first admin user is created, this variable has no effect and can be removed from the environment.
- `AGENT_TOKEN` is the fallback for agents that registered before the database had their record, or when the database is temporarily unreachable. It must be a plain-text value that the agent sends as the `token` query parameter.
