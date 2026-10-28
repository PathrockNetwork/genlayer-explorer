import type { Deps } from "./routes";

/** One SQL snapshot and one time window keep cards and hourly totals comparable. */
export async function nativeOverviewActivity(
  pool: Pick<Deps["pool"], "query">,
  since: Date,
  until: Date,
) {
  const {
    rows: [row],
  } = await pool.query(
    `
 WITH active AS MATERIALIZED (
  SELECT recipient,sender,created_at,status,confirmation,execution_result FROM gen_transactions WHERE confirmation<>'orphaned'
 ), recent AS MATERIALIZED (
  SELECT * FROM active WHERE created_at >= $1 AND created_at <= $2
 ), hourly AS (
  SELECT date_trunc('hour',created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' t,
   count(*)::int txs,count(*) FILTER(WHERE execution_result='returned')::int returned,
   count(*) FILTER(WHERE execution_result IN ('error','timeout','disagreement','violation'))::int failed,
   count(*) FILTER(WHERE execution_result='unknown')::int unknown
  FROM recent GROUP BY 1
 ) SELECT
  (SELECT count(*)::int FROM active) total,
  (SELECT count(*)::int FROM active WHERE status NOT IN ('Finalized','Canceled','Unknown')) in_consensus,
  (SELECT count(*)::int FROM active WHERE status='Unknown') unresolved,
  (SELECT count(*)::int FROM active WHERE confirmation='provisional') provisional,
  (SELECT count(*)::int FROM recent) calls_24h,
  (SELECT count(DISTINCT recipient)::int FROM recent) active_24h,
  (SELECT count(DISTINCT sender)::int FROM recent) callers_24h,
  (SELECT count(*)::int FROM recent WHERE execution_result='returned') returned_24h,
  (SELECT count(*)::int FROM recent WHERE execution_result IN ('error','timeout','disagreement','violation')) failed_24h,
  (SELECT count(*)::int FROM recent WHERE execution_result='unknown') unknown_24h,
  (SELECT coalesce(jsonb_agg(hourly ORDER BY t),'[]'::jsonb) FROM hourly) points`,
    [since, until],
  );
  return row;
}
