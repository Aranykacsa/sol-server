import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import bcrypt from 'bcryptjs';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import type { Config } from '../config.js';
import type { Services } from './index.js';

// ---------------------------------------------------------------------------
// Types — mirror the protocol defined in the architecture docs
// ---------------------------------------------------------------------------

export type AppToAgentMessage =
	| { type: 'COMMAND'; deviceId: string; action: 'POWER_ON' | 'POWER_OFF' }
	| { type: 'DISPATCH'; testRunId: string }
	| { type: 'STATE_UPDATE'; key: string; value: unknown }
	| { type: 'RUN_SCRIPT'; scriptName: string; runId: string };

export type AgentToAppMessage =
	| { type: 'ACK'; deviceId: string; status: 'ON' | 'OFF'; ts: string }
	| { type: 'PING' }
	| { type: 'STATUS'; testRunId: string; event: string }
	| { type: 'LOG'; testRunId: string; line: string; ts: string }
	| { type: 'SCRIPTS'; scripts: string[] };

export type AgentConnection = {
	serverId: string;
	ws: WebSocket;
	connectedAt: Date;
	lastPing: Date;
	online: boolean;
	scripts: string[];
};

export type AgentWsService = {
	createWss(): WebSocketServer;
	handleUpgrade(wss: WebSocketServer, req: IncomingMessage, socket: Duplex, head: Buffer): void;
	validateToken(serverId: string, token: string): Promise<boolean>;
	sendCommand(serverId: string, command: AppToAgentMessage): boolean;
	broadcastCommand(command: AppToAgentMessage): void;
	getConnections(): AgentConnection[];
	getScripts(serverId: string): string[];
	logBus: EventEmitter;
};

// ---------------------------------------------------------------------------
// Shared singletons via globalThis — survive HMR and dual-module instantiation
// ---------------------------------------------------------------------------

const g = globalThis as Record<string, unknown>;

if (!g.__agentWsRegistry) g.__agentWsRegistry = new Map<string, AgentConnection>();
const registry = g.__agentWsRegistry as Map<string, AgentConnection>;

if (!g.__agentLogBus) {
	const bus = new EventEmitter();
	bus.setMaxListeners(100);
	g.__agentLogBus = bus;
}
const logBus = g.__agentLogBus as EventEmitter;

const HEARTBEAT_TIMEOUT_MS = 90_000;
if (!g.__runLogs) g.__runLogs = new Map<string, Array<{ line: string; ts: string }>>();
const runLogs = g.__runLogs as Map<string, Array<{ line: string; ts: string }>>;

if (!g.__agentHeartbeatStarted) {
	g.__agentHeartbeatStarted = true;
	const interval = setInterval(() => {
		const cutoff = Date.now() - HEARTBEAT_TIMEOUT_MS;
		for (const conn of registry.values()) {
			if (conn.online && conn.lastPing.getTime() < cutoff) {
				conn.online = false;
				console.warn(`[agent-ws] ${conn.serverId} marked OFFLINE (no heartbeat)`);
			}
		}
	}, 15_000);
	if (interval.unref) interval.unref();
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAgentWsService(cfg: Pick<Config, 'agentWs'>, services: Services): AgentWsService {
	function bufferRunLog(runId: string, line: string, ts: string, statusEvent?: string) {
		let buf = runLogs.get(runId);
		if (!buf) { buf = []; runLogs.set(runId, buf); }
		buf.push({ line, ts });
		if (statusEvent && (statusEvent === 'PASSED' || statusEvent.startsWith('FAILED') || statusEvent === 'ERROR')) {
			setTimeout(() => runLogs.delete(runId), 60_000);
		}
	}

	function send(ws: WebSocket, data: unknown) {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(data));
		}
	}

	function handleAgentMessage(conn: AgentConnection, msg: AgentToAppMessage) {
		switch (msg.type) {
			case 'PING':
				conn.lastPing = new Date();
				conn.online = true;
				break;
			case 'ACK':
				console.info(`[agent-ws] ACK from ${conn.serverId}: device ${msg.deviceId} is ${msg.status}`);
				break;
			case 'STATUS': {
				const ts = new Date().toISOString();
				const line = `[status] ${msg.event}`;
				console.info(`[agent-ws] STATUS from ${conn.serverId}: testRun ${msg.testRunId} → ${msg.event}`);
				bufferRunLog(msg.testRunId, line, ts, msg.event);
				logBus.emit(msg.testRunId, line, ts);
				break;
			}
			case 'LOG':
				bufferRunLog(msg.testRunId, msg.line, msg.ts);
				logBus.emit(msg.testRunId, msg.line, msg.ts);
				break;
			case 'SCRIPTS':
				conn.scripts = msg.scripts;
				break;
		}
	}

	return {
		logBus,

		createWss(): WebSocketServer {
			if (g.__agentWss) return g.__agentWss as WebSocketServer;

			const wss = new WebSocketServer({ noServer: true });
			g.__agentWss = wss;

			wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
				const url = new URL(req.url ?? '', 'http://localhost');
				const serverId = url.searchParams.get('serverId') ?? crypto.randomUUID();

				const conn: AgentConnection = {
					serverId,
					ws,
					connectedAt: new Date(),
					lastPing: new Date(),
					online: true,
					scripts: []
				};
				registry.set(serverId, conn);
				console.info(`[agent-ws] ${serverId} connected`);

				// Push current state so agent is in sync on connect (lazy access — state is populated by now)
				send(ws, { type: 'STATE_UPDATE', key: '__full__', value: services.state.getFullState() });

				ws.on('message', (data) => {
					try {
						const msg = JSON.parse(data.toString()) as AgentToAppMessage;
						handleAgentMessage(conn, msg);
					} catch {
						// ignore malformed frames
					}
				});

				ws.on('close', () => {
					conn.online = false;
					registry.delete(serverId);
					console.info(`[agent-ws] ${serverId} disconnected`);
				});
			});

			return wss;
		},

		handleUpgrade(wss: WebSocketServer, req: IncomingMessage, socket: Duplex, head: Buffer) {
			wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
		},

		async validateToken(serverId: string, token: string): Promise<boolean> {
			try {
				const record = await services.db.client.testServer.findUnique({ where: { id: serverId } });
				if (record) return bcrypt.compare(token, record.token);
			} catch {
				// DB not reachable — fall through to token fallback
			}
			const expected = cfg.agentWs.token;
			if (!expected) return true; // dev: no DB record and no token → allow all
			return token === expected;
		},

		sendCommand(serverId: string, command: AppToAgentMessage): boolean {
			const conn = registry.get(serverId);
			if (!conn || conn.ws.readyState !== WebSocket.OPEN) return false;
			conn.ws.send(JSON.stringify(command));
			return true;
		},

		broadcastCommand(command: AppToAgentMessage) {
			const payload = JSON.stringify(command);
			for (const conn of registry.values()) {
				if (conn.ws.readyState === WebSocket.OPEN) {
					conn.ws.send(payload);
				}
			}
		},

		getConnections(): AgentConnection[] {
			return [...registry.values()];
		},

		getScripts(serverId: string): string[] {
			return registry.get(serverId)?.scripts ?? [];
		},
	};
}
