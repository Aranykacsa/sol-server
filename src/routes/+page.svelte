<script lang="ts">
	import type { PageData } from './$types';
	import { Badge, Button } from '@atom-forge/ui';
	import { api } from '$lib/tango.js';

	let { data }: { data: PageData } = $props();

	const allAgents = $derived([...data.grouped.flatMap(g => g.agents), ...data.ungrouped]);

	// Users management (admin only)
	let users = $state<{ id: string; username: string; role: string }[]>([]);
	let showUsers = $state(false);
	let newUsername = $state('');
	let newPassword = $state('');
	let newRole = $state<'ADMIN' | 'VIEWER'>('VIEWER');
	let userError = $state('');

	async function loadUsers() {
		const result = await api.users.list.$query(undefined);
		users = result as typeof users;
	}

	async function createUser() {
		userError = '';
		try {
			await api.users.create.$command({ username: newUsername, password: newPassword, role: newRole });
			newUsername = '';
			newPassword = '';
			await loadUsers();
		} catch (e) {
			userError = String(e);
		}
	}

	async function deleteUser(id: string) {
		await api.users.delete.$command({ id });
		await loadUsers();
	}

	$effect(() => {
		if (data.currentUser.role === 'ADMIN' && showUsers) {
			loadUsers();
		}
	});
</script>

<div class="flex min-h-screen flex-col items-center gap-10 bg-base p-8">
	<!-- Header -->
	<div class="flex w-full max-w-2xl items-center justify-between">
		<span class="text-sm font-medium tracking-widest text-muted-c uppercase">sol-server</span>
		<div class="flex items-center gap-3">
			<span class="text-xs text-muted-c">{data.currentUser.username}</span>
			<Badge>{data.currentUser.role}</Badge>
			<form method="POST" action="/logout">
				<button type="submit" class="text-xs text-muted-c underline hover:text-control-c">Sign out</button>
			</form>
		</div>
	</div>

	<!-- Agents list -->
	<div class="w-full max-w-2xl">
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

	<!-- Users section (admin only) -->
	{#if data.currentUser.role === 'ADMIN'}
		<div class="w-full max-w-2xl">
			<div class="mb-3 flex items-center gap-3">
				<span class="text-sm font-medium tracking-widest text-muted-c uppercase">Users</span>
				<Button ghost small onclick={() => { showUsers = !showUsers; }}>
					{showUsers ? 'Hide' : 'Manage'}
				</Button>
			</div>

			{#if showUsers}
				<div class="flex flex-col gap-4">
					<!-- Create user -->
					<div class="flex flex-col gap-3 rounded-lg border border-canvas bg-raised p-4">
						<span class="text-xs font-medium text-muted-c uppercase">New User</span>
						<div class="flex gap-2">
							<input
								bind:value={newUsername}
								placeholder="username"
								class="flex-1 rounded border border-canvas bg-base px-3 py-1.5 text-sm text-control-c outline-none focus:border-accent"
							/>
							<input
								bind:value={newPassword}
								type="password"
								placeholder="password"
								class="flex-1 rounded border border-canvas bg-base px-3 py-1.5 text-sm text-control-c outline-none focus:border-accent"
							/>
							<select
								bind:value={newRole}
								class="rounded border border-canvas bg-base px-3 py-1.5 text-sm text-control-c outline-none"
							>
								<option value="VIEWER">Viewer</option>
								<option value="ADMIN">Admin</option>
							</select>
							<Button small onclick={createUser}>Add</Button>
						</div>
						{#if userError}
							<p class="text-xs text-red-400">{userError}</p>
						{/if}
					</div>

					<!-- User list -->
					{#if users.length > 0}
						<ul class="flex flex-col gap-2">
							{#each users as user (user.id)}
								<li class="flex items-center gap-3 rounded-lg border border-canvas bg-raised px-4 py-3">
									<span class="flex-1 text-sm text-control-c">{user.username}</span>
									<Badge>{user.role}</Badge>
									{#if user.username !== data.currentUser.username}
										<Button small destructive onclick={() => deleteUser(user.id)}>Delete</Button>
									{/if}
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-xs text-muted-c">No users yet.</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
