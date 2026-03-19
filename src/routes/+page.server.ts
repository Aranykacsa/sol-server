import { services } from '$lib/server/index.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [dbServers, environments] = await Promise.all([
		services.db.client.testServer.findMany({ orderBy: { name: 'asc' }, include: { environment: true } }),
		services.db.client.environment.findMany({ orderBy: { name: 'asc' } }),
	]);

	const wsMap = new Map(services.agentWs.getConnections().map((c) => [c.serverId, c]));

	const mapServer = (s: typeof dbServers[number]) => ({
		id: s.id,
		name: s.name,
		online: wsMap.get(s.id)?.online ?? false,
		lastSeen: s.lastSeen?.toISOString() ?? null,
		environmentId: s.environmentId ?? null,
	});

	const grouped = environments.map((env) => ({
		id: env.id,
		name: env.name,
		agents: dbServers.filter((s) => s.environmentId === env.id).map(mapServer),
	}));

	const ungrouped = dbServers.filter((s) => s.environmentId === null).map(mapServer);

	return {
		switchValue: services.state.getState<boolean>('switch') ?? false,
		grouped,
		ungrouped,
	};
};
