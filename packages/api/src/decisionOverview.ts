import type { FastifyInstance } from "fastify";
import type { Deps } from "./routes";

const integer = (value: unknown) => value !== null && value !== undefined && /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const stamp = (value: unknown) => { const n = integer(value); return n && n <= 8_640_000_000_000 ? new Date(n * 1000).toISOString() : null; };

/** Latest recorded round and receipt timing, never a predicted round limit or finality duration. */
export function decisionProgress(evidence: any) {
  if (!evidence) return null;
  const round = evidence.round, validators = Array.isArray(round?.validators) ? round.validators : null;
  const assigned = validators?.length ?? (Array.isArray(round?.roundValidators) ? round.roundValidators.length : null);
  const revealed = integer(round?.votesRevealed);
  const votes = revealed != null && assigned != null && revealed <= assigned ? revealed : null;
  const timestamps = Object.fromEntries(["Created", "Activated", "Proposed", "Committed", "LastVote", "AppealSubmitted"].map(key => [key, stamp(evidence.timestamps?.[key])]));
  const start = timestamps.Created, end = timestamps.LastVote;
  return {
    round: integer(round?.round), assigned, revealed: votes,
    timestamps,
    last_vote_seconds: start && end && end >= start ? (Date.parse(end) - Date.parse(start)) / 1000 : null,
  };
}
export const decisionEvidenceSql = `jsonb_build_object('round',t.receipt->'roundData'->-1,'timestamps',t.receipt->'timestamps')`;
export function decisionRow(r: any) {
  const { evidence, ...rest } = r;
  return { ...rest, block_number: Number(r.block_number), progress: decisionProgress(evidence) };
}

export function registerDecisionOverview(app: FastifyInstance, { pool }: Deps) {
  app.get<{ Querystring: { days?: string } }>("/api/v1/genlayer/decisions/overview", async req => {
    const days = req.query.days ?? "1";
    if (!["1", "7", "30"].includes(days)) throw Object.assign(new Error("Choose a 1, 7 or 30 day window"), { statusCode: 400 });
    const until = new Date(), since = new Date(until.getTime() - Number(days) * 86_400_000);
    const bucket = days === "1" ? "hour" : "day", step = days === "1" ? 3_600_000 : 86_400_000;
    const where = `t.confirmation<>'orphaned' AND t.created_at >= $1 AND t.created_at <= $2`;
    const [groups, votes, contracts, featured] = await Promise.all([
      pool.query(`SELECT status,execution_result,count(*)::int count FROM gen_transactions t WHERE ${where} GROUP BY status,execution_result`, [since, until]),
      pool.query(`SELECT date_trunc('${bucket}',t.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' time,
        count(*)::int assigned,count(*) FILTER(WHERE v.vote>0)::int voted
        FROM gen_validator_votes v JOIN gen_transactions t ON t.id=v.tx_id
        WHERE v.active AND t.confirmation='confirmed' AND t.created_at >= $1 AND t.created_at <= $2 GROUP BY 1 ORDER BY 1`, [since, until]),
      pool.query(`SELECT t.recipient address,c.name,count(*)::int calls FROM gen_transactions t LEFT JOIN gen_contracts c ON c.address=t.recipient WHERE ${where} GROUP BY t.recipient,c.name ORDER BY calls DESC,t.recipient LIMIT 1000`, [since, until]),
      pool.query(`SELECT t.id,t.recipient,t.submission_hash,t.block_number,t.sender,t.created_at,t.observed_at,t.status,t.kind,t.method,t.checked_at,t.execution_result,t.confirmation,c.name contract_name,jsonb_array_length(t.receipt->'roundData') rounds,${decisionEvidenceSql} evidence
        FROM gen_transactions t LEFT JOIN gen_contracts c ON c.address=t.recipient WHERE ${where}
        ORDER BY (t.status IN ('Pending','Proposing','Committing','Revealing','Accepted','AppealCommitting','AppealRevealing','LeaderRevealing')) DESC,t.block_number DESC,t.id LIMIT 1`, [since, until]),
    ]);
    const statuses = new Map<string, number>(), outcomes = new Map<string, number>();
    for (const row of groups.rows) {
      statuses.set(row.status, (statuses.get(row.status) ?? 0) + row.count);
      const outcome = row.execution_result ?? "unknown";
      outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + row.count);
    }
    const byTime = new Map(votes.rows.map(r => [new Date(r.time).getTime(), r]));
    const points = [];
    for (let time = Math.floor(since.getTime() / step) * step; time <= until.getTime(); time += step) {
      const p = byTime.get(time);
      points.push({ time: new Date(time).toISOString(), assigned: p?.assigned ?? 0, voted: p?.voted ?? 0 });
    }
    return {
      since: since.toISOString(), until: until.toISOString(), days: Number(days),
      total: [...statuses.values()].reduce((sum, count) => sum + count, 0),
      statuses: [...statuses].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
      outcomes: [...outcomes].map(([outcome, count]) => ({ outcome, count })),
      participation: { bucket_secs: step / 1000, points },
      contracts: contracts.rows, featured: featured.rows[0] ? decisionRow(featured.rows[0]) : null,
    };
  });
}
