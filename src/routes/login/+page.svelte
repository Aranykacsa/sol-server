<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-base">
	<div class="flex w-full max-w-sm flex-col gap-6">
		<div class="flex flex-col items-center gap-2">
			<h1 class="text-lg font-semibold text-control-c">Sign In</h1>
			<p class="text-xs text-muted-c">sol-server dashboard</p>
		</div>

		<form method="POST" use:enhance class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<label class="text-xs font-medium text-muted-c" for="username">Username</label>
				<input
					id="username"
					name="username"
					type="text"
					autocomplete="username"
					required
					class="rounded-lg border border-canvas bg-raised px-3 py-2 text-sm text-control-c outline-none focus:border-accent"
				/>
			</div>

			<div class="flex flex-col gap-2">
				<label class="text-xs font-medium text-muted-c" for="password">Password</label>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="current-password"
					required
					class="rounded-lg border border-canvas bg-raised px-3 py-2 text-sm text-control-c outline-none focus:border-accent"
				/>
			</div>

			{#if form?.error}
				<p class="text-xs text-red-400">{form.error}</p>
			{/if}

			<button
				type="submit"
				class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-control-c transition-opacity hover:opacity-90"
			>
				Sign In
			</button>
		</form>
	</div>
</div>
