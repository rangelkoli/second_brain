import { generateHTML } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { MarkdownManager } from "@tiptap/markdown";
import { addTodo, createNote, getNote, updateNote } from "$lib/store.svelte";
import { auth, pb } from "$lib/sync.svelte";
import { reviewDates } from "./reviews";
import { parseTutorResponse, searchWikimediaImage, type Lab } from "./lab";
import { BUILTIN_CURRICULA, parseCurriculumJson, type CurriculumSubject } from "./curriculum";

// AI trainer: Gemini teaches in short plain-language chunks with retrieval questions,
// generates step-by-step interactive visual labs (Sketched AI style), and sees the
// learner's note and whiteboard on every turn.

export type Msg = {
	role: "user" | "model";
	text: string;
	lab?: Lab;
	topicSuggestion?: string;
};

// `note` is the vault path: note ids are per page load, the path is the stable identity.
export type Session = {
	id: string;
	note: string;
	topic: string;
	messages: Msg[];
	createdAt: number;
	reviews?: string[];
	curriculumNodeId?: string;
	completed?: boolean;
};

const MODEL = "gemini-4-hydrogen";
const STT_MODEL = "gemini-3.5-transcribe";
const TTS_MODEL = "gemini-3.8-flash-tts";
const SESSIONS = "trainer-sessions";
const CURRICULA_KEY = "trainer-curricula";
const COMPLETED_NODES_KEY = "trainer-completed-nodes";

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

store("trainer-gemini-key", null); // drop the key older builds kept in localStorage

export const sessions: Session[] = $state(load<Session[]>(SESSIONS, []));
const save = () => store(SESSIONS, JSON.stringify(sessions));
export const getSession = (id: string) => sessions.find((s) => s.id === id);
export const sessionForNode = (nodeId: string) => sessions.find((s) => s.curriculumNodeId === nodeId);

export const customCurricula: CurriculumSubject[] = $state(load<CurriculumSubject[]>(CURRICULA_KEY, []));
export const completedNodes = $state<Record<string, boolean>>(load<Record<string, boolean>>(COMPLETED_NODES_KEY, {}));

const saveCurricula = () => store(CURRICULA_KEY, JSON.stringify(customCurricula));
const saveCompleted = () => store(COMPLETED_NODES_KEY, JSON.stringify(completedNodes));

export const allCurricula = () => [...BUILTIN_CURRICULA, ...customCurricula];

export function toggleNodeCompleted(nodeId: string) {
	if (completedNodes[nodeId]) delete completedNodes[nodeId];
	else completedNodes[nodeId] = true;
	saveCompleted();
}

export function deleteCustomCurriculum(id: string) {
	const i = customCurricula.findIndex((c) => c.id === id);
	if (i >= 0) {
		customCurricula.splice(i, 1);
		saveCurricula();
	}
}

// Reactive per-session background generation status so learners can switch sessions while a lab builds.
export const pending = $state<Record<string, boolean>>({});
export const errors = $state<Record<string, string>>({});

const boardKey = (id: string) => `trainer-board:${id}`;
export const loadBoard = (id: string) => load<string | null>(boardKey(id), null);
export const saveBoard = (id: string, dataUrl: string | null) => store(boardKey(id), dataUrl && JSON.stringify(dataUrl));

export function latestLab(s: Session): Lab | undefined {
	for (let i = s.messages.length - 1; i >= 0; i--) {
		if (s.messages[i].lab) return s.messages[i].lab;
	}
	return undefined;
}

export function startSession(topic: string, level: string, opts?: { curriculumNodeId?: string }) {
	const noteId = createNote();
	updateNote(noteId, { title: `Learn: ${topic}`, content: "" });
	const id = crypto.randomUUID();
	const kickoff = `Teach me: ${topic}.${level.trim() ? ` What I already know: ${level.trim()}` : ""}`;
	sessions.unshift({
		id,
		note: getNote(noteId)!.path,
		topic,
		createdAt: Date.now(),
		messages: [{ role: "user", text: kickoff }],
		curriculumNodeId: opts?.curriculumNodeId,
	});
	save();
	return id;
}

export function deleteSession(id: string) {
	const i = sessions.findIndex((s) => s.id === id);
	if (i >= 0) sessions.splice(i, 1);
	delete pending[id];
	delete errors[id];
	save();
	saveBoard(id, null);
}

export function scheduleReviews(s: Session) {
	s.reviews = reviewDates(new Date());
	for (const date of s.reviews) addTodo(`Review: ${s.topic} (quiz yourself before rereading)`, date);
	if (s.curriculumNodeId) {
		completedNodes[s.curriculumNodeId] = true;
		saveCompleted();
	}
	s.completed = true;
	save();
}

const SYSTEM = `You are a friendly interactive tutor inside a note-taking app. Your replies may be read aloud, so talk like a person, not a textbook.

ALWAYS reply with valid JSON matching:
{
  "text": string,              // REQUIRED: your spoken/chat message (light Markdown, bold for key words)
  "lab"?: { ... },             // OPTIONAL: step-by-step interactive visual lab (include on first explanation of a concept, or whenever a visual/mutation helps!)
  "topicSuggestion"?: string   // OPTIONAL: if the learner suddenly asks about a completely unrelated topic, set a short title for a new session while still briefly helping or pointing them there
}

Keep "text" SHORT and SIMPLE:
- At most 60 words per reply (reviews: at most 4 short bullets). One idea per reply.
- Use everyday words a 12-year-old would follow. Explain terms in a few words right away.
- Short sentences. No tables, no long lists, no headings, no code blocks in "text" (put code inside lab.algorithm.code instead).

How you teach (evidence-based):
1. Explain one small idea (pair it with an interactive "lab" when a visual, sound, simulation, diagram, photo, or code stepper helps), then ask ONE question they answer from memory. Never answer it yourself before they try. Prefer "why" or "how" questions.
2. When they answer: say what's right, fix any mistake in one or two sentences, then go on.
3. Now and then, ask about an earlier idea again (spaced, mixed practice).
4. When a learner-drawn picture helps, suggest one simple sketch for the whiteboard.
5. Near the end, ask them to explain the whole thing simply, as if to a friend.

Each user turn includes the learner's current notes (markdown), any active lab summary, and—if they drew anything—a snapshot of their whiteboard. When asked to review notes/whiteboard, point at actual things in them: what's right, what's wrong, what's missing, and one improvement (no need for a new lab during a notes review). Otherwise mention notes/whiteboard only if something is wrong.

HOW TO BUILD "lab" (step-by-step interactive visual):
Every lab has: { "title": string, "kind": one of "music"|"geometry"|"algorithm"|"physics"|"language"|"image"|"sketch", "summary": string, "steps": [{ "title": string, "caption": string, ...stepFields }], "check"?: ... }
- Keep steps focused (3–6 steps). Each step's "caption" is 1–2 short spoken sentences synced to what highlights in that step.
- Pick the best "kind":
  1) "music": scales, intervals, key signatures, chord progressions, rhythm.
     music: { "mode": "scale"|"progression", "root": "B", "scaleName": "B Natural Minor", "notes": ["B4","C#5","D5","E5","F#5","G5","A5","B5"], "chords": [{"name":"Bm","notes":["B3","D4","F#4"]}], "bpm": 96, "drums": false, "drumVolume": 42, "relativeMajor": "D", "sharpsOrFlats": "2 sharps (F#, C#)" }
     Step fields: "highlight": ["B4","C#5"], "chordIndex": 0.
     If the user asks to "build a chord progression" or "add drums", return an updated "music" lab preserving the scale/key!
  2) "geometry": right triangles, Pythagorean theorem, triangle ratios.
     geometry: { "shape": "pythagorean"|"triangle", "a": 3, "b": 4, "c": 5, "labels": {"a":"a = 3","b":"b = 4","c":"c = 5"}, "showSquares": true }
     Step fields: "highlight": ["right-angle"|"hypotenuse"|"legs"|"squares"|"equation"].
  3) "algorithm": sorting/array algorithms with live step-by-step animation + code line highlight.
     algorithm: { "name": "Bubble Sort", "initialArray": [4,3,2,1], "language": "python", "code": "for i in range(n):\\n  ..." }
     Step fields: "array": [3,4,2,1], "comparing": [0,1], "swapped": true, "sortedFrom": 3, "codeLine": 3.
  4) "physics": projectile motion, angles, velocity vectors.
     physics: { "scenario": "projectile", "angle": 30, "speed": 20, "gravity": 9.81, "showVectors": true }
     Step fields: "angle": 30, "speed": 20, "t": 0.5 (0=launch, 0.5=peak, 1=land).
  5) "language": vocabulary, pronunciation, stress guides.
     language: { "languageName": "Romanian", "items": [{ "word": "Salut", "pronunciation": "sa-LUT", "meaning": "Hi / Hello", "tip": "Stress the second syllable.", "example": "Salut, Ana!", "exampleTranslation": "Hi, Ana!" }] }
     Step fields: "highlight": ["Salut"]. Include a "match" check when teaching 3+ words!
  6) "image": real-world visual topics (cars, paintings, landmarks, anatomy, instruments) where a real photo + callout boxes helps.
     image: { "query": "1965 Shelby GT350 Mustang", "annotations": [{ "id": "hood", "label": "Hood scoop", "x": 30, "y": 42, "w": 24, "h": 18 }] } (x,y,w,h in 0–100%).
     Step fields: "annotationIds": ["hood"].
  7) "sketch": ANY other topic (breadboard LED wiring, biology cell, TCP handshake packets, CPU pipeline, chemistry, etc.)!
     sketch: { "html": "<svg viewBox='0 0 600 320'>...</svg>" }
     Use CSS vars (--bg, --fg, --muted, --card, --border, --accent, --ok, --warn, --danger) and put data-step="0" or data-steps="0,1" on SVG/HTML elements so stepping dims inactive parts and lights up active parts! Keep scripts small and clean if needed (window.LAB.onStep((i, step) => ...), window.LAB.playTone(freq)).

Optional "check" inside "lab" (great for quick prediction or vocab matching before moving on):
- { "kind": "predict", "prompt": "...", "options": ["...","..."], "answerIndex": 0, "explanation": "..." }
- { "kind": "match", "prompt": "Match the pairs", "pairs": [{"left":"Salut","right":"Hi"}] }`;

// Gemini goes through the sync server (pocketbase/pb_hooks/gemini.pb.js), which holds GEMINI_API_KEY.
async function call(model: string, body: object) {
	if (!pb || !auth.valid) throw new Error("Sign in to the sync server to use the trainer.");
	// requestKey: null so concurrent calls (background sessions, speech) don't auto-cancel each other.
	const json = await pb.send(`/api/gemini/${model}`, { method: "POST", body, requestKey: null });
	return (json.candidates?.[0]?.content?.parts ?? []) as GeminiPart[];
}
type GeminiPart = { text?: string; thought?: boolean; inlineData?: { mimeType: string; data: string }; audioTranscription?: { text: string } };

export async function ask(s: Session, notes: string, board: string | null) {
	if (pending[s.id]) return -1;
	pending[s.id] = true;
	errors[s.id] = "";

	try {
		const contents = s.messages.map((m) => ({
			role: m.role,
			parts: [{ text: m.role === "model" && m.lab ? `${m.text}\n[Shown lab: ${m.lab.title} (${m.lab.kind})]` : m.text }],
		}));

		// Only the latest turn carries current notes, active lab state, and whiteboard snapshot.
		const last = contents.at(-1)!.parts as Record<string, unknown>[];
		const currentLab = latestLab(s);
		if (currentLab) {
			const labSummary = {
				title: currentLab.title,
				kind: currentLab.kind,
				music: currentLab.music,
				geometry: currentLab.geometry,
				physics: currentLab.physics,
				algorithm: currentLab.algorithm ? { name: currentLab.algorithm.name, initialArray: currentLab.algorithm.initialArray } : undefined,
			};
			last.push({ text: `--- Active lab right now ---\n${JSON.stringify(labSummary)}` });
		}
		last.push({ text: `--- My notes right now ---\n${notes.trim() || "(empty)"}` });
		if (board) last.push({ text: "--- My whiteboard right now ---" }, { inlineData: { mimeType: "image/jpeg", data: board.split(",")[1] } });

		const parts = await call(MODEL, {
			systemInstruction: { parts: [{ text: SYSTEM }] },
			contents,
			generationConfig: {
				thinkingConfig: { thinkingLevel: "low" },
				responseMimeType: "application/json",
			},
		});
		const raw = parts
			.filter((p) => !p.thought && p.text)
			.map((p) => p.text)
			.join("");
		if (!raw) throw new Error("Gemini returned no answer. Try again.");

		const reply = parseTutorResponse(raw);

		// Resolve Wikimedia image URL ahead of render if an image lab was generated.
		if (reply.lab?.kind === "image" && reply.lab.image && !reply.lab.image.resolvedUrl) {
			const hit = await searchWikimediaImage(reply.lab.image.query);
			if (hit) {
				reply.lab.image.resolvedUrl = hit.url;
				reply.lab.image.credit = hit.credit;
			}
		}

		s.messages.push({
			role: "model",
			text: reply.text,
			lab: reply.lab,
			topicSuggestion: reply.topicSuggestion,
		});
		save();
		return s.messages.length - 1;
	} catch (e) {
		errors[s.id] = e instanceof Error ? e.message : String(e);
		throw e;
	} finally {
		pending[s.id] = false;
	}
}

export async function generateCurriculum(goal: string): Promise<CurriculumSubject> {
	const prompt = `Build a concise, beginner-to-intermediate learning curriculum tree for: "${goal.trim()}".
Return valid JSON only:
{
  "title": "Short subject name",
  "branches": [
    {
      "title": "Branch name (3-4 branches total)",
      "nodes": [
        { "title": "Lesson title", "prompt": "Specific topic prompt for tutor", "summary": "1-sentence goal" }
      ]
    }
  ]
}
Include 3–4 branches with 2–4 concrete lessons each.`;

	const parts = await call(MODEL, {
		contents: [{ role: "user", parts: [{ text: prompt }] }],
		generationConfig: {
			thinkingConfig: { thinkingLevel: "low" },
			responseMimeType: "application/json",
		},
	});
	const raw = parts
		.filter((p) => !p.thought && p.text)
		.map((p) => p.text)
		.join("");
	const subject = parseCurriculumJson(raw, goal);
	if (!subject) throw new Error("Could not build a curriculum for that topic. Try rephrasing.");
	customCurricula.unshift(subject);
	saveCurricula();
	return subject;
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
