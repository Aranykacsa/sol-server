import { services } from '$lib/server/index.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const agent = await services.db.client.testServer.findUnique({ where: { id: params.id } });
	const conn = services.agentWs.getConnections().find((c) => c.serverId === params.id);
	return {
		agent: agent ? { id: agent.id, name: agent.name, online: conn?.online ?? false } : null,
		scripts: services.agentWs.getScripts(params.id),
	};
};
