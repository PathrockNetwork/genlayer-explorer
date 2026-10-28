import type { FastifyInstance } from "fastify";
import {
  HEX_ADDRESS,
  HEX_HASH,
  normalizeReceipt,
  explainExecution,
} from "@genlayer-explorer/core";
import type { Deps } from "./routes";
const fail = (s: string): never => {
  throw Object.assign(new Error(s), { statusCode: 400 });
};
const address = (s: string) =>
  HEX_ADDRESS.test(s)
    ? s.toLowerCase()
    : fail("Invalid contract or validator address");
const daysOf = (s?: string) =>
  ["1", "7", "30"].includes(s ?? "7")
    ? Number(s ?? 7)
    : fail("Choose a 1, 7 or 30 day window");
const offsetOf = (s?: string) =>
  s === undefined
    ? 0
    : /^\d+$/.test(s) && Number(s) <= 1000000
      ? Number(s)
      : fail("Invalid page offset");
const failed = `execution_result IN ('error','timeout','disagreement','violation')`;
const fee = (key: string) =>
  `CASE WHEN receipt#>>'{fees,consumed,${key}}' ~ '^[0-9]+$' THEN (receipt#>>'{fees,consumed,${key}}')::numeric END`;
const executionFee = fee("executionConsumed"),
  storageFee = fee("storageFeeUsed"),
  messageFee = fee("messageFeesConsumed");
const duration = `CASE WHEN (receipt#>>'{timestamps,LastVote}')::numeric>=(receipt#>>'{timestamps,Created}')::numeric AND (receipt#>>'{timestamps,Created}')::numeric>0 THEN (receipt#>>'{timestamps,LastVote}')::numeric-(receipt#>>'{timestamps,Created}')::numeric END`;
const stats = `count(*)::int transactions,count(DISTINCT sender)::int callers,count(*) FILTER(WHERE execution_result='returned')::int returned,count(*) FILTER(WHERE ${failed})::int failed,count(*) FILTER(WHERE execution_result='unknown')::int unknown,count(*) FILTER(WHERE execution_result='error')::int errors,count(*) FILTER(WHERE execution_result='timeout')::int timeouts,count(*) FILTER(WHERE execution_result='disagreement')::int disagreements,count(*) FILTER(WHERE execution_result='violation')::int violations,count(*) FILTER(WHERE status='Canceled')::int canceled,count(*) FILTER(WHERE jsonb_array_length(receipt->'roundData')>1)::int multiple_rounds,sum(${executionFee})::text execution_cost,sum(${storageFee})::text storage_cost,sum(${messageFee})::text message_cost,count(${executionFee})::int fee_samples,percentile_disc(0.5) WITHIN GROUP(ORDER BY ${executionFee})::text median_execution_cost,percentile_cont(0.5) WITHIN GROUP(ORDER BY ${duration}) p50_vote_seconds,percentile_cont(0.95) WITHIN GROUP(ORDER BY ${duration}) p95_vote_seconds,count(${duration})::int timing_samples`;
export function registerObservatoryRoutes(
  app: FastifyInstance,
  { pool, rpc }: Deps,
) {
  app.get<{ Params: { address: string }; Querystring: { days?: string } }>(
    "/api/v1/contracts/:address/analytics",
    async (req) => {
      const addr = address(req.params.address),
        days = daysOf(req.query.days),
        until = new Date(),
        since = new Date(until.getTime() - days * 86400000);
      const where = `FROM gen_transactions WHERE recipient=$1 AND confirmation='confirmed' AND created_at >= $2 AND created_at <= $3`;
      const args = [addr, since, until];
      const bucket = days === 1 ? "hour" : "day";
      const [summary, series, methods, coverage] = await Promise.all([
        pool.query(`SELECT ${stats} ${where}`, args),
        pool.query(
          `SELECT date_trunc('${bucket}',created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' time,count(*)::int transactions,count(*) FILTER(WHERE ${failed})::int failed,count(DISTINCT sender)::int callers,sum(${executionFee})::text execution_cost ${where} GROUP BY 1 ORDER BY 1`,
          args,
        ),
        pool.query(
          `SELECT coalesce(method,'Unknown method') method,${stats} ${where} GROUP BY method ORDER BY transactions DESC,method LIMIT 50`,
          args,
        ),
        pool.query(
          `SELECT min(created_at) earliest,max(created_at) latest,count(*) FILTER(WHERE created_at IS NULL)::int undated,count(*) FILTER(WHERE confirmation='provisional')::int provisional FROM gen_transactions WHERE recipient=$1 AND confirmation<>'orphaned'`,
          [addr],
        ),
      ]);
      const step = days === 1 ? 3600000 : 86400000,
        start = Math.floor(since.getTime() / step) * step,
        byTime = new Map(
          series.rows.map((x) => [new Date(x.time).getTime(), x]),
        );
      const timeline = [];
      for (let at = start; at <= until.getTime(); at += step)
        timeline.push(
          byTime.get(at) ?? {
            time: new Date(at),
            transactions: 0,
            failed: 0,
            callers: 0,
            execution_cost: null,
          },
        );
      return {
        days,
        since,
        until,
        summary: summary.rows[0],
        series: timeline,
        methods: methods.rows,
        coverage: coverage.rows[0],
        scope:
          "Confirmed submission history. Execution outcomes and consensus status are separate. Timing measures creation to the last recorded vote, not finality. Fee fields are consumed protocol fees in wei; deposits are budgets.",
      };
    },
  );
  app.get<{ Params: { address: string } }>(
    "/api/v1/contracts/:address/profile",
    async (req) => {
      const addr = address(req.params.address);
      const {
        rows: [c],
      } = await pool.query(
        "SELECT address,name,profile,source_hash,profile_checked_at,creator FROM gen_contracts WHERE address=$1",
        [addr],
      );
      const [versions, related] = await Promise.all([
        pool.query(
          `SELECT sha256,first_observed_at,last_observed_at,observed_block,octet_length(source)::int bytes,profile->>'name' name FROM gen_contract_sources WHERE address=$1 ORDER BY first_observed_at DESC LIMIT 50`,
          [addr],
        ),
        pool.query(
          `SELECT address,name,source_hash,deployed_at,CASE WHEN source_hash=$2 AND $2 IS NOT NULL THEN 'Identical observed source' ELSE 'Same indexed creator' END relation FROM gen_contracts WHERE address<>$1 AND (($2::text IS NOT NULL AND source_hash=$2) OR ($3::text IS NOT NULL AND creator=$3)) ORDER BY (source_hash=$2) DESC NULLS LAST,deployed_at DESC NULLS LAST LIMIT 12`,
          [addr, c?.source_hash ?? null, c?.creator ?? null],
        ),
      ]);
      return {
        contract: c ?? null,
        versions: versions.rows,
        related: related.rows,
        note: "Names, descriptions and capabilities are extracted from source, not verified project identities or security assessments. Versions record when this explorer observed finalized source; they are not a complete historical upgrade log.",
      };
    },
  );
  app.get<{ Params: { address: string; hash: string } }>(
    "/api/v1/contracts/:address/sources/:hash",
    async (req, reply) => {
      const addr = address(req.params.address),
        hash = req.params.hash;
      if (!/^[a-f0-9]{64}$/.test(hash)) fail("Invalid source hash");
      const {
        rows: [s],
      } = await pool.query(
        "SELECT sha256,source,first_observed_at,last_observed_at FROM gen_contract_sources WHERE address=$1 AND sha256=$2",
        [addr, hash],
      );
      return s ?? reply.code(404).send({ error: "Source snapshot not found" });
    },
  );
  app.get("/api/v1/genlayer/attention", async () => {
    const { rows } = await pool.query(
      `SELECT t.recipient address,c.name,count(*) FILTER(WHERE ${failed})::int failed,count(*) FILTER(WHERE t.status NOT IN ('Finalized','Canceled','Unknown') AND t.created_at<now()-interval '15 minutes')::int waiting,count(*)::int transactions FROM gen_transactions t LEFT JOIN gen_contracts c ON c.address=t.recipient WHERE t.confirmation<>'orphaned' AND t.created_at>=now()-interval '24 hours' GROUP BY t.recipient,c.name HAVING count(*) FILTER(WHERE ${failed})>0 OR count(*) FILTER(WHERE t.status NOT IN ('Finalized','Canceled','Unknown') AND t.created_at<now()-interval '15 minutes')>0 ORDER BY failed DESC,waiting DESC,t.recipient LIMIT 8`,
    );
    return { contracts: rows, window_hours: 24, waiting_threshold_minutes: 15 };
  });
  app.get<{ Params: { id: string } }>(
    "/api/v1/genlayer/transactions/:id/explanation",
    async (req, reply) => {
      const id = req.params.id;
      if (!HEX_HASH.test(id)) fail("Invalid consensus ID");
      const [stored, lifecycle, observations] = await Promise.all([
        pool.query(
          "SELECT receipt,confirmation,checked_at FROM gen_transactions WHERE id=$1",
          [id.toLowerCase()],
        ),
        rpc
          .call<any>("gen_getTransactionLifecycle", [{ txId: id }])
          .then((data) => ({ available: true, data }))
          .catch(() => ({ available: false, data: null })),
        pool.query(
          "SELECT status,execution_result,observed_at FROM gen_receipt_observations WHERE tx_id=$1 ORDER BY observed_at DESC,id DESC LIMIT 30",
          [id.toLowerCase()],
        ),
      ]);
      let receipt = stored.rows[0]?.receipt;
      if (!receipt)
        receipt = normalizeReceipt(
          await rpc.call("gen_getTransactionReceipt", [{ txId: id }]),
        );
      if (!receipt)
        return reply
          .code(404)
          .send({ error: "Consensus transaction not found" });
      return {
        ...explainExecution(receipt),
        confirmation: stored.rows[0]?.confirmation ?? "unindexed",
        lifecycle,
        observations: observations.rows.reverse(),
        receipt_observed_at: stored.rows[0]?.checked_at ?? null,
        note: "The explanation classifies recorded protocol outcomes. Missing traces cannot establish the underlying application error. Observation times describe when this explorer saw a change.",
      };
    },
  );
  const voteStats = `count(*)::int assignments,count(DISTINCT v.tx_id)::int transactions,count(*) FILTER(WHERE v.leader)::int leaderships,count(*) FILTER(WHERE v.vote BETWEEN 1 AND 5)::int recorded_votes,count(*) FILTER(WHERE v.vote=0)::int not_voted,count(*) FILTER(WHERE v.vote IS NULL)::int unavailable,count(*) FILTER(WHERE v.vote=1)::int returned,count(*) FILTER(WHERE v.vote=2)::int errors,count(*) FILTER(WHERE v.vote=3)::int timeouts,count(*) FILTER(WHERE v.vote=4)::int disagreements,count(*) FILTER(WHERE v.vote=5)::int violations`;
  const voteFrom = `FROM gen_validator_votes v JOIN gen_transactions t ON t.id=v.tx_id WHERE v.active AND t.confirmation='confirmed' AND t.created_at >= $1`;
  async function coverage() {
    const {
      rows: [x],
    } = await pool.query(
      "SELECT count(*) FILTER(WHERE receipt IS NOT NULL)::int receipts,count(*) FILTER(WHERE analysis_version=1)::int analyzed,min(created_at) earliest FROM gen_transactions WHERE confirmation='confirmed'",
    );
    return x;
  }
  app.get<{ Querystring: { days?: string; q?: string; offset?: string } }>(
    "/api/v1/genlayer/validators",
    async (req) => {
      const days = daysOf(req.query.days),
        q = (req.query.q ?? "").trim().toLowerCase(),
        offset = offsetOf(req.query.offset);
      if (q && !/^0x[a-f0-9]{0,40}$/.test(q))
        fail("Search validators by address");
      const since = new Date(Date.now() - days * 86400000),
        where = voteFrom + ` AND ($2='' OR v.address LIKE $2||'%')`;
      const [list, count, cov] = await Promise.all([
        pool.query(
          `SELECT v.address,${voteStats},max(t.created_at) last_activity ${where} GROUP BY v.address ORDER BY assignments DESC,v.address LIMIT 25 OFFSET $3`,
          [since, q, offset],
        ),
        pool.query(`SELECT count(DISTINCT v.address)::int total ${where}`, [
          since,
          q,
        ]),
        coverage(),
      ]);
      return {
        validators: list.rows,
        total: count.rows[0].total,
        days,
        coverage: cov,
        note: "Observed round assignments from indexed receipts. Recorded execution votes are not accuracy scores, agreement rates, or validator uptime.",
      };
    },
  );
  app.get<{
    Params: { address: string };
    Querystring: { days?: string; offset?: string };
  }>("/api/v1/genlayer/validators/:address", async (req) => {
    const addr = address(req.params.address),
      days = daysOf(req.query.days),
      offset = offsetOf(req.query.offset),
      since = new Date(Date.now() - days * 86400000);
    const args = [since, addr],
      where = voteFrom + " AND v.address=$2";
    const [summary, series, rows, cov] = await Promise.all([
      pool.query(`SELECT ${voteStats} ${where}`, args),
      pool.query(
        `SELECT date_trunc('day',t.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' time,count(*)::int assignments,count(*) FILTER(WHERE v.vote BETWEEN 1 AND 5)::int recorded_votes ${where} GROUP BY 1 ORDER BY 1`,
        args,
      ),
      pool.query(
        `SELECT v.tx_id,v.round,v.position,v.leader,v.vote,v.result_hash,v.consensus_result,t.recipient,t.method,t.created_at,t.status ${where} ORDER BY t.created_at DESC,v.tx_id,v.round,v.position LIMIT 25 OFFSET $3`,
        [...args, offset],
      ),
      coverage(),
    ]);
    return {
      address: addr,
      days,
      summary: summary.rows[0],
      series: series.rows,
      history: rows.rows,
      coverage: cov,
    };
  });
}
