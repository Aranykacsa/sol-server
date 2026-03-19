<script lang="ts">
	import type {PageData} from './$types';
	import {Badge, Switch} from '@atom-forge/ui';
	import {api} from '$lib/tango.js';
	import {onMount, untrack} from "svelte";

	let { data }: { data: PageData } = $props();

	let on = $derived(data.switchValue);
	let state: boolean = $state(false)

	onMount(async() => {
		state = await api.switch.get.$command({}) as boolean;
	})

	async function track() {
		await api.switch.set.$command({ value: on });
		state = await api.switch.get.$command({}) as boolean;
		console.log(state)
	}

	$effect(() => {
		on
		untrack(() => {
			track()
		})
	});

	const allAgents = $derived([...data.grouped.flatMap(g => g.agents), ...data.ungrouped]);
</script>

<div class="flex min-h-screen items-center justify-center bg-base">
	<div class="flex flex-col items-center gap-10">
		<!-- Switch -->
		<div class="flex flex-col items-center gap-4">
			<span class="text-sm font-medium tracking-widest text-muted-c uppercase">Main Switch</span>
			<Switch bind:value={on} />
			<span class="text-xs font-mono text-muted-c">
				{on ? 'ON' : 'OFF'}
			</span>
		</div>

		<div class="flex flex-col items-center gap-4">
			{state}
		</div>

		<!-- Agents list -->
		<div class="w-72">
			<span class="mb-3 block text-sm font-medium tracking-widest text-muted-c uppercase">
				Test Servers
			</span>

			{#if allAgents.length === 0}
				<p class="text-xs text-muted-c">No agents registered.</p>
			{:else}
				<div class="flex flex-col gap-6">
					{#each data.grouped as env (env.id)}
						{#if env.agents.length > 0}
							<div>
								<span class="mb-2 block text-xs font-medium tracking-widest text-muted-c uppercase">
									{env.name}
								</span>
								<ul class="flex flex-col gap-2">
									{#each env.agents as agent (agent.id)}
										<li>
											<a
												href="/test-runs/{agent.id}"
												class="flex items-center gap-3 rounded-lg border border-canvas bg-raised px-4 py-3 transition-colors duration-150 hover:border-canvas/70 hover:bg-raised/70"
											>
												<span
													class="h-2 w-2 shrink-0 rounded-full {agent.online
														? 'bg-accent'
														: 'bg-muted-c/30'}"
												></span>
												<span class="flex-1 text-sm text-control-c">{agent.name}</span>
												<Badge color={agent.online ? 'accent' : undefined}>
													{agent.online ? 'online' : 'offline'}
												</Badge>
											</a>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					{/each}

					{#if data.ungrouped.length > 0}
						<div>
							<span class="mb-2 block text-xs font-medium tracking-widest text-muted-c uppercase">
								—
							</span>
							<ul class="flex flex-col gap-2">
								{#each data.ungrouped as agent (agent.id)}
									<li>
										<a
											href="/test-runs/{agent.id}"
											class="flex items-center gap-3 rounded-lg border border-canvas bg-raised px-4 py-3 transition-colors duration-150 hover:border-canvas/70 hover:bg-raised/70"
										>
											<span
												class="h-2 w-2 shrink-0 rounded-full {agent.online
													? 'bg-accent'
													: 'bg-muted-c/30'}"
											></span>
											<span class="flex-1 text-sm text-control-c">{agent.name}</span>
											<Badge color={agent.online ? 'accent' : undefined}>
												{agent.online ? 'online' : 'offline'}
											</Badge>
										</a>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
