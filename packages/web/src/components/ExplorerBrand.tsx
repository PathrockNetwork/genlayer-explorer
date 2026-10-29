/** Shared GenLayer icon set and decorative page artwork. */
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
export type ExplorerIconName = keyof typeof paths;
export function ExplorerIcon({ name, className = "" }: { name: ExplorerIconName; className?: string }) {
  return <svg className={`ov-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

/** Decorative vector horizon; the chart and network information remain real UI. */
export function ExplorerHorizon() {
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

/** Official GenLayer artwork, with Pathrock operator attribution in the surrounding shell. */
export function GenLayerWordmark() {
 return <span className="genlayer-wordmark"><img className="gl-logo-light" src="/brand/genlayer-logo-black.svg" alt="GenLayer"/><img className="gl-logo-dark" src="/brand/genlayer-logo-white.svg" alt="GenLayer"/></span>;
}
