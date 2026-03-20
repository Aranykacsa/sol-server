# sol-server Architecture

## System Diagram

```
GitHub ──push──▶ Self-Hosted Runner (App Host)
                      │ pio run → .bin artifact
                      │ POST /api/builds
                      ▼
              sol-server App (SvelteKit + adapter-node)   ◀── Browser dashboard
              PostgreSQL (Prisma)
                      │
                      │ WebSocket push (typed JSON commands)
                      ▼
              Test Server Agent (Bun process)
                      │
                      │ Modbus / digital I/O
                      ▼
                    PLC
                      │ power on/off
                      ▼
              ESP32 devices (USB for flash + UART only)
```

---

## Project Structure (actual)

```
ilona-ui/                            # SvelteKit app (single package)
├── src/
│   ├── lib/
│   │   └── agent-ws.ts             # WebSocket registry, typed messages, heartbeat
│   └── routes/
│       ├── +layout.svelte
│       ├── +page.svelte
│       └── api/
│           └── agent/
│               ├── +server.ts      # GET list agents | POST dispatch command
│               ├── ws/
│               │   └── +server.ts  # GET registry (WS upgrade handled at HTTP level)
│               └── poll/
│                   └── +server.ts  # Long-poll fallback (30s hold)
├── server.ts                        # Production HTTP server + WS upgrade handler
├── vite.config.ts                   # Dev-mode WS plugin
└── docs/
```

---

## Database Schema (Prisma) — planned

### Device
```prisma
model Device {
  id            String       @id @default(cuid())
  alias         String       @unique          // "Field-Sensor-Prototype-04"
  chipId        String       @unique          // eFuse MAC from esptool chip_id
  usbPath       String                        // /dev/serial/by-id/... (auto-updated)
  testRole      String
  plcChannel    Int                           // which PLC output controls this device
  status        DeviceStatus @default(IDLE)
  environmentId String?
  environment   Environment? @relation(fields: [environmentId], references: [id])
  testRuns      TestRun[]
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
}

enum DeviceStatus { IDLE BUSY OFFLINE ERROR }
```

### Environment
```prisma
model Environment {
  id        String     @id @default(cuid())
  name      String     @unique
  devices   Device[]
  workflows Workflow[]
  createdAt DateTime   @default(now())
}
```

### Workflow
```prisma
model Workflow {
  id            String          @id @default(cuid())
  name          String
  environmentId String
  environment   Environment     @relation(fields: [environmentId], references: [id])
  steps         Json            // ordered WorkflowStep array (see Implementation doc)
  trigger       WorkflowTrigger @default(MANUAL)
  schedule      String?         // cron expression
  testRuns      TestRun[]
}

enum WorkflowTrigger { MANUAL GITHUB_PUSH SCHEDULE }
```

### Build
```prisma
model Build {
  id          String    @id @default(cuid())
  commitHash  String
  branch      String
  artifactDir String    // /opt/lims/artifacts/[commitHash]
  checksum    String    // SHA-256
  testRuns    TestRun[]
  createdAt   DateTime  @default(now())
}
```

### TestRun
```prisma
model TestRun {
  id         String        @id @default(cuid())
  deviceId   String
  device     Device        @relation(fields: [deviceId], references: [id])
  buildId    String
  build      Build         @relation(fields: [buildId], references: [id])
  workflowId String?
  workflow   Workflow?     @relation(fields: [workflowId], references: [id])
  status     TestRunStatus @default(PENDING)
  logs       String?       // streamed UART output
  result     Json?         // structured pass/fail metrics
  createdAt  DateTime      @default(now())
  finishedAt DateTime?
}

enum TestRunStatus { PENDING RUNNING PASSED FAILED ERROR }
```

### TestServer
```prisma
model TestServer {
  id        String    @id @default(cuid())
  name      String    @unique
  token     String              // bcrypt hash of agent token (no @unique — bcrypt is non-deterministic)
  lastSeen  DateTime?
  online    Boolean   @default(false)
  createdAt DateTime  @default(now())
}
```

---

## Agent WebSocket Protocol (implemented)

### Endpoint
```
ws://[APP_HOST]/api/agent/ws?serverId=<id>&token=<secret>
```

### App → Agent messages
```ts
{ type: "COMMAND";    deviceId: string; action: "POWER_ON" | "POWER_OFF" }
{ type: "DISPATCH";   testRunId: string }
{ type: "RUN_SCRIPT"; scriptName: string; runId: string }
```

### Agent → App messages
```ts
{ type: "ACK";    deviceId: string; status: "ON" | "OFF"; ts: string }
{ type: "PING" }
{ type: "STATUS"; testRunId: string; event: string }
{ type: "LOG";    testRunId: string; line: string; ts: string }
```

### Heartbeat
- Agent sends `PING` every 30 seconds
- Server checks every 15 seconds; marks agent `OFFLINE` if no `PING` in 90 seconds

### Token auth
- Agent passes `token` as query param on connect — **always required**
- Token is validated via bcrypt lookup in the `TestServer` DB record
- Falls back to `AGENT_TOKEN` env var if the DB record is not found
- If no token and no DB record, the connection is **rejected** (no allow-all mode)

### Long-poll fallback
```
GET /api/agent/poll?serverId=<id>
```
Holds the connection up to 30 seconds. Returns `{ commands: [AppToAgentMessage] }` when a command is ready, or `{ commands: [] }` on timeout. Agent should immediately re-poll after receiving a response.

---

## REST API Contracts (implemented)

### Agent
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/agent` | List connected agents with online status |
| `POST` | `/api/agent` | Send command to one agent (`serverId` in body) or broadcast |
| `GET`  | `/api/agent/ws` | Same as above (HTTP fallback for the WS endpoint) |
| `GET`  | `/api/agent/poll` | Long-poll fallback |

### Agent Registration
All agent management is via Tango RPC (`POST /api/tango`). See `agent-api.md` for full procedure reference.

### Planned
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/builds` | Register new build artifact (called by GitHub runner) |
| `GET`  | `/api/devices` | List all devices |
| `POST` | `/api/devices` | Register new device |
| `PATCH`| `/api/devices/:id` | Update device (usbPath, status, alias) |
| `POST` | `/api/test-runs` | Dispatch a test run |
| `GET`  | `/api/test-runs/:id/logs` | SSE stream of live UART logs |

---

## Hardware Identification (3-tier)
1. `/dev/serial/by-id/usb-...` — stable USB symlink (kernel, persists across reboots)
2. Chip ID via `esptool.py chip_id` — silicon identity (eFuse, never changes)
3. Inventory Alias in DB — human-readable, assigned during provisioning

---

## Security
- `lims-service` system user — groups: `dialout`, `gpio`
- `AGENT_TOKEN` env var on test server — compared against DB-stored hash (env-only for now)
- All esptool/pio arguments strictly validated before shell exec
- SHA-256 checksum verification before every flash
- PLC command whitelist: only `POWER_ON`/`POWER_OFF` for registered device IDs
