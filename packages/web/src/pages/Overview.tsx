import { useState, type ReactNode } from "react";
import type { Dashboard } from "../useDashboard";
import { usePolling } from "../usePolling";
import {
  loadNativeOverview,
  getNativeTransactions,
  contractRoute,
  consensusRoute,
  statusLabel,
  type NativeOverview,
  type NativeTransaction,
} from "../genlayer";
import { fmt, short } from "../lib";
import { Timestamp } from "../components/Timestamp";
import { Outcome } from "./Observatory";
import { activityBuckets } from "../overviewActivity";
import "./genlayer-overview.css";

const loadRecent = () => getNativeTransactions({ limit: "6" });
function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ov-panel ${className}`}>
      <header>
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}
function ErrorState({
  message,
  retry,
  stale = false,
}: {
  message: string | null;
  retry: () => void;
  stale?: boolean;
}) {
  return message ? (
    <div className="ov-error" role="status">
      <span>
        {stale ? "Showing previous data. " : ""}
        {message}
      </span>
      <button onClick={retry}>Retry</button>
    </div>
  ) : null;
}
function Stat({
  label,
  value,
  note,
  href,
  tone = "",
}: {
  label: string;
  value: ReactNode;
  note: ReactNode;
  href?: string;
  tone?: string;
}) {
  return (
    <div className={`ov-stat ${tone}`}>
      <span>{label}</span>
      <strong>{href ? <a href={href}>{value}</a> : value}</strong>
      <small>{note}</small>
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="ov-empty">{children}</p>;
}
const height = (n: number | string | null | undefined) =>
  n == null ? "—" : `#${fmt(Number(n))}`;
const utc = (iso: string) => new Date(iso).toISOString().slice(11, 16);

function ActivityChart({ data }: { data: NativeOverview }) {
  const [selected, setSelected] = useState<number | null>(null),
    series = data.series;
  const points = activityBuckets(
    series.points,
    series.bucket_secs,
    Date.parse(series.until),
  ).map((p) => ({
    ...p,
    ...series.points.find((x) => Date.parse(x.t) === p.time),
  }));
  const max = Math.max(1, ...points.map((p) => p.txs)),
    step = 660 / points.length,
    current = selected == null ? null : points[selected];
  return (
    <>
      <div className="ov-chart-summary">
        <div>
          <strong>{fmt(data.activity.calls_24h)}</strong>
          <span>contract transactions</span>
        </div>
        <div className="ov-legend">
          <span>
            <i className="returned" />
            {fmt(data.activity.returned_24h)} returned
          </span>
          <span>
            <i className="failed" />
            {fmt(data.activity.failed_24h)} failed
          </span>
          <span>
            <i className="unknown" />
            {fmt(data.activity.unknown_24h)} unavailable
          </span>
        </div>
      </div>
      <div className="ov-chart">
        <div className="ov-chart-reading" aria-live="polite">
          {current ? (
            <>
              <b>{utc(new Date(current.time).toISOString())} UTC</b>
              <span>
                {fmt(current.txs)} transactions · {fmt(current.failed ?? 0)}{" "}
                failed · {fmt(current.unknown ?? 0)} unavailable
              </span>
            </>
          ) : (
            <>
              <span>Transactions per hour · UTC</span>
              <span>Hover or focus a bar</span>
            </>
          )}
        </div>
        <svg
          viewBox="0 0 710 180"
          role="img"
          aria-label="Hourly intelligent-contract transactions over the past 24 hours"
        >
          <text x="0" y="21">
            {fmt(max)}
          </text>
          <text x="8" y="155">
            0
          </text>
          {[20, 85, 150].map((y) => (
            <line key={y} x1="32" x2="705" y1={y} y2={y} />
          ))}
          {points.map((p, i) => {
            const x = 40 + i * step,
              scale = 130 / max,
              w = step - 5,
              r = (p.returned ?? 0) * scale,
              f = (p.failed ?? 0) * scale,
              u = (p.unknown ?? 0) * scale;
            return (
              <g
                key={p.time}
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${new Date(p.time).toISOString()}: ${p.txs} transactions, ${p.failed ?? 0} failed, ${p.unknown ?? 0} unavailable`}
                onMouseEnter={() => setSelected(i)}
                onMouseLeave={() => setSelected(null)}
                onFocus={() => setSelected(i)}
                onBlur={() => setSelected(null)}
              >
                <rect
                  x={x - 2}
                  y={16}
                  width={step}
                  height={138}
                  fill="transparent"
                />
                <rect
                  x={x}
                  y={150 - r}
                  width={w}
                  height={r}
                  className="ov-bar-returned"
                />
                <rect
                  x={x}
                  y={150 - r - f}
                  width={w}
                  height={f}
                  className="ov-bar-failed"
                />
                <rect
                  x={x}
                  y={150 - r - f - u}
                  width={w}
                  height={u}
                  className="ov-bar-unknown"
                />
                {p.txs === 0 && (
                  <rect
                    x={x}
                    y={149}
                    width={w}
                    height="1"
                    className="ov-bar-empty"
                  />
                )}
                <title>
                  {new Date(p.time).toISOString()} · {p.txs} transactions
                </title>
              </g>
            );
          })}
        </svg>
        <div className="ov-chart-axis">
          <span>{utc(series.since)} yesterday</span>
          <span>
            {utc(
              new Date(
                (Date.parse(series.since) + Date.parse(series.until)) / 2,
              ).toISOString(),
            )}
          </span>
          <span>{utc(series.until)} today</span>
        </div>
      </div>
      <p className="ov-note">
        Execution results for the same 24-hour window as the cards above.
        Unavailable outcomes are counted separately.
      </p>
    </>
  );
}
function RecentTransactions({ rows }: { rows: NativeTransaction[] }) {
  return rows.length ? (
    <div className="ov-table-scroll">
      <table className="ov-transactions">
        <thead>
          <tr>
            <th>Contract</th>
            <th>Method / transaction</th>
            <th>Execution</th>
            <th>Consensus</th>
            <th>Submitted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="ov-cell-contract">
                <a title={t.recipient} href={contractRoute(t.recipient)}>
                  {t.contract_name ?? short(t.recipient)}
                </a>
                {t.contract_name && <small>{short(t.recipient)}</small>}
              </td>
              <td className="ov-cell-method">
                <a href={consensusRoute(t.id)} title={t.id}>
                  {t.method ??
                    (t.kind === "deploy"
                      ? "Deploy contract"
                      : "View transaction")}{" "}
                  ↗
                </a>
                <small>{short(t.id)}</small>
              </td>
              <td className="ov-cell-outcome">
                <Outcome value={t.execution_result} />
              </td>
              <td className="ov-cell-decision">
                <span>{statusLabel(t.status)}</span>
              </td>
              <td className="ov-cell-time">
                <Timestamp value={t.created_at ?? t.observed_at} />
                {!t.created_at && <small>First observed</small>}
                {t.confirmation === "provisional" && (
                  <small
                    className="ov-provisional"
                    title="The submission block is not finalized yet. This is separate from its consensus decision."
                  >
                    Block unfinalized
                  </small>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty>No contract transactions have been indexed yet.</Empty>
  );
}

export function Overview({
  d,
  live,
}: {
  d: Dashboard;
  live: boolean;
  copied?: string | null;
  onCopy?: (s: string) => void;
  selected?: number | null;
  onSelect?: (n: number) => void;
}) {
  const overview = usePolling(loadNativeOverview, live, 15000, "native-overview"),
    recent = usePolling(loadRecent, live, 10000, "overview-recent"),
    s = overview.data,
    net = d.net;
  const [query, setQuery] = useState("");
  const stale =
    !!overview.error ||
    !!s?.sync?.live_error ||
    !s?.sync?.live_updated_at ||
    Date.now() - Date.parse(s.sync.live_updated_at) > 120000;
  const feedState = !live
    ? "Updates paused"
    : overview.error && !s
      ? "Activity unavailable"
      : !s
        ? "Loading activity"
        : stale
          ? "Live feed delayed"
          : "Live feed updating";
  const chainState = !live
    ? "Updates paused"
    : d.error
      ? "Unavailable"
      : d.state === "loading"
        ? "Connecting"
        : d.state === "stopped"
          ? "Indexer delayed"
          : d.state === "normal"
            ? "Synced to RPC finalized head"
            : d.state === "empty"
              ? "Waiting for blocks"
              : "Syncing history";
  return (
    <div className="gen-overview ov-dashboard">
      <div className="ov-toolbar">
        <div className="ov-context">
          <span className="ov-window-label">PAST 24 HOURS</span>
          <span
            className={`ov-live ${!live ? "paused" : stale ? "delayed" : "ready"}`}
          >
            <i />
            {feedState}
          </span>
        </div>
        <form
          className="ov-search"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim())
              window.location.hash = `/contracts?q=${encodeURIComponent(query.trim())}`;
          }}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="8" cy="8" r="5" />
            <path d="m12 12 5 5" />
          </svg>
          <input
            aria-label="Find an intelligent contract"
            placeholder="Find a contract by name or address…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button>Search</button>
        </form>
        <button
          className="ov-refresh"
          onClick={() => {
            overview.refresh();
            recent.refresh();
            d.refresh();
          }}
        >
          Refresh
        </button>
      </div>
      <ErrorState
        message={
          overview.error ? "Contract activity could not be refreshed." : null
        }
        retry={overview.refresh}
        stale={!!s}
      />
      <div className="ov-stats">
        <Stat
          label="Contract transactions"
          value={s ? fmt(s.activity.calls_24h) : "—"}
          note="Calls and deployments · 24 h"
          href="#/consensus?days=1"
        />
        <Stat
          label="Active contracts"
          value={s ? fmt(s.activity.active_24h) : "—"}
          note={
            s
              ? `${fmt(s.contracts.intelligent)} intelligent contracts indexed`
              : "Contracts with transactions · 24 h"
          }
          href="#/contracts"
        />
        <Stat
          label="Unique callers"
          value={s ? fmt(s.activity.callers_24h) : "—"}
          note="Distinct sender addresses · 24 h"
        />
        <Stat
          label="Execution failures"
          value={s ? fmt(s.activity.failed_24h) : "—"}
          note={
            s
              ? s.activity.calls_24h
                ? `${((100 * s.activity.failed_24h) / s.activity.calls_24h).toFixed(1)}% of contract transactions`
                : "No transactions in this window"
              : "Errors, timeouts and disagreements · 24 h"
          }
          href="#/consensus?days=1&execution=failed"
          tone={s?.activity.failed_24h ? "has-failures" : ""}
        />
      </div>
      <div className="ov-grid">
        <Panel
          title="Contract activity"
          aside={<a href="#/consensus?days=1">View transactions ↗</a>}
          className="ov-activity"
        >
          {s ? (
            <ActivityChart data={s} />
          ) : (
            <Empty>
              {overview.error
                ? "Activity is unavailable."
                : "Loading contract activity…"}
            </Empty>
          )}
        </Panel>
        <Panel
          title="Network status"
          aside={<a href="#/endpoints">Network ↗</a>}
          className="ov-network"
        >
          <dl>
            <div>
              <dt>Decisions in progress</dt>
              <dd>{s ? fmt(s.activity.in_consensus) : "—"}</dd>
            </div>
            <div>
              <dt>Unfinalized submissions</dt>
              <dd>
                <a href="#/consensus?confirmation=provisional">
                  {s ? fmt(s.activity.provisional) : "—"}
                </a>
              </dd>
            </div>
            <div>
              <dt>Live discovery block</dt>
              <dd>{height(s?.sync?.live_head)}</dd>
            </div>
            <div>
              <dt>Finalized block indexed</dt>
              <dd>
                {net?.indexed_head == null ? (
                  "—"
                ) : (
                  <a href={`#/blocks/${net.indexed_head}`}>
                    {height(net.indexed_head)}
                  </a>
                )}
              </dd>
            </div>
            <div>
              <dt>Finalized block age</dt>
              <dd>
                <Timestamp value={net?.latest_block_time} />
              </dd>
            </div>
          </dl>
          <div className="ov-chain-state">
            <span
              className={
                d.state === "normal" && !d.error && live ? "ready" : ""
              }
            >
              {chainState}
            </span>
            <a href="#/blocks">Blocks ↗</a>
          </div>
          <p className="ov-note">
            A contract decision can be finalized while its submission block is
            still unfinalized.
          </p>
          <ErrorState
            message={d.error ? "Chain status could not be refreshed." : null}
            retry={d.refresh}
            stale={!!net}
          />
        </Panel>
      </div>
      <div className="ov-grid ov-lists">
        <Panel
          title="Recent contract transactions"
          aside={<a href="#/consensus">View all ↗</a>}
          className="ov-recent"
        >
          <ErrorState
            message={
              recent.error
                ? "Recent transactions could not be refreshed."
                : null
            }
            retry={recent.refresh}
            stale={!!recent.data}
          />
          {recent.data ? (
            <RecentTransactions rows={recent.data.transactions} />
          ) : (
            <Empty>
              {recent.error
                ? "Transactions are unavailable."
                : "Loading recent transactions…"}
            </Empty>
          )}
          <p className="ov-note">
            Execution describes the result. Consensus describes the decision's
            progress.
          </p>
        </Panel>
        <Panel
          title="Most active contracts"
          aside={<span>24 hours</span>}
          className="ov-contracts"
        >
          <ol>
            {s?.top_contracts.map((c, i) => (
              <li key={c.address}>
                <span className="ov-rank">{i + 1}</span>
                <div>
                  <a href={contractRoute(c.address)} title={c.address}>
                    {c.name ?? short(c.address)}
                  </a>
                  <small>
                    {fmt(c.callers_24h)}{" "}
                    {c.callers_24h === 1 ? "caller" : "callers"}
                  </small>
                </div>
                <strong>
                  {fmt(c.calls_24h)}
                  <small>txns</small>
                </strong>
              </li>
            ))}
          </ol>
          {s && !s.top_contracts.length && (
            <Empty>No contract activity in this window.</Empty>
          )}
          {!s && (
            <Empty>
              {overview.error
                ? "Contract ranking is unavailable."
                : "Loading contracts…"}
            </Empty>
          )}
          <a className="ov-panel-link" href="#/contracts">
            Browse all contracts ↗
          </a>
        </Panel>
      </div>
      {s && s.activity.failed_24h > 0 && (
        <div className="ov-review">
          <span className="ov-review-icon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>
              {fmt(s.activity.failed_24h)} contract executions need a closer
              look
            </strong>
            <span>
              Inspect errors, validator rounds, and retained outputs from the
              past 24 hours.
            </span>
          </div>
          <a href="#/consensus?days=1&execution=failed">Review failures ↗</a>
        </div>
      )}
      <details className="ov-coverage">
        <summary>
          Data coverage & chain details{" "}
          <span>
            {overview.updatedAt ? (
              <>
                Updated <Timestamp value={overview.updatedAt.toISOString()} />
              </>
            ) : (
              "Waiting for data"
            )}
          </span>
        </summary>
        <div className="ov-coverage-grid">
          <div>
            <h3>Contract activity</h3>
            <p>
              The 24-hour cards and chart count the same indexed native
              transactions, including provisional submissions. Orphaned
              submissions and transactions without a receipt timestamp are
              excluded from this window.
            </p>
            <p>
              History starts at {height(s?.sync?.start_block)}. Finalized
              submissions indexed through {height(s?.sync?.head)}.{" "}
              {s?.activity.unresolved
                ? `${fmt(s.activity.unresolved)} receipts awaiting enrichment.`
                : ""}{" "}
              Live discovery scans up to 1,000 recent unfinalized blocks.
            </p>
            {s?.sync?.last_error && <p>{s.sync.last_error}</p>}
          </div>
          <div>
            <h3>Underlying chain</h3>
            <p>
              EVM activity includes protocol transactions and is a separate
              measure from intelligent-contract execution.
            </p>
            <dl>
              <div>
                <dt>EVM transactions · 24 h</dt>
                <dd>{fmt(net?.txs_24h)}</dd>
              </div>
              <div>
                <dt>RPC finalized block</dt>
                <dd>{height(net?.chain_finalized)}</dd>
              </div>
              <div>
                <dt>Indexer lag · blocks</dt>
                <dd>{fmt(net?.lag_blocks)}</dd>
              </div>
              <div>
                <dt>GenVM block</dt>
                <dd>{height(s?.genvm?.synced_block)}</dd>
              </div>
            </dl>
            <a href="#/transactions">Explore EVM transactions ↗</a>
          </div>
        </div>
      </details>
    </div>
  );
}
