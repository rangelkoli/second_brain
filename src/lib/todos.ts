export type Todo = {
	id: string;
	text: string;
	done: boolean;
	date: string; // YYYY-MM-DD, "" = no date
};

// todos.md lines: "- [ ] text 📅 2026-10-18" (Obsidian Tasks format)

// ponytail: rewriting todos.md keeps only checklist lines; preserve other lines if agents start adding headings there.
const TODO_LINE = /^\s*[-*] \[([ xX])\] (.*?)(?:\s*📅\s*(\d{4}-\d{2}-\d{2}))?\s*$/;

export function parseTodos(text: string): Todo[] {
	return text.split("\n").flatMap((line) => {
		const m = TODO_LINE.exec(line);
		return m ? [{ id: crypto.randomUUID(), done: m[1] !== " ", text: m[2], date: m[3] ?? "" }] : [];
	});
}

export function serializeTodos(todos: Todo[]) {
	return todos.map((t) => `- [${t.done ? "x" : " "}] ${t.text}${t.date ? ` 📅 ${t.date}` : ""}`).join("\n") + "\n";
}
