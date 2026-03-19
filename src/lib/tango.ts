import { createClient } from '@atom-forge/tango-rpc';
import type { Definition } from '$lib/server/tango-api.js';

export const [api] = createClient<Definition>('/api/tango');
