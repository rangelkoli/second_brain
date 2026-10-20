<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import House from "@lucide/svelte/icons/house";
	import Plus from "@lucide/svelte/icons/plus";
	import Brain from "@lucide/svelte/icons/brain";
	import Cloud from "@lucide/svelte/icons/cloud";
	import CloudOff from "@lucide/svelte/icons/cloud-off";
	import { childrenOf, createNote } from "$lib/store.svelte";
	import { auth, pb, signOut, status } from "$lib/sync.svelte";
	import NoteTree from "./note-tree.svelte";

	const roots = $derived(childrenOf(null));

	function newNote() {
		goto(`/notes/${createNote()}`);
	}
</script>

<Sidebar.Root>
	<Sidebar.Header>
		<div class="flex items-center gap-2 px-2 py-1.5 font-semibold">
			<Brain class="size-5" /> Second Brain
		</div>
	</Sidebar.Header>
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={page.url.pathname === "/"}>
						{#snippet child({ props })}
							<a href="/" {...props}><House /><span>Home</span></a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Group>
		<Sidebar.Group>
			<Sidebar.GroupLabel>Notes</Sidebar.GroupLabel>
			<Sidebar.GroupAction title="New note" onclick={newNote}>
				<Plus /><span class="sr-only">New note</span>
			</Sidebar.GroupAction>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#each roots as note (note.id)}
						<NoteTree {note} />
					{:else}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton onclick={newNote} class="text-sidebar-foreground/60">
								<Plus /><span>Create your first note</span>
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>
	{#if pb}
		<Sidebar.Footer>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					{#if auth.valid}
						<Sidebar.MenuButton onclick={signOut} title="Sign out" class="text-sidebar-foreground/70">
							{#if status.online}<Cloud />{:else}<CloudOff />{/if}
							<span class="truncate">{status.online ? "Synced" : "Offline"} · {auth.email}</span>
						</Sidebar.MenuButton>
					{:else}
						<Sidebar.MenuButton>
							{#snippet child({ props })}
								<a href="/login" {...props}><CloudOff /><span>Sign in to sync</span></a>
							{/snippet}
						</Sidebar.MenuButton>
					{/if}
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Footer>
	{/if}
	<Sidebar.Rail />
</Sidebar.Root>
