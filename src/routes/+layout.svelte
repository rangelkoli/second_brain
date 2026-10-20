<script lang="ts">
	import "../app.css";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import AppSidebar from "$lib/components/app-sidebar.svelte";
	import Login from "./login/+page.svelte";
	import { desktop } from "$lib/store.svelte";
	import { auth, pb } from "$lib/sync.svelte";

	let { children } = $props();
</script>

<!-- The web app has nothing to show without the server; the desktop app works offline from its vault. -->
{#if !desktop && pb && !auth.valid}
	<main class="px-6"><Login /></main>
{:else}
<Sidebar.Provider>
	<AppSidebar />
	<Sidebar.Inset>
		<header class="flex h-12 shrink-0 items-center px-3">
			<Sidebar.Trigger />
		</header>
		<main class="flex-1 px-6 pb-16">
			{@render children()}
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>
{/if}
