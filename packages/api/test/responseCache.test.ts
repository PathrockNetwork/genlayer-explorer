import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { registerResponseCache, assetCacheControl } from "../src/responseCache";

const route = "/api/v1/contracts";
describe("bounded public response cache", () => {
  it("expires snapshots, isolates filters and honors explicit revalidation", async () => {
    let now = 1000, calls = 0;
    const app = Fastify(); registerResponseCache(app, { now: () => now });
    app.get(route, async req => ({ calls: ++calls, query: req.query }));
    try {
      expect((await app.inject(route + "?q=a&limit=2")).headers["x-explorer-cache"]).toBe("MISS");
      now += 100;
      const hit = await app.inject(route + "?limit=2&q=a");
      expect(hit.headers["x-explorer-cache"]).toBe("HIT");
      expect(hit.headers["cache-control"]).toBe("no-store");
      expect(hit.headers["x-explorer-cache-age-ms"]).toBe("100");
      expect(hit.json().calls).toBe(1);
      expect((await app.inject(route + "?q=b&limit=2")).json().calls).toBe(2);
      expect((await app.inject({ url: route + "?q=a&limit=2", headers: { "cache-control": "no-cache" } })).json().calls).toBe(3);
      expect((await app.inject(route + "?q=a&limit=2")).json().calls).toBe(3);
      now += 10_000;
      expect((await app.inject(route + "?q=a&limit=2")).json().calls).toBe(4);
    } finally { await app.close(); }
  });
  it("shares concurrent work instead of issuing duplicate database/RPC requests", async () => {
    let calls = 0, release!: () => void, started!: () => void;
    const gate = new Promise<void>(done => { release = done; });
    const began = new Promise<void>(done => { started = done; });
    const app = Fastify(); registerResponseCache(app);
    app.get(route, async () => { calls++; started(); await gate; return { value: calls }; });
    try {
      await app.ready();
      const first = app.inject(route); await began;
      const rest = Array.from({ length: 10 }, () => app.inject(route));
      await new Promise(resolve => setImmediate(resolve)); release();
      const results = await Promise.all([first, ...rest]);
      expect(calls).toBe(1);
      expect(results.every(r => r.statusCode === 200 && r.json().value === 1)).toBe(true);
      expect(results.some(r => r.headers["x-explorer-cache"] === "COALESCED")).toBe(true);
    } finally { release(); await app.close(); }
  });
  it("never caches errors, invalid requests or authenticated responses", async () => {
    let calls = 0;
    const app = Fastify(); registerResponseCache(app);
    app.get(route, async (req, reply) => {
      calls++;
      if ((req.query as any).fail === "500") throw new Error("offline");
      if ((req.query as any).fail === "400") return reply.code(400).send({ error: "invalid" });
      return { calls };
    });
    try {
      for (const code of [500, 400]) for (let i = 0; i < 2; i++) expect((await app.inject(route + "?fail=" + code)).statusCode).toBe(code);
      expect(calls).toBe(4);
      for (let i = 0; i < 2; i++) await app.inject({ url: route, headers: { authorization: "Bearer example" } });
      for (let i = 0; i < 2; i++) await app.inject({ url: route, headers: { cookie: "session=example" } });
      expect(calls).toBe(8);
      expect((await app.inject(route)).json().calls).toBe(9);
      expect((await app.inject(route)).json().calls).toBe(9);
    } finally { await app.close(); }
  });
  it("does not retain expired work or oversized responses and bounds stored entries", async () => {
    let now = 0, calls = 0;
    const app = Fastify(); registerResponseCache(app, { now: () => now, maxEntries: 2, maxEntryBytes: 100, maxBytes: 150 });
    app.get(route, async req => {
      calls++;
      if ((req.query as any).slow) now += 10_001;
      return { calls, text: (req.query as any).large ? "a".repeat(200) : "ok" };
    });
    try {
      for (const query of ["slow=1", "large=1"]) {
        await app.inject(route + "?" + query);
        expect((await app.inject(route + "?" + query)).headers["x-explorer-cache"]).toBe("MISS");
      }
      await app.inject(route + "?q=a"); await app.inject(route + "?q=b");
      expect((await app.inject(route + "?q=a")).headers["x-explorer-cache"]).toBe("HIT");
      await app.inject(route + "?q=c");
      expect((await app.inject(route + "?q=b")).headers["x-explorer-cache"]).toBe("MISS");
    } finally { await app.close(); }
  });
  it("leaves live reads, search, health, version and non-GET requests uncached", async () => {
    let calls = 0; const app = Fastify(); registerResponseCache(app);
    for (const path of ["/api/v1/contracts/:address/read", "/api/v1/search", "/api/v1/version", "/health"]) app.get(path, async () => ({ calls: ++calls }));
    app.post(route, async () => ({ calls: ++calls }));
    try {
      for (const url of ["/api/v1/contracts/0xabc/read", "/api/v1/search", "/api/v1/version", "/health"]) {
        const a = await app.inject(url), b = await app.inject(url);
        expect(b.json().calls).toBe(a.json().calls + 1); expect(b.headers["x-explorer-cache"]).toBeUndefined();
      }
      const a = await app.inject({ method: "POST", url: route }), b = await app.inject({ method: "POST", url: route });
      expect(b.json().calls).toBe(a.json().calls + 1);
    } finally { await app.close(); }
  });
  it("releases concurrent waiters after a failed load and permits recovery", async () => {
    let fail = true, release!: () => void, started!: () => void;
    const gate = new Promise<void>(done => { release = done; });
    const began = new Promise<void>(done => { started = done; });
    const app = Fastify(); registerResponseCache(app);
    app.get(route, async () => { started(); await gate; if (fail) throw new Error("offline"); return { recovered: true }; });
    try {
      await app.ready(); const first = app.inject(route); await began;
      const second = app.inject(route); await new Promise(resolve => setImmediate(resolve)); release();
      expect((await Promise.all([first, second])).map(r => r.statusCode)).toEqual([500, 500]);
      fail = false;
      expect((await app.inject(route)).json()).toEqual({ recovered: true });
      expect((await app.inject(route)).headers["x-explorer-cache"]).toBe("HIT");
    } finally { release(); await app.close(); }
  });
  it("limits retained bytes across entries", async () => {
    const app = Fastify(); registerResponseCache(app, { maxBytes: 60 });
    app.get(route, async () => ({ text: "a".repeat(30) }));
    try {
      await app.inject(route + "?a"); await app.inject(route + "?b");
      expect((await app.inject(route + "?a")).headers["x-explorer-cache"]).toBe("MISS");
    } finally { await app.close(); }
  });
});
it("caches only content-hashed static assets immutably", () => {
  for (const file of ["/dist/assets/index-C_C1AGFJ.js", "/dist/assets/index-uhyT90wH.css", "/dist/assets/inter-latin-Dx4kXJAl.woff2"]) expect(assetCacheControl(file)).toContain("immutable");
  for (const file of ["/dist/index.html", "/dist/brand/logo.svg", "/dist/assets/config.js", "/dist/assets/page-deadbeef.html"]) expect(assetCacheControl(file)).toBe("no-cache");
});
