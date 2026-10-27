import { describe, it, expect, vi } from "vitest";
import { indexNativeRange, nativeTick } from "../src/genlayer";
import { GENLAYER_DEPLOYMENT, NEW_TRANSACTION } from "@genlayer-explorer/core";
import type { Ctx } from "../src/context";
const address = "0x" + "12".repeat(20),
  id = "0x" + "ab".repeat(32),
  evm = "0x" + "cd".repeat(32);
const log = {
  address: GENLAYER_DEPLOYMENT.consensus,
  topics: [NEW_TRANSACTION, id, "0x" + "0".repeat(24) + address.slice(2)],
  transactionHash: evm,
  blockNumber: "0x2d003",
};
describe("native indexing", () => {
  it("deduplicates protocol IDs and commits contract discovery with the submission", async () => {
    const query = vi.fn(async () => ({ rows: [] })),
      release = vi.fn();
    const ctx = {
      pool: { connect: async () => ({ query, release }) },
      rpc: { call: async () => [log, log] },
    } as unknown as Ctx;
    expect(await indexNativeRange(ctx, 184000, 185000)).toBe(1);
    expect(
      query.mock.calls
        .map((x) => x[0])
        .filter((x) => x.includes("INSERT INTO gen_transactions")),
    ).toHaveLength(1);
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(release).toHaveBeenCalled();
  });
  it("rolls back on persistence failure and never acknowledges a half-indexed range", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("gen_contracts"))
        throw new Error("database unavailable");
      return { rows: [] };
    });
    const ctx = {
      pool: { connect: async () => ({ query, release: vi.fn() }) },
      rpc: { call: async () => [log] },
    } as unknown as Ctx;
    await expect(indexNativeRange(ctx, 184000, 185000)).rejects.toThrow();
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(query.mock.calls.some((x) => x[0] === "COMMIT")).toBe(false);
  });
  it("does not advance discovery when RPC log retrieval fails", async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql.startsWith("SELECT")
        ? [{ head: 184000, history_next: 47929 }]
        : [],
    }));
    const rpc = {
      call: vi.fn(async (method: string) => {
        if (method === "eth_getBlockByNumber") return { number: "0x2d36d" };
        throw new Error("RPC unavailable");
      }),
    };
    const ctx = { pool: { query }, rpc } as unknown as Ctx;
    await expect(nativeTick(ctx, ctx.rpc, false)).rejects.toThrow();
    expect(query.mock.calls.some((x) => x[0].includes("UPDATE gen_sync"))).toBe(
      false,
    );
  });
});
