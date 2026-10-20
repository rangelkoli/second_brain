<script lang="ts">
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import X from "@lucide/svelte/icons/x";
	import FileText from "@lucide/svelte/icons/file-text";
	import AgentBar from "$lib/agent/agent-bar.svelte";
	import { db, desktop, today, addTodo, toggleTodo, deleteTodo } from "$lib/store.svelte";

	let text = $state("");
	let date = $state(today());

	const now = today();
	// Today = due today, plus anything overdue and still open
	const todayTodos = $derived(db.todos.filter((t) => t.date === now || (t.date < now && !t.done)));
	const upcoming = $derived(db.todos.filter((t) => t.date > now && !t.done).sort((a, b) => a.date.localeCompare(b.date)));
	const left = $derived(todayTodos.filter((t) => !t.done).length);
	const recent = $derived([...db.notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6));

	const greeting = (() => {
		const h = new Date().getHours();
		return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
	})();

	function submit(e: Event) {
		e.preventDefault();
		if (!text.trim()) return;
		addTodo(text.trim(), date);
		text = "";
	}

	const fmt = (d: string) =>
		new Date(d + "T00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
</script>

<div class="mx-auto max-w-2xl space-y-10 pt-6 pb-48">
	<div>
		<p class="text-muted-foreground text-sm">{fmt(now)}</p>
		<h1 class="text-3xl font-bold tracking-tight">{greeting}</h1>
		<p class="text-muted-foreground mt-1">
			{left === 0 ? "Nothing left for today." : `${left} thing${left === 1 ? "" : "s"} to do today.`}
		</p>
	</div>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold">Today</h2>
		<form class="flex gap-2" onsubmit={submit}>
			<Input placeholder="Add a todo…" bind:value={text} class="flex-1" />
			<Input type="date" bind:value={date} class="w-40" aria-label="Due date" />
			<Button type="submit">Add</Button>
		</form>
		<ul class="divide-y rounded-lg border">
			{#each todayTodos as t (t.id)}
				{@render todo(t)}
			{:else}
				<li class="text-muted-foreground px-3 py-6 text-center text-sm">No todos for today.</li>
			{/each}
		</ul>
	</section>

	{#if upcoming.length}
		<section class="space-y-3">
			<h2 class="text-lg font-semibold">Upcoming</h2>
			<ul class="divide-y rounded-lg border">
				{#each upcoming as t (t.id)}
					{@render todo(t)}
				{/each}
			</ul>
		</section>
	{/if}

	{#if recent.length}
		<section class="space-y-3">
			<h2 class="text-lg font-semibold">Recent notes</h2>
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
				{#each recent as n (n.id)}
					<a href="/notes/{n.id}" class="hover:bg-accent flex items-center gap-2 rounded-lg border p-3 text-sm">
						<FileText class="text-muted-foreground size-4 shrink-0" />
						<span class="truncate">{n.title || "Untitled"}</span>
					</a>
				{/each}
			</div>
		</section>
	{/if}
</div>

{#if desktop}
	<AgentBar scope="home" placeholder="Ask Codex about your notes and to-dos…" />
{/if}

{#snippet todo(t: (typeof db.todos)[number])}
	<li class="group flex items-center gap-3 px-3 py-2">
		<Checkbox checked={t.done} onCheckedChange={() => toggleTodo(t.id)} aria-label="Done" />
		<span class="flex-1 text-sm {t.done ? 'text-muted-foreground line-through' : ''}">{t.text}</span>
		{#if t.date && t.date !== now}
			<span class="text-xs {t.date < now ? 'text-destructive' : 'text-muted-foreground'}">{fmt(t.date)}</span>
		{/if}
		<button
			class="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"
			aria-label="Delete todo"
			onclick={() => deleteTodo(t.id)}
		>
			<X class="size-4" />
		</button>
	</li>
{/snippet}
