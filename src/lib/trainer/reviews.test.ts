// @ts-nocheck -- plain node script, outside the app build
// Run: node src/lib/trainer/reviews.test.ts
import assert from "node:assert";
import { BKT, MASTERED, Rating, bkt, goalConfig, interleave, newCard, ratingFor, scheduleCard, trickle, ymd } from "./reviews.ts";

// Rating mapping; an override ignores confidence.
assert.strictEqual(ratingFor("wrong", 4), Rating.Again);
assert.strictEqual(ratingFor("partial", 4), Rating.Hard);
assert.strictEqual(ratingFor("correct", 1), Rating.Hard);
assert.strictEqual(ratingFor("correct", 2), Rating.Hard);
assert.strictEqual(ratingFor("correct", 3), Rating.Good);
assert.strictEqual(ratingFor("correct"), Rating.Good);
assert.strictEqual(ratingFor("correct", 4), Rating.Easy);
assert.strictEqual(ratingFor("correct", 1, true), Rating.Good);
assert.strictEqual(ratingFor("wrong", 4, true), Rating.Again);

// Goal date → retention and interval cap.
const now = new Date(2026, 10, 19, 12);
assert.deepStrictEqual(goalConfig(undefined, now), { desiredRetention: 0.9, maximumInterval: 36500 });
assert.deepStrictEqual(goalConfig("2026-11-01", now), { desiredRetention: 0.9, maximumInterval: 36500 }); // past
assert.deepStrictEqual(goalConfig("2026-11-29", now), { desiredRetention: 0.95, maximumInterval: 5 });
assert.deepStrictEqual(goalConfig("2026-12-31", now), { desiredRetention: 0.92, maximumInterval: 21 });
assert.deepStrictEqual(goalConfig("2027-11-19", now), { desiredRetention: 0.9, maximumInterval: 182 });

// FSRS wrapper: JSON round trip, Again comes back soon, Good later, the goal caps the interval.
const fresh = await newCard(now);
assert.strictEqual(fresh.reps, 0);
const again = await scheduleCard(fresh, Rating.Again, now);
const good = await scheduleCard(JSON.parse(JSON.stringify(fresh)), Rating.Good, now);
assert.ok(Date.parse(again.due) < Date.parse(good.due));
assert.ok(Date.parse(again.due) - now.getTime() < 864e5);
assert.strictEqual(good.fsrs.reps, 1);
let card = good.fsrs;
let t = now;
for (let i = 0; i < 6; i++) ({ fsrs: card } = await scheduleCard(card, Rating.Easy, (t = new Date(card.dueAt))));
assert.ok(Date.parse(card.dueAt) - t.getTime() > 5 * 864e5);
// The same mature card reviewed 10 days before a goal: interval capped at half the time left.
t = new Date(card.dueAt);
const goal = new Date(t.getTime() + 10 * 864e5);
const capped = await scheduleCard(card, Rating.Easy, t, ymd(goal));
const uncapped = await scheduleCard(card, Rating.Easy, t);
assert.ok(Date.parse(capped.due) - t.getTime() <= 5 * 864e5 + 1000, "goal caps the interval");
assert.ok(Date.parse(uncapped.due) > Date.parse(capped.due));

// BKT: correct raises, wrong lowers, partial sits between; two right answers from the prior reach mastery.
const p0 = BKT.init;
assert.ok(bkt(p0, "correct") > bkt(p0, "partial") && bkt(p0, "partial") > bkt(p0, "wrong"));
assert.ok(Math.abs(bkt(p0, "correct") - 0.6) < 0.01);
assert.ok(bkt(bkt(p0, "correct"), "correct") >= MASTERED);
assert.ok(bkt(0.9, "wrong") < 0.9);
// Trickle-down: a small nudge toward 1, never past it.
assert.ok(Math.abs(trickle(0.5) - 0.55) < 1e-9);
assert.ok(trickle(0.99) < 1);
console.log("reviews ok");

// Interleaving and local dates.
assert.deepStrictEqual(interleave(["a1", "a2", "a3", "b1", "c1", "b2"], (x) => x[0]), ["a1", "b1", "c1", "a2", "b2", "a3"]);
assert.strictEqual(ymd(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
console.log("interleave ok");
