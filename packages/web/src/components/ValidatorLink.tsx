import { short } from "../lib";

/** Monikers are current self-published labels; the wallet address remains the identifier. */
export function ValidatorLink({ address, moniker }: { address: string; moniker?: string | null }) {
  return <a className="validator-link" href={`#/validators/${address}`} title={address}>
    <span className="validator-name" dir="auto">{moniker || short(address)}</span>
    {moniker && <small>{short(address)}</small>}
  </a>;
}
