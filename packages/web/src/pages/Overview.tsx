/**
 * Overview: stat tiles, the L1-anchor card (GenLayer's own cadence — how
 * freshly the L2 commits to its L1), and recent blocks. Everything derives
 * from the shared dashboard poll; no extra requests.
 */
import type { Dashboard } from "../useDashboard";
import type { Anchor, Block } from "../api";
import { getBlocks } from "../api";
import { useEffect, useState } from "react";
import { fmt, gen, gwei, short } from "../lib";
import { Timestamp } from "../components/Timestamp";
import { Chip, CopyButton, EmptyState, Label, Section, Skeleton } from "../components/ui";

type Props = { d: Dashboard; live: boolean; selected: number | null; onSelect: (n: number) => void; copied: string | null; onCopy: (s: string) => void };

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="ov-tile">
      <Label>{label}</Label>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

/** L1-anchor card: the one thing GenLayer has that a plain EVM chain doesn't. */
function AnchorCard({ anchor, d }: { anchor: Anchor | null; d: Dashboard }) {
  const fresh = anchor?.blocks_since_anchor != null && anchor.blocks_since_anchor <= 30;
  return (
    <Section title="L1 anchoring">
        <p className="ov-note">GenLayer batches consensus messages to its L1; this is how fresh that commitment is.</p>
      {anchor === null ? (
        <Skeleton h={40} w="100%" />
      ) : (
        <div className="ov-anchor-grid">
          <div>
            <Label>Latest anchored L1 block</Label>
            <strong>{anchor.latest_anchored_l1 !== null ? `#${fmt(anchor.latest_anchored_l1)}` : "—"}</strong>
          </div>
          <div>
            <Label>Blocks since last anchor</Label>
            <strong>{anchor.blocks_since_anchor ?? "—"}</strong>
            {anchor.blocks_since_anchor !== null && (
              <Chip tone={fresh ? "ok" : "warn"} title="Low is good: the L2 commits often">
                {fresh ? "fresh" : "lagging"}
              </Chip>
            )}
          </div>
          <div>
            <Label>Anchors in the indexed window</Label>
            <strong>{anchor.anchors_24h ?? "—"}</strong>
          </div>
          <div>
            <Label>Avg L1 lag (blocks)</Label>
            <strong>{anchor.avg_l1_lag_blocks ?? "—"}</strong>
          </div>
          <div>
            <Label>Last anchor time</Label>
            <strong>{anchor.latest_anchored_time ? <Timestamp value={anchor.latest_anchored_time} /> : "—"}</strong>
          </div>
          <div>
            <Label>Indexed head</Label>
            <strong>{d.net?.indexed_head !== null && d.net?.indexed_head !== undefined ? `#${fmt(d.net.indexed_head)}` : "—"}</strong>
          </div>
        </div>
      )}
    </Section>
  );
}

export function Overview({ d, copied, onCopy }: Props) {
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const net = d.net;

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void getBlocks(12).then((r) => !cancelled && setBlocks(r.blocks)).catch(() => undefined);
      void import("../api").then((m) => m.getAnchor().then((a) => !cancelled && setAnchor(a)).catch(() => undefined));
    };
    load();
    const id = d.state === "normal" ? setInterval(load, 6_000) : undefined;
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
    };
  }, [d.state, d.lastUpdated]);

  const tps = net?.tps ?? null;
  return (
    <div className="ov-grid">
      <div className="ov-tiles">
        <Tile label="Indexed head" value={net?.indexed_head !== null && net?.indexed_head !== undefined ? `#${fmt(net.indexed_head)}` : "—"} sub={net?.chain_finalized != null ? `finalized #${fmt(net.chain_finalized)}` : undefined} />
        <Tile label="Blocks / sec" value={net?.avg_block_time_ms ? `${(1000 / net.avg_block_time_ms).toFixed(2)}` : "—"} sub={net?.avg_block_time_ms ? `${net.avg_block_time_ms} ms block time` : undefined} />
        <Tile label="Transactions / sec" value={tps ?? "—"} sub={net?.txs_24h ? `${fmt(net.txs_24h)} tx in 24 h` : undefined} />
        <Tile label="Gas price" value={net?.gas_price ? gwei(net.gas_price) : "—"} sub={net?.gas_price ? gen((BigInt(net.gas_price) * 21000n).toString()) + " for a transfer" : undefined} />
        <Tile label="Indexed blocks" value={net?.blocks_indexed ? fmt(net.blocks_indexed) : "—"} sub={net?.blocks_24h ? `${fmt(net.blocks_24h)} in 24 h` : undefined} />
      </div>

      <AnchorCard anchor={anchor} d={d} />

      <Section title="Recent blocks">
        <p className="ov-note">Finalized blocks, newest first. Click for details.</p>
        {blocks === null ? (
          <Skeleton h={200} w="100%" />
        ) : blocks.length === 0 ? (
          <EmptyState title="No blocks indexed yet" text="The indexer is starting up; the first block lands within a minute." />
        ) : (
          <table className="ov-blocks">
            <thead>
              <tr><th>Height</th><th>Beneficiary</th><th>Tx</th><th>Gas used</th><th>L1 anchor</th><th>Time</th><th /></tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.hash} className={b.number === b.number ? "" : ""} onClick={() => undefined}>
                  <td>#{fmt(b.number)}</td>
                  <td title={b.miner}>{short(b.miner)}</td>
                  <td>{fmt(b.tx_count)}</td>
                  <td>{fmt(b.gas_used)}</td>
                  <td>{b.l1_block_number !== null && b.l1_block_number !== undefined ? `L1 #${fmt(b.l1_block_number)}${b.send_count ? ` · ${b.send_count}` : ""}` : "—"}</td>
                  <td><Timestamp value={b.time} /></td>
                  <td><CopyButton value={b.hash} copied={copied === b.hash} onCopy={() => onCopy(b.hash)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
