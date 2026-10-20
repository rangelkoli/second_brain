import { TaskList } from "@tiptap/extension-list";
import { Table } from "@tiptap/extension-table";

// Tiptap's table and task-list tokenizers split the *entire remaining document* into lines every
// time marked probes a block, which makes parsing quadratic (~370ms for a 45KB note in the webview).
// Both only ever look at the block in front of them, so hand them just that block.

type Tokenizer = { start?: (src: string, ...r: unknown[]) => number; tokenize: (src: string, ...r: unknown[]) => unknown };

// Table start only reads the first two lines.
const table = Table.config.markdownTokenizer as Tokenizer;
const tableStart = table.start!;
table.start = (src, ...r) => tableStart(src.slice(0, nthNewline(src, 2)), ...r);

// A task list ends at a blank line followed by a line that is neither indented nor another task.
const tasks = TaskList.config.markdownTokenizer as Tokenizer;
const tasksTokenize = tasks.tokenize;
tasks.tokenize = (src, ...r) => tasksTokenize(src.slice(0, listEnd(src)), ...r);

function nthNewline(src: string, n: number) {
	let i = -1;
	while (n-- > 0 && (i = src.indexOf("\n", i + 1)) >= 0);
	return i < 0 ? src.length : i;
}

export function listEnd(src: string) {
	const re = /\n[ \t]*\n(?![ \t]|[-*+] \[[ xX]\])/g;
	const m = re.exec(src);
	return m ? m.index + 1 : src.length;
}
