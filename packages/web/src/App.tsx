/**
 * Shell: sidebar, header, state banner, page routing and footer.
 * Layout is the mockup's fixed 1440px desktop frame.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useDashboard } from "./useDashboard";
import { Contracts, Consensus } from "./pages/Intelligence";
import { Validators } from "./pages/Observatory";
import { Overview } from "./pages/Overview";
import { ApiDocs } from "./pages/ApiDocs";
import { Settings } from "./pages/Settings";
import { DirectRpc } from "./pages/DirectRpc";
import { RpcDirectory } from "./pages/RpcDirectory";
import { Blocks } from "./pages/Blocks";
import { Transactions } from "./pages/Transactions";
import { search as apiSearch } from "./api";
import { OK, TX, TX2, sans } from "./components/ui";
import { EndpointSwitcher } from "./components/EndpointSwitcher";
import { copyText } from "./lib";
import { useAppearance } from "./appearance";

export type Theme = "dark" | "light" | "system";

type PageId =
  | "overview"
  | "contracts"
  | "consensus"
  | "validators"
  | "blocks"
  | "transactions"
  | "endpoints"
  | "rpc"
  | "api"
  | "settings"

const NAV: { id: PageId; label: string; d: string }[] = [
  { id: "overview", label: "Overview", d: "M4 4h5v5H4zM11 4h5v3h-5zM4 12h5v4H4zM11 10h5v6h-5z" },
  { id: "contracts", label: "Contracts", d: "M5 3h7l3 3v11H5zM12 3v4h3M8 10h4M8 13h4" },
  { id: "consensus", label: "Consensus", d: "M10 3v4M4 13l6-6 6 6M4 13v4M10 7v10M16 13v4" },
  { id: "validators", label: "Validators", d: "M10 2 17 5v5c0 4-7 8-7 8S3 14 3 10V5zM7 10l2 2 4-5" },
  { id: "blocks", label: "Blocks", d: "m10 3 6 3.5v7L10 17l-6-3.5v-7zM4 6.5l6 3.5 6-3.5M10 10v7" },
  { id: "transactions", label: "Transactions", d: "M4 7h12m0 0-3-3m3 3-3 3M16 13H4m0 0 3-3m-3 3 3 3" },
  { id: "endpoints", label: "Network", d: "M4 10l6-6M4 10l6 6M4 10h12" },
  { id: "rpc", label: "RPC Console", d: "M7 4C4.8 9 4.8 11 7 16M13 4c2.2 5 2.2 7 0 12M4 10h12" },
  { id: "api", label: "API Reference", d: "M7 6l-3 4 3 4M13 6l3 4-3 4" },
  {
    id: "settings",
    label: "Settings",
    d: "M10 7.6a2.4 2.4 0 100 4.8 2.4 2.4 0 000-4.8zM10 3.2v1.6M10 15.2v1.6M3.2 10h1.6M15.2 10h1.6M5.4 5.4l1.1 1.1M13.5 13.5l1.1 1.1M14.6 5.4l-1.1 1.1M6.5 13.5l-1.1 1.1",
  },
];

const TITLES: Record<PageId, string> = {
  overview: "Network Overview",
  contracts: "Contracts",
  consensus: "Intelligent Contract Consensus",
  validators: "Validator Activity",
  blocks: "Blocks / Chain history",
  transactions: "Transactions",
  endpoints: "Network",
  rpc: "RPC Console",
  api: "API Reference",
  settings: "Settings",
};

const SUBTITLES: Record<PageId, string> = {
  overview: "Live network data for the GenLayer Bradbury testnet (chain 4221).",
  contracts: "Discover intelligent contracts, inspect source code, and explore their activity.",
  consensus: "Follow native transactions, validator rounds, appeals, and execution results.",
  validators: "Explore observed round assignments, execution votes, and participation history.",
  blocks: "Follow finalized blocks, their parent-chain references, gas, and transactions.",
  transactions: "Explore transactions, token transfers, fees, and execution results.",
  endpoints: "Public RPC endpoints — health, height, and latency.",
  rpc: "Query a GenLayer JSON-RPC endpoint directly from your browser.",
  api: "Build with indexed GenLayer data.",
  settings: "Configure the explorer and its data display.",
};

const VALID_PAGES = new Set<string>(NAV.map((n) => n.id));

function pageFromLocation(): PageId {
  // Deep links carry a sub-path (#/transactions/<hash>); the page is the first segment.
  const h = window.location.hash.replace(/^#\/?/, "").split(/[/?]/)[0] ?? "";
  if (VALID_PAGES.has(h)) return h as PageId;
  const path = window.location.pathname.replace(/^\/+|\/+$/g, "");
  return (VALID_PAGES.has(path) ? path : "overview") as PageId;
}

export default function App() {
  const appearance = useAppearance();
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem("genlayer-explorer-theme");
      return stored === "dark" || stored === "light" || stored === "system" ? stored : "dark";
    } catch { return "dark"; }
  });
  const [systemTheme, setSystemTheme] = useState<"dark" | "light">(() =>
    window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark",
  );
  const [page, setPage] = useState<PageId>(pageFromLocation);
  const [live, setLive] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  /** True when the deployed bundle differs from the one this tab runs. */
  const [stale, setStale] = useState(false);

  // A long-lived tab keeps executing the JS it loaded — no cache header can
  // fix that (it bit us repeatedly: removed UI "still there", ticking). Poll
  // the deployed bundle name and offer a reload when they diverge.
  useEffect(() => {
    const mine = document.querySelector('script[src*="assets/index-"]')?.getAttribute("src") ?? "";
    const check = () =>
      fetch("/api/v1/version")
        .then((r) => r.json())
        .then((v: { web: string | null }) => {
          if (v.web && !mine.includes(v.web)) setStale(true);
        })
        .catch(() => {});
    void check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);
  const [search, setSearch] = useState("");
  const [searchError, setSearchError] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { localStorage.setItem("genlayer-explorer-theme", theme); } catch { /* Theme remains usable without storage. */ }
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const sync = () => setSystemTheme(media.matches ? "light" : "dark");
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const appliedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    const onHash = () => setPage(pageFromLocation());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the off-canvas navigation modal on touch devices: the document must
  // not continue moving underneath it, and Escape should always be a quick
  // way back to the page.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    // A route change from a deep link or browser back should never leave the
    // drawer covering the newly selected page.
    setMobileNavOpen(false);
    setMobileSearchOpen(false);
  }, [page]);

  const go = useCallback((id: PageId) => {
    window.location.hash = `/${id}`;
    setPage(id);
  }, []);

  const d = useDashboard({ live });

  const onCopy = useCallback((value: string) => {
    void copyText(value);
    setCopied(value);
    setTimeout(() => setCopied((c) => (c === value ? null : c)), 2600);
  }, []);

  return (
    <div
      data-theme={appliedTheme}
      data-density={appearance.density}
      data-reduce-motion={appearance.reduceMotion}
      data-code-size={appearance.codeSize}
      style={{
        background: "var(--canvas)",
        color: TX,
        minHeight: "100vh",
        fontVariantNumeric: "tabular-nums",
        paddingBottom: 8,
      }}
    >
      <div className="shell">
        <Sidebar page={page} go={go} d={d} mobileOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} />
        {mobileNavOpen && <button className="mobile-nav-scrim" type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}

        <main className={`main-content${page === "overview" ? " overview-content" : ""}`} style={{ flex: 1, minWidth: 0, padding: "0 28px 12px", display: "flex", flexDirection: "column" }}>
          <header
            className="topbar"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 24,
              padding: "20px 0 18px",
            }}
          >
            <div className="mobile-header-brand" aria-label="GenLayer Explorer by Pathrock Network">
              <GenLayerWordmark />
              <div><span>EXPLORER</span><small>by Pathrock Network</small></div>
            </div>
            <form
              className={`global-search${mobileSearchOpen ? " mobile-search-open" : ""}`}
              onSubmit={(e) => {
                e.preventDefault();
                const q = search.trim();
                if (!q) return;
                setMobileSearchOpen(false);
                apiSearch(q)
                  .then((r) => {
                    window.location.hash = r.type === "block" ? `/blocks/${r.id}` : r.type === "tx" ? `/transactions/${r.id}` : r.type === "contracts" ? `/contracts?q=${encodeURIComponent(r.id)}` : r.type === "contract" ? `/contracts/${r.id}` : r.type === "consensus" ? `/consensus/${r.id}` : `/transactions/address/${r.id}`;
                    setSearch("");
                  })
                  .catch(() => setSearchError(true));
              }}
            >
              <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>
              <input ref={searchRef} value={search} onChange={(e) => { setSearch(e.target.value); setSearchError(false); }} placeholder="Search blocks, transactions, contracts…" aria-label="Search the network" aria-invalid={searchError} title={searchError ? "No block, transaction or address matches" : undefined} />
              <kbd>⌘ K</kbd>
            </form>
            <div className="global-actions" style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
              <button className="mobile-search-toggle" type="button" aria-label="Search the network" aria-expanded={mobileSearchOpen} onClick={() => setMobileSearchOpen((open) => !open)}>
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>
              </button>
              <button className="mobile-nav-toggle" type="button" aria-label="Open navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)}>
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
              </button>
              <EndpointSwitcher d={d} />
              <button
                type="button"
                onClick={() => setLive((l) => !l)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  height: 32,
                  padding: "0 11px",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: live ? "var(--okSoft)" : "var(--panel)",
                  color: live ? OK : TX2,
                  font: `600 14px/1 ${sans}`,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "currentColor",
                    animation: live ? "bp 2.4s ease-in-out infinite" : "none",
                  }}
                />
                {live ? "Live" : "Paused"}
              </button>
              <button
                type="button"
                onClick={() => setTheme(appliedTheme === "dark" ? "light" : "dark")}
                aria-label="Toggle theme"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: "var(--panel)",
                  color: TX2,
                  cursor: "pointer",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path
                    d={
                      appliedTheme === "dark"
                        ? "M14.5 11.5A5.5 5.5 0 018.5 5.5a5.5 5.5 0 00.8 10.9 5.5 5.5 0 005.2-4.9z"
                        : "M10 3.5v1.6M10 14.9v1.6M3.5 10h1.6M14.9 10h1.6M5.6 5.6l1.1 1.1M13.3 13.3l1.1 1.1M14.4 5.6l-1.1 1.1M6.7 13.3l-1.1 1.1M13 10a3 3 0 11-6 0 3 3 0 016 0z"
                    }
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => onCopy(window.location.href)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: "var(--panel)",
                  color: TX,
                  font: `600 14px/1 ${sans}`,
                  cursor: "pointer",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 11l6-3M7 9l6 3M15 5.5a1.8 1.8 0 11-3.6 0 1.8 1.8 0 013.6 0zM8.6 10a1.8 1.8 0 11-3.6 0 1.8 1.8 0 013.6 0zM15 14.5a1.8 1.8 0 11-3.6 0 1.8 1.8 0 013.6 0z" />
                </svg>
                {copied === window.location.href ? "Copied" : "Share"}
              </button>
              <span className="user-avatar" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><circle cx="10" cy="6.5" r="3.5"/><path d="M3.5 17c.5-4 2.7-6 6.5-6s6 2 6.5 6z"/></svg>
              </span>
            </div>
          </header>

          <div className="page-heading">
            <div>
              {page === "rpc" && <div className="direct-rpc-breadcrumb"><span>Home</span><b>›</b><strong>RPC Console</strong></div>}
              <h1>{TITLES[page]}</h1>
              <span className="page-subtitle">{SUBTITLES[page]}</span>
            </div>
            <span className="slogan">GenLayer Bradbury · Chain 4221</span>
          </div>

          {page === "overview" && (
            <div className="mobile-overview-status">
              <button type="button" className={live ? "mobile-live-pill active" : "mobile-live-pill"} onClick={() => setLive((value) => !value)}>
                <i />{live ? "Live" : "Paused"}
              </button>
              </div>
          )}

          {page === "overview" && (
            <Overview
              d={d}
              live={live}
              selected={selected}
              onSelect={setSelected}
              copied={copied}
              onCopy={onCopy}
            />
          )}
          {page === "contracts" && <Contracts live={live} />}
          {page === "consensus" && <Consensus live={live} />}
          {page === "validators" && <Validators live={live} />}
          {page === "blocks" && <Blocks d={d} live={live} />}
          {page === "transactions" && <Transactions d={d} live={live} />}
          {page === "endpoints" && <RpcDirectory d={d} />}
          {page === "rpc" && <DirectRpc d={d} />}
          {page === "api" && <ApiDocs d={d} />}
          {page === "settings" && <Settings d={d} theme={theme} onTheme={setTheme} />}

        </main>
      </div>

      {/* Floating feedback (monadvision reference): the only channel a public
          visitor has to report wrong data. mailto keeps it zero-infrastructure;
          swap for a tailnet-only form if the address ever draws spam. */}
      <a
        className="feedback-button"
        href="mailto:nwrobj@gmail.com?subject=GenLayer%20explorer%20feedback&body=(what%20looks%20wrong%2C%20on%20which%20page)%3A%20"
        title="Report wrong data or suggest something"
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 40,
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          height: 34,
          padding: "0 13px",
          borderRadius: 17,
          border: "1px solid var(--line)",
          background: "var(--panel)",
          color: TX2,
          font: `600 14px/1 ${sans}`,
          textDecoration: "none",
          boxShadow: "var(--shadow)",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 6.5v7a2 2 0 01-2 2H8l-4 3v-3H5a2 2 0 01-2-2v-7a2 2 0 012-2h10a2 2 0 012 2z" />
          <path d="M8 9h4M8 11.5h2.5" />
        </svg>
        Feedback
      </a>

      {stale && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            position: "fixed",
            right: 18,
            bottom: 62,
            zIndex: 41,
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            height: 34,
            padding: "0 13px",
            borderRadius: 17,
            border: "1px solid var(--brand)",
            background: "var(--brandSoft)",
            color: "var(--brand)",
            font: `600 14px/1 ${sans}`,
            cursor: "pointer",
            boxShadow: "var(--shadow)",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand)" }} />
          Update available — reload
        </button>
      )}
    </div>
  );
}


function Sidebar({
  page,
  go,
  d,
  mobileOpen,
  onNavigate,
}: {
  page: PageId;
  go: (p: PageId) => void;
  d: ReturnType<typeof useDashboard>;
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  return (
    <aside
      className={`side${mobileOpen ? " mobile-open" : ""}`}
      onWheel={(e) => {
        // The desktop rail is a viewport layer, never a scroll container.
        // The mobile drawer is allowed to scroll when a short viewport cannot
        // fit the full navigation and sponsor card.
        if (!mobileOpen && !(e.target as HTMLElement).closest("nav")) e.preventDefault();
      }}
      onTouchMove={(e) => {
        if (!mobileOpen && !(e.target as HTMLElement).closest("nav")) e.preventDefault();
      }}
    >
      <div className="brand-lockup secret-brand-lockup">
        <GenLayerWordmark />
        <span className="secret-explorer-label">EXPLORER</span>
      </div>
      <div className="brand-by">by Pathrock Network</div>

      <nav>
        {NAV.map((n) => {
          const item = (
          <a
            key={n.id}
            className={page === n.id ? "active" : undefined}
            href={`#/${n.id}`}
            onClick={(e) => {
              e.preventDefault();
              go(n.id);
              onNavigate();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "7px 9px",
              borderRadius: 7,
              font: `500 16px/1 ${sans}`,
              textDecoration: "none",
              background: page === n.id ? "var(--brandSoft)" : "transparent",
              color: page === n.id ? "var(--brand)" : TX2,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", opacity: 0.85 }}>
              <path d={n.d} />
            </svg>
            <span>{n.label}</span>
          </a>
          );
          return <div key={n.id}>{n.id === "overview" && <span className="nav-group-label">EXPLORE</span>}{n.id === "contracts" && <span className="nav-group-label">INTELLIGENCE</span>}{n.id === "blocks" && <span className="nav-group-label">CHAIN</span>}{n.id === "rpc" && <span className="nav-group-label">DEVELOPERS</span>}{item}</div>;
        })}
      </nav>
      <a
        className="pathrock-card"
        href="https://pathrocknetwork.org/"
        target="_blank"
        rel="noreferrer"
        aria-label="Visit Pathrock Network"
      >
        <span className="pathrock-orbit" aria-hidden="true" />
        <div><strong>PATHROCK<br />NETWORK</strong><small>Open infrastructure for a more decentralized tomorrow.</small></div>
      </a>
    </aside>
  );
}

/**
 * Explorer lockup: a generic hexagon mark plus the chain name in the UI
 * typeface — deliberately not the GenLayer Foundation's logo artwork.
 */
function GenLayerWordmark() {
  return (
    <span className="genlayer-wordmark" role="img" aria-label="GenLayer">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 3.5 27 9.75v12.5L16 28.5 5 22.25V9.75z" />
        <circle cx="16" cy="16" r="4.2" />
      </svg>
      <span>GenLayer</span>
    </span>
  );
}
