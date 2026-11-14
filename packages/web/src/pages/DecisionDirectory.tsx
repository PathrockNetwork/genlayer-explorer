import { useCallback, useEffect, useState, type ReactNode } from "react";
import { get } from "../api";
import { usePolling } from "../usePolling";
import { pollingKey } from "../pollingCache";
import { fmt, short, duration } from "../lib";
import { contractRoute, consensusRoute, getNativeTransactions, statusLabel, type NativeTransaction } from "../genlayer";
import { txRoute } from "../transactionExplorer";
import { decisionLifecycle, decisionStatuses, decisionTone, outcomeNames } from "../decisionState";
import { ExplorerIcon as Icon, type ExplorerIconName } from "../components/ExplorerBrand";
import { Timestamp } from "../components/Timestamp";
import { ResponsiveTable } from "../components/ResponsiveTable";
import { Outcome } from "./Observatory";
import "./decision-directory.css";

type Summary = {
  since: string; until: string; days: number; total: number;
  statuses: { status: string; count: number }[];
  outcomes: { outcome: string; count: number }[];
  participation: { bucket_secs: number; points: { time: string; assigned: number; voted: number }[] };
  contracts: { address: string; name: string | null; calls: number }[];
  featured: NativeTransaction | null;
};
type Filters = { status: string; execution: string; address: string; days: string; confirmation: string; submission: string; q: string };
function readFilters(): Filters {
  const p = new URLSearchParams(window.location.hash.split("?")[1]);
  return { status: p.get("status") ?? "", execution: p.get("execution") ?? "", address: p.get("address") ?? "", days: p.get("days") ?? "1", confirmation: p.get("confirmation") ?? "", submission: p.get("submission") ?? "", q: p.get("q") ?? "" };
}
function Panel({ title, subtitle, icon, aside, children, className = "" }: { title: ReactNode; subtitle?: string; icon: ExplorerIconName; aside?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`dd-panel ${className}`}><header><span className="dd-icon"><Icon name={icon}/></span><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{aside && <div className="dd-panel-actions">{aside}</div>}</header>{children}</section>;
}
function ErrorState({ error, retry, stale }: { error: string | null; retry: () => void; stale: boolean }) {
  return error ? <div className="dd-error" role="status"><span>{stale && "Showing previous data. "}{error}</span><button onClick={retry}>Retry</button></div> : null;
}
function Status({ value }: { value: string }) { return <span className={`dd-status ${decisionTone(value)}`}>{statusLabel(value)}</span>; }
function Votes({ transaction, large = false }: { transaction: NativeTransaction; large?: boolean }) {
  const p = transaction.progress;
  if (!p || p.assigned == null || p.revealed == null || !p.assigned) return <span className="dd-muted">Unavailable</span>;
  const { assigned, revealed } = p;
  const percentage = revealed / assigned * 100;
  return <div className={`dd-votes ${decisionTone(transaction.status)}${large ? " large" : ""}`}>
    {large ? <div className="dd-vote-track" role="meter" aria-label="Latest round revealed votes" aria-valuemin={0} aria-valuemax={assigned} aria-valuenow={revealed}><i style={{width:`${percentage}%`}}/></div> : <svg viewBox="0 0 100 10" role="img" aria-label={`${revealed} of ${assigned} validators revealed votes`}><title>Latest observed round: {revealed} / {assigned} revealed votes</title>{Array.from({length:Math.min(24,assigned)},(_,i)=><rect key={i} x={i*100/Math.min(24,assigned)} y="1" width={100/Math.min(24,assigned)-2} height="8" rx="1" className={i/Math.min(24,assigned)<revealed/assigned ? "filled" : ""}/>)}</svg>}
    <span>{fmt(revealed)} / {fmt(assigned)} <small>({percentage.toFixed(0)}%)</small></span>
  </div>;
}
function Featured({ transaction }: { transaction: NativeTransaction | null }) {
  if (!transaction) return <div className="dd-feature-empty">No decision is available in this time window.</div>;
  const t=transaction, p=t.progress;
  return <div className="dd-feature-grid">
    <Panel title={<>{t.contract_name ?? short(t.recipient)}.<wbr/>{t.method ?? (t.kind === "deploy" ? "deploy" : "call")}()</>} subtitle="Decision in focus" icon="block" className="dd-feature" aside={<Status value={t.status}/> }>
      <a className="dd-feature-contract" href={contractRoute(t.recipient)}>{short(t.recipient)} · Contract: {t.contract_name ?? "View contract"} <Icon name="arrowRight"/></a>
      <dl>
        <div><dt>Submission</dt><dd><a href={txRoute(t.submission_hash)}>#{fmt(t.block_number)}</a> <span><Timestamp value={t.created_at ?? t.observed_at}/></span></dd></div>
        <div><dt>Method</dt><dd>{t.method ?? "Unavailable"}</dd></div>
        <div><dt>Type</dt><dd>Intelligent · {t.kind === "deploy" ? "Deployment" : "Contract call"}</dd></div>
        <div><dt>Rounds</dt><dd>{t.rounds == null ? "Unavailable" : `${t.rounds} observed`}{p?.round != null && ` · Latest #${p.round}`}</dd></div>
        <div><dt>Revealed votes</dt><dd>{p?.assigned && p.revealed != null ? `${p.revealed} / ${p.assigned} (${(p.revealed/p.assigned*100).toFixed(0)}%)` : "Unavailable"}</dd></div>
      </dl>
      <a className="dd-feature-detail" href={consensusRoute(t.id)}>Inspect decision <Icon name="arrowRight"/></a>
    </Panel>
    <Panel title="Execution lifecycle" subtitle="Recorded decision progress and state." icon="consensus" className="dd-lifecycle">
      <ol>{decisionLifecycle(t).map(stage=><li key={stage.label} className={stage.state} title={stage.detail}><i>{stage.state === "done" && <Icon name="check"/>}</i><strong>{stage.label}</strong><span>{stage.time ? <Timestamp value={stage.time}/> : stage.label === "Consensus" ? statusLabel(t.status) : stage.label === "Execution" ? outcomeNames[t.execution_result ?? "unknown"] ?? "Unavailable" : stage.state === "done" ? "Recorded" : stage.state === "active" ? "In progress" : stage.state === "unknown" ? "Unavailable" : "Awaiting"}</span></li>)}</ol>
      <div className="dd-lifecycle-progress"><Votes transaction={t} large/><small>Latest round · revealed votes</small></div>
      <p className="dd-lifecycle-note">{t.confirmation === "provisional" ? "Submission block is provisional. " : t.confirmation === "orphaned" ? "Submission was orphaned. " : ""}Round count and vote progress do not predict finality.</p>
    </Panel>
  </div>;
}
const statusColors: Record<string,string>={Finalized:"#8f65ef",Canceled:"#fb6684",Accepted:"#2bdab1",Proposing:"#ad8dff",LeaderTimeout:"#e6ad62",ValidatorsTimeout:"#e6ad62"};
function Distribution({ summary, select }: { summary: Summary; select: (status: string) => void }) {
  let current = 0;
  const gradient = summary.statuses.map(s=>{const start=current;current+=s.count/Math.max(1,summary.total)*100;return `${statusColors[s.status]??"#5b9df4"} ${start}% ${current}%`;}).join(",");
  return <div className="dd-distribution"><div className="dd-donut" role="img" aria-label={`${fmt(summary.total)} decisions in the selected summary window`} style={{background:summary.total?`conic-gradient(${gradient})`:"var(--line)"}}><div><strong>{fmt(summary.total)}</strong><span>Decisions</span></div></div><div className="dd-distribution-legend">{summary.statuses.map(s=><button key={s.status} onClick={()=>select(s.status)}><i style={{background:statusColors[s.status]??"#5b9df4"}}/><span>{statusLabel(s.status)}</span><small>{(s.count/Math.max(1,summary.total)*100).toFixed(1)}%</small><b>{fmt(s.count)}</b></button>)}{!summary.total&&<span>No dated decisions.</span>}</div></div>;
}
function Participation({ summary }: { summary: Summary }) {
  const [selected,setSelected]=useState<number|null>(null),points=summary.participation.points,point=selected == null ? null : points[selected];
  return <div className="dd-participation"><div className="dd-participation-plot"><div className="dd-chart-axis"><span>100%</span><span>50%</span><span>0%</span></div><div className="dd-bars">{points.map((p,i)=><button key={p.time} onMouseEnter={()=>setSelected(i)} onMouseLeave={()=>setSelected(null)} onFocus={()=>setSelected(i)} onBlur={()=>setSelected(null)} aria-label={`${p.time}: ${p.assigned ? `${p.voted} of ${p.assigned} assignments have a recorded vote` : "No indexed assignments"}`}><i style={{height:p.assigned?`${p.voted/p.assigned*100}%`:"2px"}} className={p.assigned?"":"missing"}/><span>{i%Math.ceil(points.length/6)===0?(summary.days===1?p.time.slice(11,16):p.time.slice(5,10)):""}</span></button>)}</div></div><div className="dd-chart-reading" aria-live="polite">{point ? `${point.time.slice(5,16).replace("T"," ")} UTC · ${point.assigned ? `${fmt(point.voted)} / ${fmt(point.assigned)} recorded votes (${(point.voted/point.assigned*100).toFixed(1)}%)` : "No indexed assignments"}` : "Confirmed submissions · vote / assignment share"}</div></div>;
}
function Outcomes({summary,select}:{summary:Summary;select:(outcome:string)=>void}) {
  const known=Object.keys(outcomeNames),other=summary.outcomes.filter(x=>!known.includes(x.outcome)).map(x=>x.outcome);
  return <div className="dd-outcomes">{[...known,...other].map(outcome=>{const count=summary.outcomes.find(x=>x.outcome===outcome)?.count??0,percent=count/Math.max(1,summary.total)*100;return <button key={outcome} onClick={()=>select(outcome)} className={outcome==="returned"?"returned":outcome==="unknown"?"unknown":"failed"}><span>{outcomeNames[outcome]??outcome}</span><i><b style={{width:`${percent}%`}}/></i><small>{percent.toFixed(1)}%</small><strong>{fmt(count)}</strong></button>;})}</div>;
}

export function DecisionDirectory({live}:{live:boolean}) {
  const [filters,setFilters]=useState(readFilters),[search,setSearch]=useState(filters.q),[page,setPage]=useState(0),[pageSize,setPageSize]=useState(5),[advanced,setAdvanced]=useState(false),[focused,setFocused]=useState<string|null>(null);
  const changeFilters=(values:Partial<Filters>)=>{const next={...filters,...values},params=new URLSearchParams();for(const [key,value] of Object.entries(next))if(value||key==="days")params.set(key,value);setFilters(next);setSearch(next.q);setPage(0);setFocused(null);window.history.pushState(null,"",`#/consensus?${params}`);};
  useEffect(()=>{const update=()=>{const next=readFilters();setFilters(next);setSearch(next.q);setPage(0);setFocused(null);};window.addEventListener("hashchange",update);return()=>window.removeEventListener("hashchange",update);},[]);
  const load=useCallback(()=>getNativeTransactions({...filters,limit:String(pageSize),offset:String(page*pageSize),include_progress:"1"}),[filters,page,pageSize]);
  const list=usePolling(load,live,15000,pollingKey("decision-directory",...Object.values(filters),page,pageSize));
  const summaryDays=["1","7","30"].includes(filters.days)?filters.days:"1";
  const loadSummary=useCallback(()=>get<Summary>(`/api/v1/genlayer/decisions/overview?days=${summaryDays}`),[summaryDays]);
  const summary=usePolling(loadSummary,live,15000,pollingKey("decision-overview",summaryDays)),data=summary.data;
  const chosen=list.data?.transactions.find(t=>t.id===focused)??data?.featured??null;
  const contracts=new Map((data?.contracts??[]).map(c=>[c.address,c.name??short(c.address)]));
  if(filters.address&&!contracts.has(filters.address))contracts.set(filters.address,short(filters.address));
  const windowLabel=summaryDays==="1"?"24 hours":`${summaryDays} days`,total=list.data?.total??0;
  return <div className="dd-page">
    <div className="dd-section-label">GENLAYER INTELLIGENCE<span/></div>
    <ErrorState error={summary.error} retry={summary.refresh} stale={!!data}/>
    {data?<Featured transaction={chosen}/>:<div className="dd-empty">{summary.error?"Decision summary is unavailable.":"Loading decision activity…"}</div>}
    <div className="dd-charts">
      <Panel title="Consensus distribution" subtitle={`Decision states · past ${windowLabel}.`} icon="database" className="dd-consensus-chart">{data?<Distribution summary={data} select={status=>changeFilters({status})}/>:<div className="dd-empty">Waiting for decision states.</div>}</Panel>
      <Panel title="Validator participation" subtitle={`Recorded votes across assigned rounds · past ${windowLabel}.`} icon="chart" className="dd-vote-chart">{data?<Participation summary={data}/>:<div className="dd-empty">Waiting for validator observations.</div>}</Panel>
      <Panel title="Execution outcomes" subtitle={`Contract execution results · past ${windowLabel}.`} icon="code" className="dd-outcome-chart">{data?<Outcomes summary={data} select={execution=>changeFilters({execution})}/>:<div className="dd-empty">Waiting for execution results.</div>}</Panel>
    </div>
    <Panel title="Intelligent-contract decisions" subtitle="Detailed execution and consensus activity for intelligent contracts." icon="file" className="dd-directory" aside={<div className="dd-selects"><label>Execution<select aria-label="Execution outcome" value={filters.execution} onChange={e=>changeFilters({execution:e.target.value})}><option value="">All outcomes</option><option value="failed">All failures</option>{Object.entries(outcomeNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Contract<select aria-label="Decision contract" value={filters.address} onChange={e=>changeFilters({address:e.target.value})}><option value="">All contracts</option>{[...contracts].map(([address,name])=><option key={address} value={address}>{name} · {short(address)}</option>)}</select></label><label>Period<select aria-label="Decision time window" value={filters.days} onChange={e=>changeFilters({days:e.target.value})}><option value="1">Past 24 hours</option><option value="7">Past 7 days</option><option value="30">Past 30 days</option><option value="">All history</option></select></label></div>}>
      <div className="dd-toolbar"><form onSubmit={e=>{e.preventDefault();changeFilters({q:search.trim()});}}><label className="sr-only" htmlFor="decision-search">Decision ID, contract, method or submission</label><input id="decision-search" type="search" maxLength={128} placeholder="Search decision ID, contract, method or transaction…" value={search} onChange={e=>setSearch(e.target.value)}/><button type="submit">Search</button></form><div className="dd-status-tabs" role="group" aria-label="Decision status">{["","Finalized","Canceled","Accepted","Proposing"].map(status=><button type="button" key={status} className={status?decisionTone(status):""} aria-pressed={filters.status===status} onClick={()=>changeFilters({status})}>{status||"All"}</button>)}</div><button aria-expanded={advanced} aria-controls="decision-filters" onClick={()=>setAdvanced(!advanced)}><Icon name="settings"/>Filters</button></div>
      {advanced&&<div className="dd-advanced" id="decision-filters"><label>Status<select aria-label="Consensus status" value={filters.status} onChange={e=>changeFilters({status:e.target.value})}><option value="">All statuses</option>{decisionStatuses.map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select></label><label>Submission<select aria-label="Submission confirmation" value={filters.confirmation} onChange={e=>changeFilters({confirmation:e.target.value})}><option value="">Active submissions</option><option value="confirmed">Confirmed</option><option value="provisional">Provisional</option><option value="orphaned">Orphaned</option></select></label><label>Rows<select aria-label="Decisions per page" value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(0);}}>{[5,10,25].map(n=><option key={n}>{n}</option>)}</select></label></div>}
      {(filters.q||filters.address||filters.status||filters.execution||filters.confirmation||filters.submission)&&<div className="dd-applied"><span>Filtered results{filters.q&&` · “${filters.q}”`}{filters.status&&` · ${statusLabel(filters.status)}`}{filters.address&&` · ${short(filters.address)}`}{filters.confirmation&&` · ${filters.confirmation}`}{filters.submission&&` · submission ${short(filters.submission)}`}</span><button onClick={()=>changeFilters({q:"",address:"",status:"",execution:"",confirmation:"",submission:""})}>Clear filters</button></div>}
      <ErrorState error={list.error} retry={list.refresh} stale={!!list.data}/>
      {!list.data&&!list.error&&<div className="dd-empty">Loading contract decisions…</div>}
      {list.data&&<><div className="dd-scroll"><ResponsiveTable className="dd-table"><thead><tr><th>Decision ID</th><th>Contract</th><th>Method / transaction</th><th>Outcome</th><th>Consensus</th><th>Rounds</th><th>Validator progress</th><th>To last vote</th><th>Age</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>{list.data.transactions.map(t=><tr key={t.id} className={chosen?.id===t.id?"selected":""}>
        <td><a className="dd-id" href={consensusRoute(t.id)} title={t.id}>{short(t.id)}</a><small>{t.confirmation === "provisional"?"Provisional submission":t.confirmation === "orphaned"?"Orphaned submission":""}</small></td>
        <td><a className="dd-contract-name" href={contractRoute(t.recipient)}>{t.contract_name??short(t.recipient)}</a><small>{short(t.recipient)}</small></td>
        <td><button className="dd-focus" onClick={()=>{setFocused(t.id);document.querySelector('.dd-feature-grid')?.scrollIntoView({block:'start'});}} aria-label={`Focus decision ${short(t.id)}`} title="Show this decision in the lifecycle panel">{t.method??(t.kind==="deploy"?"Deploy contract":"View lifecycle")}</button><small><a href={txRoute(t.submission_hash)} title={t.submission_hash}>{short(t.submission_hash)}</a></small></td>
        <td><Outcome value={t.execution_result}/></td><td><Status value={t.status}/></td><td>{t.rounds??"—"}<small>observed</small></td><td><Votes transaction={t}/></td><td title="Receipt creation to last recorded vote; not execution duration or finality">{t.progress?.last_vote_seconds != null?duration(t.progress.last_vote_seconds):"—"}</td><td><Timestamp value={t.created_at??t.observed_at}/>{!t.created_at&&<small>First observed</small>}</td><td><a className="dd-open" href={consensusRoute(t.id)} aria-label={`Open decision ${short(t.id)}`}><Icon name="arrowRight"/></a></td>
      </tr>)}</tbody></ResponsiveTable></div>{!list.data.transactions.length&&<div className="dd-empty">No decisions match these filters.{/^0x[0-9a-fA-F]{64}$/.test(filters.q)&&<p><a href={consensusRoute(filters.q)}>Look up this GenLayer ID directly →</a></p>}</div>}<div className="dd-pagination"><span>Showing {total?page*pageSize+1:0}–{Math.min((page+1)*pageSize,total)} of {fmt(total)} decisions</span><button disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button><button disabled={(page+1)*pageSize>=total} onClick={()=>setPage(p=>p+1)}>Next <Icon name="arrowRight"/></button></div></>}
    </Panel>
    <details className="dd-coverage"><summary>Decision data and timing <Icon name="chevron"/></summary><p>Charts summarize all non-orphaned decisions in the selected summary window; table filters apply to the table. All-history browsing keeps the charts on the past 24 hours. Participation counts recorded votes across indexed validator assignments for confirmed submissions, including multiple rounds; empty buckets have no observations.</p><p>Validator progress shows revealed votes in the latest retained round. “To last vote” measures receipt creation to its last recorded vote, not execution duration or finality. Finalized decisions can contain execution errors or unavailable results. A returned value does not establish the application's business outcome.</p>{data&&<p>Summary updated <Timestamp value={data.until}/> · Receipt evidence is refreshed with the indexer.</p>}</details>
  </div>;
}
