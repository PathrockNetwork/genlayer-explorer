/**
 * Shell: sidebar, header, state banner, page routing and footer.
 * Shared responsive layout for every explorer route.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useDashboard } from "./useDashboard";
import { Contracts, Consensus } from "./pages/Intelligence";
import { Validators } from "./pages/Observatory";
import { Overview } from "./pages/Overview";
import { ExplorerHorizon, GenLayerWordmark } from "./components/ExplorerBrand";
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
import { Sidebar, NAV, type PageId } from "./components/Sidebar";

export type Theme = "dark" | "light" | "system";

const TITLES: Record<PageId, string> = {
  overview: "GenLayer Overview",
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
  overview: "Intelligent contract activity on the Bradbury testnet.",
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
  const [overviewRefresh, setOverviewRefresh] = useState(0);
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
  const mainRef = useRef<HTMLElement>(null);
  const closeNavigation = useCallback(() => setMobileNavOpen(false), []);

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
    const onHash = () => { setPage(pageFromLocation()); setMobileNavOpen(false); setMobileSearchOpen(false); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMobileNavOpen(false);
        if (window.matchMedia("(max-width: 920px)").matches) setMobileSearchOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
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
    const main = mainRef.current;
    if (main) main.inert = true;
    const desktop = window.matchMedia("(min-width: 921px)");
    const onResize = () => { if (desktop.matches) closeNavigation(); };
    desktop.addEventListener("change", onResize);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (main) main.inert = false;
      desktop.removeEventListener("change", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileNavOpen, closeNavigation]);

  useEffect(() => {
    if (!mobileSearchOpen || mobileNavOpen) return;
    // Wait until the drawer has restored interaction with the page.
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [mobileSearchOpen, mobileNavOpen]);

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
      className={`explorer-app${page === "overview" ? " overview-app" : ""}`}
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
        <Sidebar page={page} go={go} mobileOpen={mobileNavOpen} onNavigate={closeNavigation} />
        {mobileNavOpen && <button className="mobile-nav-scrim" type="button" tabIndex={-1} aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}

        <main ref={mainRef} className={`main-content${page === "overview" ? " overview-content" : ""}`} style={{ flex: 1, minWidth: 0, padding: "0 28px 12px", display: "flex", flexDirection: "column" }}>
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
              <input ref={searchRef} value={search} onChange={(e) => { setSearch(e.target.value); setSearchError(false); }} placeholder="Search blocks, transactions, contracts, addresses…" aria-label="Search the network" aria-invalid={searchError} title={searchError ? "No block, transaction or address matches" : undefined} />
              <kbd>⌘ K</kbd>
            </form>
            <div className="global-actions" style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
              <button className="mobile-search-toggle" type="button" aria-label="Search the network" aria-expanded={mobileSearchOpen} onClick={() => { setMobileSearchOpen((open) => !open); requestAnimationFrame(() => searchRef.current?.focus()); }}>
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>
              </button>
              <button className="mobile-nav-toggle" type="button" aria-label="Open navigation" aria-controls="explorer-navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)}>
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
              </button>
              <EndpointSwitcher d={d} compact />
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
              {<a className="ov-rpc-latency" href="#/endpoints" title="Latest server-side RPC probe latency">{(() => { const endpoint = d.endpoints?.endpoints.find(e => e.used_by_indexer) ?? d.endpoints?.endpoints[0]; return endpoint?.latency_ms == null ? "—" : `${endpoint.latency_ms}ms`; })()}</a>}
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
              {<button className="ov-header-refresh" type="button" aria-label={page === "overview" ? "Refresh overview" : "Refresh network status"} title={page === "overview" ? "Refresh overview" : "Refresh network status"} onClick={() => { setOverviewRefresh(v => v + 1); d.refresh(); }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2 6M20 7v5" /></svg></button>}
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
              <a className="ov-settings-avatar" href="#/settings" aria-label="Open explorer settings" title="Explorer settings">S</a>
            </div>
          </header>

          <div className="page-heading">
            <ExplorerHorizon/>
            <div>
              {page === "rpc" && <div className="direct-rpc-breadcrumb"><span>Home</span><b>›</b><strong>RPC Console</strong></div>}
              <h1>{TITLES[page]}</h1>
              <span className="page-subtitle">{SUBTITLES[page]}</span>
            </div>
            <span className="slogan">GenLayer Bradbury · Chain 4221<small>Intelligent contracts for a more open web</small></span>
          </div>

          {(
            <div className="mobile-overview-status">
              <button type="button" className={live ? "mobile-live-pill active" : "mobile-live-pill"} onClick={() => setLive((value) => !value)}>
                <i />{live ? "Live" : "Paused"}
              </button>
              <a className="mobile-chain-link" href="#/endpoints">Bradbury Testnet · Chain 4221 ↗</a>
            </div>
          )}

          {page === "overview" && (
            <Overview
              d={d}
              live={live}
              refreshRevision={overviewRefresh}
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

      {/* Floating feedback: the only channel a public
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
