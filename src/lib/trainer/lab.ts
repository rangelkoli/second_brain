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


/** Lab-authoring section of the tutor's system prompt (spliced into SYSTEM in trainer.svelte.ts). */
export const LAB_PROMPT = `HOW TO BUILD "lab" (step-by-step interactive visual):
Every lab has: { "title": string, "kind": one of "music"|"geometry"|"algorithm"|"physics"|"language"|"image"|"sketch", "summary": string, "steps": [{ "title": string, "caption": string, ...stepFields }], "check"?: ... }
- Keep steps focused (3–6 steps). Each step's "caption" is 1–2 short spoken sentences synced to what appears or moves in that step.
- Pick the best "kind":
  1) "music": scales, intervals, key signatures, chord progressions, rhythm.
     music: { "mode": "scale"|"progression", "root": "B", "scaleName": "B Natural Minor", "notes": ["B4","C#5","D5","E5","F#5","G5","A5","B5"], "chords": [{"name":"Bm","notes":["B3","D4","F#4"]}], "bpm": 96, "drums": false, "drumVolume": 42, "relativeMajor": "D", "sharpsOrFlats": "2 sharps (F#, C#)" }
     Step fields: "highlight": ["B4","C#5"], "chordIndex": 0.
     If the user asks to "build a chord progression" or "add drums", return an updated "music" lab preserving the scale/key!
  2) "geometry": right triangles, Pythagorean theorem, triangle ratios.
     geometry: { "shape": "pythagorean"|"triangle", "a": 3, "b": 4, "c": 5, "labels": {"a":"a = 3","b":"b = 4","c":"c = 5"}, "showSquares": true }
     Step fields: "highlight": ["right-angle"|"hypotenuse"|"legs"|"squares"|"equation"].
  3) "algorithm": sorting/array algorithms with live step-by-step animation + code line highlight.
     algorithm: { "name": "Bubble Sort", "initialArray": [4,3,2,1], "language": "python", "code": "for i in range(n):\\n  ..." }
     Step fields: "array": [3,4,2,1], "comparing": [0,1], "swapped": true, "sortedFrom": 3, "codeLine": 3.
  4) "physics": projectile motion, angles, velocity vectors.
     physics: { "scenario": "projectile", "angle": 30, "speed": 20, "gravity": 9.81, "showVectors": true }
     Step fields: "angle": 30, "speed": 20, "t": 0.5 (0=launch, 0.5=peak, 1=land). The ball flies between t values, so step t forward (0 → 0.5 → 1).
  5) "language": vocabulary, pronunciation, stress guides.
     language: { "languageName": "Romanian", "items": [{ "word": "Salut", "pronunciation": "sa-LUT", "meaning": "Hi / Hello", "tip": "Stress the second syllable.", "example": "Salut, Ana!", "exampleTranslation": "Hi, Ana!" }] }
     Step fields: "highlight": ["Salut"]. Include a "match" check when teaching 3+ words!
  6) "image": real-world visual topics (cars, paintings, landmarks, anatomy, instruments) where a real photo + callout boxes helps.
     image: { "query": "1965 Shelby GT350 Mustang", "annotations": [{ "id": "hood", "label": "Hood scoop", "x": 30, "y": 42, "w": 24, "h": 18 }] } (x,y,w,h in 0–100%).
     Step fields: "annotationIds": ["hood"].
  7) "sketch": ANY other topic (breadboard LED wiring, biology cell, TCP handshake packets, CPU pipeline, chemistry, networks, etc.)!
     sketch: { "html": "<svg viewBox='0 0 600 340'>...</svg>" }
     Draw ONE clean SVG, viewBox 600x340, with plenty of empty space. The app animates it for you, no JavaScript needed:
     - data-step="0" makes an element appear on the FIRST step. Step numbers are 0-based indexes into your "steps" array: 3 steps means data-step 0, 1 and 2 only. data-steps="1,2" lists several; data-steps="1+" means "step 1 onward". Untagged elements are always visible (the base scene). Elements of earlier steps stay visible but quiet; later ones stay hidden until their step.
     - data-draw on a path/line/polyline/rect/circle (or a <g> of them) draws its stroke on like a pen. Use it for wires, arrows, outlines, timelines.
     - data-flow on a path/line makes dashes stream along it while its step is active (electric current, packets, blood, data). data-flow="dots" for dots, add "reverse" to flip direction. Put it on a copy of the wire path, stroke var(--accent), stroke-width 3.
     - data-move="x,y" slides an element by (x,y) when its step arrives (a packet travelling from A to B). For a journey use data-move="1:0,0;2:240,0;3:240,120" (step:x,y).
     - data-pulse gently pulses an element while its step is active (the LED that lights, the thing to look at). Use it on one element per step at most.
     - data-count="0..5" counts the number in a <text> up when its step arrives (e.g. <text data-step="2" data-count="0..20">20 mA</text>).
     - data-chip on a <text> draws a rounded label chip behind it; data-chip="accent"|"ok"|"warn"|"danger" tints it. Use chips for short labels (1–3 words).
     - data-delay="300" (ms) delays an element inside its step; otherwise elements enter one after another in document order, so order your SVG in reading order.
     Style with CSS vars only, never hard-coded colors: --fg, --muted, --card, --border, --accent, --accent-soft, --ok, --warn, --danger (and --ok-soft, --warn-soft, --danger-soft). Ready classes: class="box" (card rect with border and soft shadow, add rx="10"), class="wire" (2.5px line, no fill), class="title" (15px semibold text), class="label" (12px muted text). Use font-size 12–15, stroke-width 2–3, rounded corners (rx 8–12). No gradients, no glow filters, no emoji.
     Optional script for things the attributes can't do: window.LAB.onStep((i, step) => ...), window.LAB.playTone(freq).
     Good example for a lab with 3 steps (indexes 0, 1, 2); copy this level of polish, not the content:
     <svg viewBox='0 0 600 340'><rect class='box' x='40' y='120' width='130' height='90' rx='12'/><text class='title' x='105' y='170' text-anchor='middle'>Client</text><rect class='box' x='430' y='120' width='130' height='90' rx='12'/><text class='title' x='495' y='170' text-anchor='middle'>Server</text><line class='wire' x1='170' y1='165' x2='430' y2='165'/><g data-step='0'><path d='M175 140 H425' stroke='var(--accent)' stroke-width='2.5' fill='none' data-draw/><text x='300' y='126' text-anchor='middle' data-chip='accent'>SYN</text></g><g data-step='1'><path d='M425 190 H175' stroke='var(--ok)' stroke-width='2.5' fill='none' data-draw/><text x='300' y='222' text-anchor='middle' data-chip='ok'>SYN-ACK</text></g><g data-step='2'><path d='M175 165 H425' stroke='var(--accent)' stroke-width='3' fill='none' data-flow='dots'/><text x='300' y='290' text-anchor='middle' data-chip>Connected</text><circle cx='495' cy='120' r='6' fill='var(--ok)' data-pulse/></g></svg>

Optional "check" inside "lab" (great for quick prediction or vocab matching before moving on):
- { "kind": "predict", "prompt": "...", "options": ["...","..."], "answerIndex": 0, "explanation": "..." }
- { "kind": "match", "prompt": "Match the pairs", "pairs": [{"left":"Salut","right":"Hi"}] }`;

export const SKETCH_CSP = "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; media-src data:;";

const SKETCH_THEME = {
	light:
		"--bg:#fafafa;--fg:#171717;--muted:#737373;--card:#ffffff;--border:#e5e5e5;--grid:rgba(23,23,23,.09);--shadow:rgba(23,23,23,.10);--accent:#2563eb;--accent-soft:rgba(37,99,235,.10);--ok:#16a34a;--ok-soft:rgba(22,163,74,.11);--warn:#ca8a04;--warn-soft:rgba(202,138,4,.13);--danger:#dc2626;--danger-soft:rgba(220,38,38,.10);",
	dark: "--bg:#151515;--fg:#f5f5f5;--muted:#a3a3a3;--card:#1f1f1f;--border:#333333;--grid:rgba(255,255,255,.07);--shadow:rgba(0,0,0,.45);--accent:#60a5fa;--accent-soft:rgba(96,165,250,.16);--ok:#4ade80;--ok-soft:rgba(74,222,128,.14);--warn:#facc15;--warn-soft:rgba(250,204,21,.14);--danger:#f87171;--danger-soft:rgba(248,113,113,.15);",
};

const SKETCH_CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{background-color:var(--bg);background-image:radial-gradient(circle at 1px 1px,var(--grid) 1px,transparent 0);background-size:20px 20px;color:var(--fg);font-family:"Inter Variable",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;line-height:1.45;padding:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;-webkit-font-smoothing:antialiased}
svg{max-width:100%;max-height:calc(100vh - 24px);height:auto;display:block;overflow:visible;font-family:inherit;font-size:13px;stroke-linecap:round;stroke-linejoin:round;text-rendering:geometricPrecision}
::selection{background:var(--accent-soft)}
button,input,select{font:inherit;color:inherit}
.box{fill:var(--card);stroke:var(--border);stroke-width:1.5;filter:drop-shadow(0 1px 2px var(--shadow))}
.wire{fill:none;stroke:var(--muted);stroke-width:2.5}
.title{font-size:15px;font-weight:600;fill:var(--fg)}
.label{font-size:12px;fill:var(--muted)}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 14px;box-shadow:0 1px 2px var(--shadow)}
.chip rect{fill:var(--card);stroke:var(--border);stroke-width:1}
.chip text{font-size:12px;font-weight:500}
.chip-accent rect{fill:var(--accent-soft);stroke:var(--accent)}.chip-accent text{fill:var(--accent)}
.chip-ok rect{fill:var(--ok-soft);stroke:var(--ok)}.chip-ok text{fill:var(--ok)}
.chip-warn rect{fill:var(--warn-soft);stroke:var(--warn)}.chip-warn text{fill:var(--warn)}
.chip-danger rect{fill:var(--danger-soft);stroke:var(--danger)}.chip-danger text{fill:var(--danger)}
[data-count]{font-variant-numeric:tabular-nums}
[data-flow]:is(path,line,polyline,polygon,circle,ellipse,rect),[data-flow] :is(path,line,polyline){stroke-dasharray:7 9}
[data-flow*=dots]:is(path,line,polyline,polygon,circle,ellipse,rect),[data-flow*=dots] :is(path,line,polyline){stroke-dasharray:.001 11}
[data-step],[data-steps]{transition:opacity .2s ease-out}
.lab-js [data-step],.lab-js [data-steps]{opacity:0}
.lab-js .lab-past{opacity:.5}
.lab-js .lab-active{opacity:1;transition-duration:.3s}
.lab-active .box,.box.lab-active,.chip.lab-active rect,.lab-active .chip rect,.card.lab-active,.lab-active .card{filter:drop-shadow(0 3px 6px var(--shadow))}
.card.lab-active,.lab-active .card{filter:none;box-shadow:0 4px 12px var(--shadow)}
.lab-future{pointer-events:none}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

// Plain ES5-ish so it runs anywhere; no backticks or template placeholders (this lives inside a template string).
const SKETCH_RUNTIME = `
(function(){
  var doc = document, root = doc.documentElement;
  root.classList.add("lab-js");
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var EASE = "cubic-bezier(0.16, 1, 0.3, 1)", PEN = "cubic-bezier(0.65, 0, 0.35, 1)";
  var STEPPED = "[data-step],[data-steps]";
  var GEOM = "path,line,polyline,polygon,circle,ellipse,rect";
  var handlers = [], ctx = null, current = null;
  var states = new WeakMap(), loops = new WeakMap(), base = new WeakMap(), pos = new WeakMap();

  window.LAB = {
    onStep: function(fn){ if (typeof fn === "function") handlers.push(fn); },
    playTone: function(freq, dur){
      freq = freq || 440; dur = dur || 0.25;
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "triangle"; o.frequency.value = freq;
        g.gain.setValueAtTime(0.18, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + dur);
      } catch (e) {}
    },
    reducedMotion: reduce
  };

  // "1", "0,2", "1-3", "2+" -> { first, has(i) }
  function stepsOf(el){
    var src = el.getAttribute("data-steps");
    if (src === null) src = el.getAttribute("data-step");
    if (src === null) return null;
    var list = [], from = Infinity;
    src.split(",").forEach(function(tok){
      tok = tok.trim();
      var m;
      if ((m = /^(\\d+)\\+$/.exec(tok))) from = Math.min(from, +m[1]);
      else if ((m = /^(\\d+)\\s*-\\s*(\\d+)$/.exec(tok))) { for (var i = +m[1]; i <= +m[2]; i++) list.push(i); }
      else if (tok !== "" && !isNaN(+tok)) list.push(+tok);
    });
    var first = Math.min.apply(null, list.concat([from]));
    return { first: first, has: function(i){ return i >= from || list.indexOf(i) >= 0; } };
  }
  function owner(el){ return el.closest(STEPPED); }
  function stateOf(el){ var o = owner(el); return o ? states.get(o) || "future" : "active"; }
  function play(el, frames, opts){ try { return el.animate(frames, opts); } catch (e) { return null; } }
  function strokes(el){
    var list = el.matches(GEOM) ? [el] : Array.prototype.slice.call(el.querySelectorAll(GEOM));
    return list.filter(function(p){ var s = getComputedStyle(p).stroke; return s && s !== "none"; });
  }

  function makeChips(){
    var NS = "http://www.w3.org/2000/svg";
    doc.querySelectorAll("text[data-chip]").forEach(function(t){
      var b; try { b = t.getBBox(); } catch (e) { return; }
      if (!b || !b.width) return;
      var g = doc.createElementNS(NS, "g"), r = doc.createElementNS(NS, "rect");
      ["data-step","data-steps","data-enter","data-delay","data-pulse","data-move","transform"].forEach(function(a){
        if (t.hasAttribute(a)) { g.setAttribute(a, t.getAttribute(a)); t.removeAttribute(a); }
      });
      var tone = t.getAttribute("data-chip");
      g.setAttribute("class", "chip" + (tone ? " chip-" + tone : ""));
      var px = 8, py = 4;
      r.setAttribute("x", b.x - px); r.setAttribute("y", b.y - py);
      r.setAttribute("width", b.width + px * 2); r.setAttribute("height", b.height + py * 2);
      r.setAttribute("rx", 7);
      t.parentNode.insertBefore(g, t); g.appendChild(r); g.appendChild(t);
    });
  }

  function drawOn(p, delay){
    var len = 0, cs = getComputedStyle(p);
    try { len = p.getTotalLength(); } catch (e) {}
    if (!len || !isFinite(len) || (cs.strokeDasharray && cs.strokeDasharray !== "none")) {
      play(p, [{ opacity: 0 }, { opacity: 1 }], { duration: 360, delay: delay, easing: "ease-out", fill: "backwards" });
      return;
    }
    var dur = Math.max(450, Math.min(1200, len * 2.2)), dash = len + " " + len;
    play(p, [{ strokeDasharray: dash, strokeDashoffset: len }, { strokeDasharray: dash, strokeDashoffset: 0 }], { duration: dur, delay: delay, easing: PEN, fill: "backwards" });
    if (cs.fill !== "none" && +cs.fillOpacity > 0) {
      play(p, [{ fillOpacity: 0 }, { fillOpacity: cs.fillOpacity }], { duration: dur * 0.6, delay: delay + dur * 0.4, easing: "ease-out", fill: "backwards" });
    }
  }

  var RISE = { rise: ["0 10px", "0 0"], down: ["0 -10px", "0 0"], left: ["-14px 0", "0 0"], right: ["14px 0", "0 0"] };
  function enter(el, delay){
    if (el.hasAttribute("data-draw")) {
      strokes(el).forEach(function(p, i){ drawOn(p, delay + i * 70); });
      return;
    }
    var kind = el.getAttribute("data-enter") || (el.hasAttribute("data-move") ? "fade" : "rise");
    var frames;
    if (kind === "scale" || kind === "pop") {
      el.style.transformBox = "fill-box"; el.style.transformOrigin = "center";
      frames = [{ opacity: 0, scale: "0.86" }, { opacity: 1, scale: "1" }];
    } else if (RISE[kind]) frames = [{ opacity: 0, translate: RISE[kind][0] }, { opacity: 1, translate: RISE[kind][1] }];
    else frames = [{ opacity: 0 }, { opacity: 1 }];
    play(el, frames, { duration: 520, delay: delay, easing: EASE, fill: "backwards" });
  }

  function countUp(el, delay){
    var m = /^\\s*(-?[\\d.]+)\\s*\\.\\.\\s*(-?[\\d.]+)\\s*$/.exec(el.getAttribute("data-count") || "");
    if (!m) return;
    if (!base.has(el)) base.set(el, el.textContent);
    var orig = base.get(el), from = +m[1], to = +m[2];
    var dec = (m[2].split(".")[1] || "").length, num = /-?\\d+(\\.\\d+)?/, has = num.test(orig);
    function render(v){ var s = v.toFixed(dec); el.textContent = has ? orig.replace(num, s) : s; }
    if (reduce) return render(to);
    var start = performance.now() + delay, dur = 900;
    render(from);
    requestAnimationFrame(function tick(now){
      var t = Math.min(1, Math.max(0, (now - start) / dur));
      if (stateOf(el) !== "active") return render(to);
      render(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(tick);
    });
  }

  function startLoops(el, delay){
    if (reduce || loops.has(el)) return;
    var list = [];
    if (el.hasAttribute("data-pulse")) {
      el.style.transformBox = "fill-box"; el.style.transformOrigin = "center";
      list.push(play(el, [{ scale: "1" }, { scale: "1.07" }, { scale: "1" }], { duration: 1800, delay: delay + 400, iterations: Infinity, easing: "ease-in-out" }));
    }
    if (el.hasAttribute("data-flow")) {
      var v = el.getAttribute("data-flow") || "", period = /dots/.test(v) ? 11 : 16, sign = /reverse/.test(v) ? 1 : -1;
      strokes(el).forEach(function(p){
        list.push(play(p, [{ strokeDashoffset: 0 }, { strokeDashoffset: sign * period }], { duration: period * 32, iterations: Infinity, easing: "linear" }));
      });
    }
    loops.set(el, list);
  }
  function stopLoops(el){
    (loops.get(el) || []).forEach(function(a){ if (a) a.cancel(); });
    loops.delete(el);
  }

  function moveTarget(el, idx){
    var v = el.getAttribute("data-move") || "", pt = [0, 0];
    if (v.indexOf(":") >= 0) {
      var best = -1;
      v.split(/[;|]/).forEach(function(tok){
        var m = /^\\s*(\\d+)\\s*:\\s*(-?[\\d.]+)\\s*[, ]\\s*(-?[\\d.]+)\\s*$/.exec(tok);
        if (m && +m[1] <= idx && +m[1] > best) { best = +m[1]; pt = [+m[2], +m[3]]; }
      });
    } else {
      var m = /(-?[\\d.]+)\\s*[, ]\\s*(-?[\\d.]+)/.exec(v);
      if (m && stateOf(el) !== "future") pt = [+m[1], +m[2]];
    }
    return pt[0] + "px " + pt[1] + "px";
  }

  // Highest step number used in the markup (for the 1-based guard in apply).
  function maxTag(){
    var max = -1;
    function take(n){ max = Math.max(max, +n); }
    doc.querySelectorAll(STEPPED).forEach(function(el){
      ((el.getAttribute("data-steps") || el.getAttribute("data-step") || "").match(/\\d+/g) || []).forEach(take);
    });
    doc.querySelectorAll("[data-move]").forEach(function(el){
      var keys = /(\\d+)\\s*:/g, m;
      while ((m = keys.exec(el.getAttribute("data-move")))) take(m[1]);
    });
    return max;
  }

  function apply(idx, step, count){
    var hostIdx = Number(idx) || 0;
    idx = hostIdx;
    // Sketches that numbered steps from 1 (highest tag === step count) would never show their last step: shift them.
    if (count && maxTag() === count) idx += 1;
    var delays = new Map(), order = 0;
    doc.querySelectorAll(STEPPED).forEach(function(el){
      var sp = stepsOf(el);
      if (!sp) return;
      var next = sp.has(idx) ? "active" : sp.first < idx ? "past" : "future";
      var was = states.get(el) || "future";
      states.set(el, next);
      el.classList.toggle("lab-active", next === "active");
      el.classList.toggle("lab-past", next === "past");
      el.classList.toggle("lab-future", next === "future");
      el.classList.toggle("lab-dim", next !== "active"); // legacy hook for old sketch scripts
      if (next === "active" && was !== "active") {
        var d = el.getAttribute("data-delay");
        delays.set(el, d !== null && !isNaN(+d) ? +d : Math.min(order++, 8) * 90);
      }
    });
    var firstRun = current === null;
    current = idx;

    if (!reduce) delays.forEach(function(delay, el){ enter(el, delay); });

    function delayFor(el){ var o = owner(el); return o && delays.has(o) ? delays.get(o) : null; }
    // data-draw / data-enter children of a step group animate with it, staggered in document order.
    if (!reduce) {
      var sub = new Map();
      doc.querySelectorAll("[data-draw],[data-enter]").forEach(function(el){
        if (el.matches(STEPPED)) return;
        var o = el.parentElement && el.parentElement.closest(STEPPED);
        var base = o ? (delays.has(o) ? delays.get(o) : null) : (firstRun ? 0 : null);
        if (base === null) return;
        var n = sub.get(o) || 0; sub.set(o, n + 1);
        var d = el.getAttribute("data-delay");
        enter(el, base + (d !== null && !isNaN(+d) ? +d : n * 160));
      });
    }
    doc.querySelectorAll("[data-count]").forEach(function(el){
      var d = delayFor(el);
      if (d !== null || (firstRun && !owner(el))) countUp(el, d || 0);
    });
    doc.querySelectorAll("[data-pulse],[data-flow]").forEach(function(el){
      if (stateOf(el) === "active") startLoops(el, delayFor(el) || 0);
      else stopLoops(el);
    });
    doc.querySelectorAll("[data-move]").forEach(function(el){
      var to = moveTarget(el, idx), from = pos.get(el) || "0px 0px";
      if (to === from) return;
      pos.set(el, to);
      el.style.translate = to;
      if (!reduce) play(el, [{ translate: from }, { translate: to }], { duration: 1100, delay: (delayFor(el) || 0) + 250, easing: PEN, fill: "backwards" });
    });

    if (typeof window.setStep === "function") { try { window.setStep(hostIdx, step); } catch (e) {} }
    for (var i = 0; i < handlers.length; i++) { try { handlers[i](hostIdx, step); } catch (e) {} }
  }

  // Runs in <head> so window.LAB exists before sketch scripts; DOM work waits for the body.
  var ready = false, queued = null, fallback = null, hostCurrent = null;
  doc.addEventListener("DOMContentLoaded", function(){
    ready = true;
    makeChips();
    if (queued) return apply(queued.stepIndex, queued.step, queued.stepCount);
    // The host posts the real step on load; fall back to step 0 so nothing stays hidden.
    fallback = setTimeout(function(){ if (current === null) apply(0, null); }, 400);
  });
  window.addEventListener("message", function(e){
    if (!e.data || e.data.type !== "lab:step") return;
    if (!ready) { queued = e.data; return; }
    clearTimeout(fallback);
    if (e.data.stepIndex === hostCurrent) return;
    hostCurrent = e.data.stepIndex;
    apply(e.data.stepIndex, e.data.step, e.data.stepCount);
  });
})();
`;

/** Wraps AI-generated HTML/SVG sketches in a themed, sandboxed srcdoc runtime: step sync, declarative animation attributes, Web Audio tones. */
export function wrapSketchHtml(fragment: string, dark: boolean): string {
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${SKETCH_CSP}" />
<style>
:root{${dark ? SKETCH_THEME.dark : SKETCH_THEME.light}color-scheme:${dark ? "dark" : "light"}}
${SKETCH_CSS}
</style>
<script>${SKETCH_RUNTIME}</script>
</head>
<body>
${fragment}
</body>
</html>`;
}
