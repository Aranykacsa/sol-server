import { redirect } from '@sveltejs/kit';
import { services } from '$lib/server/index.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies }) => {
	const sessionId = cookies.get('__session');
	if (sessionId) {
		services.session.destroy(sessionId);
	}
	cookies.delete('__session', { path: '/' });
	throw redirect(303, '/login');
};
