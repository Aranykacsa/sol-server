import bcrypt from 'bcryptjs';
import { redirect, fail } from '@sveltejs/kit';
import { services } from '$lib/server/index.js';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const sessionId = cookies.get('__session');
	if (sessionId && services.session.get(sessionId)) {
		throw redirect(303, '/');
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const username = String(data.get('username') ?? '');
		const password = String(data.get('password') ?? '');

		const user = await services.db.client.user.findUnique({ where: { username } });
		if (!user || !await bcrypt.compare(password, user.passwordHash)) {
			return fail(401, { error: 'Invalid credentials' });
		}

		const sessionId = services.session.create({
			userId: user.id,
			username: user.username,
			role: user.role as 'ADMIN' | 'VIEWER',
		});

		cookies.set('__session', sessionId, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24, // 24 hours
		});

		throw redirect(303, '/');
	},
};
