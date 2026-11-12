import type { FastifyInstance } from "fastify";
import type { Deps } from "./routes";

/**
 * Staking directory, served from the indexer's cached mirror of the official
 * bradbury scan (indexer/src/staking.ts). Read-only; no third-party call per
 * pageview.
 */
export function registerStakingRoutes(app: FastifyInstance, { pool }: Deps) {
  app.get("/api/v1/staking/validators", async () => {
    const { rows } = await pool.query(
      `SELECT address,status,is_active,self_stake,delegated_stake,total_shares,apy,validator_weight,
              banned_until_epoch,operator_address,owner_address,metadata,pending_deposits,pending_withdrawals,
              total_votes_7d,minority_votes_7d,rotation_pct_7d,idle_pct_7d,successful_appeals_7d,
              transaction_count,live,fetched_at,
              (self_stake + delegated_stake) AS total_stake
       FROM gen_staking_validators
       ORDER BY (self_stake + delegated_stake) DESC, address ASC`,
    );
    const active = rows.filter((r: any) => r.is_active);
    const totals = rows.reduce(
      (acc: any, r: any) => {
        acc.self_stake += BigInt(r.self_stake ?? "0");
        acc.delegated_stake += BigInt(r.delegated_stake ?? "0");
        return acc;
      },
      { self_stake: 0n, delegated_stake: 0n },
    );
    const apys = rows.map((r: any) => (r.apy === null ? null : Number(r.apy))).filter((v: any): v is number => v !== null).sort((a: number, b: number) => a - b);
    const medianApy = apys.length ? apys[Math.floor(apys.length / 2)] : null;
    return {
      validators: rows,
      summary: {
        total: rows.length,
        active: active.length,
        self_stake: totals.self_stake.toString(),
        delegated_stake: totals.delegated_stake.toString(),
        median_apy: medianApy,
        min_apy: apys[0] ?? null,
        max_apy: apys[apys.length - 1] ?? null,
        fetched_at: rows[0]?.fetched_at ?? null,
      },
    };
  });
}
