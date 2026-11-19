<script lang="ts">
	import { goto } from "$app/navigation";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Textarea } from "$lib/components/ui/textarea/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import GraduationCap from "@lucide/svelte/icons/graduation-cap";
	import Sparkles from "@lucide/svelte/icons/sparkles";
	import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
	import Circle from "@lucide/svelte/icons/circle";
	import LoaderCircle from "@lucide/svelte/icons/loader-circle";
	import ArrowRight from "@lucide/svelte/icons/arrow-right";
	import X from "@lucide/svelte/icons/x";
	import {
		allCurricula,
		completedNodes,
		deleteCustomCurriculum,
		deleteSession,
		errors,
		generateCurriculum,
		pending,
		sessionForNode,
		sessions,
		startSession,
		toggleNodeCompleted,
	} from "$lib/trainer/trainer.svelte";
	import { auth } from "$lib/sync.svelte";
	import type { CurriculumNode, CurriculumSubject } from "$lib/trainer/curriculum";

	let topic = $state("");
	let level = $state("");
	let selectedSubjectId = $state("math");
	let pathGoal = $state("");
	let generatingPath = $state(false);
	let pathError = $state("");

	const subjects = $derived(allCurricula());
	const activeSubject = $derived(subjects.find((s) => s.id === selectedSubjectId) ?? subjects[0]);

	function subjectStats(subj: CurriculumSubject) {
		const nodes = subj.branches.flatMap((b) => b.nodes);
		const done = nodes.filter((n) => completedNodes[n.id]).length;
		return { done, total: nodes.length };
	}

	function start(e: Event) {
		e.preventDefault();
		if (topic.trim()) goto(`/learn/${startSession(topic.trim(), level)}`);
	}

	function openNode(node: CurriculumNode) {
		const existing = sessionForNode(node.id);
		if (existing) return goto(`/learn/${existing.id}`);
		goto(`/learn/${startSession(node.prompt, "", { curriculumNodeId: node.id })}`);
	}

	async function buildPath(e: Event) {
		e.preventDefault();
		if (!pathGoal.trim() || generatingPath) return;
		generatingPath = true;
		pathError = "";
		try {
			const created = await generateCurriculum(pathGoal.trim());
			selectedSubjectId = created.id;
			pathGoal = "";
		} catch (err) {
			pathError = err instanceof Error ? err.message : String(err);
		} finally {
			generatingPath = false;
		}
	}

	const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
</script>

<div class="mx-auto max-w-3xl space-y-10 pt-6 pb-24">
	<div>
		<h1 class="flex items-center gap-2 text-3xl font-bold tracking-tight"><GraduationCap class="size-7" /> Trainer</h1>
		<p class="text-muted-foreground mt-1">
			Learn any topic through interactive visuals, audio instruments, and short retrieval checks. Write notes in your own words
			and sketch on the whiteboard—the trainer reads both and tells you what to fix.
		</p>
	</div>

	{#if !auth.valid}
		<p class="rounded-lg border p-4 text-sm">
			<a class="underline" href="/login">Sign in to the sync server</a> to use the trainer. It calls Gemini with the server's
			<code>GEMINI_API_KEY</code>.
		</p>
	{:else}
		<form class="space-y-3" onsubmit={start}>
			<Input placeholder="What do you want to learn? e.g. B natural minor scale, Bubble sort, Projectile motion…" bind:value={topic} aria-label="Topic" />
			<Textarea placeholder="What you already know (optional). Helps the trainer start at the right level." bind:value={level} rows={2} aria-label="What you already know" />
			<div class="flex justify-end">
				<Button type="submit" disabled={!topic.trim()}>Start learning</Button>
			</div>
		</form>
	{/if}

	<!-- Curriculum Skill Tree -->
	<section class="space-y-4">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div>
				<h2 class="text-lg font-semibold">Skill Trees</h2>
				<p class="text-muted-foreground text-xs">Follow a structured path or generate a custom skill tree for any goal.</p>
			</div>
		</div>

		<!-- Subject Tabs -->
		<div class="flex flex-wrap gap-1.5">
			{#each subjects as subj (subj.id)}
				{@const stats = subjectStats(subj)}
				{@const selected = activeSubject?.id === subj.id}
				<div class="inline-flex items-center">
					<button
						type="button"
						class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors {selected
							? 'border-primary bg-primary text-primary-foreground'
							: 'bg-card hover:bg-accent'}"
						onclick={() => (selectedSubjectId = subj.id)}
					>
						<span>{subj.title}</span>
						<span class="opacity-75 tabular-nums">{stats.done}/{stats.total}</span>
					</button>
					{#if subj.custom}
						<button
							type="button"
							class="text-muted-foreground hover:text-foreground -ml-1 p-1"
							aria-label="Delete custom skill tree"
							onclick={() => deleteCustomCurriculum(subj.id)}
						>
							<X class="size-3.5" />
						</button>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Generate Custom Path -->
		{#if auth.valid}
			<form class="flex flex-wrap gap-2" onsubmit={buildPath}>
				<Input
					bind:value={pathGoal}
					placeholder="Generate a custom skill tree… e.g. Fingerstyle guitar, Linear algebra, Rust"
					class="h-9 flex-1 text-sm"
					disabled={generatingPath}
				/>
				<Button type="submit" size="sm" variant="outline" class="h-9" disabled={generatingPath || !pathGoal.trim()}>
					{#if generatingPath}<LoaderCircle class="size-3.5 animate-spin" /> Generating…{:else}<Sparkles class="size-3.5" /> Generate path{/if}
				</Button>
			</form>
			{#if pathError}
				<p class="text-destructive text-xs">{pathError}</p>
			{/if}
		{/if}

		<!-- Tree Branches & Lesson Nodes -->
		{#if activeSubject}
			<div class="space-y-4">
				{#each activeSubject.branches as branch (branch.id)}
					<div class="rounded-lg border p-3.5">
						<h3 class="mb-2.5 text-sm font-semibold">{branch.title}</h3>
						<div class="border-border/70 ml-2 space-y-2 border-l pl-4">
							{#each branch.nodes as node (node.id)}
								{@const done = Boolean(completedNodes[node.id])}
								{@const existing = sessionForNode(node.id)}
								<div class="bg-card flex items-center gap-3 rounded-md border px-3 py-2">
									<button
										type="button"
										class="text-muted-foreground hover:text-primary shrink-0"
										aria-label={done ? "Mark incomplete" : "Mark completed"}
										onclick={() => toggleNodeCompleted(node.id)}
									>
										{#if done}
											<CheckCircle2 class="size-4 text-emerald-600 dark:text-emerald-400" />
										{:else}
											<Circle class="size-4" />
										{/if}
									</button>
									<div class="min-w-0 flex-1">
										<div class="truncate text-sm font-medium {done ? 'text-muted-foreground line-through' : ''}">{node.title}</div>
										{#if node.summary}
											<div class="text-muted-foreground truncate text-xs">{node.summary}</div>
										{/if}
									</div>
									{#if existing && pending[existing.id]}
										<Badge variant="secondary" class="shrink-0 gap-1 text-[10px]">
											<LoaderCircle class="size-3 animate-spin" /> Generating
										</Badge>
									{/if}
									<Button
										size="sm"
										variant={existing ? "secondary" : "outline"}
										class="h-7 shrink-0 px-2.5 text-xs"
										disabled={!auth.valid && !existing}
										onclick={() => openNode(node)}
									>
										{existing ? "Resume" : "Start"} <ArrowRight class="size-3" />
									</Button>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	{#if sessions.length}
		<section class="space-y-3">
			<h2 class="text-lg font-semibold">Your sessions</h2>
			<ul class="divide-y rounded-lg border">
				{#each sessions as s (s.id)}
					<li class="group flex items-center gap-3 px-3 py-2">
						<a href="/learn/{s.id}" class="flex-1 truncate text-sm hover:underline">{s.topic}</a>
						{#if pending[s.id]}
							<Badge variant="secondary" class="gap-1 text-[10px]">
								<LoaderCircle class="size-3 animate-spin" /> Building lab…
							</Badge>
						{:else if errors[s.id]}
							<Badge variant="destructive" class="text-[10px]">Error</Badge>
						{/if}
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
