import { getValidatorMoniker, JsonRpc, rpcUrlsFromEnv } from "@genlayer-explorer/core";
import { sleep, type Ctx } from "./context";

/** Two concurrent reads, at most twenty wallets per pass; no RPC work in API requests. */
export async function refreshValidatorIdentities(ctx: Ctx, rpc = ctx.rpc) {
  await ctx.pool.query(`INSERT INTO gen_validator_identities(address)
    SELECT DISTINCT address FROM gen_validator_votes WHERE address ~ '^0x[0-9a-f]{40}$'
    ON CONFLICT(address) DO NOTHING`);
  const { rows } = await ctx.pool.query<{ address: string }>(`SELECT address FROM gen_validator_identities
    WHERE checked_at IS NULL OR checked_at < now() - CASE WHEN last_error IS NULL THEN interval '1 hour' ELSE interval '5 minutes' END
    ORDER BY checked_at NULLS FIRST,address LIMIT 20`);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(2, rows.length) }, async () => {
    while (next < rows.length && !ctx.stopping()) {
      const { address } = rows[next++]!;
      let moniker: string | null;
      try { moniker = await getValidatorMoniker(rpc, address); }
      catch {
        // Preserve the last successful name during RPC outages; a successful empty
        // identity below clears a moniker intentionally removed by its owner.
        await ctx.pool.query("UPDATE gen_validator_identities SET checked_at=now(),last_error='Validator identity temporarily unavailable' WHERE address=$1", [address]);
        continue;
      }
      await ctx.pool.query("UPDATE gen_validator_identities SET moniker=$2,checked_at=now(),fetched_at=now(),last_error=NULL WHERE address=$1", [address, moniker]);
    }
  }));
  return rows.length;
}
export async function validatorIdentityLoop(ctx: Ctx) {
  const rpc = new JsonRpc(rpcUrlsFromEnv(), 2);
  while (!ctx.stopping()) {
    try { await refreshValidatorIdentities(ctx, rpc); }
    catch { ctx.log("validator identity refresh delayed"); }
    await sleep(60_000);
  }
}
