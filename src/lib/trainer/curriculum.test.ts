// @ts-nocheck -- plain node script, outside the app build
// Run: node src/lib/trainer/curriculum.test.ts
import assert from "node:assert";
import { BUILTIN_CURRICULA, parseCurriculumJson } from "./curriculum.ts";

assert.ok(BUILTIN_CURRICULA.length >= 5);
const math = BUILTIN_CURRICULA.find((c) => c.id === "math");
assert.ok(math);
assert.ok(math.branches.some((b) => b.title === "Geometry"));

const custom = parseCurriculumJson(
	JSON.stringify({
		title: "Distributed Systems",
		branches: [
			{
				title: "Consensus",
				nodes: [
					{ title: "Raft Leader Election", prompt: "How Raft leader election works", summary: "Terms, timeouts, and majority votes." },
					{ title: "Log Replication", prompt: "How Raft replicates logs safely", summary: "Commit index and safety." },
				],
			},
		],
	}),
	"Distributed Systems",
);
assert.ok(custom);
assert.strictEqual(custom.custom, true);
assert.strictEqual(custom.title, "Distributed Systems");
assert.strictEqual(custom.branches[0].nodes.length, 2);

assert.strictEqual(parseCurriculumJson("not json", "Anything"), null);

console.log("curriculum ok");
