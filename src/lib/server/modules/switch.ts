import type { Services } from '../services/index.js';
import type { Modules } from './index.js';

export type SwitchModule = {
	set(args: { value: boolean }): Promise<{ value: boolean }>;
	get(): Promise<boolean>;
};

export function createSwitchModule(_modules: Modules, services: Services): SwitchModule {
	return {
		async set(args) {
			services.state.setState('switch', args.value);
			return { value: args.value };
		},

		async get() {
			const state = services.state.getState<boolean>('switch');
			if (!state) return false;
			return state;
		},
	};
}
