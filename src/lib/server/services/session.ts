export type Session = {
	userId: string;
	username: string;
	role: 'ADMIN' | 'VIEWER';
};

export type SessionService = {
	create(data: Session): string;
	get(sessionId: string): Session | null;
	destroy(sessionId: string): void;
};

const g = globalThis as Record<string, unknown>;

export function createSessionService(): SessionService {
	if (!g.__sessionStore) g.__sessionStore = new Map<string, Session>();
	const store = g.__sessionStore as Map<string, Session>;

	return {
		create(data: Session): string {
			const id = crypto.randomUUID();
			store.set(id, data);
			return id;
		},

		get(sessionId: string): Session | null {
			return store.get(sessionId) ?? null;
		},

		destroy(sessionId: string): void {
			store.delete(sessionId);
		},
	};
}
