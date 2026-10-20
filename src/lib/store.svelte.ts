import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { Markdown } from "@tiptap/markdown";
import { homeDir, join } from "@tauri-apps/api/path";
import { parseTodos, serializeTodos, type Todo } from "./todos";
import { exists, mkdir, readDir, readTextFile, remove, rename, stat, watch, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";

// Obsidian-style vault: every note is a .md file, todos live in todos.md, so any
// agent (Claude Code, Codex, ...) can edit them and the app picks changes up live.
// Note "A" is A.md, its sub-notes live in folder A/.

export type { Todo };

export type Note = {
	id: string; // session-only, stable across renames; the file path is the real identity
	path: string; // vault-relative, without ".md", e.g. "Projects/Launch"
	saved?: string; // path currently on disk; differs from `path` while a rename is pending
	parentId: string | null;
	title: string;
	content: string; // markdown
	updatedAt: number;
};


const TODOS = "todos.md";
export const ATTACHMENTS = "attachments";

export const db = $state({ notes: [] as Note[], todos: [] as Todo[], todosAt: 0, vault: "" });

// The web build has no vault on disk: notes live only in memory and sync through PocketBase (sync.svelte.ts).
export const desktop = "__TAURI_INTERNALS__" in window;

export function today() {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// --- fs plumbing ---

// Every fs op and rescan runs in order, so a rescan never sees a half-done rename.
let queue: Promise<unknown> = Promise.resolve();
function serial(fn: () => Promise<unknown>) {
	queue = queue.then(fn).catch((e) => console.error("vault:", e));
	return queue;
}

const abs = (rel: string) => join(db.vault, rel);

// Last todos.md text we wrote/read, so our own writes don't echo back as "external" changes.
const known = new Map<string, string>();

async function write(rel: string, text: string) {
	known.set(rel, text);
	const p = await abs(rel);
	const dir = p.slice(0, p.lastIndexOf("/"));
	await mkdir(dir, { recursive: true });
	await writeTextFile(p, text);
}

// Debounced per-file writes; typing coalesces into one write.
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, () => Promise<unknown>>();

function schedule(key: string, fn: () => Promise<unknown>) {
	if (!desktop) return;
	clearTimeout(timers.get(key));
	pending.set(key, fn);
	timers.set(key, setTimeout(() => flushOne(key), 300));
}

function flushOne(key: string) {
	clearTimeout(timers.get(key));
	timers.delete(key);
	const fn = pending.get(key);
	pending.delete(key);
	if (fn) serial(fn);
}

const flushAll = () => [...pending.keys()].forEach(flushOne);

// Lands every pending write on disk, e.g. before an agent reads the vault.
export async function flush() {
	flushAll();
	await queue;
}
addEventListener("pagehide", flushAll);
addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flushAll());

// --- loading ---

async function walk(rel: string, out: { path: string; dir: boolean }[]) {
	for (const e of await readDir(await abs(rel))) {
		if (e.name.startsWith(".")) continue; // .obsidian, .git, ...
		if (!rel && e.name === ATTACHMENTS) continue;
		const child = rel ? `${rel}/${e.name}` : e.name;
		if (e.isDirectory) {
			out.push({ path: child, dir: true });
			await walk(child, out);
		} else if (e.name.endsWith(".md") && child !== TODOS) {
			out.push({ path: child.slice(0, -3), dir: false });
		}
	}
	return out;
}

// Vault-relative paths the watcher reported since the last rescan; null = re-read everything.
let dirty: Set<string> | null = null;

function markDirty(paths: string[]) {
	if (!dirty) return;
	for (const p of paths) {
		if (!p.startsWith(db.vault + "/")) return void (dirty = null);
		dirty.add(p.slice(db.vault.length + 1));
	}
}

async function rescan() {
	const changed = dirty;
	dirty = new Set();
	const entries = await walk("", []);
	const paths = new Set(entries.map((e) => e.path)); // folders without a .md still show up as notes
	const files = new Set(entries.filter((e) => !e.dir).map((e) => e.path));
	const byPath = new Map(db.notes.map((n) => [n.saved ?? n.path, n]));
	const next: Note[] = [];

	for (const path of paths) {
		const rel = `${path}.md`;
		let note = byPath.get(path);
		if (!note) {
			note = { id: crypto.randomUUID(), path, saved: path, parentId: null, title: path.split("/").pop()!, content: "", updatedAt: 0 };
		}
		// Only files the watcher flagged (or never read) are re-read, so one edit costs one read.
		const stale = !changed || changed.has(rel) || note.updatedAt === 0;
		if (files.has(path) && !pending.has(note.id) && stale) {
			const p = await abs(rel);
			const text = await readTextFile(p);
			if (note.content !== text) {
				note.content = text;
				note.updatedAt = (await stat(p)).mtime?.getTime() ?? Date.now();
			}
		}
		next.push(note);
	}

	// Keep notes created in-app whose first write hasn't landed yet.
	db.notes = [...next, ...db.notes.filter((n) => !next.includes(n) && pending.has(n.id))];
	relink();

	if (!pending.has(TODOS) && (!changed || changed.has(TODOS))) {
		const p = await abs(TODOS);
		const text = (await exists(p)) ? await readTextFile(p) : "";
		if (known.get(TODOS) !== text) {
			known.set(TODOS, text);
			db.todos = parseTodos(text);
			db.todosAt = text ? ((await stat(p)).mtime?.getTime() ?? Date.now()) : 0;
		}
	}
}

function relink() {
	const idOf = new Map(db.notes.map((n) => [n.path, n.id]));
	for (const n of db.notes) {
		const i = n.path.lastIndexOf("/");
		n.parentId = i < 0 ? null : (idOf.get(n.path.slice(0, i)) ?? null);
	}
}

const saveTodos = () => ((db.todosAt = Date.now()), schedule(TODOS, () => write(TODOS, serializeTodos(db.todos))));

// --- init ---

// One-time import of the old localStorage data so nothing is lost on upgrade.
async function migrate() {
	const raw = localStorage.getItem("second-brain:v1");
	if (!raw) return;
	const old: { notes: { id: string; parentId: string | null; title: string; content: any }[]; todos: Todo[] } = JSON.parse(raw);
	const ed = new Editor({ extensions: [StarterKit, TaskList, TaskItem, Markdown] });
	const pathOf = new Map<string, string>();
	const resolve = (id: string): string => {
		if (pathOf.has(id)) return pathOf.get(id)!;
		const n = old.notes.find((n) => n.id === id)!;
		const base = n.parentId ? `${resolve(n.parentId)}/` : "";
		let name = safe(n.title);
		for (let i = 1; [...pathOf.values()].includes(base + name); i++) name = `${safe(n.title)} ${i}`;
		pathOf.set(id, base + name);
		return base + name;
	};
	for (const n of old.notes) {
		if (n.content) ed.commands.setContent(n.content);
		await write(`${resolve(n.id)}.md`, n.content ? ed.getMarkdown() : "");
	}
	ed.destroy();
	await write(TODOS, serializeTodos(old.todos));
	localStorage.setItem("second-brain:v1:migrated", raw);
	localStorage.removeItem("second-brain:v1");
}

// Vault lives in Google Drive for desktop when mounted, so it syncs across devices.
async function vaultDir() {
	const home = await homeDir();
	try {
		const cloud = await join(home, "Library", "CloudStorage");
		const drive = (await readDir(cloud)).find((e) => e.name.startsWith("GoogleDrive-"));
		if (drive) return await join(cloud, drive.name, "My Drive", "SecondBrain");
	} catch {}
	return join(home, "SecondBrain");
}

async function init() {
	db.vault = await vaultDir();
	await mkdir(db.vault, { recursive: true });
	await migrate();
	await rescan();
	await watch(db.vault, (e) => (markDirty(e.paths), serial(rescan)), { recursive: true, delayMs: 200 });
}
export const ready = desktop ? serial(init) : Promise.resolve();

// --- notes ---

const safe = (title: string) => title.replace(/[\\/:*?"<>|#^[\]]/g, "-").trim() || "Untitled";

function uniquePath(parentPath: string | null, title: string, self?: Note) {
	const base = parentPath ? `${parentPath}/` : "";
	const taken = (p: string) => db.notes.some((n) => n !== self && n.path === p);
	let name = safe(title);
	for (let i = 1; taken(base + name); i++) name = `${safe(title)} ${i}`;
	return base + name;
}

export function childrenOf(parentId: string | null) {
	return db.notes.filter((n) => n.parentId === parentId);
}

export function getNote(id: string) {
	return db.notes.find((n) => n.id === id);
}

export function createNote(parentId: string | null = null) {
	const parent = parentId ? getNote(parentId) : undefined;
	const note: Note = {
		id: crypto.randomUUID(),
		path: uniquePath(parent?.path ?? null, ""),
		parentId,
		title: "",
		content: "",
		updatedAt: Date.now(),
	};
	db.notes.push(note);
	flushOne(saveNote(note));
	return note.id;
}

// Renames are applied lazily with the debounced write, so typing a title is one rename, not one per keystroke.
// ponytail: a sub-note saved before its parent's pending rename lands can split the folder; flush parents first if seen.
function saveNote(n: Note) {
	schedule(n.id, async () => {
		const from = n.saved;
		if (from && from !== n.path) {
			for (const [a, b] of [[`${from}.md`, `${n.path}.md`], [from, n.path]]) {
				const src = await abs(a);
				if (await exists(src)) await rename(src, await abs(b));
			}
			for (const d of db.notes) if (d.saved?.startsWith(`${from}/`)) d.saved = n.path + d.saved.slice(from.length);
		}
		await write(`${n.path}.md`, n.content);
		n.saved = n.path;
	});
	return n.id;
}

export function updateNote(id: string, patch: Partial<Pick<Note, "title" | "content">>) {
	const note = getNote(id);
	if (!note) return;
	Object.assign(note, patch, { updatedAt: Date.now() });
	if (patch.title !== undefined) {
		const parent = note.parentId ? getNote(note.parentId) : undefined;
		const to = uniquePath(parent?.path ?? null, patch.title, note);
		// Re-root this note and its descendants; the files move on the next save.
		const from = note.path;
		if (to !== from) for (const n of db.notes) if (n.path === from || n.path.startsWith(`${from}/`)) n.path = to + n.path.slice(from.length);
	}
	saveNote(note);
}

export function deleteNote(id: string) {
	const note = getNote(id);
	if (!note) return;
	const doomed = db.notes.filter((n) => n.path === note.path || n.path.startsWith(`${note.path}/`));
	for (const n of doomed) pending.delete(n.id), clearTimeout(timers.get(n.id));
	db.notes = db.notes.filter((n) => !doomed.includes(n));
	const on = note.saved;
	if (on && desktop) serial(async () => {
		for (const rel of [`${on}.md`, on]) {
			const p = await abs(rel);
			if (await exists(p)) await remove(p, { recursive: true });
		}
	});
}

// --- todos ---

export function addTodo(text: string, date = today()) {
	db.todos.push({ id: crypto.randomUUID(), text, done: false, date });
	saveTodos();
}

export function toggleTodo(id: string) {
	const t = db.todos.find((t) => t.id === id);
	if (t) t.done = !t.done;
	saveTodos();
}

export function deleteTodo(id: string) {
	db.todos = db.todos.filter((t) => t.id !== id);
	saveTodos();
}

// --- sync (see sync.svelte.ts) ---

// Every synced file by vault-relative path: one .md per note, plus todos.md.
export function files() {
	const out = new Map(db.notes.map((n) => [`${n.path}.md`, { text: n.content, at: n.updatedAt }]));
	out.set(TODOS, { text: serializeTodos(db.todos), at: db.todosAt });
	return out;
}

// Applies a file changed on another device (null = deleted) to memory and, on desktop, the vault.
export function applyRemote(rel: string, text: string | null) {
	if (rel === TODOS) {
		db.todos = parseTodos(text ?? "");
		return saveTodos();
	}
	const path = rel.slice(0, -3);
	const note = noteByPath(path);
	if (text === null) return note && deleteNote(note.id);
	if (note) {
		if (note.content === text) return;
		Object.assign(note, { content: text, updatedAt: Date.now() });
		return saveNote(note);
	}
	const n: Note = { id: crypto.randomUUID(), path, parentId: null, title: path.split("/").pop()!, content: text, updatedAt: Date.now() };
	db.notes.push(n);
	relink();
	saveNote(n);
}

// --- attachments ---

// Picks a fresh vault-relative path in attachments/ for a pasted/dropped/picked file.
export function attachmentPath(file: File) {
	const dot = file.name.lastIndexOf(".");
	const ext = dot > 0 ? file.name.slice(dot) : file.type.startsWith("image/") ? `.${file.type.slice(6)}` : "";
	const stem = (dot > 0 ? file.name.slice(0, dot) : file.name).replace(/[^\w-]+/g, "-").slice(0, 40) || "file";
	return `${ATTACHMENTS}/${stem}-${Date.now().toString(36)}${ext}`;
}

export async function writeAttachment(rel: string, data: Uint8Array) {
	await mkdir(await abs(ATTACHMENTS), { recursive: true });
	await writeFile(await abs(rel), data);
}

export const hasFile = async (rel: string) => exists(await abs(rel));

export const noteByPath = (path: string) => db.notes.find((n) => n.path === path);
