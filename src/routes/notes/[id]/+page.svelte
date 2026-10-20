<script lang="ts">
	import { page } from "$app/state";
	import Editor from "$lib/editor/editor.svelte";
	import AgentBar from "$lib/agent/agent-bar.svelte";
	import { session } from "$lib/agent/codex.svelte";
	import { desktop, getNote, updateNote } from "$lib/store.svelte";

	const id = $derived(page.params.id!);
	const note = $derived(getNote(id));
	// Read-only while Codex patches this file, so typing can't race its edits.
	const busy = $derived(session(id).busy);
</script>

{#if note}
	<div class="mx-auto max-w-3xl pt-6 pb-48">
		<input
			class="placeholder:text-muted-foreground/50 mb-4 w-full bg-transparent text-4xl font-bold tracking-tight outline-none"
			placeholder="Untitled"
			value={note.title}
			readonly={busy}
			oninput={(e) => updateNote(id, { title: e.currentTarget.value })}
		/>
		{#key id}
			<Editor content={note.content} editable={!busy} onchange={(content) => updateNote(id, { content })} />
		{/key}
	</div>

	{#key id}
		{#if desktop}<AgentBar scope={id} placeholder="Ask Codex to edit this note…" />{/if}
	{/key}
{:else}
	<p class="text-muted-foreground pt-10 text-center">Note not found.</p>
{/if}
