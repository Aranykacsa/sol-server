import 'dotenv/config';

class Env {
	string(key: string, defaultValue?: string): string {
		const val = process.env[key];
		if (val !== undefined) return val;
		if (defaultValue !== undefined) return defaultValue;
		throw new Error(`Missing required environment variable: ${key}`);
	}

	int(key: string, defaultValue?: number): number {
		const val = process.env[key];
		if (val !== undefined) {
			const n = parseInt(val, 10);
			if (isNaN(n)) throw new Error(`Environment variable ${key} is not a valid integer: ${val}`);
			return n;
		}
		if (defaultValue !== undefined) return defaultValue;
		throw new Error(`Missing required environment variable: ${key}`);
	}
}

export type Config = {
	db: { connectionString: string };
	agentWs: { token: string | null };
	logDir: string;
	auth: { initialAdminPassword: string | null };
	apiKey: string | null;
};

export function buildConfig(): Config {
	const env = new Env();
	return {
		db: { connectionString: env.string('DATABASE_URL') },
		agentWs: { token: env.string('AGENT_TOKEN', '') || null },
		logDir: env.string('LOG_DIR', './logs/runs'),
		auth: {
			initialAdminPassword: env.string('INITIAL_ADMIN_PASSWORD', '') || null,
		},
		apiKey: env.string('API_KEY', '') || null,
	};
}
