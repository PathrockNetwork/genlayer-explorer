import { useEffect, useRef } from "react";
import { ExplorerIcon, GenLayerWordmark } from "./ExplorerBrand";

export const NAV = [
  { id: "overview", label: "Overview", icon: "grid", group: "Explore" },
  { id: "contracts", label: "Contracts", icon: "file", group: "Intelligence" },
  { id: "consensus", label: "Consensus", icon: "consensus" },
  { id: "validators", label: "Validators", icon: "shield" },
  { id: "blocks", label: "Blocks", icon: "block", group: "Chain" },
  { id: "transactions", label: "Transactions", icon: "transfer" },
  { id: "endpoints", label: "Network", icon: "back" },
  { id: "rpc", label: "RPC Console", icon: "rpc", group: "Developers" },
  { id: "api", label: "API Reference", icon: "code" },
  { id: "settings", label: "Settings", icon: "settings" },
] as const;
export type PageId = typeof NAV[number]["id"];

export function Sidebar({ page, go, mobileOpen, onNavigate }: {
  page: PageId;
  go: (page: PageId) => void;
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobileOpen || !ref.current) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = ref.current;
    const active = drawer.querySelector<HTMLElement>('[aria-current="page"]');
    (active ?? drawer.querySelector<HTMLElement>("button"))?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const targets = Array.from(drawer.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'))
        .filter(element => element.getClientRects().length > 0);
      const first = targets[0], last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    drawer.addEventListener("keydown", onKey);
    return () => {
      drawer.removeEventListener("keydown", onKey);
      // The parent removes inert from the page during the same cleanup.
      requestAnimationFrame(() => {
        if (previous?.isConnected && previous.getClientRects().length &&
            (document.activeElement === document.body || drawer.contains(document.activeElement))) previous.focus();
      });
    };
  }, [mobileOpen]);

  return <aside ref={ref} id="explorer-navigation" className={`side${mobileOpen ? " mobile-open" : ""}`}
    role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen ? true : undefined} aria-label="Explorer navigation">
    <button type="button" className="sidebar-close" aria-label="Close navigation" onClick={onNavigate}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>
    </button>
    <div className="brand-lockup secret-brand-lockup"><GenLayerWordmark/><span className="secret-explorer-label">EXPLORER</span></div>
    <div className="brand-by">by Pathrock Network</div>
    <nav aria-label="Primary navigation">
      {NAV.map(item => <div key={item.id}>
        {"group" in item && <span className="nav-group-label">{item.group}</span>}
        <a className={page === item.id ? "active" : undefined} href={`#/${item.id}`} aria-current={page === item.id ? "page" : undefined}
          onClick={event => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault(); go(item.id); onNavigate();
          }}><ExplorerIcon name={item.icon}/><span>{item.label}</span></a>
      </div>)}
    </nav>
    <a className="pathrock-card" href="https://pathrocknetwork.org/" target="_blank" rel="noreferrer" aria-label="Visit Pathrock Network">
      <span className="pathrock-orbit" aria-hidden="true"/>
      <div><strong>PATHROCK<br/>NETWORK</strong><small>Open infrastructure for a more decentralized tomorrow.</small></div>
      <ExplorerIcon name="arrowRight" className="ov-sponsor-arrow"/>
    </a>
  </aside>;
}
