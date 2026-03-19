import { json } from '@sveltejs/kit';
import { services } from '$lib/server/index.js';
import type { RequestHandler } from './$types';

/**
 * GET /api/agent/ws
 *
 * WebSocket upgrade is handled at the HTTP server level:
 *   - Dev:  vite.config.ts agentWebSocketPlugin
 *   - Prod: server.js wrapper around the Node adapter
 *
 * Plain HTTP GET returns the registry of currently connected agents,
 * useful for health checks and the dashboard.
 */
export const GET: RequestHandler = () => {
	const agents = services.agentWs.getConnections().map(({ serverId, connectedAt, lastPing, online }) => ({
		serverId,
		connectedAt,
		lastPing,
		online
	}));
	return json({ agents });
};
