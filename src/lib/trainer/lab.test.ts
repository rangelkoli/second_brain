// @ts-nocheck -- plain node script, outside the app build
// Run: node src/lib/trainer/lab.test.ts
import assert from "node:assert";
import {
	LAB_PROMPT,
	SKETCH_CSP,
	TUTOR_SCHEMA,
	effectiveVerdict,
	inferSubjectTheme,
	labContext,
	mostlyRight,
	parseTutorResponse,
	trimHistory,
	verdictOf,
	wrapSketchHtml,
} from "./lab.ts";

// 1. Plain text fallback when model doesn't emit JSON
assert.deepStrictEqual(parseTutorResponse("Hello! Why does TCP need three steps?"), {
	text: "Hello! Why does TCP need three steps?",
});

// 2. Clean JSON with music lab and predict check
const musicReply = parseTutorResponse(
	JSON.stringify({
		text: "B natural minor uses two sharps: F# and C#. Try listening, then tell me which note is a half step above C#.",
		lab: {
			title: "B Natural Minor Scale",
			kind: "music",
			steps: [
				{ title: "Root B", caption: "Start on B.", highlight: ["B4"] },
				{ title: "Half step", caption: "C# to D is a half step.", highlight: ["C#5", "D5"] },
			],
			music: {
				mode: "scale",
				root: "B",
				scaleName: "B Natural Minor",
				notes: ["B4", "C#5", "D5", "E5", "F#5", "G5", "A5", "B5"],
				relativeMajor: "D",
				sharpsOrFlats: "2 sharps (F#, C#)",
			},
			check: {
				kind: "predict",
				prompt: "Which note is one half step above C#?",
				options: ["D", "D#", "E"],
				answerIndex: 0,
				explanation: "C# to D are adjacent keys with no key between them.",
			},
		},
	}),
);
assert.strictEqual(musicReply.lab?.kind, "music");
assert.strictEqual(musicReply.lab?.steps.length, 2);
assert.strictEqual(musicReply.lab?.check?.kind, "predict");
assert.strictEqual(musicReply.lab?.music?.relativeMajor, "D");

// 3. Fenced JSON + topicSuggestion
const fenced = parseTutorResponse(
	'```json\n{"text":"Good question! That is math rather than music.","topicSuggestion":"Pythagorean theorem"}\n```',
);
assert.strictEqual(fenced.topicSuggestion, "Pythagorean theorem");
assert.strictEqual(fenced.lab, undefined);

// 4. Invalid/empty lab payload falls back gracefully without crashing
const brokenLab = parseTutorResponse(
	JSON.stringify({
		text: "Let's check that idea.",
		lab: { kind: "language", title: "Empty", steps: [], language: { languageName: "Romanian", items: [] } },
	}),
);
assert.strictEqual(brokenLab.text, "Let's check that idea.");
assert.strictEqual(brokenLab.lab, undefined);

// 5. Sketch HTML wrapper injects theme & step listener
const wrapped = wrapSketchHtml('<svg><rect data-step="0" /></svg>', true);
assert.ok(wrapped.includes("--bg:#151515"));
assert.ok(wrapSketchHtml("<svg></svg>", false).includes("--bg:#fafafa"));
assert.ok(wrapped.includes("lab:step"));
assert.ok(wrapped.includes('<rect data-step="0" />'));
// CSP: no network, inline only
assert.ok(wrapped.includes(`<meta http-equiv="Content-Security-Policy" content="${SKETCH_CSP}" />`));
assert.ok(SKETCH_CSP.startsWith("default-src 'none'") && !/connect-src/.test(SKETCH_CSP));
// backward-compatible runtime API + declarative primitives
for (const hook of ["onStep", "playTone", "window.setStep", "data-draw", "data-flow", "data-pulse", "data-count", "data-move", "data-chip", "data-delay", "prefers-reduced-motion"]) {
	assert.ok(wrapped.includes(hook), `runtime missing ${hook}`);
}
// regexes in the runtime must keep their backslashes through the template string (\d not d)
assert.ok(!/[/(]d\+/.test(wrapped), "runtime regex lost an escape");
assert.ok(wrapped.includes("/\\d+/g"));
// runtime script must be valid JS after template escaping
new Function(/<script>([\s\S]*)<\/script>/.exec(wrapped)[1]);

// 5b. Lab authoring prompt documents the primitives and has an example sketch
assert.ok(LAB_PROMPT.startsWith('HOW TO BUILD "lab"'));
for (const k of ["data-draw", "data-flow", "data-move", "data-pulse", "data-count", "data-chip", "viewBox='0 0 600 340'"]) {
	assert.ok(LAB_PROMPT.includes(k), `prompt missing ${k}`);
}

// 6. Subject theme inference
assert.strictEqual(inferSubjectTheme("B minor scale"), "music");
assert.strictEqual(inferSubjectTheme("Bubble sort in Python"), "code");
assert.strictEqual(inferSubjectTheme("Pythagorean theorem"), "math");
assert.strictEqual(inferSubjectTheme("Projectile motion"), "physics");
assert.strictEqual(inferSubjectTheme("LED breadboard circuit"), "electronics");
assert.strictEqual(inferSubjectTheme("5 Romanian words"), "language");
assert.strictEqual(inferSubjectTheme("Coolest Mustang cars"), "art");

// 7. Schema reply -> validated fields: answer key only with a question, concept slugs normalized
const graded = parseTutorResponse(
	JSON.stringify({
		text: "Why does TCP need three steps?",
		check_question: " Why does TCP need three steps? ",
		expected_key_points: ["both sides confirm they can send", "both sides confirm they can receive", "", "both sides confirm they can send"],
		concept_ids: ["TCP Three-Way Handshake", "  "],
	}),
);
assert.deepStrictEqual(graded.check, {
	question: "Why does TCP need three steps?",
	keyPoints: ["both sides confirm they can send", "both sides confirm they can receive"],
});
assert.deepStrictEqual(graded.concepts, ["tcp-three-way-handshake"]);
const noQuestion = parseTutorResponse(JSON.stringify({ text: "Nice.", check_question: "", expected_key_points: [], concept_ids: [] }));
assert.strictEqual(noQuestion.check, undefined);
assert.strictEqual(noQuestion.concepts, undefined);
assert.strictEqual(parseTutorResponse(JSON.stringify({ text: "Q?", check_question: "Q?", expected_key_points: [] })).check, undefined);
for (const k of ["text", "check_question", "expected_key_points", "concept_ids"]) assert.ok(TUTOR_SCHEMA.required.includes(k));

// 8. Lab context: open lab's payload and captions go to the tutor, sketch HTML and image URLs don't
const ctx = labContext({
	id: "x",
	title: "TCP handshake",
	kind: "sketch",
	steps: [{ title: "SYN", caption: "Client says hi.", sketchState: { a: 1 } }],
	check: { kind: "predict", prompt: "What comes next?", options: ["ACK"], answerIndex: 0, explanation: "" },
	sketch: { html: "<svg>secret</svg>" },
});
assert.deepStrictEqual(ctx.steps, [{ title: "SYN", caption: "Client says hi." }]);
assert.deepStrictEqual(ctx.check, { kind: "predict", prompt: "What comes next?" });
assert.ok(!JSON.stringify(ctx).includes("svg") && !("id" in ctx));
const lang = labContext({ id: "l", title: "Greetings", kind: "language", steps: [], language: { languageName: "Romanian", items: [{ word: "Salut", pronunciation: "sa-LUT", meaning: "Hi" }] } });
assert.strictEqual(lang.language.items[0].word, "Salut");
const img = labContext({ id: "i", title: "Car", kind: "image", steps: [], image: { query: "Mustang", resolvedUrl: "https://x", annotations: [{ id: "a", label: "Hood", x: 1, y: 1, w: 5, h: 5 }] } });
assert.deepStrictEqual(img.image, { query: "Mustang", annotations: ["Hood"] });

// 9. Verdict computed in code from covered key points; override flips it
assert.strictEqual(verdictOf(["a", "b"], ["a", "b"]), "correct");
assert.strictEqual(verdictOf(["a", "b"], ["b"]), "partial");
assert.strictEqual(verdictOf(["a", "b"], []), "wrong");
assert.strictEqual(verdictOf(["a"], ["not a key point"]), "wrong");
assert.strictEqual(verdictOf([], []), "wrong");
assert.strictEqual(effectiveVerdict({ verdict: "partial", override: true }), "correct");
assert.strictEqual(effectiveVerdict({ verdict: "correct", override: true }), "wrong");
assert.strictEqual(effectiveVerdict({ verdict: "wrong" }), "wrong");
assert.strictEqual(mostlyRight(["correct", "correct"]), false); // too few answers
assert.strictEqual(mostlyRight(["correct", "correct", "wrong"]), true);
assert.strictEqual(mostlyRight(["correct", "partial", "wrong"]), false);

// 10. History trimming keeps the kickoff and drops whole blocks, so the prefix is stable between trims
const turns = (n) => Array.from({ length: n }, (_, i) => i);
assert.strictEqual(trimHistory(turns(60)).length, 60);
assert.deepStrictEqual(trimHistory(turns(61)).slice(0, 2), [0, 21]);
assert.deepStrictEqual(trimHistory(turns(61)), trimHistory(turns(61)));
assert.deepStrictEqual(trimHistory(turns(75)).slice(0, 2), [0, 21]); // same cut until the next block
assert.deepStrictEqual(trimHistory(turns(81)).slice(0, 2), [0, 41]);
assert.ok(trimHistory(turns(500)).length <= 61);

console.log("lab ok");
