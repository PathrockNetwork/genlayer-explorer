/**
 * Network routes: the public RPC endpoint directory and chain config.
 */
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { JsonRpc, hexToNumber, redactUrl, rpcUrlsFromEnv } from "@genlayer-explorer/core";

/** Same TTL memo as routes.ts, keyed so parameterised queries cache separately. */
function memoBy<T>(ttlMs: number, fn: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const cache = new Map<string, { at: number; p: Promise<T> }>();
  return (key) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.p;
    const p = fn(key).catch((e) => {
      cache.delete(key);
      throw e;
    });
    cache.set(key, { at: Date.now(), p });
    return p;
  };
}

const RETAIN_HOURS = Number(process.env.RETAIN_HOURS ?? 72);

export function registerNetworkRoutes(
  app: FastifyInstance,
  { pool, rpc }: { pool: pg.Pool; rpc: JsonRpc },
): void {
  const q = <T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []) => pool.query<T>(text, params);

  /**
   * Health, height and latency of every configured RPC endpoint, probed live.
   * `healthy` requires the endpoint to serve the expected chain id.
   */
  const endpoints = memoBy(15_000, async () => {
    const urls = rpcUrlsFromEnv();
    const state = await q(`select active_rpc, chain_finalized from sync_state where id = 1`);
    const active = state.rows[0]?.active_rpc ?? null;
    const results = await Promise.all(
      urls.map(async (url, i) => {
        const client = new JsonRpc([url], 3);
        const started = Date.now();
        try {
          const [height, version, chain] = await client.batch<string>([
            { method: "eth_blockNumber", params: [] },
            { method: "web3_clientVersion", params: [] },
            { method: "eth_chainId", params: [] },
          ]);
          return {
            url: redactUrl(url),
            healthy: hexToNumber(chain) === 4221,
            latency_ms: Date.now() - started,
            height: hexToNumber(height),
            client: version,
            error: null as string | null,
          };
        } catch (e) {
          return { url: redactUrl(url), healthy: false, latency_ms: null, height: null, client: null, error: (e as Error).message };
        }
      }),
    );
    return {
      indexer_rpc: active,
      chain_finalized: state.rows[0]?.chain_finalized ? Number(state.rows[0].chain_finalized) : null,
      endpoints: results.map((r, i) => ({ ...r, priority: i + 1, used_by_indexer: r.url === active })),
      api_rpc: rpc.status(),
    };
  });

  app.get("/api/v1/endpoints", async () => endpoints(""));

  app.get("/api/v1/config", async () => ({
    chain: { name: "GenLayer", network: "bradbury testnet", chain_id: 4221, currency: { symbol: "GEN", decimals: 18 } },
    rpc_endpoints: rpcUrlsFromEnv().map(redactUrl),
    indexer: {
      head: "finalized",
      retain_hours: RETAIN_HOURS,
      backfill_depth: Number(process.env.BACKFILL_DEPTH ?? 30_000),
      database: "PostgreSQL",
    },
    /** What the configured RPC lets this deployment do; a private node flips these up. */
    features: {
      full_history: RETAIN_HOURS <= 0,
    },
  }));
}
