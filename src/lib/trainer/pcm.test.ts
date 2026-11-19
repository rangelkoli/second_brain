// @ts-nocheck -- plain node script, outside the app build
// Run: node src/lib/trainer/pcm.test.ts
import assert from "node:assert";
import { downsampler, floatTo16, fromBase64, int16ToFloat, parseServer, rateOf, rms, toBase64 } from "./pcm.ts";

// float → int16 LE: clamps, full scale both ways, round-trips within one step.
const bytes = floatTo16(Float32Array.from([0, 1, -1, 2, -2, 0.5]));
const v = new DataView(bytes.buffer);
assert.deepStrictEqual([0, 1, 2, 3, 4].map((i) => v.getInt16(i * 2, true)), [0, 32767, -32768, 32767, -32768]);
assert.strictEqual(bytes[2], 0xff); // little-endian low byte of 32767
const back = int16ToFloat(bytes);
assert.ok(Math.abs(back[5] - 0.5) < 2 / 32768);
assert.deepStrictEqual(fromBase64(toBase64(bytes)), bytes);

// 48 kHz → 16 kHz: a third of the samples, gapless across odd-sized chunks, averages each window.
const ds = downsampler(48000, 16000);
let n = 0;
for (const size of [128, 128, 100, 4096, 7]) n += ds(new Float32Array(size).fill(0.3)).length;
const total = 128 + 128 + 100 + 4096 + 7;
assert.ok(Math.abs(n - total / 3) <= 1, `got ${n} samples for ${total}`);
assert.deepStrictEqual([...downsampler(48000, 16000)(Float32Array.from([0, 0.3, 0.6, 1, 1, 1]))].map((x) => +x.toFixed(2)), [0.3, 1]);
// 44.1 kHz (fractional step) keeps the rate too.
const ds2 = downsampler(44100, 16000);
let m = 0;
for (let i = 0; i < 100; i++) m += ds2(new Float32Array(441)).length;
assert.ok(Math.abs(m - 16000) <= 1, `44.1k: ${m}`);

assert.strictEqual(rms(Float32Array.from([0.5, -0.5])), 0.5);
assert.strictEqual(rateOf("audio/pcm;rate=24000"), 24000);
assert.strictEqual(rateOf("audio/pcm;rate=16000"), 16000);
assert.strictEqual(rateOf(), 24000);

// Server messages, shapes as seen on gemini-3.8-live.
assert.deepStrictEqual(parseServer({ setupComplete: {} }), [{ type: "ready" }]);
assert.deepStrictEqual(parseServer({}), []);
assert.deepStrictEqual(parseServer({ sessionResumptionUpdate: { newHandle: "h1", resumable: true } }), [{ type: "handle", handle: "h1" }]);
assert.deepStrictEqual(parseServer({ sessionResumptionUpdate: { resumable: false } }), []);
assert.deepStrictEqual(
	parseServer({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: "AAA=" } }] }, outputTranscription: { text: "Hi" } } }),
	[{ type: "audio", data: "AAA=", rate: 24000 }, { type: "output", text: "Hi" }],
);
assert.deepStrictEqual(parseServer({ serverContent: { inputTranscription: { text: "why" } } }), [{ type: "input", text: "why" }]);
assert.deepStrictEqual(parseServer({ serverContent: { interrupted: true } }), [{ type: "interrupted" }]);
assert.deepStrictEqual(parseServer({ serverContent: { generationComplete: true } }), []);
assert.deepStrictEqual(parseServer({ serverContent: { turnComplete: true } }), [{ type: "turnComplete" }]);
assert.deepStrictEqual(parseServer({ toolCall: { functionCalls: [{ name: "show_lab", args: { lab_json: "{}" }, id: "c1" }] } }), [
	{ type: "toolCall", calls: [{ id: "c1", name: "show_lab", args: { lab_json: "{}" } }] },
]);
assert.deepStrictEqual(parseServer({ goAway: { timeLeft: "10s" } }), [{ type: "goAway", timeLeft: "10s" }]);

console.log("pcm ok");
