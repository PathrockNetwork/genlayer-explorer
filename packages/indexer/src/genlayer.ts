/** Independent resumable native index. It never delays the EVM block follower. */
import {
  GENLAYER_DEPLOYMENT as deployment,
  NEW_TRANSACTION,
  INTERNAL_MESSAGE,
  submissionFromLog,
  normalizeReceipt,
  hex,
  JsonRpc,
  rpcUrlsFromEnv,
} from "@genlayer-explorer/core";
import {
  liveNativeTick,
  persistReceipt,
  analyzeStoredReceipts,
  refreshContractProfiles,
} from "./observatory";
import { sleep, type Ctx } from "./context";

export async function indexNativeRange(
  ctx: Ctx,
  from: number,
  to: number,
  rpc = ctx.rpc,
  options: { confirmation?: "confirmed" | "provisional"; anchor?: string } = {},
) {
  const logs = await rpc.call<any[]>("eth_getLogs", [
    {
      address: deployment.consensus,
      fromBlock: hex(from),
      toBlock: hex(to),
      topics: [[NEW_TRANSACTION, INTERNAL_MESSAGE]],
    },
  ]);
  const found = new Map(
    logs
      .map(submissionFromLog)
      .filter((x) => x !== null)
      .map((x) => [x.id, x]),
  );
  const confirmation = options.confirmation ?? "confirmed";
  if (options.anchor) {
    const end = await rpc.call<any>("eth_getBlockByNumber", [hex(to), false]);
    if (end?.hash !== options.anchor)
      throw new Error("Live chain changed during discovery; retrying");
  }
  const client = await ctx.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE gen_transactions SET confirmation='orphaned',updated_at=now() WHERE block_number BETWEEN $1 AND $2 AND confirmation<>'confirmed' AND NOT(id=ANY($3::text[]))",
      [from, to, [...found.keys()]],
    );
    for (const s of found.values()) {
      await client.query(
        `INSERT INTO gen_transactions (id,recipient,submission_hash,block_number,confirmation,submission_block_hash) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (id) DO UPDATE SET recipient=EXCLUDED.recipient,submission_hash=EXCLUDED.submission_hash,block_number=EXCLUDED.block_number,submission_block_hash=EXCLUDED.submission_block_hash,
        confirmation=CASE WHEN gen_transactions.confirmation='confirmed' THEN 'confirmed' ELSE EXCLUDED.confirmation END,
        receipt=CASE WHEN gen_transactions.confirmation='orphaned' OR gen_transactions.submission_hash<>EXCLUDED.submission_hash OR (gen_transactions.submission_block_hash IS NOT NULL AND gen_transactions.submission_block_hash<>EXCLUDED.submission_block_hash) THEN NULL ELSE gen_transactions.receipt END,
        status=CASE WHEN gen_transactions.confirmation='orphaned' OR gen_transactions.submission_hash<>EXCLUDED.submission_hash OR (gen_transactions.submission_block_hash IS NOT NULL AND gen_transactions.submission_block_hash<>EXCLUDED.submission_block_hash) THEN 'Unknown' ELSE gen_transactions.status END,
        execution_result=CASE WHEN gen_transactions.confirmation='orphaned' OR gen_transactions.submission_hash<>EXCLUDED.submission_hash OR (gen_transactions.submission_block_hash IS NOT NULL AND gen_transactions.submission_block_hash<>EXCLUDED.submission_block_hash) THEN 'unknown' ELSE gen_transactions.execution_result END,
        checked_at=CASE WHEN gen_transactions.confirmation='orphaned' OR gen_transactions.submission_hash<>EXCLUDED.submission_hash OR (gen_transactions.submission_block_hash IS NOT NULL AND gen_transactions.submission_block_hash<>EXCLUDED.submission_block_hash) THEN NULL ELSE gen_transactions.checked_at END,
        analysis_version=CASE WHEN gen_transactions.confirmation='orphaned' OR gen_transactions.submission_hash<>EXCLUDED.submission_hash OR (gen_transactions.submission_block_hash IS NOT NULL AND gen_transactions.submission_block_hash<>EXCLUDED.submission_block_hash) OR gen_transactions.confirmation<>EXCLUDED.confirmation THEN 0 ELSE gen_transactions.analysis_version END
        WHERE gen_transactions.confirmation<>'confirmed' OR EXCLUDED.confirmation='confirmed'`,
        [
          s.id,
          s.recipient,
          s.submission_hash,
          s.block_number,
          confirmation,
          logs.find((l: any) => l.topics?.[1]?.toLowerCase() === s.id)
            ?.blockHash ?? null,
        ],
      );
      if (confirmation === "confirmed")
        await client.query(
          `INSERT INTO gen_contracts(address,kind,first_seen_block) VALUES ($1,'intelligent',$2) ON CONFLICT(address) DO UPDATE SET kind='intelligent', first_seen_block=LEAST(gen_contracts.first_seen_block,EXCLUDED.first_seen_block)`,
          [s.recipient, s.block_number],
        );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return found.size;
}
export async function refreshNativeReceipts(ctx: Ctx, rpc = ctx.rpc) {
  const { rows } = await ctx.pool.query(
    `SELECT id FROM gen_transactions WHERE confirmation<>'orphaned' AND (status NOT IN ('Finalized','Canceled') OR receipt IS NULL) AND (checked_at IS NULL OR checked_at < now()-interval '30 seconds') ORDER BY checked_at NULLS FIRST, block_number DESC LIMIT 24`,
  );
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, rows.length) }, async () => {
      while (next < rows.length) {
        const { id } = rows[next++];
        if (ctx.stopping()) break;
        let r;
        try {
          r = normalizeReceipt(
            await rpc.call("gen_getTransactionReceipt", [{ txId: id }]),
          );
        } catch (e) {
          await ctx.pool.query(
            "UPDATE gen_transactions SET checked_at=now() WHERE id=$1",
            [id],
          );
          ctx.log("native receipt delayed", { id });
          continue;
        }
        if (!r) {
          await ctx.pool.query(
            "UPDATE gen_transactions SET checked_at=now() WHERE id=$1",
            [id],
          );
          continue;
        }
        await persistReceipt(ctx, id, r);
      }
    }),
  );
}
export async function nativeTick(ctx: Ctx, rpc = ctx.rpc, enrich = true) {
  const latest = await rpc.call<any>("eth_getBlockByNumber", [
    "finalized",
    false,
  ]);
  const target = Number(latest.number);
  const start = Math.max(deployment.genesis, target - 5000);
  await ctx.pool.query(
    `INSERT INTO gen_sync(id,head,history_next,start_block,target) VALUES(1,$1,$1,$2,$3) ON CONFLICT DO NOTHING`,
    [start - 1, deployment.genesis, target],
  );
  const {
    rows: [state],
  } = await ctx.pool.query("SELECT * FROM gen_sync WHERE id=1");
  let head = Number(state.head),
    history = Number(state.history_next);
  if (head < target) {
    const end = Math.min(target, head + 1000);
    await indexNativeRange(ctx, head + 1, end, rpc);
    await ctx.pool.query("UPDATE gen_sync SET head=$1 WHERE id=1", [end]);
    head = end;
  }
  if (history >= deployment.genesis) {
    const from = Math.max(deployment.genesis, history - 999);
    await indexNativeRange(ctx, from, history, rpc);
    await ctx.pool.query("UPDATE gen_sync SET history_next=$1 WHERE id=1", [
      from - 1,
    ]);
  }
  if (enrich) await refreshNativeReceipts(ctx, rpc);
  // EVM deployments have provable creators; do not guess creators from first calls.
  await ctx.pool
    .query(`INSERT INTO gen_contracts(address,kind,creator,deployment_tx,deployment_block,deployed_at,first_seen_block)
    SELECT DISTINCT ON(contract_address) contract_address,'evm',"from",hash,block_number,time,block_number FROM transactions WHERE contract_address IS NOT NULL AND status=1 ORDER BY contract_address,block_number
    ON CONFLICT(address) DO NOTHING`);
  await ctx.pool.query(
    `UPDATE gen_sync SET target=$1,updated_at=now(),last_error=NULL WHERE id=1`,
    [target],
  );
}
export async function nativeLoop(ctx: Ctx) {
  const rpc = new JsonRpc(rpcUrlsFromEnv(), 5);
  const profilesRpc = new JsonRpc(rpcUrlsFromEnv(), 2);
  await Promise.all([
    (async () => {
      while (!ctx.stopping()) {
        try {
          await liveNativeTick(ctx, rpc);
        } catch {
          await ctx.pool
            .query(
              "UPDATE gen_sync SET live_error='Live discovery temporarily delayed' WHERE id=1",
            )
            .catch(() => {});
        }
        await sleep(5000);
      }
    })(),
    (async () => {
      while (!ctx.stopping()) {
        try {
          await analyzeStoredReceipts(ctx);
          await refreshContractProfiles(ctx, profilesRpc);
        } catch (e) {
          ctx.log("contract analytics delayed", { err: (e as Error).message });
        }
        await sleep(3000);
      }
    })(),
    (async () => {
      while (!ctx.stopping()) {
        try {
          await nativeTick(ctx, rpc, false);
        } catch (e) {
          ctx.log("native indexing delayed", { err: (e as Error).message });
          await ctx.pool
            .query(
              "UPDATE gen_sync SET last_error='Native indexing is temporarily delayed' WHERE id=1",
            )
            .catch(() => {});
        }
        await sleep(5000);
      }
    })(),
    (async () => {
      while (!ctx.stopping()) {
        try {
          await refreshNativeReceipts(ctx, rpc);
        } catch (e) {
          ctx.log("native enrichment delayed", { err: (e as Error).message });
        }
        await sleep(3000);
      }
    })(),
  ]);
}
