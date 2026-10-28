import {
  GENLAYER_DEPLOYMENT,
  HEX_ADDRESS,
  executionResult,
  getNativeCode,
  normalizeReceipt,
  receiptVotes,
  sourceProfile,
  hex,
} from "@genlayer-explorer/core";
import type { Ctx } from "./context";
import { indexNativeRange } from "./genlayer";

/** A bounded recent live window is reconciled on every pass; confirmed history is independent. */
export async function liveNativeTick(ctx: Ctx, rpc = ctx.rpc) {
  const [latest, finalized] = await Promise.all([
    rpc.call<any>("eth_getBlockByNumber", ["latest", false]),
    rpc.call<any>("eth_getBlockByNumber", ["finalized", false]),
  ]);
  const to = Number(latest.number),
    from = Math.max(
      GENLAYER_DEPLOYMENT.genesis,
      Number(finalized.number) + 1,
      to - 999,
    );
  if (!Number.isSafeInteger(to) || !Number.isSafeInteger(from))
    throw new Error("Invalid live block range");
  if (from <= to)
    await indexNativeRange(ctx, from, to, rpc, {
      confirmation: "provisional",
      anchor: latest.hash,
    });
  const anchor = await rpc.call<any>("eth_getBlockByNumber", [hex(to), false]);
  if (anchor?.hash !== latest.hash)
    throw new Error("Live chain changed during reconciliation");
  await ctx.pool.query(
    "UPDATE gen_transactions SET confirmation='orphaned',updated_at=now() WHERE confirmation='provisional' AND block_number>$1",
    [to],
  );
  await ctx.pool.query(
    "UPDATE gen_sync SET live_head=$1,live_from=$2,live_updated_at=now(),live_error=NULL WHERE id=1",
    [to, from],
  );
}
export async function persistReceipt(
  ctx: Ctx,
  id: string,
  r: any,
  onlyUnanalyzed = false,
) {
  const outcome = executionResult(r),
    client = await ctx.pool.connect();
  try {
    await client.query("BEGIN");
    const {
      rows: [old],
    } = await client.query(
      "SELECT status,execution_result,confirmation,analysis_version FROM gen_transactions WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (
      !old ||
      old.confirmation === "orphaned" ||
      (onlyUnanalyzed && old.analysis_version !== 0)
    ) {
      await client.query("ROLLBACK");
      return;
    }
    const created =
      Number(r.timestamps?.Created) > 0
        ? new Date(Number(r.timestamps.Created) * 1000)
        : null;
    await client.query(
      `UPDATE gen_transactions SET sender=$2,created_at=$3,status=$4,kind=$5,method=$6,receipt=$7,checked_at=now(),updated_at=now(),execution_result=$8,analysis_version=1 WHERE id=$1`,
      [
        id,
        r.sender?.toLowerCase() ?? null,
        created,
        r.statusName,
        r.input.kind,
        r.input.method,
        JSON.stringify(r),
        outcome,
      ],
    );
    if (old.status !== r.statusName || old.execution_result !== outcome)
      await client.query(
        "INSERT INTO gen_receipt_observations(tx_id,status,execution_result) VALUES($1,$2,$3)",
        [id, r.statusName, outcome],
      );
    await client.query(
      "UPDATE gen_validator_votes SET active=false WHERE tx_id=$1",
      [id],
    );
    for (const v of receiptVotes(id, r)) {
      if (!HEX_ADDRESS.test(v.address) || !Number.isSafeInteger(v.round))
        continue;
      await client.query(
        `INSERT INTO gen_validator_votes(tx_id,round,position,address,leader,vote,result_hash,consensus_result,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT(tx_id,round,position) DO UPDATE SET address=EXCLUDED.address,leader=EXCLUDED.leader,vote=EXCLUDED.vote,result_hash=EXCLUDED.result_hash,consensus_result=EXCLUDED.consensus_result,active=true`,
        [
          id,
          v.round,
          v.position,
          v.address,
          v.leader,
          v.vote,
          v.result_hash,
          v.consensus_result,
        ],
      );
    }
    if (r.input.kind === "deploy" && old.confirmation === "confirmed")
      await client.query(
        `UPDATE gen_contracts c SET creator=$2,deployment_id=$1,deployment_tx=t.submission_hash,deployment_block=t.block_number,deployed_at=$3,updated_at=now() FROM gen_transactions t WHERE t.id=$1 AND c.address=t.recipient AND (c.deployment_block IS NULL OR t.block_number<=c.deployment_block)`,
        [id, r.sender?.toLowerCase() ?? null, created],
      );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
/** Enrich existing terminal receipts without re-executing or re-fetching transactions. */
export async function analyzeStoredReceipts(ctx: Ctx) {
  const { rows } = await ctx.pool.query(
    `SELECT id,receipt FROM gen_transactions WHERE analysis_version=0 AND receipt IS NOT NULL AND confirmation<>'orphaned' ORDER BY block_number DESC LIMIT 100`,
  );
  for (const x of rows) {
    if (ctx.stopping()) break;
    const r = normalizeReceipt(x.receipt);
    if (r) await persistReceipt(ctx, x.id, r, true);
  }
}
export async function refreshContractProfiles(ctx: Ctx, rpc = ctx.rpc) {
  const { rows } = await ctx.pool.query(
    `SELECT address FROM gen_contracts WHERE kind='intelligent' AND (profile_checked_at IS NULL OR profile_checked_at<now()-CASE WHEN profile IS NULL THEN interval '10 minutes' ELSE interval '6 hours' END) ORDER BY profile_checked_at NULLS FIRST,first_seen_block DESC LIMIT 8`,
  );
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(2, rows.length) }, async () => {
      while (next < rows.length && !ctx.stopping()) {
        const { address } = rows[next++];
        try {
          const code = await getNativeCode(rpc, address, "finalized"),
            profile = sourceProfile(code.source),
            client = await ctx.pool.connect();
          try {
            await client.query("BEGIN");
            await client.query(
              `INSERT INTO gen_contract_sources(address,sha256,source,profile,observed_block) VALUES($1,$2,$3,$4,(SELECT head FROM gen_sync WHERE id=1)) ON CONFLICT(address,sha256) DO UPDATE SET last_observed_at=now()`,
              [address, profile.sha256, code.source, JSON.stringify(profile)],
            );
            await client.query(
              "UPDATE gen_contracts SET name=$2,profile=$3,source_hash=$4,profile_checked_at=now() WHERE address=$1",
              [address, profile.name, JSON.stringify(profile), profile.sha256],
            );
            await client.query("COMMIT");
          } catch (e) {
            await client.query("ROLLBACK");
            throw e;
          } finally {
            client.release();
          }
        } catch {
          await ctx.pool.query(
            "UPDATE gen_contracts SET profile_checked_at=now() WHERE address=$1",
            [address],
          );
          ctx.log("contract profile delayed", { address });
        }
      }
    }),
  );
}
