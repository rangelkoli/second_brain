// @ts-nocheck -- plain node script, outside the app build
// Run: node src/lib/todos.test.ts
import assert from "node:assert";
import { parseTodos, serializeTodos } from "./todos.ts";

const md = "# Inbox\n- [ ] Buy milk 📅 2026-10-18\n- [x] Ship it\n  * [X] nested 📅 2026-01-02  \nnot a todo\n";
const todos = parseTodos(md);
assert.deepStrictEqual(
	todos.map(({ id, ...t }) => t),
	[
		{ done: false, text: "Buy milk", date: "2026-10-18" },
		{ done: true, text: "Ship it", date: "" },
		{ done: true, text: "nested", date: "2026-01-02" },
	],
);
assert.strictEqual(serializeTodos(todos), "- [ ] Buy milk 📅 2026-10-18\n- [x] Ship it\n- [x] nested 📅 2026-01-02\n");
assert.deepStrictEqual(parseTodos(serializeTodos(todos)).map(({ id, ...t }) => t), todos.map(({ id, ...t }) => t));
console.log("todos ok");
