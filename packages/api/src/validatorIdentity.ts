import { HEX_ADDRESS } from "@genlayer-explorer/core";
import type { Deps } from "./routes";

/** Attach current cached names without changing the historical receipt or making RPC calls. */
export async function withValidatorMonikers(pool: Deps["pool"], receipt: any) {
  const addresses = [...new Set<string>((receipt.roundData ?? []).flatMap((round: any) =>
    (round.validators ?? []).map((v: any) => String(v.address).toLowerCase()).filter((address: string) => HEX_ADDRESS.test(address))))];
  if (!addresses.length) return receipt;
  const { rows } = await pool.query<{ address: string; moniker: string | null }>(
    "SELECT address,moniker FROM gen_validator_identities WHERE address=ANY($1::text[])", [addresses]);
  const names = new Map(rows.map(row => [row.address, row.moniker]));
  return { ...receipt, roundData: receipt.roundData.map((round: any) => ({ ...round,
    validators: (round.validators ?? []).map((validator: any) => ({ ...validator,
      moniker: names.get(String(validator.address).toLowerCase()) ?? null,
    })),
  })) };
}
