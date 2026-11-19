/// <reference path="../pb_data/types.d.ts" />

// Gemini proxy for the trainer: the API key lives in the server's GEMINI_API_KEY env var, never in the browser.
// Signed-in users only, capped per user per day (TRAINER_DAILY_REQUESTS, default 400), metered into ai_usage.
routerAdd(
	"POST",
	"/api/gemini/{model}",
	(e) => {
		const usage = require(`${__hooks}/gemini_usage.js`);
		const key = $os.getenv("GEMINI_API_KEY");
		if (!key) throw new BadRequestError("GEMINI_API_KEY is not set on the sync server.");
		const model = e.request.pathValue("model");
		if (!["gemini-4-hydrogen", "gemini-3.5-transcribe", "gemini-3.8-flash-tts"].includes(model)) {
			throw new BadRequestError(`Model not allowed: ${model}`);
		}
		usage.checkCap(e.auth.id);
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
		usage.addUsage(e.auth.id, model, res.json?.usageMetadata);
		return e.json(200, res.json);
	},
	$apis.requireAuth(),
);

// Mints a single-use Live API token locked to gemini-3.8-live, audio replies, transcripts both ways and the
// caller's system instruction. The browser then opens the Live WebSocket to Google directly with it
// (v1beta BidiGenerateContentConstrained?access_token=...). Other setup fields (tools, sessionResumption,
// contextWindowCompression, speechConfig) stay up to the client. Live token usage happens on that socket,
// so ai_usage only counts the mint as one request.
routerAdd(
	"POST",
	"/api/gemini-live/token",
	(e) => {
		const usage = require(`${__hooks}/gemini_usage.js`);
		const key = $os.getenv("GEMINI_API_KEY");
		if (!key) throw new BadRequestError("GEMINI_API_KEY is not set on the sync server.");
		const systemInstruction = e.requestInfo().body.systemInstruction || "";
		if (typeof systemInstruction !== "string" || systemInstruction.length > 20000) {
			throw new BadRequestError("systemInstruction must be a string of at most 20000 characters.");
		}
		usage.checkCap(e.auth.id);
		const model = "gemini-3.8-live";
		const now = Date.now();
		const expiresAt = new Date(now + 30 * 60 * 1000).toISOString();
		const setup = {
			model: `models/${model}`,
			generationConfig: { responseModalities: ["AUDIO"] },
			inputAudioTranscription: {},
			outputAudioTranscription: {},
		};
		if (systemInstruction) setup.systemInstruction = { parts: [{ text: systemInstruction }] };
		const res = $http.send({
			url: "https://generativelanguage.googleapis.com/v1beta/auth_tokens",
			method: "POST",
			headers: { "content-type": "application/json", "x-goog-api-key": key },
			body: JSON.stringify({
				uses: 1,
				expireTime: expiresAt,
				newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(),
				bidiGenerateContentSetup: setup,
				// Locks exactly the fields set above; the client's setup message fills in the rest.
				fieldMask:
					"model,generationConfig.responseModalities,inputAudioTranscription,outputAudioTranscription" +
					(systemInstruction ? ",systemInstruction" : ""),
			}),
			timeout: 30,
		});
		if (res.statusCode >= 400) {
			return e.json(res.statusCode, { message: res.json?.error?.message || `Gemini error ${res.statusCode}` });
		}
		usage.addUsage(e.auth.id, model);
		return e.json(200, { token: res.json.name, model, expiresAt });
	},
	$apis.requireAuth(),
);
