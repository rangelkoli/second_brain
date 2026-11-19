<script lang="ts">
	// Notes → cards with a RemNote-style preview: every suggested card starts checked; uncheck the ones to drop, then save.
	import { Button } from "$lib/components/ui/button/index.js";
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import Layers from "@lucide/svelte/icons/layers";
	import LoaderCircle from "@lucide/svelte/icons/loader-circle";
	import { generateCards, saveCards, type CardDraft } from "./trainer.svelte";

	let { title, content, notePath, sid = "" }: { title: string; content: string; notePath: string; sid?: string } = $props();

	let drafts = $state<(CardDraft & { keep: boolean })[]>([]);
	let busy = $state<"" | "making" | "saving">("");
	let err = $state("");
	let saved = $state(0);
	const kept = $derived(drafts.filter((d) => d.keep));

	async function make() {
		busy = "making";
		err = "";
		saved = 0;
		try {
			drafts = (await generateCards(title, content)).map((d) => ({ ...d, keep: true }));
			if (!drafts.length) err = "No cards came back for this note. Add a bit more content and try again.";
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = "";
		}
	}

	async function save() {
		busy = "saving";
		err = "";
		try {
			await saveCards($state.snapshot(kept), notePath, sid);
			saved = kept.length;
			drafts = [];
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = "";
		}
	}
</script>

<div class="space-y-2">
	<div class="flex flex-wrap items-center gap-2">
		<Button size="sm" variant="outline" disabled={Boolean(busy) || !content.trim()} onclick={make} title="Suggest flashcards from this note to review with spaced repetition">
			{#if busy === "making"}<LoaderCircle class="animate-spin" /> Making cards…{:else}<Layers /> Make cards{/if}
		</Button>
		{#if saved}<span class="text-muted-foreground text-xs" role="status">Saved {saved} card{saved === 1 ? "" : "s"}. <a class="underline" href="/learn/review">Review now</a></span>{/if}
		{#if err}<span class="text-destructive text-xs" role="alert">{err}</span>{/if}
	</div>

	{#if drafts.length}
		<section class="rounded-lg border" aria-label="Suggested cards">
			<header class="flex items-center gap-2 border-b px-3 py-2">
				<h2 class="flex-1 text-sm font-semibold">Suggested cards <span class="text-muted-foreground font-normal">· uncheck any you don't want</span></h2>
				<Button size="sm" variant="ghost" disabled={busy === "saving"} onclick={() => (drafts = [])}>Cancel</Button>
				<Button size="sm" disabled={busy === "saving" || !kept.length} onclick={save}>
					{#if busy === "saving"}<LoaderCircle class="animate-spin" />{/if} Save {kept.length} card{kept.length === 1 ? "" : "s"}
				</Button>
			</header>
			<ul class="divide-y">
				{#each drafts as d, i (i)}
					<li class="flex gap-3 px-3 py-2.5 {d.keep ? '' : 'opacity-50'}">
						<Checkbox id="card-{i}" bind:checked={d.keep} class="mt-0.5" aria-label="Keep card {i + 1}" />
						<label for="card-{i}" class="min-w-0 flex-1 cursor-pointer space-y-1">
							<span class="flex flex-wrap items-center gap-1.5">
								<Badge variant="secondary" class="text-[10px] capitalize">{d.kind}</Badge>
								{#if d.heading}<span class="text-muted-foreground truncate text-xs">§ {d.heading}</span>{/if}
							</span>
							<span class="block text-sm font-medium">{d.front}</span>
							<span class="text-muted-foreground block text-xs">{d.keyPoints.join(" · ")}</span>
						</label>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
