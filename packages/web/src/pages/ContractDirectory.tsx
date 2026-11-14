import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { get } from "../api";
import { usePolling } from "../usePolling";
import { pollingKey } from "../pollingCache";
import { fmt, short } from "../lib";
import { activityBuckets, activityChange } from "../overviewActivity";
import { decisionStages } from "../contractDirectoryState";
import { contractRoute, consensusRoute, loadNativeOverview, getNativeTransactions, statusLabel, type Contract, type NativeOverview, type NativeTransaction } from "../genlayer";
import { addressRoute, txRoute } from "../transactionExplorer";
import { ExplorerIcon as Icon, type ExplorerIconName } from "../components/ExplorerBrand";
import { ResponsiveTable } from "../components/ResponsiveTable";
import { Timestamp } from "../components/Timestamp";
import { Outcome } from "./Observatory";
import "./contract-directory.css";

type Kind = "all" | "intelligent" | "evm";
type Sort = "activity" | "recent";
function readFilters() {
  const p = new URLSearchParams(window.location.hash.split("?")[1]);
  return { kind: (["intelligent", "evm"].includes(p.get("kind") ?? "") ? p.get("kind") : "all") as Kind, sort: (p.get("sort") === "recent" ? "recent" : "activity") as Sort, search: p.get("q") ?? "" };
}
function Panel({ title, subtitle, icon, aside, className = "", children }: { title: string; subtitle?: string; icon: ExplorerIconName; aside?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`cd-panel ${className}`}><header><span className="cd-icon"><Icon name={icon}/></span><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{aside && <div className="cd-panel-actions">{aside}</div>}</header>{children}</section>;
}
function ErrorState({ error, retry, stale = false }: { error: string | null; retry: () => void; stale?: boolean }) {
  return error ? <div className="cd-notice" role="status"><span>{stale && "Showing previous data. "}{error}</span><button type="button" onClick={retry}>Retry</button></div> : null;
}
function Empty({ children }: { children: ReactNode }) { return <div className="cd-empty">{children}</div>; }
function Change({ value, previous, failure = false }: { value: number; previous?: number; failure?: boolean }) {
  const change = activityChange(value, previous);
  return <span className={`cd-change ${change.direction}${failure ? " failure" : ""}`} title={previous == null ? "Previous window unavailable" : `${fmt(previous)} in the previous 24 hours`}>
    {change.direction === "up" || change.direction === "down" ? <Icon name={change.direction === "up" ? "trendUp" : "trendDown"}/> : null}{change.label}
  </span>;
}
function Spark({ values, label, failure = false }: { values: number[]; label: string; failure?: boolean }) {
  const max = Math.max(1, ...values), step = 70 / Math.max(1, values.length);
  return <svg className={`cd-spark${failure ? " failure" : ""}`} viewBox="0 0 70 24" role="img" aria-label={label}><title>{label}: {values.join(", ")}</title>{values.map((n, i) => <rect key={i} x={i * step} y={24 - n / max * 23} width={Math.max(.5, step - 1)} height={Math.max(.7, n / max * 23)}/>)}</svg>;
}
function Metric({ title, value, note, icon, href, previous, values, failure = false, badge }: { title: string; value?: number; note: ReactNode; icon: ExplorerIconName; href?: string; previous?: number; values?: number[]; failure?: boolean; badge?: string }) {
  return <div className={`cd-metric${failure ? " failure" : ""}`}><span className="cd-icon"><Icon name={icon}/></span><div className="cd-metric-copy"><span>{title}</span><div><strong>{value == null ? "—" : href ? <a href={href}>{fmt(value)}</a> : fmt(value)}</strong>{value != null && previous != null && <Change value={value} previous={previous} failure={failure}/>} {badge && <span className="cd-metric-badge">{badge}</span>}</div><small>{note}</small></div>{values && <Spark values={values} label={`${title} per hour, past 24 hours`} failure={failure}/>}</div>;
}
function ActivityChart({ data }: { data: NativeOverview }) {
  const ref = useRef<HTMLDivElement>(null), [width, setWidth] = useState(700), [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(250, entry.contentRect.width)));
    observer.observe(ref.current);return () => observer.disconnect();
  }, []);
  const points = activityBuckets(data.series.points, data.series.bucket_secs, Date.parse(data.series.until));
  const max = Math.max(3, Math.ceil(Math.max(...points.map(p => p.txs), 1) / 3) * 3), left = 36, right = width - 12, base = 120;
  const coords = points.map((p, i) => ({ x: left + i * (right - left) / Math.max(1, points.length - 1), y: base - p.txs / max * 100 }));
  const line = coords.map((p, i) => i === 0 ? `M${p.x},${p.y}` : `C${(coords[i-1].x+p.x)/2},${coords[i-1].y} ${(coords[i-1].x+p.x)/2},${p.y} ${p.x},${p.y}`).join(" ");
  const point = selected == null ? null : points[selected];
  return <div className="cd-chart" ref={ref}>
    <svg viewBox={`0 0 ${width} 150`} role="img" aria-label="Native deployments and calls per hour during the past 24 hours">
      <defs><linearGradient id="cd-area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#8660ff" stopOpacity=".55"/><stop offset="1" stopColor="#355eff" stopOpacity=".04"/></linearGradient><linearGradient id="cd-line" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#328bff"/><stop offset="1" stopColor="#a77aff"/></linearGradient></defs>
      {[0,1,2,3].map(i => {const y = base - i * 100 / 3;return <g className="cd-gridline" key={i}><line x1={left} x2={right} y1={y} y2={y}/><text x={left - 8} y={y+3} textAnchor="end">{fmt(max*i/3)}</text></g>;})}
      <path d={`${line} L${right},${base} L${left},${base} Z`} fill="url(#cd-area)"/><path d={line} fill="none" stroke="url(#cd-line)" strokeWidth="2"/>
      {points.map((p, i) => <g key={p.time} tabIndex={0} role="graphics-symbol" aria-label={`${new Date(p.time).toISOString()}: ${p.txs} transactions`} onFocus={()=>setSelected(i)} onBlur={()=>setSelected(null)} onMouseEnter={()=>setSelected(i)} onMouseLeave={()=>setSelected(null)}>
        <rect x={Math.max(left,coords[i].x-(right-left)/points.length/2)} y="10" width={(right-left)/points.length} height="112" fill="transparent"/>
        {selected===i && <><line className="cd-marker-line" x1={coords[i].x} x2={coords[i].x} y1="12" y2={base}/><circle cx={coords[i].x} cy={coords[i].y} r="3" fill="#a77aff" stroke="var(--panel)"/></>}
        {i % (width < 450 ? 6 : 3) === 0 && <text x={coords[i].x} y="141" textAnchor="middle">{new Date(p.time).toISOString().slice(11,16)}</text>}
      </g>)}
    </svg>
    <div className={`cd-chart-tooltip${point ? " visible" : ""}`} aria-live="polite" style={{left: selected == null ? 0 : Math.max(0,Math.min(width-130,coords[selected].x-20))}}>{point && <><span>{new Date(point.time).toISOString().slice(11,16)} UTC</span><strong>{fmt(point.txs)} transactions</strong></>}</div>
  </div>;
}
function CopyAddress({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState("");
  useEffect(()=>{if(!state)return;const timer=setTimeout(()=>setState(""),2000);return()=>clearTimeout(timer);},[state]);
  return <><button className="cd-copy" type="button" title={state || `Copy ${label}`} aria-label={`Copy ${label}`} onClick={async()=>{try{await navigator.clipboard.writeText(value);setState("Copied");}catch{setState("Copy unavailable");}}}><Icon name={state==="Copied"?"check":"transactions"}/></button><span className="sr-only" role="status">{state}</span></>;
}
function Progress({ transaction }: { transaction: NativeTransaction }) {
  return <ol className="cd-progress" aria-label="Observed decision progress">{decisionStages(transaction).map(stage=><li key={stage.label} className={stage.state} title={stage.detail}><i aria-hidden="true"/><span>{stage.label}</span><span className="sr-only">: {stage.detail}</span></li>)}</ol>;
}

export function ContractDirectory({ live }: { live: boolean }) {
  const [filters, setFilters] = useState(readFilters), [query, setQuery] = useState(filters.search), [page, setPage] = useState(0), [pageSize, setPageSize] = useState(5), [advanced, setAdvanced] = useState(false);
  const [execution, setExecution] = useState(""), [decisionContract, setDecisionContract] = useState(""), [days, setDays] = useState("1");
  const summary = usePolling(loadNativeOverview, live, 15000, "native-overview"), data = summary.data;
  useEffect(()=>{const change=()=>{const next=readFilters();setFilters(next);setQuery(next.search);setPage(0);};window.addEventListener("hashchange",change);return()=>window.removeEventListener("hashchange",change);},[]);
  function changeFilters(next: Partial<typeof filters>) {
    const values = { ...filters, ...next }, params = new URLSearchParams();
    if(values.kind!=="all")params.set("kind",values.kind);if(values.sort!=="activity")params.set("sort",values.sort);if(values.search)params.set("q",values.search);
    setFilters(values);setQuery(values.search);setPage(0);window.history.pushState(null,"",`#/contracts${params.size ? `?${params}` : ""}`);
  }
  const load = useCallback(()=>get<{contracts:Contract[];total:number}>(`/api/v1/contracts?${new URLSearchParams({kind:filters.kind,sort:filters.sort,q:filters.search,limit:String(pageSize),offset:String(page*pageSize),include_activity:"1"})}`),[filters.kind,filters.sort,filters.search,page,pageSize]);
  const directory = usePolling(load,live,15000,pollingKey("contract-directory",filters.kind,filters.sort,filters.search,page,pageSize));
  const recentParams = {limit:"5",days,execution,...(decisionContract?{address:decisionContract}:{})};
  const loadRecent = useCallback(()=>getNativeTransactions({limit:"5",days,execution,...(decisionContract?{address:decisionContract}:{})}),[days,execution,decisionContract]);
  const recent = usePolling(loadRecent,live,15000,pollingKey("directory-decisions",days,execution,decisionContract));
  const counts = data ? {all:data.contracts.total,intelligent:data.contracts.intelligent,evm:Math.max(0,data.contracts.total-data.contracts.intelligent)} : null;
  const share = counts && counts.all ? counts.intelligent/counts.all*100 : 0;
  const points = data ? activityBuckets(data.series.points,data.series.bucket_secs,Date.parse(data.series.until)) : [];
  const failures = data ? points.map(p=>data.series.points.find(x=>Date.parse(x.t)===p.time)?.failed??0) : [];
  const contractOptions = new Map<string,string>();
  for(const c of data?.top_contracts??[])contractOptions.set(c.address,c.name??short(c.address));
  for(const c of directory.data?.contracts??[])if(c.kind==="intelligent")contractOptions.set(c.address,c.name??short(c.address));
  if(decisionContract&&!contractOptions.has(decisionContract))contractOptions.set(decisionContract,short(decisionContract));
  const types: {id:Kind;label:string}[]=[{id:"all",label:"All contracts"},{id:"intelligent",label:"Intelligent"},{id:"evm",label:"EVM"}];
  const total=directory.data?.total??0, start=total?page*pageSize+1:0, end=Math.min((page+1)*pageSize,total);
  const allDecisions=new URLSearchParams(recentParams);allDecisions.delete("limit");
  return <div className="cd-page">
    <div className="cd-section-label">GENLAYER INTELLIGENCE<span/></div>
    <ErrorState error={summary.error?"Contract activity could not be refreshed.":null} retry={summary.refresh} stale={!!data}/>
    <div className="cd-metrics">
      <Metric title="Intelligent contracts" value={data?.contracts.intelligent} icon="database" note="Discovered in indexed history" badge={counts?`${share.toFixed(1)}% of total`:undefined}/>
      <Metric title="Native transactions · 24h" value={data?.activity.calls_24h} icon="transfer" note={data?`${fmt(data.activity.active_24h)} active contracts`:"Loading activity"} previous={data?.comparison?.activity.calls_24h} values={data?points.map(p=>p.txs):undefined} href="#/consensus?days=1"/>
      <Metric title="In consensus" value={data?.activity.in_consensus} icon="block" note="Including accepted, awaiting finality" badge={live?"Live":"Paused"} href="#/consensus"/>
      <Metric title="Execution failures · 24h" value={data?.activity.failed_24h} icon="warning" note={data?`${fmt(data.activity.calls_24h)} native transactions in this window`:"Loading outcomes"} previous={data?.comparison?.activity.failed_24h} values={data?failures:undefined} href="#/consensus?days=1&execution=failed" failure/>
    </div>
    <div className="cd-charts">
      <Panel title="Contract activity" subtitle="Native deployments and calls to intelligent contracts (UTC)." icon="chart" className="cd-activity" aside={<span className="cd-window"><Icon name="calendar"/>Past 24 hours</span>}>
        {data?<ActivityChart data={data}/>:<Empty>{summary.error?"Activity is unavailable.":"Loading contract activity…"}</Empty>}
      </Panel>
      <Panel title="Contracts by type" subtitle="Distribution of indexed contracts." icon="network" className="cd-types">
        {counts?<div className="cd-type-content"><div className="cd-donut" role="img" aria-label={`${fmt(counts.intelligent)} intelligent and ${fmt(counts.evm)} EVM contracts`} style={{background:counts.all?`conic-gradient(#428dff 0% ${share}%,#9568ed ${share}% 100%)`:"var(--line)"}}><div><strong>{fmt(counts.all)}</strong><span>Contracts</span></div></div><div className="cd-type-legend">{types.slice(1).map(type=><button type="button" key={type.id} onClick={()=>changeFilters({kind:type.id})} aria-pressed={filters.kind===type.id}><span><i className={type.id}/>{type.label}</span><strong>{fmt(counts[type.id])}</strong><small>{counts.all?(counts[type.id]/counts.all*100).toFixed(1):"0"}%</small></button>)}</div></div>:<Empty>Waiting for indexed contract counts.</Empty>}
      </Panel>
    </div>
    <Panel title="Contract directory" subtitle="Browse intelligent contracts and indexed EVM deployments." icon="database" className="cd-directory" aside={<div className="cd-type-tabs" role="group" aria-label="Contract type">{types.map(type=><button key={type.id} type="button" aria-pressed={filters.kind===type.id} onClick={()=>changeFilters({kind:type.id})}>{type.label}<span>{counts?fmt(counts[type.id]):"—"}</span></button>)}</div>}>
      <div className="cd-toolbar"><form onSubmit={e=>{e.preventDefault();changeFilters({search:query.trim()});}}><label className="sr-only" htmlFor="contract-search">Contract name, address, method or description</label><input id="contract-search" type="search" maxLength={100} placeholder="Search name, address, method or description…" value={query} onChange={e=>setQuery(e.target.value)}/><button type="submit">Search</button></form><label>Activity<select aria-label="Sort contracts" value={filters.sort} onChange={e=>changeFilters({sort:e.target.value as Sort})}><option value="activity">Most active · 24h</option><option value="recent">Recently discovered</option></select></label><button className="cd-filter-toggle" type="button" aria-expanded={advanced} aria-controls="directory-filters" onClick={()=>setAdvanced(!advanced)}><Icon name="settings"/>Filters</button></div>
      {advanced&&<div id="directory-filters" className="cd-advanced"><label>Type<select aria-label="Filter contract type" value={filters.kind} onChange={e=>changeFilters({kind:e.target.value as Kind})}>{types.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label><label>Rows<select aria-label="Contracts per page" value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(0);}}>{[5,10,25].map(n=><option key={n}>{n}</option>)}</select></label><span>Calls and trends cover the past 24 hours.</span><button type="button" onClick={()=>changeFilters({kind:"all",sort:"activity",search:""})}>Clear filters</button></div>}
      <ErrorState error={directory.error} retry={directory.refresh} stale={!!directory.data}/>
      {!directory.data&&!directory.error&&<Empty>Loading contracts…</Empty>}
      {directory.data&&<><div className="cd-scroll"><ResponsiveTable className="cd-table cd-contract-table"><thead><tr><th>Contract</th><th>Description</th><th>Type</th><th>Creator</th><th>Deployment</th><th>Calls · 24h</th><th>Trend</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>{directory.data.contracts.map(c=><tr key={c.address}>
        <td><a className="cd-contract-name" href={contractRoute(c.address)}>{c.name??short(c.address)}</a><span className="cd-address-line"><a href={contractRoute(c.address)} title={c.address}>{short(c.address)}</a><CopyAddress value={c.address} label="contract address"/></span></td>
        <td className="cd-description" title={c.profile?.description}><span className="cd-description-text">{c.profile?.description??(c.kind==="evm"?"Indexed EVM contract deployment.":"Contract profile is not available yet.")}</span></td>
        <td><span className={`cd-kind ${c.kind}`}>{c.kind==="intelligent"?"Intelligent":"EVM"}</span></td>
        <td>{c.creator?<span className="cd-address-line"><a href={addressRoute(c.creator)} title={c.creator}>{short(c.creator)}</a><CopyAddress value={c.creator} label="creator address"/></span>:"—"}</td>
        <td>{c.deployment_id||c.deployment_tx?<a href={c.deployment_id?consensusRoute(c.deployment_id):txRoute(c.deployment_tx!)} title="View deployment transaction">{c.deployed_at?<Timestamp value={c.deployed_at}/>:"View deployment"}</a>:"Not indexed yet"}</td>
        <td className="cd-number">{fmt(c.calls_24h)}</td>
        <td>{c.activity?<div className="cd-trend"><Spark values={c.activity.points.map(p=>p.calls)} label={`Hourly calls for ${c.name??short(c.address)}`}/><Change value={c.calls_24h} previous={c.activity.previous_calls}/></div>:<span className="cd-muted">Unavailable</span>}</td>
        <td><a className="cd-open" href={contractRoute(c.address)} aria-label={`Open ${c.name??short(c.address)} contract`}><Icon name="arrowRight"/></a></td>
      </tr>)}</tbody></ResponsiveTable></div>{!directory.data.contracts.length&&<Empty>No contracts match these filters.{/^0x[0-9a-fA-F]{40}$/.test(filters.search)&&<p><a href={contractRoute(filters.search)}>Look up this address directly →</a></p>}</Empty>}
      <div className="cd-pagination"><span>Showing {fmt(start)}–{fmt(end)} of {fmt(total)} contracts</span><button type="button" disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button><button type="button" disabled={(page+1)*pageSize>=total} onClick={()=>setPage(p=>p+1)}>Next</button></div></>}
    </Panel>
    <Panel title="Recent contract decisions" subtitle="Observed execution and consensus state for intelligent contracts." icon="file" className="cd-decisions" aside={<div className="cd-decision-filters"><label>Execution<select aria-label="Decision execution outcome" value={execution} onChange={e=>setExecution(e.target.value)}><option value="">All outcomes</option><option value="returned">Returned</option><option value="failed">Failed</option><option value="unknown">Unavailable</option></select></label><label>Contract<select aria-label="Decision contract" value={decisionContract} onChange={e=>setDecisionContract(e.target.value)}><option value="">All contracts</option>{[...contractOptions].map(([address,name])=><option key={address} value={address}>{name} · {short(address)}</option>)}</select></label><select aria-label="Decision time window" value={days} onChange={e=>setDays(e.target.value)}><option value="1">Past 24 hours</option><option value="7">Past 7 days</option><option value="30">Past 30 days</option></select></div>}>
      <ErrorState error={recent.error} retry={recent.refresh} stale={!!recent.data}/>
      {recent.data?<><div className="cd-scroll"><ResponsiveTable className="cd-table cd-decision-table"><thead><tr><th>Decision ID</th><th>Contract</th><th>Method / transaction</th><th>Consensus</th><th>Execution</th><th>Observed progress</th><th>Age</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>{recent.data.transactions.map(t=><tr key={t.id}>
        <td><span className="cd-address-line"><a href={consensusRoute(t.id)} title={t.id}>{short(t.id)}</a><CopyAddress value={t.id} label="decision ID"/></span></td>
        <td><a className="cd-contract-name" href={contractRoute(t.recipient)}>{t.contract_name??short(t.recipient)}</a><small>{short(t.recipient)}</small></td>
        <td><a className="cd-method" href={consensusRoute(t.id)} title={t.method??t.id}>{t.method??(t.kind==="deploy"?"Deploy contract":"View decision")}</a><small>{short(t.id)}</small></td>
        <td><span className={`cd-status ${t.status==="Finalized"?"done":t.status==="Canceled"?"failed":"pending"}`}>{statusLabel(t.status)}</span></td>
        <td><Outcome value={t.execution_result}/></td><td><Progress transaction={t}/></td><td><Timestamp value={t.created_at??t.observed_at}/>{!t.created_at&&<small>First observed</small>}</td>
        <td><a className="cd-open" href={consensusRoute(t.id)} aria-label={`Open decision ${short(t.id)}`}><Icon name="arrowRight"/></a></td>
      </tr>)}</tbody></ResponsiveTable></div>{!recent.data.transactions.length&&<Empty>No decisions match these filters.</Empty>}<div className="cd-table-footer"><span>Showing {recent.data.transactions.length?"1":"0"}–{recent.data.transactions.length} of {fmt(recent.data.total)} decisions</span><a href={`#/consensus?${allDecisions}`}>View all decisions <Icon name="arrowRight"/></a></div></>:!recent.error&&<Empty>Loading recent decisions…</Empty>}
    </Panel>
    <details className="cd-coverage"><summary>Data coverage and activity definitions <Icon name="chevron"/></summary><p>Contract types reflect indexed intelligent contracts and EVM deployments. Directory calls and trends count finalized native submissions or indexed EVM transactions. The activity chart also includes provisional native submissions. Contract-decision finality is separate from submission-block finality.</p>{data?.sync&&<p>Native submissions indexed through #{fmt(Number(data.sync.head))}. {data.sync.live_updated_at&&<>Live discovery updated <Timestamp value={data.sync.live_updated_at}/>.<br/></>}{data.sync.last_error||data.sync.live_error}</p>}</details>
  </div>;
}
