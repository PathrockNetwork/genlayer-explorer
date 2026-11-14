import { describe, expect, it, vi } from "vitest";
import { loadContractActivity } from "../src/contractActivity";
import type { Deps } from "../src/routes";

describe("contract directory trends", () => {
  it("keeps partial edge buckets and separates the previous window from current calls", async () => {
    const until = new Date("2026-11-14T12:30:00Z");
    const query = vi.fn(async () => ({ rows: [
      { address: "native", bucket: Date.parse("2026-11-13T11:00:00Z"), calls: 7, current_calls: 0 },
      { address: "native", bucket: Date.parse("2026-11-13T12:00:00Z"), calls: 5, current_calls: 2 },
      { address: "native", bucket: Date.parse("2026-11-14T12:00:00Z"), calls: 3, current_calls: 3 },
    ] }));
    const result = await loadContractActivity({ query } as unknown as Deps["pool"], [{ address: "native", kind: "intelligent" }], until);
    const activity = result.get("native")!;
    expect(activity.previous_calls).toBe(10);
    expect(activity.points).toHaveLength(25);
    expect(activity.points[0].calls).toBe(2);
    expect(activity.points[24].calls).toBe(3);
    expect(activity.points.reduce((n, p) => n + p.calls, 0)).toBe(5);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("confirmation='confirmed'");
    expect(params).toEqual([["native"], new Date("2026-11-12T12:30:00Z"), new Date("2026-11-13T12:30:00Z"), until]);
  });
  it("queries native and EVM addresses separately and fills inactive contracts with zeros", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const result = await loadContractActivity({ query } as unknown as Deps["pool"], [{ address: "a", kind: "intelligent" }, { address: "b", kind: "evm" }], new Date("2026-11-14T12:30:00Z"));
    expect(query).toHaveBeenCalledTimes(2);
    const calls = query.mock.calls as unknown as [string, unknown[]][];
    expect(calls[0][1][0]).toEqual(["a"]);
    expect(calls[1][1][0]).toEqual(["b"]);
    expect(calls[1][0]).toContain('FROM transactions WHERE "to"=ANY');
    expect(result.get("b")?.points.every(p => p.calls === 0)).toBe(true);
  });
  it("does no database work for an empty result page", async () => {
    const query = vi.fn();
    expect((await loadContractActivity({ query } as unknown as Deps["pool"], [], new Date())).size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
