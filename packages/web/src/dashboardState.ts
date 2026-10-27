import type { Network, SystemState } from "./api";

/** Indexer liveness, head lag and history completeness are independent facts. */
export function dashboardState(net: Network | null, error: string | null, now = Date.now()): SystemState {
  if (error) return "dberror";
  if (!net) return "loading";
  if (net.indexer_updated_at && now - Date.parse(net.indexer_updated_at) > 60_000) return "stopped";
  if (net.indexed_head === null || net.blocks_indexed === 0) return "empty";
  if ((net.lag_blocks ?? 0) > 0 || (net.backfill_remaining ?? 0) > 0) return "backfill";
  return "normal";
}
