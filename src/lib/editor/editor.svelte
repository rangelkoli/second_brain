<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { Editor, Extension, mergeAttributes } from "@tiptap/core";
	import { Markdown } from "@tiptap/markdown";
	import StarterKit from "@tiptap/starter-kit";
	import { Placeholder } from "@tiptap/extensions";
	import { TaskList, TaskItem } from "@tiptap/extension-list";
	import { TableKit } from "@tiptap/extension-table";
	import Highlight from "@tiptap/extension-highlight";
	import Image from "@tiptap/extension-image";
	import BubbleMenu from "@tiptap/extension-bubble-menu";
	import { Plugin, PluginKey } from "@tiptap/pm/state";
	import { Fragment } from "@tiptap/pm/model";
	import { Decoration, DecorationSet } from "@tiptap/pm/view";
	import { join } from "@tauri-apps/api/path";
	import { openPath, openUrl } from "@tauri-apps/plugin-opener";
	import Bold from "@lucide/svelte/icons/bold";
	import Italic from "@lucide/svelte/icons/italic";
	import Underline from "@lucide/svelte/icons/underline";
	import Strikethrough from "@lucide/svelte/icons/strikethrough";
	import Highlighter from "@lucide/svelte/icons/highlighter";
	import Code from "@lucide/svelte/icons/code";
	import Link from "@lucide/svelte/icons/link";
	import FileText from "@lucide/svelte/icons/file-text";
	import "./markdown-perf";
	import { SlashCommand, menu } from "./slash.svelte";
	import { db, desktop, noteByPath } from "$lib/store.svelte";
	import { fileUrl, saveAttachment } from "$lib/sync.svelte";

	let {
		content,
		onchange,
		editable = true,
	}: { content: string; onchange: (markdown: string) => void; editable?: boolean } = $props();

	let el: HTMLDivElement;
	let bubble: HTMLDivElement;
	let picker: HTMLInputElement;
	let editor = $state<Editor>();
	let tick = $state(0); // bumps on every transaction so toolbar active states refresh
	// svelte-ignore state_referenced_locally
	let last = content; // markdown we last emitted or loaded

	// Vault-relative image paths render from the vault (desktop) or the server (web); markdown keeps the relative path.
	const isExternal = (src: string) => /^[a-z][\w+.-]*:/i.test(src);
	const VaultImage = Image.extend({
		renderHTML({ HTMLAttributes: a }) {
			const src = a.src && !isExternal(a.src) ? fileUrl(decodeURI(a.src)) : a.src;
			return ["img", mergeAttributes(a, { src, loading: "lazy" })];
		},
	});

	// Briefly highlights the blocks an outside edit (Codex) changed, so small patches are easy to spot.
	const flashKey = new PluginKey<DecorationSet>("agentFlash");
	const Flash = Extension.create({
		name: "agentFlash",
		addProseMirrorPlugins: () => [
			new Plugin({
				key: flashKey,
				state: {
					init: () => DecorationSet.empty,
					apply(tr, set) {
						const range: { from: number; to: number } | null | undefined = tr.getMeta(flashKey);
						if (range === null) return DecorationSet.empty;
						if (!range) return set.map(tr.mapping, tr.doc);
						const decos: Decoration[] = [];
						tr.doc.forEach((node, pos) => {
							if (pos + node.nodeSize > range.from && pos <= range.to) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: "agent-flash" }));
						});
						return DecorationSet.create(tr.doc, decos);
					},
				},
				props: { decorations: (s) => flashKey.getState(s) },
			}),
		],
	});
	let flashTimer: ReturnType<typeof setTimeout>;

	// Serializing the whole doc to markdown is O(doc), so do it once per typing pause, not per keystroke.
	let emitTimer: ReturnType<typeof setTimeout> | undefined;
	function emitNow() {
		clearTimeout(emitTimer);
		emitTimer = undefined;
		if (editor && !editor.isDestroyed) onchange((last = editor.getMarkdown()));
	}

	async function attach(files: File[], pos?: number) {
		for (const file of files) {
			const src = await saveAttachment(file);
			const chain = editor!.chain().focus(pos);
			if (file.type.startsWith("image/")) chain.setImage({ src, alt: file.name }).run();
			else chain.insertContent([{ type: "text", text: file.name, marks: [{ type: "link", attrs: { href: src } }] }, { type: "text", text: " " }]).run();
		}
	}

	// Note links go to the note, attachment links open in their app, web links open in the browser.
	async function follow(href: string) {
		if (isExternal(href)) return desktop ? openUrl(href) : open(href, "_blank");
		const path = decodeURI(href).replace(/^\.?\//, "");
		const note = path.endsWith(".md") ? noteByPath(path.slice(0, -3)) : undefined;
		if (note) return goto(`/notes/${note.id}`);
		if (!desktop) return open(fileUrl(path), "_blank");
		openPath(await join(db.vault, path)).catch(console.error);
	}

	onMount(() => {
		editor = new Editor({
			element: el,
			content,
			contentType: "markdown",
			extensions: [
				StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
				Placeholder.configure({
					placeholder: ({ node }) => (node.type.name === "heading" ? "Heading" : "Type '/' for commands, '@' to link a note…"),
				}),
				TaskList,
				TaskItem.configure({ nested: true }),
				TableKit.configure({ table: { resizable: false } }),
				Highlight,
				VaultImage,
				BubbleMenu.configure({ element: bubble }),
				SlashCommand,
				Flash,
				Markdown,
			],
			editorProps: {
				attributes: { class: "prose-editor" },
				handlePaste: (_view, e) => {
					const files = [...(e.clipboardData?.files ?? [])];
					if (!files.length) return false;
					attach(files);
					return true;
				},
				handleDrop: (view, e) => {
					const files = [...(e.dataTransfer?.files ?? [])];
					if (!files.length) return false;
					attach(files, view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos);
					return true;
				},
				handleClick: (_view, _pos, e) => {
					const a = (e.target as HTMLElement).closest("a");
					if (!a?.getAttribute("href")) return false;
					follow(a.getAttribute("href")!);
					return true;
				},
			},
			onTransaction: () => tick++,
			onUpdate: () => {
				clearTimeout(emitTimer);
				emitTimer = setTimeout(emitNow, 250);
			},
		});
		el.addEventListener("pick-file", () => picker.click());
	});

	// Markdown split before each top-level "#" heading (outside code fences); [0] is whatever precedes the first one.
	function sections(md: string) {
		const out = [""];
		let fence = false;
		for (const line of md.split(/(?<=\n)/)) {
			if (/^(```|~~~)/.test(line)) fence = !fence;
			else if (!fence && /^#{1,6}\s/.test(line)) out.push("");
			out[out.length - 1] += line;
		}
		return out;
	}

	// Re-parses only the heading sections that changed. Parsing markdown is the slow part (marked runs
	// ~6ms/KB in WebKit), so an agent's one-line patch costs one section, not the whole note.
	function changedSections(ed: Editor, prev: string, next: string) {
		const a = sections(prev);
		const b = sections(next);
		const starts = [0];
		ed.state.doc.forEach((n, pos) => void (n.type.name === "heading" && starts.push(pos)));
		if (starts.length !== a.length) return null; // the doc doesn't line up with its markdown; parse it all
		let i = 0;
		while (i < a.length && i < b.length && a[i] === b[i]) i++;
		let k = 0;
		while (k < a.length - i && k < b.length - i && a[a.length - 1 - k] === b[b.length - 1 - k]) k++;
		const size = ed.state.doc.content.size;
		// A blank line before the next heading is just a separator; alone at the end it would parse as an empty paragraph.
		const text = b.slice(i, b.length - k).join("").replace(/\n\n$/, "\n");
		return {
			from: starts[i] ?? size,
			to: k ? starts[a.length - k] : size,
			nodes: text.trim() ? ed.schema.nodeFromJSON(ed.markdown!.parse(text)).content : Fragment.empty,
		};
	}

	// The file changed on disk (an agent edited it): patch it in without echoing a save back.
	$effect(() => {
		if (editor && content !== last && !emitTimer) {
			let patch = changedSections(editor, last, content);
			if (!patch) {
				const doc = editor.schema.nodeFromJSON(editor.markdown!.parse(content));
				patch = { from: 0, to: editor.state.doc.content.size, nodes: doc.content };
			}
			last = content;
			// Within the changed section(s), touch only the nodes that differ, so the flash marks the real edit.
			const { from, to, nodes } = patch;
			const fresh = editor.schema.topNodeType.create(null, nodes);
			const old = editor.state.doc.slice(from, to).content;
			const start = old.findDiffStart(fresh.content);
			if (start == null) return;
			let { a: endA, b: endB } = old.findDiffEnd(fresh.content)!;
			const overlap = start - Math.min(endA, endB); // repeated text can make the ends cross the start
			if (overlap > 0) (endA += overlap), (endB += overlap);
			editor.view.dispatch(
				editor.state.tr
					.replace(from + start, from + endA, fresh.slice(start, endB))
					.setMeta(flashKey, { from: from + start, to: from + Math.max(start, endB) })
					.setMeta("preventUpdate", true),
			);
			let top = 0; // start of the top-level block holding the first change
			editor.state.doc.forEach((n, pos) => void (pos + n.nodeSize <= from + start && (top = pos + n.nodeSize)));
			const dom = editor.view.nodeDOM(top);
			if (dom instanceof HTMLElement) dom.scrollIntoView({ block: "center", behavior: "smooth" });
			clearTimeout(flashTimer);
			flashTimer = setTimeout(() => editor?.view.dispatch(editor.state.tr.setMeta(flashKey, null).setMeta("addToHistory", false)), 2400);
		}
	});

	$effect(() => editor?.setEditable(editable, false));

	onDestroy(() => {
		if (emitTimer) emitNow();
		clearTimeout(flashTimer);
		editor?.destroy();
	});

	const marks = [
		{ name: "bold", icon: Bold, run: () => editor!.chain().focus().toggleBold().run() },
		{ name: "italic", icon: Italic, run: () => editor!.chain().focus().toggleItalic().run() },
		{ name: "underline", icon: Underline, run: () => editor!.chain().focus().toggleUnderline().run() },
		{ name: "strike", icon: Strikethrough, run: () => editor!.chain().focus().toggleStrike().run() },
		{ name: "highlight", icon: Highlighter, run: () => editor!.chain().focus().toggleHighlight().run() },
		{ name: "code", icon: Code, run: () => editor!.chain().focus().toggleCode().run() },
	];

	function setLink() {
		const prev = editor!.getAttributes("link").href ?? "";
		const href = prompt("Link URL", prev);
		if (href === null) return;
		if (href === "") editor!.chain().focus().unsetLink().run();
		else editor!.chain().focus().extendMarkRange("link").setLink({ href }).run();
	}

	const isActive = (name: string) => {
		void tick; // dependency so this re-runs on each transaction
		return editor?.isActive(name) ?? false;
	};
</script>

<div bind:this={el}></div>

<input
	bind:this={picker}
	type="file"
	multiple
	class="hidden"
	onchange={(e) => {
		attach([...(e.currentTarget.files ?? [])]);
		e.currentTarget.value = "";
	}}
/>

<div bind:this={bubble} class="bg-popover text-popover-foreground invisible absolute z-40 flex gap-0.5 rounded-lg border p-1 shadow-md">
	{#each marks as m (m.name)}
		<button
			class="hover:bg-accent flex size-7 items-center justify-center rounded {isActive(m.name) ? 'bg-accent' : ''}"
			aria-label={m.name}
			onmousedown={(e) => e.preventDefault()}
			onclick={m.run}
		>
			<m.icon class="size-4" />
		</button>
	{/each}
	<button
		class="hover:bg-accent flex size-7 items-center justify-center rounded {isActive('link') ? 'bg-accent' : ''}"
		aria-label="link"
		onmousedown={(e) => e.preventDefault()}
		onclick={setLink}
	>
		<Link class="size-4" />
	</button>
</div>

{#if menu.open}
	<div
		class="bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 fixed z-50 max-h-80 w-64 overflow-y-auto rounded-lg border p-1 shadow-md"
		style="left: {menu.x}px; top: {menu.y}px"
	>
		{#if menu.kind === "mention"}
			<p class="text-muted-foreground px-2 py-1 text-xs font-medium">Link a note</p>
		{/if}
		{#each menu.items as item, i (item.title + item.hint)}
			<button
				class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left {i === menu.index ? 'bg-accent' : ''}"
				onmouseenter={() => (menu.index = i)}
				onmousedown={(e) => e.preventDefault()}
				onclick={() => menu.pick(item)}
			>
				{#if menu.kind === "mention"}<FileText class="text-muted-foreground size-4 shrink-0" />{/if}
				<span class="flex min-w-0 flex-col">
					<span class="truncate text-sm font-medium">{item.title}</span>
					<span class="text-muted-foreground truncate text-xs">{item.hint}</span>
				</span>
			</button>
		{/each}
	</div>
{/if}
