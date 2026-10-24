/** Public GenLayer RPC endpoints, in failover order. */
export const PUBLIC_RPCS = ["https://genlayer-rpc.pathrocknetwork.org"];
export const PUBLIC_RPC = PUBLIC_RPCS[0];
/** Host part of an RPC URL ("rpc.example.com"). */
export const host = (url: string): string => { try { return new URL(url).host; } catch { return url; } };
/** True when the URL is one of the public endpoints. */
export const isPublicRpc = (url: string): boolean => PUBLIC_RPCS.includes(host(url));
/** Rate limit note for the public gateways (requests/second per IP). */
export const PUBLIC_RATE_LIMIT = "~50 req/s per IP";
/** Stable link back to the RPC console for a given endpoint. */
export const consoleLink = (url: string, method?: string): string => {
  const params = new URLSearchParams({ url });
  if (method) params.set("method", method);
  return `${window.location.origin}/rpc?${params.toString()}`;
};
/** Arithmetic median of a non-empty number list. */
export const median = (xs: (number | null)[]): number | null => { const nums = xs.filter((v): v is number => v !== null); if (!nums.length) return null; const s=[...nums].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2 ? s[m]! : (s[m-1]!+s[m]!)/2; };
/** Does this probe result match the endpoint with the given host? */
/** Does this entry match the picker filter: the host itself, or one of the saved hosts. */
export const matchesEndpoint = (entry: Endpoint | string | undefined, hostName: string, saved: string[] = []): boolean => {
  const url = typeof entry === "string" ? entry : entry?.url;
  if (url === undefined) return false;
  return host(url) === hostName || saved.includes(url);
};
/** How far an endpoint's height may trail the indexer's finalized height before it looks unhealthy. */
export const LAG_TOLERANCE = 5;
import type { Endpoint } from "./api";

export type ProbeObservation = { at: number; latency: number | null; healthy: boolean; height: number | null };
export type EndpointFilter = "all" | "healthy" | "unhealthy" | "saved";
/** Height of the endpoint minus finalized height; null when either is unknown. */
export const finalizedDelta = (height: number | null | undefined, finalized: number | null): number | null =>
  height === null || height === undefined || finalized === null ? null : height - finalized;
/** "even with head", "N blocks behind", or "N ahead". */
export const deltaText = (delta: number | null): string => delta === null ? "—" : delta === 0 ? "even with head" : delta < 0 ? `${-delta} behind` : `${delta} ahead`;
/** Apply the query/filter/saved selection to the endpoint list. */
export function filterEndpoints(entries: Endpoint[], query: string, filter: EndpointFilter, saved: string[], sort: string): Endpoint[] {
  const q = query.trim().toLowerCase();
  return entries
    .filter((e) => (filter === "healthy" ? e.healthy : filter === "unhealthy" ? !e.healthy : filter === "saved" ? saved.includes(e.url) : true))
    .filter((e) => !q || `${e.url} ${e.client ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => (sort === "latency" ? (a.latency_ms ?? 1e9) - (b.latency_ms ?? 1e9) : a.priority - b.priority));
}
/** One-line roll-up of the whole directory for the page header. */
export function endpointSummary(entries: Endpoint[]): { total: number; healthy: number; unhealthy: number; median: number | null } {
  const healthy = entries.filter((e) => e.healthy);
  const unhealthy = entries.length - healthy.length;
  const latencies = healthy.map((e) => e.latency_ms).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const median = latencies.length ? latencies[Math.floor(latencies.length / 2)] : null;
  return { total: entries.length, healthy: healthy.length, unhealthy, median };
}
/** Append one probe observation, keeping the ring buffer bounded. */
export const appendObservation = (previous: ProbeObservation[], next: ProbeObservation, cap = 64): ProbeObservation[] =>
  [...previous, next].slice(-cap);
/** Parse `#/rpc?url=…&method=…` deep links for the RPC console. */
export function rpcConsoleRequest(hash: string): { url: string; method: string | undefined } | null {
  const q = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  const params = new URLSearchParams(q);
  const url = params.get("url");
  if (!url) return null;
  return { url, method: params.get("method") ?? undefined };
}
