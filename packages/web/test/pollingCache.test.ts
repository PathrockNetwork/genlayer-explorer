import { describe, it, expect } from "vitest";
import { PollingCache, pollingKey } from "../src/pollingCache";
describe("recent navigation snapshots", () => {
  it("preserves observation time and rejects old snapshots", () => {
    const cache = new PollingCache();
    const snapshot = { data: { count: 12 }, updatedAt: new Date(1000) };
    cache.set("overview", snapshot);
    expect(cache.get("overview", 1001)).toBe(snapshot);
    expect(cache.get("overview", 31_000)).toBeNull();
    expect(cache.get(undefined)).toBeNull();
  });
  it("isolates addresses, filters, time windows and page numbers", () => {
    const cache = new PollingCache();
    const key = pollingKey("health", "0xabc", "7");
    cache.set(key, { data: 7, updatedAt: new Date(0) });
    expect(cache.get(pollingKey("health", "0xdef", "7"), 1)).toBeNull();
    expect(cache.get(pollingKey("health", "0xabc", "1"), 1)).toBeNull();
    expect(pollingKey("a,b", "c")).not.toBe(pollingKey("a", "b,c"));
    expect(pollingKey("contracts", 0)).not.toBe(pollingKey("contracts", 1));
    cache.delete(key); expect(cache.get(key, 1)).toBeNull();
  });
  it("evicts by recency and memory size rather than growing with every visit", () => {
    const cache = new PollingCache(2, 80);
    const save = (key: string) => cache.set(key, { data: key, updatedAt: new Date(0) });
    save("a"); save("b"); cache.get("a", 1); save("c");
    expect(cache.get("b", 1)).toBeNull(); expect(cache.get("a", 1)).not.toBeNull();
    cache.set("large", { data: "a".repeat(100), updatedAt: new Date(0) });
    expect(cache.get("large", 1)).toBeNull();
    const tiny = new PollingCache(10, 12);
    for (const key of ["aaa", "bbb"]) tiny.set(key, { data: key, updatedAt: new Date(0) });
    expect(tiny.get("aaa", 1)).toBeNull(); expect(tiny.get("bbb", 1)).not.toBeNull();
  });
});
