// Scheduling (FSRS via ts-fsrs) and mastery (BKT) math. Pure, so plain node can test it.
import { DefaultScheduler, Rating } from "ts-fsrs";
import type { Verdict } from "./lab";

export { Rating };

/**
 * FSRS rating from the checklist grader plus the learner's 1-4 confidence:
 * wrong (or answer shown) → Again; partial → Hard; correct but guessing/unsure (1-2) → Hard;
 * correct and fairly sure (3) or unrated → Good; correct and certain (4) → Easy.
 * An override wins: its verdict is used and confidence ignored (it was given about the grader's call), so Again or Good.
 */
export function ratingFor(verdict: Verdict, confidence?: number, override?: boolean) {
	if (verdict === "wrong") return Rating.Again;
	if (verdict === "partial") return Rating.Hard;
	if (override || !confidence) return Rating.Good;
	return confidence <= 2 ? Rating.Hard : confidence === 4 ? Rating.Easy : Rating.Good;
}

const DAY = 864e5;
/**
 * Goal date (YYYY-MM-DD, local) → FSRS config. Closer goals ask for higher retention, and the interval cap is half the
 * time left so at least one more review lands before the goal. No goal, or a past one, gets the defaults.
 */
export function goalConfig(goal: string | undefined, now = new Date()) {
	const days = goal ? Math.floor((new Date(`${goal}T23:59:59`).getTime() - now.getTime()) / DAY) : NaN;
	if (!(days >= 1)) return { desiredRetention: 0.9, maximumInterval: 36500 };
	return { desiredRetention: days <= 14 ? 0.95 : days <= 60 ? 0.92 : 0.9, maximumInterval: Math.max(1, Math.floor(days / 2)) };
}

type Scheduler = Awaited<ReturnType<typeof DefaultScheduler>>;
const schedulers = new Map<string, Promise<Scheduler>>();
function scheduler(cfg: ReturnType<typeof goalConfig>) {
	const k = JSON.stringify(cfg);
	if (!schedulers.has(k)) schedulers.set(k, DefaultScheduler({ ...cfg, enableFuzz: false }));
	return schedulers.get(k)!;
}

/** Serialized ts-fsrs card, as stored in cards.fsrs (dates are ISO strings after the JSON round trip). */
export type FsrsState = Record<string, unknown> & { dueAt: string; lastReviewAt: string | null; reps: number };
const toJson = (c: unknown) => JSON.parse(JSON.stringify(c)) as FsrsState;

export async function newCard(now = new Date()) {
	return toJson((await scheduler(goalConfig(undefined))).newCard({ now }));
}

/** One review: the next FSRS state and its due date. `prev` null starts a new card. */
export async function scheduleCard(prev: FsrsState | null | undefined, rating: Rating, now = new Date(), goal?: string) {
	const s = await scheduler(goalConfig(goal, now));
	const card = prev
		? { ...prev, dueAt: new Date(prev.dueAt), lastReviewAt: prev.lastReviewAt ? new Date(prev.lastReviewAt) : null }
		: s.newCard({ now });
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the stored JSON has the card's fields; ts-fsrs validates it
	const next = toJson(s.review({ card: card as any, grade: rating as any, now }).card);
	return { fsrs: next, due: next.dueAt };
}

// --- Learner model: standard BKT with fixed parameters (fitting needs far more data than one learner makes) ---
export const BKT = { init: 0.2, learn: 0.15, slip: 0.1, guess: 0.2 };
export const MASTERED = 0.85;

/** Posterior given the answer, then the learning step. Partial counts as half: the mean of the two posteriors. */
export function bkt(p: number, v: Verdict) {
	const right = (p * (1 - BKT.slip)) / (p * (1 - BKT.slip) + (1 - p) * BKT.guess);
	const wrong = (p * BKT.slip) / (p * BKT.slip + (1 - p) * (1 - BKT.guess));
	const post = v === "correct" ? right : v === "wrong" ? wrong : (right + wrong) / 2;
	return post + (1 - post) * BKT.learn;
}

/** Math Academy-style implicit credit: succeeding on a harder node nudges its prerequisites' concepts up. */
export const trickle = (p: number, share = 0.1) => p + (1 - p) * share;

/** Local calendar date, YYYY-MM-DD. */
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Interleaved order: round-robin across groups (concepts), so same-concept cards aren't back to back. Keeps order within a group. */
export function interleave<T>(items: T[], group: (t: T) => string) {
	const groups = new Map<string, T[]>();
	for (const t of items) groups.set(group(t), [...(groups.get(group(t)) ?? []), t]);
	const out: T[] = [];
	for (let i = 0; out.length < items.length; i++) for (const g of groups.values()) if (g[i] !== undefined) out.push(g[i]);
	return out;
}
