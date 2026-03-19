# sol-server: Strategic Technical Implementation Plan

## 0. Prerequisites

Before setting up sol-server, ensure the host machine has the following installed and configured:

- **OS:** Ubuntu Server 22.04+ LTS
- **Runtime:** Bun (latest stable) — install via `curl -fsSL https://bun.sh/install | bash`
- **Python:** 3.10+ with PlatformIO Core CLI and esptool:
  ```bash
  pip install platformio esptool
  ```
- **Database:** PostgreSQL 15+
- **CI/CD:** Git + a self-hosted GitHub Actions runner registered to your repository
- **Permissions:** The `lims-service` user must belong to the `dialout` and `gpio` groups:
  ```bash
  sudo usermod -aG dialout,gpio lims-service
  ```

---

## 1. Vision & Core Objectives

sol-server is a professional-grade hardware-orchestration platform designed to manage a cluster of ESP32 devices on an Ubuntu server. It serves as the bridge between **GitHub-driven software builds** and **physical hardware validation**, ensuring that firmware is tested on real silicon before release.

### Why is this necessary? (The "Simulation Gap")
The primary motivation for sol-server is to eliminate the risk of bugs that only manifest on physical hardware. While traditional CI/CD can verify that code *compiles*, it cannot detect:
- **Memory leaks** or heap fragmentation over long-duration runs.
- **Timing issues** or race conditions in peripheral drivers (I2C, SPI, UART).
- **Power consumption anomalies** during specific wireless operations.
- **Hardware-Software interaction failures** that a simulator cannot replicate.

sol-server provides a **Hardware-in-the-Loop (HIL)** environment that democratizes access to test jigs, allowing developers to validate their code on the exact silicon target without needing physical hardware on their desks.

---

## 2. Infrastructure Architecture

### Hardware Layer
- **Host:** Ubuntu Server (22.04+ LTS) — runs the sol-server app and database.
- **Test Server:** A separate machine physically co-located with the hardware under test. Runs only the lightweight Test Server Agent (see Section 4).
- **Physical Nodes:** ESP32/S3/C3/H2 modules powered and reset via a **PLC** (Programmable Logic Controller). USB is used only for flashing and UART communication.
- **Power Management:** The PLC acts as the authoritative power source for all connected devices. It receives on/off commands from the Test Server Agent, enabling clean cold-boot resets and controlled power sequencing for any current or future equipment.

### Software Stack
- **Runtime:** **Bun** (latest stable). Native TypeScript support, high-performance built-in drivers.
- **Framework:** SvelteKit 2 with adapter-node (full-stack SSR + API routes).
- **Styling:** TailwindCSS (responsive, high-density dashboard).
- **ORM:** Prisma (PostgreSQL).
- **Build Engine:** PlatformIO Core CLI.
- **CI/CD:** Self-hosted GitHub Actions runner.

---

## 3. App Environments & Workflow Configuration

The sol-server app supports multiple **Environments**, each representing an isolated test context (e.g., `production-hardware`, `dev-bench`, `stress-rig`). Within each environment you can configure:

- **Device Pool:** Which physical devices (by Inventory Alias) belong to this environment.
- **Workflows:** Ordered sequences of steps — power on, flash firmware, run test suite, power off, report. Workflows are defined per-environment and can be triggered manually or automatically on a GitHub push to a specific branch.
- **Schedules:** Cron-style scheduling for overnight/long-duration soak tests.
- **Notification Rules:** Per-environment Slack/GitHub PR reporting targets.

### Environment State Model
Each environment exposes a **desired state** object that the Test Server Agent reads:

```json
{
  "environment": "production-hardware",
  "commands": [
    { "deviceId": "Field-Sensor-Prototype-04", "action": "POWER_ON" },
    { "deviceId": "Field-Sensor-Prototype-07", "action": "POWER_OFF" }
  ],
  "pendingWorkflow": "full-hil-suite"
}
```

---

## 4. Test Server Agent & PLC Bridge

The Test Server Agent is a **minimal Bun process** running on the test server. It has one job: act as the bridge between the sol-server app and the PLC.

### Communication: WebSocket

The test server **initiates** the connection to the app (outbound only), so it works behind NAT/firewalls identically to polling.

| | Polling (5s) | WebSocket |
|---|---|---|
| Latency | 0–5s | ~0ms |
| Overhead | Repeated HTTP requests | One persistent connection |
| Firewall-friendly | Yes (outbound) | Yes (outbound) |
| Complexity | Very low | Low |

### Agent Behaviour

```
┌─────────────┐   WebSocket (outbound)   ┌──────────────┐
│ Test Server │ ────────────────────────▶ │  sol-server App │
│   Agent     │ ◀──── commands (JSON) ──── │  (SvelteKit) │
└──────┬──────┘                           └──────────────┘
       │ Modbus/digital I/O
       ▼
    ┌─────┐
    │ PLC │  ── controls power to ESP32s & future equipment
    └─────┘
```

1. **Connect:** Agent opens `ws://[APP_HOST]/api/agent/ws?serverId=[ID]&token=[SECRET]` on startup. Reconnects with exponential backoff on disconnect.
2. **Receive:** App pushes `COMMAND` (power on/off) or `DISPATCH` (run test) payloads.
3. **Execute:** Agent translates the command into a PLC signal (Modbus register write, GPIO toggle, etc.).
4. **Acknowledge:** Agent sends `ACK` back over the same WebSocket.
5. **Heartbeat:** Agent sends `PING` every 30 seconds so the app can detect offline test servers.

### Agent Fallback
If WebSocket is unavailable, the agent can fall back to **long polling** (`GET /api/agent/poll?serverId=...`), which holds the HTTP connection open for up to 30 seconds and responds when a command is ready.

---

## 5. Precision Hardware Identification

To avoid the volatility of `/dev/ttyUSB*` paths, sol-server employs a three-tier identification strategy:

1. **Physical Path (Kernel):** Uses `/dev/serial/by-id/` symbolic links — persistent across reboots.
2. **Silicon Identity (eFuse):** `esptool.py chip_id` extracts the factory-burned unique MAC/ID of the ESP32 chip itself.
3. **Logical Inventory (Mapping):** The DB maps the **Silicon ID** to a human-readable **Inventory Alias** (e.g., "Field-Sensor-Prototype-04").

If a USB cable or port changes, the LIMS detects the Chip ID, recognizes the device, and automatically updates its physical path in the database.

---

## 6. Detailed Operational Workflow

### Phase 1: Provisioning & Discovery
1. **Detection:** A Bun-based background watcher monitors `udev` events.
2. **Fingerprinting:** On new connection, the system runs `esptool.py` to fetch the Chip ID.
3. **Registration:** The web UI flags "New Device Detected." A technician assigns it a name and a "Test Role."

### Phase 2: The CI Trigger (Build & Stage)
1. **Trigger:** Developer pushes code to GitHub.
2. **Action:** The Self-Hosted Runner pulls the source locally.
3. **Compilation:** Runs `pio run` for all target environments.
4. **Artifact Management:** The runner moves `.bin` files to `/opt/lims/artifacts/[commit_hash]`.
5. **Metadata Sync:** Runner notifies the LIMS API (`POST /api/builds`) with the new build, commit, and checksum.

### Phase 3: Automated HIL Execution
1. **Dispatch:** A TestRun is triggered (automatically or manually).
2. **Resource Locking:** The target Device is marked `BUSY` in the DB.
3. **Power Sequencing:** The app pushes a `POWER_ON` COMMAND to the Test Server Agent via WebSocket. The Agent drives the PLC. The app waits for the ACK before proceeding.
4. **Flash:**
   ```bash
   esptool.py --port /dev/serial/by-id/[HARDWARE_ID] write_flash 0x10000 firmware.bin
   ```
5. **Validation:** Bun spawns `validate.py`, which communicates with the ESP32 via UART. stdout/stderr are streamed in real-time to the SSE endpoint.
6. **Teardown:** App pushes `POWER_OFF`. Device released (`IDLE`). Results persisted to PostgreSQL.

### Phase 4: Feedback Loop
1. **Reporting:** Results are pushed back to the GitHub PR as a comment.
2. **Visualization:** The SvelteKit dashboard displays real-time metrics (success rates, boot times, log history).

---

## 7. Security & Permissions
- **System Access:** The Bun process runs under a dedicated `lims-service` user with `dialout` and `gpio` group memberships.
- **Agent Authentication:** The Test Server Agent authenticates using a pre-shared `AGENT_TOKEN`. The app validates this token before accepting the WebSocket connection. The token is stored hashed in the `TestServer` DB table.
- **PLC Command Whitelist:** The Agent only accepts `POWER_ON` and `POWER_OFF` for registered device IDs. Unknown commands or device IDs are rejected and logged.
- **Sanitization:** All shell commands use strictly validated arguments to prevent injection via manipulated hardware IDs.
- **Artifact Integrity:** SHA-256 checksums are generated at build time and verified before every flash.
