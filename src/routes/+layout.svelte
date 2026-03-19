<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { AtomForge } from '@atom-forge/ui';
	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<AtomForge dark>
	{@render children()}
</AtomForge>
