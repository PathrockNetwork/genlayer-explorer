import { afterEach, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { JsonRpc } from "@genlayer-explorer/core";
import { registerNetworkRoutes } from "../src/network";
import type pg from "pg";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("keeps a correct-chain RPC healthy when client metadata is unsupported", async () => {
  vi.stubEnv("RPC_URLS", "https://rpc.example.org");
  vi.spyOn(JsonRpc.prototype, "batch").mockResolvedValue(["0x10", "0x107d"]);
  vi.spyOn(JsonRpc.prototype, "call").mockRejectedValue(Error("method not found"));
  const app = Fastify();
  registerNetworkRoutes(app, { pool: { query: async () => ({ rows: [] }) } as unknown as pg.Pool, rpc: new JsonRpc(["https://rpc.example.org"], 10) });
  try {
    const res = await app.inject('/api/v1/endpoints');
    expect(res.json().endpoints[0]).toMatchObject({ healthy: true, client: null, height: 16, error: null });
  } finally { await app.close(); }
});
