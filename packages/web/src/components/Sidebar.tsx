import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { ExplorerIcon, GenLayerWordmark } from "./ExplorerBrand";

export const NAV = [
  { id: "overview", label: "Overview", icon: "grid" },
  { id: "contracts", label: "Contracts", icon: "file" },
  { id: "consensus", label: "Contract decisions", icon: "consensus" },
  { id: "validators", label: "Validators", icon: "shield" },
  { id: "staking", label: "Staking", icon: "transfer" },
  { id: "blocks", label: "Blocks", icon: "block" },
  { id: "transactions", label: "Transactions", icon: "transfer" },
  { id: "endpoints", label: "Network", icon: "back" },
  { id: "rpc", label: "RPC Console", icon: "rpc" },
  { id: "api", label: "API Reference", icon: "code" },
  { id: "settings", label: "Settings", icon: "settings" },
] as const;
export type PageId = typeof NAV[number]["id"];

const CATEGORIES = [
  { id: "intelligence", label: "Intelligence", icon: "database", pages: ["contracts", "consensus"] },
  { id: "consensus", label: "Consensus", icon: "shield", pages: ["validators", "staking"] },
  { id: "chain", label: "Chain", icon: "block", pages: ["blocks", "transactions", "endpoints"] },
  { id: "developers", label: "Developers", icon: "code", pages: ["rpc", "api", "settings"] },
] as const;
type Category = typeof CATEGORIES[number];
type CategoryId = Category["id"];
const DESCRIPTIONS: Record<PageId, string> = {
  overview: "Network and contract activity at a glance",
  contracts: "Discover deployed intelligent contracts",
  consensus: "Follow contract execution and decisions",
  validators: "Validator identities and participation",
  staking: "Stake and manage delegations",
  blocks: "Browse finalized blocks",
  transactions: "Inspect transactions and address activity",
  endpoints: "RPC endpoints and network health",
  rpc: "Run read-only RPC requests",
  api: "Explore the public REST API",
  settings: "Theme, display and endpoint preferences",
};

export function Sidebar({ page, go, mobileOpen, onNavigate }: {
  page: PageId;
  go: (page: PageId) => void;
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const triggers = useRef<Partial<Record<CategoryId, HTMLButtonElement | null>>>({});
  const [openCategory, setOpenCategory] = useState<CategoryId | null>(null);
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 920px)").matches);
  const [portalHost, setPortalHost] = useState<Element | null>(null);
  const [position, setPosition] = useState({ left: 252, top: 120 });
  const category = CATEGORIES.find(item => item.id === openCategory);
  const currentCategory = CATEGORIES.find(item => item.pages.some(id => id === page));

  useEffect(() => {
    setPortalHost(ref.current?.closest(".explorer-app") ?? null);
    const media = window.matchMedia("(max-width: 920px)");
    const change = () => {
      if (panelRef.current?.contains(document.activeElement) || ref.current?.querySelector(".sidebar-submenu")?.contains(document.activeElement)) {
        const focusTarget = media.matches && !ref.current?.classList.contains("mobile-open")
          ? document.querySelector<HTMLButtonElement>(".mobile-nav-toggle")
          : ref.current?.querySelector<HTMLButtonElement>('[data-nav-root][aria-expanded="true"]');
        focusTarget?.focus({ preventScroll: true });
      }
      setCompact(media.matches); setOpenCategory(null);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => { setOpenCategory(null); }, [page]);

  function closeMenu(returnFocus = false) {
    if (returnFocus && openCategory) triggers.current[openCategory]?.focus({ preventScroll: true });
    setOpenCategory(null);
  }

  useLayoutEffect(() => {
    if (compact || !openCategory || !portalHost) return;
    const place = () => {
      const button = triggers.current[openCategory], panel = panelRef.current, side = ref.current;
      if (!button || !panel || !side) return;
      setPosition({
        left: side.getBoundingClientRect().right + 8,
        top: Math.max(12, Math.min(button.getBoundingClientRect().top, window.innerHeight - panel.getBoundingClientRect().height - 12)),
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [compact, openCategory, portalHost]);

  useEffect(() => {
    if (compact || !openCategory || !portalHost) return;
    panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    const outside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && !ref.current?.contains(target) && !panelRef.current?.contains(target)) setOpenCategory(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeMenu(true); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [compact, openCategory, portalHost]);

  // Expand the current category before the first drawer focus is scheduled.
  useLayoutEffect(() => {
    if (!mobileOpen || !ref.current) { setOpenCategory(null); return; }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = ref.current;
    setOpenCategory(currentCategory?.id ?? null);
    const frame = requestAnimationFrame(() => {
      const active = drawer.querySelector<HTMLElement>('[aria-current="page"]');
      (active ?? drawer.querySelector<HTMLElement>("button"))?.focus();
    });
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
      cancelAnimationFrame(frame);
      drawer.removeEventListener("keydown", onKey);
      requestAnimationFrame(() => {
        if (previous?.isConnected && previous.getClientRects().length &&
            (document.activeElement === document.body || drawer.contains(document.activeElement))) previous.focus();
      });
    };
  }, [mobileOpen]);

  function navigate(event: ReactMouseEvent<HTMLAnchorElement>, id: PageId) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); setOpenCategory(null); go(id); onNavigate();
  }

  function menuKeys(event: ReactKeyboardEvent<HTMLDivElement>) {
    const links = Array.from(panelRef.current?.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]') ?? []);
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + links.length) % links.length;
      links[next]?.focus();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault(); closeMenu(true);
    } else if (event.key === "Tab" && openCategory) {
      event.preventDefault();
      const roots = Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-nav-root]") ?? []);
      const current = roots.indexOf(triggers.current[openCategory]!);
      const next = roots[current + (event.shiftKey ? -1 : 1)] ?? ref.current?.querySelector<HTMLElement>(".pathrock-card");
      setOpenCategory(null); next?.focus();
    }
  }

  function submenu(item: Category, desktop: boolean) {
    return <section id={`sidebar-${item.id}-options`} ref={desktop ? panelRef : undefined}
      className={`sidebar-submenu ${desktop ? "sidebar-flyout" : "sidebar-inline"}`}
      style={desktop ? position : undefined} aria-labelledby={`sidebar-${item.id}-title`}>
      <h2 id={`sidebar-${item.id}-title`}>{item.label}</h2>
      <div role={desktop ? "menu" : undefined} aria-labelledby={`sidebar-${item.id}-title`}
        onKeyDown={desktop ? menuKeys : event => {
          if (event.key === "ArrowLeft") { event.preventDefault(); closeMenu(true); }
        }}>
        {NAV.filter(link => item.pages.some(id => id === link.id)).map(link => <a key={link.id}
          href={`#/${link.id}`} role={desktop ? "menuitem" : undefined} tabIndex={desktop ? -1 : undefined}
          className={page === link.id ? "active" : undefined} aria-current={page === link.id ? "page" : undefined}
          onClick={event => navigate(event, link.id)}>
          <ExplorerIcon name={link.icon}/><span><strong>{link.label}</strong><small>{DESCRIPTIONS[link.id]}</small></span>
        </a>)}
      </div>
    </section>;
  }

  return <>
    <aside ref={ref} id="explorer-navigation" className={`side${mobileOpen ? " mobile-open" : ""}`}
      role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen ? true : undefined} aria-label="Explorer navigation">
      <button type="button" className="sidebar-close" aria-label="Close navigation" onClick={onNavigate}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>
      </button>
      <div className="brand-lockup secret-brand-lockup"><GenLayerWordmark/><span className="secret-explorer-label">EXPLORER</span></div>
      <div className="brand-by">by Pathrock Network</div>
      <nav aria-label="Primary navigation" onScroll={() => { if (!compact) setOpenCategory(null); }}>
        <a data-nav-root href="#/overview" className={page === "overview" ? "active" : undefined}
          aria-current={page === "overview" ? "page" : undefined} onClick={event => navigate(event, "overview")}>
          <ExplorerIcon name="grid"/><span>Overview</span>
        </a>
        {CATEGORIES.map(item => <div className="sidebar-category" key={item.id}>
          <button type="button" data-nav-root ref={node => { triggers.current[item.id] = node; }}
            className={`nav-category-toggle${currentCategory?.id === item.id ? " active" : ""}${openCategory === item.id ? " is-open" : ""}`}
            aria-expanded={openCategory === item.id} aria-controls={`sidebar-${item.id}-options`} aria-haspopup={compact ? undefined : "menu"}
            onClick={() => setOpenCategory(openCategory === item.id ? null : item.id)}
            onKeyDown={event => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault(); setOpenCategory(item.id);
                requestAnimationFrame(() => document.querySelector<HTMLElement>(`#sidebar-${item.id}-options a`)?.focus());
              }
            }}>
            <ExplorerIcon name={item.icon}/><span>{item.label}</span><ExplorerIcon name="chevron" className="nav-category-chevron"/>
          </button>
          {compact && openCategory === item.id && submenu(item, false)}
        </div>)}
      </nav>
      <a className="pathrock-card" href="https://pathrocknetwork.org/" target="_blank" rel="noreferrer" aria-label="Visit Pathrock Network" onClick={() => setOpenCategory(null)}>
        <span className="pathrock-orbit" aria-hidden="true"/>
        <div><strong>PATHROCK<br/>NETWORK</strong><small>Open infrastructure for a more decentralized tomorrow.</small></div>
      </a>
    </aside>
    {!compact && category && portalHost && createPortal(submenu(category, true), portalHost)}
  </>;
}
