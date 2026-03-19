/**
 * Production entry point — run after `bun run build`:  bun server.ts
 *
 * Wraps the SvelteKit Node adapter server with WebSocket support
 * for the Test Server Agent endpoint: ws://[host]/api/agent/ws
 */
import { createServer } from 'http';
import { handler } from './build/index.js';
import type { IncomingMessage } from 'http';
import { services } from './src/lib/server/index.ts';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = process.env.PORT ?? 3000;
const WS_PATH = '/api/agent/ws';

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------
const server = createServer(handler);
const wss = services.agentWs.createWss();

// ---------------------------------------------------------------------------
// Upgrade handler — validates token via DB, then hands off to wss
// ---------------------------------------------------------------------------
server.on('upgrade', async (req: IncomingMessage, socket, head) => {
	const url = new URL(req.url ?? '', 'http://localhost');

	if (!url.pathname.startsWith(WS_PATH)) {
		socket.destroy();
		return;
	}

	const serverId = url.searchParams.get('serverId') ?? '';
	const token = url.searchParams.get('token') ?? '';

	const valid = await services.agentWs.validateToken(serverId, token);
	if (!valid) {
		socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
		socket.destroy();
		return;
	}

	services.agentWs.handleUpgrade(wss, req, socket, head);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
