import type { FastifyInstance } from "fastify";
import type { Deps } from "./routes";

const HEX = /^0x[0-9a-fA-F]{40}$/;

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

/**
 * Validator console bundle: everything a validator needs to see about their
 * own validator — role (validator/owner/operator), cached stake snapshot,
 * identity, and recent consensus activity. Looked up across all three
 * address columns so an owner or operator key finds their validator too.
 */
export function registerStakingConsoleRoute(app: FastifyInstance, { pool }: Deps) {
  app.get("/api/v1/staking/console/:address", async (req, reply) => {
    const addr = String((req.params as any).address).toLowerCase();
    if (!HEX.test(addr)) return reply.code(400).send({ error: "invalid address" });

    const { rows: validators } = await pool.query(
      `SELECT *, (self_stake + delegated_stake) AS total_stake
       FROM gen_staking_validators
       WHERE address = $1 OR operator_address = $1 OR owner_address = $1`,
      [addr],
    );
    if (!validators.length) {
      return { is_validator: false, address: addr,
        hint: "No validator found for this address (checked validator, owner and operator keys)." };
    }
    const v = validators[0];
    const role = v.address === addr ? "validator" : v.operator_address === addr ? "operator" : "owner";

    const [identity, votes, delegators] = await Promise.all([
      pool.query(`SELECT moniker, checked_at
                  FROM gen_validator_identities WHERE address = $1`, [v.address]),
      pool.query(
        `SELECT count(*)::int AS votes_30d,
                count(*) FILTER (WHERE vote = 0)::int as yes,
                count(*) FILTER (WHERE vote = 1)::int as no,
                count(*) FILTER (WHERE vote = 2)::int as abstain,
                count(*) FILTER (WHERE vote = 3)::int as not_voted,
                count(DISTINCT v.round)::int AS rounds
         FROM gen_validator_votes v
         JOIN gen_transactions t ON t.id = v.tx_id
         WHERE v.address = $1 AND t.created_at >= now() - interval '30 days'`,
        [v.address],
      ),
      pool.query(`SELECT address, count(*)::int AS votes FROM gen_validator_votes WHERE address = $1 GROUP BY address`, [v.address]),
    ]);

    return {
      is_validator: true,
      address: addr,
      role,
      validator: {
        address: v.address, status: v.status, is_active: v.is_active,
        self_stake: v.self_stake, delegated_stake: v.delegated_stake,
        total_stake: v.total_stake, total_shares: v.total_shares, apy: v.apy,
        operator_address: v.operator_address, owner_address: v.owner_address,
        pending_deposits: v.pending_deposits, pending_withdrawals: v.pending_withdrawals,
        banned_until_epoch: v.banned_until_epoch, live: v.live,
        transaction_count: v.transaction_count, fetched_at: v.fetched_at,
      },
      identity: identity.rows[0] ?? null,
      activity_30d: votes.rows[0] ?? null,
      votes_total: delegators.rows[0]?.votes ?? 0,
    };
  });
}
