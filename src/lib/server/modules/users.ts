import bcrypt from 'bcryptjs';
import type { Services } from '../services/index.js';
import type { Modules } from './index.js';

export type UsersModule = {
	list(): Promise<{ id: string; username: string; role: string; createdAt: string }[]>;
	create(args: { username: string; password: string; role: 'ADMIN' | 'VIEWER' }): Promise<{ id: string }>;
	delete(args: { id: string }): Promise<{ ok: boolean }>;
	changePassword(args: { id: string; password: string }): Promise<{ ok: boolean }>;
};

export function createUsersModule(_modules: Modules, services: Services): UsersModule {
	return {
		async list() {
			const users = await services.db.client.user.findMany({ orderBy: { createdAt: 'asc' } });
			return users.map((u) => ({
				id: u.id,
				username: u.username,
				role: u.role,
				createdAt: u.createdAt.toISOString(),
			}));
		},

		async create({ username, password, role }) {
			const passwordHash = await bcrypt.hash(password, 10);
			const user = await services.db.client.user.create({
				data: { username, passwordHash, role },
			});
			return { id: user.id };
		},

		async delete({ id }) {
			await services.db.client.user.delete({ where: { id } });
			return { ok: true };
		},

		async changePassword({ id, password }) {
			const passwordHash = await bcrypt.hash(password, 10);
			await services.db.client.user.update({ where: { id }, data: { passwordHash } });
			return { ok: true };
		},
	};
}
