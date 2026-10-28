import { useCallback, useEffect, useState, type ReactNode } from "react";
import { get, getTransactions } from "../api";
import { usePolling } from "../usePolling";
import { fmt, gen, short } from "../lib";
import { Timestamp } from "../components/Timestamp";
import { addressRoute, txRoute } from "../transactionExplorer";
import {
  contractRoute,
  consensusRoute,
  loadNativeOverview,
  getNativeTransactions,
  statusTone,
  statusLabel,
  resultLabel,
  voteLabel,
  type Contract,
  type NativeTransaction,
} from "../genlayer";
import "./intelligence.css";
import {
  ContractHealth,
  ContractProfile,
  SourceHistory,
  TransactionExplanation,
  RoundComparison,
  Outcome,
  Confirmation,
} from "./Observatory";

function useDetail(prefix: string) {
  const read = () =>
    window.location.hash
      .replace(new RegExp(`^#/${prefix}/?`), "")
      .split("?")[0];
  const [id, setId] = useState(read);
  useEffect(() => {
    const f = () => setId(read());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, [prefix]);
  return id;
}
export function Notice({
  children,
  retry,
}: {
  children: ReactNode;
  retry?: () => void;
}) {
  return (
    <div className="int-notice" role="status">
      {children}
      {retry && <button onClick={retry}>Retry</button>}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`int-status ${statusTone(value)}`}>
      {statusLabel(value)}
    </span>
  );
}
function Address({
  value,
  contract = false,
}: {
  value?: string | null;
  contract?: boolean;
}) {
  return value ? (
    <a
      className="int-address"
      title={value}
      href={contract ? contractRoute(value) : addressRoute(value)}
    >
      {short(value)}
    </a>
  ) : (
    <span>—</span>
  );
}
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
function Json({ value }: { value: unknown }) {
  return <pre className="int-json">{JSON.stringify(value, null, 2)}</pre>;
}
function Pager({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (n: number) => void;
}) {
  return (
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
  );
}
export function NativeTable({ rows }: { rows: NativeTransaction[] }) {
  return rows.length ? (
    <div className="int-scroll">
      <table>
        <thead>
          <tr>
            <th>Consensus ID</th>
            <th>Contract / method</th>
            <th>Execution</th>
            <th>Consensus / submission</th>
            <th>Rounds</th>
            <th>Submitted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>
                <a href={consensusRoute(t.id)} title={t.id}>
                  {short(t.id)}
                </a>
                <small>
                  {t.kind === "deploy" ? "Deployment" : "Contract call"}
                </small>
              </td>
              <td>
                {t.contract_name && (
                  <a className="obs-name" href={contractRoute(t.recipient)}>
                    {t.contract_name}
                  </a>
                )}
                <small>
                  <Address value={t.recipient} contract />
                </small>
                <small>{t.method ?? "Method unavailable"}</small>
              </td>
              <td>
                <Outcome value={t.execution_result} />
              </td>
              <td>
                <Status value={t.status} />
                <small>
                  <Confirmation value={t.confirmation} />
                </small>
              </td>
              <td>{t.rounds ?? "—"}</td>
              <td>
                <Timestamp value={t.created_at ?? t.observed_at} />
                {!t.created_at && <small>First observed</small>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="int-empty">
      No matching intelligent-contract transactions in the indexed history.
    </div>
  );
}
export function NativeSummary({
  live,
  compact = false,
}: {
  live: boolean;
  compact?: boolean;
}) {
  const state = usePolling(loadNativeOverview, live, 15000),
    s = state.data;
  return (
    <div className="int-section">
      <div className="int-section-heading">
        <div>
          <span className="int-eyebrow">GENLAYER INTELLIGENCE</span>
          <h2>Contracts, execution & consensus</h2>
          <p>
            Follow intelligent contracts from submission to a validator-backed
            decision.
          </p>
        </div>
        {!compact && (
          <a className="int-link-button" href="#/contracts">
            Explore contracts ↗
          </a>
        )}
      </div>
      {state.error && (
        <Notice retry={state.refresh}>
          Intelligent-contract data could not be refreshed.
          {s ? " Showing previous data." : ""}
        </Notice>
      )}
      <div className="int-metrics">
        <div>
          <span>Intelligent contracts</span>
          <strong>{s ? fmt(s.contracts.intelligent) : "—"}</strong>
          <small>Discovered in indexed history</small>
        </div>
        <div>
          <span>Native transactions · 24 h</span>
          <strong>{s ? fmt(s.activity.calls_24h) : "—"}</strong>
          <small>
            {s
              ? `${fmt(s.activity.active_24h)} active contracts`
              : "Loading activity"}
          </small>
        </div>
        <div>
          <span>In consensus</span>
          <strong>{s ? fmt(s.activity.in_consensus) : "—"}</strong>
          <small>Including accepted, awaiting finality</small>
        </div>
        <div>
          <span>Execution failures · 24 h</span>
          <strong>
            <a href="#/consensus?execution=failed">
              {s ? fmt(s.activity.failed_24h) : "—"}
            </a>
          </strong>
          <small>
            {s
              ? `${fmt(s.activity.calls_24h)} native transactions in this window`
              : "Loading outcomes"}
          </small>
        </div>
      </div>
      {s && (
        <p className="int-coverage">
          {!s.sync
            ? "Native history is waiting to be indexed."
            : Number(s.sync.history_next) >= Number(s.sync.start_block)
              ? `History scan in progress · ${fmt(Number(s.sync.history_next) - Number(s.sync.start_block) + 1)} earlier blocks remaining.`
              : `Protocol history indexed from block #${fmt(Number(s.sync.start_block))}.`}{" "}
          {s.sync &&
            `Submission events indexed through #${fmt(Number(s.sync.head))}.`}{" "}
          {s.activity.unresolved > 0 &&
            `${fmt(s.activity.unresolved)} receipts awaiting enrichment.`}{" "}
          {s.sync?.last_error}
          {s.sync?.live_head &&
            ` Live feed checked through #${fmt(Number(s.sync.live_head))}; unfinalized discovery covers up to 1,000 recent blocks.`}
          {s.sync?.live_updated_at && (
            <>
              {" "}
              Updated <Timestamp value={s.sync.live_updated_at} />.
            </>
          )}
          {s.sync?.live_error ||
            (s.sync?.live_updated_at &&
            Date.now() - Date.parse(s.sync.live_updated_at) > 120000
              ? " Live discovery is delayed."
              : "")}
          {s.genvm &&
            ` GenVM: #${fmt(s.genvm.synced_block)} (${fmt(s.genvm.blocks_behind)} blocks behind).`}
        </p>
      )}
      {!compact && s && (
        <div className="int-two">
          <Panel
            title="Consensus distribution"
            aside={<span>Indexed native transactions</span>}
          >
            <div className="int-distribution">
              {s.statuses.map((x) => (
                <a
                  key={x.status}
                  href={`#/consensus?status=${encodeURIComponent(x.status)}`}
                >
                  <span>
                    <Status value={x.status} />
                    <b>{fmt(x.count)}</b>
                  </span>
                  <i
                    style={{
                      width: `${Math.max(1, (x.count / Math.max(1, s.activity.total)) * 100)}%`,
                    }}
                  />
                </a>
              ))}
              {!s.statuses.length && <p>No receipts indexed yet.</p>}
            </div>
          </Panel>
          <Panel
            title="Most active intelligent contracts"
            aside={<span>Past 24 hours</span>}
          >
            <div className="int-ranking">
              {s.top_contracts.map((c, i) => (
                <a key={c.address} href={contractRoute(c.address)}>
                  <span className="int-rank">{i + 1}</span>
                  <span>
                    <b>{c.name ?? short(c.address)}</b>
                    <small>{fmt(c.callers_24h)} callers</small>
                  </span>
                  <strong>
                    {fmt(c.calls_24h)}
                    <small>transactions</small>
                  </strong>
                </a>
              ))}
              {!s.top_contracts.length && (
                <div className="int-empty">
                  No native transactions indexed in this window.
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
export function Contracts({ live }: { live: boolean }) {
  const address = useDetail("contracts");
  return address ? (
    <ContractDetail key={address} address={address} live={live} />
  ) : (
    <ContractDirectory live={live} />
  );
}
function ContractDirectory({ live }: { live: boolean }) {
  const [kind, setKind] = useState("all"),
    [sort, setSort] = useState("activity"),
    [query, setQuery] = useState(
      () =>
        new URLSearchParams(window.location.hash.split("?")[1]).get("q") ?? "",
    ),
    [search, setSearch] = useState(
      () =>
        new URLSearchParams(window.location.hash.split("?")[1]).get("q") ?? "",
    ),
    [page, setPage] = useState(0);
  const load = useCallback(
    () =>
      get<{ contracts: Contract[]; total: number }>(
        `/api/v1/contracts?${new URLSearchParams({ kind, sort, q: search, offset: String(page * 25) })}`,
      ),
    [kind, sort, search, page],
  );
  const state = usePolling(load, live, 15000);
  useEffect(() => {
    const f = () => {
      const q =
        new URLSearchParams(window.location.hash.split("?")[1]).get("q") ?? "";
      setQuery(q);
      setSearch(q);
      setPage(0);
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return (
    <div className="int-page">
      <NativeSummary live={live} compact />
      <Panel
        title="Contract directory"
        aside={<span>Intelligent contracts & EVM deployments</span>}
      >
        <div className="int-toolbar">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(query.trim());
              setPage(0);
            }}
          >
            <label className="sr-only" htmlFor="contract-search">
              Contract name or address
            </label>
            <input
              id="contract-search"
              placeholder="Search name, address, method or description…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button>Search</button>
          </form>
          <label>
            Type
            <select
              aria-label="Contract type"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPage(0);
              }}
            >
              <option value="all">All contracts</option>
              <option value="intelligent">Intelligent</option>
              <option value="evm">EVM</option>
            </select>
          </label>
          <label>
            Sort
            <select
              aria-label="Sort contracts"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(0);
              }}
            >
              <option value="activity">Most active · 24 h</option>
              <option value="recent">Recently discovered</option>
            </select>
          </label>
        </div>
        {state.error && <Notice retry={state.refresh}>{state.error}</Notice>}
        {!state.data && !state.error && (
          <div className="int-empty">Loading contracts…</div>
        )}
        {state.data && (
          <>
            <div className="int-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Type</th>
                    <th>Creator</th>
                    <th>Deployment</th>
                    <th>Calls · 24 h</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.contracts.map((c) => (
                    <tr key={c.address}>
                      <td>
                        {c.name && (
                          <a
                            className="obs-name"
                            href={contractRoute(c.address)}
                          >
                            {c.name}
                          </a>
                        )}
                        <small>
                          <Address value={c.address} contract />
                        </small>
                        {c.profile && (
                          <small className="obs-description">
                            {c.profile.description.slice(0, 140)}
                            {c.profile.description.length > 140 ? "…" : ""}
                          </small>
                        )}
                      </td>
                      <td>
                        <span className={`int-kind ${c.kind}`}>
                          {c.kind === "intelligent" ? "Intelligent" : "EVM"}
                        </span>
                      </td>
                      <td>
                        <Address value={c.creator} />
                      </td>
                      <td>
                        {c.deployment_id ? (
                          <a href={consensusRoute(c.deployment_id)}>
                            View deployment ↗
                          </a>
                        ) : c.deployment_tx ? (
                          <a href={txRoute(c.deployment_tx)}>
                            View deployment ↗
                          </a>
                        ) : (
                          <span>Not indexed yet</span>
                        )}
                        <small>
                          <Timestamp value={c.deployed_at} />
                        </small>
                      </td>
                      <td>{fmt(c.calls_24h)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!state.data.contracts.length && (
              <div className="int-empty">
                No contracts match these filters.
                {/^0x[0-9a-fA-F]{40}$/.test(search) && (
                  <p>
                    <a href={contractRoute(search)}>
                      Look up this address directly ↗
                    </a>
                  </p>
                )}
              </div>
            )}
            <Pager page={page} setPage={setPage} total={state.data.total} />
          </>
        )}
        <p className="int-footnote">
          Intelligent contracts are discovered from protocol submission events.
          EVM deployments cover the explorer’s retained chain history. Activity
          counts are separate for each contract type.
        </p>
      </Panel>
    </div>
  );
}
function ContractDetail({ address, live }: { address: string; live: boolean }) {
  const [tab, setTab] = useState("overview"),
    [copied, setCopied] = useState(false);
  const load = useCallback(
    () =>
      get<{ contract: Contract; indexed: boolean }>(
        `/api/v1/contracts/${encodeURIComponent(address)}`,
      ),
    [address],
  );
  const state = usePolling(load, live, 30000),
    c = state.data?.contract;
  return (
    <div className="int-page">
      <a className="int-back" href="#/contracts">
        ← Contract directory
      </a>
      <div className="int-detail-heading">
        <div>
          <span className="int-eyebrow">
            {c?.kind === "intelligent" ? "INTELLIGENT CONTRACT" : "CONTRACT"}
          </span>
          {c?.name && <h2>{c.name}</h2>}
          <h2 className="int-full-address">{address}</h2>
        </div>
        <button
          onClick={() => {
            navigator.clipboard
              .writeText(address)
              .then(() => setCopied(true))
              .catch(() => {});
          }}
        >
          {copied ? "Copied" : "Copy address"}
        </button>
      </div>
      {state.error && <Notice retry={state.refresh}>{state.error}</Notice>}
      {!c && !state.error && (
        <div className="int-empty">Looking up contract…</div>
      )}
      {c && (
        <>
          <div
            className="int-tabs"
            role="tablist"
            aria-label="Contract information"
          >
            {[
              "overview",
              ...(c.kind === "intelligent"
                ? ["health", "profile", "versions"]
                : []),
              "code",
              ...(c.kind === "intelligent" ? ["methods"] : []),
              "transactions",
              ...(c.kind === "intelligent" ? ["events"] : []),
            ].map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          {tab === "health" && <ContractHealth address={address} live={live} />}
          {tab === "profile" && (
            <ContractProfile address={address} live={live} />
          )}
          {tab === "versions" && (
            <SourceHistory address={address} live={live} />
          )}
          {tab === "overview" && c.profile && (
            <div className="obs-profile int-panel">
              <h3>{c.name}</h3>
              <p>{c.profile.description}</p>
              <small>
                Source-derived profile ·{" "}
                <button
                  className="int-text-button"
                  onClick={() => setTab("profile")}
                >
                  View capabilities and related deployments
                </button>
              </small>
            </div>
          )}
          {tab === "overview" && (
            <div className="int-two">
              <Panel title="Contract details">
                <dl className="int-facts">
                  <div>
                    <dt>Execution environment</dt>
                    <dd>
                      {c.kind === "intelligent"
                        ? "GenVM · Intelligent contract"
                        : "EVM"}
                    </dd>
                  </div>
                  <div>
                    <dt>Creator</dt>
                    <dd>
                      <Address value={c.creator} />
                    </dd>
                  </div>
                  <div>
                    <dt>Deployment</dt>
                    <dd>
                      {c.deployment_id ? (
                        <a href={consensusRoute(c.deployment_id)}>
                          Consensus receipt ↗
                        </a>
                      ) : c.deployment_tx ? (
                        <a href={txRoute(c.deployment_tx)}>
                          EVM transaction ↗
                        </a>
                      ) : (
                        "Not indexed yet"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>
                      <Timestamp value={c.deployed_at} />
                    </dd>
                  </div>
                  <div>
                    <dt>First observed block</dt>
                    <dd>
                      {c.first_seen_block == null ? (
                        "Direct RPC lookup"
                      ) : (
                        <a href={`#/blocks/${c.first_seen_block}`}>
                          #{fmt(c.first_seen_block)}
                        </a>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>EVM address balance</dt>
                    <dd>{gen(c.balance ?? "0", 5)}</dd>
                  </div>
                </dl>
              </Panel>
              <Panel
                title="Contract activity"
                aside={<span>Past 24 hours</span>}
              >
                <div className="int-activity-number">
                  {fmt(c.calls_24h)}
                  <small>
                    {c.kind === "intelligent"
                      ? "Native transactions"
                      : "EVM transactions"}
                  </small>
                </div>
                <dl className="int-facts">
                  <div>
                    <dt>Unique callers</dt>
                    <dd>{fmt(c.callers_24h ?? 0)}</dd>
                  </div>
                  <div>
                    <dt>Source code</dt>
                    <dd>
                      {c.source_available ? (
                        <button
                          className="int-text-button"
                          onClick={() => setTab("code")}
                        >
                          View on-chain source ↗
                        </button>
                      ) : c.kind === "intelligent" ? (
                        "Source not available in this state"
                      ) : (
                        "Original EVM source not verified"
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="int-footnote">
                  {c.kind === "intelligent"
                    ? "An EVM submission and an intelligent-contract decision have separate receipts. Open a native transaction to inspect its validator rounds and finality."
                    : "EVM bytecode is available. Original source and an ABI require verified metadata."}
                </p>
              </Panel>
            </div>
          )}
          {tab === "code" && <ContractCode address={address} />}
          {tab === "methods" && <ContractMethods address={address} />}{" "}
          {tab === "transactions" &&
            (c.kind === "intelligent" ? (
              <ContractTransactions address={address} live={live} />
            ) : (
              <EvmContractTransactions address={address} live={live} />
            ))}
          {tab === "events" && <ContractEvents address={address} live={live} />}
        </>
      )}
    </div>
  );
}
function Highlight({ source }: { source: string }) {
  const tokens = source.split(
    /(#[^\n]*|"[^"\n]*"|'[^'\n]*'|\b(?:class|def|return|import|from|as|if|else|elif|for|in|with|True|False|None|assert|self)\b)/g,
  );
  return (
    <pre className="int-source">
      <code>
        {tokens.map((t, i) => (
          <span
            key={i}
            className={
              t.startsWith("#")
                ? "comment"
                : /^['"]/.test(t)
                  ? "string"
                  : /^(class|def|return|import|from|as|if|else|elif|for|in|with|True|False|None|assert|self)$/.test(
                        t,
                      )
                    ? "keyword"
                    : undefined
            }
          >
            {t}
          </span>
        ))}
      </code>
    </pre>
  );
}
function ContractCode({ address }: { address: string }) {
  const [state, setState] = useState("decided");
  const load = useCallback(
    () => get<any>(`/api/v1/contracts/${address}/code?state=${state}`),
    [address, state],
  );
  const result = usePolling(load, false, 60000);
  const c = result.data;
  return (
    <Panel
      title="Contract code"
      aside={
        <label>
          State{" "}
          <select
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              result.refresh();
            }}
          >
            <option value="decided">Decided</option>
            <option value="finalized">Finalized</option>
          </select>
        </label>
      }
    >
      {result.error && <Notice retry={result.refresh}>{result.error}</Notice>}
      {!c && !result.error && <div className="int-empty">Retrieving code…</div>}
      {c && (
        <>
          <div className="int-code-meta">
            <span>
              {c.language === "python"
                ? "Python · GenVM"
                : c.language === "evm"
                  ? "EVM bytecode"
                  : "Source code"}{" "}
              · {fmt(c.size)} bytes
            </span>
            {c.source && (
              <button
                onClick={() => {
                  const u = URL.createObjectURL(
                    new Blob([c.source], { type: "text/plain" }),
                  );
                  const a = document.createElement("a");
                  a.href = u;
                  a.download = `${address}.py`;
                  a.click();
                  URL.revokeObjectURL(u);
                }}
              >
                Download source
              </button>
            )}
          </div>
          {c.source ? (
            <Highlight source={c.source} />
          ) : (
            <>
              <Notice>
                Original source has not been verified. This is deployed EVM
                bytecode.
              </Notice>
              <pre className="int-bytecode">{c.bytecode}</pre>
            </>
          )}
          {c.sha256 && (
            <p className="int-footnote int-break">Source SHA-256: {c.sha256}</p>
          )}
          {c.references && (c.references.llm || c.references.web) && (
            <p className="int-footnote">
              Code references:{" "}
              {[
                c.references.llm && "LLM / prompt operations",
                c.references.web && "web data access",
              ]
                .filter(Boolean)
                .join(" · ")}
              . These are source references, not evidence of execution.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
function ContractMethods({ address }: { address: string }) {
  const load = useCallback(
    () => get<{ schema: any }>(`/api/v1/contracts/${address}/schema`),
    [address],
  );
  const result = usePolling(load, false, 60000),
    schema = result.data?.schema;
  return (
    <Panel title="Contract methods" aside={<span>GenVM schema</span>}>
      {result.error && <Notice retry={result.refresh}>{result.error}</Notice>}
      {!schema && !result.error && (
        <div className="int-empty">Loading method schema…</div>
      )}
      {schema && (
        <>
          <p className="int-footnote">
            Read declared methods against decided or finalized state. Values are
            JSON; quote strings. Write methods are shown for reference.
          </p>
          <div className="int-methods">
            {Object.entries(schema.methods ?? {}).map(([name, method]) => (
              <Method
                key={name}
                name={name}
                method={method}
                address={address}
              />
            ))}
            {!Object.keys(schema.methods ?? {}).length && (
              <div className="int-empty">No public methods reported.</div>
            )}
          </div>
          <details className="int-raw">
            <summary>Constructor and full schema</summary>
            <Json value={schema} />
          </details>
        </>
      )}
    </Panel>
  );
}
function Method({
  name,
  method: m,
  address,
}: {
  name: string;
  method: any;
  address: string;
}) {
  const [args, setArgs] = useState("[]"),
    [kwargs, setKwargs] = useState("{}"),
    [state, setState] = useState("decided"),
    [result, setResult] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  async function call() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setResult(
        await get(
          `/api/v1/contracts/${address}/read?${new URLSearchParams({ method: name, args, kwargs, state })}`,
          65000,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <details className="int-method">
      <summary>
        <code>{name}</code>
        <span>
          {m.readonly ? "Read only" : "Write"}
          {m.payable ? " · Payable" : ""}
        </span>
        <small>
          →{" "}
          {typeof m.ret === "string"
            ? m.ret
            : JSON.stringify(m.ret ?? "unknown")}
        </small>
      </summary>
      <div className="int-method-body">
        <p>
          Parameters: <code>{JSON.stringify(m.params ?? [])}</code>
        </p>
        {Object.keys(m.kwparams ?? {}).length > 0 && (
          <p>
            Keyword parameters: <code>{JSON.stringify(m.kwparams)}</code>
          </p>
        )}
        {m.readonly ? (
          <>
            <label>
              Arguments (JSON array)
              <textarea
                aria-label={`${name} arguments`}
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder='["value", 10]'
              />
            </label>
            {Object.keys(m.kwparams ?? {}).length > 0 && (
              <label>
                Keyword arguments (JSON object)
                <textarea
                  value={kwargs}
                  onChange={(e) => setKwargs(e.target.value)}
                />
              </label>
            )}
            <div className="int-read-action">
              <select
                aria-label={`${name} state`}
                value={state}
                onChange={(e) => setState(e.target.value)}
              >
                <option value="decided">Decided state</option>
                <option value="finalized">Finalized state</option>
              </select>
              <button disabled={loading} onClick={call}>
                {loading ? "Reading…" : `Read ${name}`}
              </button>
            </div>
            {error && <Notice>{error}</Notice>}
            {result && (
              <div className="int-read-result">
                <span
                  className={`int-status ${result.status?.code === 0 ? "success" : "failed"}`}
                >
                  {result.status?.code === 0
                    ? "Read succeeded"
                    : "Execution failed"}
                </span>
                <span>
                  {result.status?.message ?? "Result"} · {result.state} state
                </span>
                <Json value={result.result ?? result.raw} />
                {result.synced_block != null && (
                  <small>GenVM synced block #{fmt(result.synced_block)}</small>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="int-footnote">
            This method changes contract state. The explorer provides read-only
            inspection.
          </p>
        )}
      </div>
    </details>
  );
}
function ContractTransactions({
  address,
  live,
}: {
  address: string;
  live: boolean;
}) {
  const [page, setPage] = useState(0);
  const load = useCallback(
    () => getNativeTransactions({ address, offset: String(page * 25) }),
    [address, page],
  );
  const s = usePolling(load, live, 15000);
  return (
    <Panel title="Intelligent-contract transactions">
      {s.error && <Notice retry={s.refresh}>{s.error}</Notice>}
      {s.data ? (
        <>
          <NativeTable rows={s.data.transactions} />
          <Pager page={page} setPage={setPage} total={s.data.total} />
        </>
      ) : (
        !s.error && <div className="int-empty">Loading transactions…</div>
      )}
    </Panel>
  );
}
function EvmContractTransactions({
  address,
  live,
}: {
  address: string;
  live: boolean;
}) {
  const load = useCallback(() => getTransactions(25, { address }), [address]);
  const s = usePolling(load, live, 15000);
  return (
    <Panel
      title="Latest EVM transactions"
      aside={<a href={addressRoute(address)}>Full address history ↗</a>}
    >
      {s.error && <Notice retry={s.refresh}>{s.error}</Notice>}
      {s.data && (
        <div className="int-scroll">
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>From</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {s.data.txs.map((t) => (
                <tr key={t.hash}>
                  <td>
                    <a href={txRoute(t.hash)}>{short(t.hash)}</a>
                  </td>
                  <td>
                    <Address value={t.from} />
                  </td>
                  <td>{t.status === 1 ? "Success" : "Reverted"}</td>
                  <td>
                    <Timestamp value={t.time} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
function ContractEvents({ address, live }: { address: string; live: boolean }) {
  const [to, setTo] = useState(""),
    [status, setStatus] = useState("active");
  const load = useCallback(
    () =>
      get<any>(
        `/api/v1/contracts/${address}/events?${new URLSearchParams({ ...(to ? { to } : {}), status })}`,
      ),
    [address, to, status],
  );
  const s = usePolling(load, live, 15000);
  return (
    <Panel
      title="Intelligent-contract events"
      aside={
        <select
          aria-label="Event status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="active">Accepted & finalized</option>
          <option value="cancelled">Overturned by appeal</option>
          <option value="all">All states</option>
        </select>
      }
    >
      {s.error && <Notice retry={s.refresh}>{s.error}</Notice>}
      {s.data && (
        <>
          <p className="int-footnote">
            Acceptance blocks #{fmt(s.data.from_block)}–#{fmt(s.data.to_block)}.{" "}
            {s.data.note}
          </p>
          {!s.data.events.length ? (
            <div className="int-empty">
              No events returned for this block range and state.
            </div>
          ) : (
            s.data.events.map((e: any) => (
              <details
                className="int-event"
                key={`${e.transactionHash}:${e.round}:${e.logIndex}`}
              >
                <summary>
                  <span>
                    <a href={consensusRoute(e.transactionHash)}>
                      {short(e.transactionHash)}
                    </a>{" "}
                    · Round {e.round}
                  </span>
                  <span className={e.removed ? "int-danger" : ""}>
                    {e.status}
                    {e.removed ? " · Removed" : ""}
                  </span>
                </summary>
                <Json
                  value={{
                    decoded: e.decoded,
                    topics: e.topics,
                    data: e.data,
                    block: Number(e.blockNumber),
                  }}
                />
              </details>
            ))
          )}
          <div className="int-pager">
            <button disabled={!to} onClick={() => setTo("")}>
              Latest events
            </button>
            <button
              disabled={s.data.next_to == null}
              onClick={() => setTo(String(s.data.next_to))}
            >
              Earlier 5,000 blocks
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}
export function Consensus({ live }: { live: boolean }) {
  const id = useDetail("consensus");
  return id ? (
    <ConsensusDetail key={id} id={id} live={live} />
  ) : (
    <ConsensusDirectory live={live} />
  );
}
function ConsensusDirectory({ live }: { live: boolean }) {
  const initial = () =>
    new URLSearchParams(window.location.hash.split("?")[1]).get("status") ?? "";
  const param = (key: string) =>
    new URLSearchParams(window.location.hash.split("?")[1]).get(key) ?? "";
  const [execution, setExecution] = useState(() => param("execution")),
    [confirmation, setConfirmation] = useState(() => param("confirmation")),
    [address, setAddress] = useState(() => param("address")),
    [days, setDays] = useState(() => param("days"));
  const [status, setStatus] = useState(initial),
    [page, setPage] = useState(0),
    [id, setId] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const f = () => {
      setStatus(initial());
      setExecution(param("execution"));
      setConfirmation(param("confirmation"));
      setAddress(param("address"));
      setDays(param("days"));
      setPage(0);
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const load = useCallback(
    () =>
      getNativeTransactions({
        status,
        execution,
        confirmation,
        address,
        days,
        offset: String(page * 25),
      }),
    [status, execution, confirmation, address, days, page],
  );
  const s = usePolling(load, live, 15000);
  return (
    <div className="int-page">
      <NativeSummary live={live} />
      <Panel title="Intelligent-contract transactions">
        {days && (
          <p className="int-footnote">
            Time window: {days === "1" ? "Past 24 hours" : `Past ${days} days`}{" "}
            <button
              onClick={() => {
                setDays("");
                setPage(0);
              }}
            >
              Show all history
            </button>
          </p>
        )}
        {address && (
          <p className="int-footnote">
            Contract: <a href={contractRoute(address)}>{short(address)}</a>{" "}
            <button
              onClick={() => {
                setAddress("");
                setPage(0);
              }}
            >
              Clear contract filter
            </button>
          </p>
        )}
        <div className="int-toolbar">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (/^0x[0-9a-fA-F]{64}$/.test(id.trim()))
                window.location.hash = consensusRoute(id.trim());
              else setError("Enter a 32-byte GenLayer consensus ID.");
            }}
          >
            <input
              aria-label="Consensus ID"
              placeholder="Look up a consensus transaction ID…"
              value={id}
              onChange={(e) => setId(e.target.value)}
            />
            <button>Look up</button>
          </form>
          <label>
            Status
            <select
              aria-label="Consensus status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All statuses</option>
              {[
                "Pending",
                "Proposing",
                "Committing",
                "Revealing",
                "Accepted",
                "Finalized",
                "Canceled",
                "Undetermined",
                "AppealCommitting",
                "AppealRevealing",
                "ValidatorsTimeout",
                "LeaderTimeout",
                "LeaderRevealing",
                "Unknown",
              ].map((x) => (
                <option key={x} value={x}>
                  {statusLabel(x)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="int-toolbar">
          <label>
            Execution
            <select
              aria-label="Execution outcome"
              value={execution}
              onChange={(e) => {
                setExecution(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All outcomes</option>
              <option value="returned">Returned</option>
              <option value="failed">All failures</option>
              <option value="error">Execution error</option>
              <option value="timeout">Timeout</option>
              <option value="disagreement">Disagreement</option>
              <option value="violation">Violation</option>
              <option value="unknown">Unavailable</option>
            </select>
          </label>
          <label>
            Submission
            <select
              aria-label="Submission confirmation"
              value={confirmation}
              onChange={(e) => {
                setConfirmation(e.target.value);
                setPage(0);
              }}
            >
              <option value="">Active submissions</option>
              <option value="confirmed">Confirmed</option>
              <option value="provisional">Provisional</option>
              <option value="orphaned">Orphaned</option>
            </select>
          </label>
        </div>
        {error && <Notice>{error}</Notice>}
        {s.error && <Notice retry={s.refresh}>{s.error}</Notice>}
        {s.data ? (
          <>
            <NativeTable rows={s.data.transactions} />
            <Pager page={page} setPage={setPage} total={s.data.total} />
          </>
        ) : (
          !s.error && (
            <div className="int-empty">Loading consensus activity…</div>
          )
        )}
        <p className="int-footnote">
          Consensus IDs identify intelligent-contract execution. Each submission
          also has a separate EVM transaction hash.
        </p>
      </Panel>
    </div>
  );
}
function ConsensusDetail({ id, live }: { id: string; live: boolean }) {
  const load = useCallback(
    () => get<any>(`/api/v1/genlayer/transactions/${encodeURIComponent(id)}`),
    [id],
  );
  const s = usePolling(load, live, 15000),
    r = s.data?.receipt;
  const [output, setOutput] = useState<any>(null),
    [outputError, setOutputError] = useState(""),
    [loading, setLoading] = useState(false);
  return (
    <div className="int-page">
      <a className="int-back" href="#/consensus">
        ← Consensus activity
      </a>
      <div className="int-detail-heading">
        <div>
          <span className="int-eyebrow">INTELLIGENT-CONTRACT TRANSACTION</span>
          <h2 className="int-full-address">{id}</h2>
        </div>
        {r && <Status value={r.statusName} />}
      </div>
      {s.error && <Notice retry={s.refresh}>{s.error}</Notice>}
      {!r && !s.error && (
        <div className="int-empty">Loading consensus receipt…</div>
      )}
      {r && (
        <>
          {s.data.stale && (
            <Notice retry={s.refresh}>
              The node is unavailable. Showing the receipt saved{" "}
              <Timestamp value={s.data.checked_at} />.
            </Notice>
          )}
          <TransactionExplanation
            id={id}
            receipt={r}
            confirmation={s.data.confirmation}
            live={live}
          />
          <div className="int-two">
            <Panel title="Execution">
              <dl className="int-facts">
                <div>
                  <dt>Contract</dt>
                  <dd>
                    <Address value={r.recipient} contract />
                  </dd>
                </div>
                <div>
                  <dt>Sender</dt>
                  <dd>
                    <Address value={r.sender} />
                  </dd>
                </div>
                <div>
                  <dt>Method</dt>
                  <dd>{r.input?.method ?? "Unavailable"}</dd>
                </div>
                <div>
                  <dt>Consensus outcome</dt>
                  <dd>{resultLabel(Number(r.result))}</dd>
                </div>
                <div>
                  <dt>Execution result</dt>
                  <dd>{r.txExecutionResultName ?? "Unavailable"}</dd>
                </div>
                <div>
                  <dt>Epoch</dt>
                  <dd>{fmt(Number(r.epoch))}</dd>
                </div>
                <div>
                  <dt>EVM submission</dt>
                  <dd>
                    {s.data.submission_hash ? (
                      <a href={txRoute(s.data.submission_hash)}>
                        {short(s.data.submission_hash)} ↗
                      </a>
                    ) : (
                      "Not indexed"
                    )}
                  </dd>
                </div>
              </dl>
            </Panel>
            <Panel title="Lifecycle timestamps">
              <ol className="int-timeline">
                {Object.entries(r.timestamps ?? {})
                  .filter(([, v]) => Number(v) > 0)
                  .sort(([, a], [, b]) => Number(a) - Number(b))
                  .map(([name, value]) => (
                    <li key={name}>
                      <i />
                      <div>
                        <b>{name.replace(/([a-z])([A-Z])/g, "$1 $2")}</b>
                        <span>
                          {new Date(Number(value) * 1000).toLocaleString()}
                        </span>
                      </div>
                    </li>
                  ))}
              </ol>
              <p className="int-footnote">
                Current consensus state: {statusLabel(r.statusName)}. Accepted
                decisions can still be appealed before finalization.
              </p>
            </Panel>
          </div>
          <RoundComparison id={id} rounds={r.roundData} />
          <Panel
            title="Validator rounds"
            aside={
              <span>
                {r.roundData.length} rounds ·{" "}
                {Math.max(0, r.roundData.length - 1)} additional rounds
              </span>
            }
          >
            {r.roundData.length ? (
              r.roundData.map((round: any) => (
                <div className="int-round" key={round.round}>
                  <div className="int-round-heading">
                    <h3>Round {round.round}</h3>
                    <span>{resultLabel(Number(round.result))}</span>
                    <span>
                      {round.votesRevealed}/{round.validators.length} votes
                      revealed
                    </span>
                  </div>
                  <div className="int-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Validator</th>
                          <th>Role</th>
                          <th>Execution vote</th>
                          <th>Result hash</th>
                        </tr>
                      </thead>
                      <tbody>
                        {round.validators.map((v: any) => (
                          <tr key={v.address}>
                            <td>
                              <a
                                href={`#/validators/${v.address}`}
                                title={v.address}
                              >
                                {short(v.address)}
                              </a>
                            </td>
                            <td>{v.leader ? "Leader" : "Validator"}</td>
                            <td>{voteLabel(v.vote)}</td>
                            <td>
                              <span title={v.result_hash ?? ""}>
                                {v.result_hash ? short(v.result_hash) : "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="int-footnote">
                    {round.votesCommitted} committed · {round.rotationsLeft}{" "}
                    rotations remaining · Appeal bond:{" "}
                    {gen(String(round.appealBond ?? 0), 6)}
                  </p>
                </div>
              ))
            ) : (
              <div className="int-empty">
                Validator rounds have not been assigned yet.
              </div>
            )}
          </Panel>
          <div className="int-two">
            <Panel title="Protocol fees">
              {r.fees ? (
                <>
                  <dl className="int-facts">
                    {[
                      ["Fee deposit", r.fees.deposit],
                      [
                        "Execution consumed",
                        r.fees.consumed?.executionConsumed,
                      ],
                      ["Storage used", r.fees.consumed?.storageFeeUsed],
                      [
                        "Message fees consumed",
                        r.fees.consumed?.messageFeesConsumed,
                      ],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd
                          title={value == null ? "Unavailable" : `${value} wei`}
                        >
                          {value == null ? "—" : gen(String(value), 8)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <details className="int-raw">
                    <summary>Fee budgets and allocations</summary>
                    <Json value={r.fees} />
                  </details>
                </>
              ) : (
                <div className="int-empty">
                  Fee accounting is unavailable for this receipt.
                </div>
              )}
            </Panel>
            <Panel title="Execution output">
              <p className="int-footnote">
                Inspect the result retained by this node. Outputs may be
                unavailable if the node did not execute the transaction or has
                pruned its trace.
              </p>
              <div className="int-pad">
                <button
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);
                    setOutputError("");
                    try {
                      setOutput(
                        await get(`/api/v1/genlayer/transactions/${id}/result`),
                      );
                    } catch (e) {
                      setOutputError((e as Error).message);
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  {loading ? "Loading…" : "Load execution result"}
                </button>
              </div>
              {outputError && <Notice>{outputError}</Notice>}
              {output &&
                (output.returnData == null ? (
                  <Notice>
                    The node has no retained execution output for this
                    transaction.
                  </Notice>
                ) : (
                  <Json value={output.decoded_return ?? output.returnData} />
                ))}
            </Panel>
          </div>
          <details className="int-raw">
            <summary>Full consensus receipt</summary>
            <Json value={r} />
          </details>
        </>
      )}
    </div>
  );
}
