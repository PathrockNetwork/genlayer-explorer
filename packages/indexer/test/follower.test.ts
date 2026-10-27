import { describe, expect, it, vi } from "vitest";
import { pollFinalized, type Follower } from "../src/follower";
import type { ParsedBlock } from "@genlayer-explorer/core";

function fixture(head: number | null, finalized: number) {
  const saved: (number | null)[] = [];
  const ctx: Follower = {
    finalized: vi.fn(async () => finalized), head: () => head,
    setHead: n => { head = n; }, setFinalized: vi.fn(),
    fetch: vi.fn(async numbers => numbers.map(number => ({ block: { number } } as ParsedBlock))),
    persist: vi.fn(async () => {}), saveState: vi.fn(async () => { saved.push(head); }),
    stopping: () => false, batchSize: 2,
  };
  return { ctx, saved };
}
describe("finalized follower", () => {
  it("records a heartbeat when a healthy finalized head does not move", async () => {
    const { ctx, saved } = fixture(20, 20);
    await pollFinalized(ctx);
    expect(saved).toEqual([20]); expect(ctx.fetch).not.toHaveBeenCalled();
  });
  it("persists missing blocks in order and checkpoints progress", async () => {
    const { ctx, saved } = fixture(20, 23);
    await pollFinalized(ctx);
    expect(ctx.fetch).toHaveBeenNthCalledWith(1, [21, 22]);
    expect(ctx.fetch).toHaveBeenNthCalledWith(2, [23]);
    expect(saved).toEqual([22, 23, 23]);
  });
  it("does not claim a healthy heartbeat after an RPC failure", async () => {
    const { ctx } = fixture(20, 20); ctx.finalized = async () => { throw Error("RPC offline"); };
    await expect(pollFinalized(ctx)).rejects.toThrow("RPC offline");
    expect(ctx.saveState).not.toHaveBeenCalled();
  });
  it("never advances the head past a failed persistence", async () => {
    const { ctx } = fixture(20, 21); ctx.persist = async () => { throw Error("DB offline"); };
    await expect(pollFinalized(ctx)).rejects.toThrow("DB offline");
    expect(ctx.head()).toBe(20); expect(ctx.saveState).not.toHaveBeenCalled();
  });
  it("indexes genesis on an empty database", async () => {
    const { ctx } = fixture(null, 0); await pollFinalized(ctx);
    expect(ctx.fetch).toHaveBeenCalledWith([0]); expect(ctx.head()).toBe(0);
  });
});
