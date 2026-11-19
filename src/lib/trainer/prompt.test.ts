// @ts-nocheck -- plain node script, outside the app build
// Run: node src/lib/trainer/prompt.test.ts
import assert from "node:assert";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { LAB_PROMPT, TUTOR_SCHEMA, effectiveVerdict, labContext, trimHistory } from "./lab.ts";
import { GRADER, SYSTEM, gradeResult, graderRequest, turnText, tutorRequest } from "./prompt.ts";

const json = (v) => JSON.parse(JSON.stringify(v)); // what actually goes over the wire (drops undefined)

const lab = { id: "l1", title: "Handshake", kind: "algorithm", steps: [{ title: "SYN", caption: "Client says hi." }] };
const grade = { question: "Why three steps?", keyPoints: ["both sides confirm", "sequence numbers"], covered: ["both sides confirm"], missed: ["sequence numbers"], verdict: "partial", hints: 0, concepts: ["tcp"] };
const msgs = () => [
	{ role: "user", text: "Teach me: TCP." },
	{ role: "model", text: "TCP opens with a handshake. Why three steps?", lab, check: { question: "Why three steps?", keyPoints: grade.keyPoints } },
	{ role: "user", text: "So both sides know the other is there.", grade },
];

// 1. Same body as the pre-move inline code in ask() (copied from trainer.svelte.ts at 339ac48).
function legacy(messages, ctx, history, lastBoard) {
	const contents = trimHistory(messages).map((m) => ({ role: m.role, parts: [{ text: turnText(m) }] }));
	const last = contents.at(-1).parts;
	if (ctx.lab) last.push({ text: `--- Lab I have open ---\n${JSON.stringify(labContext(ctx.lab))}` });
	const notes = ctx.notes.trim();
	last.push({ text: `--- My notes right now ---\n${notes ? `${notes}\n\n(Tag a factual claim these notes don't support with [general knowledge] right after it, at most once per reply.)` : "(empty)"}` });
	if (history) last.push({ text: history });
	if (ctx.extra) last.push({ text: ctx.extra });
	const { board } = ctx;
	if (board && (ctx.forceBoard || lastBoard !== board)) last.push({ text: "--- My whiteboard right now ---" }, { inlineData: { mimeType: "image/jpeg", data: board.split(",")[1] } });
	return {
		systemInstruction: { parts: [{ text: SYSTEM }] },
		contents,
		tools: ctx.grounding ? [{ google_search: {} }] : undefined,
		generationConfig: { thinkingConfig: { thinkingLevel: "low" }, maxOutputTokens: 12000, responseMimeType: "application/json", responseJsonSchema: TUTOR_SCHEMA },
	};
}
const B1 = "data:image/jpeg;base64,AAA",
	B2 = "data:image/jpeg;base64,BBB";
for (const [ctx, history, prev] of [
	[{ notes: "", board: null }, "", undefined],
	[{ notes: "  # TCP\nSYN, SYN-ACK, ACK  ", board: B1, lab, extra: "--- Due ---", grounding: true }, "--- Learner history ---\nShaky: tcp", undefined],
	[{ notes: "x", board: B1 }, "", B1],
	[{ notes: "x", board: B1, forceBoard: true }, "", B1],
	[{ notes: "x", board: B2 }, "", B1],
])
	assert.deepStrictEqual(json(tutorRequest(msgs(), { ...ctx, history, prevBoard: prev })), json(legacy(msgs(), ctx, history, prev)));
assert.ok(SYSTEM.endsWith(LAB_PROMPT) && SYSTEM.includes("At most 60 words per reply"));

// 2. Only the latest turn carries notes/lab/history/board; earlier turns replay byte-identical (cache-stable prefix).
const ctx = { notes: "my notes", lab, history: "--- Learner history (from past practice) ---\nShaky: tcp", board: B1 };
const r1 = tutorRequest(msgs(), ctx);
const longer = [...msgs(), { role: "model", text: "Partly right: and sequence numbers?" }, { role: "user", text: "They sync counters." }];
const r2 = tutorRequest(longer, { ...ctx, notes: "edited notes", board: B2, prevBoard: B1 });
assert.deepStrictEqual(r2.contents.slice(0, 2), r1.contents.slice(0, 2));
assert.deepStrictEqual(r2.contents[2], { role: "user", parts: [{ text: turnText(msgs()[2]) }] }); // was the latest turn in r1, now plain
assert.ok(r2.contents.slice(0, -1).every((c) => c.parts.length === 1));
const lastParts = r2.contents.at(-1).parts;
assert.match(lastParts[1].text, /^--- Lab I have open ---/);
assert.match(lastParts[2].text, /^--- My notes right now ---\nedited notes\n\n\(Tag a factual claim/);
assert.match(lastParts[3].text, /^--- Learner history/);
assert.deepStrictEqual(lastParts.at(-1), { inlineData: { mimeType: "image/jpeg", data: "BBB" } });
assert.strictEqual(r2.systemInstruction.parts[0].text, SYSTEM);
assert.strictEqual(r2.tools, undefined);

// Whiteboard: only when changed (or forced); no history part when empty; empty notes say so.
const parts = (c) => tutorRequest(msgs(), { notes: "", ...c }).contents.at(-1).parts;
assert.ok(!parts({ board: B1, prevBoard: B1 }).some((p) => p.inlineData));
assert.ok(parts({ board: B1, prevBoard: B1, forceBoard: true }).some((p) => p.inlineData));
assert.ok(parts({ board: B2, prevBoard: B1 }).some((p) => p.inlineData));
assert.ok(!parts({ board: null, prevBoard: B1 }).some((p) => p.inlineData));
assert.deepStrictEqual(parts({ history: "" }).map((p) => p.text.split("\n")[0]), [turnText(msgs()[2]).split("\n")[0], "--- My notes right now ---"]);
assert.strictEqual(parts({}).at(-1).text, "--- My notes right now ---\n(empty)");

// 3. Replayed turns: hidden key on tutor turns, grader verdict on learner turns.
assert.strictEqual(turnText(msgs()[1]), "TCP opens with a handshake. Why three steps?\n[Shown lab: Handshake (algorithm)]\n[Asked: Why three steps? | answer key: both sides confirm; sequence numbers]");
assert.strictEqual(turnText(msgs()[2]), "So both sides know the other is there.\n[Grader: partial. Missed: sequence numbers]");
assert.strictEqual(turnText({ role: "user", text: "x", grade: { ...grade, override: true } }), "x\n[Grader: correct (learner override)]");
assert.strictEqual(turnText({ role: "user", text: "Show me", grade: { ...grade, shown: true } }), "Show me\n[Grader: answer revealed, counts as not answered]");
assert.strictEqual(turnText({ role: "user", text: "x", grade: { ...grade, verdict: "correct", covered: grade.keyPoints, missed: [] } }), "x\n[Grader: correct]");

// 4. Grading: code computes the verdict from the checklist; unknown points are ignored; attempted defaults to true.
const K = ["a", "b"];
assert.deepStrictEqual(gradeResult(K, { attempted: true, covered: ["a", "b"] }), { attempted: true, covered: ["a", "b"], missed: [], verdict: "correct" });
assert.deepStrictEqual(gradeResult(K, { covered: ["b", "zzz"] }), { attempted: true, covered: ["b"], missed: ["a"], verdict: "partial" });
assert.deepStrictEqual(gradeResult(K, {}), { attempted: true, covered: [], missed: K, verdict: "wrong" });
assert.strictEqual(gradeResult(K, { attempted: false, covered: [] }).attempted, false);
assert.strictEqual(gradeResult([], { covered: [] }).verdict, "wrong");
assert.strictEqual(effectiveVerdict({ verdict: "partial", override: true }), "correct");
const g = graderRequest("Why?", K, "because");
assert.strictEqual(g.systemInstruction.parts[0].text, GRADER);
assert.deepStrictEqual(JSON.parse(g.contents[0].parts[0].text), { question: "Why?", key_points: K, answer: "because" }); // never the chat
assert.deepStrictEqual(g.generationConfig.responseJsonSchema.properties.covered.items.enum, K);

// 5. The Gemini proxy rejects models outside its allowlist before metering or calling Google.
const handlers = {};
let sent = 0;
class BadRequestError extends Error {}
vm.runInNewContext(readFileSync(new URL("../../../pocketbase/pb_hooks/gemini.pb.js", import.meta.url), "utf8"), {
	routerAdd: (_m, path, fn) => (handlers[path] = fn),
	$apis: { requireAuth: () => null },
	$os: { getenv: () => "test-key" },
	$http: { send: () => (sent++, { statusCode: 200, json: {} }) },
	require: () => ({ checkCap() {}, addUsage() {} }),
	__hooks: ".",
	BadRequestError,
});
const proxy = (model) =>
	handlers["/api/gemini/{model}"]({ request: { pathValue: () => model }, auth: { id: "u1" }, requestInfo: () => ({ body: {} }), json: (status, body) => ({ status, body }) });
for (const bad of ["gemini-4-neon", "gemini-2.5-pro", "../models/x", ""]) assert.throws(() => proxy(bad), BadRequestError);
assert.strictEqual(sent, 0);
for (const ok of ["gemini-4-hydrogen", "gemini-3.5-transcribe", "gemini-3.8-flash-tts"]) assert.strictEqual(proxy(ok).status, 200);
assert.strictEqual(sent, 3);

console.log("prompt.test.ts: ok");
