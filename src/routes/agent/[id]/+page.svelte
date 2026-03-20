<script lang="ts">
	import {page} from '$app/stores';
	import {onDestroy, onMount} from 'svelte';
	import {Badge, Button} from '@atom-forge/ui';
	import {api} from '$lib/tango.js';
	import type {PageData} from './$types';

	let { data }: { data: PageData } = $props();

	const agentId = $derived($page.params.id ?? '');

	let scripts = $state(data.scripts);

	type LogLine = { line: string; ts: string };

	type Terminal = {
		id: string;
		scriptName: string;
		lines: LogLine[];
		status: 'connecting' | 'connected' | 'disconnected';
		autoScroll: boolean;
		viewport: HTMLElement | null;
		es: EventSource | null;
	};

	let terminals = $state<Terminal[]>([]);

	function connectTerminal(t: Terminal) {
		t.es?.close();
		t.status = 'connecting';
		t.es = new EventSource(`/api/test-runs/${t.id}/logs`);

		t.es.onopen = () => {
			t.status = 'connected';
		};

		t.es.onmessage = (e) => {
			t.lines.push(JSON.parse(e.data) as LogLine);
			if (t.autoScroll && t.viewport) {
				requestAnimationFrame(() => {
					t.viewport!.scrollTop = t.viewport!.scrollHeight;
				});
			}
		};

		t.es.onerror = () => {
			t.status = 'disconnected';
			t.es?.close();
			t.es = null;
		};
	}

	function closeTerminal(t: Terminal) {
		t.es?.close();
		terminals = terminals.filter((x) => x.id !== t.id);
	}

	function handleScroll(t: Terminal) {
		if (!t.viewport) return;
		t.autoScroll = t.viewport.scrollHeight - t.viewport.scrollTop - t.viewport.clientHeight < 40;
	}

	function terminalStatusColor(t: Terminal): 'accent' | 'red' | undefined {
		return t.status === 'connected' ? 'accent' : t.status === 'disconnected' ? 'red' : undefined;
	}

	onMount(() => {
		async function fetchScripts() {
			try {
				const result = (await api.agents.getScripts.$command({ serverId: agentId })) as {
					scripts: string[];
				};
				scripts = result.scripts;
			} catch (e) {
				console.error('[fetchScripts] failed:', e);
			}
		}
		fetchScripts();
		const interval = setInterval(fetchScripts, 5000);
		return () => clearInterval(interval);
	});

	onDestroy(() => {
		terminals.forEach((t) => t.es?.close());
	});

	async function runScript(scriptName: string) {
		const result = (await api.agents.runScript.$command({
			serverId: agentId,
			scriptName
		})) as { runId: string };
		const terminal: Terminal = {
			id: result.runId,
			scriptName,
			lines: [],
			status: 'connecting',
			autoScroll: true,
			viewport: null,
			es: null
		};
		terminals.push(terminal);
		connectTerminal(terminals[terminals.length - 1]);
	}
</script>

<div class="flex h-screen flex-col bg-base font-mono text-sm text-control-c">
	<!-- Header -->
	<div class="flex items-center gap-3 border-b border-canvas px-4 py-2">
		<a href="/" class="text-muted-c hover:text-control-c">←</a>
		<span class="text-control-c">{data.agent?.name ?? agentId}</span>
		{#if data.agent}
			<Badge color={data.agent.online ? 'accent' : undefined}>
				{data.agent.online ? 'online' : 'offline'}
			</Badge>
		{/if}
	</div>

	<div class="flex flex-1 overflow-hidden">
		<!-- Scripts panel -->
		<div class="w-56 shrink-0 overflow-y-auto border-r border-canvas px-3 py-3">
			<span class="mb-2 block text-xs font-medium tracking-widest text-muted-c uppercase"
				>Scripts</span
			>
			{#if scripts.length === 0}
				<p class="text-xs text-muted-c">No scripts found.</p>
			{:else}
				<ul class="flex flex-col gap-1">
					{#each scripts as script}
						<li
							class="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-raised"
						>
							<span class="min-w-0 flex-1 truncate text-xs text-control-c">{script}</span>
							<Button micro ghost onclick={() => runScript(script)}>Run</Button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<!-- Terminals area -->
		{#if terminals.length === 0}
			<div class="flex flex-1 items-center justify-center">
				<p class="text-muted-c">Select a script to run.</p>
			</div>
		{:else}
			<div class="flex flex-1 overflow-x-auto overflow-y-hidden">
				{#each terminals as t (t.id)}
					<div class="flex min-w-80 flex-1 flex-col overflow-hidden border-r border-canvas last:border-r-0">
						<!-- Terminal title bar -->
						<div class="flex items-center gap-2 border-b border-canvas px-3 py-1.5">
							<span class="min-w-0 flex-1 truncate text-xs text-control-c">{t.scriptName}</span>
							<Badge color={terminalStatusColor(t)}>
								<span
									class="mr-1.5 inline-block h-1.5 w-1.5 rounded-full {t.status === 'connecting'
										? 'animate-pulse'
										: ''} bg-current"
								></span>
								{t.status}
							</Badge>
							{#if t.status === 'disconnected'}
								<Button micro ghost onclick={() => connectTerminal(t)}>reconnect</Button>
							{/if}
							{#if !t.autoScroll}
								<Button
									micro
									ghost
									onclick={() => {
										t.autoScroll = true;
										if (t.viewport) t.viewport.scrollTop = t.viewport.scrollHeight;
									}}
								>
									↓
								</Button>
							{/if}
							<Button micro ghost onclick={() => closeTerminal(t)} aria-label="Close terminal">×</Button>
						</div>

						<!-- Log output -->
						<div
							bind:this={t.viewport}
							onscroll={() => handleScroll(t)}
							class="flex-1 overflow-y-auto px-4 py-3"
						>
							{#if t.lines.length === 0}
								<p class="text-muted-c">
									{t.status === 'connecting'
										? 'Connecting…'
										: t.status === 'connected'
											? 'Waiting for output…'
											: 'Stream ended.'}
								</p>
							{:else}
								{#each t.lines as { line, ts }, i (i)}
									<div class="flex gap-3 leading-5">
										<span class="w-36 shrink-0 select-none text-muted-c"
											>{new Date(ts).toISOString().slice(0, 10)} {new Date(ts).toISOString().slice(11, 16)}</span
										>
										<span class="whitespace-pre-wrap break-all text-control-c">{line}</span>
									</div>
								{/each}
							{/if}
						</div>

						<!-- Footer -->
						<div
							class="flex items-center justify-between border-t border-canvas px-4 py-1.5 text-xs text-muted-c"
						>
							<span>{t.lines.length} lines</span>
							<span>{t.autoScroll ? 'auto-scroll on' : 'auto-scroll off'}</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
