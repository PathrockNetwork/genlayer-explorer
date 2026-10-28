import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { get } from "../api";
import { usePolling } from "../usePolling";
import { pollingKey } from "../pollingCache";
import { fmt, gen, short, duration } from "../lib";
import {
  consensusRoute,
  contractRoute,
  voteLabel,
  resultLabel,
} from "../genlayer";
import { Timestamp } from "../components/Timestamp";
import { sourceDiff, type DiffLine } from "../sourceDiff";
import "./observatory.css";

function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
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
function Empty({ children }: { children: ReactNode }) {
  return <div className="int-empty">{children}</div>;
}
function ErrorState({
  message,
  retry,
}: {
  message: string | null;
  retry: () => void;
}) {
  return message ? (
    <div className="int-notice" role="status">
      {message}
      <button onClick={retry}>Retry</button>
    </div>
  ) : null;
}
function Window({
  days,
  setDays,
}: {
  days: string;
  setDays: (x: string) => void;
}) {
  return (
    <div className="obs-window" aria-label="Time window">
      {["1", "7", "30"].map((x) => (
        <button key={x} aria-pressed={x === days} onClick={() => setDays(x)}>
          {x === "1" ? "24 h" : `${x} days`}
        </button>
      ))}
    </div>
  );
}
function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note: ReactNode;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function Fee({ value }: { value: string | null }) {
  return (
    <span
      title={value == null ? "Fee unavailable" : `${value} wei`}
      className="obs-fee"
    >
      <img src="/brand/gen-token.svg" alt="" />
      {gen(value, 6)}
    </span>
  );
}
export function Outcome({ value }: { value?: string }) {
  const v = value ?? "unknown";
  return (
    <span
      className={`int-status ${v === "returned" ? "success" : v === "unknown" ? "neutral" : "failed"}`}
    >
      {(
        {
          returned: "Returned",
          unknown: "Unavailable",
          error: "Execution error",
          timeout: "Timeout",
          disagreement: "Disagreement",
          violation: "Violation",
        } as Record<string, string>
      )[v] ?? v}
    </span>
  );
}
export function Confirmation({ value }: { value?: string }) {
  return (
    <span
      className={`int-status ${value === "provisional" ? "pending" : value === "orphaned" ? "failed" : "neutral"}`}
    >
      {value === "confirmed"
        ? "Confirmed submission"
        : value === "provisional"
          ? "Provisional"
          : value === "orphaned"
            ? "Orphaned submission"
            : "Not indexed"}
    </span>
  );
}

function Trend({
  rows,
  field,
  label,
  fee = false,
}: {
  rows: any[];
  field: string;
  label: string;
  fee?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const values = rows.map((r) => Number(r[field] ?? 0)),
    max = Math.max(1, ...values),
    selected = hover == null ? null : rows[hover];
  return (
    <div className="obs-trend">
      <div className="obs-chart-readout">
        <span>{label} · UTC</span>
        <strong>
          {selected
            ? `${new Date(selected.time).toISOString().slice(0,16).replace('T',' ')+' UTC'} · ${fee ? gen(selected[field], 8) : fmt(Number(selected[field]))}`
            : "Focus or hover a bar for details"}
        </strong>
      </div>
      {rows.length ? (
        <>
          <svg viewBox="0 0 720 150" role="img" aria-label={label}>
            <line x1="0" y1="139" x2="720" y2="139" stroke="var(--line)" />
            {rows.map((r, i) => {
              const w = 720 / rows.length,
                h = (values[i] / max) * 120;
              return (
                <rect
                  key={r.time}
                  x={i * w + 3}
                  y={139 - h}
                  width={Math.max(1, w - 6)}
                  height={Math.max(2, h)}
                  fill="var(--chart)"
                  opacity={hover === i ? 1 : 0.75}
                  tabIndex={0}
                  role="graphics-symbol"
                  aria-label={`${r.time}: ${fee ? gen(r[field], 8) : fmt(values[i])}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                >
                  <title>
                    {r.time}: {fee ? gen(r[field], 8) : fmt(values[i])}
                  </title>
                </rect>
              );
            })}
          </svg>
          <div className="obs-axis">
            <span>{new Date(rows[0].time).toISOString().slice(0,10)}</span>
            <span>
              {new Date(rows[rows.length - 1].time).toISOString().slice(0,10)}
            </span>
          </div>
          <details className="obs-chart-data">
            <summary>View chart data</summary>
            <div className="int-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Bucket · UTC</th>
                    <th>{label}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.time}>
                      <td>{r.time}</td>
                      <td>
                        {fee ? <Fee value={r[field]} /> : fmt(Number(r[field]))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <Empty>No dated observations in this window.</Empty>
      )}
    </div>
  );
}
export function ContractHealth({
  address,
  live,
}: {
  address: string;
  live: boolean;
}) {
  const [days, setDays] = useState("7"),
    [metric, setMetric] = useState("transactions");
  const load = useCallback(
    () => get<any>(`/api/v1/contracts/${address}/analytics?days=${days}`),
    [address, days],
  );
  const s = usePolling(load, live, 30000, pollingKey("health", address, days)),
    d = s.data,
    m = d?.summary,
    known = m ? m.returned + m.failed : 0;
  return (
    <div className="int-page">
      <div className="int-section-heading">
        <div>
          <h2>Contract health & cost</h2>
          <p>Execution outcomes from confirmed submission history.</p>
        </div>
        <Window days={days} setDays={setDays} />
      </div>
      <ErrorState message={s.error} retry={s.refresh} />
      {!d && !s.error && <Empty>Loading contract analytics…</Empty>}
      {d && (
        <>
          <div className="int-metrics">
            <Stat
              label="Returned without execution error"
              value={
                known ? `${((m.returned / known) * 100).toFixed(1)}%` : "—"
              }
              note={`${fmt(m.returned)} returned / ${fmt(known)} known outcomes · ${fmt(m.unknown)} unavailable`}
            />
            <Stat
              label="Execution failures"
              value={
                <a href={`#/consensus?address=${address}&execution=failed`}>
                  {fmt(m.failed)}
                </a>
              }
              note={`${fmt(m.transactions)} transactions · ${fmt(m.canceled)} canceled by consensus`}
            />
            <Stat
              label="Distinct callers"
              value={fmt(m.callers)}
              note={`${fmt(m.multiple_rounds)} transactions with multiple rounds`}
            />
            <Stat
              label="Median execution fee"
              value={<Fee value={m.median_execution_cost} />}
              note={`${fmt(m.fee_samples)} receipts with execution fees`}
            />
          </div>
          <Panel title="Execution failure breakdown">
            <div className="obs-breakdown">
              {[
                ["Execution errors", m.errors],
                ["Timeouts", m.timeouts],
                ["Disagreements", m.disagreements],
                ["Deterministic violations", m.violations],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{fmt(value)}</strong>
                </div>
              ))}
            </div>
          </Panel>
          <Panel
            title="Activity & fee trends"
            aside={
              <select
                aria-label="Chart metric"
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
              >
                <option value="transactions">Transactions</option>
                <option value="failed">Execution failures</option>
                <option value="callers">Distinct callers</option>
                <option value="execution_cost">Execution fees</option>
              </select>
            }
          >
            <Trend
              rows={d.series}
              field={metric}
              label={
                (
                  {
                    transactions: "Transactions",
                    failed: "Execution failures",
                    callers: "Distinct callers",
                    execution_cost: "Consumed execution fees",
                  } as any
                )[metric]
              }
              fee={metric === "execution_cost"}
            />
          </Panel>
          <div className="int-two">
            <Panel title="Consumed protocol fees">
              <dl className="int-facts">
                {[
                  ["Execution", m.execution_cost],
                  ["Storage", m.storage_cost],
                  ["Messages", m.message_cost],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>
                      <Fee value={v} />
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="int-footnote">
                Consumed fees in GEN. Empty chart buckets mean no indexed
                observations; missing fees are unavailable. Deposits are
                execution budgets and are excluded.
              </p>
            </Panel>
            <Panel title="Time to last recorded vote">
              <dl className="int-facts">
                <div>
                  <dt>Median</dt>
                  <dd>{duration(m.p50_vote_seconds)}</dd>
                </div>
                <div>
                  <dt>95th percentile</dt>
                  <dd>{duration(m.p95_vote_seconds)}</dd>
                </div>
                <div>
                  <dt>Samples</dt>
                  <dd>{fmt(m.timing_samples)}</dd>
                </div>
              </dl>
              <p className="int-footnote">
                Creation → last recorded vote. This does not measure consensus
                finality.
              </p>
            </Panel>
          </div>
          <Panel title="Method analytics" aside={<span>Up to 50 methods</span>}>
            <div className="int-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Calls</th>
                    <th>Callers</th>
                    <th>Returned</th>
                    <th>Failed</th>
                    <th>Unavailable</th>
                    <th>Median execution fee</th>
                    <th>Median to last vote</th>
                  </tr>
                </thead>
                <tbody>
                  {d.methods.map((r: any) => (
                    <tr key={r.method}>
                      <td>
                        <code>{r.method}</code>
                      </td>
                      <td>{fmt(r.transactions)}</td>
                      <td>{fmt(r.callers)}</td>
                      <td>{fmt(r.returned)}</td>
                      <td>{fmt(r.failed)}</td>
                      <td>{fmt(r.unknown)}</td>
                      <td>
                        <Fee value={r.median_execution_cost} />
                      </td>
                      <td>{duration(r.p50_vote_seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!d.methods.length && (
              <Empty>No methods observed in this window.</Empty>
            )}
          </Panel>
          <p className="int-coverage">
            Available dated history starts{" "}
            <Timestamp value={d.coverage.earliest} />. {fmt(d.coverage.undated)}{" "}
            undated receipts and {fmt(d.coverage.provisional)} provisional
            submissions are outside these analytics. {d.scope}
          </p>
        </>
      )}
    </div>
  );
}
export function ContractProfile({
  address,
  live,
}: {
  address: string;
  live: boolean;
}) {
  const load = useCallback(
    () => get<any>(`/api/v1/contracts/${address}/profile`),
    [address],
  );
  const s = usePolling(load, live, 60000, pollingKey("profile", address)),
    d = s.data,
    p = d?.contract?.profile;
  return (
    <Panel
      title="Contract profile"
      aside={<span>Derived from observed source</span>}
    >
      <ErrorState message={s.error} retry={s.refresh} />
      {p ? (
        <div className="obs-profile">
          <h3>{p.name ?? "Unnamed contract"}</h3>
          <p>{p.description}</p>
          <div className="obs-tags">
            {p.tags.map((t: string) => (
              <span key={t}>{t} references</span>
            ))}
          </div>
          <small>
            Description: {p.description_origin}. Names and capabilities are
            inferred, not verified project identities or security assessments.
          </small>
          <details>
            <summary>{p.methods.length} declared public methods</summary>
            <div className="obs-tags">
              {p.methods.map((m: any, i: number) => (
                <code key={i}>
                  {m.name} · {m.readonly ? "read" : "write"}
                </code>
              ))}
            </div>
          </details>
        </div>
      ) : (
        <Empty>
          {d
            ? "Source profile is not available yet. Code can still be inspected in the Code tab."
            : "Loading source profile…"}
        </Empty>
      )}
      {d?.related.length > 0 && (
        <>
          <p className="int-footnote">Related deployments</p>
          <div className="obs-related">
            {d.related.map((r: any) => (
              <a key={r.address} href={contractRoute(r.address)}>
                <strong>{r.name ?? short(r.address)}</strong>
                <span>
                  {short(r.address)} · {r.relation}
                </span>
              </a>
            ))}
          </div>
        </>
      )}
      <p className="int-footnote">
        Source snapshots are collected from finalized contract state. Project
        ownership and affiliation are not inferred from similar code.
      </p>
    </Panel>
  );
}
export function SourceHistory({
  address,
  live,
}: {
  address: string;
  live: boolean;
}) {
  const load = useCallback(
    () => get<any>(`/api/v1/contracts/${address}/profile`),
    [address],
  );
  const s = usePolling(load, live, 60000, pollingKey("profile", address)),
    d = s.data;
  const [before, setBefore] = useState(""),
    [after, setAfter] = useState(""),
    [diff, setDiff] = useState<DiffLine[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const choices = useMemo(
    () =>
      d
        ? [
            ...d.versions.map((v: any) => ({
              key: `${address}/${v.sha256}`,
              label: `This contract · ${new Date(v.first_observed_at).toLocaleString()} · ${v.sha256.slice(0, 8)}`,
            })),
            ...d.related
              .filter((r: any) => r.source_hash)
              .map((r: any) => ({
                key: `${r.address}/${r.source_hash}`,
                label: `${r.name ?? "Related deployment"} · ${short(r.address)} · ${r.source_hash.slice(0, 8)}`,
              })),
          ]
        : [],
    [d, address],
  );
  useEffect(() => {
    if (!before && choices.length) setBefore(choices[0].key);
    if (!after && choices.length > 1) setAfter(choices[1].key);
  }, [choices, before, after]);
  return (
    <Panel title="Observed source versions & comparison">
      <ErrorState message={s.error} retry={s.refresh} />
      <p className="int-footnote">
        Compare snapshots of this contract or related deployments. Observation
        dates describe when this explorer fetched the code, not the exact time
        of an upgrade.
      </p>
      {d && (
        <>
          <div className="int-scroll">
            <table>
              <thead>
                <tr>
                  <th>Source SHA-256</th>
                  <th>First observed</th>
                  <th>Last observed</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {d.versions.map((v: any) => (
                  <tr key={v.sha256}>
                    <td title={v.sha256}>
                      <code>{v.sha256.slice(0, 16)}…</code>
                    </td>
                    <td>
                      <Timestamp value={v.first_observed_at} />
                    </td>
                    <td>
                      <Timestamp value={v.last_observed_at} />
                    </td>
                    <td>{fmt(v.bytes)} bytes</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!d.versions.length && (
            <Empty>No finalized source snapshots collected yet.</Empty>
          )}
          {choices.length > 1 ? (
            <>
              <div className="int-toolbar">
                <label>
                  Before
                  <select
                    aria-label="Before source"
                    value={before}
                    onChange={(e) => {
                      setBefore(e.target.value);
                      setDiff(null);
                    }}
                  >
                    {choices.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  After
                  <select
                    aria-label="After source"
                    value={after}
                    onChange={(e) => {
                      setAfter(e.target.value);
                      setDiff(null);
                    }}
                  >
                    {choices.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={busy || !before || !after || before === after}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    setDiff(null);
                    try {
                      const fetchSource = (key: string) => {
                        const [addr, hash] = key.split("/");
                        return get<any>(
                          `/api/v1/contracts/${addr}/sources/${hash}`,
                        );
                      };
                      const [a, b] = await Promise.all([
                        fetchSource(before),
                        fetchSource(after),
                      ]);
                      setDiff(sourceDiff(a.source, b.source));
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Comparing…" : "Compare source"}
                </button>
              </div>
              {error && <div className="int-notice">{error}</div>}
              {diff && (
                <>
                  <p className="int-footnote">
                    {diff.filter((x) => x.kind === "added").length} added lines
                    · {diff.filter((x) => x.kind === "removed").length} removed
                    lines.{" "}
                    {diff.every((x) => x.kind === "same")
                      ? "The observed source is identical."
                      : ""}
                  </p>
                  <div
                    className="obs-diff"
                    role="region"
                    aria-label="Source comparison"
                    tabIndex={0}
                  >
                    {diff.map((x, i) => (
                      <div key={i} className={x.kind}>
                        <span>{x.before ?? ""}</span>
                        <span>{x.after ?? ""}</span>
                        <code>
                          {x.kind === "added"
                            ? "+"
                            : x.kind === "removed"
                              ? "−"
                              : " "}{" "}
                          {x.text}
                        </code>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            d.versions.length > 0 && (
              <Empty>
                This is the first observed snapshot. Comparison becomes
                available when another version or related source is collected.
              </Empty>
            )
          )}
        </>
      )}
    </Panel>
  );
}
export function TransactionExplanation({
  id,
  receipt,
  confirmation,
  live,
}: {
  id: string;
  receipt: any;
  confirmation?: string;
  live: boolean;
}) {
  const load = useCallback(
    () => get<any>(`/api/v1/genlayer/transactions/${id}/explanation`),
    [id],
  );
  const s = usePolling(load, live, 30000, pollingKey("explanation", id)),
    d = s.data;
  const outcome =
    ["unknown", "returned", "error", "timeout", "disagreement", "violation"][
      Number(receipt.txExecutionResult)
    ] ?? "unknown";
  const summaries: Record<string, string> = {
    returned: "The leader execution returned without an execution error.",
    error: "The leader execution ended with a contract error.",
    timeout: "The leader execution exceeded its allowed time.",
    disagreement: "Execution reported a nondeterministic disagreement.",
    violation: "Execution reported a deterministic violation.",
    unknown: "No classified execution outcome is available in this receipt.",
  };
  return (
    <Panel title="What happened">
      <div className="obs-explanation">
        <div className="obs-tags">
          <Outcome value={outcome} />
          <span>Consensus: {receipt.statusName}</span>
          <Confirmation value={confirmation} />
        </div>
        <p>{summaries[outcome]}</p>
        <small>
          Finalized consensus can settle an execution failure. A returned value
          alone does not establish the application's business outcome.
        </small>
      </div>
      <ErrorState message={s.error} retry={s.refresh} />
      {d && (
        <>
          <details className="obs-details">
            <summary>Current lifecycle evidence</summary>
            {d.lifecycle.available ? (
              <dl className="int-facts">
                {[
                  "storedStatus",
                  "projectedStatus",
                  "resolutionAction",
                  "resolutionSource",
                  "executionGeneration",
                  "decisionActive",
                ].map((k) => (
                  <div key={k}>
                    <dt>
                      {
                        (
                          {
                            storedStatus: "Stored state",
                            projectedStatus: "Projected state",
                            resolutionAction: "Resolution action",
                            resolutionSource: "Resolution source",
                            executionGeneration: "Execution generation",
                            decisionActive: "Decision active",
                          } as any
                        )[k]
                      }
                    </dt>
                    <dd>{String(d.lifecycle.data?.[k] ?? "Unavailable")}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="int-footnote">
                Lifecycle evidence is unavailable from this node.
              </p>
            )}
            <p className="int-footnote">
              Projected state is the node's evaluation, not proof that a
              transition has been committed. The receipt above remains the
              execution evidence.
            </p>
          </details>
          <details className="obs-details">
            <summary>Observed status changes ({d.observations.length})</summary>
            {d.observations.length ? (
              <ol className="int-timeline">
                {d.observations.map((x: any, i: number) => (
                  <li key={i}>
                    <i />
                    <div>
                      <b>
                        {x.status} · {x.execution_result}
                      </b>
                      <span>
                        <Timestamp value={x.observed_at} />
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>
                No state changes have been observed since history collection
                started.
              </Empty>
            )}
            <p className="int-footnote">
              Observation times are when this explorer saw a change. Earlier
              transitions cannot be reconstructed from the latest receipt alone.
            </p>
          </details>
        </>
      )}
    </Panel>
  );
}
function RoundOutput({ id, round }: { id: string; round: number }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setData(
              await get(
                `/api/v1/genlayer/transactions/${id}/result?round=${round}`,
              ),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Loading…" : "Load retained round output"}
      </button>
      {error && <p>{error}</p>}
      {data &&
        (data.returnData == null ? (
          <p>No output retained by this node for this round.</p>
        ) : (
          <pre className="int-json">
            {JSON.stringify(data.decoded_return ?? data.returnData, null, 2)}
          </pre>
        ))}
    </>
  );
}
export function RoundComparison({ id, rounds }: { id: string; rounds: any[] }) {
  const [a, setA] = useState(0),
    [b, setB] = useState(1);
  if (rounds.length < 2) return null;
  const left = rounds[a] ?? rounds[0],
    right = rounds[b] ?? rounds[1];
  return (
    <Panel title="Compare validator rounds">
      <div className="int-toolbar">
        {[
          ["First round", a, setA],
          ["Second round", b, setB],
        ].map(([label, value, set]: any) => (
          <label key={label}>
            {label}
            <select
              aria-label={label}
              value={value}
              onChange={(e) => set(Number(e.target.value))}
            >
              {rounds.map((r, i) => (
                <option key={r.round} value={i}>
                  Round {r.round}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="obs-round-grid">
        {[left, right].map((r, i) => (
          <div className="obs-round" key={i}>
            <h3>Round {r.round}</h3>
            <p>{resultLabel(Number(r.result))}</p>
            <p>
              {r.votesRevealed}/{r.validators.length} votes revealed
            </p>
            {r.validators.map((v: any, j: number) => (
              <div className="obs-vote" key={`${v.address}-${j}`}>
                <a href={`#/validators/${v.address}`}>{short(v.address)}</a>
                <span>
                  {v.leader ? "Leader · " : ""}
                  {voteLabel(v.vote)}
                </span>
                <code title={v.result_hash ?? ""}>
                  {v.result_hash ? short(v.result_hash) : "No result hash"}
                </code>
              </div>
            ))}
            <RoundOutput
              key={`${id}-${r.round}`}
              id={id}
              round={Number(r.round)}
            />
          </div>
        ))}
      </div>
      <p className="int-footnote">
        Compare the recorded votes, leader, and result hashes. Different hashes
        do not by themselves establish semantic disagreement. Unretained traces
        cannot reveal the model's reasoning.
      </p>
    </Panel>
  );
}
export function Validators({ live }: { live: boolean }) {
  const read = () =>
    window.location.hash.replace(/^#\/validators\/?/, "").split("?")[0];
  const [addr, setAddr] = useState(read);
  useEffect(() => {
    const f = () => setAddr(read());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return <ValidatorView key={addr} address={addr} live={live} />;
}
function ValidatorView({ address, live }: { address: string; live: boolean }) {
  const [days, setDays] = useState("7"),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0);
  const load = useCallback(
    () =>
      get<any>(
        `/api/v1/genlayer/validators${address ? `/${encodeURIComponent(address)}` : ""}?${new URLSearchParams({ days, q: search, offset: String(page * 25) })}`,
      ),
    [address, days, search, page],
  );
  const s = usePolling(load, live, 30000, pollingKey("validators", address, days, search, page)),
    d = s.data,
    total = address ? d?.summary.assignments : d?.total;
  return (
    <div className="int-page">
      {address && (
        <a href="#/validators" className="int-back">
          ← Validator activity
        </a>
      )}
      <div className="int-section-heading">
        <div>
          <span className="int-eyebrow">OBSERVED CONSENSUS PARTICIPATION</span>
          <h2>{address ? "Validator history" : "Validator activity"}</h2>
          {address && <p className="int-full-address">{address}</p>}
        </div>
        <Window
          days={days}
          setDays={(x) => {
            setDays(x);
            setPage(0);
          }}
        />
      </div>
      <p className="int-coverage">
        Round assignments and execution votes from confirmed submissions. These
        observations do not measure accuracy, uptime, stake, or the full
        validator set.
      </p>
      <ErrorState message={s.error} retry={s.refresh} />
      {d && (
        <>
          {address && (
            <>
              <div className="int-metrics">
                <Stat
                  label="Observed assignments"
                  value={fmt(d.summary.assignments)}
                  note={`${fmt(d.summary.transactions)} transactions`}
                />
                <Stat
                  label="Recorded votes"
                  value={fmt(d.summary.recorded_votes)}
                  note={`${fmt(d.summary.not_voted)} not voted · ${fmt(d.summary.unavailable)} unavailable`}
                />
                <Stat
                  label="Leader assignments"
                  value={fmt(d.summary.leaderships)}
                  note="Observed roles in receipt rounds"
                />
                <Stat
                  label="Timeout votes"
                  value={fmt(d.summary.timeouts)}
                  note={`${fmt(d.summary.errors)} execution-error votes · ${fmt(d.summary.disagreements)} disagreement votes`}
                />
              </div>
              <Panel title="Assignment history">
                <Trend
                  rows={d.series}
                  field="assignments"
                  label="Round assignments"
                />
              </Panel>
            </>
          )}
          <Panel
            title={
              address ? "Observed rounds" : "Validators in indexed receipts"
            }
          >
            {!address && (
              <form
                className="int-toolbar"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSearch(query.trim());
                  setPage(0);
                }}
              >
                <input
                  aria-label="Validator address"
                  value={query}
                  placeholder="Search validator address…"
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button>Search</button>
              </form>
            )}
            <div className="int-scroll">
              <table>
                <thead>
                  <tr>
                    {(address
                      ? [
                          "Transaction / method",
                          "Round",
                          "Role",
                          "Execution vote",
                          "Result hash",
                          "Submitted",
                        ]
                      : [
                          "Validator",
                          "Assignments",
                          "Transactions",
                          "Leader roles",
                          "Recorded votes",
                          "Timeout votes",
                          "Last activity",
                        ]
                    ).map((x) => (
                      <th key={x}>{x}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {address
                    ? d.history.map((r: any) => (
                        <tr key={`${r.tx_id}-${r.round}-${r.position}`}>
                          <td>
                            <a href={consensusRoute(r.tx_id)}>
                              {short(r.tx_id)}
                            </a>
                            <small>{r.method ?? "Unknown method"}</small>
                          </td>
                          <td>{r.round}</td>
                          <td>{r.leader ? "Leader" : "Validator"}</td>
                          <td>{voteLabel(r.vote)}</td>
                          <td title={r.result_hash ?? ""}>
                            {short(r.result_hash)}
                          </td>
                          <td>
                            <Timestamp value={r.created_at} />
                          </td>
                        </tr>
                      ))
                    : d.validators.map((r: any) => (
                        <tr key={r.address}>
                          <td>
                            <a href={`#/validators/${r.address}`}>
                              {short(r.address)}
                            </a>
                          </td>
                          <td>{fmt(r.assignments)}</td>
                          <td>{fmt(r.transactions)}</td>
                          <td>{fmt(r.leaderships)}</td>
                          <td>
                            {fmt(r.recorded_votes)}
                            <small>
                              {fmt(r.not_voted)} not voted ·{" "}
                              {fmt(r.unavailable)} unavailable
                            </small>
                          </td>
                          <td>{fmt(r.timeouts)}</td>
                          <td>
                            <Timestamp value={r.last_activity} />
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            {!total && (
              <Empty>No observed assignments match this window.</Empty>
            )}
            <div className="int-pager">
              <span>
                {fmt(total)} results · Page {page + 1}
              </span>
              <button disabled={!page} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <button
                disabled={(page + 1) * 25 >= total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </Panel>
          <p className="int-coverage">
            History coverage: {fmt(d.coverage.analyzed)} analyzed /{" "}
            {fmt(d.coverage.receipts)} available receipts. Earliest dated
            receipt: <Timestamp value={d.coverage.earliest} />. Multiple rounds
            can assign a validator more than once to a transaction.
          </p>
        </>
      )}
      {!d && !s.error && <Empty>Loading validator history…</Empty>}
    </div>
  );
}
