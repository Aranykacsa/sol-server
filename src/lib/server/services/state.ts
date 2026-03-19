import type { Services } from './index.js';

export type StateService = {
	getState<T>(key: string): T | undefined;
	setState<T>(key: string, value: T): void;
	getFullState(): Record<string, unknown>;
};

const g = globalThis as Record<string, unknown>;

export function createStateService(services: Services): StateService {
	if (!g.__stateStore) {
		g.__stateStore = new Map<string, unknown>([['switch', false]]);
	}
	const store = g.__stateStore as Map<string, unknown>;

	return {
		getState<T>(key: string): T | undefined {
			return store.get(key) as T | undefined;
		},

		setState<T>(key: string, value: T): void {
			store.set(key, value);
			services.agentWs.broadcastCommand({ type: 'STATE_UPDATE', key, value });
		},

		getFullState(): Record<string, unknown> {
			return Object.fromEntries(store);
		},
	};
}
