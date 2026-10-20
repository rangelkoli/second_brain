<script lang="ts">
	import { goto } from "$app/navigation";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import Brain from "@lucide/svelte/icons/brain";
	import { signIn } from "$lib/sync.svelte";

	let email = $state("");
	let password = $state("");
	let error = $state("");
	let busy = $state(false);

	async function submit(e: Event) {
		e.preventDefault();
		busy = true;
		error = "";
		try {
			await signIn(email, password);
			goto("/");
		} catch (err: any) {
			error = err?.status === 400 ? "Wrong email or password." : "Couldn't reach the sync server.";
		} finally {
			busy = false;
		}
	}
</script>

<div class="mx-auto flex max-w-sm flex-col gap-6 pt-24">
	<div class="space-y-1 text-center">
		<Brain class="mx-auto size-8" />
		<h1 class="text-2xl font-bold tracking-tight">Sign in to Second Brain</h1>
		<p class="text-muted-foreground text-sm">Your notes and to-dos sync across devices.</p>
	</div>
	<form class="flex flex-col gap-3" onsubmit={submit}>
		<Input type="email" placeholder="Email" autocomplete="email" required bind:value={email} aria-label="Email" />
		<Input type="password" placeholder="Password" autocomplete="current-password" required bind:value={password} aria-label="Password" />
		{#if error}<p class="text-destructive text-sm" role="alert">{error}</p>{/if}
		<Button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
	</form>
</div>
