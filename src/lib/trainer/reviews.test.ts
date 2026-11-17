// @ts-nocheck -- plain node script, outside the app build
// Run: node src/lib/trainer/reviews.test.ts
import assert from "node:assert";
import { reviewDates } from "./reviews.ts";

// Month and year rollover, local dates.
assert.deepStrictEqual(reviewDates(new Date(2026, 11, 30)), ["2026-12-31", "2027-01-02", "2027-01-06", "2027-01-20"]);
assert.deepStrictEqual(reviewDates(new Date(2026, 1, 27), [1, 2]), ["2026-02-28", "2026-03-01"]);
console.log("ok");
