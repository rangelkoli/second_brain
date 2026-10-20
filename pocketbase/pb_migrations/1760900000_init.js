/// <reference path="../pb_data/types.d.ts" />

// Every vault file is one `files` record keyed by its vault-relative path ("Projects/Launch.md",
// "todos.md"); attachments are `attachments` records keyed the same way. Signed-in users only.
// ponytail: single-user rules (any signed-in user sees everything); add an owner field for multi-user.
const signedIn = '@request.auth.id != ""';
const rules = { listRule: signedIn, viewRule: signedIn, createRule: signedIn, updateRule: signedIn, deleteRule: signedIn };
const timestamps = [
	{ name: "created", type: "autodate", onCreate: true },
	{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];

migrate(
	(app) => {
		app.save(
			new Collection({
				type: "base",
				name: "files",
				...rules,
				fields: [
					{ name: "path", type: "text", required: true, max: 1000 },
					{ name: "content", type: "text", max: 10000000 },
					...timestamps,
				],
				indexes: ["CREATE UNIQUE INDEX idx_files_path ON files (path)"],
			}),
		);

		app.save(
			new Collection({
				type: "base",
				name: "attachments",
				...rules,
				fields: [
					{ name: "path", type: "text", required: true, max: 1000 },
					// ponytail: unprotected so <img> URLs work without tokens; file names are random but anyone with a URL can fetch it.
					{ name: "file", type: "file", required: true, maxSelect: 1, maxSize: 100 * 1024 * 1024 },
					...timestamps,
				],
				indexes: ["CREATE UNIQUE INDEX idx_attachments_path ON attachments (path)"],
			}),
		);

		// No public sign-ups: create your account in the dashboard (/_/).
		const users = app.findCollectionByNameOrId("users");
		users.createRule = null;
		app.save(users);
	},
	(app) => {
		for (const name of ["files", "attachments"]) app.delete(app.findCollectionByNameOrId(name));
	},
);
