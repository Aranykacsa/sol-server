import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';

function agentWebSocketPlugin(): Plugin {
	return {
		name: 'agent-ws',
		configureServer(server: ViteDevServer) {
			// Use ssrLoadModule so Vite's resolver handles the $generated alias —
			// a native import() here would cause esbuild to bundle db.ts at config-load
			// time, where the alias isn't available and Node.js can't resolve $generated.
			server.ssrLoadModule('/src/lib/server/index.js').then(({ services }) => {
				const wss = services.agentWs.createWss();
				server.httpServer?.on('upgrade', async (req, socket, head) => {
					if (!req.url?.startsWith('/api/agent/ws')) return;
					const url = new URL(req.url, 'http://localhost');
					const serverId = url.searchParams.get('serverId') ?? '';
					const token = url.searchParams.get('token') ?? '';
					if (!(await services.agentWs.validateToken(serverId, token))) {
						socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
						socket.destroy();
						return;
					}
					services.agentWs.handleUpgrade(wss, req, socket as import('stream').Duplex, head);
				});
			});
		}
	};
}

export default defineConfig({ plugins: [tailwindcss(), sveltekit(), agentWebSocketPlugin()] });
