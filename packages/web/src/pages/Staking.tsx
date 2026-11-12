/**
 * Staking: the delegated proof-of-stake directory, mirrored from the official
 * bradbury scan by the indexer. Read-only — delegation itself happens in a
 * wallet or the GenLayer CLI, never here.
 */
import { useState, type ReactNode } from "react";
import { get } from "../api";
import { usePolling } from "../usePolling";
import { pollingKey } from "../pollingCache";
import { fmt, gen, parseGEN, short } from "../lib";
import { createClient, chains } from "genlayer-js";
import { Timestamp } from "../components/Timestamp";
import { addressRoute } from "../transactionExplorer";
import "./staking.css";

export type StakingValidator = {
  address: string;
  status: string;
  is_active: boolean;
  self_stake: string;
  delegated_stake: string;
  total_shares: string;
  apy: string | null;
  validator_weight: string | null;
  banned_until_epoch: number | null;
  operator_address: string | null;
  owner_address: string | null;
  pending_deposits: { epoch: number }[] | null;
  pending_withdrawals: unknown[] | null;
  total_votes_7d: number | null;
  minority_votes_7d: number | null;
  successful_appeals_7d: number | null;
  live: boolean | null;
  fetched_at: string;
  total_stake: string;
};

type StakingData = {
  validators: StakingValidator[];
  summary: {
    total: number;
    active: number;
    self_stake: string;
    delegated_stake: string;
    median_apy: number | null;
    min_apy: number | null;
    max_apy: number | null;
    fetched_at: string | null;
  };
};

function Panel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="int-panel">
      <header>
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stk-tile">
      <span className="stk-tile-label">{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

const wei = (v: string | null | undefined): string => (v === null || v === undefined ? "—" : gen(v, 2));
const MIN_DELEGATE_GEN = 42;

/** Staking writes are client-side only: the user's own wallet signs the
 *  delegatorJoin transaction via the GenLayer MetaMask Snap; this explorer
 *  never sees a key. Reads stay on the indexed scan mirror. */
let writeClient: ReturnType<typeof createClient> | null = null;
async function getWriteClient() {
  let client = writeClient;
  if (!client) {
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("No browser wallet detected. Install MetaMask and try again.");
    const chain = { ...chains.testnetBradbury, stakingContract: { address: STAKING_CONTRACT } };
    client = createClient({ chain });
    writeClient = client;
    await (client as any).metamaskClient(); // adds bradbury + installs the GenLayer snap
  }
  return client;
}
const STAKING_CONTRACT = "0x4A4449E617F8D10FDeD0b461CadEf83939E821A5";
const compactWei = (v: string | null | undefined): string => (v === null || v === undefined ? "—" : gen(v, 0));

export function Staking({ live }: { live: boolean }) {
  const [state, setState] = useState<StakingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = pollingKey("staking");
  usePolling(
    async () => {
      try {
        setState(await get<StakingData>("/api/v1/staking/validators"));
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    live,
    30_000,
    key,
  );

  const s = state?.summary ?? null;
  const validators = state?.validators ?? [];
  const withDelegation = validators.filter((v: StakingValidator) => v.delegated_stake !== "0").length;
  const [wallet, setWallet] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [delegateTo, setDelegateTo] = useState<StakingValidator | null>(null);
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setWalletError(null);
    try {
      await getWriteClient();
      const accounts = await (window as any).ethereum.request({ method: "eth_accounts" });
      setWallet(accounts?.[0] ?? null);
    } catch (e) {
      setWalletError((e as Error).message);
    }
  };

  const delegate = async () => {
    if (!delegateTo || !wallet) return;
    setWalletError(null);
    setBusy(true);
    try {
      const weiAmount = parseGEN(amount);
      if (BigInt(weiAmount) < 42n * 10n ** 18n) throw new Error(`Minimum delegation is ${MIN_DELEGATE_GEN} GEN`);
      const client = await getWriteClient();
      const result = await (client as any).delegatorJoin({ validator: delegateTo.address, amount: weiAmount });
      setTxHash(typeof result === "string" ? result : result?.hash ?? result?.txHash ?? JSON.stringify(result).slice(0, 66));
      setDelegateTo(null);
      setAmount("");
    } catch (e) {
      setWalletError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stk-page">
      <div className="stk-connect">
        {wallet ? (
          <span className="stk-connected">Wallet connected: <code>{short(wallet)}</code> — delegation requests are signed in your wallet; this site never sees your keys.</span>
        ) : (
          <button className="stk-connect-btn" type="button" onClick={connect}>Connect wallet (MetaMask + GenLayer Snap)</button>
        )}
        {walletError && <span className="stk-error">{walletError}</span>}
        {txHash && <span className="stk-tx">Delegation submitted: <code>{short(txHash)}</code> — it will appear as a pending deposit once the consensus decides it.</span>}
      </div>
      <div className="stk-tiles">
        <Tile label="Validators" value={s ? fmt(s.total) : "—"} sub={s ? `${fmt(s.active)} active` : undefined} />
        <Tile label="Total self stake" value={s ? compactWei(s.self_stake) : "—"} sub="GEN" />
        <Tile label="Total delegated" value={s ? compactWei(s.delegated_stake) : "—"} sub={`${fmt(withDelegation)} validators accepting delegation`} />
        <Tile label="Median APY" value={s?.median_apy !== null && s ? `${s.median_apy}%` : "—"} sub={s && s.max_apy !== null ? `range ${s.min_apy}% – ${s.max_apy}%` : undefined} />
        <Tile label="Snapshot" value={s?.fetched_at ? <Timestamp value={s.fetched_at} /> : "—"} sub="mirrored from the official scan" />
      </div>

      <Panel
        title="Validators"
        aside={<span className="stk-note">Anyone can delegate GEN to a validator (min 42 GEN) from a wallet or the GenLayer CLI. Rewards compound through shares; exits mature over 7 epochs.</span>}
      >
        {error && !state ? (
          <div className="int-empty">{error}</div>
        ) : validators.length === 0 ? (
          <div className="int-empty">No staking snapshot yet — the first poll lands within a minute.</div>
        ) : (
          <div className="stk-table-wrap">
            <table className="stk-table">
              <thead>
                <tr>
                  <th>Validator</th><th>Status</th><th className="num">Self stake</th><th className="num">Delegated</th>
                  <th className="num">Total</th><th className="num">APY</th><th className="num">Votes 7d</th><th>Pending</th><th>Updated</th><th />
                </tr>
              </thead>
              <tbody>
                {validators.map((v) => (
                  <tr key={v.address} className={v.is_active ? "" : "stk-inactive"}>
                    <td>
                      <a className="stk-address" href={addressRoute(v.address)} title={v.address}>{short(v.address)}</a>
                      {v.live !== null && <span className={`stk-live ${v.live ? "on" : ""}`}>{v.live ? "live" : "offline"}</span>}
                    </td>
                    <td><span className={`stk-status ${v.is_active ? "active" : v.status === "jailed" ? "jailed" : "idle"}`}>{v.status}</span></td>
                    <td className="num">{wei(v.self_stake)}</td>
                    <td className="num">{wei(v.delegated_stake)}</td>
                    <td className="num">{wei(v.total_stake)}</td>
                    <td className="num">{v.apy !== null ? `${Number(v.apy).toFixed(2)}%` : "—"}</td>
                    <td className="num">{v.total_votes_7d !== null ? fmt(v.total_votes_7d) : "—"}</td>
                    <td>
                      {(v.pending_deposits?.length ?? 0) + (v.pending_withdrawals?.length ?? 0) > 0
                        ? `${(v.pending_deposits?.length ?? 0)} dep · ${(v.pending_withdrawals?.length ?? 0)} wd`
                        : "—"}
                    </td>
                    <td><Timestamp value={v.fetched_at} /></td>
                    <td><button className="stk-delegate" type="button" onClick={() => { setDelegateTo(v); setAmount(""); }} disabled={!wallet} title={wallet ? "Delegate GEN to this validator" : "Connect your wallet first"}>Delegate</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {delegateTo && (
        <div className="stk-modal" role="dialog" aria-label="Delegate GEN">
          <div className="stk-modal-card">
            <h3>Delegate to {short(delegateTo.address)}</h3>
            <p>You are leaving the read-only explorer: the transaction is built here but <strong>signed and broadcast by your own wallet</strong> via the GenLayer Snap. Review it there before approving.</p>
            <label>Amount (GEN, minimum {MIN_DELEGATE_GEN})</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="42" inputMode="decimal" autoFocus />
            <p className="stk-muted">Deposits activate two epochs after the current one; exits lock for 7 epochs before claiming.</p>
            {walletError && <p className="stk-error">{walletError}</p>}
            <div className="stk-modal-actions">
              <button type="button" onClick={() => { setDelegateTo(null); setAmount(""); }} disabled={busy}>Cancel</button>
              <button type="button" className="stk-primary" onClick={delegate} disabled={busy || !amount}>
                {busy ? "Waiting for wallet…" : "Sign delegation in wallet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
