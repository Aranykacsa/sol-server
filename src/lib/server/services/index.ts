import type { Config } from '../config.js';
import { createDbService } from './db.js';
import { createAgentWsService } from './agentWs.js';
import { createStateService } from './state.js';
import type { DbService } from './db.js';
import type { AgentWsService } from './agentWs.js';
import type { StateService } from './state.js';

export type Services = {
	db: DbService;
	agentWs: AgentWsService;
	state: StateService;
};

export function createServices(cfg: Config): Services {
	const services = {} as Services;
	services.db = createDbService(cfg);
	services.agentWs = createAgentWsService(cfg, services); // lazy ref to services.state
	services.state = createStateService(services); // lazy ref to services.agentWs
	return services;
}
