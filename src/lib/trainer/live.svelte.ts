import { pb } from "$lib/sync.svelte";
import { LAB_PROMPT, sanitizeLab, searchWikimediaImage, type Lab } from "./lab";
import { SYSTEM } from "./prompt";
import { liveHistory, saveSession, type Msg, type Session } from "./trainer.svelte";
import { stopSpeaking } from "./voice.svelte";
import { downsampler, floatTo16, fromBase64, int16ToFloat, parseServer, rms, toBase64, type LiveEvent } from "./pcm";

// Real-time voice through the Gemini Live API. The sync server mints a single-use token locked to
// gemini-3.8-live with this session's system instruction (pocketbase/pb_hooks/gemini.pb.js); the browser then
// talks to Google directly: 16 kHz PCM up, 24 kHz PCM down, transcripts both ways into the session.

const WS = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
const CAP = 20000; // the token route's systemInstruction limit
const MAX_RETRIES = 3;

export type LiveStatus = "off" | "connecting" | "listening" | "speaking" | "reconnecting";
export const live = $state({ status: "off" as LiveStatus, level: 0, sid: "" });

export const liveSupported = () =>
	typeof window !== "undefined" && typeof AudioWorkletNode !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof WebSocket !== "undefined";

const VOICE = `LIVE VOICE CALL
This is a spoken conversation: you hear the learner and answer out loud. The teaching rules above still apply, but there are no reply fields, you just talk. At most about 40 words per turn. No Markdown, and never read out symbols, code or links. Ask one question, then stop and let the learner answer.
To put a visual in the learner's Lab panel, call show_lab with lab_json set to the lab object as a JSON string, built as described below. Do it on the first explanation of a concept or when the learner asks to see something, then say one short sentence about what it shows.`;

// Verified on gemini-3.8-live: a loosely typed object parameter (type object, no properties) is never called,
// while a JSON string parameter is, so the lab travels as a string and goes through sanitizeLab.
const SHOW_LAB = {
	name: "show_lab",
	description: "Show an interactive visual lab in the learner's Lab panel.",
	parameters: {
		type: "object",
		properties: { lab_json: { type: "string", description: "The lab object as a JSON string: title, kind, summary, steps, optional check, and the payload object named after the kind (for a sketch: \"sketch\": { \"html\": \"<svg ...>\" })." } },
		required: ["lab_json"],
	},
};

/** Teaching rules + voice rules + lab format + lesson, learner history, recent turns and notes, within the cap. */
export function liveInstruction(s: Session, notes: string) {
	const rules = SYSTEM.split("\nWHAT YOU SEE")[0].trim();
	const lesson = s.messages[0]?.text.split("\n\n")[0] ?? `Teach me: ${s.topic}`;
	const recent = s.messages
		.slice(1)
		.slice(-8)
		.map((m) => `${m.role === "user" ? "Learner" : "Tutor"}: ${m.text}`)
		.join("\n")
		.slice(-3000);
	const head = [
		rules,
		VOICE,
		LAB_PROMPT,
		`--- Lesson ---\n${lesson}`,
		liveHistory(s),
		recent && `--- Conversation so far (continue from here, don't repeat it) ---\n${recent}`,
	]
		.filter(Boolean)
		.join("\n\n");
	return `${head}\n\n--- Learner's notes right now ---\n${notes.trim() || "(empty)"}`.slice(0, CAP);
}

type Conn = {
	s: Session;
	instruction: string;
	onLab: (lab: Lab) => void;
	onError: (msg: string) => void;
	model?: string;
	ws?: WebSocket;
	ctx?: AudioContext;
	stream?: MediaStream;
	node?: AudioWorkletNode;
	handle?: string; // latest session resumption handle
	ready: boolean;
	retries: number;
	sources: Set<AudioBufferSourceNode>;
	next: number; // AudioContext time the next output chunk starts at
	turnOpen: boolean; // the tutor is mid-turn (audio or text arriving)
	muted: boolean; // the learner tapped Interrupt: drop the rest of this turn
	user?: Msg; // the open (still streaming) transcript messages
	tutor?: Msg;
};
let cur: Conn | null = null;

export async function startLive(s: Session, o: { notes: string; onLab: (lab: Lab) => void; onError: (msg: string) => void }) {
	stopLive();
	stopSpeaking();
	const me: Conn = { s, instruction: liveInstruction(s, o.notes), onLab: o.onLab, onError: o.onError, ready: false, retries: 0, sources: new Set(), next: 0, turnOpen: false, muted: false };
	cur = me;
	live.sid = s.id;
	live.status = "connecting";
	try {
		if (!pb) throw new Error("Sign in to the sync server to use Live voice.");
		me.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
		me.ctx = new AudioContext();
		await me.ctx.audioWorklet.addModule("/live-mic.worklet.js");
		if (cur !== me) return; // stopped while the mic prompt was open
		me.node = new AudioWorkletNode(me.ctx, "live-mic");
		const down = downsampler(me.ctx.sampleRate, 16000);
		me.node.port.onmessage = (e: MessageEvent<Float32Array>) => {
			live.level = Math.max(Math.min(1, rms(e.data) * 5), live.level * 0.6);
			const pcm = down(e.data);
			if (me.ready && me.ws?.readyState === WebSocket.OPEN && pcm.length)
				me.ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: toBase64(floatTo16(pcm)) } } }));
		};
		// A muted sink keeps the worklet pulled by the graph in every browser.
		const sink = me.ctx.createGain();
		sink.gain.value = 0;
		me.ctx.createMediaStreamSource(me.stream).connect(me.node).connect(sink).connect(me.ctx.destination);
		await connect(me);
	} catch (e) {
		fail(me, e);
	}
}

async function connect(me: Conn) {
	me.ready = false;
	const { token, model } = await pb!.send("/api/gemini-live/token", { method: "POST", body: { systemInstruction: me.instruction }, requestKey: null });
	if (cur !== me) return;
	me.model = model;
	const ws = new WebSocket(`${WS}?access_token=${token}`);
	ws.binaryType = "arraybuffer"; // decoded synchronously, so messages are handled in order
	me.ws = ws;
	ws.onopen = () =>
		ws.send(
			JSON.stringify({
				setup: {
					model: `models/${me.model}`,
					generationConfig: { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
					tools: [{ functionDeclarations: [SHOW_LAB] }],
					sessionResumption: me.handle ? { handle: me.handle } : {},
					contextWindowCompression: { slidingWindow: {} },
				},
			}),
		);
	ws.onmessage = (ev) => {
		if (me.ws !== ws) return;
		const text = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data);
		for (const e of parseServer(JSON.parse(text))) onEvent(me, e);
	};
	ws.onclose = (ev) => {
		if (cur === me && me.ws === ws) reconnect(me, ev.reason || `code ${ev.code}`);
	};
}

/** Tokens are single use, so every reconnect mints a new one and resumes with the latest handle. */
async function reconnect(me: Conn, why: string) {
	const old = me.ws;
	me.ws = undefined;
	old?.close();
	if (me.retries++ >= MAX_RETRIES) return fail(me, new Error(`Disconnected (${why}).`));
	live.status = "reconnecting";
	flush(me);
	endTurn(me);
	// Resuming right after a close gets "session is already connected to an existing client" (1008); give it a second.
	await new Promise((ok) => setTimeout(ok, 1000 * me.retries));
	if (cur !== me) return;
	try {
		await connect(me);
	} catch (e) {
		fail(me, e);
	}
}

function onEvent(me: Conn, e: LiveEvent) {
	switch (e.type) {
		case "ready":
			me.ready = true;
			me.retries = 0;
			live.status = "listening";
			break;
		case "handle":
			me.handle = e.handle;
			break;
		case "goAway":
			reconnect(me, "server going away");
			break;
		case "input":
			me.user = append(me, me.user, "user", e.text);
			break;
		case "audio":
			if (me.muted) break;
			startTurn(me);
			play(me, e.data, e.rate);
			break;
		case "output":
			if (me.muted) break;
			startTurn(me);
			me.tutor = append(me, me.tutor, "model", e.text);
			break;
		case "interrupted":
			flush(me);
			endTurn(me, true);
			break;
		case "turnComplete":
			endTurn(me);
			break;
		case "toolCall":
			me.ws?.send(JSON.stringify({ toolResponse: { functionResponses: e.calls.map((c) => ({ id: c.id, name: c.name, response: showLab(me, c) })) } }));
			break;
	}
}

// ponytail: transcripts arrive ahead of the audio, so a cut-off turn can keep a few words that were never heard.
function append(me: Conn, m: Msg | undefined, role: Msg["role"], text: string) {
	if (!m) {
		if (!text.trim()) return undefined;
		me.s.messages.push({ role, text: "" });
		m = me.s.messages.at(-1)!; // the $state proxy, so streamed text renders
	}
	m.text += text;
	return m;
}

function startTurn(me: Conn) {
	me.turnOpen = true;
	if (me.user) {
		// The learner's utterance is over once the tutor answers.
		me.user.text = me.user.text.trim();
		me.user = undefined;
		saveSession(me.s);
	}
}

function endTurn(me: Conn, cut = false) {
	me.turnOpen = me.muted = false;
	const t = me.tutor;
	if (t && !t.text.trim() && t.lab) return; // a lab shown before speaking: the spoken part lands in the same message
	if (t) t.text = t.text.trim() + (cut ? " …" : "");
	me.tutor = undefined;
	saveSession(me.s);
}

function showLab(me: Conn, c: { name: string; args: Record<string, unknown> }) {
	if (c.name !== "show_lab") return { error: `Unknown function ${c.name}.` };
	let raw: unknown = c.args.lab_json;
	try {
		if (typeof raw === "string") raw = JSON.parse(raw);
	} catch {
		return { error: "lab_json is not valid JSON. Send the lab object as a JSON string." };
	}
	// Seen live: a sketch's "html" at the top level instead of under "sketch". Let the kind's fields sit either way.
	const r = raw as Record<string, unknown> | null;
	if (r && typeof r === "object" && typeof r.kind === "string" && !r[r.kind]) r[r.kind] = { ...r };
	const lab = sanitizeLab(r);
	if (!lab) return { error: `That lab is invalid: it needs a known "kind" and a "${String(r?.kind ?? "kind")}" object with that kind's fields. Fix it and call show_lab again.` };
	startTurn(me);
	if (!me.tutor) {
		me.s.messages.push({ role: "model", text: "" });
		me.tutor = me.s.messages.at(-1)!;
	}
	me.tutor.lab = lab;
	saveSession(me.s);
	if (lab.kind === "image" && lab.image && !lab.image.resolvedUrl)
		searchWikimediaImage(lab.image.query).then((hit) => {
			if (hit && me.tutor?.lab?.id === lab.id) Object.assign(me.tutor.lab.image!, { resolvedUrl: hit.url, credit: hit.credit });
			saveSession(me.s);
		});
	me.onLab(me.tutor.lab!);
	return { result: "Shown in the learner's Lab panel." };
}

function play(me: Conn, b64: string, rate: number) {
	const ctx = me.ctx;
	if (!ctx) return;
	const f = int16ToFloat(fromBase64(b64));
	if (!f.length) return;
	const buf = ctx.createBuffer(1, f.length, rate);
	buf.copyToChannel(f, 0);
	const src = ctx.createBufferSource();
	src.buffer = buf;
	src.connect(ctx.destination);
	const at = Math.max(ctx.currentTime + 0.03, me.next); // back to back: gapless
	src.start(at);
	me.next = at + buf.duration;
	me.sources.add(src);
	live.status = "speaking";
	src.onended = () => {
		me.sources.delete(src);
		if (!me.sources.size && cur === me && live.status === "speaking") live.status = "listening";
	};
}

/** Barge-in: drop every queued chunk now. */
function flush(me: Conn) {
	for (const src of me.sources) {
		src.onended = null;
		try {
			src.stop();
		} catch {}
	}
	me.sources.clear();
	me.next = 0;
	if (cur === me && live.status === "speaking") live.status = "listening";
}

/** The learner taps to cut the tutor off: silence now, ignore the rest of this turn. */
export function interruptLive() {
	const me = cur;
	if (!me) return;
	flush(me);
	if (me.turnOpen) {
		endTurn(me, true);
		me.muted = true; // until the server ends or interrupts the turn
	}
}

/** A typed message during a Live call goes to the Live tutor, not the text tutor. */
export function sendLiveText(text: string) {
	const me = cur;
	if (!me?.ready || me.ws?.readyState !== WebSocket.OPEN || !text.trim()) return false;
	interruptLive();
	me.s.messages.push({ role: "user", text: text.trim() });
	saveSession(me.s);
	me.ws.send(JSON.stringify({ realtimeInput: { text: text.trim() } }));
	return true;
}

export function stopLive() {
	const me = cur;
	if (!me) return;
	cur = null;
	if (me.user) me.user.text = me.user.text.trim();
	endTurn(me);
	saveSession(me.s);
	const ws = me.ws;
	me.ws = undefined;
	ws?.close();
	flush(me);
	if (me.node) me.node.port.onmessage = null;
	me.stream?.getTracks().forEach((t) => t.stop());
	me.ctx?.close().catch(() => {});
	live.status = "off";
	live.level = 0;
	live.sid = "";
}

function fail(me: Conn, e: unknown) {
	if (cur !== me) return;
	stopLive();
	const name = (e as { name?: string })?.name;
	me.onError(
		name === "NotAllowedError"
			? "Microphone access is blocked. Allow it in your browser settings."
			: e instanceof Error
				? e.message
				: String(e),
	);
}
