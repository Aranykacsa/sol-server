import { handler } from '$lib/server/tango-api.js';
import { config, services } from '$lib/server/index.js';
import { redirect } from '@sveltejs/kit';
import type { Handle, RequestEvent } from '@sveltejs/kit';

const PUBLIC_PATHS = ['/login', '/logout'];
const AGENT_PATHS = ['/api/agent/'];

async function isAuthed(event: RequestEvent): Promise<boolean> {
	const sessionId = event.cookies.get('__session');
	if (!sessionId) return false;
	return services.session.get(sessionId) !== null;
}

function hasApiKey(event: RequestEvent): boolean {
	if (!config.apiKey) return false;
	return event.request.headers.get('x-api-key') === config.apiKey;
}

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// Public routes — no auth needed
	if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
		return resolve(event);
	}

	// Agent WS/poll routes — auth handled at WS upgrade level
	if (AGENT_PATHS.some((p) => pathname.startsWith(p))) {
		return resolve(event);
	}

	// Tango RPC — accept session cookie or API key; agents.register is always public
	if (pathname.startsWith('/api/tango')) {
		// agents.register is public (agents call it during registration)
		const proc = pathname.replace('/api/tango/', '').replace(/^\//, '');
		if (proc === 'agents.register') {
			event.params = { path: proc } as never;
			return handler(event);
		}

		const authed = hasApiKey(event) || await isAuthed(event);
		if (!authed) {
			return Response.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const path = pathname.slice('/api/tango'.length).replace(/^\//, '');
		event.params = { path } as never;
		return handler(event);
	}

	// All other routes — require valid session
	if (!await isAuthed(event)) {
		throw redirect(303, '/login');
	}

	return resolve(event);
};
