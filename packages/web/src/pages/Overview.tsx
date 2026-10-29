import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Dashboard } from "../useDashboard";
import { usePolling } from "../usePolling";
import { loadNativeOverview, getNativeTransactions, contractRoute, consensusRoute, statusLabel, type NativeOverview, type NativeTransaction } from "../genlayer";
import { fmt, short } from "../lib";
import { Timestamp } from "../components/Timestamp";
import { Outcome } from "./Observatory";
import { activityBuckets, activityChange } from "../overviewActivity";

const loadRecent = () => getNativeTransactions({ limit: "5", days: "1" });
const height = (n: number | string | null | undefined) => n == null ? "—" : `#${fmt(Number(n))}`;
const utc = (time: number | string) => new Date(time).toISOString().slice(11, 16);
const paths = {
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  file: "M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6",
  users: "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M16 4a4 4 0 0 1 0 8M22 21v-3a4 4 0 0 0-3-3.9M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  user: "M20 21v-3a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v3M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  warning: "M10.3 4.3 2.1 19a1.4 1.4 0 0 0 1.2 2h17.4a1.4 1.4 0 0 0 1.2-2L13.7 4.3a2 2 0 0 0-3.4 0M12 9v5M12 17h.01",
  chart: "M3 21h3v-7H3zM10 21h3V9h-3zM17 21h3V4h-3zM3 8l6-5 4 2 6-4",
  network: "M8 8l8 8M16 8l-8 8M3 3h5v5H3zM16 3h5v5h-5zM3 16h5v5H3zM16 16h5v5h-5zM9 12h6",
  block: "m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10M8 4l9 5",
  transactions: "M9 3h12v12H9zM3 9h12v12H3z",
  database: "M21 5c0 2.2-4 4-9 4S3 7.2 3 5s4-4 9-4 9 1.8 9 4ZM3 5v14c0 2.2 4 4 9 4s9-1.8 9-4V5M3 12c0 2.2 4 4 9 4s9-1.8 9-4",
  check: "m6 12 4 4 8-9",
  calendar: "M4 5h16v16H4zM8 2v6M16 2v6M4 10h16",
  bars: "M3 13h3v8H3zM10 7h3v14h-3zM17 3h3v18h-3z",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  consensus: "M12 2v5M12 7l-7 5v8M12 7l7 5v8M12 7v14M3 20v-6h4v6M17 20v-6h4v6",
  shield: "m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6",
  transfer: "M3 7h17m-5-5 5 5-5 5M21 17H4m5-5-5 5 5 5",
  back: "M20 12H4m7-7-7 7 7 7",
  rpc: "M6 3 3 8v8l3 5M18 3l3 5v8l-3 5M3 9h18M3 15h18",
  code: "m8 6-6 6 6 6M16 6l6 6-6 6",
  settings: "m10 2-.6 2.3-2 .9-2.2-.6-2 3.4L5 9.7v2.6l-1.8 1.8 2 3.4 2.2-.6 2 .9L10 20h4l.6-2.2 2-.9 2.2.6 2-3.4-1.8-1.8V9.7l1.8-1.7-2-3.4-2.2.6-2-.9L14 2zM15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  arrowRight: "M4 12h16m-6-6 6 6-6 6",
  chevron: "m7 10 5 5 5-5",
  trendUp: "m5 16 6-6 4 3 5-8M14 5h6v6",
  trendDown: "m5 8 6 6 4-3 5 8M14 19h6v-6",
  refresh: "M20 7v5h-5M20 12a8 8 0 1 0-2 6",

} as const;
type IconName = keyof typeof paths;
export function OverviewIcon({ name, className = "" }: { name: IconName; className?: string }) {
  return <svg className={`ov-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
function Panel({ title, subtitle, icon, aside, children, className = "" }: { title: string; subtitle?: string; icon: IconName; aside?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`ov-panel ${className}`}><header><OverviewIcon name={icon}/><div className="ov-panel-heading"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{aside}</header>{children}</section>;
}
function ErrorState({ message, retry, stale = false }: { message: string | null; retry: () => void; stale?: boolean }) {
  return message ? <div className="ov-error" role="status"><span>{stale ? "Showing previous data. " : ""}{message}</span><button onClick={retry}>Retry</button></div> : null;
}
function Empty({ children }: { children: ReactNode }) { return <p className="ov-empty">{children}</p>; }
function Spark({ values, label, failed }: { values: number[]; label: string; failed?: boolean }) {
  const max = Math.max(1, ...values), step = 64 / Math.max(1, values.length);
  return <svg className={`ov-spark ${failed ? "failed" : ""}`} viewBox="0 0 64 25" role="img" aria-label={`${label} per hour, past 24 hours`}><title>{label} per hour: {values.join(", ")}</title>{values.map((n, i) => <rect key={i} x={i * step} y={25 - n / max * 24} width={Math.max(.5, step - 1)} height={Math.max(1, n / max * 24)}/>)}</svg>;
}
function Stat({ label, icon, value, previous, note, href, values, failed = false }: { label: string; icon: IconName; value?: number; previous?: number; note: ReactNode; href?: string; values: number[]; failed?: boolean }) {
  const change = value == null ? { label: "—", direction: "unknown" } : activityChange(value, previous);
  const amount = value == null ? "—" : fmt(value);
  return <div className={`ov-stat ${failed ? "has-failures" : ""}`}><span className="ov-stat-icon"><OverviewIcon name={icon}/></span><div className="ov-stat-copy"><span>{label}</span><div className="ov-stat-value"><strong>{href ? <a href={href}>{amount}</a> : amount}</strong><span className={`ov-change ${change.direction} ${failed ? "failure-change" : ""}`} title={previous == null ? "Previous period unavailable" : `${fmt(previous)} in the previous 24 hours; ${change.label} change`} aria-label={`${label}: ${change.label} versus previous 24 hours`}>{(change.direction === "up" || change.direction === "down") && <OverviewIcon name={change.direction === "up" ? "trendUp" : "trendDown"}/>}<span>{change.label}</span></span></div></div><small>{note}</small><Spark values={values} label={label} failed={failed}/></div>;
}
function WindowInfo({ data }: { data: NativeOverview | null }) {
  return <details className="ov-window"><summary><OverviewIcon name="calendar"/>Past 24 hours<OverviewIcon name="chevron"/></summary><div><strong>Rolling 24-hour window</strong><p>{data ? `${new Date(data.series.since).toLocaleString("en-GB", { timeZone: "UTC" })} — ${new Date(data.series.until).toLocaleString("en-GB", { timeZone: "UTC" })} UTC` : "Waiting for activity data."}</p><p>Cards and chart use the same indexed transactions.</p><a href="#/consensus?days=1">Explore this window <OverviewIcon name="arrowRight"/></a></div></details>;
}
function ActivityChart({ data }: { data: NativeOverview }) {
  const [selected, setSelected] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const element = chartRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const series = data.series, points = activityBuckets(series.points, series.bucket_secs, Date.parse(series.until)).map(p => ({ ...p, ...series.points.find(x => Date.parse(x.t) === p.time) }));
  const peak = Math.max(1, ...points.map(p => p.txs)), max = Math.max(3, Math.ceil(peak / 3) * 3);
  const step = (width - 50) / points.length, current = selected == null ? null : points[selected];
  return <div className="ov-chart-wrap"><div className="ov-legend"><span><i className="returned"/>Returned ({fmt(data.activity.returned_24h)})</span><span><i className="failed"/>Failed ({fmt(data.activity.failed_24h)})</span><span><i className="unknown"/>Unavailable ({fmt(data.activity.unknown_24h)})</span></div><div className={`ov-chart-reading ${current ? "visible" : ""}`} aria-live="polite">{current ? `${utc(current.time)} UTC · ${fmt(current.txs)} transactions · ${fmt(current.failed ?? 0)} failed · ${fmt(current.unknown ?? 0)} unavailable` : "Hover or focus a bar for hourly outcomes (UTC)"}</div><div className="ov-chart" ref={chartRef}><svg viewBox={`0 0 ${width} 145`} preserveAspectRatio="none" role="img" aria-label="Hourly intelligent-contract transactions over the past 24 hours"><defs><linearGradient id="ov-bars" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#566bff"/><stop offset="1" stopColor="#164aff"/></linearGradient><linearGradient id="ov-fail-bars" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ff626f"/><stop offset="1" stopColor="#ec3446"/></linearGradient></defs>{[0,1,2,3].map(i => { const y = 14 + i * 34; return <g className="ov-gridline" key={i}><line x1="36" x2={width-10} y1={y} y2={y}/><text x="24" y={y + 3} textAnchor="end">{fmt(max * (3-i)/3)}</text></g>; })}{points.map((p,i) => { const x = 40 + i * step, scale = 102/max, w = Math.max(2,step-5), r=(p.returned??0)*scale, f=(p.failed??0)*scale, u=(p.unknown??0)*scale; return <g className={`ov-hour ${selected === i ? "selected" : ""}`} key={p.time} tabIndex={0} role="graphics-symbol" aria-label={`${new Date(p.time).toISOString()}: ${p.txs} transactions, ${p.failed??0} failed, ${p.unknown??0} unavailable`} onMouseEnter={()=>setSelected(i)} onMouseLeave={()=>setSelected(null)} onFocus={()=>setSelected(i)} onBlur={()=>setSelected(null)}><line className="ov-vertical-grid" x1={x} x2={x} y1="14" y2="116"/><rect className="ov-hover-area" x={x-2} y="10" width={step} height="108"/><rect x={x} y={116-r} width={w} height={r} className="ov-bar-returned"/><rect x={x} y={116-r-f} width={w} height={f} className="ov-bar-failed"/><rect x={x} y={116-r-f-u} width={w} height={u} className="ov-bar-unknown"/>{p.txs === 0 && <rect x={x} y="115" width={w} height="1" className="ov-bar-empty"/>}{i%(width<500?6:2)===0 && <text x={x+w/2} y="139" textAnchor="middle">{utc(p.time)}</text>}<title>{utc(p.time)} UTC · {p.txs} transactions</title></g>; })}</svg></div></div>;
}
function RecentTransactions({ rows }: { rows: NativeTransaction[] }) {
  return rows.length ? <div className="ov-table-scroll"><table className="ov-transactions"><colgroup>{[15,19,16,14,14,22].map((width,i)=><col key={i} style={{width:`${width}%`}}/>)}</colgroup><thead><tr><th>Contract</th><th>Method / transaction</th><th>Execution</th><th>Consensus</th><th>Submitted</th><th>Block state</th></tr></thead><tbody>{rows.map(t=><tr key={t.id}><td className="ov-cell-contract"><a title={t.recipient} href={contractRoute(t.recipient)}>{t.contract_name ?? short(t.recipient)}</a>{t.contract_name && <small>{short(t.recipient)}</small>}</td><td className="ov-cell-method"><a href={consensusRoute(t.id)} title={t.id}>{t.method ?? (t.kind === "deploy" ? "Deploy contract" : "View transaction")}</a><small>{short(t.id)}</small></td><td className="ov-cell-outcome"><Outcome value={t.execution_result}/></td><td className="ov-cell-decision">{statusLabel(t.status)}</td><td className="ov-cell-time"><Timestamp value={t.created_at ?? t.observed_at}/>{!t.created_at && <small>First observed</small>}</td><td className="ov-cell-block"><a className={`ov-block-state ${t.confirmation === "confirmed" ? "confirmed" : "pending"}`} href={`#/blocks/${t.block_number}`} title="Submission-block finality is separate from the contract's consensus decision."><span><OverviewIcon name={t.confirmation === "confirmed" ? "check" : "clock"}/></span>{t.confirmation === "confirmed" ? "Block finalized" : t.confirmation === "orphaned" ? "Block orphaned" : "Block unfinalized"}</a></td></tr>)}</tbody></table></div> : <Empty>No contract transactions in the past 24 hours.</Empty>;
}
function ActiveContracts({ data }: { data: NativeOverview | null }) {
  const maxTx=Math.max(1,...(data?.top_contracts.map(c=>c.calls_24h)??[])), maxCallers=Math.max(1,...(data?.top_contracts.map(c=>c.callers_24h)??[]));
  return <><div className="ov-table-scroll"><table className="ov-ranking"><thead><tr><th>#</th><th>Contract</th><th>Transactions</th><th>Unique callers</th></tr></thead><tbody>{data?.top_contracts.map((c,i)=><tr key={c.address}><td>{i+1}</td><td><a title={c.address} href={contractRoute(c.address)}>{c.name??short(c.address)}</a>{c.name&&i===0&&<small>{short(c.address)}</small>}</td><td><span className="ov-rank-value">{fmt(c.calls_24h)}<i><b style={{width:`${c.calls_24h/maxTx*100}%`}}/></i></span></td><td><span className="ov-rank-value callers">{fmt(c.callers_24h)}<i><b style={{width:`${c.callers_24h/maxCallers*100}%`}}/></i></span></td></tr>)}</tbody></table></div>{data&&!data.top_contracts.length&&<Empty>No contract activity in this window.</Empty>}{!data&&<Empty>Waiting for contract activity.</Empty>}<a className="ov-panel-link" href="#/contracts">Browse all contracts <OverviewIcon name="arrowRight"/></a></>;
}
export function Overview({ d, live, refreshRevision = 0 }: { d: Dashboard; live: boolean; refreshRevision?: number; copied?: string|null; onCopy?: (s:string)=>void; selected?: number|null; onSelect?: (n:number)=>void }) {
  const overview=usePolling(loadNativeOverview,live,15000,"native-overview"), recent=usePolling(loadRecent,live,10000,"overview-recent-day");
  const s=overview.data, net=d.net;
  useEffect(()=>{if(refreshRevision){overview.refresh();recent.refresh();}},[refreshRevision,overview.refresh,recent.refresh]);
  const refresh=()=>{overview.refresh();recent.refresh();d.refresh();};
  const stale=!!overview.error||!!s?.sync?.live_error||!s?.sync?.live_updated_at||Date.now()-Date.parse(s.sync.live_updated_at)>120000;
  const healthy=live&&!stale&&!d.error&&d.state==="normal";
  const networkLabel=!live?"Updates paused":overview.error||d.error?"Status unavailable":!s||d.state==="loading"?"Connecting":healthy?"Network healthy":"Network delayed";
  const chainState=!live?"Updates paused":d.error?"Chain status unavailable":d.state==="loading"?"Connecting to the network":d.state==="stopped"?"Indexer delayed":d.state==="normal"?"Synced to RPC finalized head":d.state==="empty"?"Waiting for blocks":"Syncing history";
  const previous=s?.comparison?.activity;
  const points=s?activityBuckets(s.series.points,s.series.bucket_secs,Date.parse(s.series.until)).map(p=>({...p,...s.series.points.find(x=>Date.parse(x.t)===p.time)})):[];
  const values=(key:"txs"|"active"|"callers"|"failed")=>points.map(p=>p[key]??0);
  const failureRate=s?.activity.calls_24h?`${(100*s.activity.failed_24h/s.activity.calls_24h).toFixed(1)}%`:"0%";
  return <div className="gen-overview ov-dashboard">
    <Panel title="Past 24 hours" subtitle="Contract activity and execution outcomes from the last 24 hours (UTC)." icon="clock" className="ov-summary" aside={<div className="ov-updated"><span>{overview.updatedAt?<>Updated <Timestamp value={overview.updatedAt.toISOString()}/></>:"Waiting for data"}</span><button className="ov-mobile-refresh" aria-label="Refresh overview" onClick={refresh}><OverviewIcon name="refresh"/></button></div>}>
      <ErrorState message={overview.error?"Contract activity could not be refreshed.":null} retry={overview.refresh} stale={!!s}/>
      <div className="ov-stats"><Stat label="Contract transactions" icon="file" value={s?.activity.calls_24h} previous={previous?.calls_24h} note="Calls and deployments · 24h" href="#/consensus?days=1" values={values("txs")}/><Stat label="Active contracts" icon="users" value={s?.activity.active_24h} previous={previous?.active_24h} note={s?`${fmt(s.contracts.intelligent)} intelligent contracts indexed`:"Contracts with activity · 24h"} href="#/contracts" values={values("active")}/><Stat label="Unique callers" icon="user" value={s?.activity.callers_24h} previous={previous?.callers_24h} note="Distinct sender addresses · 24h" values={values("callers")}/><Stat label="Execution failures" icon="warning" value={s?.activity.failed_24h} previous={previous?.failed_24h} note={s?`${failureRate} of contract transactions`:"Execution outcomes · 24h"} href="#/consensus?days=1&execution=failed" values={values("failed")} failed/></div>
    </Panel>
    <Panel title="Contract activity" subtitle="Hourly contract transactions and execution outcomes (UTC)." icon="chart" className="ov-activity" aside={<WindowInfo data={s}/>}>{s?<ActivityChart data={s}/>:<Empty>{overview.error?"Activity is unavailable.":"Loading contract activity…"}</Empty>}</Panel>
    <Panel title="Live network state" subtitle="Current state of the GenLayer network and indexer." icon="network" className="ov-network" aside={<a className={`ov-network-badge ${healthy?"ready":"delayed"}`} href="#/endpoints"><i/>{networkLabel}</a>}><dl>{[
      ["clock","Decisions in progress",s?<a href="#/consensus">{fmt(s.activity.in_consensus)}</a>:"—"],
      ["file","Unfinalized submissions",s?<a href="#/consensus?confirmation=provisional">{fmt(s.activity.provisional)}</a>:"—"],
      ["block","Live discovery block",s?.sync?.live_head?<a href={`#/blocks/${s.sync.live_head}`}>{height(s.sync.live_head)}</a>:"—"],
      ["block","Finalized block indexed",net?.indexed_head!=null?<a href={`#/blocks/${net.indexed_head}`}>{height(net.indexed_head)}</a>:"—"],
      ["clock","Finalized block age",<Timestamp value={net?.latest_block_time}/>]
    ].map(([icon,label,value])=><div key={String(label)}><dt><OverviewIcon name={icon as IconName}/>{label}</dt><dd>{value}</dd></div>)}</dl><a className={`ov-chain-state ${healthy?"ready":"delayed"}`} href="#/endpoints"><span className="ov-health-icon"><OverviewIcon name={healthy?"check":"clock"}/></span><span>{chainState}</span><b>{healthy?"Healthy":!live?"Paused":"Check status"}</b></a><p className="ov-note">A contract decision can be finalized while its submission block is still unfinalized.</p><ErrorState message={d.error?"Chain status could not be refreshed.":null} retry={d.refresh} stale={!!net}/></Panel>
    <Panel title="Recent contract transactions" subtitle="Latest intelligent contract executions from the past 24 hours." icon="transactions" className="ov-recent" aside={<a href="#/consensus?days=1">View all transactions <OverviewIcon name="arrowRight"/></a>}><ErrorState message={recent.error?"Recent transactions could not be refreshed.":null} retry={recent.refresh} stale={!!recent.data}/>{recent.data?<RecentTransactions rows={recent.data.transactions}/>:<Empty>{recent.error?"Transactions are unavailable.":"Loading recent transactions…"}</Empty>}</Panel>
    <Panel title="Most active contracts" subtitle="Contracts with the highest transaction volume." icon="bars" className="ov-contracts" aside={<span className="ov-period">Past 24 hours</span>}><ActiveContracts data={s}/></Panel>
    {s&&s.activity.failed_24h>0&&<section className="ov-review"><OverviewIcon name="warning"/><div><h2>Failure review</h2><p>{fmt(s.activity.failed_24h)} contract executions failed in the last 24 hours ({failureRate} of contract transactions). Inspect errors, validator rounds, and retained outputs.</p></div><a href="#/consensus?days=1&execution=failed">Review failures <OverviewIcon name="arrowRight"/></a></section>}
    <details className="ov-coverage"><summary><OverviewIcon name="database"/><span><strong>Data coverage & chain details</strong><small>Indexer status, chain configuration, and data coverage information.</small></span><OverviewIcon name="chevron" className="ov-chevron"/></summary>
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
  </div>;
}

/** Decorative vector horizon; the chart and network information remain real UI. */
export function OverviewHorizon() {
  const edge = "M60 170C270 56 535-10 850-8";
  const surface = `${edge}L850 200H60Z`;
  return <svg className="ov-horizon" viewBox="0 0 850 170" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="ov-atmosphere" x1="90" y1="130" x2="740" y2="0" gradientUnits="userSpaceOnUse">
        <stop stopColor="#0250c7" stopOpacity=".1"/><stop offset=".55" stopColor="#047bff"/><stop offset=".72" stopColor="#149dff"/><stop offset=".78" stopColor="#bceeff"/><stop offset=".84" stopColor="#1375ff"/><stop offset="1" stopColor="#095cf2" stopOpacity=".2"/>
      </linearGradient>
      <radialGradient id="ov-surface" cx="0" cy="0" r="1" gradientTransform="translate(520 -20) rotate(89) scale(180 570)" gradientUnits="userSpaceOnUse">
        <stop stopColor="#074798"/><stop offset=".38" stopColor="#06245b"/><stop offset="1" stopColor="#030912" stopOpacity="0"/>
      </radialGradient>
      <linearGradient id="ov-horizon-fade" x1="0" y1="0" x2="0" y2="170" gradientUnits="userSpaceOnUse">
        <stop stopColor="white"/><stop offset="1" stopColor="white" stopOpacity="0"/>
      </linearGradient>
      <filter id="ov-halo" x="-20%" y="-80%" width="140%" height="260%"><feGaussianBlur stdDeviation="3"/></filter>
      <filter id="ov-clouds" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency=".013 .15" numOctaves="3" seed="8"/>
        <feColorMatrix type="matrix" values="0 0 0 0 .12 0 0 0 0 .36 0 0 0 0 .8 0 0 0 .2 0"/>
      </filter>
      <clipPath id="ov-surface-clip"><path d={surface}/></clipPath>
      <mask id="ov-surface-mask"><rect width="850" height="170" fill="url(#ov-horizon-fade)"/></mask>
    </defs>
    <path d={surface} fill="url(#ov-surface)"/>
    <g clipPath="url(#ov-surface-clip)" mask="url(#ov-surface-mask)">
      <rect x="70" width="780" height="170" filter="url(#ov-clouds)" opacity=".3"/>
      <path d="M205 160c146-95 308-111 532-139M290 155c139-76 270-107 453-115M400 150c80-67 193-86 289-92" stroke="#2073c1" strokeWidth=".5" opacity=".18"/>
    </g>
    <path d={edge} stroke="url(#ov-atmosphere)" strokeWidth="6" filter="url(#ov-halo)" opacity=".9"/>
    <path d={edge} stroke="url(#ov-atmosphere)" strokeWidth="2"/>
    <path d={edge} stroke="url(#ov-atmosphere)" strokeWidth=".6" transform="translate(0 -1)"/>
  </svg>;
}
