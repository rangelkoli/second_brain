<script lang="ts">
	import { goto } from "$app/navigation";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Textarea } from "$lib/components/ui/textarea/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import GraduationCap from "@lucide/svelte/icons/graduation-cap";
	import X from "@lucide/svelte/icons/x";
	import { gemini, setKey, sessions, startSession, deleteSession } from "$lib/trainer/trainer.svelte";

	let topic = $state("");
	let level = $state("");
	let key = $state("");

	function start(e: Event) {
		e.preventDefault();
		if (topic.trim()) goto(`/learn/${startSession(topic.trim(), level)}`);
	}
	function saveKey(e: Event) {
		e.preventDefault();
		setKey(key);
		key = "";
	}
	const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
</script>

<div class="mx-auto max-w-2xl space-y-10 pt-6 pb-24">
	<div>
		<h1 class="flex items-center gap-2 text-3xl font-bold tracking-tight"><GraduationCap class="size-7" /> Trainer</h1>
		<p class="text-muted-foreground mt-1">
			Learn a topic in short chunks. Answer each question from memory, write notes in your own words, and sketch on the
			whiteboard. The trainer reads both and tells you what to fix.
		</p>
	</div>

	{#if !gemini.key}
		<form class="space-y-2 rounded-lg border p-4" onsubmit={saveKey}>
			<label for="key" class="text-sm font-medium">Gemini API key</label>
			<p class="text-muted-foreground text-sm">
				Stored only in this browser. Get one at <a class="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>.
			</p>
			<div class="flex gap-2">
				<Input id="key" type="password" autocomplete="off" placeholder="AIza…" bind:value={key} class="flex-1" />
				<Button type="submit" disabled={!key.trim()}>Save</Button>
			</div>
		</form>
	{:else}
		<form class="space-y-3" onsubmit={start}>
			<Input placeholder="What do you want to learn? e.g. How TCP handshakes work" bind:value={topic} aria-label="Topic" />
			<Textarea placeholder="What you already know (optional). Helps the trainer start at the right level." bind:value={level} rows={2} aria-label="What you already know" />
			<div class="flex items-center justify-between">
				<button type="button" class="text-muted-foreground hover:text-foreground text-xs underline" onclick={() => setKey("")}>Change API key</button>
				<Button type="submit" disabled={!topic.trim()}>Start learning</Button>
			</div>
		</form>
	{/if}

	{#if sessions.length}
		<section class="space-y-3">
			<h2 class="text-lg font-semibold">Your sessions</h2>
			<ul class="divide-y rounded-lg border">
				{#each sessions as s (s.id)}
					<li class="group flex items-center gap-3 px-3 py-2">
						<a href="/learn/{s.id}" class="flex-1 truncate text-sm hover:underline">{s.topic}</a>
						{#if s.reviews}<span class="text-muted-foreground text-xs">reviews scheduled</span>{/if}
						<span class="text-muted-foreground text-xs">{fmt(s.createdAt)}</span>
						<button
							class="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"
							aria-label="Delete session (keeps the note)"
							title="Delete session (keeps the note)"
							onclick={() => deleteSession(s.id)}
						>
							<X class="size-4" />
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
