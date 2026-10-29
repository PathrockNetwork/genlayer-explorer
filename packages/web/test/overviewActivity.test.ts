import { expect, it } from "vitest";
import { activityBuckets } from "../src/overviewActivity";

it("preserves the first and last partial buckets of a 24-hour window", () => {
  const at = Date.parse("2026-10-27T11:46:00Z");
  const buckets = activityBuckets([
    { t: "2026-10-26T11:45:00Z", txs: 1092 },
    { t: "2026-10-27T11:45:00Z", txs: 3 },
  ], 900, at);
  expect(buckets).toHaveLength(97);
  expect(buckets[0].txs).toBe(1092);
  expect(buckets.at(-1)?.txs).toBe(3);
  expect(buckets.reduce((sum, p) => sum + p.txs, 0)).toBe(1095);
});
it("fills missing activity buckets with zero without inventing transactions", () => {
  const buckets = activityBuckets([], 900, Date.parse("2026-10-27T12:00:00Z"));
  expect(buckets.every(p => p.txs === 0)).toBe(true);
});


import { activityChange } from "../src/overviewActivity";
it("compares real periods without inventing percentages for zero or missing baselines", () => {
  expect(activityChange(120, 100)).toEqual({ label: "+20%", direction: "up" });
  expect(activityChange(9, 11)).toEqual({ label: "-18.2%", direction: "down" });
  expect(activityChange(0, 8)).toEqual({ label: "-100%", direction: "down" });
  expect(activityChange(8, 0)).toEqual({ label: "New", direction: "up" });
  expect(activityChange(0, 0)).toEqual({ label: "0%", direction: "flat" });
  expect(activityChange(8, undefined)).toEqual({ label: "—", direction: "unknown" });
});
