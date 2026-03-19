import bcrypt from 'bcryptjs';
import type { Services } from '../services/index.js';
import type { Modules } from './index.js';
import type { AppToAgentMessage } from '../services/agentWs.js';

export type AgentsModule = {
	list(): Promise<{
		id: string;
		name: string;
		online: boolean;
		lastSeen: string | null;
		environmentId: string | null;
		environmentName: string | null;
	}[]>;
	dispatch(args: {
		serverId?: string;
		type: string;
		deviceId?: string;
		action?: 'POWER_ON' | 'POWER_OFF';
		testRunId?: string;
	}): Promise<{ ok: boolean; serverId?: string; broadcast?: boolean }>;
	register(args: { name: string; token: string; environmentId?: string }): Promise<{ id: string; name: string }>;
	runScript(args: { serverId: string; scriptName: string }): Promise<{ runId: string }>;
	getScripts(serverId: string): string[];
};

export function createAgentsModule(_modules: Modules, services: Services): AgentsModule {


	return {
		async list() {
			const dbServers = await services.db.client.testServer.findMany({
				orderBy: { name: 'asc' },
				include: { environment: true },
			});
			const wsMap = new Map(services.agentWs.getConnections().map((c) => [c.serverId, c]));
			return dbServers.map((s: any) => ({
				id: s.id,
				name: s.name,
				online: wsMap.get(s.id)?.online ?? false,
				lastSeen: s.lastSeen?.toISOString() ?? null,
				environmentId: s.environmentId ?? null,
				environmentName: s.environment?.name ?? null,
			}));
		},

		async dispatch(args) {
			const { serverId, ...command } = args;
			if (serverId) {
				const sent = services.agentWs.sendCommand(serverId, command as AppToAgentMessage);
				if (!sent) throw new Error(`Agent ${serverId} is not connected`);
				return { ok: true, serverId };
			}
			services.agentWs.broadcastCommand(command as AppToAgentMessage);
			return { ok: true, broadcast: true };
		},

		async register(args) {
			const hash = await bcrypt.hash(args.token, 10);
			const server = await services.db.client.testServer.upsert({
				where: { name: args.name },
				create: { name: args.name, token: hash, environmentId: args.environmentId ?? null },
				update: { token: hash, ...(args.environmentId !== undefined ? { environmentId: args.environmentId } : {}) },
			});
			return { id: server.id, name: server.name };
		},

		async runScript(args) {
			const runId = crypto.randomUUID();
			const sent = services.agentWs.sendCommand(args.serverId, { type: 'RUN_SCRIPT', scriptName: args.scriptName, runId });
			if (!sent) throw new Error(`Agent ${args.serverId} is not connected`);
			return { runId };
		},

		getScripts(serverId: string): string[] {
			return services.agentWs.getScripts(serverId);
		},
	};
}
