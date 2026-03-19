import { PrismaClient } from '$generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Config } from '../config.js';

export type DbService = { client: PrismaClient };

const g = globalThis as Record<string, unknown>;

export function createDbService(cfg: Pick<Config, 'db'>): DbService {
	if (!g.__prismaClient) {
		const adapter = new PrismaPg({ connectionString: cfg.db.connectionString });
		g.__prismaClient = new PrismaClient({ adapter });
	}
	return { client: g.__prismaClient as PrismaClient };
}
