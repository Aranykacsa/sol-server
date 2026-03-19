import type { Services } from '../services/index.js';
import { createAgentsModule } from './agents.js';
import { createEnvironmentsModule } from './environments.js';
import { createSwitchModule } from './switch.js';
import type { AgentsModule } from './agents.js';
import type { EnvironmentsModule } from './environments.js';
import type { SwitchModule } from './switch.js';

export type Modules = {
	agents: AgentsModule;
	environments: EnvironmentsModule;
	switch: SwitchModule;
};

export function createModules(services: Services): Modules {
	const modules = {} as Modules;
	modules.agents = createAgentsModule(modules, services);
	modules.environments = createEnvironmentsModule(modules, services);
	modules.switch = createSwitchModule(modules, services);
	return modules;
}
