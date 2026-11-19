// Pure audio + message helpers for the Live voice client (live.svelte.ts). No DOM, so node can test them.

/** Stateful downsampler: averages each output sample's input window (a cheap anti-alias filter). Keeps its
 *  fractional position across chunks so 48 kHz → 16 kHz (or 44.1 → 16) stays gapless. */
export function downsampler(from: number, to: number) {
	const step = from / to;
	let pos = 0; // where the next output sample starts, in input samples, relative to the current chunk
	let carry = new Float32Array(0); // tail of the previous chunk the next window still needs
	return (chunk: Float32Array) => {
		const buf = new Float32Array(carry.length + chunk.length);
		buf.set(carry);
		buf.set(chunk, carry.length);
		const out: number[] = [];
		while (pos + step <= buf.length) {
			const a = Math.floor(pos);
			const b = Math.floor(pos + step);
			let sum = 0;
			for (let i = a; i < b; i++) sum += buf[i];
			out.push(b > a ? sum / (b - a) : buf[a]);
			pos += step;
		}
		const keep = Math.floor(pos);
		carry = buf.slice(keep);
		pos -= keep;
		return Float32Array.from(out);
	};
}

/** Float [-1, 1] → 16-bit signed PCM, little-endian bytes. */
export function floatTo16(f: Float32Array) {
	const view = new DataView(new ArrayBuffer(f.length * 2));
	for (let i = 0; i < f.length; i++) {
		const x = Math.max(-1, Math.min(1, f[i]));
		view.setInt16(i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
	}
	return new Uint8Array(view.buffer);
}

/** 16-bit little-endian PCM bytes → floats, for an AudioBuffer. */
export function int16ToFloat(bytes: Uint8Array) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const out = new Float32Array(bytes.byteLength >> 1);
	for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
	return out;
}

export function toBase64(bytes: Uint8Array) {
	let s = "";
	for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(s);
}
export const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export const rms = (f: Float32Array) => Math.sqrt(f.reduce((a, x) => a + x * x, 0) / (f.length || 1));

/** "audio/pcm;rate=24000" → 24000 (the Live API's default output rate when absent). */
export const rateOf = (mime = "") => Number(/rate=(\d+)/.exec(mime)?.[1]) || 24000;

export type LiveEvent =
	| { type: "ready" }
	| { type: "audio"; data: string; rate: number }
	| { type: "input"; text: string }
	| { type: "output"; text: string }
	| { type: "interrupted" }
	| { type: "turnComplete" }
	| { type: "toolCall"; calls: { id: string; name: string; args: Record<string, unknown> }[] }
	| { type: "handle"; handle: string }
	| { type: "goAway"; timeLeft?: string };

/** One BidiGenerateContent server message → the events the client acts on, in order. Unknown fields are ignored. */
export function parseServer(m: Record<string, any>): LiveEvent[] {
	const ev: LiveEvent[] = [];
	if (m.setupComplete) ev.push({ type: "ready" });
	const sc = m.serverContent;
	if (sc) {
		if (sc.interrupted) ev.push({ type: "interrupted" });
		if (sc.inputTranscription?.text) ev.push({ type: "input", text: sc.inputTranscription.text });
		for (const p of sc.modelTurn?.parts ?? [])
			if (p.inlineData?.data && String(p.inlineData.mimeType ?? "audio/pcm").startsWith("audio/"))
				ev.push({ type: "audio", data: p.inlineData.data, rate: rateOf(p.inlineData.mimeType) });
		if (sc.outputTranscription?.text) ev.push({ type: "output", text: sc.outputTranscription.text });
		if (sc.turnComplete) ev.push({ type: "turnComplete" });
	}
	if (m.toolCall?.functionCalls?.length)
		ev.push({ type: "toolCall", calls: m.toolCall.functionCalls.map((c: any) => ({ id: c.id, name: c.name, args: c.args ?? {} })) });
	const u = m.sessionResumptionUpdate;
	if (u?.resumable && u.newHandle) ev.push({ type: "handle", handle: u.newHandle });
	if (m.goAway) ev.push({ type: "goAway", timeLeft: m.goAway.timeLeft });
	return ev;
}
