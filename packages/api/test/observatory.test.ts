import { afterEach, describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { registerGenLayerRoutes } from "../src/genlayer";
import type { Deps } from "../src/routes";
const addr = "0x" + "12".repeat(20),
  id = "0x" + "ab".repeat(32),
  apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});
function setup() {
  const app = Fastify();
  apps.push(app);
  const query = vi.fn(async (sql: string) => ({
    rows: sql.includes("SELECT receipt,confirmation")
      ? [
          {
            receipt: { statusName: "Finalized", txExecutionResult: 2 },
            confirmation: "confirmed",
          },
        ]
      : sql.includes("count(*)")
        ? [{ count: 0, total: 0 }]
        : [],
  }));
  const call = vi.fn(async () => {
    throw new Error("node unavailable");
  });
  registerGenLayerRoutes(app, {
    pool: { query },
    rpc: { call },
  } as unknown as Deps);
  return { app, query, call };
}
describe("observatory API", () => {
  it("bounds windows, offsets, outcome filters and source identifiers before work", async () => {
    const { app, query, call } = setup();
    for (const path of [
      `/contracts/${addr}/analytics?days=365`,
      `/genlayer/validators?offset=-1`,
      `/genlayer/validators?q=name`,
      `/genlayer/transactions?execution=success`,
      `/genlayer/transactions?confirmation=anything`,
      `/genlayer/transactions?days=100`,
      `/contracts/${addr}/sources/not-a-hash`,
      `/genlayer/transactions/${id}/result?round=-1`,
    ])
      expect((await app.inject("/api/v1" + path)).statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });
  it("keeps finalized failures explainable when lifecycle RPC is unavailable", async () => {
    const { app } = setup();
    const r = await app.inject(
      `/api/v1/genlayer/transactions/${id}/explanation`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      outcome: "error",
      consensus: "Finalized",
      confirmation: "confirmed",
      lifecycle: { available: false, data: null },
      observations: [],
    });
  });
  it("passes selected round through without replaying execution", async () => {
    const { app, call } = setup();
    call.mockResolvedValueOnce({ returnData: null } as never);
    const r = await app.inject(
      `/api/v1/genlayer/transactions/${id}/result?round=2`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.json().decoded_return).toBeNull();
    expect(call).toHaveBeenCalledExactlyOnceWith("gen_getTransactionData", [
      { txId: id, round: 2 },
    ]);
  });
});
