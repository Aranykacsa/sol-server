import type { Config } from '../config.js';
import { createDbService } from './db.js';
import { createAgentWsService } from './agentWs.js';
import { createSessionService } from './session.js';
import type { DbService } from './db.js';
import type { AgentWsService } from './agentWs.js';
import type { SessionService } from './session.js';

export type Services = {
	db: DbService;
	agentWs: AgentWsService;
	session: SessionService;
};

export function createServices(cfg: Config): Services {
	const services = {} as Services;
	services.db = createDbService(cfg);
	services.agentWs = createAgentWsService(cfg, services);
	services.session = createSessionService();
	return services;
}
