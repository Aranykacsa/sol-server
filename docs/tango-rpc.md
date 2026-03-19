# Tango-RPC Developer Reference

`@atom-forge/tango-rpc` provides type-safe RPC over HTTP. The server defines procedures; the client gets a fully-typed proxy — no code generation, no Zod.

---

## Server-side

### Defining procedures (`src/lib/server/tango-api.ts`)

```ts
import { createHandler, tango } from '@atom-forge/tango-rpc';

const api = {
  myNamespace: {
    // Query — read-only, maps to HTTP GET
    myQuery: tango.query(async (_args: undefined) => {
      return { items: [] };
    }),

    // Command — mutating, maps to HTTP POST
    myCommand: tango.command(async (args: { id: string; value: boolean }) => {
      // do work
      return { ok: true };
    }),
  },
};

export const [handler, definition] = createHandler(api);
export type Definition = typeof definition;
```

**Rules:**
- Use plain TypeScript types for args — no Zod, no runtime validation library
- `tango.query` = read operation (GET semantics)
- `tango.command` = write operation (POST semantics)
- `_args: undefined` when a procedure takes no arguments
- Throw a plain `Error` to return an error response to the client

### Routing (`src/hooks.server.ts`)

The handler is mounted before SvelteKit resolves routes, so it intercepts all `/api/tango/*` requests:

```ts
import { handler } from '$lib/server/tango-api.js';
import type { Handle, RequestEvent } from '@sveltejs/kit';

const API_ROUTES: Record<string, (event: RequestEvent) => Response | Promise<Response>> = {
  '/api/tango': handler,
};

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;
  const match = Object.keys(API_ROUTES)
    .sort((a, b) => b.length - a.length)
    .find((prefix) => pathname.startsWith(prefix));
  if (match) {
    const path = pathname.slice(match.length).replace(/^\//, '');
    event.params = { path } as never;
    return API_ROUTES[match](event);
  }
  return resolve(event);
};
```

To add a second tango router (e.g. `/api/admin`), add another entry to `API_ROUTES`.

---

## Client-side

### Setup (`src/lib/tango.ts`)

```ts
import { createClient } from '@atom-forge/tango-rpc';
import type { Definition } from '$lib/server/tango-api.js';

export const [api] = createClient<Definition>('/api/tango');
```

`Definition` is the inferred type from `createHandler` — this is what gives the client full type safety without a separate schema package.

### Calling procedures

```ts
import { api } from '$lib/tango.js';

// Query (GET)
const result = await api.myNamespace.myQuery.$query(undefined);

// Command (POST)
const result = await api.myNamespace.myCommand.$command({ id: 'abc', value: true });
```

In Svelte components, reactive calls go inside `$effect` or async event handlers.

---

## Existing procedures

| Procedure | Type | Args | Returns |
|-----------|------|------|---------|
| `agents.list` | query | `undefined` | `Array<{ id, name, online, lastSeen }>` |
| `agents.dispatch` | command | `{ serverId?, type, deviceId?, action?, testRunId? }` | `{ ok, serverId? \| broadcast? }` |
| `agents.register` | command | `{ name: string, token: string }` | `{ id, name }` |
| `agents.runScript` | command | `{ serverId: string, scriptName: string }` | `{ runId: string }` |
| `agents.getScripts` | command | `{ serverId: string }` | `{ scripts: string[] }` |
| `switch.set` | command | `{ value: boolean }` | `{ value: boolean }` |

`agents.dispatch` without `serverId` broadcasts to all connected agents.

---

## What cannot be a tango procedure

Tango is HTTP request/response only. These must remain as raw `+server.ts` routes:
- WebSocket connections (`/api/agent/ws`)
- Long-poll endpoints (`/api/agent/poll`)
- SSE streams (`/api/test-runs/[id]/logs`)
