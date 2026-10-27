import { afterEach, describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { RpcError } from "@genlayer-explorer/core";
import { registerGenLayerRoutes, boundedMemo } from "../src/genlayer";
import type { Deps } from "../src/routes";
const address = "0x" + "12".repeat(20),
  id = "0x" + "ab".repeat(32);
const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});
function setup(handlers: Record<string, any> = {}) {
  const app = Fastify();
  apps.push(app);
  const query = vi.fn(async () => ({ rows: [] }));
  const call = vi.fn(async (method: string, params: any[]) => {
    if (handlers[method] instanceof Error) throw handlers[method];
    if (typeof handlers[method] === "function") return handlers[method](params);
    return handlers[method];
  });
  registerGenLayerRoutes(app, {
    pool: { query },
    rpc: { call },
  } as unknown as Deps);
  return { app, call, query };
}
const schema = {
  methods: {
    read: { readonly: true, params: [], kwparams: {} },
    write: { readonly: false, params: [], kwparams: {} },
  },
};
const methods = {
  gen_getContractCode: Buffer.from("# v0.3.0\nimport genlayer as gl").toString(
    "base64",
  ),
  gen_getContractSchema: schema,
};
describe("native explorer API", () => {
  it("rejects invalid addresses and oversized ranges before any network or SQL work", async () => {
    const { app, call, query } = setup();
    expect((await app.inject("/api/v1/contracts/invalid")).statusCode).toBe(
      400,
    );
    expect(
      (await app.inject("/api/v1/contracts?sort=arbitrary")).statusCode,
    ).toBe(400);
    expect((await app.inject("/api/v1/contracts?offset=-1")).statusCode).toBe(
      400,
    );
    expect(call).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
  it("never executes write methods or prototype properties through read API", async () => {
    const { app, call } = setup(methods);
    for (const method of ["write", "__proto__", "missing"])
      expect(
        (await app.inject(`/api/v1/contracts/${address}/read?method=${method}`))
          .statusCode,
      ).toBe(400);
    expect(call.mock.calls.some((x) => x[0] === "gen_call")).toBe(false);
  });
  it("executes only a read with an explicit state and decodes exact integer output", async () => {
    const { app, call } = setup({
      ...methods,
      gen_call: {
        data: "892b",
        status: { code: 0, message: "success" },
        syncedBlock: "0x10",
      },
    });
    const response = await app.inject(
      `/api/v1/contracts/${address}/read?method=read&state=finalized`,
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      state: "finalized",
      synced_block: 16,
      status: { code: 0 },
    });
    const callArgs = call.mock.calls.find((x) => x[0] === "gen_call")![1][0];
    expect(callArgs).toMatchObject({
      type: "read",
      status: "finalized",
      to: address,
    });
    expect(callArgs).not.toHaveProperty("value");
  });
  it("does not misclassify native RPC failure as an EVM contract", async () => {
    const { app, call } = setup({
      gen_getContractCode: new RpcError("unavailable", 429),
    });
    expect((await app.inject(`/api/v1/contracts/${address}`)).statusCode).toBe(
      500,
    );
    expect(call.mock.calls.some((x) => x[0] === "eth_getCode")).toBe(false);
  });
  it("returns 404 for empty protocol receipts rather than a fake transaction", async () => {
    const { app } = setup({
      gen_getTransactionReceipt: { status: 0, recipient: address },
    });
    expect(
      (await app.inject(`/api/v1/genlayer/transactions/${id}`)).statusCode,
    ).toBe(404);
  });
  it("retains cancelled event state and bounds the acceptance-block query", async () => {
    const { app, call } = setup({
      gen_syncing: { syncedBlock: "0x2000" },
      gen_getLogs: [
        {
          transactionHash: id,
          round: 1,
          logIndex: "0x0",
          status: "cancelled",
          removed: true,
          data: "00",
        },
      ],
    });
    const response = await app.inject(
      `/api/v1/contracts/${address}/events?status=cancelled`,
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      from_block: 3193,
      to_block: 8192,
      next_to: 3192,
      events: [{ status: "cancelled", removed: true }],
    });
    expect(
      call.mock.calls.find((x) => x[0] === "gen_getLogs")![1][0],
    ).toMatchObject({
      address,
      status: ["cancelled"],
      fromBlock: "0xc79",
      toBlock: "0x2000",
    });
  });
  it("retries failed schema loads and bounds memoized entries", async () => {
    const cache = boundedMemo<number>(1, 10000);
    const fail = vi.fn(async () => {
      throw new Error("bad");
    });
    await expect(cache("a", fail)).rejects.toThrow("bad");
    await expect(cache("a", async () => 1)).resolves.toBe(1);
    await cache("b", async () => 2);
    await expect(cache("a", async () => 3)).resolves.toBe(3);
  });
});
