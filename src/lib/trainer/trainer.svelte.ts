import { generateHTML } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { MarkdownManager } from "@tiptap/markdown";
import { addTodo, createNote, getNote, updateNote } from "$lib/store.svelte";
import { reviewDates } from "./reviews";

// AI trainer: Gemini teaches a topic in short chunks with retrieval questions, and sees the
// learner's note and whiteboard on every turn. The note is a normal vault note; the lesson
// transcript and whiteboard live in this browser's localStorage.
// ponytail: transcripts/whiteboards don't sync across devices; move them to PocketBase if that's wanted.

export type Msg = { role: "user" | "model"; text: string };
// `note` is the vault path: note ids are per page load, the path is the stable identity.
// ponytail: renaming the note unlinks it from the session; track renames if that bites.
export type Session = { id: string; note: string; topic: string; messages: Msg[]; createdAt: number; reviews?: string[] };

const MODEL = "gemini-4-hydrogen";
const KEY = "trainer-gemini-key";
const SESSIONS = "trainer-sessions";

function load<T>(k: string, fallback: T): T {
	try {
		return JSON.parse(localStorage.getItem(k) ?? "") ?? fallback;
	} catch {
		return fallback;
	}
}
function store(k: string, v: string | null) {
	try {
		v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
	} catch (e) {
		console.error("trainer: storage", e);
	}
}

// The key stays in this browser (never in the bundle), so a public web build can't leak it.
export const gemini = $state({ key: load<string>(KEY, "") });
export function setKey(key: string) {
	gemini.key = key.trim();
	store(KEY, gemini.key ? JSON.stringify(gemini.key) : null);
}

export const sessions: Session[] = $state(load<Session[]>(SESSIONS, []));
const save = () => store(SESSIONS, JSON.stringify(sessions));
export const getSession = (id: string) => sessions.find((s) => s.id === id);

const boardKey = (id: string) => `trainer-board:${id}`;
export const loadBoard = (id: string) => load<string | null>(boardKey(id), null);
export const saveBoard = (id: string, dataUrl: string | null) => store(boardKey(id), dataUrl && JSON.stringify(dataUrl));

export function startSession(topic: string, level: string) {
	const noteId = createNote();
	updateNote(noteId, { title: `Learn: ${topic}`, content: "" });
	const id = crypto.randomUUID();
	const kickoff = `Teach me: ${topic}.${level.trim() ? ` What I already know: ${level.trim()}` : ""}`;
	sessions.unshift({ id, note: getNote(noteId)!.path, topic, createdAt: Date.now(), messages: [{ role: "user", text: kickoff }] });
	save();
	return id;
}

export function deleteSession(id: string) {
	const i = sessions.findIndex((s) => s.id === id);
	if (i >= 0) sessions.splice(i, 1);
	save();
	saveBoard(id, null);
}

export function scheduleReviews(s: Session) {
	s.reviews = reviewDates(new Date());
	for (const date of s.reviews) addTodo(`Review: ${s.topic} (quiz yourself before rereading)`, date);
	save();
}

const SYSTEM = `You are a tutor inside a note-taking app. Teach with evidence-based learning methods:
1. Chunking: teach ONE idea at a time in under 150 words, with a concrete example or analogy.
2. Retrieval practice: end every chunk with ONE question the learner must answer from memory. Never answer it yourself before they try. Prefer "explain why/how" questions over yes/no.
3. Feedback: when they answer, say plainly what is right, correct any misconception precisely, then move on or ask a short follow-up.
4. Generative notes: remind them to write the idea in their OWN words in their notes, not copy yours.
5. Dual coding: when a picture helps (process, structure, relationship), suggest exactly what to sketch on the whiteboard.
6. Spacing and interleaving: every few chunks, mix in a question about an earlier chunk.
7. Feynman check: near the end of a topic, ask them to explain it simply, as to a 12-year-old.

Each user turn includes the learner's current notes (markdown) and, if they drew anything, a snapshot of their whiteboard image. You can see both. When asked to review them, give specific feedback that quotes or points at their notes/drawing: what is accurate, what is wrong, what is missing, what looks copied rather than in their own words, and ONE concrete improvement. Do not mention the notes or whiteboard otherwise unless something in them is wrong.

Format in Markdown. Be warm, direct and brief.`;

export async function ask(s: Session, notes: string, board: string | null) {
	if (!gemini.key) throw new Error("Add your Gemini API key first.");
	const contents = s.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
	// Only the latest turn carries the notes/whiteboard, so the model always sees their current state.
	const last = contents.at(-1)!.parts as Record<string, unknown>[];
	last.push({ text: `--- My notes right now ---\n${notes.trim() || "(empty)"}` });
	if (board) last.push({ text: "--- My whiteboard right now ---" }, { inlineData: { mimeType: "image/jpeg", data: board.split(",")[1] } });

	const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
		method: "POST",
		headers: { "content-type": "application/json", "x-goog-api-key": gemini.key },
		body: JSON.stringify({
			systemInstruction: { parts: [{ text: SYSTEM }] },
			contents,
			generationConfig: { thinkingConfig: { thinkingLevel: "low" } },
		}),
	});
	const json = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(json.error?.message ?? `Gemini error ${res.status}`);
	const text = (json.candidates?.[0]?.content?.parts ?? [])
		.filter((p: { thought?: boolean; text?: string }) => !p.thought && p.text)
		.map((p: { text: string }) => p.text)
		.join("");
	if (!text) throw new Error("Gemini returned no answer. Try again.");
	s.messages.push({ role: "model", text });
	save();
}

export function send(s: Session, text: string) {
	s.messages.push({ role: "user", text });
	save();
}

// Model replies render through the editor schema, so only known nodes/marks reach the DOM.
const md = new MarkdownManager({ extensions: [StarterKit.configure({ link: false })] });
export const toHtml = (text: string) => generateHTML(md.parse(text), [StarterKit.configure({ link: false })]);
