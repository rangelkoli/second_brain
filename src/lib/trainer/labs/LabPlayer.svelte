<script lang="ts">
	import { onDestroy } from "svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import Play from "@lucide/svelte/icons/play";
	import Pause from "@lucide/svelte/icons/pause";
	import Volume2 from "@lucide/svelte/icons/volume-2";
	import LoaderCircle from "@lucide/svelte/icons/loader-circle";
	import Square from "@lucide/svelte/icons/square";
	import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
	import Send from "@lucide/svelte/icons/send";
	import { voice, speak, stopSpeaking } from "../voice.svelte";
	import type { Lab } from "../lab";
	import MusicLab from "./MusicLab.svelte";
	import GeometryLab from "./GeometryLab.svelte";
	import AlgorithmLab from "./AlgorithmLab.svelte";
	import PhysicsLab from "./PhysicsLab.svelte";
	import LanguageLab from "./LanguageLab.svelte";
	import ImageLab from "./ImageLab.svelte";
	import SketchLab from "./SketchLab.svelte";

	let { lab, onCheckComplete }: { lab: Lab; onCheckComplete?: (summary: string) => void } = $props();

	let stepIndex = $state(0);
	let playing = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;
	let audioErr = $state("");

	// Check state
	let predictChoice = $state<number | null>(null);
	let selectedLeft = $state<string | null>(null);
	let matched = $state<Record<string, boolean>>({});
	let wrongRight = $state<string | null>(null);
	let shuffledRights = $state<string[]>([]);
	let checkReported = $state(false);

	function clearTimer() {
		if (timer) clearTimeout(timer);
		timer = null;
	}

	function stopWalkthrough() {
		playing = false;
		clearTimer();
		if (voice.speaking === "lab" || voice.loading === "lab") stopSpeaking();
	}

	$effect(() => {
		void lab.id;
		stepIndex = 0;
		stopWalkthrough();
		audioErr = "";
		predictChoice = null;
		selectedLeft = null;
		matched = {};
		wrongRight = null;
		checkReported = false;
		if (lab.check?.kind === "match") {
			const rights = lab.check.pairs.map((p) => p.right);
			// Deterministic-ish shuffle on mount of this lab
			for (let i = rights.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[rights[i], rights[j]] = [rights[j], rights[i]];
			}
			shuffledRights = rights;
		} else {
			shuffledRights = [];
		}
	});

	onDestroy(() => {
		clearTimer();
		if (voice.speaking === "lab" || voice.loading === "lab") stopSpeaking();
	});

	const step = $derived(lab.steps[stepIndex] ?? lab.steps[0]);

	function runCurrentStepNarration() {
		clearTimer();
		if (!playing) return;
		const advance = () => {
			if (!playing) return;
			if (stepIndex < lab.steps.length - 1) {
				stepIndex += 1;
				runCurrentStepNarration();
			} else {
				playing = false;
			}
		};

		const text = `${step.title}. ${step.caption}`.trim();
		if (voice.on && text) {
			speak("lab", text, () => {
				timer = setTimeout(advance, 450);
			}).catch(() => {
				timer = setTimeout(advance, 4000);
			});
		} else {
			timer = setTimeout(advance, 4000);
		}
	}

	function togglePlay() {
		if (playing) {
			stopWalkthrough();
		} else {
			if (stepIndex >= lab.steps.length - 1) stepIndex = 0;
			playing = true;
			runCurrentStepNarration();
		}
	}

	function goToStep(next: number) {
		stopWalkthrough();
		stepIndex = Math.max(0, Math.min(lab.steps.length - 1, next));
	}

	function narrateSingleStep() {
		audioErr = "";
		if (voice.speaking === "lab" || voice.loading === "lab") return stopSpeaking();
		const text = `${step.title}. ${step.caption}`.trim();
		speak("lab", text).catch((e) => {
			audioErr = e instanceof Error ? e.message : String(e);
		});
	}

	// Match-check interaction
	function pickRight(rightVal: string) {
		if (lab.check?.kind !== "match" || !selectedLeft) return;
		const pair = lab.check.pairs.find((p) => p.left === selectedLeft);
		if (pair && pair.right === rightVal) {
			matched = { ...matched, [selectedLeft]: true };
			selectedLeft = null;
			wrongRight = null;
		} else {
			wrongRight = rightVal;
			setTimeout(() => {
				wrongRight = null;
			}, 450);
		}
	}

	const allMatched = $derived(
		lab.check?.kind === "match" && lab.check.pairs.length > 0 && lab.check.pairs.every((p) => matched[p.left]),
	);

	function reportCheck(summary: string) {
		checkReported = true;
		onCheckComplete?.(summary);
	}
</script>

<div class="space-y-4">
	<!-- Header & Transport -->
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex min-w-0 items-center gap-2">
			<h2 class="truncate text-sm font-semibold">{lab.title}</h2>
			<Badge variant="secondary" class="text-[10px] uppercase">{lab.kind}</Badge>
		</div>
		<div class="flex items-center gap-1">
			<Button size="sm" variant="outline" class="h-7 px-2" disabled={stepIndex <= 0} onclick={() => goToStep(stepIndex - 1)} aria-label="Previous step">
				<ChevronLeft class="size-3.5" />
			</Button>
			<Button size="sm" variant={playing ? "secondary" : "default"} class="h-7 px-2.5 text-xs" onclick={togglePlay}>
				{#if playing}<Pause class="size-3.5" /> Pause{:else}<Play class="size-3.5" /> Play{/if}
			</Button>
			<Button
				size="sm"
				variant="outline"
				class="h-7 px-2"
				disabled={stepIndex >= lab.steps.length - 1}
				onclick={() => goToStep(stepIndex + 1)}
				aria-label="Next step"
			>
				<ChevronRight class="size-3.5" />
			</Button>
			<span class="text-muted-foreground ml-1 text-xs tabular-nums">{stepIndex + 1}/{lab.steps.length}</span>
		</div>
	</div>

	<!-- Step Progress Segments -->
	{#if lab.steps.length > 1}
		<div class="flex gap-1">
			{#each lab.steps as st, idx}
				<button
					type="button"
					title={st.title}
					aria-label="Go to step {idx + 1}: {st.title}"
					class="h-1.5 flex-1 rounded-full transition-colors {idx === stepIndex
						? 'bg-primary'
						: idx < stepIndex
							? 'bg-primary/45'
							: 'bg-muted hover:bg-muted-foreground/30'}"
					onclick={() => goToStep(idx)}
				></button>
			{/each}
		</div>
	{/if}

	<!-- Active Step Caption -->
	<div class="bg-muted/40 flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5">
		<div class="min-w-0 space-y-0.5">
			<div class="text-xs font-semibold">{step.title}</div>
			{#if step.caption}
				<p class="text-muted-foreground text-xs leading-relaxed">{step.caption}</p>
			{/if}
			{#if audioErr}
				<p class="text-destructive text-[11px]">{audioErr}</p>
			{/if}
		</div>
		<Button
			size="sm"
			variant="ghost"
			class="h-7 shrink-0 px-2 text-xs"
			onclick={narrateSingleStep}
			title="Read this step aloud"
		>
			{#if voice.loading === "lab"}
				<LoaderCircle class="size-3.5 animate-spin" />
			{:else if voice.speaking === "lab"}
				<Square class="size-3.5" />
			{:else}
				<Volume2 class="size-3.5" />
			{/if}
			Speak
		</Button>
	</div>

	<!-- Visual Engine -->
	{#if lab.kind === "music" && lab.music}
		<MusicLab music={lab.music} {step} />
	{:else if lab.kind === "geometry" && lab.geometry}
		<GeometryLab geometry={lab.geometry} {step} />
	{:else if lab.kind === "algorithm" && lab.algorithm}
		<AlgorithmLab algorithm={lab.algorithm} steps={lab.steps} {stepIndex} />
	{:else if lab.kind === "physics" && lab.physics}
		<PhysicsLab physics={lab.physics} {step} />
	{:else if lab.kind === "language" && lab.language}
		<LanguageLab language={lab.language} {step} />
	{:else if lab.kind === "image" && lab.image}
		<ImageLab image={lab.image} {step} />
	{:else if lab.kind === "sketch" && lab.sketch}
		<SketchLab sketch={lab.sketch} {stepIndex} {step} />
	{/if}

	<!-- Interactive Check -->
	{#if lab.check?.kind === "predict"}
		{@const ck = lab.check}
		<div class="bg-card space-y-2.5 rounded-lg border p-3">
			<div class="text-xs font-semibold">Quick check: {ck.prompt}</div>
			<div class="flex flex-wrap gap-2">
				{#each ck.options as opt, oi}
					{@const picked = predictChoice === oi}
					{@const right = oi === ck.answerIndex}
					<button
						type="button"
						class="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors {predictChoice === null
							? 'hover:bg-accent'
							: right
								? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
								: picked
									? 'border-destructive bg-destructive/15 text-destructive'
									: 'opacity-55'}"
						onclick={() => (predictChoice = oi)}
					>
						{opt}
					</button>
				{/each}
			</div>
			{#if predictChoice !== null}
				<div class="flex flex-wrap items-center justify-between gap-2 text-xs">
					<span class={predictChoice === ck.answerIndex ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
						{predictChoice === ck.answerIndex ? "Correct! " : "Not quite — "}{ck.explanation}
					</span>
					{#if onCheckComplete && !checkReported}
						<Button
							size="sm"
							variant="outline"
							class="h-7 px-2.5 text-xs"
							onclick={() =>
								reportCheck(
									`In the "${lab.title}" check (${ck.prompt}), I answered "${ck.options[predictChoice!]}" (${predictChoice === ck.answerIndex ? "correct" : "missed"}).`,
								)}
						>
							<Send class="size-3" /> Send to tutor
						</Button>
					{/if}
				</div>
			{/if}
		</div>
	{:else if lab.check?.kind === "match"}
		{@const ck = lab.check}
		{@const matchedRightSet = new Set(ck.pairs.filter((p) => matched[p.left]).map((p) => p.right))}
		<div class="bg-card space-y-2.5 rounded-lg border p-3">
			<div class="flex items-center justify-between text-xs font-semibold">
				<span>Quick match: {ck.prompt}</span>
				<span class="text-muted-foreground font-normal tabular-nums">
					{Object.keys(matched).length}/{ck.pairs.length} matched
				</span>
			</div>
			<div class="grid grid-cols-2 gap-2">
				<div class="space-y-1.5">
					{#each ck.pairs as pair}
						{@const done = Boolean(matched[pair.left])}
						{@const active = selectedLeft === pair.left}
						<button
							type="button"
							disabled={done}
							class="w-full rounded-md border px-2.5 py-1.5 text-left text-xs font-medium transition-colors {done
								? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
								: active
									? 'border-primary bg-primary text-primary-foreground'
									: 'hover:bg-accent'}"
							onclick={() => (selectedLeft = active ? null : pair.left)}
						>
							{pair.left}
						</button>
					{/each}
				</div>
				<div class="space-y-1.5">
					{#each shuffledRights as rVal}
						{@const done = matchedRightSet.has(rVal)}
						{@const wrong = wrongRight === rVal}
						<button
							type="button"
							disabled={done || !selectedLeft}
							class="w-full rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors {done
								? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
								: wrong
									? 'border-destructive bg-destructive/15 text-destructive'
									: selectedLeft
										? 'hover:bg-accent border-dashed'
										: 'opacity-70'}"
							onclick={() => pickRight(rVal)}
						>
							{rVal}
						</button>
					{/each}
				</div>
			</div>
			{#if allMatched}
				<div class="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400">
					<span class="inline-flex items-center gap-1 font-medium"><CheckCircle2 class="size-3.5" /> All pairs matched!</span>
					{#if onCheckComplete && !checkReported}
						<Button
							size="sm"
							variant="outline"
							class="h-7 px-2.5 text-xs"
							onclick={() => reportCheck(`I completed the "${lab.title}" match check (${ck.pairs.length}/${ck.pairs.length} pairs matched).`)}
						>
							<Send class="size-3" /> Send to tutor
						</Button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
