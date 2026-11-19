/// <reference path="../pb_data/types.d.ts" />

// Trainer data (sessions, learner model, attempts, FSRS cards, tutor memory, AI usage), one owner per row.
// Contract: research scratchpad schema-contract.md. ai_usage is written only by pb_hooks/gemini.pb.js.
const mine = "user = @request.auth.id";
// Update also pins `user`, so a row can't be handed to another account.
const rules = {
	listRule: mine,
	viewRule: mine,
	createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id',
	updateRule: `${mine} && (@request.body.user:isset = false || @request.body.user = @request.auth.id)`,
	deleteRule: mine,
};
const timestamps = [
	{ name: "created", type: "autodate", onCreate: true },
	{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];
const text = (name, max = 5000, required = false) => ({ name, type: "text", max, required });
const num = (name, min, max) => ({ name, type: "number", min, max });
const json = (name, maxSize = 1024 * 1024) => ({ name, type: "json", maxSize });
const select = (name, values) => ({ name, type: "select", values, maxSelect: 1 });

const collections = {
	learn_sessions: {
		fields: [
			text("sid", 100, true), text("topic", 500), text("note_path", 1000), text("curriculum_node_id", 200),
			text("goal_date", 10), text("level", 100), json("messages", 5 * 1024 * 1024),
			{ name: "completed", type: "bool" }, text("summary"),
		],
		indexes: ["CREATE UNIQUE INDEX idx_learn_sessions_user_sid ON learn_sessions (user, sid)"],
	},
	concepts: {
		fields: [
			text("key", 200, true), text("title", 500), text("topic", 500),
			text("source_note_path", 1000), text("source_heading", 500), json("prereq_keys"),
			num("p_mastery", 0, 1), num("attempts", 0), num("correct", 0), { name: "last_seen", type: "date" },
		],
		indexes: ["CREATE UNIQUE INDEX idx_concepts_user_key ON concepts (user, key)"],
	},
	attempts: {
		fields: [
			text("sid", 100), json("concept_keys"), text("question"), text("answer"),
			json("key_points"), json("covered"), json("missed"),
			select("verdict", ["correct", "partial", "wrong"]),
			num("confidence", 1, 4), num("hints_used", 0), { name: "override", type: "bool" },
			select("source", ["chat", "lab", "review"]),
		],
		indexes: ["CREATE INDEX idx_attempts_user_sid ON attempts (user, sid)"],
	},
	cards: {
		fields: [
			text("concept_key", 200), select("kind", ["recall", "cloze", "apply"]), text("front"), text("back"),
			text("source_note_path", 1000), text("source_heading", 500), text("sid", 100),
			json("fsrs"), { name: "due", type: "date" }, { name: "suspended", type: "bool" },
		],
		indexes: ["CREATE INDEX idx_cards_user_due ON cards (user, due)"],
	},
	tutor_memory: {
		fields: [text("topic", 500), text("text", 2000), text("sid", 100)],
		indexes: ["CREATE INDEX idx_tutor_memory_user ON tutor_memory (user)"],
	},
	ai_usage: {
		// Clients may only read their own rows; the hook writes with $app, which skips rules.
		rules: { listRule: mine, viewRule: mine, createRule: null, updateRule: null, deleteRule: null },
		fields: [
			text("model", 100, true), text("day", 10, true),
			num("prompt_tokens", 0), num("cached_tokens", 0), num("output_tokens", 0), num("requests", 0),
		],
		// Unique (user, day, model): one row per model per day, and the (user, day) prefix serves the cap check.
		indexes: ["CREATE UNIQUE INDEX idx_ai_usage_user_day_model ON ai_usage (user, day, model)"],
	},
};

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users").id;
		for (const [name, c] of Object.entries(collections)) {
			app.save(
				new Collection({
					type: "base",
					name,
					...(c.rules || rules),
					fields: [
						{ name: "user", type: "relation", collectionId: users, required: true, maxSelect: 1, cascadeDelete: true },
						...c.fields,
						...timestamps,
					],
					indexes: c.indexes,
				}),
			);
		}
	},
	(app) => {
		for (const name of Object.keys(collections).reverse()) app.delete(app.findCollectionByNameOrId(name));
	},
);
