import type { ReactNode } from "react";
import type { Dashboard } from "../useDashboard";
import { get, getAnchor, getBlocks, getTransactions } from "../api";
import { usePolling } from "../usePolling";
import { activityBuckets } from "../overviewActivity";
import { fmt, gen, gwei, short } from "../lib";
import { Timestamp } from "../components/Timestamp";
import { CopyButton, EmptyState, Section, Skeleton } from "../components/ui";
import { addressRoute, txRoute } from "../transactionExplorer";
import "./genlayer-overview.css";

const loadBlocks = () => getBlocks(8);
const loadTransactions = () => getTransactions(6);
const loadActivity = () => get<{ hours: number; bucket_secs: number; points: { t: string; blocks: number; txs: number; gas: number }[] }>("/api/v1/series?hours=24");
const height = (n: number | null | undefined) => n == null ? "—" : `#${fmt(n)}`;

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub: ReactNode }) {
  return <div className="gen-tile"><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>;
}
function Failure({ message, retry, stale = false }: { message: string; retry: () => void; stale?: boolean }) {
  return <div className="gen-error" role="status"><span>{stale ? "Showing previous data. " : ""}{message}</span><button onClick={retry} type="button">Retry</button></div>;
}

export function Overview({ d, live, copied, onCopy }: {
  d: Dashboard; live: boolean; copied: string | null; onCopy: (s: string) => void;
  selected?: number | null; onSelect?: (n: number) => void;
}) {
  const blocks = usePolling(loadBlocks, live, 8_000);
  const transactions = usePolling(loadTransactions, live, 8_000);
  const context = usePolling(getAnchor, live, 12_000);
  const activity = usePolling(loadActivity, live, 60_000);
  const net = d.net;
  const a = context.data;
  const status = !live ? "Updates paused" : d.error ? "Data unavailable" : d.state === "loading" ? "Connecting" : d.state === "stopped" ? "Indexer heartbeat stale" : d.state === "empty" ? "Waiting for indexed blocks" : d.state === "backfill" ? "Synchronizing" : "Caught up to finalized head";
  const minutes = activityBuckets(activity.data?.points ?? [], activity.data?.bucket_secs ?? 900, activity.updatedAt?.getTime() ?? Date.now());
  const barStep = 480 / minutes.length;
  const peak = Math.max(1, ...minutes.map(p => p.txs));
  return <div className="gen-overview">
    <div className="gen-status"><span className={`gen-status-label ${live && d.state === "normal" ? "ready" : ""}`}><i />{status}</span><span>Bradbury · Chain 4221 · EVM activity</span><button type="button" onClick={() => { d.refresh(); blocks.refresh(); transactions.refresh(); context.refresh(); activity.refresh(); }}>Refresh data</button></div>
    {d.error && <Failure message={d.error} retry={d.refresh} stale={!!net} />}
    <div className="gen-tiles">
      <Tile label="Indexed block" value={height(net?.indexed_head)} sub={<>Finalized {height(net?.chain_finalized)}</>} />
      <Tile label="Average block time" value={net?.avg_block_time_ms == null ? "—" : `${(net.avg_block_time_ms / 1000).toFixed(2)} s`} sub="Across the latest 1,000 blocks" />
      <Tile label="Transactions / sec" value={net?.tps == null ? "—" : fmt(net.tps)} sub={net ? `${fmt(net.txs_24h)} indexed in 24 h` : "Loading activity"} />
      <Tile label="Gas price" value={net?.gas_price == null ? "—" : gwei(net.gas_price)} sub="Current RPC estimate" />
      <Tile label="Indexed history" value={net ? fmt(net.blocks_indexed) : "—"} sub={net?.earliest_indexed == null ? "Waiting for blocks" : `From block ${fmt(net.earliest_indexed)}`} />
    </div>
    <div className="gen-main-grid">
      <Section title="Recent blocks" className="gen-panel" aside={<a href="#/blocks">View all ↗</a>}>
        <p className="gen-note">Finalized EVM blocks · select a height to inspect its transactions.</p>
        {blocks.error && <Failure message="Recent blocks could not be refreshed." retry={blocks.refresh} stale={!!blocks.data} />}
        {!blocks.data && !blocks.error ? <div className="gen-loading"><Skeleton h={240} w="100%" /></div> : blocks.data?.blocks.length === 0 ? <EmptyState title="No blocks indexed yet" text="The first finalized blocks will appear here as indexing progresses." /> : blocks.data && <div className="gen-table-scroll"><table className="gen-table gen-block-table"><thead><tr><th>Block</th><th>Age</th><th>Txns</th><th>Gas used</th><th>Parent block</th><th><span className="gen-sr-only">Copy hash</span></th></tr></thead><tbody>{blocks.data.blocks.map(b => <tr key={b.hash}><td><a href={`#/blocks/${b.number}`}>{height(b.number)}</a></td><td><Timestamp value={b.time} /></td><td>{fmt(b.tx_count)}</td><td>{fmt(b.gas_used)}</td><td>{height(b.l1_block_number)}</td><td><CopyButton value={b.hash} copied={copied === b.hash} onCopy={() => onCopy(b.hash)} /></td></tr>)}</tbody></table></div>}
      </Section>
      <Section title="Parent-chain context" className="gen-panel gen-context" aside={<span className="gen-tag">Rollup header</span>}>
        <p className="gen-note">The parent block observed by the sequencer when it produced the latest indexed block.</p>
        {context.error && <Failure message="Parent-chain data is unavailable." retry={context.refresh} stale={!!a} />}
        {!a && !context.error ? <div className="gen-loading"><Skeleton h={180} w="100%" /></div> : a && <><div className="gen-parent-height"><span>Parent block</span><strong>{height(a.latest_l1_block)}</strong><small>Reported by GenLayer block {a.latest_l2_block == null ? "—" : <a href={`#/blocks/${a.latest_l2_block}`}>{height(a.latest_l2_block)}</a>}</small></div><dl className="gen-facts"><div><dt>Block timestamp</dt><dd><Timestamp value={a.latest_time} /></dd></div><div><dt>Send count</dt><dd>{a.send_count == null ? "—" : fmt(a.send_count)}</dd></div><div><dt>Context coverage</dt><dd>{fmt(a.blocks_with_l1)} / {fmt(a.window_blocks)}</dd></div><div><dt>Send root</dt><dd title={a.send_root ?? undefined}>{a.send_root ? short(a.send_root) : "—"}</dd></div></dl></>}
        <p className="gen-context-foot">These header fields do not establish settlement or intelligent-contract consensus status. <a href="https://docs.arbitrum.io/build-decentralized-apps/troubleshooting-building" target="_blank" rel="noreferrer">Field reference ↗</a></p>
      </Section>
    </div>
    <div className="gen-bottom-grid">
      <Section title="Latest transactions" className="gen-panel" aside={<a href="#/transactions">View all ↗</a>}>
        {transactions.error && <Failure message="Transactions could not be refreshed." retry={transactions.refresh} stale={!!transactions.data} />}
        {!transactions.data && !transactions.error ? <div className="gen-loading"><Skeleton h={240} w="100%" /></div> : transactions.data?.txs.length === 0 ? <EmptyState title="No transactions indexed yet" text="Transactions will appear as finalized blocks are indexed." /> : transactions.data && <div className="gen-table-scroll"><table className="gen-table gen-tx-table"><thead><tr><th>Transaction</th><th>Status</th><th>From</th><th>Fee</th></tr></thead><tbody>{transactions.data.txs.map(t => <tr key={t.hash}><td><a title={t.hash} href={txRoute(t.hash)}>{short(t.hash)}</a><small className="gen-row-time"><Timestamp value={t.time} /></small></td><td><span className={`gen-result ${t.status === 1 ? "success" : "failed"}`}>{t.status === 1 ? "Success" : "Reverted"}</span></td><td><a title={t.from} href={addressRoute(t.from)}>{short(t.from)}</a></td><td>{gen(t.fee, 6)}</td></tr>)}</tbody></table></div>}
      </Section>
      <Section title="Finalized activity" className="gen-panel" aside={<span className="gen-tag">Past 24 hours</span>}>
        {activity.error && <Failure message="Activity could not be refreshed." retry={activity.refresh} stale={!!activity.data} />}
        <div className="gen-activity"><strong>{activity.data ? fmt(minutes.reduce((n,p) => n+p.txs, 0)) : "—"}<small>indexed transactions</small></strong><svg className="gen-bars" viewBox="0 0 480 145" role="img" aria-label="Indexed transactions per 15-minute bucket over the past 24 hours">{minutes.map((p,i) => <rect key={p.time} x={i * barStep + 1} y={130-(p.txs/peak)*112} width={Math.max(1, barStep - 2)} height={Math.max(1,(p.txs/peak)*112)} rx="2" opacity={p.txs ? 1 : .2}><title>{new Date(p.time).toISOString()}: {p.txs} transactions</title></rect>)}<line x1="0" x2="480" y1="131" y2="131" /></svg><div className="gen-chart-axis"><span>24 h ago</span><span>Now</span></div></div>
        <dl className="gen-facts"><div><dt>Blocks behind finalized head</dt><dd>{net?.lag_blocks == null ? "—" : fmt(net.lag_blocks)}</dd></div><div><dt>History blocks remaining</dt><dd>{net?.backfill_remaining == null ? "—" : fmt(net.backfill_remaining)}</dd></div><div><dt>Latest indexed block</dt><dd><Timestamp value={net?.latest_block_time} /></dd></div></dl>
        <p className="gen-context-foot">Counts cover indexed finalized blocks. Newer chain activity appears after the RPC marks it finalized.</p>
      </Section>
    </div>
    <p className="gen-footer">GenLayer Bradbury · EVM chain explorer <a href="https://docs.genlayer.com/developers/networks" target="_blank" rel="noreferrer">Network documentation ↗</a></p>
  </div>;
}
