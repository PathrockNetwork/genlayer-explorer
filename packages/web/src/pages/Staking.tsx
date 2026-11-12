/**
 * Staking: the delegated proof-of-stake directory, mirrored from the official
 * bradbury scan by the indexer. Read-only — delegation itself happens in a
 * wallet or the GenLayer CLI, never here.
 */
import { useState, type ReactNode } from "react";
import { get } from "../api";
import { usePolling } from "../usePolling";
import { pollingKey } from "../pollingCache";
import { fmt, gen, short } from "../lib";
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

  return (
    <div className="stk-page">
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
                  <th className="num">Total</th><th className="num">APY</th><th className="num">Votes 7d</th><th>Pending</th><th>Updated</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
