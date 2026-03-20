<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input } from '@atom-forge/ui';
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
				<Input id="username" name="username" type="text" autocomplete="username" required />
			</div>

			<div class="flex flex-col gap-2">
				<label class="text-xs font-medium text-muted-c" for="password">Password</label>
				<Input id="password" name="password" type="password" autocomplete="current-password" required />
			</div>

			{#if form?.error}
				<p class="text-xs text-red-400">{form.error}</p>
			{/if}

			<Button accent type="submit">Sign In</Button>
		</form>
	</div>
</div>
