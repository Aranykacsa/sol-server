import bcrypt from 'bcryptjs';
import { buildConfig } from './config.js';
import { createServices } from './services/index.js';
import { createModules } from './modules/index.js';
import type { Config } from './config.js';
import type { Services } from './services/index.js';
import type { Modules } from './modules/index.js';

const g = globalThis as Record<string, unknown>;

if (!g.__appSingleton) {
	const cfg = buildConfig();
	const services = createServices(cfg);
	const modules = createModules(services);
	g.__appSingleton = { cfg, services, modules };

	// Seed initial admin user if INITIAL_ADMIN_PASSWORD is set and no users exist
	if (cfg.auth.initialAdminPassword) {
		(async () => {
			const count = await services.db.client.user.count();
			if (count === 0) {
				const passwordHash = await bcrypt.hash(cfg.auth.initialAdminPassword!, 10);
				await services.db.client.user.create({
					data: { username: 'admin', passwordHash, role: 'ADMIN' },
				});
				console.info('[auth] Initial admin user created');
			}
		})().catch((e) => console.error('[auth] Failed to seed admin user:', e));
	}
}

export const { cfg: config, services, modules } = g.__appSingleton as { cfg: Config; services: Services; modules: Modules };

export type { AppToAgentMessage, AgentConnection } from './services/agentWs.js';
