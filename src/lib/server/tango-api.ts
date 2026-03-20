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

	users: {
		list: tango.query(async (_args: undefined) => {
			return modules.users.list();
		}),

		create: tango.command(async (args: { username: string; password: string; role: 'ADMIN' | 'VIEWER' }) => {
			return modules.users.create(args);
		}),

		delete: tango.command(async (args: { id: string }) => {
			return modules.users.delete(args);
		}),

		changePassword: tango.command(async (args: { id: string; password: string }) => {
			return modules.users.changePassword(args);
		}),
	},
};

export const [handler, definition] = createHandler(api);
export type Definition = typeof definition;
