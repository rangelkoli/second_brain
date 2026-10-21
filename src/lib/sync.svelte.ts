import PocketBase, { type RecordModel } from "pocketbase";
import { SvelteMap } from "svelte/reactivity";
import { convertFileSrc } from "@tauri-apps/api/core";
import { applyRemote, attachmentPath, db, desktop, files, hasFile, ready, writeAttachment } from "./store.svelte";

// Realtime sync through PocketBase. Every vault file is one `files` record keyed by path; the vault on
// disk (desktop) or memory (web) stays the working copy, and this mirrors it both ways:
// local edits are diffed against what the server last had, server events are applied locally.
// Last write wins per file.
// ponytail: whole-file last-write-wins; two devices typing in the same note at once overwrite each
// other. Swap content for a Yjs doc per note if that ever matters.

const url = import.meta.env.VITE_PB_URL || (desktop ? "" : location.origin);
export const pb = url ? new PocketBase(url) : null;

export const auth = $state({ valid: pb?.authStore.isValid ?? false, email: (pb?.authStore.record?.email as string) ?? "" });
export const status = $state({ online: false });

type Synced = { id: string; content: string };
// What the server holds, by path; equal to local = nothing to push.
const remote = new Map<string, Synced>();
const attachments = new SvelteMap<string, string>(); // path -> download URL
let live = false; // merged with the server and receiving events
let started = false;

const filesCol = () => pb!.collection("files");
const attCol = () => pb!.collection("attachments");

// Pushes are serialized so a slow request can't land after a newer one.
let chain: Promise<unknown> = Promise.resolve();
const serial = (fn: () => Promise<unknown>) => (chain = chain.then(fn).catch((e) => console.error("sync:", e)));

async function push() {
	if (!live) return;
	const mine = files();
	for (const [path, { text }] of mine) {
		const prev = remote.get(path);
		if (prev?.content === text) continue;
		// Mark it synced before the request so its own realtime echo is recognized; undo on failure.
		const next = { id: prev?.id ?? "", content: text };
		remote.set(path, next);
		try {
			if (prev) await filesCol().update(prev.id, { content: text });
			else next.id = (await filesCol().create({ path, content: text })).id;
		} catch (e) {
			if (prev) remote.set(path, prev);
			else remote.delete(path);
			throw e;
		}
	}
	for (const [path, r] of remote) {
		if (mine.has(path) || !r.id) continue;
		remote.delete(path);
		await filesCol().delete(r.id).catch((e) => (remote.set(path, r), Promise.reject(e)));
	}
}

// Full merge with the server; runs on every (re)connect since realtime doesn't replay missed events.
// ponytail: a file deleted on this device while offline comes back from the server; keep tombstones if that bites.
async function resync() {
	await ready;
	const recs = await filesCol().getFullList({ fields: "id,path,content,updated", batch: 500 });
	const mine = files();
	remote.clear();
	for (const r of recs) {
		remote.set(r.path, { id: r.id, content: r.content });
		const l = mine.get(r.path);
		if (!l || (l.text !== r.content && Date.parse(r.updated) > l.at)) applyRemote(r.path, r.content);
	}
	for (const r of await attCol().getFullList({ batch: 500 })) await gotAttachment(r);
	live = true;
	status.online = true;
	serial(push);
}

async function gotAttachment(r: RecordModel) {
	const href = pb!.files.getURL(r, r.file);
	if (desktop && !(await hasFile(r.path))) {
		const res = await fetch(href);
		if (res.ok) await writeAttachment(r.path, new Uint8Array(await res.arrayBuffer()));
	}
}

async function start() {
	if (!pb || !auth.valid || started) return;
	started = true;
	pb.realtime.onDisconnect = () => ((live = false), (status.online = false));
	try {
		await subscribe();
	} catch (e) {
		started = false; // retried when the network comes back
		pb.realtime.unsubscribe().catch(() => {});
		throw e;
	}
	attachments.set(r.path, href); // after the download, so desktop images waiting on it reload from disk
}

async function subscribe() {
	await pb!.realtime.subscribe("PB_CONNECT", () => serial(resync));
	await filesCol().subscribe("*", ({ action, record: r }) => {
		if (!live) return;
		const prev = remote.get(r.path);
		if (action === "delete") {
			if (prev?.id !== r.id) return;
			remote.delete(r.path);
			return applyRemote(r.path, null);
		}
		remote.set(r.path, { id: r.id, content: r.content });
		if (prev?.content !== r.content) applyRemote(r.path, r.content);
	});
	await attCol().subscribe("*", ({ action, record }) => action !== "delete" && gotAttachment(record).catch(console.error));
}

// Any local change (typing, Codex editing the vault, a remote apply) re-diffs after a short pause.
// ponytail: re-serializes every note per pass; fine for thousands of notes, track dirty paths beyond that.
let timer: ReturnType<typeof setTimeout>;
$effect.root(() => {
	$effect(() => {
		files();
		clearTimeout(timer);
		timer = setTimeout(() => serial(push), 500);
	});
});

if (pb) {
	pb.authStore.onChange(() => {
		auth.valid = pb.authStore.isValid;
		auth.email = (pb.authStore.record?.email as string) ?? "";
		start().catch(console.error);
	});
	if (auth.valid) {
		// Extends the session; only a rejected token signs out, so the desktop app keeps working offline.
		pb.collection("users").authRefresh().catch((e) => e.status === 401 && pb.authStore.clear());
		start().catch(console.error);
	}
}

addEventListener("online", () => start().catch(console.error));
// Push right away when the tab/app goes to the background instead of waiting out the debounce.
// ponytail: an editor keystroke still inside its own 250ms debounce at close is lost on web.
addEventListener("visibilitychange", () => document.visibilityState === "hidden" && (clearTimeout(timer), serial(push)));

export async function signIn(email: string, password: string) {
	await pb!.collection("users").authWithPassword(email, password);
}

export function signOut() {
	pb?.realtime.unsubscribe();
	live = started = false;
	status.online = false;
	pb?.authStore.clear();
}

// Saves a pasted/dropped/picked file and returns its vault-relative path, to the vault on desktop and to the server when signed in.
export async function saveAttachment(file: File) {
	const rel = attachmentPath(file);
	if (desktop) await writeAttachment(rel, new Uint8Array(await file.arrayBuffer()));
	if (pb && auth.valid) {
		const upload = attCol().create({ path: rel, file }).then((r) => attachments.set(rel, pb.files.getURL(r, r.file)));
		// The web has no other copy, so wait for it there; desktop already has the file.
		if (desktop) upload.catch(console.error);
		else await upload;
	}
	return rel;
}

// URL to show/open a vault-relative attachment; reactive, so callers in an effect update when it syncs in.
export const fileUrl = (rel: string) => {
	const href = attachments.get(rel);
	return desktop ? convertFileSrc(`${db.vault}/${rel}`) : (href ?? rel);
};
