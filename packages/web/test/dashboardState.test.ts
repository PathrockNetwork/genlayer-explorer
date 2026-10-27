import { describe, expect, it } from "vitest";
import type { Network } from "../src/api";
import { dashboardState } from "../src/dashboardState";
const now = Date.parse("2026-10-27T00:00:00Z");
const net = { indexed_head: 30000, chain_finalized: 30000, lag_blocks: 0, blocks_indexed: 30001, earliest_indexed: 0, backfill_target: 0, backfill_remaining: 0, indexer_updated_at: new Date(now).toISOString() } as Network;
describe("dashboard states", () => {
  it("recognizes completed history including a zero backfill target", () => expect(dashboardState(net, null, now)).toBe("normal"));
  it("reports holes even when the oldest block reached the target", () => expect(dashboardState({ ...net, backfill_remaining: 4 }, null, now)).toBe("backfill"));
  it("reports head lag separately from history", () => expect(dashboardState({ ...net, lag_blocks: 1 }, null, now)).toBe("backfill"));
  it("surfaces request errors while preserving previously loaded data", () => expect(dashboardState(net, "failed", now)).toBe("dberror"));
  it("distinguishes loading from empty", () => { expect(dashboardState(null, null, now)).toBe("loading"); expect(dashboardState({ ...net, blocks_indexed: 0, indexed_head: null }, null, now)).toBe("empty"); });
  it("detects stale heartbeats independently of chain block timestamps", () => expect(dashboardState(net, null, now + 61000)).toBe("stopped"));
});
