<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import * as Collapsible from "$lib/components/ui/collapsible/index.js";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import FileText from "@lucide/svelte/icons/file-text";
	import Ellipsis from "@lucide/svelte/icons/ellipsis";
	import Plus from "@lucide/svelte/icons/plus";
	import Trash from "@lucide/svelte/icons/trash-2";
	import { childrenOf, createNote, deleteNote, type Note } from "$lib/store.svelte";
	import NoteTree from "./note-tree.svelte";

	let { note, sub = false }: { note: Note; sub?: boolean } = $props();

	let open = $state(false);
	const kids = $derived(childrenOf(note.id));
	const href = $derived(`/notes/${note.id}`);
	const active = $derived(page.url.pathname === href);

	function addChild() {
		const id = createNote(note.id);
		open = true;
		goto(`/notes/${id}`);
	}

	function remove() {
		if (!confirm(`Delete "${note.title || "Untitled"}" and its sub-notes?`)) return;
		deleteNote(note.id);
		if (active) goto("/");
	}
</script>

{#snippet row()}
	<div class="group/row relative flex items-center">
		<button
			class="text-sidebar-foreground/60 hover:bg-sidebar-accent absolute left-1 z-10 flex size-5 items-center justify-center rounded"
			aria-label={open ? "Collapse" : "Expand"}
			onclick={() => (open = !open)}
		>
			<ChevronRight class="size-3.5 transition-transform {open ? 'rotate-90' : ''}" />
		</button>
		{#if sub}
			<Sidebar.MenuSubButton {href} isActive={active} class="pl-7 pr-12">
				<span class="truncate">{note.title || "Untitled"}</span>
			</Sidebar.MenuSubButton>
		{:else}
			<Sidebar.MenuButton isActive={active} class="pl-7 pr-12">
				{#snippet child({ props })}
					<a {href} {...props}>
						<FileText />
						<span>{note.title || "Untitled"}</span>
					</a>
				{/snippet}
			</Sidebar.MenuButton>
		{/if}
		<div class="absolute right-1 flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 has-[[data-state=open]]:opacity-100">
			<button class="hover:bg-sidebar-accent flex size-5 items-center justify-center rounded" aria-label="Add sub-note" onclick={addChild}>
				<Plus class="size-3.5" />
			</button>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger class="hover:bg-sidebar-accent flex size-5 items-center justify-center rounded" aria-label="More">
					<Ellipsis class="size-3.5" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content side="right" align="start">
					<DropdownMenu.Item onclick={addChild}><Plus /> Add sub-note</DropdownMenu.Item>
					<DropdownMenu.Item variant="destructive" onclick={remove}><Trash /> Delete</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>
	<Collapsible.Content>
		{#if kids.length}
			<Sidebar.MenuSub class="mr-0 pr-0">
				{#each kids as kid (kid.id)}
					<NoteTree note={kid} sub />
				{/each}
			</Sidebar.MenuSub>
		{:else}
			<p class="text-sidebar-foreground/50 py-1 pl-9 text-xs">No sub-notes</p>
		{/if}
	</Collapsible.Content>
{/snippet}

<Collapsible.Root bind:open>
	{#if sub}
		<Sidebar.MenuSubItem>{@render row()}</Sidebar.MenuSubItem>
	{:else}
		<Sidebar.MenuItem>{@render row()}</Sidebar.MenuItem>
	{/if}
</Collapsible.Root>
