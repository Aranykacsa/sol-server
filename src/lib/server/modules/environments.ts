import type { Services } from '../services/index.js';
import type { Modules } from './index.js';

export type EnvironmentsModule = {
	list(): Promise<{ id: string; name: string }[]>;
	create(args: { name: string }): Promise<{ id: string; name: string }>;
	delete(args: { id: string }): Promise<{ ok: boolean }>;
};

export function createEnvironmentsModule(_modules: Modules, services: Services): EnvironmentsModule {
	return {
		async list() {
			return services.db.client.environment.findMany({ orderBy: { name: 'asc' } });
		},

		async create(args) {
			return services.db.client.environment.create({ data: { name: args.name } });
		},

		async delete(args) {
			await services.db.client.environment.delete({ where: { id: args.id } });
			return { ok: true };
		},
	};
}
