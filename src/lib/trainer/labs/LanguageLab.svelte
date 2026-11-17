<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import Volume2 from "@lucide/svelte/icons/volume-2";
	import LoaderCircle from "@lucide/svelte/icons/loader-circle";
	import Square from "@lucide/svelte/icons/square";
	import Languages from "@lucide/svelte/icons/languages";
	import { voice, speak, stopSpeaking } from "../voice.svelte";
	import type { LabStep, LanguagePayload } from "../lab";

	let { language, step }: { language: LanguagePayload; step: LabStep } = $props();
	let audioErr = $state("");

	const hl = $derived(new Set((step.highlight ?? []).map((w) => w.toLowerCase())));

	function hear(key: string, text: string) {
		audioErr = "";
		if (voice.speaking === key || voice.loading === key) return stopSpeaking();
		speak(key, text).catch((e) => {
			audioErr = e instanceof Error ? e.message : String(e);
		});
	}
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<span class="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-medium">
			<Languages class="size-3.5" /> {language.languageName} Pronunciation & Stress
		</span>
		{#if audioErr}
			<span class="text-destructive text-xs">{audioErr}</span>
		{/if}
	</div>

	<div class="grid gap-2.5 sm:grid-cols-2">
		{#each language.items as item, idx}
			{@const active = hl.has(item.word.toLowerCase())}
			{@const key = `lang-word-${idx}`}
			<div
				class="bg-card flex flex-col justify-between gap-2 rounded-lg border p-3 transition-all {active
					? 'border-primary ring-primary/30 ring-2'
					: hl.size
						? 'opacity-70'
						: ''}"
			>
				<div class="flex items-start justify-between gap-2">
					<div>
						<div class="text-base font-bold tracking-tight">{item.word}</div>
						<div class="text-primary text-xs font-mono">{item.pronunciation}</div>
					</div>
					<Button
						size="sm"
						variant={voice.speaking === key ? "secondary" : "outline"}
						class="h-7 shrink-0 px-2 text-xs"
						onclick={() => hear(key, item.word)}
						title="Listen to pronunciation"
					>
						{#if voice.loading === key}
							<LoaderCircle class="size-3.5 animate-spin" />
						{:else if voice.speaking === key}
							<Square class="size-3.5" />
						{:else}
							<Volume2 class="size-3.5" />
						{/if}
						Hear
					</Button>
				</div>

				<div class="text-sm font-medium">{item.meaning}</div>

				{#if item.tip}
					<p class="text-muted-foreground text-xs">{item.tip}</p>
				{/if}

				{#if item.example}
					{@const exKey = `lang-ex-${idx}`}
					<div class="bg-muted/40 mt-1 flex items-center justify-between gap-2 rounded px-2.5 py-1.5 text-xs">
						<div class="min-w-0">
							<div class="font-medium">{item.example}</div>
							{#if item.exampleTranslation}
								<div class="text-muted-foreground">{item.exampleTranslation}</div>
							{/if}
						</div>
						<button
							type="button"
							class="text-muted-foreground hover:text-foreground shrink-0 p-1"
							onclick={() => hear(exKey, item.example!)}
							aria-label="Hear example"
						>
							{#if voice.loading === exKey}
								<LoaderCircle class="size-3.5 animate-spin" />
							{:else if voice.speaking === exKey}
								<Square class="size-3.5" />
							{:else}
								<Volume2 class="size-3.5" />
							{/if}
						</button>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>
