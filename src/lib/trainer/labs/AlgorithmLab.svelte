<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import Shuffle from "@lucide/svelte/icons/shuffle";
	import Code2 from "@lucide/svelte/icons/code-2";
	import type { AlgorithmPayload, LabStep } from "../lab";

	let {
		algorithm,
		steps,
		stepIndex,
	}: {
		algorithm: AlgorithmPayload;
		steps: LabStep[];
		stepIndex: number;
	} = $props();

	type Preset = "demo" | "sorted" | "reversed" | "random";
	let preset = $state<Preset>("demo");
	let localSteps = $state<LabStep[]>([]);
	let localIdx = $state(0);

	$effect(() => {
		void algorithm;
		preset = "demo";
		localSteps = [];
		localIdx = 0;
	});

	function buildBubbleSteps(arr: number[]): LabStep[] {
		const a = [...arr];
		const out: LabStep[] = [{ title: "Start", caption: `Starting array: [${a.join(", ")}]`, array: [...a] }];
		const n = a.length;
		for (let i = 0; i < n - 1; i++) {
			let swappedAny = false;
			for (let j = 0; j < n - 1 - i; j++) {
				const swap = a[j] > a[j + 1];
				if (swap) {
					[a[j], a[j + 1]] = [a[j + 1], a[j]];
					swappedAny = true;
				}
				out.push({
					title: swap ? `Swap ${a[j + 1]} & ${a[j]}` : `Compare ${a[j]} & ${a[j + 1]}`,
					caption: swap ? `Swapped out-of-order pair.` : `Already in order.`,
					array: [...a],
					comparing: [j, j + 1],
					swapped: swap,
					sortedFrom: n - i,
				});
			}
			if (!swappedAny) break;
		}
		out.push({ title: "Done", caption: `Sorted: [${a.join(", ")}]`, array: [...a], sortedFrom: 0 });
		return out;
	}

	function selectPreset(p: Preset) {
		preset = p;
		if (p === "demo") {
			localSteps = [];
			localIdx = 0;
			return;
		}
		const base = [...algorithm.initialArray];
		const arr =
			p === "sorted"
				? [...base].sort((x, y) => x - y)
				: p === "reversed"
					? [...base].sort((x, y) => y - x)
					: [...base].sort(() => Math.random() - 0.5);
		localSteps = buildBubbleSteps(arr);
		localIdx = 0;
	}

	const activeSteps = $derived(preset === "demo" ? steps : localSteps);
	const activeIdx = $derived(preset === "demo" ? stepIndex : Math.min(localIdx, Math.max(0, localSteps.length - 1)));
	const currentStep = $derived(activeSteps[activeIdx] ?? { title: "Array", caption: "", array: algorithm.initialArray });
	const currentArray = $derived(currentStep.array ?? algorithm.initialArray);
	const maxVal = $derived(Math.max(1, ...currentArray.map((n) => Math.abs(n))));

	const stats = $derived.by(() => {
		let comparisons = 0;
		let swaps = 0;
		for (let i = 0; i <= activeIdx && i < activeSteps.length; i++) {
			if (activeSteps[i].comparing) comparisons++;
			if (activeSteps[i].swapped) swaps++;
		}
		return { comparisons, swaps };
	});

	const codeLines = $derived(algorithm.code ? algorithm.code.split("\n") : []);
</script>

<div class="space-y-4">
	<!-- Preset Switcher -->
	<div class="bg-muted/40 flex flex-wrap items-center gap-1.5 rounded-lg border px-3 py-2">
		<span class="text-muted-foreground mr-1 text-xs font-medium">Input:</span>
		<Button size="sm" variant={preset === "demo" ? "secondary" : "ghost"} class="h-7 px-2.5 text-xs" onclick={() => selectPreset("demo")}>
			Lesson demo
		</Button>
		<Button size="sm" variant={preset === "sorted" ? "secondary" : "ghost"} class="h-7 px-2.5 text-xs" onclick={() => selectPreset("sorted")}>
			Already sorted
		</Button>
		<Button size="sm" variant={preset === "reversed" ? "secondary" : "ghost"} class="h-7 px-2.5 text-xs" onclick={() => selectPreset("reversed")}>
			Reversed
		</Button>
		<Button size="sm" variant={preset === "random" ? "secondary" : "ghost"} class="h-7 px-2.5 text-xs" onclick={() => selectPreset("random")}>
			<Shuffle class="size-3" /> Random
		</Button>

		{#if preset !== "demo"}
			<div class="ml-auto flex items-center gap-1">
				<Button size="sm" variant="outline" class="h-7 px-2" disabled={localIdx <= 0} onclick={() => (localIdx = Math.max(0, localIdx - 1))}>
					<ChevronLeft class="size-3.5" />
				</Button>
				<span class="text-muted-foreground px-1 text-xs tabular-nums">{activeIdx + 1}/{activeSteps.length}</span>
				<Button
					size="sm"
					variant="outline"
					class="h-7 px-2"
					disabled={localIdx >= activeSteps.length - 1}
					onclick={() => (localIdx = Math.min(activeSteps.length - 1, localIdx + 1))}
				>
					<ChevronRight class="size-3.5" />
				</Button>
			</div>
		{/if}
	</div>

	<!-- Bars Visualizer -->
	<div class="bg-card rounded-lg border p-4">
		<div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
			<span class="font-medium">{algorithm.name}</span>
			<div class="flex items-center gap-3 tabular-nums">
				<span class="text-muted-foreground">Comparisons: <strong class="text-foreground">{stats.comparisons}</strong></span>
				<span class="text-muted-foreground">Swaps: <strong class="text-foreground">{stats.swaps}</strong></span>
			</div>
		</div>

		<div class="flex h-44 items-end justify-center gap-2 border-b pb-2">
			{#each currentArray as val, idx}
				{@const isComparing = currentStep.comparing && (currentStep.comparing[0] === idx || currentStep.comparing[1] === idx)}
				{@const isSorted = typeof currentStep.sortedFrom === "number" && idx >= currentStep.sortedFrom}
				{@const heightPct = Math.max(14, (Math.abs(val) / maxVal) * 100)}
				<div class="flex h-full flex-1 max-w-14 flex-col items-center justify-end gap-1">
					<span class="text-xs font-semibold tabular-nums">{val}</span>
					<div
						style="height: {heightPct}%;"
						class="w-full rounded-t-md transition-all duration-300 {isComparing
							? currentStep.swapped
								? 'bg-amber-500 ring-2 ring-amber-400/60'
								: 'bg-primary ring-2 ring-primary/40'
							: isSorted
								? 'bg-emerald-500/85'
								: 'bg-muted-foreground/35'}"
					></div>
					<span class="text-muted-foreground text-[10px] tabular-nums">[{idx}]</span>
				</div>
			{/each}
		</div>

		<div class="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-[11px]">
			<span class="inline-flex items-center gap-1"><span class="bg-primary inline-block size-2.5 rounded-xs"></span> Comparing</span>
			<span class="inline-flex items-center gap-1"><span class="inline-block size-2.5 rounded-xs bg-amber-500"></span> Swapped</span>
			<span class="inline-flex items-center gap-1"><span class="inline-block size-2.5 rounded-xs bg-emerald-500/85"></span> Sorted</span>
		</div>
	</div>

	<!-- Code Panel with active line highlight -->
	{#if codeLines.length}
		<div class="bg-card overflow-hidden rounded-lg border">
			<div class="text-muted-foreground flex items-center gap-1.5 border-b px-3 py-1.5 text-xs font-medium">
				<Code2 class="size-3.5" /> {algorithm.language ?? "code"}
			</div>
			<pre class="overflow-x-auto p-3 font-mono text-xs leading-5">{#each codeLines as line, li}{@const lineNo = li + 1}{@const active = preset === "demo" && currentStep.codeLine === lineNo}<div class="flex gap-3 rounded px-1.5 {active ? 'bg-primary/15 text-foreground font-semibold' : 'text-muted-foreground'}"><span class="w-5 shrink-0 select-none text-right opacity-50">{lineNo}</span><span class="whitespace-pre">{line}</span></div>{/each}</pre>
		</div>
	{/if}
</div>
