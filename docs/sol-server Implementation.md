# sol-server Implementation Guide

## Build Order
Each phase is independently testable before moving to the next.

| # | Phase | Status |
|---|-------|--------|
| 1 | Agent WebSocket server (`/api/agent/ws`) | ✅ Done |
| 2 | Agent long-poll fallback (`/api/agent/poll`) | ✅ Done |
| 3 | DB + Prisma schema | ⬜ Next |
| 4 | Device API (`/api/devices`) | ⬜ |
| 5 | Build API (`/api/builds`) | ⬜ |
| 6 | Test Run API + workflow engine | ⬜ |
| 7 | udev watcher (USB device detection) | ⬜ |
| 8 | GitHub runner integration | ⬜ |
| 9 | SvelteKit dashboard UI | ⬜ |
| 10 | SSE log streaming (`/api/test-runs/:id/logs`) | ⬜ |
| 11 | GitHub PR reporting | ⬜ |
| 12 | Schedules + notifications | ⬜ |

---

## Project Structure (actual — single SvelteKit app)

```
ilona-ui/
├── src/
│   ├── lib/
│   │   └── agent-ws.ts              # WebSocket registry, message types, heartbeat
│   └── routes/
│       ├── +layout.svelte
│       ├── +page.svelte             # placeholder home
│       ├── layout.css               # Tailwind imports
│       └── api/
│           └── agent/
│               ├── +server.ts       # GET list | POST dispatch
│               ├── ws/
│               │   └── +server.ts   # GET registry (WS handled at HTTP level)
│               └── poll/
│                   └── +server.ts   # long-poll fallback
├── server.ts                         # production HTTP + WS upgrade entry point
├── vite.config.ts                    # dev WS plugin
├── svelte.config.js
├── package.json
└── docs/
```

> Note: The prototype docs describe a monorepo with separate `apps/web` and `apps/agent` packages. The actual layout is a single SvelteKit app. The Test Server Agent lives in its own separate repo/process.

---

## Environment Variables

### App (`.env`)
```
DATABASE_URL=postgresql://lims:password@localhost:5432/lims
AGENT_TOKEN=<pre-shared secret>       # agents must send this token on connect
GITHUB_TOKEN=ghp_...                   # for PR commenting
GITHUB_WEBHOOK_SECRET=...
PORT=3000
```

### Test Server Agent (`.env` on test server)
```
APP_HOST=192.168.x.x:3000
SERVER_ID=test-server-01
AGENT_TOKEN=<same pre-shared secret>
PLC_HOST=192.168.x.x                  # if Modbus TCP
PLC_PORT=502
```

---

## Running

### Dev
```bash
bun run dev
# WS endpoint: ws://localhost:5173/api/agent/ws?serverId=x&token=x
```

### Production
```bash
bun run build
bun server.ts
# WS endpoint: ws://localhost:3000/api/agent/ws?serverId=x&token=x
```

---

## Key Code Patterns

### Send a command to a specific agent
```ts
import { sendCommand } from '$lib/agent-ws.js';

sendCommand('test-server-01', {
  type: 'COMMAND',
  deviceId: 'Field-Sensor-Prototype-04',
  action: 'POWER_ON'
});
```

### Broadcast to all agents
```ts
import { broadcastCommand } from '$lib/agent-ws.js';
broadcastCommand({ type: 'DISPATCH', testRunId: 'abc123' });
```

### Queue a command for a polling agent
```ts
import { enqueueForPoller } from '$lib/agent-ws.js'; // TODO: export this from poll route
enqueueForPoller('test-server-01', { type: 'COMMAND', deviceId: '...', action: 'POWER_OFF' });
```

### Test Server Agent — connect with exponential backoff (Bun)
```ts
const APP_HOST = Bun.env.APP_HOST;
const SERVER_ID = Bun.env.SERVER_ID;
const AGENT_TOKEN = Bun.env.AGENT_TOKEN;
let delay = 1_000;

function connect() {
  const ws = new WebSocket(
    `ws://${APP_HOST}/api/agent/ws?serverId=${SERVER_ID}&token=${AGENT_TOKEN}`
  );
  ws.onopen = () => { delay = 1_000; };
  ws.onmessage = (e) => handleCommand(JSON.parse(e.data), ws);
  ws.onclose = () => setTimeout(connect, delay = Math.min(delay * 2, 30_000));
  setInterval(() => ws.send(JSON.stringify({ type: 'PING' })), 30_000);
}
connect();
```

### Flash firmware
```ts
// Always verify checksum before flashing
const actual = (await $`sha256sum ${artifactPath}/firmware.bin`.text()).split(' ')[0];
if (actual !== build.checksum) throw new Error('Checksum mismatch');
await $`esptool.py --port ${usbPath} write_flash 0x10000 ${artifactPath}/firmware.bin`;
```

### udev Watcher
```ts
const proc = Bun.spawn(['udevadm', 'monitor', '--udev', '--subsystem-match=tty']);
for await (const line of proc.stdout) {
  if (line.includes('add') && line.includes('ttyUSB')) {
    await fingerprint(extractPath(line));
  }
}

async function fingerprint(usbPath: string) {
  const out = await $`esptool.py --port ${usbPath} chip_id`.text();
  const chipId = parseChipId(out);
  await registerOrUpdateDevice(chipId, usbPath);
}
```

### SSE log stream
```ts
// routes/api/test-runs/[id]/logs/+server.ts
export async function GET({ params }) {
  const stream = new ReadableStream({
    start(controller) {
      logBus.on(params.id, (line) => {
        controller.enqueue(`data: ${JSON.stringify({ line })}\n\n`);
      });
    }
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  });
}
```

---

## Workflow Step Definition (stored as JSON in `Workflow.steps`)
```json
[
  { "type": "POWER_ON",       "deviceId": "Field-Sensor-Prototype-04" },
  { "type": "WAIT",           "ms": 2000 },
  { "type": "FLASH",          "deviceId": "Field-Sensor-Prototype-04", "buildId": "latest" },
  { "type": "RUN_VALIDATION", "deviceId": "Field-Sensor-Prototype-04", "script": "validate.py" },
  { "type": "POWER_OFF",      "deviceId": "Field-Sensor-Prototype-04" },
  { "type": "REPORT",         "target": "github-pr" }
]
```

---

## PLC Bridge Interface
PLC model is TBD — implement as a swappable module from day one:

```ts
export interface PLCBridge {
  powerOn(channel: number): Promise<void>;
  powerOff(channel: number): Promise<void>;
}
// Implement: ModbusRTUBridge | ModbusTCPBridge | DigitalIOBridge
```

---

## systemd Service (Test Server Agent)
```ini
[Unit]
Description=sol-server Test Server Agent
After=network.target

[Service]
User=lims-service
WorkingDirectory=/opt/lims/agent
EnvironmentFile=/opt/lims/agent/.env
ExecStart=/home/lims-service/.bun/bin/bun run src/index.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

---

## Gotchas
- `esptool.py` and `pio run` are Python-based — call them directly, never via `bunx`.
- USB paths in `/dev/serial/by-id/` survive reboots but not cable changes — Chip ID is the true device identity.
- esptool requires bootloader mode — consider wiring GPIO0 control from the test server for reliable entry.
- PLC protocol is unknown at time of writing — design the bridge as a swappable interface from day one.
- The long-poll fallback (`/api/agent/poll`) is in-process only. For multiple app instances, replace the waiter map with Redis pub/sub.
- Token validation in `agent-ws.ts` currently compares against `AGENT_TOKEN` env var directly. Once Prisma is set up, replace with a hashed DB lookup against the `TestServer` table.
