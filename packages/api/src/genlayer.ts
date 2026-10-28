import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import {
  GENLAYER_DEPLOYMENT,
  HEX_ADDRESS,
  HEX_HASH,
  hex,
  getNativeCode,
  notFound,
  normalizeReceipt,
  encodeRead,
  decodeCalldata,
  typedReadArgs,
  typedValue,
  RpcError,
} from "@genlayer-explorer/core";
import { registerObservatoryRoutes } from "./observatory";
import { nativeOverviewActivity } from "./nativeOverview";
import type { Deps } from "./routes";

const fail = (message: string, statusCode = 400): never => {
  throw Object.assign(new Error(message), { statusCode });
};
const addressOf = (x: string) =>
  HEX_ADDRESS.test(x)
    ? x.toLowerCase()
    : fail("Enter a valid 0x contract address");
const idOf = (x: string) =>
  HEX_HASH.test(x)
    ? x.toLowerCase()
    : fail("Enter a valid consensus transaction ID");
const numberOf = (x: any, fallback: number, max: number) =>
  x === undefined
    ? fallback
    : /^\d+$/.test(String(x)) &&
        Number.isSafeInteger(Number(x)) &&
        Number(x) <= max
      ? Number(x)
      : fail("Invalid pagination or block range");
const row = (x: any) =>
  x && {
    ...x,
    first_seen_block: Number(x.first_seen_block),
    deployment_block:
      x.deployment_block == null ? null : Number(x.deployment_block),
    calls_24h: Number(x.calls_24h ?? 0),
    callers_24h: Number(x.callers_24h ?? 0),
    block_number: x.block_number == null ? undefined : Number(x.block_number),
  };

/** Bounded, single-flight cache for expensive GenVM schema discovery. No failures cached. */
export function boundedMemo<T>(max: number, ttl: number) {
  const cache = new Map<string, { at: number; value: Promise<T> }>();
  return (key: string, load: () => Promise<T>) => {
    const existing = cache.get(key);
    if (existing && Date.now() - existing.at < ttl) return existing.value;
    if (cache.size >= max) cache.delete(cache.keys().next().value!);
    const value = load().catch((e) => {
      if (cache.get(key)?.value === value) cache.delete(key);
      throw e;
    });
    cache.set(key, { at: Date.now(), value });
    return value;
  };
}
export function registerGenLayerRoutes(
  app: FastifyInstance,
  { pool, rpc }: Deps,
) {
  const codeMemo = boundedMemo<Awaited<ReturnType<typeof getNativeCode>>>(
    24,
    60_000,
  );
  const schemaMemo = boundedMemo<any>(24, 300_000);
  const code = (address: string, state: "decided" | "finalized" = "decided") =>
    codeMemo(address + state, () => getNativeCode(rpc, address, state));
  const schema = async (address: string) => {
    const c = await code(address);
    return schemaMemo(
      createHash("sha256").update(c.encoded).digest("hex"),
      () => rpc.call("gen_getContractSchema", [{ code: c.encoded }]),
    );
  };
  registerObservatoryRoutes(app, { pool, rpc });
  let runningReads = 0;
  app.get("/api/v1/genlayer/overview", async () => {
    const until = new Date(),
      since = new Date(until.getTime() - 86400000);
    const [contracts, activity, statuses, top, sync, vm] = await Promise.all([
      pool.query(
        `SELECT count(*)::int total,count(*) FILTER(WHERE kind='intelligent')::int intelligent,count(*) FILTER(WHERE deployed_at>=now()-interval '24 hours')::int new_24h FROM gen_contracts`,
      ),
      nativeOverviewActivity(pool, since, until),
      pool.query(
        `SELECT status,count(*)::int count FROM gen_transactions WHERE confirmation<>'orphaned' GROUP BY status ORDER BY count DESC`,
      ),
      pool.query(
        `SELECT t.recipient address,c.name,count(*)::int calls_24h,count(DISTINCT t.sender)::int callers_24h FROM gen_transactions t LEFT JOIN gen_contracts c ON c.address=t.recipient WHERE t.confirmation<>'orphaned' AND t.created_at>=$1 AND t.created_at<=$2 GROUP BY t.recipient,c.name ORDER BY calls_24h DESC,t.recipient LIMIT 5`,
        [since, until],
      ),
      pool.query(`SELECT * FROM gen_sync WHERE id=1`),
      rpc
        .call<any>("gen_syncing")
        .then((x) => ({
          synced_block: Number(x.syncedBlock),
          latest_block: Number(x.latestBlock),
          blocks_behind: Number(x.blocksBehind),
        }))
        .catch(() => null),
    ]);
    return {
      contracts: contracts.rows[0],
      activity: Object.fromEntries(
        Object.entries(activity).filter(([key]) => key !== "points"),
      ),
      series: {
        since: since.toISOString(),
        until: until.toISOString(),
        bucket_secs: 3600,
        points: activity.points,
      },
      statuses: statuses.rows,
      top_contracts: top.rows,
      sync: sync.rows[0] ?? null,
      genvm: vm,
      deployment: GENLAYER_DEPLOYMENT,
    };
  });
  app.get<{
    Querystring: {
      q?: string;
      kind?: string;
      sort?: string;
      offset?: string;
      limit?: string;
    };
  }>("/api/v1/contracts", async (req) => {
    const q = (req.query.q ?? "").toLowerCase().trim();
    if (q.length > 100) fail("Search is too long");
    const kind = req.query.kind ?? "all";
    if (!["all", "intelligent", "evm"].includes(kind))
      fail("Invalid contract type");
    const sort = req.query.sort ?? "recent";
    if (!["recent", "activity"].includes(sort)) fail("Invalid sort");
    const limit = Math.max(1, numberOf(req.query.limit, 25, 100)),
      offset = numberOf(req.query.offset, 0, 1000000);
    const query = `FROM gen_contracts c WHERE ($1='all' OR c.kind=$1) AND ($2='' OR position($2 in c.address)>0 OR position($2 in lower(coalesce(c.name,'')))>0 OR position($2 in lower(coalesce(c.profile->>'description','')))>0 OR position($2 in lower(coalesce(c.profile->'methods','[]')::text))>0)`;
    const [list, count] = await Promise.all([
      pool.query(
        `SELECT c.*,
      CASE WHEN c.kind='intelligent' THEN (SELECT count(*)::int FROM gen_transactions t WHERE t.recipient=c.address AND t.confirmation='confirmed' AND t.created_at>=now()-interval '24 hours') ELSE (SELECT count(*)::int FROM transactions t WHERE t."to"=c.address AND t.time>=now()-interval '24 hours') END calls_24h
      ${query} ORDER BY ${sort === "activity" ? "calls_24h DESC," : ""} c.first_seen_block DESC,c.address LIMIT $3 OFFSET $4`,
        [kind, q, limit, offset],
      ),
      pool.query(`SELECT count(*)::int count ${query}`, [kind, q]),
    ]);
    return {
      contracts: list.rows.map(row),
      total: count.rows[0].count,
      limit,
      offset,
    };
  });
  app.get<{ Params: { address: string } }>(
    "/api/v1/contracts/:address",
    async (req) => {
      const address = addressOf(req.params.address);
      const {
        rows: [indexed],
      } = await pool.query("SELECT * FROM gen_contracts WHERE address=$1", [
        address,
      ]);
      let native = indexed?.kind === "intelligent",
        sourceAvailable = !!indexed?.source_hash;
      try {
        if (!native) {
          await code(address);
          native = true;
          sourceAvailable = true;
        }
      } catch (e) {
        if (!notFound(e)) throw e;
      }
      const [balance, bytecode] = await Promise.all([
        rpc.call<string>("eth_getBalance", [address, "latest"]),
        native
          ? Promise.resolve(null)
          : rpc.call<string>("eth_getCode", [address, "latest"]),
      ]);
      if (!native && (!bytecode || bytecode === "0x") && !indexed)
        fail("No contract found at this address", 404);
      const {
        rows: [usage],
      } = await pool.query(
        `SELECT count(*)::int calls_24h,count(DISTINCT sender)::int callers_24h FROM gen_transactions WHERE recipient=$1 AND confirmation<>'orphaned' AND created_at>=now()-interval '24 hours'`,
        [address],
      );
      const {
        rows: [evmUsage],
      } = await pool.query(
        `SELECT count(*)::int calls_24h,count(DISTINCT "from")::int callers_24h FROM transactions WHERE "to"=$1 AND time>=now()-interval '24 hours'`,
        [address],
      );
      return {
        contract: {
          ...row(indexed),
          address,
          kind:
            native || indexed?.kind === "intelligent" ? "intelligent" : "evm",
          balance: BigInt(balance).toString(),
          source_available: sourceAvailable,
          bytecode: bytecode ?? null,
          ...(native ? usage : evmUsage),
        },
        indexed: !!indexed,
      };
    },
  );
  app.get<{ Params: { address: string }; Querystring: { state?: string } }>(
    "/api/v1/contracts/:address/code",
    async (req) => {
      const address = addressOf(req.params.address),
        state = req.query.state ?? "decided";
      if (!["decided", "finalized"].includes(state)) fail("Invalid state");
      try {
        const c = await code(address, state as "decided" | "finalized");
        return {
          kind: "intelligent",
          state,
          source: c.source,
          size: c.size,
          sha256: createHash("sha256").update(c.source).digest("hex"),
          language: c.source.includes("import genlayer") ? "python" : "text",
          references: {
            llm: /\b(prompt|exec_prompt|llm)\b/.test(c.source),
            web: /\b(get_webpage|web|fetch)\b/.test(c.source),
          },
        };
      } catch (e) {
        if (!notFound(e)) throw e;
        const bytecode = await rpc.call<string>("eth_getCode", [
          address,
          "latest",
        ]);
        if (bytecode === "0x")
          fail("Source is not available in this state", 404);
        return {
          kind: "evm",
          bytecode,
          source: null,
          language: "evm",
          state: "latest",
          size: (bytecode.length - 2) / 2,
        };
      }
    },
  );
  app.get<{ Params: { address: string } }>(
    "/api/v1/contracts/:address/schema",
    async (req) => ({ schema: await schema(addressOf(req.params.address)) }),
  );
  app.get<{
    Params: { address: string };
    Querystring: {
      method?: string;
      args?: string;
      kwargs?: string;
      state?: string;
    };
  }>("/api/v1/contracts/:address/read", async (req, reply) => {
    reply.header("cache-control", "no-store");
    const address = addressOf(req.params.address),
      method = req.query.method ?? "",
      state = req.query.state ?? "decided";
    if (
      !method ||
      method.length > 128 ||
      !["decided", "finalized"].includes(state)
    )
      fail("Invalid read request");
    if ((req.query.args?.length ?? 0) + (req.query.kwargs?.length ?? 0) > 8192)
      fail("Arguments are too large");
    if (runningReads >= 3)
      fail("Contract reads are busy. Try again shortly.", 429);
    runningReads++;
    try {
      const s = await schema(address);
      const m = Object.hasOwn(s.methods ?? {}, method)
        ? s.methods[method]
        : null;
      if (!m || m.readonly !== true)
        fail("Only declared read-only methods can be queried");
      let args: any[], kwargs: Record<string, any>;
      try {
        args = JSON.parse(req.query.args ?? "[]");
        kwargs = JSON.parse(req.query.kwargs ?? "{}");
      } catch {
        fail("Arguments must be valid JSON");
      }
      if (
        !Array.isArray(args!) ||
        !kwargs! ||
        typeof kwargs !== "object" ||
        Array.isArray(kwargs!)
      )
        fail(
          "Use a JSON array for arguments and an object for keyword arguments",
        );
      if (args!.length !== (m.params?.length ?? 0))
        fail(
          `This method requires ${m.params?.length ?? 0} positional arguments`,
        );
      let typed: any[], typedKw: Record<string, any>;
      try {
        typed = typedReadArgs(s, method, args!);
        typedKw = typedValue(m.kwparams ?? {}, kwargs!);
      } catch (e) {
        fail((e as Error).message);
      }
      const result = await rpc
        .call<any>("gen_call", [
          {
            from: "0x0000000000000000000000000000000000000000",
            to: address,
            data: encodeRead(method, typed!, typedKw!),
            type: "read",
            status: state,
          },
        ])
        .catch((e) => {
          if (e instanceof RpcError && e.code === -32000)
            fail(
              "The node could not execute this read. Check the arguments and selected state.",
              422,
            );
          throw e;
        });
      return {
        state,
        synced_block:
          result.syncedBlock == null ? null : Number(result.syncedBlock),
        status: result.status ?? null,
        result: decodeCalldata(result.data ?? ""),
        raw: result.data ?? null,
      };
    } finally {
      runningReads--;
    }
  });
  app.get<{
    Querystring: {
      address?: string;
      status?: string;
      offset?: string;
      limit?: string;
      submission?: string;
      execution?: string;
      confirmation?: string;
      days?: string;
    };
  }>("/api/v1/genlayer/transactions", async (req) => {
    const address = req.query.address ? addressOf(req.query.address) : null,
      submission = req.query.submission ? idOf(req.query.submission) : null;
    const status = req.query.status ?? "";
    if (status.length > 30) fail("Invalid status");
    const limit = Math.max(1, numberOf(req.query.limit, 25, 100)),
      offset = numberOf(req.query.offset, 0, 1000000);
    const execution = req.query.execution ?? "",
      confirmation = req.query.confirmation ?? "";
    if (
      ![
        "",
        "returned",
        "error",
        "timeout",
        "disagreement",
        "violation",
        "unknown",
        "failed",
      ].includes(execution)
    )
      fail("Invalid execution filter");
    if (!["", "confirmed", "provisional", "orphaned"].includes(confirmation))
      fail("Invalid confirmation filter");
    const days = req.query.days ?? "";
    if (!["", "1", "7", "30"].includes(days)) fail("Invalid time window");
    const until = new Date(),
      since = days ? new Date(until.getTime() - Number(days) * 86400000) : null;
    const where = `WHERE ($1::text IS NULL OR t.recipient=$1) AND ($2='' OR t.status=$2) AND ($3::text IS NULL OR t.submission_hash=$3)
      AND ($4='' OR t.execution_result=$4 OR ($4='failed' AND t.execution_result IN ('error','timeout','disagreement','violation')))
      AND (($5='' AND t.confirmation<>'orphaned') OR t.confirmation=$5)
      AND ($6::timestamptz IS NULL OR (t.created_at >= $6 AND t.created_at <= $7))`;
    const [list, count] = await Promise.all([
      pool.query(
        `SELECT t.id,t.recipient,t.submission_hash,t.block_number,t.sender,t.created_at,t.observed_at,t.status,t.kind,t.method,t.checked_at,t.execution_result,t.confirmation,c.name contract_name,jsonb_array_length(t.receipt->'roundData') rounds FROM gen_transactions t LEFT JOIN gen_contracts c ON c.address=t.recipient ${where} ORDER BY t.block_number DESC,t.id LIMIT $8 OFFSET $9`,
        [
          address,
          status,
          submission,
          execution,
          confirmation,
          since,
          until,
          limit,
          offset,
        ],
      ),
      pool.query(
        `SELECT count(*)::int count FROM gen_transactions t ${where}`,
        [address, status, submission, execution, confirmation, since, until],
      ),
    ]);
    return {
      transactions: list.rows.map(row),
      total: count.rows[0].count,
      limit,
      offset,
    };
  });
  app.get<{ Params: { id: string } }>(
    "/api/v1/genlayer/transactions/:id",
    async (req) => {
      const id = idOf(req.params.id);
      const {
        rows: [indexed],
      } = await pool.query(
        "SELECT id,submission_hash,block_number,checked_at,receipt,confirmation,execution_result FROM gen_transactions WHERE id=$1",
        [id],
      );
      let receipt,
        stale = false;
      try {
        receipt = normalizeReceipt(
          await rpc.call("gen_getTransactionReceipt", [{ txId: id }]),
        );
      } catch (e) {
        if (!indexed?.receipt) throw e;
        receipt = indexed.receipt;
        stale = true;
      }
      if (!receipt)
        fail(
          "Consensus transaction not found. Use its GenLayer ID rather than the EVM hash.",
          404,
        );
      return {
        id,
        receipt,
        confirmation: indexed?.confirmation ?? "unindexed",
        execution_result: indexed?.execution_result ?? "unknown",
        stale,
        submission_hash: indexed?.submission_hash ?? null,
        block_number: indexed ? Number(indexed.block_number) : null,
        checked_at: stale ? indexed.checked_at : new Date().toISOString(),
      };
    },
  );
  app.get<{ Params: { id: string }; Querystring: { round?: string } }>(
    "/api/v1/genlayer/transactions/:id/result",
    async (req) => {
      const result = await rpc.call<any>("gen_getTransactionData", [
        {
          txId: idOf(req.params.id),
          ...(req.query.round === undefined
            ? {}
            : { round: numberOf(req.query.round, 0, 255) }),
        },
      ]);
      return {
        ...result,
        decoded_return:
          result.returnData == null ? null : decodeCalldata(result.returnData),
      };
    },
  );
  app.get<{
    Params: { address: string };
    Querystring: { to?: string; status?: string };
  }>("/api/v1/contracts/:address/events", async (req) => {
    const address = addressOf(req.params.address);
    const sync = await rpc.call<any>("gen_syncing");
    const to = numberOf(
        req.query.to,
        Number(sync.syncedBlock),
        Number(sync.syncedBlock),
      ),
      from = Math.max(0, to - 4999);
    const status = req.query.status ?? "active";
    if (!["active", "cancelled", "all"].includes(status))
      fail("Invalid event status");
    const logs = await rpc.call<any[]>("gen_getLogs", [
      {
        address,
        fromBlock: hex(from),
        toBlock: hex(to),
        status:
          status === "all"
            ? ["accepted", "finalized", "cancelled"]
            : status === "cancelled"
              ? ["cancelled"]
              : ["accepted", "finalized"],
      },
    ]);
    return {
      from_block: from,
      to_block: to,
      next_to: from > 0 ? from - 1 : null,
      events: logs.map((x) => ({ ...x, decoded: decodeCalldata(x.data) })),
      note: "Events reflect their current consensus state. Older events may be pruned by the node.",
    };
  });
}
