import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { db } from "$lib/store.svelte";

export type Item = {
	title: string;
	hint: string;
	keywords: string;
	run: (editor: Editor, range: Range) => void;
};

const chain = (e: Editor, r: Range) => e.chain().focus().deleteRange(r);

export const commands: Item[] = [
	{ title: "Text", hint: "Plain paragraph", keywords: "p paragraph", run: (e, r) => chain(e, r).setParagraph().run() },
	{ title: "Heading 1", hint: "Big section heading", keywords: "h1 title", run: (e, r) => chain(e, r).setHeading({ level: 1 }).run() },
	{ title: "Heading 2", hint: "Medium heading", keywords: "h2 subtitle", run: (e, r) => chain(e, r).setHeading({ level: 2 }).run() },
	{ title: "Heading 3", hint: "Small heading", keywords: "h3", run: (e, r) => chain(e, r).setHeading({ level: 3 }).run() },
	{ title: "To-do list", hint: "Track tasks with checkboxes", keywords: "todo task checkbox", run: (e, r) => chain(e, r).toggleTaskList().run() },
	{ title: "Bulleted list", hint: "Simple bullet list", keywords: "ul unordered", run: (e, r) => chain(e, r).toggleBulletList().run() },
	{ title: "Numbered list", hint: "List with numbers", keywords: "ol ordered", run: (e, r) => chain(e, r).toggleOrderedList().run() },
	{ title: "Table", hint: "Rows and columns", keywords: "grid", run: (e, r) => chain(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
	{ title: "Quote", hint: "Capture a quote", keywords: "blockquote", run: (e, r) => chain(e, r).toggleBlockquote().run() },
	{ title: "Code block", hint: "Code snippet", keywords: "pre", run: (e, r) => chain(e, r).toggleCodeBlock().run() },
	{ title: "Highlight", hint: "Mark important text", keywords: "mark yellow", run: (e, r) => chain(e, r).toggleHighlight().run() },
	{ title: "Image or file", hint: "Attach a screenshot, image or file", keywords: "upload attach picture screenshot", run: (e, r) => (chain(e, r).run(), e.view.dom.dispatchEvent(new Event("pick-file"))) },
	{ title: "Divider", hint: "Horizontal line", keywords: "hr separator", run: (e, r) => chain(e, r).setHorizontalRule().run() },
];

// "@" links another note; the href is vault-relative with spaces encoded so it survives markdown round-trips.
const notes = (query: string): Item[] => {
	const q = query.toLowerCase();
	return db.notes
		.filter((n) => (n.title || "Untitled").toLowerCase().includes(q))
		.slice(0, 8)
		.map((n) => ({
			title: n.title || "Untitled",
			hint: n.path.includes("/") ? n.path.slice(0, n.path.lastIndexOf("/")) : "Note",
			keywords: "",
			run: (e, r) =>
				chain(e, r)
					.insertContent([{ type: "text", text: n.title || "Untitled", marks: [{ type: "link", attrs: { href: encodeURI(`${n.path}.md`) } }] }, { type: "text", text: " " }])
					.run(),
		}));
};

// Shared UI state the editor's popup menu renders from (only one menu is open at a time).
export const menu = $state({
	open: false,
	kind: "slash" as "slash" | "mention",
	items: [] as Item[],
	index: 0,
	x: 0,
	y: 0,
	pick: (_c: Item) => {},
});

function suggestion(editor: Editor, char: string, kind: typeof menu.kind, items: (q: string) => Item[]) {
	return Suggestion<Item>({
		editor,
		char,
		pluginKey: new PluginKey(kind),
		startOfLine: false,
		items: ({ query }) => items(query),
		command: ({ editor, range, props }) => props.run(editor, range),
		render: () => {
			const sync = (p: { items: Item[]; command: (c: Item) => void; clientRect?: (() => DOMRect | null) | null }) => {
				const rect = p.clientRect?.();
				menu.kind = kind;
				menu.items = p.items;
				menu.pick = p.command;
				if (menu.index >= p.items.length) menu.index = 0;
				if (rect) {
					menu.x = rect.left;
					menu.y = rect.bottom + 6;
				}
				menu.open = p.items.length > 0;
			};
			return {
				onStart: (p) => {
					menu.index = 0;
					sync(p);
				},
				onUpdate: sync,
				onKeyDown: ({ event }) => {
					if (!menu.open) return false;
					const n = menu.items.length;
					if (event.key === "ArrowDown") menu.index = (menu.index + 1) % n;
					else if (event.key === "ArrowUp") menu.index = (menu.index - 1 + n) % n;
					else if (event.key === "Enter") menu.pick(menu.items[menu.index]);
					else if (event.key === "Escape") menu.open = false;
					else return false;
					return true;
				},
				onExit: () => {
					menu.open = false;
				},
			};
		},
	});
}

export const SlashCommand = Extension.create({
	name: "slashCommand",
	addProseMirrorPlugins() {
		const q = (query: string) => commands.filter((c) => `${c.title} ${c.keywords}`.toLowerCase().includes(query.toLowerCase()));
		return [suggestion(this.editor, "/", "slash", q), suggestion(this.editor, "@", "mention", notes)];
	},
});
