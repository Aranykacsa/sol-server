import type { Services } from '../services/index.js';
import { createAgentsModule } from './agents.js';
import { createEnvironmentsModule } from './environments.js';
import { createUsersModule } from './users.js';
import type { AgentsModule } from './agents.js';
import type { EnvironmentsModule } from './environments.js';
import type { UsersModule } from './users.js';

export type Modules = {
	agents: AgentsModule;
	environments: EnvironmentsModule;
	users: UsersModule;
};

export function createModules(services: Services): Modules {
	const modules = {} as Modules;
	modules.agents = createAgentsModule(modules, services);
	modules.environments = createEnvironmentsModule(modules, services);
	modules.users = createUsersModule(modules, services);
	return modules;
}
