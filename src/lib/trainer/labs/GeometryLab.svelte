<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
	import type { GeometryPayload, LabStep } from "../lab";

	let { geometry, step }: { geometry: GeometryPayload; step: LabStep } = $props();

	let a = $state(3);
	let b = $state(4);

	$effect(() => {
		a = geometry.a;
		b = geometry.b;
	});

	const c = $derived(Math.hypot(a, b));
	const a2 = $derived(Math.round(a * a * 100) / 100);
	const b2 = $derived(Math.round(b * b * 100) / 100);
	const c2 = $derived(Math.round((a * a + b * b) * 100) / 100);
	const cFmt = $derived(Number.isInteger(c) ? String(c) : c.toFixed(2));

	const hl = $derived(new Set(step.highlight ?? []));
	const hasHl = $derived(hl.size > 0);
	const isHl = (key: string) => !hasHl || hl.has(key);

	// Fit triangle + optional area squares cleanly inside a 460x340 SVG viewBox.
	const layout = $derived.by(() => {
		const showSq = geometry.showSquares !== false;
		const pad = 28;
		const W = 460;
		const H = 340;
		// Triangle bounding box including squares extends:
		// left by a (for a²), bottom by b (for b²), up-right by ~a+b (for rotated c²).
		const unitSpan = showSq ? a + b + Math.max(a, b) * 0.85 : Math.max(a, b) * 1.3;
		const scale = Math.min((W - pad * 2) / Math.max(unitSpan, 1), (H - pad * 2) / Math.max(unitSpan, 1));
		// Origin P0 = right-angle vertex (bottom-left of triangle)
		const ox = showSq ? pad + a * scale + (W - pad * 2 - (a + b + Math.max(a, b) * 0.55) * scale) * 0.35 : 130;
		const oy = showSq ? H - pad - b * scale - 10 : H - 55;
		const p0 = { x: ox, y: oy }; // right angle
		const pA = { x: ox, y: oy - a * scale }; // top vertex
		const pB = { x: ox + b * scale, y: oy }; // right vertex

		// Outward square on hypotenuse pA -> pB:
		// Vector pA->pB = (dx, dy) = (b*scale, a*scale). Outward normal pointing up-right = (dy, -dx) = (a*scale, -b*scale).
		const dx = pB.x - pA.x;
		const dy = pB.y - pA.y;
		const nx = dy;
		const ny = -dx;
		const pC1 = { x: pA.x + nx, y: pA.y + ny };
		const pC2 = { x: pB.x + nx, y: pB.y + ny };
		const cMid = { x: (pA.x + pB.x + pC1.x + pC2.x) / 4, y: (pA.y + pB.y + pC1.y + pC2.y) / 4 };

		return { scale, p0, pA, pB, pC1, pC2, cMid, showSq };
	});
</script>

<div class="space-y-4">
	<!-- Controls -->
	<div class="bg-muted/40 flex flex-wrap items-center gap-4 rounded-lg border px-3 py-2 text-xs">
		<label class="flex items-center gap-2">
			<span class="font-medium text-blue-600 dark:text-blue-400">a = {a}</span>
			<input type="range" min="1" max="10" step="0.5" bind:value={a} class="w-24 accent-blue-500" />
		</label>
		<label class="flex items-center gap-2">
			<span class="font-medium text-emerald-600 dark:text-emerald-400">b = {b}</span>
			<input type="range" min="1" max="10" step="0.5" bind:value={b} class="w-24 accent-emerald-500" />
		</label>
		<span class="font-semibold text-amber-600 dark:text-amber-400">c = {cFmt}</span>
		{#if a !== geometry.a || b !== geometry.b}
			<Button
				size="sm"
				variant="ghost"
				class="ml-auto h-7 px-2 text-xs"
				onclick={() => {
					a = geometry.a;
					b = geometry.b;
				}}
			>
				<RotateCcw class="size-3" /> Reset
			</Button>
		{/if}
	</div>

	<!-- SVG Diagram -->
	<div class="bg-card overflow-hidden rounded-lg border p-2">
		<svg viewBox="0 0 460 340" class="mx-auto w-full max-w-[480px]" aria-label="Geometry diagram">
			<!-- Area Squares -->
			{#if layout.showSq}
				<!-- Square on side a (left) -->
				<g class="transition-opacity duration-300" opacity={isHl("squares") || isHl("legs") ? 1 : 0.25}>
					<rect
						x={layout.p0.x - a * layout.scale}
						y={layout.pA.y}
						width={a * layout.scale}
						height={a * layout.scale}
						class="fill-blue-500/15 stroke-blue-500/70"
						stroke-width="1.5"
					/>
					<text
						x={layout.p0.x - (a * layout.scale) / 2}
						y={layout.pA.y + (a * layout.scale) / 2 + 4}
						text-anchor="middle"
						class="fill-blue-600 text-[11px] font-semibold dark:fill-blue-400"
					>
						a² = {a2}
					</text>
				</g>

				<!-- Square on side b (bottom) -->
				<g class="transition-opacity duration-300" opacity={isHl("squares") || isHl("legs") ? 1 : 0.25}>
					<rect
						x={layout.p0.x}
						y={layout.p0.y}
						width={b * layout.scale}
						height={b * layout.scale}
						class="fill-emerald-500/15 stroke-emerald-500/70"
						stroke-width="1.5"
					/>
					<text
						x={layout.p0.x + (b * layout.scale) / 2}
						y={layout.p0.y + (b * layout.scale) / 2 + 4}
						text-anchor="middle"
						class="fill-emerald-600 text-[11px] font-semibold dark:fill-emerald-400"
					>
						b² = {b2}
					</text>
				</g>

				<!-- Square on hypotenuse c -->
				<g class="transition-opacity duration-300" opacity={isHl("squares") || isHl("hypotenuse") ? 1 : 0.25}>
					<polygon
						points="{layout.pA.x},{layout.pA.y} {layout.pB.x},{layout.pB.y} {layout.pC2.x},{layout.pC2.y} {layout.pC1.x},{layout.pC1.y}"
						class="fill-amber-500/15 stroke-amber-500/80"
						stroke-width="1.5"
					/>
					<text
						x={layout.cMid.x}
						y={layout.cMid.y + 4}
						text-anchor="middle"
						class="fill-amber-600 text-[11px] font-semibold dark:fill-amber-400"
					>
						c² = {c2}
					</text>
				</g>
			{/if}

			<!-- Right Triangle fill -->
			<polygon
				points="{layout.p0.x},{layout.p0.y} {layout.pA.x},{layout.pA.y} {layout.pB.x},{layout.pB.y}"
				class="fill-muted/50"
			/>

			<!-- Right-angle marker -->
			{#if geometry.shape === "pythagorean"}
				{@const m = Math.min(14, a * layout.scale * 0.35, b * layout.scale * 0.35)}
				<polyline
					points="{layout.p0.x},{layout.p0.y - m} {layout.p0.x + m},{layout.p0.y - m} {layout.p0.x + m},{layout.p0.y}"
					class="fill-none stroke-foreground transition-opacity duration-300"
					stroke-width={hl.has("right-angle") ? 2.8 : 1.5}
					opacity={isHl("right-angle") ? 1 : 0.45}
				/>
			{/if}

			<!-- Side a -->
			<line
				x1={layout.p0.x}
				y1={layout.p0.y}
				x2={layout.pA.x}
				y2={layout.pA.y}
				class="stroke-blue-600 transition-all duration-300 dark:stroke-blue-400"
				stroke-width={hl.has("legs") ? 3.8 : 2.4}
				opacity={isHl("legs") ? 1 : 0.45}
			/>
			<text
				x={layout.p0.x + 12}
				y={(layout.p0.y + layout.pA.y) / 2 + 4}
				class="fill-blue-600 text-xs font-semibold dark:fill-blue-400"
			>
				{geometry.labels?.a && a === geometry.a ? geometry.labels.a : `a = ${a}`}
			</text>

			<!-- Side b -->
			<line
				x1={layout.p0.x}
				y1={layout.p0.y}
				x2={layout.pB.x}
				y2={layout.pB.y}
				class="stroke-emerald-600 transition-all duration-300 dark:stroke-emerald-400"
				stroke-width={hl.has("legs") ? 3.8 : 2.4}
				opacity={isHl("legs") ? 1 : 0.45}
			/>
			<text
				x={(layout.p0.x + layout.pB.x) / 2}
				y={layout.p0.y - 8}
				text-anchor="middle"
				class="fill-emerald-600 text-xs font-semibold dark:fill-emerald-400"
			>
				{geometry.labels?.b && b === geometry.b ? geometry.labels.b : `b = ${b}`}
			</text>

			<!-- Hypotenuse c -->
			<line
				x1={layout.pA.x}
				y1={layout.pA.y}
				x2={layout.pB.x}
				y2={layout.pB.y}
				class="stroke-amber-600 transition-all duration-300 dark:stroke-amber-400"
				stroke-width={hl.has("hypotenuse") ? 4 : 2.5}
				opacity={isHl("hypotenuse") ? 1 : 0.45}
			/>
			<text
				x={(layout.pA.x + layout.pB.x) / 2 + 12}
				y={(layout.pA.y + layout.pB.y) / 2 - 4}
				class="fill-amber-600 text-xs font-semibold dark:fill-amber-400"
			>
				{geometry.labels?.c && a === geometry.a && b === geometry.b ? geometry.labels.c : `c = ${cFmt}`}
			</text>
		</svg>
	</div>

	<!-- Live Equation Readout -->
	<div
		class="bg-card flex flex-wrap items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all {hl.has('equation')
			? 'ring-primary/50 ring-2'
			: ''}"
	>
		<span class="text-blue-600 dark:text-blue-400">{a}² ({a2})</span>
		<span class="text-muted-foreground">+</span>
		<span class="text-emerald-600 dark:text-emerald-400">{b}² ({b2})</span>
		<span class="text-muted-foreground">=</span>
		<span class="text-amber-600 dark:text-amber-400">{cFmt}² ({c2})</span>
	</div>
</div>
