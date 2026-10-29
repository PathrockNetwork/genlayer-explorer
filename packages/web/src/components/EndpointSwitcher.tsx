/**
 * Endpoint status — the Secret explorer's switcher, read-only for GenLayer.
 *
 * The public GenLayer gateways are not ours to pin: the indexer fails over across
 * them by priority on its own. So the panel reports which one feeds the
 * indexer and how each is doing, and says plainly that it is informational.
 */
import { useEffect, useRef, useState } from "react";
import type { Dashboard } from "../useDashboard";
import { BAD, OK, TX, TX2, TX3, mono, sans } from "./ui";
import { fmt } from "../lib";

export function EndpointSwitcher({ d, compact = false }: { d: Dashboard; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const endpoints = d.endpoints?.endpoints ?? [];
  const active = endpoints.find((e) => e.used_by_indexer) ?? endpoints[0] ?? null;
  const host = (url: string) => url.replace(/^https?:\/\//, "");

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (endpoints.length === 0) return <a className="ov-chain-badge" href="#/endpoints"><i />Bradbury Testnet</a>;

  const dot = active ? (active.healthy ? OK : BAD) : TX3;

  return (
    <div ref={ref} className="endpoint-switcher" style={{ position: "relative", flex: "none" }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="header-endpoints"
        onClick={() => setOpen((o) => !o)}
        title="RPC endpoint feeding the indexer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          height: 32,
          padding: "0 11px",
          borderRadius: 8,
          border: "1px solid var(--line)",
          background: "var(--panel)",
          color: TX,
          font: `600 ${compact ? 12 : 14}px/1 ${sans}`,
          cursor: "pointer",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flex: "none" }} />
        {compact ? "Bradbury Testnet" : active ? host(active.url) : "no endpoint"}
        {!compact && <span style={{ font: `400 13px/1 ${mono}`, color: TX3 }}>
          {active?.latency_ms !== null && active?.latency_ms !== undefined
            ? `${active.latency_ms}ms`
            : "—"}
        </span>}
      </button>

      {open && (
        <div
          id="header-endpoints"
          style={{
            position: "absolute",
            right: 0,
            top: 38,
            zIndex: 50,
            width: 340,
            borderRadius: 10,
            border: "1px solid var(--line2)",
            background: "var(--panel)",
            boxShadow: "var(--shadow)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ font: `600 14px/1 ${sans}`, color: TX }}>RPC endpoints</div>
            <div style={{ font: `400 13px/1.45 ${sans}`, color: TX3, marginTop: 4 }}>
              Public GenLayer gateways, in priority order. The indexer reads finalized blocks from the
              first healthy one and fails over automatically.
            </div>
          </div>

          {endpoints.map((e) => (
            <div
              key={e.url}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderBottom: "1px solid var(--line)",
                background: e.used_by_indexer ? "var(--brandSoft)" : "transparent",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  flex: "none",
                  background: e.healthy ? OK : BAD,
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ font: `600 14px/1 ${sans}`, color: TX }}>{host(e.url)}</span>
                  {e.used_by_indexer && (
                    <span style={{ font: `600 12px/1 ${sans}`, color: "var(--brand)" }}>INDEXER</span>
                  )}
                </div>
                <span
                  style={{
                    font: `400 13px/1 ${mono}`,
                    color: TX3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={e.client ?? ""}
                >
                  {e.client ?? "—"} · priority {e.priority}
                </span>
                <span style={{ font: `400 13px/1 ${mono}`, color: e.error ? BAD : TX2 }}>
                  {e.error ? e.error : `height ${fmt(e.height)} · ${e.latency_ms ?? "—"}ms`}
                </span>
              </div>
            </div>
          ))}

          <div style={{ padding: "9px 12px", font: `400 13px/1.4 ${sans}`, color: TX3 }}>
            Latency measured from this server. <a href="#/endpoints" onClick={() => setOpen(false)}>View network details →</a>
          </div>
        </div>
      )}
    </div>
  );
}
