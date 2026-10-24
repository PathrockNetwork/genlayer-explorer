import { type Block, type Tx } from "./api";

/** "High gas" in the ledger: blocks using more than this share of their gas limit. */
export const HIGH_GAS_SHARE = 0.25;

/** Gas used as a fraction of the block's gas limit, or null when the limit is unknown. */
export const gasShare = (b: Pick<Block, "gas_used" | "gas_limit">) => (b.gas_limit > 0 ? b.gas_used / b.gas_limit : null);

export type BlockVolume = "all" | "transactions" | "highgas" | "empty";

export function filterBlocks(blocks: Block[], query: string, volume: BlockVolume, ascending: boolean) {
  const q = query.trim().toLowerCase().replace(/,/g, "");
  return blocks
    .filter((b) =>
      (!q || [String(b.number), b.hash, b.miner].some((v) => v?.toLowerCase().includes(q))) &&
      (volume !== "transactions" || b.tx_count > 0) &&
      (volume !== "empty" || b.tx_count === 0) &&
      (volume !== "highgas" || (gasShare(b) ?? 0) > HIGH_GAS_SHARE))
    .slice()
    .sort((a, b) => (ascending ? a.number - b.number : b.number - a.number));
}

/** Sums of wei strings across a block's transactions (fees paid, value moved). */
export function sumWei(txs: Tx[], field: "fee" | "value"): string {
  let total = 0n;
  for (const tx of txs) if (/^\d+$/.test(tx[field])) total += BigInt(tx[field]);
  return total.toString();
}

/**
 * Archive-RPC blocks may omit optional fields entirely; normalise so the UI
 * only ever sees null for "unknown".
 */
export function normalizeBlock(b: Block): Block {
  return { ...b, size: b.size ?? null, base_fee_per_gas: b.base_fee_per_gas ?? null };
}

/** "4.08×", or an em dash for anything non-finite. */
export const speedup = (v: number | null | undefined, digits = 2) => (v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(digits)}×`);
