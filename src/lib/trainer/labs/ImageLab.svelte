<script lang="ts">
	import { scale } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { prefersReducedMotion } from "svelte/motion";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import LoaderCircle from "@lucide/svelte/icons/loader-circle";
	import Search from "@lucide/svelte/icons/search";
	import ImageIcon from "@lucide/svelte/icons/image";
	import { searchWikimediaImage, type ImagePayload, type LabStep } from "../lab";

	let { image, step }: { image: ImagePayload; step: LabStep } = $props();

	let resolvedUrl = $state<string | undefined>(undefined);
	let credit = $state<string | undefined>(undefined);
	let loading = $state(false);
	let customQuery = $state("");
	let selectedId = $state<string | null>(null);

	async function lookup(q: string) {
		loading = true;
		try {
			const hit = await searchWikimediaImage(q);
			if (hit) {
				resolvedUrl = hit.url;
				credit = hit.credit;
			}
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		resolvedUrl = image.resolvedUrl;
		credit = image.credit;
		customQuery = image.query;
		selectedId = null;
		if (!image.resolvedUrl && image.query) {
			lookup(image.query);
		}
	});

	const activeIds = $derived(new Set(selectedId ? [selectedId] : step.annotationIds ?? []));

	// Callout outline traces itself on like a pen when it becomes active.
	function traceOn(node: SVGRectElement) {
		if (prefersReducedMotion.current) return;
		node.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 650, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "backwards" });
	}
</script>

<div class="space-y-3">
	<div class="lab-stage relative overflow-hidden">
		{#if resolvedUrl}
			<div class="relative">
				<img src={resolvedUrl} alt={image.query} class="max-h-[340px] w-full bg-muted/20 object-contain" />

				<!-- Callout overlay: boxes in % of the image, outlines in px so strokes stay crisp -->
				{#each image.annotations as ann (ann.id)}
					{@const active = activeIds.has(ann.id)}
					<div
						class="pointer-events-none absolute"
						style="left: {ann.x}%; top: {ann.y}%; width: {ann.w}%; height: {ann.h}%;"
					>
						<svg class="absolute inset-0 size-full overflow-visible">
							{#if active}
								<rect
									use:traceOn
									x="0"
									y="0"
									width="100%"
									height="100%"
									rx="6"
									pathLength="1"
									stroke-dasharray="1"
									class="fill-white/10 stroke-white"
									stroke-width="2.5"
									style="filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.5));"
								/>
							{:else}
								<rect x="0" y="0" width="100%" height="100%" rx="6" class="fill-transparent stroke-white/60" stroke-width="1" stroke-dasharray="4 3" />
							{/if}
						</svg>
						{#if active}
							<span
								class="absolute bottom-full left-0 mb-1.5 rounded-md bg-neutral-900/85 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-white shadow-sm"
								in:scale={{ start: 0.85, duration: prefersReducedMotion.current ? 0 : 300, delay: prefersReducedMotion.current ? 0 : 380, easing: cubicOut }}
							>
								{ann.label}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		{:else if loading}
			<div class="text-muted-foreground flex h-56 items-center justify-center gap-2 text-sm">
				<LoaderCircle class="size-4 animate-spin" /> Finding reference image for "{image.query}"…
			</div>
		{:else}
			<div class="text-muted-foreground flex h-48 flex-col items-center justify-center gap-2 p-4 text-center text-xs">
				<ImageIcon class="size-6 opacity-50" />
				<span>No Wikimedia photo found for "{customQuery}". Try another search term:</span>
				<form
					class="flex w-full max-w-xs gap-1.5"
					onsubmit={(e) => {
						e.preventDefault();
						lookup(customQuery);
					}}
				>
					<Input bind:value={customQuery} class="h-8 text-xs" />
					<Button type="submit" size="sm" variant="outline" class="h-8 px-2.5">
						<Search class="size-3.5" />
					</Button>
				</form>
			</div>
		{/if}
	</div>

	<!-- Annotation Pills -->
	{#if image.annotations.length}
		<div class="flex flex-wrap gap-1.5">
			{#each image.annotations as ann}
				{@const active = activeIds.has(ann.id)}
				<button
					type="button"
					class="rounded-full border px-2.5 py-1 text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.97] {active
						? 'border-primary bg-primary text-primary-foreground'
						: 'bg-card hover:bg-accent text-muted-foreground'}"
					onclick={() => (selectedId = selectedId === ann.id ? null : ann.id)}
				>
					{ann.label}
				</button>
			{/each}
		</div>
	{/if}

	{#if credit}
		<div class="text-muted-foreground truncate text-[11px]">Source: {credit}</div>
	{/if}
</div>
