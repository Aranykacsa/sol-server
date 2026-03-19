import { createHandler, tango } from '@atom-forge/tango-rpc';
import { modules } from './index.js';

const api = {
	agents: {
		list: tango.query(async (_args: undefined) => {
			return modules.agents.list();
		}),

		dispatch: tango.command(async (args: {
			serverId?: string;
			type: string;
			deviceId?: string;
			action?: 'POWER_ON' | 'POWER_OFF';
			testRunId?: string;
		}) => {
			return modules.agents.dispatch(args);
		}),

		register: tango.command(async (args: { name: string; token: string; environmentId?: string }) => {
			return modules.agents.register(args);
		}),

		runScript: tango.command(async (args: { serverId: string; scriptName: string }) => {
			return modules.agents.runScript(args);
		}),

		getScripts: tango.command(async (args: { serverId: string }) => {
			return { scripts: modules.agents.getScripts(args.serverId) };
		}),
	},

	environments: {
		list: tango.query(async (_args: undefined) => {
			return modules.environments.list();
		}),

		create: tango.command(async (args: { name: string }) => {
			return modules.environments.create(args);
		}),

		delete: tango.command(async (args: { id: string }) => {
			return modules.environments.delete(args);
		}),
	},

	switch: {
		set: tango.command(async (args: { value: boolean }) => {
			return modules.switch.set(args);
		}),

		get: tango.command(async () => {
			return modules.switch.get();
		}),
	},
};

export const [handler, definition] = createHandler(api);
export type Definition = typeof definition;
