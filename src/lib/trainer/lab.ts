export type LabKind = "music" | "geometry" | "algorithm" | "physics" | "language" | "image" | "sketch";

export type LabStep = {
	title: string;
	caption: string;
	highlight?: string[];
	annotationIds?: string[];
	array?: number[];
	comparing?: [number, number];
	swapped?: boolean;
	sortedFrom?: number;
	codeLine?: number;
	angle?: number;
	speed?: number;
	t?: number;
	chordIndex?: number;
	sketchState?: Record<string, unknown>;
};

export type LabCheck =
	| {
			kind: "predict";
			prompt: string;
			options: string[];
			answerIndex: number;
			explanation: string;
	  }
	| {
			kind: "match";
			prompt: string;
			pairs: { left: string; right: string }[];
	  };

export type MusicPayload = {
	mode: "scale" | "progression";
	root: string;
	scaleName?: string;
	notes: string[];
	chords?: { name: string; notes: string[] }[];
	bpm?: number;
	drums?: boolean;
	drumVolume?: number;
	relativeMajor?: string;
	sharpsOrFlats?: string;
};

export type GeometryPayload = {
	shape: "pythagorean" | "triangle";
	a: number;
	b: number;
	c: number;
	labels?: { a?: string; b?: string; c?: string };
	showSquares?: boolean;
};

export type AlgorithmPayload = {
	name: string;
	initialArray: number[];
	code: string;
	language?: string;
};

export type PhysicsPayload = {
	scenario: "projectile";
	angle: number;
	speed: number;
	gravity?: number;
	showVectors?: boolean;
};

export type LanguageItem = {
	word: string;
	pronunciation: string;
	meaning: string;
	tip?: string;
	example?: string;
	exampleTranslation?: string;
};

export type LanguagePayload = {
	languageName: string;
	items: LanguageItem[];
};

export type ImageAnnotation = {
	id: string;
	label: string;
	x: number;
	y: number;
	w: number;
	h: number;
};

export type ImagePayload = {
	query: string;
	resolvedUrl?: string;
	credit?: string;
	annotations: ImageAnnotation[];
};

export type SketchPayload = {
	html: string;
};

export type Lab = {
	id: string;
	title: string;
	kind: LabKind;
	summary?: string;
	steps: LabStep[];
	check?: LabCheck;
	music?: MusicPayload;
	geometry?: GeometryPayload;
	algorithm?: AlgorithmPayload;
	physics?: PhysicsPayload;
	language?: LanguagePayload;
	image?: ImagePayload;
	sketch?: SketchPayload;
};

export type TutorReply = {
	text: string;
	lab?: Lab;
	topicSuggestion?: string;
};

export type SubjectTheme = "music" | "code" | "math" | "physics" | "electronics" | "language" | "art" | "general";

const LAB_KINDS = new Set<LabKind>(["music", "geometry", "algorithm", "physics", "language", "image", "sketch"]);

export function inferSubjectTheme(topic: string): SubjectTheme {
	const t = topic.toLowerCase();
	if (/\b(music|scale|chord|piano|guitar|rhythm|harmony|melody|octave|key|minor|major|bpm|drum|synth|interval)\b/.test(t)) return "music";
	if (/\b(code|sort|algorithm|python|javascript|typescript|rust|array|tree|graph|tcp|http|api|sql|recursion|binary|program)/.test(t)) return "code";
	if (/\b(math|algebra|geometry|trig|calculus|pythagor|triangle|equation|integral|derivative|matrix|probab|stat|theorem)/.test(t)) return "math";
	if (/\b(physics|projectile|velocity|gravity|force|newton|momentum|energy|quantum|optics|wave|motion)/.test(t)) return "physics";
	if (/\b(breadboard|circuit|led|resistor|voltage|current|arduino|transistor|capacitor|pcb|electron)/.test(t)) return "electronics";
	if (/\b(language|romanian|spanish|french|japanese|german|korean|italian|vocab|pronunc|grammar|speak)/.test(t)) return "language";
	if (/\b(art|paint|car|mustang|history|anatomy|biology|cell|geography|architecture|photo)/.test(t)) return "art";
	return "general";
}

function stripJsonFence(raw: string): string {
	const trimmed = raw.trim();
	const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
	if (fence) return fence[1].trim();
	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
	return trimmed;
}

const asStr = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const asNum = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const asBool = (v: unknown, fallback = false) => (typeof v === "boolean" ? v : fallback);
const asArr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function sanitizeStep(raw: unknown, index: number): LabStep {
	const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
	const out: LabStep = {
		title: asStr(s.title, `Step ${index + 1}`),
		caption: asStr(s.caption),
	};
	if (Array.isArray(s.highlight)) out.highlight = s.highlight.map((x) => String(x));
	if (Array.isArray(s.annotationIds)) out.annotationIds = s.annotationIds.map((x) => String(x));
	if (Array.isArray(s.array)) out.array = s.array.map((n) => asNum(n));
	if (Array.isArray(s.comparing) && s.comparing.length >= 2) {
		out.comparing = [asNum(s.comparing[0]), asNum(s.comparing[1])];
	}
	if (typeof s.swapped === "boolean") out.swapped = s.swapped;
	if (typeof s.sortedFrom === "number") out.sortedFrom = s.sortedFrom;
	if (typeof s.codeLine === "number") out.codeLine = s.codeLine;
	if (typeof s.angle === "number") out.angle = s.angle;
	if (typeof s.speed === "number") out.speed = s.speed;
	if (typeof s.t === "number") out.t = Math.max(0, Math.min(1, s.t));
	if (typeof s.chordIndex === "number") out.chordIndex = s.chordIndex;
	if (s.sketchState && typeof s.sketchState === "object") out.sketchState = s.sketchState as Record<string, unknown>;
	return out;
}

function sanitizeCheck(raw: unknown): LabCheck | undefined {
	if (!raw || typeof raw !== "object") return undefined;
	const c = raw as Record<string, unknown>;
	if (c.kind === "predict") {
		const options = asArr<unknown>(c.options).map((o) => String(o)).filter(Boolean);
		if (!options.length || !asStr(c.prompt)) return undefined;
		return {
			kind: "predict",
			prompt: asStr(c.prompt),
			options,
			answerIndex: Math.max(0, Math.min(options.length - 1, asNum(c.answerIndex, 0))),
			explanation: asStr(c.explanation),
		};
	}
	if (c.kind === "match") {
		const pairs = asArr<Record<string, unknown>>(c.pairs)
			.map((p) => ({ left: asStr(p?.left), right: asStr(p?.right) }))
			.filter((p) => p.left && p.right);
		if (pairs.length < 2) return undefined;
		return {
			kind: "match",
			prompt: asStr(c.prompt, "Match the pairs"),
			pairs,
		};
	}
	return undefined;
}

export function sanitizeLab(raw: unknown): Lab | undefined {
	if (!raw || typeof raw !== "object") return undefined;
	const r = raw as Record<string, unknown>;
	const kind = r.kind as LabKind;
	if (!LAB_KINDS.has(kind)) return undefined;

	const steps = asArr<unknown>(r.steps).map((s, i) => sanitizeStep(s, i));
	const lab: Lab = {
		id: asStr(r.id) || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `lab-${Date.now()}`),
		title: asStr(r.title, "Interactive Lab"),
		kind,
		summary: asStr(r.summary) || undefined,
		steps: steps.length ? steps : [{ title: "Overview", caption: asStr(r.summary, "Explore the interactive visual.") }],
		check: sanitizeCheck(r.check),
	};

	if (kind === "music" && r.music && typeof r.music === "object") {
		const m = r.music as Record<string, unknown>;
		lab.music = {
			mode: m.mode === "progression" ? "progression" : "scale",
			root: asStr(m.root, "C"),
			scaleName: asStr(m.scaleName) || undefined,
			notes: asArr<unknown>(m.notes).map((n) => String(n)),
			chords: Array.isArray(m.chords)
				? m.chords
						.filter((ch) => ch && typeof ch === "object")
						.map((ch) => {
							const o = ch as Record<string, unknown>;
							return { name: asStr(o.name, "Chord"), notes: asArr<unknown>(o.notes).map((n) => String(n)) };
						})
				: undefined,
			bpm: asNum(m.bpm, 96),
			drums: asBool(m.drums, false),
			drumVolume: Math.max(0, Math.min(100, asNum(m.drumVolume, 45))),
			relativeMajor: asStr(m.relativeMajor) || undefined,
			sharpsOrFlats: asStr(m.sharpsOrFlats) || undefined,
		};
	} else if (kind === "geometry" && r.geometry && typeof r.geometry === "object") {
		const g = r.geometry as Record<string, unknown>;
		const a = Math.max(1, asNum(g.a, 3));
		const b = Math.max(1, asNum(g.b, 4));
		const c = Math.max(1, asNum(g.c, Math.round(Math.hypot(a, b) * 100) / 100));
		lab.geometry = {
			shape: g.shape === "triangle" ? "triangle" : "pythagorean",
			a,
			b,
			c,
			labels: g.labels && typeof g.labels === "object" ? (g.labels as { a?: string; b?: string; c?: string }) : undefined,
			showSquares: asBool(g.showSquares, true),
		};
	} else if (kind === "algorithm" && r.algorithm && typeof r.algorithm === "object") {
		const a = r.algorithm as Record<string, unknown>;
		const initialArray = asArr<unknown>(a.initialArray).map((n) => asNum(n));
		lab.algorithm = {
			name: asStr(a.name, lab.title),
			initialArray: initialArray.length ? initialArray : [5, 3, 4, 1, 2],
			code: asStr(a.code),
			language: asStr(a.language, "python"),
		};
	} else if (kind === "physics" && r.physics && typeof r.physics === "object") {
		const p = r.physics as Record<string, unknown>;
		lab.physics = {
			scenario: "projectile",
			angle: Math.max(5, Math.min(85, asNum(p.angle, 30))),
			speed: Math.max(5, Math.min(60, asNum(p.speed, 20))),
			gravity: Math.max(1, asNum(p.gravity, 9.81)),
			showVectors: asBool(p.showVectors, true),
		};
	} else if (kind === "language" && r.language && typeof r.language === "object") {
		const l = r.language as Record<string, unknown>;
		const items = asArr<Record<string, unknown>>(l.items)
			.map((it) => ({
				word: asStr(it?.word),
				pronunciation: asStr(it?.pronunciation),
				meaning: asStr(it?.meaning),
				tip: asStr(it?.tip) || undefined,
				example: asStr(it?.example) || undefined,
				exampleTranslation: asStr(it?.exampleTranslation) || undefined,
			}))
			.filter((it) => it.word && it.meaning);
		if (!items.length) return undefined;
		lab.language = {
			languageName: asStr(l.languageName, "Language"),
			items,
		};
	} else if (kind === "image" && r.image && typeof r.image === "object") {
		const im = r.image as Record<string, unknown>;
		const query = asStr(im.query);
		if (!query) return undefined;
		lab.image = {
			query,
			resolvedUrl: asStr(im.resolvedUrl) || undefined,
			credit: asStr(im.credit) || undefined,
			annotations: asArr<Record<string, unknown>>(im.annotations).map((a, idx) => ({
				id: asStr(a?.id, `a${idx + 1}`),
				label: asStr(a?.label, `Part ${idx + 1}`),
				x: Math.max(0, Math.min(95, asNum(a?.x, 10))),
				y: Math.max(0, Math.min(95, asNum(a?.y, 10))),
				w: Math.max(5, Math.min(100, asNum(a?.w, 20))),
				h: Math.max(5, Math.min(100, asNum(a?.h, 20))),
			})),
		};
	} else if (kind === "sketch" && r.sketch && typeof r.sketch === "object") {
		const sk = r.sketch as Record<string, unknown>;
		const html = asStr(sk.html);
		if (!html) return undefined;
		lab.sketch = { html };
	} else {
		return undefined;
	}

	return lab;
}

export function parseTutorResponse(raw: string): TutorReply {
	const cleaned = stripJsonFence(raw);
	if (cleaned.startsWith("{")) {
		try {
			const parsed = JSON.parse(cleaned) as Record<string, unknown>;
			const text = asStr(parsed.text).trim();
			if (text) {
				const lab = sanitizeLab(parsed.lab);
				const topicSuggestion = asStr(parsed.topicSuggestion).trim() || undefined;
				return { text, lab, topicSuggestion };
			}
		} catch {
			// Fall back to plain text below.
		}
	}
	return { text: raw.trim() };
}

const imageCache = new Map<string, { url: string; credit: string } | null>();

/** Searches Wikimedia Commons (with Wikipedia fallback) for a real reference image. */
export async function searchWikimediaImage(query: string): Promise<{ url: string; credit: string } | null> {
	const key = query.trim().toLowerCase();
	if (!key) return null;
	if (imageCache.has(key)) return imageCache.get(key) ?? null;

	try {
		const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=5&prop=imageinfo&iiprop=url|mime&iiurlwidth=1200&format=json&origin=*`;
		const res = await fetch(commonsUrl);
		if (res.ok) {
			const data = (await res.json()) as {
				query?: {
					pages?: Record<
						string,
						{
							title?: string;
							index?: number;
							imageinfo?: { thumburl?: string; url?: string; mime?: string }[];
						}
					>;
				};
			};
			const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
			for (const p of pages) {
				const info = p.imageinfo?.[0];
				if (!info?.mime || !/^image\/(jpeg|png|webp)$/.test(info.mime)) continue;
				const url = info.thumburl || info.url;
				if (url) {
					const found = { url, credit: (p.title ?? "Wikimedia Commons").replace(/^File:/, "") };
					imageCache.set(key, found);
					return found;
				}
			}
		}
	} catch {
		// Try Wikipedia fallback below.
	}

	try {
		const wpUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=4&prop=pageimages&piprop=thumbnail&pithumbsize=1000&format=json&origin=*`;
		const res = await fetch(wpUrl);
		if (res.ok) {
			const data = (await res.json()) as {
				query?: {
					pages?: Record<string, { title?: string; index?: number; thumbnail?: { source?: string } }>;
				};
			};
			const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
			const hit = pages.find((p) => p.thumbnail?.source);
			if (hit?.thumbnail?.source) {
				const found = { url: hit.thumbnail.source, credit: hit.title ?? "Wikipedia" };
				imageCache.set(key, found);
				return found;
			}
		}
	} catch {
		// Ignore network errors and let UI fall back cleanly.
	}

	imageCache.set(key, null);
	return null;
}

/** Wraps AI-generated HTML/SVG sketches in a themed, sandboxed srcdoc runtime with step sync + Web Audio tones. */
export function wrapSketchHtml(fragment: string, dark: boolean): string {
	const theme = dark
		? `--bg:#141417;--fg:#f4f4f5;--muted:#a1a1aa;--card:#1c1c21;--border:#2e2e36;--accent:#60a5fa;--accent-soft:rgba(96,165,250,0.18);--ok:#4ade80;--warn:#facc15;--danger:#f87171;`
		: `--bg:#ffffff;--fg:#18181b;--muted:#71717a;--card:#f4f4f5;--border:#e4e4e7;--accent:#2563eb;--accent-soft:rgba(37,99,235,0.12);--ok:#16a34a;--warn:#ca8a04;--danger:#dc2626;`;

	return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
:root{${theme}}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);color:var(--fg);font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.45}
body{padding:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh}
svg{max-width:100%;height:auto;display:block}
[data-step],[data-steps]{transition:opacity .25s ease,transform .25s ease,filter .25s ease}
.lab-dim{opacity:.28}
.lab-active{opacity:1;filter:drop-shadow(0 0 8px var(--accent-soft))}
button,input,select{font:inherit;color:inherit}
</style>
</head>
<body>
${fragment}
<script>
(function(){
  const handlers = [];
  let ctx = null;
  window.LAB = {
    onStep(fn){ if (typeof fn === "function") handlers.push(fn); },
    playTone(freq = 440, dur = 0.25){
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "triangle";
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.18, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + dur);
      } catch {}
    }
  };
  function applyStep(idx, step){
    const stepEls = document.querySelectorAll("[data-step],[data-steps]");
    stepEls.forEach((el) => {
      const one = el.getAttribute("data-step");
      const many = el.getAttribute("data-steps");
      const list = many ? many.split(",").map((s) => Number(s.trim())) : one !== null ? [Number(one)] : [];
      const active = list.includes(idx);
      el.classList.toggle("lab-active", active);
      el.classList.toggle("lab-dim", !active && list.length > 0 && idx >= 0);
    });
    if (typeof window.setStep === "function") { try { window.setStep(idx, step); } catch {} }
    for (const h of handlers) { try { h(idx, step); } catch {} }
  }
  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "lab:step") applyStep(e.data.stepIndex, e.data.step);
  });
})();
</script>
</body>
</html>`;
}
