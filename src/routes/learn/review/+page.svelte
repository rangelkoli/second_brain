<script lang="ts">
	// Spaced review: due cards one at a time. Answer from memory → checklist grader → 1-4 confidence → reveal → FSRS schedule.
	import { tick } from "svelte";
	import { goto } from "$app/navigation";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Textarea } from "$lib/components/ui/textarea/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import ArrowRight from "@lucide/svelte/icons/arrow-right";
	import BookOpen from "@lucide/svelte/icons/book-open";
	import Check from "@lucide/svelte/icons/check";
	import X from "@lucide/svelte/icons/x";
	import LoaderCircle from "@lucide/svelte/icons/loader-circle";
	import { auth } from "$lib/sync.svelte";
	import { noteByPath } from "$lib/store.svelte";
	import { effectiveVerdict, type Verdict } from "$lib/trainer/lab";
	import { dueCards, grade, reviewCard, synced, type CardRec } from "$lib/trainer/trainer.svelte";

	let cards = $state<CardRec[]>([]);
	let i = $state(0);
	let loading = $state(true);
	let loadErr = $state("");
	let reviewed = $state(0);

	let answer = $state("");
	let phase = $state<"ask" | "grading" | "revealed">("ask");
	let confidence = $state<number | undefined>(undefined);
	let asked = $state(false); // confidence prompt answered (or skipped)
	let result = $state<{ covered: string[]; missed: string[]; verdict: Verdict; override: boolean } | null>(null);
	let hint = $state("");
	let err = $state("");
	let saving = $state(false);
	let input = $state<HTMLTextAreaElement | null>(null);
	let nextBtn = $state<HTMLButtonElement | null>(null);

	const card = $derived(cards[i]);
	const keyPoints = $derived(card ? card.back.split("\n").filter(Boolean) : []);
	const CONFIDENCE = ["Guessing", "Unsure", "Fairly sure", "Certain"];
	const VERDICT = {
		correct: { label: "Correct", cls: "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" },
		partial: { label: "Partly right", cls: "border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
		wrong: { label: "Not quite", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
	};

	// Load once signed in and the session list (for goal dates) has synced.
	$effect(() => {
		if (!auth.valid || !synced.pulled) return;
		loading = true;
		dueCards()
			.then((c) => (cards = c))
			.catch((e) => (loadErr = e instanceof Error ? e.message : String(e)))
			.finally(() => {
				loading = false;
				tick().then(() => input?.focus());
			});
	});

	let graded: Promise<void> | null = null;
	async function submit(e?: Event) {
		e?.preventDefault();
		if (!card || phase !== "ask") return;
		const text = answer.trim();
		hint = "";
		err = "";
		phase = "grading";
		asked = false;
		confidence = undefined;
		graded = (async () => {
			if (!text) {
				result = { covered: [], missed: keyPoints, verdict: "wrong", override: false };
				return;
			}
			const g = await grade(card.front, keyPoints, text);
			if (!g.attempted) {
				hint = "That doesn't look like an answer. Give it a try from memory, or leave it blank and press “I don't know”.";
				phase = "ask";
				return;
			}
			result = { covered: g.covered, missed: g.missed, verdict: g.verdict, override: false };
		})().catch((e) => {
			err = e instanceof Error ? e.message : String(e);
			phase = "ask";
		});
		if (!text) asked = true; // nothing to be sure about
		await graded;
		if (phase === "grading" && asked) reveal();
	}

	async function setConfidence(c: number | undefined) {
		confidence = c;
		asked = true;
		await graded;
		if (phase === "grading" && result) reveal();
	}

	function reveal() {
		phase = "revealed";
		tick().then(() => nextBtn?.focus());
	}

	async function next() {
		if (!card || !result || saving) return;
		saving = true;
		err = "";
		try {
			await reviewCard(card, { answer: answer.trim(), ...result, confidence });
			reviewed++;
			i++;
			answer = "";
			result = null;
			phase = "ask";
			tick().then(() => input?.focus());
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	// "Explain" schedules this card, then opens the passage it came from (scrolled to its heading when there is one).
	// Same tab: note ids only live for the page load.
	async function explain(href: string) {
		await next();
		if (!err) goto(href);
	}
	const explainHref = (c: CardRec) => {
		const n = noteByPath(c.source_note_path);
		return n ? `/notes/${n.id}${c.source_heading ? `?h=${encodeURIComponent(c.source_heading)}` : ""}` : c.sid ? `/learn/${c.sid}` : "";
	};
</script>

<div class="mx-auto max-w-2xl space-y-6 pt-6 pb-24">
	<div class="flex items-center gap-3">
		<a href="/learn" class="text-muted-foreground hover:text-foreground" aria-label="Back to the trainer"><ArrowLeft class="size-5" /></a>
		<h1 class="flex-1 text-2xl font-bold tracking-tight">Review</h1>
		{#if !loading && cards.length}
			<span class="text-muted-foreground text-sm tabular-nums" aria-live="polite">{Math.min(i + 1, cards.length)} of {cards.length} due</span>
		{/if}
	</div>

	{#if !auth.valid}
		<p class="rounded-lg border p-4 text-sm"><a class="underline" href="/login">Sign in to the sync server</a> to review your cards.</p>
	{:else if loading}
		<p class="text-muted-foreground flex items-center gap-2 text-sm"><LoaderCircle class="size-4 animate-spin" /> Loading due cards…</p>
	{:else if loadErr}
		<p class="text-destructive text-sm" role="alert">{loadErr}</p>
	{:else if !card}
		<div class="rounded-xl border p-8 text-center">
			<p class="font-medium">{reviewed ? `Done: ${reviewed} card${reviewed === 1 ? "" : "s"} reviewed.` : "Nothing due right now."}</p>
			<p class="text-muted-foreground mt-1 text-sm">Cards come back when they're about to slip. New ones come from your answers and from “Make cards” on a note.</p>
			<Button class="mt-4" variant="outline" href="/learn">Back to the trainer</Button>
		</div>
	{:else}
		{#key card.id}
			<article class="space-y-4 rounded-xl border p-5" aria-labelledby="card-front">
				<div class="flex flex-wrap items-center gap-2">
					<Badge variant="secondary" class="text-[10px] capitalize">{card.kind}</Badge>
					{#if card.source_heading}<span class="text-muted-foreground truncate text-xs">§ {card.source_heading}</span>{/if}
				</div>
				<h2 id="card-front" class="text-lg leading-snug font-medium">{card.front}</h2>

				{#if phase !== "revealed"}
					<form class="space-y-2" onsubmit={submit}>
						<Textarea
							bind:ref={input}
							bind:value={answer}
							rows={3}
							placeholder="Answer from memory…"
							aria-label="Your answer"
							disabled={phase === "grading"}
							onkeydown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), answer.trim() && submit())}
						/>
						{#if hint}<p class="text-muted-foreground text-xs" role="status">{hint}</p>{/if}
						{#if phase === "grading" && !asked}
							<div class="flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label="How sure are you?">
								<span class="text-muted-foreground">How sure are you?</span>
								{#each CONFIDENCE as label, c (c)}
									<Button size="sm" variant="outline" class="h-7 px-2 text-xs" onclick={() => setConfidence(c + 1)}>{c + 1} · {label}</Button>
								{/each}
								<Button size="sm" variant="ghost" class="h-7 px-2 text-xs" onclick={() => setConfidence(undefined)}>Skip</Button>
							</div>
						{:else if phase === "grading"}
							<p class="text-muted-foreground flex items-center gap-2 text-xs"><LoaderCircle class="size-3.5 animate-spin" /> Checking your answer…</p>
						{:else}
							<div class="flex justify-end gap-2">
								<Button type="button" variant="ghost" onclick={() => ((answer = ""), submit())}>I don't know</Button>
								<Button type="submit" disabled={!answer.trim()}>Check</Button>
							</div>
						{/if}
					</form>
				{:else if result}
					{@const v = effectiveVerdict(result)}
					{#if answer.trim()}<p class="bg-muted rounded-lg px-3 py-2 text-sm whitespace-pre-wrap">{answer}</p>{/if}
					<div class="flex flex-wrap items-center gap-2 text-xs">
						<span class="rounded-full border px-2.5 py-0.5 font-medium {VERDICT[v].cls}">{VERDICT[v].label}{result.override ? " (your call)" : ""}</span>
						{#if answer.trim()}
							<button class="text-muted-foreground hover:text-foreground underline" onclick={() => result && (result.override = !result.override)}>
								{result.override ? "Undo" : result.verdict === "correct" ? "I was wrong" : "I was right"}
							</button>
						{/if}
					</div>
					<div>
						<h3 class="text-muted-foreground mb-1.5 text-xs font-medium">A full answer covers</h3>
						<ul class="space-y-1 text-sm">
							{#each keyPoints as k (k)}
								{@const hit = result.covered.includes(k)}
								<li class="flex gap-2">
									{#if hit}<Check class="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="covered" />{:else}<X class="text-muted-foreground mt-0.5 size-4 shrink-0" aria-label="missed" />{/if}
									<span>{k}</span>
								</li>
							{/each}
						</ul>
					</div>
					<div class="flex flex-wrap items-center gap-2 pt-1">
						{#if v !== "correct" && explainHref(card)}
							<Button variant="outline" size="sm" disabled={saving} onclick={() => explain(explainHref(card))} title="Open the note this card came from (counts this review first)">
								<BookOpen /> Explain
							</Button>
						{/if}
						<Button bind:ref={nextBtn} class="ml-auto" disabled={saving} onclick={next}>
							{#if saving}<LoaderCircle class="animate-spin" />{/if} Next <ArrowRight />
						</Button>
					</div>
				{/if}
				{#if err}<p class="text-destructive text-sm" role="alert">{err}</p>{/if}
			</article>
		{/key}
	{/if}
</div>
