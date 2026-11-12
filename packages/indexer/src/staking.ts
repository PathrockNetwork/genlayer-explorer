import { sleep, type Ctx } from "./context";

/**
 * Mirror the official bradbury scan's staking directory into Postgres so the
 * API serves validator stake/ delegations without a per-pageview call to a
 * third-party service. Delegated proof-of-stake: validators hold self stake,
 * anyone can delegate GEN (share-based accounting, epoch-processed).
 */
const SCAN_URL =
  process.env.STAKING_SCAN_URL ?? "https://scan.bradbury.genlayer.com/api/v1/validators?page_size=100";
const POLL_MS = Number(process.env.STAKING_POLL_MS ?? 15 * 60_000);

type ScanValidator = {
  validator_address: string;
  status?: string;
  is_active?: boolean;
  self_stake?: string;
  delegated_stake?: string;
  total_shares?: string;
  apy?: number | string | null;
  validator_weight?: string | null;
  banned_until_epoch?: number | null;
  operator_address?: string | null;
  owner_address?: string | null;
  metadata?: unknown;
  pending_deposits?: unknown;
  pending_withdrawals?: unknown;
  total_votes_7d?: number | null;
  minority_votes_7d?: number | null;
  rotation_pct_7d?: string | number | null;
  idle_pct_7d?: string | number | null;
  successful_appeals_7d?: number | null;
  transaction_count?: number | null;
  live?: boolean;
};

const num = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : /^\-?\d+(\.\d+)?$/.test(String(v)) ? String(v) : null;
const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null;

export async function stakingTick(ctx: Ctx): Promise<number> {
  const res = await fetch(SCAN_URL, { signal: AbortSignal.timeout(15_000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`staking scan HTTP ${res.status}`);
  const body = (await res.json()) as { validators?: ScanValidator[] };
  const validators = body.validators ?? [];
  let written = 0;
  for (const v of validators) {
    const addr = String(v.validator_address ?? "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(addr)) continue;
    await ctx.pool.query(
      `INSERT INTO gen_staking_validators
        (address,status,is_active,self_stake,delegated_stake,total_shares,apy,validator_weight,banned_until_epoch,
         operator_address,owner_address,metadata,pending_deposits,pending_withdrawals,total_votes_7d,minority_votes_7d,
         rotation_pct_7d,idle_pct_7d,successful_appeals_7d,transaction_count,live,fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now())
       ON CONFLICT (address) DO UPDATE SET
         status=EXCLUDED.status,is_active=EXCLUDED.is_active,self_stake=EXCLUDED.self_stake,
         delegated_stake=EXCLUDED.delegated_stake,total_shares=EXCLUDED.total_shares,apy=EXCLUDED.apy,
         validator_weight=EXCLUDED.validator_weight,banned_until_epoch=EXCLUDED.banned_until_epoch,
         operator_address=EXCLUDED.operator_address,owner_address=EXCLUDED.owner_address,metadata=EXCLUDED.metadata,
         pending_deposits=EXCLUDED.pending_deposits,pending_withdrawals=EXCLUDED.pending_withdrawals,
         total_votes_7d=EXCLUDED.total_votes_7d,minority_votes_7d=EXCLUDED.minority_votes_7d,
         rotation_pct_7d=EXCLUDED.rotation_pct_7d,idle_pct_7d=EXCLUDED.idle_pct_7d,
         successful_appeals_7d=EXCLUDED.successful_appeals_7d,transaction_count=EXCLUDED.transaction_count,
         live=EXCLUDED.live,fetched_at=now()`,
      [
        addr,
        String(v.status ?? "unknown"),
        Boolean(v.is_active),
        num(v.self_stake) ?? "0",
        num(v.delegated_stake) ?? "0",
        num(v.total_shares) ?? "0",
        num(v.apy),
        num(v.validator_weight),
        int(v.banned_until_epoch),
        v.operator_address ? String(v.operator_address).toLowerCase() : null,
        v.owner_address ? String(v.owner_address).toLowerCase() : null,
        v.metadata ? JSON.stringify(v.metadata) : null,
        v.pending_deposits ? JSON.stringify(v.pending_deposits) : "[]",
        v.pending_withdrawals ? JSON.stringify(v.pending_withdrawals) : "[]",
        int(v.total_votes_7d),
        int(v.minority_votes_7d),
        num(v.rotation_pct_7d),
        num(v.idle_pct_7d),
        int(v.successful_appeals_7d),
        int(v.transaction_count),
        Boolean(v.live),
      ],
    );
    written++;
  }
  return written;
}

export async function stakingLoop(ctx: Ctx): Promise<void> {
  while (!ctx.stopping()) {
    try {
      const n = await stakingTick(ctx);
      ctx.log("staking snapshot", { validators: n });
    } catch (err) {
      ctx.log("staking poll error", { err: (err as Error).message });
    }
    await sleep(POLL_MS);
  }
}
