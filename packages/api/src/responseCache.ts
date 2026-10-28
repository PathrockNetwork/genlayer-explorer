import type { FastifyInstance, FastifyRequest } from "fastify";

/** Public snapshots only. Live method reads, health, version and search bypass this cache. */
const TTL: Record<string, number> = {
  "/api/v1/genlayer/overview": 5_000,
  "/api/v1/genlayer/transactions": 3_000,
  "/api/v1/genlayer/transactions/:id": 3_000,
  "/api/v1/genlayer/transactions/:id/result": 3_000,
  "/api/v1/genlayer/transactions/:id/explanation": 5_000,
  "/api/v1/genlayer/attention": 10_000,
  "/api/v1/contracts": 10_000,
  "/api/v1/contracts/:address": 5_000,
  "/api/v1/contracts/:address/events": 3_000,
  "/api/v1/contracts/:address/analytics": 15_000,
  "/api/v1/contracts/:address/profile": 30_000,
  "/api/v1/contracts/:address/sources/:hash": 30_000,
  "/api/v1/genlayer/validators": 15_000,
  "/api/v1/genlayer/validators/:address": 15_000,
};
type Entry = { body: string; contentType: string; at: number; expires: number; bytes: number };
type Flight = { key: string; at: number; ttl: number; promise: Promise<Entry | null>; resolve: (entry: Entry | null) => void };

/** Bounded process memory; no disk writes or external cache service. Failures are never stored. */
export function registerResponseCache(app: FastifyInstance, options: {
  now?: () => number; maxEntries?: number; maxBytes?: number; maxEntryBytes?: number; maxPending?: number;
} = {}) {
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? 256, maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
  const maxEntryBytes = options.maxEntryBytes ?? 1024 * 1024, maxPending = options.maxPending ?? 64;
  const entries = new Map<string, Entry>(), flights = new Map<string, Flight>();
  const owners = new WeakMap<FastifyRequest, Flight>();
  let bytes = 0;
  const remove = (key: string) => { const old = entries.get(key); if (old) bytes -= old.bytes; entries.delete(key); };
  const finish = (req: FastifyRequest, entry: Entry | null = null) => {
    const flight = owners.get(req);
    if (!flight) return;
    owners.delete(req);
    if (flights.get(flight.key) === flight) {
      flights.delete(flight.key);
      if (entry && entry.expires > now() && entry.bytes <= maxEntryBytes && entry.bytes <= maxBytes) {
        remove(flight.key);
        while (entries.size && (entries.size >= maxEntries || bytes + entry.bytes > maxBytes)) remove(entries.keys().next().value!);
        if (maxEntries > 0) { entries.set(flight.key, entry); bytes += entry.bytes; }
      }
    }
    flight.resolve(entry);
  };
  app.addHook("onRequest", async (req, reply) => {
    const ttl = TTL[req.routeOptions.url ?? ""];
    if (req.method !== "GET" || !ttl || req.url.length > 2048 || req.headers.authorization || req.headers.cookie) return;
    const url = new URL(req.url, "http://cache.local");
    url.searchParams.sort();
    const key = url.pathname + url.search;
    const fresh = /(?:no-cache|no-store|max-age\s*=\s*0)/i.test(String(req.headers["cache-control"] ?? ""));
    const send = (entry: Entry, state: string) => reply
      .header("cache-control", "no-store")
      .header("x-explorer-cache", state)
      .header("x-explorer-cache-age-ms", String(Math.max(0, now() - entry.at)))
      .type(entry.contentType).send(entry.body);
    const hit = entries.get(key);
    if (!fresh && hit && hit.expires > now()) {
      entries.delete(key); entries.set(key, hit);
      return send(hit, "HIT");
    }
    if (hit) remove(key);
    const pending = flights.get(key);
    if (!fresh && pending) {
      const result = await pending.promise;
      if (result && result.expires > now()) return send(result, "COALESCED");
      // Failed or over-age work does not suppress a retry.
    }
    reply.header("x-explorer-cache", "MISS");
    if (flights.size >= maxPending || flights.has(key) && !fresh) return;
    let resolve!: Flight["resolve"];
    const promise = new Promise<Entry | null>(done => { resolve = done; });
    const flight = { key, at: now(), ttl, promise, resolve };
    flights.set(key, flight); owners.set(req, flight);
  });
  app.addHook("onSend", async (req, reply, payload) => {
    const flight = owners.get(req);
    if (flight) {
      const contentType = String(reply.getHeader("content-type") ?? "");
      const cacheable = reply.statusCode === 200 && contentType.startsWith("application/json") && typeof payload === "string" && !reply.hasHeader("set-cookie") && !reply.hasHeader("vary");
      const entry = cacheable ? { body: payload as string, contentType, at: flight.at, expires: flight.at + flight.ttl, bytes: Buffer.byteLength(payload as string) } : null;
      finish(req, entry);
      if (entry) reply.header("x-explorer-cache-age-ms", String(Math.max(0, now() - entry.at)));
    }
    return payload;
  });
  app.addHook("onError", async req => { finish(req); });
  app.addHook("onResponse", async req => { finish(req); });
  app.addHook("onTimeout", async req => { finish(req); });
  app.addHook("onRequestAbort", async req => { finish(req); });
  app.addHook("onClose", async () => {
    for (const f of flights.values()) f.resolve(null);
    flights.clear(); entries.clear(); bytes = 0;
  });
}

/** Only Vite's content-hashed assets are immutable; HTML must discover each new release. */
export function assetCacheControl(file: string): string {
  return /\/assets\/[^/]+-[\w-]{8,}\.(?:js|css|woff2?|png|jpe?g|svg|webp|ico)$/.test(file.replaceAll("\\", "/"))
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}
