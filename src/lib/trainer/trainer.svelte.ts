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
const STT_MODEL = "gemini-3.5-transcribe";
const TTS_MODEL = "gemini-3.8-flash-tts";
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

const SYSTEM = `You are a friendly tutor inside a note-taking app. Your replies may be read aloud, so talk like a person, not a textbook.

Keep it SHORT and SIMPLE:
- At most 60 words per reply (reviews: at most 4 short bullets). One idea per reply.
- Use everyday words a 12-year-old would follow. If you must use a term, explain it in a few words right away.
- Use one concrete example or analogy instead of abstract explanation.
- Short sentences. No tables, no long lists, no headings, no code blocks unless the topic is code.

How you teach (evidence-based):
1. Explain one small idea, then ask ONE question they answer from memory. Never answer it yourself before they try. Prefer "why" or "how" questions.
2. When they answer: say what's right, fix any mistake in one or two sentences, then go on.
3. Now and then, ask about an earlier idea again (spaced, mixed practice).
4. When a picture helps, suggest one simple sketch for the whiteboard.
5. Near the end, ask them to explain the whole thing simply, as if to a friend.

Each user turn includes the learner's current notes (markdown) and, if they drew anything, a snapshot of their whiteboard. You can see both. When asked to review them, point at their actual notes/drawing: what's right, what's wrong, what's missing, and one improvement. Otherwise mention the notes or whiteboard only if something in them is wrong.

Format in light Markdown (bold for key words is fine).`;

async function call(model: string, body: object) {
	if (!gemini.key) throw new Error("Add your Gemini API key first.");
	const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
		method: "POST",
		headers: { "content-type": "application/json", "x-goog-api-key": gemini.key },
		body: JSON.stringify(body),
	});
	const json = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(json.error?.message ?? `Gemini error ${res.status}`);
	return (json.candidates?.[0]?.content?.parts ?? []) as GeminiPart[];
}
type GeminiPart = { text?: string; thought?: boolean; inlineData?: { mimeType: string; data: string }; audioTranscription?: { text: string } };

export async function ask(s: Session, notes: string, board: string | null) {
	const contents = s.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
	// Only the latest turn carries the notes/whiteboard, so the model always sees their current state.
	const last = contents.at(-1)!.parts as Record<string, unknown>[];
	last.push({ text: `--- My notes right now ---\n${notes.trim() || "(empty)"}` });
	if (board) last.push({ text: "--- My whiteboard right now ---" }, { inlineData: { mimeType: "image/jpeg", data: board.split(",")[1] } });

	const parts = await call(MODEL, {
		systemInstruction: { parts: [{ text: SYSTEM }] },
		contents,
		generationConfig: { thinkingConfig: { thinkingLevel: "low" } },
	});
	const text = parts
		.filter((p) => !p.thought && p.text)
		.map((p) => p.text)
		.join("");
	if (!text) throw new Error("Gemini returned no answer. Try again.");
	s.messages.push({ role: "model", text });
	save();
	return s.messages.length - 1;
}

const toBase64 = (blob: Blob) =>
	new Promise<string>((ok, fail) => {
		const r = new FileReader();
		r.onload = () => ok(String(r.result).split(",")[1]);
		r.onerror = () => fail(r.error);
		r.readAsDataURL(blob);
	});

/** Speech to text for a recorded clip (webm/opus in Chromium, mp4/aac in Safari and the desktop app). */
export async function transcribe(audio: Blob) {
	const mimeType = audio.type.split(";")[0] || "audio/webm";
	const parts = await call(STT_MODEL, { contents: [{ parts: [{ inlineData: { mimeType, data: await toBase64(audio) } }] }] });
	return parts.map((p) => p.audioTranscription?.text ?? p.text ?? "").join(" ").trim();
}

/** Text to speech: returns a playable WAV blob. */
export async function speech(text: string) {
	const plain = text.replace(/[*_`#>|]/g, "").replace(/^\s*[-+]\s+/gm, "").trim();
	const parts = await call(TTS_MODEL, {
		contents: [{ parts: [{ text: `Say in a warm, clear, unhurried teacher's voice:\n${plain}` }] }],
		generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
	});
	const audio = parts.find((p) => p.inlineData)?.inlineData;
	if (!audio) throw new Error("Gemini returned no audio.");
	const bytes = Uint8Array.from(atob(audio.data), (c) => c.charCodeAt(0));
	return new Blob([bytes], { type: audio.mimeType });
}

export function send(s: Session, text: string) {
	s.messages.push({ role: "user", text });
	save();
}

// Model replies render through the editor schema, so only known nodes/marks reach the DOM.
const md = new MarkdownManager({ extensions: [StarterKit.configure({ link: false })] });
export const toHtml = (text: string) => generateHTML(md.parse(text), [StarterKit.configure({ link: false })]);
