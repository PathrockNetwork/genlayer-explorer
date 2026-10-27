import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { registerRoutes, type Deps } from "../src/routes";

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(a => a.close())); });
function appFor(rows: unknown[][]) {
  const app = Fastify(); apps.push(app);
  const query = vi.fn(async () => ({ rows: rows.shift() ?? [] }));
  registerRoutes(app, { pool: { query }, rpc: { call: async () => "0x0", status: () => [] } } as unknown as Deps);
  return app;
}
describe("overview data", () => {
  it("resolves an indexed block hash to a routable height", async () => {
    const app = appFor([[{ type: "block", id: "42" }]]);
    expect((await app.inject('/api/v1/search?q=0x' + 'ab'.repeat(32))).json()).toEqual({ type: "block", id: "42" });
  });
  it("normalizes Postgres parent heights and preserves zero values", async () => {
    const app = appFor([[{ number: "0", time: "2026-10-27T00:00:00Z", l1_block_number: "12001201", send_count: 0, send_root: "0xroot" }], [{ window_blocks: 1, blocks_with_l1: 1 }]]);
    const res = await app.inject('/api/v1/anchor');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ latest_l2_block: 0, latest_l1_block: 12001201, send_count: 0, window_blocks: 1 });
    expect(res.json()).not.toHaveProperty('avg_l1_lag_blocks');
  });
  it("returns explicit unknown context for an empty database", async () => {
    const app = appFor([[], [{ window_blocks: 0, blocks_with_l1: 0 }]]);
    expect((await app.inject('/api/v1/anchor')).json()).toEqual({ latest_l2_block: null, latest_l1_block: null, latest_time: null, send_count: null, send_root: null, window_blocks: 0, blocks_with_l1: 0 });
  });
  it("uses the latest block even when that block has no parent context", async () => {
    const app = appFor([[{ number: "7", time: null, l1_block_number: null }], [{ window_blocks: 8, blocks_with_l1: 7 }]]);
    expect((await app.inject('/api/v1/anchor')).json()).toMatchObject({ latest_l2_block: 7, latest_l1_block: null });
  });
  it("preserves genesis and a completed history range in stats", async () => {
    const app = appFor([[{ head_number: '0', chain_finalized: '0', backfill_target: '0' }], [{ blocks: 1, txs: 0, span: 0 }], [{ blocks: 1, txs: '0' }], [{ earliest: '0', blocks: 1 }], [], [{ n: 0 }], [{ remaining: '0' }]]);
    expect((await app.inject('/api/v1/stats')).json()).toMatchObject({ indexed_head: 0, earliest_indexed: 0, backfill_target: 0, backfill_remaining: 0, txs_24h: 0, gas_price: '0' });
  });
  it("normalizes optional rollup fields on database block lists", async () => {
    const app = appFor([[{ number: '1', gas_used: '0', gas_limit: '100', l1_block_number: '12001201', send_count: 0 }]]);
    expect((await app.inject('/api/v1/blocks')).json().blocks[0]).toMatchObject({ number: 1, l1_block_number: 12001201, send_count: 0 });
  });
});
