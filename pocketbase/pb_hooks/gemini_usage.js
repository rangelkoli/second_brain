// Shared by the routes in gemini.pb.js (handlers run in isolated contexts, so they load this with require()).
// One ai_usage row per (user, day UTC, model); the cap counts requests across all models for the day.
const today = () => new Date().toISOString().slice(0, 10);

module.exports = {
	// Throws 429 once the user has used TRAINER_DAILY_REQUESTS (default 400) calls today.
	checkCap(userId) {
		const cap = parseInt($os.getenv("TRAINER_DAILY_REQUESTS"), 10) || 400;
		const rows = $app.findRecordsByFilter("ai_usage", "user = {:u} && day = {:d}", "", 0, 0, { u: userId, d: today() });
		const used = rows.reduce((n, r) => n + r.getInt("requests"), 0);
		if (used >= cap) {
			throw new TooManyRequestsError(`Daily trainer limit reached (${cap} AI requests). It resets at midnight UTC.`);
		}
	},

	// Adds one request plus the call's usageMetadata (absent for Live tokens) to today's row.
	addUsage(userId, model, usage) {
		const u = usage || {};
		// ponytail: the transaction serializes the read-modify-write (PocketBase has a single writer connection).
		$app.runInTransaction((txApp) => {
			let row;
			try {
				row = txApp.findFirstRecordByFilter("ai_usage", "user = {:u} && day = {:d} && model = {:m}", {
					u: userId,
					d: today(),
					m: model,
				});
			} catch (_) {
				row = new Record(txApp.findCollectionByNameOrId("ai_usage"), { user: userId, day: today(), model });
			}
			row.set("requests", row.getInt("requests") + 1);
			row.set("prompt_tokens", row.getInt("prompt_tokens") + (u.promptTokenCount || 0));
			row.set("cached_tokens", row.getInt("cached_tokens") + (u.cachedContentTokenCount || 0));
			row.set("output_tokens", row.getInt("output_tokens") + (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0));
			txApp.save(row);
		});
	},
};
