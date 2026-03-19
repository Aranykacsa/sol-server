import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { AppToAgentMessage } from '$lib/server/index.js';

/**
 * GET /api/agent/poll?serverId=xxx
 *
 * Long-poll fallback for agents that cannot use WebSocket.
 * Holds the connection open for up to 30 seconds and responds
 * as soon as a command is queued for the requesting server,
 * or returns an empty payload on timeout.
 *
 * This is backed by a simple in-process queue. Replace with
 * Redis pub/sub when running multiple app instances.
 */

const POLL_TIMEOUT_MS = 30_000;

// serverId → array of waiting resolvers
const waiters = new Map<string, Array<(cmd: AppToAgentMessage) => void>>();

/** Enqueue a command for a polling agent (called by workflow engine). */
export function enqueueForPoller(serverId: string, command: AppToAgentMessage) {
	const resolvers = waiters.get(serverId);
	if (resolvers?.length) {
		resolvers.shift()!(command);
	}
	// if no one is polling, the command is dropped — WebSocket is preferred
}

export const GET: RequestHandler = ({ url }) => {
	const serverId = url.searchParams.get('serverId');
	if (!serverId) error(400, 'serverId required');

	return new Response(
		new ReadableStream({
			start(controller) {
				const timeout = setTimeout(() => {
					// No command within timeout — return empty to let the agent re-poll
					controller.enqueue(new TextEncoder().encode(JSON.stringify({ commands: [] })));
					controller.close();
					cleanup();
				}, POLL_TIMEOUT_MS);

				const resolve = (command: AppToAgentMessage) => {
					clearTimeout(timeout);
					controller.enqueue(
						new TextEncoder().encode(JSON.stringify({ commands: [command] }))
					);
					controller.close();
					cleanup();
				};

				function cleanup() {
					const resolvers = waiters.get(serverId!);
					if (resolvers) {
						const idx = resolvers.indexOf(resolve);
						if (idx !== -1) resolvers.splice(idx, 1);
						if (resolvers.length === 0) waiters.delete(serverId!);
					}
				}

				if (!waiters.has(serverId)) waiters.set(serverId, []);
				waiters.get(serverId)!.push(resolve);
			}
		}),
		{ headers: { 'Content-Type': 'application/json' } }
	);
};
