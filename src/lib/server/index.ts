import { buildConfig } from './config.js';
import { createServices } from './services/index.js';
import { createModules } from './modules/index.js';
import type { Services } from './services/index.js';
import type { Modules } from './modules/index.js';

const g = globalThis as Record<string, unknown>;

if (!g.__appSingleton) {
	const cfg = buildConfig();
	const services = createServices(cfg);
	const modules = createModules(services);
	g.__appSingleton = { services, modules };
}

export const { services, modules } = g.__appSingleton as { services: Services; modules: Modules };

export type { AppToAgentMessage, AgentConnection } from './services/agentWs.js';
