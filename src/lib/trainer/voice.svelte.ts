import { speech, transcribe } from "./trainer.svelte";

// Push-to-talk recording and spoken replies for the trainer + step narration in LabPlayer.
// ponytail: record-then-transcribe, not streaming; switch to the Live API if latency matters.

const KEY = "trainer-voice";
let saved = false;
try {
	saved = localStorage.getItem(KEY) === "1";
} catch {}

export const voice = $state({
	on: saved, // read new replies aloud
	recording: false,
	transcribing: false,
	loading: -1 as number | string, // message index or "lab" whose audio is being generated
	speaking: -1 as number | string, // message index or "lab" currently playing
});

export function toggleVoice() {
	voice.on = !voice.on;
	if (!voice.on) stopSpeaking();
	try {
		localStorage.setItem(KEY, voice.on ? "1" : "0");
	} catch {}
}

// --- speaking ---

const clips = new Map<string, Promise<string>>(); // reply text -> object URL, so replays are free
let audio: HTMLAudioElement | null = null;
let turn = 0; // bumps on every play/stop, so a slow TTS response can't start after the user moved on

export function stopSpeaking() {
	turn++;
	audio?.pause();
	audio = null;
	voice.speaking = voice.loading = -1;
}

export async function speak(index: number | string, text: string, onDone?: () => void) {
	stopSpeaking();
	const mine = turn;
	voice.loading = index;
	let url = clips.get(text);
	if (!url) {
		url = speech(text).then((b) => URL.createObjectURL(b));
		clips.set(text, url);
		url.catch(() => clips.delete(text));
	}
	try {
		const src = await url;
		if (mine !== turn) return;
		audio = new Audio(src);
		audio.onended = () => {
			if (mine === turn) {
				voice.speaking = -1;
				onDone?.();
			}
		};
		voice.loading = -1;
		voice.speaking = index;
		await audio.play();
	} catch (e) {
		if (mine === turn) voice.loading = voice.speaking = -1;
		throw e;
	}
}

// --- listening ---

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

export async function startRecording() {
	stopSpeaking();
	const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
	chunks = [];
	recorder = new MediaRecorder(stream);
	recorder.ondataavailable = (e) => chunks.push(e.data);
	recorder.onstop = () => stream.getTracks().forEach((t) => t.stop());
	recorder.start();
	voice.recording = true;
}

/** Stops the mic and returns what was said ("" if nothing). */
export function stopRecording() {
	const rec = recorder;
	recorder = null;
	voice.recording = false;
	if (!rec) return Promise.resolve("");
	return new Promise<string>((ok, fail) => {
		rec.addEventListener("stop", async () => {
			voice.transcribing = true;
			try {
				const clip = new Blob(chunks, { type: rec.mimeType });
				ok(clip.size ? await transcribe(clip) : "");
			} catch (e) {
				fail(e);
			} finally {
				voice.transcribing = false;
			}
		});
		rec.stop();
	});
}
