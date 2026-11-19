/// <reference path="../pb_data/types.d.ts" />

// Gemini proxy for the trainer: the API key lives in the server's GEMINI_API_KEY env var, never in the browser.
// Signed-in users only, so a public deployment can't be used as a free Gemini relay.
// ponytail: no per-user rate limit; add one if the server is shared with untrusted accounts.
routerAdd(
	"POST",
	"/api/gemini/{model}",
	(e) => {
		const key = $os.getenv("GEMINI_API_KEY");
		if (!key) throw new BadRequestError("GEMINI_API_KEY is not set on the sync server.");
		const model = e.request.pathValue("model");
		if (!/^[a-z0-9.-]+$/.test(model)) throw new BadRequestError("Invalid model.");
		const res = $http.send({
			url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
			method: "POST",
			headers: { "content-type": "application/json", "x-goog-api-key": key },
			body: JSON.stringify(e.requestInfo().body),
			timeout: 300,
		});
		if (res.statusCode >= 400) {
			return e.json(res.statusCode, { message: res.json?.error?.message || `Gemini error ${res.statusCode}` });
		}
		return e.json(200, res.json);
	},
	$apis.requireAuth(),
);
