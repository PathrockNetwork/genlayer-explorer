import type { Deps } from "./routes";

const HOUR = 3_600_000, DAY = 24 * HOUR;
type ContractKind = { address: string; kind: string };
type Bucket = { address: string; bucket: string | number; calls: number; current_calls: number };
export type ContractActivity = {
  since: string;
  until: string;
  previous_calls: number;
  points: { t: string; calls: number }[];
};

/** Fetch trends for just the visible page, using the directory's finalized-call scope. */
export async function loadContractActivity(pool: Deps["pool"], contracts: ContractKind[], until: Date) {
  const since = new Date(until.getTime() - DAY), previousSince = new Date(since.getTime() - DAY);
  const first = Math.floor(since.getTime() / HOUR) * HOUR;
  const last = Math.floor(until.getTime() / HOUR) * HOUR;
  const result = new Map<string, ContractActivity>(contracts.map(c => [c.address, {
    since: since.toISOString(), until: until.toISOString(), previous_calls: 0,
    points: Array.from({ length: (last - first) / HOUR + 1 }, (_, i) => ({ t: new Date(first + i * HOUR).toISOString(), calls: 0 })),
  }]));
  const sources = [
    { kind: "intelligent", table: "gen_transactions", address: "recipient", time: "created_at", condition: "AND confirmation='confirmed'" },
    { kind: "evm", table: "transactions", address: '"to"', time: "time", condition: "" },
  ];
  await Promise.all(sources.map(async source => {
    const addresses = contracts.filter(c => c.kind === source.kind).map(c => c.address);
    if (!addresses.length) return;
    const { rows } = await pool.query<Bucket>(
      `SELECT ${source.address} AS address,
        (floor(extract(epoch FROM ${source.time})/3600)*3600000)::bigint AS bucket,
        count(*)::int AS calls, count(*) FILTER (WHERE ${source.time}>=$3)::int AS current_calls
       FROM ${source.table} WHERE ${source.address}=ANY($1::text[])
        AND ${source.time}>=$2 AND ${source.time}<=$4 ${source.condition}
       GROUP BY ${source.address},bucket`,
      [addresses, previousSince, since, until],
    );
    for (const row of rows) {
      const activity = result.get(row.address);
      if (!activity) continue;
      activity.previous_calls += Number(row.calls) - Number(row.current_calls);
      const index = (Number(row.bucket) - first) / HOUR;
      if (Number.isInteger(index) && activity.points[index]) activity.points[index].calls = Number(row.current_calls);
    }
  }));
  return result;
}
