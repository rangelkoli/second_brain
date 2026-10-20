import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";
import { db, desktop, flush, getNote, noteByPath, today } from "$lib/store.svelte";

// Codex app-server client. One server process (see src-tauri/src/lib.rs), one persistent thread per
// scope ("home" or a note id), resumed across app restarts. Codex edits the vault files itself with
// apply_patch, so a request changes only the lines it needs and the fs watcher shows the edit live.

type Msg = { id?: number | string; method?: string; params?: any; result?: any; error?: { message: string } };

let nextId = 1;
const calls = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

const send = (m: Msg) => invoke("codex_send", { line: JSON.stringify(m) });

function request<T = any>(method: string, params: unknown): Promise<T> {
	const id = nextId++;
	return new Promise((resolve, reject) => {
		calls.set(id, { resolve, reject });
		send({ id, method, params }).catch((e) => (calls.delete(id), reject(new Error(String(e)))));
	});
}

// --- sessions ---

export type Attachment = { path: string; name: string; image: boolean }; // path is vault-relative
export type Draft = { text: string; attachments: Attachment[]; mentions: string[] }; // mentions = note ids

export type Entry =
	| { kind: "user"; id: string; text: string; attachments: Attachment[] }
	| { kind: "agent"; id: string; text: string; final: boolean }
	| { kind: "edit"; id: string; paths: string[] }
	| { kind: "error"; id: string; text: string };

export type Question = { id: string; header: string; question: string; other: boolean; options: { label: string; description: string }[] };
export type Ask =
	| { kind: "questions"; rpc: number | string; questions: Question[] }
	| { kind: "approval"; rpc: number | string; title: string; detail: string };

export type Status = "idle" | "starting" | "working" | "waiting" | "paused" | "error";

const STORE = "second-brain:agent-threads";
const HISTORY = "second-brain:agent-history:";
const saved: Record<string, string> = JSON.parse(localStorage.getItem(STORE) ?? "{}");

export class Session {
	thread = "";
	turn = "";
	status = $state<Status>("idle");
	activity = $state(""); // what Codex is doing right now, e.g. "Editing Groceries"
	entries = $state<Entry[]>([]);
	ask = $state<Ask | null>(null);
	queue = $state<Draft[]>([]);
	startedAt = $state(0);
	private ready: Promise<string> | null = null;

	constructor(readonly scope: string) {}

	// Note ids live for one app run; the file path is what survives restarts.
	private get key() {
		const n = getNote(this.scope);
		return n ? `note:${n.path}` : this.scope;
	}

	get busy() {
		return this.status === "starting" || this.status === "working" || this.status === "waiting";
	}

	private push(e: Entry) {
		this.entries.push(e);
		if (this.entries.length > 200) this.entries.splice(0, this.entries.length - 200);
	}

	// Loads the scope's thread (resuming the saved one) or starts a fresh one.
	private ensure() {
		return (this.ready ??= (async () => {
			const params = {
				cwd: db.vault,
				model: "gpt-6-luna",
				sandbox: "workspace-write",
				approvalPolicy: "on-request",
				developerInstructions: INSTRUCTIONS,
				// Like T3 Code's lightweight calls: skip plugin/app tool loading a notes agent never uses (~15% faster turns).
				config: { "features.default_mode_request_user_input": true, "features.apps": false, "features.plugins": false },
			};
			let res: any;
			if (saved[this.key]) {
				// excludeTurns: the transcript comes from our own copy (as T3 does), so resume stays fast on long threads.
				res = await request("thread/resume", { threadId: saved[this.key], excludeTurns: true, ...params }).catch(() => null);
			}
			res ??= await request("thread/start", params);
			this.thread = res.thread.id;
			threads.set(this.thread, this);
			saved[this.key] = this.thread;
			localStorage.setItem(STORE, JSON.stringify(saved));
			return this.thread;
		})().catch((e) => {
			this.ready = null;
			throw e;
		}));
	}

	// Restores the transcript saved after the last turn.
	load() {
		if (this.entries.length) return;
		try {
			this.entries = JSON.parse(localStorage.getItem(HISTORY + this.key) ?? "[]");
		} catch {}
	}

	private persist() {
		localStorage.setItem(HISTORY + this.key, JSON.stringify(this.entries.filter((e) => e.kind !== "agent" || e.final).slice(-60)));
	}

	// Warms the server + thread so the first real request doesn't pay for startup.
	warm() {
		if (saved[this.key]) this.ensure().catch(() => {});
	}

	async submit(d: Draft) {
		if (this.busy) {
			this.queue.push(d);
			return;
		}
		this.status = "starting";
		this.activity = "Starting Codex";
		this.startedAt = Date.now();
		this.ask = null;
		this.push({ kind: "user", id: crypto.randomUUID(), text: d.text, attachments: d.attachments });
		try {
			const [thread, input] = await Promise.all([this.ensure(), this.input(d), flush()]);
			// Note edits are small; low effort measured ~10s/turn vs ~14s (and far less variance) at the default.
			const res = await request("turn/start", { threadId: thread, input, effort: "low" });
			this.turn = res.turn.id;
			if (this.status === "starting") this.status = "working";
		} catch (e) {
			this.fail(String(e instanceof Error ? e.message : e));
		}
	}

	// Sends a queued draft into the running turn instead of waiting for it to finish.
	async steer(i: number) {
		const [d] = this.queue.splice(i, 1);
		if (!d) return;
		if (!this.busy || !this.turn) return this.submit(d);
		this.push({ kind: "user", id: crypto.randomUUID(), text: d.text, attachments: d.attachments });
		await request("turn/steer", { threadId: this.thread, expectedTurnId: this.turn, input: await this.input(d) }).catch(() =>
			this.queue.unshift(d),
		);
	}

	stop() {
		if (this.thread && this.turn) request("turn/interrupt", { threadId: this.thread, turnId: this.turn }).catch(() => {});
	}

	// Starts the scope over with a brand-new thread.
	reset() {
		if (this.busy) return;
		threads.delete(this.thread);
		delete saved[this.key];
		localStorage.removeItem(HISTORY + this.key);
		localStorage.setItem(STORE, JSON.stringify(saved));
		Object.assign(this, { thread: "", turn: "", ready: null, entries: [], ask: null, queue: [], status: "idle", activity: "" });
	}

	answer(answers: Record<string, string[]>) {
		const a = this.ask;
		if (a?.kind !== "questions") return;
		send({ id: a.rpc, result: { answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, { answers: v }])) } });
		this.ask = null;
	}

	approve(ok: boolean) {
		const a = this.ask;
		if (a?.kind !== "approval") return;
		send({ id: a.rpc, result: { decision: ok ? "accept" : "decline" } });
		this.ask = null;
	}

	private fail(text: string) {
		this.status = "error";
		this.activity = "";
		this.push({ kind: "error", id: crypto.randomUUID(), text });
	}

	// The user's words plus the context Codex would otherwise spend tool calls fetching.
	private async input(d: Draft) {
		const ctx: string[] = [];
		const inline = (path: string, content: string) =>
			content.length < 24000 ? `<note path="${path}.md">\n${content}\n</note>` : `(${path}.md is long; read it from disk.)`;
		const here = getNote(this.scope);
		if (here) ctx.push(`The user is looking at the note "${here.title || "Untitled"}" (${here.path}.md). "this note" means that file.`, inline(here.path, here.content));
		else {
			ctx.push(`Today is ${today()}. The user is on the home dashboard; you can work on any note or the to-do list.`);
			ctx.push(`Notes in the vault:\n${db.notes.map((n) => `- ${n.path}.md`).join("\n") || "(none yet)"}`);
			ctx.push(`<todos path="todos.md">\n${db.todos.map((t) => `- [${t.done ? "x" : " "}] ${t.text}${t.date ? ` 📅 ${t.date}` : ""}`).join("\n")}\n</todos>`);
		}
		for (const id of d.mentions) {
			const n = getNote(id);
			if (n && n !== here) ctx.push(`Referenced note @${n.title || "Untitled"}:`, inline(n.path, n.content));
		}
		const files = d.attachments.filter((a) => !a.image);
		if (files.length) ctx.push(`Attached files (vault-relative):\n${files.map((a) => `- ${a.path}`).join("\n")}`);
		const images = await Promise.all(d.attachments.filter((a) => a.image).map(async (a) => ({ type: "localImage", path: await join(db.vault, a.path) })));
		if (images.length) ctx.push(`Attached images are saved at: ${d.attachments.filter((a) => a.image).map((a) => a.path).join(", ")}`);
		const text = `${d.text}\n\n<context>\n${ctx.join("\n\n")}\n</context>`;
		return [{ type: "text", text, text_elements: [] }, ...images];
	}

	// --- server events ---

	handle(method: string, p: any) {
		switch (method) {
			case "turn/started":
				this.turn = p.turn.id;
				this.status = "working";
				this.activity = "Thinking";
				break;
			case "thread/status/changed": {
				const flags: string[] = p.status.activeFlags ?? [];
				if (p.status.type === "active") this.status = flags.length ? "waiting" : "working";
				break;
			}
			case "item/started":
				this.activity = describe(p.item) ?? this.activity;
				// The phase is known up front, so a final reply streams in its final style instead of flipping at the end.
				if (p.item.type === "agentMessage") this.push({ kind: "agent", id: p.item.id, text: "", final: p.item.phase !== "commentary" });
				break;
			case "item/agentMessage/delta": {
				const e = this.entries.findLast((e) => e.id === p.itemId);
				if (e?.kind === "agent") e.text += p.delta;
				else this.push({ kind: "agent", id: p.itemId, text: p.delta, final: false });
				break;
			}
			case "item/completed":
				if (p.item.type === "agentMessage") {
					const e = this.entries.findLast((e) => e.id === p.item.id);
					const final = p.item.phase !== "commentary";
					if (e?.kind === "agent") Object.assign(e, { text: p.item.text, final });
					else this.push({ kind: "agent", id: p.item.id, text: p.item.text, final });
				} else if (p.item.type === "fileChange" && p.item.status === "completed") {
					const paths = p.item.changes.map((c: { path: string }) => rel(c.path));
					const last = this.entries.at(-1);
					if (last?.kind === "edit") last.paths = [...new Set([...last.paths, ...paths])];
					else this.push({ kind: "edit", id: p.item.id, paths });
				}
				break;
			case "turn/completed": {
				const t = p.turn;
				this.turn = "";
				this.activity = "";
				this.ask = null;
				if (t.status === "interrupted") this.status = "paused";
				else if (t.status === "failed") this.fail(t.error?.message ?? "Codex turn failed");
				else this.status = "idle";
				this.persist();
				const next = this.queue.shift();
				if (next && t.status !== "interrupted") this.submit(next);
				break;
			}
			case "error":
				if (!p.willRetry) this.push({ kind: "error", id: crypto.randomUUID(), text: p.error?.message ?? "Codex error" });
				break;
		}
	}

	request(id: number | string, method: string, p: any) {
		if (method === "item/tool/requestUserInput") {
			this.ask = {
				kind: "questions",
				rpc: id,
				questions: p.questions.map((q: any) => ({ id: q.id, header: q.header, question: q.question, other: q.isOther, options: q.options ?? [] })),
			};
		} else if (method === "item/fileChange/requestApproval") {
			this.ask = { kind: "approval", rpc: id, title: "Allow this edit?", detail: p.reason ?? "Codex wants to write outside the vault." };
		} else if (method === "item/commandExecution/requestApproval") {
			this.ask = { kind: "approval", rpc: id, title: "Allow this command?", detail: p.command ?? p.reason ?? "" };
		} else if (method === "item/permissions/requestApproval") {
			send({ id, result: { permissions: {}, scope: "turn" } }); // ponytail: deny extra permissions; surface if Codex starts needing them
		} else {
			send({ id, error: { code: -32601, message: `${method} is not supported by Second Brain` } } as any);
		}
	}
}

const sessions = new Map<string, Session>();
const threads = new Map<string, Session>();

export function session(scope: string) {
	let s = sessions.get(scope);
	if (!s) sessions.set(scope, (s = new Session(scope)));
	return s;
}

// True while any agent is mid-turn, so editors can avoid racing Codex's writes.
export const anyBusy = () => [...sessions.values()].some((s) => s.busy);

const rel = (abs: string) => (abs.startsWith(db.vault + "/") ? abs.slice(db.vault.length + 1) : abs);

const pretty = (p: string) => {
	const r = rel(p);
	return r.endsWith(".md") ? (noteByPath(r.slice(0, -3))?.title || r.slice(0, -3).split("/").pop()) : r.split("/").pop();
};

function describe(item: any): string | undefined {
	switch (item.type) {
		case "reasoning":
			return "Thinking";
		case "fileChange":
			return `Editing ${item.changes.map((c: { path: string }) => pretty(c.path)).join(", ")}`;
		case "commandExecution": {
			const a = item.commandActions?.[0];
			if (a?.type === "read") return `Reading ${pretty(a.path ?? a.name ?? "")}`;
			if (a?.type === "search" || a?.type === "listFiles") return "Looking through notes";
			return "Running a command";
		}
		case "webSearch":
			return "Searching the web";
		case "agentMessage":
			return "Writing";
	}
}

// --- wire ---

// Codex runs as a local process, so the agent only exists in the desktop app.
if (desktop) listen<string>("codex", ({ payload }) => {
	let m: Msg;
	try {
		m = JSON.parse(payload);
	} catch {
		return;
	}
	if (m.method === undefined) {
		const c = typeof m.id === "number" ? calls.get(m.id) : undefined;
		if (!c) return;
		calls.delete(m.id as number);
		if (m.error) c.reject(new Error(m.error.message));
		else c.resolve(m.result);
		return;
	}
	const s = threads.get(m.params?.threadId ?? m.params?.conversationId);
	if (m.id !== undefined) {
		if (s) s.request(m.id, m.method, m.params);
		else send({ id: m.id, error: { message: "no session" } });
	} else s?.handle(m.method, m.params);
});

if (desktop) listen("codex-exit", () => {
	for (const c of calls.values()) c.reject(new Error("Codex stopped unexpectedly"));
	calls.clear();
	for (const s of sessions.values()) {
		(s as any).ready = null; // the next request resumes the thread on a fresh server
		if (s.busy) {
			s.status = "error";
			s.activity = "";
			s.entries.push({ kind: "error", id: crypto.randomUUID(), text: "Codex stopped unexpectedly" });
		}
	}
});

const INSTRUCTIONS = `You are the writing assistant inside "Second Brain", a markdown notes app. Your working directory is the user's vault:
- Every note is a markdown file. Note "A" is A.md; its sub-notes live in folder A/ (e.g. A/B.md). The file name is the note title.
- todos.md is the to-do list, one task per line: "- [ ] text 📅 YYYY-MM-DD" (the date is optional, "- [x]" when done). Keep exactly that format and nothing else in that file.
- attachments/ holds images and files. Reference them from notes with vault-relative paths: ![alt](attachments/name.png) or [name.pdf](attachments/name.pdf).
- Link to another note with a vault-relative link: [Title](<Folder/Title.md>).

How to edit:
- Change files in place with apply_patch, touching only the lines the request needs. Never rewrite or re-output a whole note unless the user asks for a rewrite.
- Each request includes a <context> block with the current note and any referenced notes, so you don't need to re-read them before patching.
- If the request is ambiguous or needs a decision from the user, ask with request_user_input before editing.
- To create a note, create a new .md file. Never touch hidden folders.
- Don't paste the document in your reply. Reply with one or two short sentences about what you changed, or the answer if the user asked a question.

The editor renders this markdown; use it to make notes clear and good-looking: # / ## / ### headings, **bold**, *italic*, ~~strike~~, ==highlight==, \`inline code\`, fenced code blocks with a language, > quotes, - bullet and 1. numbered lists (nestable), - [ ] task lists, | tables |, --- dividers, links and images. No raw HTML.`;
