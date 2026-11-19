// @ts-nocheck -- plain node script, outside the app build
// Run: node src/lib/trainer/curriculum.test.ts
import assert from "node:assert";
import { BUILTIN_CURRICULA, findNode, parseCurriculumJson } from "./curriculum.ts";

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
					{ title: "Log Replication", prompt: "How Raft replicates logs safely", summary: "Commit index and safety.", prereqs: ["raft leader election", "Nonexistent"] },
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

// Prereq titles resolve to node ids; unknown titles drop out.
assert.deepStrictEqual(custom.branches[0].nodes[1].prereqs, [custom.branches[0].nodes[0].id]);
assert.strictEqual(custom.branches[0].nodes[0].prereqs, undefined);
assert.deepStrictEqual(findNode(BUILTIN_CURRICULA, "cs-binarysearch").node.prereqs, ["cs-bubblesort"]);
assert.strictEqual(findNode(BUILTIN_CURRICULA, "cs-binarysearch").branch.id, "cs-algos");
// Every built-in prereq points at a real node.
for (const n of BUILTIN_CURRICULA.flatMap((c) => c.branches.flatMap((b) => b.nodes))) for (const id of n.prereqs ?? []) assert.ok(findNode(BUILTIN_CURRICULA, id), id);

assert.strictEqual(parseCurriculumJson("not json", "Anything"), null);

console.log("curriculum ok");
