export type CurriculumNode = {
	id: string;
	title: string;
	prompt: string;
	summary: string;
	prereqs?: string[]; // node ids that should be mastered first
};

export type CurriculumBranch = {
	id: string;
	title: string;
	nodes: CurriculumNode[];
};

export type CurriculumSubject = {
	id: string;
	title: string;
	custom?: boolean;
	branches: CurriculumBranch[];
};

export const BUILTIN_CURRICULA: CurriculumSubject[] = [
	{
		id: "math",
		title: "Mathematics",
		branches: [
			{
				id: "math-prealgebra",
				title: "Pre-Algebra",
				nodes: [
					{ id: "math-ratios", title: "Ratios & Proportions", prompt: "Ratios and proportions", summary: "Compare quantities and scale recipes, speeds, and maps." },
					{ id: "math-negatives", title: "Negative Numbers", prompt: "Adding and multiplying negative numbers", summary: "Direction on the number line and why two negatives multiply to a positive." },
					{ id: "math-exponents", title: "Exponents & Roots", prompt: "Exponents and square roots", summary: "Repeated multiplication and undoing squares.", prereqs: ["math-negatives"] },
				],
			},
			{
				id: "math-geometry",
				title: "Geometry",
				nodes: [
					{ id: "math-pythagorean", title: "Pythagorean Theorem", prompt: "The Pythagorean theorem", summary: "Why a² + b² = c² on right triangles, using area squares.", prereqs: ["math-exponents"] },
					{ id: "math-circles", title: "Pi & Circle Area", prompt: "Why circle area is pi r squared", summary: "Slicing a circle into wedges to see circumference and area." },
					{ id: "math-angles", title: "Triangle Angles & Similarity", prompt: "Similar triangles and angle sums", summary: "Parallel lines, 180° proof, and proportional scaling.", prereqs: ["math-ratios"] },
				],
			},
			{
				id: "math-trig",
				title: "Trigonometry",
				nodes: [
					{ id: "math-sohcahtoa", title: "Sine, Cosine & Tangent", prompt: "Sine, cosine, and tangent on right triangles", summary: "How angles map to side ratios.", prereqs: ["math-pythagorean", "math-angles"] },
					{ id: "math-unit-circle", title: "The Unit Circle", prompt: "The unit circle and radians", summary: "Extending trig beyond 90° and wrapping angles around a circle.", prereqs: ["math-sohcahtoa"] },
				],
			},
			{
				id: "math-calculus",
				title: "Calculus",
				nodes: [
					{ id: "math-limits", title: "Limits & Continuity", prompt: "Intuition for limits in calculus", summary: "Approaching a point without touching it." },
					{ id: "math-derivatives", title: "Derivatives as Rates", prompt: "Derivatives as instantaneous slope", summary: "Shrinking secant lines down to speed at an instant.", prereqs: ["math-limits"] },
					{ id: "math-integrals", title: "Integrals as Area", prompt: "Integrals as accumulating area", summary: "Adding thin rectangles to measure total change.", prereqs: ["math-derivatives"] },
				],
			},
			{
				id: "math-stats",
				title: "Statistics & Data",
				nodes: [
					{ id: "math-spread", title: "Mean, Median & Standard Deviation", prompt: "Standard deviation and data spread", summary: "Why averages hide spread and how variance measures it." },
					{ id: "math-bayes", title: "Bayes' Theorem", prompt: "Bayes theorem with medical test examples", summary: "Updating beliefs when new evidence arrives.", prereqs: ["math-ratios"] },
				],
			},
		],
	},
	{
		id: "cs",
		title: "Computer Science",
		branches: [
			{
				id: "cs-algos",
				title: "Algorithms",
				nodes: [
					{ id: "cs-bubblesort", title: "Bubble Sort & Big-O", prompt: "How bubble sort works and why it is O(n^2)", summary: "Neighbor swaps, early exit, and counting comparisons." },
					{ id: "cs-binarysearch", title: "Binary Search", prompt: "Binary search and O(log n)", summary: "Halving sorted search spaces in logarithmic steps.", prereqs: ["cs-bubblesort"] },
					{ id: "cs-recursion", title: "Recursion & Call Stacks", prompt: "How recursion and the call stack work", summary: "Base cases, stack frames, and unwinding.", prereqs: ["cs-binarysearch"] },
				],
			},
			{
				id: "cs-systems",
				title: "Networks & Systems",
				nodes: [
					{ id: "cs-tcp", title: "TCP Handshake", prompt: "How TCP three-way handshakes work", summary: "SYN, SYN-ACK, ACK and reliable byte streams." },
					{ id: "cs-dns", title: "DNS Resolution", prompt: "How DNS resolves a domain name", summary: "Recursive resolvers, root servers, and caching TTLs." },
				],
			},
		],
	},
	{
		id: "music",
		title: "Music Theory",
		branches: [
			{
				id: "music-scales",
				title: "Scales & Keys",
				nodes: [
					{ id: "music-major", title: "Major Scale Pattern", prompt: "How the major scale whole and half step pattern works", summary: "W-W-H-W-W-W-H on keyboard and staff." },
					{ id: "music-bminor", title: "B Natural Minor & Key Signatures", prompt: "The B natural minor scale and its relative major", summary: "Whole/half steps, two sharps, and the Circle of Fifths.", prereqs: ["music-major"] },
				],
			},
			{
				id: "music-harmony",
				title: "Chords & Rhythm",
				nodes: [
					{ id: "music-triads", title: "Major vs Minor Triads", prompt: "Building major and minor triads", summary: "Root, third, and fifth intervals you can hear.", prereqs: ["music-major"] },
					{ id: "music-progressions", title: "Chord Progressions & Groove", prompt: "How the Bm - G - D - A chord progression works", summary: "Voice leading, harmonic tension, and drum pulse.", prereqs: ["music-triads", "music-bminor"] },
				],
			},
		],
	},
	{
		id: "physics",
		title: "Physics",
		branches: [
			{
				id: "physics-mechanics",
				title: "Mechanics",
				nodes: [
					{ id: "physics-projectile", title: "Projectile Motion", prompt: "Projectile motion, launch angle, and velocity components", summary: "Splitting velocity into Vx and Vy under gravity.", prereqs: ["physics-newton"] },
					{ id: "physics-newton", title: "Newton's Laws", prompt: "Newton's three laws of motion with concrete examples", summary: "Inertia, F=ma, and action-reaction pairs." },
				],
			},
			{
				id: "physics-circuits",
				title: "Electronics",
				nodes: [
					{ id: "physics-ohms", title: "Ohm's Law & Resistors", prompt: "Ohm's law: voltage, current, and resistance", summary: "Why LEDs need current-limiting resistors." },
					{ id: "physics-breadboard", title: "Breadboard LED Circuit", prompt: "How to wire an LED and 220 ohm resistor on a breadboard", summary: "Power rails, row strips A-E and F-J, and closing the loop.", prereqs: ["physics-ohms"] },
				],
			},
		],
	},
	{
		id: "languages",
		title: "Languages",
		branches: [
			{
				id: "lang-starters",
				title: "Starter Vocab & Pronunciation",
				nodes: [
					{ id: "lang-romanian", title: "5 Romanian Essentials", prompt: "Teach me 5 essential Romanian words with pronunciation", summary: "Salut, mulțumesc, da, nu, and apă with stress & matching." },
					{ id: "lang-spanish", title: "5 Spanish Essentials", prompt: "Teach me 5 essential Spanish conversation phrases", summary: "Core greetings, stress rules, and matching practice." },
					{ id: "lang-japanese", title: "5 Japanese Essentials", prompt: "Teach me 5 essential Japanese polite phrases", summary: "Romaji, pitch/syllables, and quick recall." },
				],
			},
		],
	},
];

export function parseCurriculumJson(raw: string, goal: string): CurriculumSubject | null {
	const trimmed = raw.trim();
	const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
	const body = fence ? fence[1].trim() : trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
	if (!body.startsWith("{")) return null;

	try {
		const parsed = JSON.parse(body) as Record<string, unknown>;
		const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : goal.trim();
		const rawBranches = Array.isArray(parsed.branches) ? parsed.branches : [];
		const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "item";
		const stamp = Date.now().toString(36);

		const branches: CurriculumBranch[] = rawBranches
			.map((b, bi): CurriculumBranch | null => {
				if (!b || typeof b !== "object") return null;
				const br = b as Record<string, unknown>;
				const bTitle = typeof br.title === "string" ? br.title.trim() : `Unit ${bi + 1}`;
				const rawNodes = Array.isArray(br.nodes) ? br.nodes : [];
				const nodes: CurriculumNode[] = rawNodes
					.map((n, ni): CurriculumNode | null => {
						if (!n || typeof n !== "object") return null;
						const nd = n as Record<string, unknown>;
						const nTitle = typeof nd.title === "string" ? nd.title.trim() : "";
						const prompt = typeof nd.prompt === "string" && nd.prompt.trim() ? nd.prompt.trim() : nTitle;
						const summary = typeof nd.summary === "string" ? nd.summary.trim() : "";
						if (!nTitle) return null;
						const prereqs = Array.isArray(nd.prereqs) ? nd.prereqs.filter((t): t is string => typeof t === "string") : [];
						return {
							id: `custom-${stamp}-${bi}-${ni}-${slug(nTitle)}`,
							title: nTitle,
							prompt,
							summary,
							prereqs, // titles for now, resolved to ids below
						};
					})
					.filter((x): x is CurriculumNode => x !== null);
				if (!nodes.length) return null;
				return { id: `branch-${stamp}-${bi}`, title: bTitle, nodes };
			})
			.filter((x): x is CurriculumBranch => x !== null);

		if (!branches.length) return null;
		const idOf = new Map(branches.flatMap((b) => b.nodes.map((n) => [n.title.toLowerCase(), n.id])));
		for (const n of branches.flatMap((b) => b.nodes)) {
			const ids = n.prereqs!.flatMap((t) => idOf.get(t.trim().toLowerCase()) ?? []).filter((id) => id !== n.id);
			n.prereqs = ids.length ? ids : undefined;
		}
		return {
			id: `subj-${stamp}-${slug(title)}`,
			title,
			custom: true,
			branches,
		};
	} catch {
		return null;
	}
}

/** The node and its branch, across the given subjects. */
export function findNode(subjects: CurriculumSubject[], id: string) {
	for (const subj of subjects) for (const branch of subj.branches) for (const node of branch.nodes) if (node.id === id) return { node, branch };
}
