<script lang="ts">
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
</script>

<div class="space-y-3">
	<div class="bg-card relative overflow-hidden rounded-lg border">
		{#if resolvedUrl}
			<div class="relative">
				<img src={resolvedUrl} alt={image.query} class="max-h-[340px] w-full bg-muted/20 object-contain" />

				<!-- SVG Callout Overlay -->
				{#if image.annotations.length}
					<svg viewBox="0 0 100 100" preserveAspectRatio="none" class="pointer-events-none absolute inset-0 h-full w-full">
						{#each image.annotations as ann}
							{@const active = activeIds.has(ann.id)}
							<rect
								x={ann.x}
								y={ann.y}
								width={ann.w}
								height={ann.h}
								rx="1.5"
								class="transition-all duration-300 {active ? 'fill-primary/15 stroke-primary' : 'fill-transparent stroke-white/50'}"
								stroke-width={active ? 1.2 : 0.6}
								stroke-dasharray={active ? undefined : "2 1.5"}
							/>
						{/each}
					</svg>
				{/if}
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
					class="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors {active
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
