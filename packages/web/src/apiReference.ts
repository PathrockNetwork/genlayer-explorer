/** Routes implemented by this explorer's REST API (packages/api), not upstream JSON-RPC methods. */
export type ApiParameter = { name: string; location: "path" | "query"; description: string; default?: string; min?: number; max?: number; choices?: string[]; pattern?: RegExp; required?: boolean };
export type ApiEndpoint = { id: string; method: "GET"; path: string; title: string; description: string; response: string; category: string; tags: string[]; overview?: boolean; parameters?: ApiParameter[]; binary?: boolean };

const limit: ApiParameter = { name: "limit", location: "query", default: "25", min: 1, max: 100, description: "Rows returned (1–100, default 25)." };
const blockId: ApiParameter = { name: "id", location: "path", pattern: /^(\d+|0x[0-9a-fA-F]{64})$/, description: "Block number, or a 0x-prefixed 32-byte block hash." };

export const API_BASE = "/api/v1";
export const API_CATEGORIES = ["Overview", "Network", "Blocks", "Transactions", "Addresses", "Analytics", "Service"];
export const API_ENDPOINTS: ApiEndpoint[] = [
  { id: "stats", method: "GET", path: "/api/v1/stats", title: "Network snapshot", category: "Network", tags: ["network", "indexer"], overview: true,
    description: "Indexer head, chain finalized height and lag, cadence, TPS, 24 h totals, gas price, missing history blocks, heartbeat and per-minute activity for the last 30 minutes.",
    response: "Object: chain_id, indexed_head, chain_finalized, lag_blocks, avg_block_time_ms, tps, blocks_24h, txs_24h, gas_price (wei), backfill_remaining, latest_block_time, indexer_updated_at, recent_minutes[], rpc[]." },
  { id: "endpoints", method: "GET", path: "/api/v1/endpoints", title: "RPC endpoint health", category: "Network", tags: ["network", "rpc"],
    description: "Server-side probe of each configured GenLayer RPC endpoint (eth_blockNumber, web3_clientVersion, eth_chainId), cached for 15 seconds.",
    response: "Object: indexer_rpc, chain_finalized, endpoints[] { url, healthy, latency_ms, height, client, error, priority, used_by_indexer }, api_rpc[]." },
  { id: "config", method: "GET", path: "/api/v1/config", title: "Deployment configuration", category: "Network", tags: ["network", "configuration"],
    description: "Chain identity, configured RPC endpoints (credentials redacted), indexer retention and backfill settings, and available features.",
    response: "Object: chain { name, network, chain_id, currency }, rpc_endpoints[], indexer { head, retain_hours, backfill_depth, database }, features { full_history }." },
  { id: "blocks", method: "GET", path: "/api/v1/blocks", title: "Recent blocks", category: "Blocks", tags: ["blocks", "pagination"], overview: true,
    parameters: [limit, { name: "before", location: "query", min: 1, max: Number.MAX_SAFE_INTEGER, description: "Return blocks with a number below this (pagination cursor). Past the indexed window, blocks are read from RPC." }],
    description: "Newest finalized blocks, newest first, with rollup header context where available.",
    response: "Object: source (\"db\" or \"rpc\"), blocks[] { number, hash, time, miner, gas_used, gas_limit, base_fee_per_gas, tx_count, l1_block_number, send_count, send_root }." },
  { id: "block", method: "GET", path: "/api/v1/blocks/:id", title: "Block details", category: "Blocks", tags: ["blocks"], overview: true, parameters: [blockId],
    description: "One block with all of its transactions. Blocks outside the indexed window are read through from RPC.",
    response: "Object: source, block { …same fields as the list }, txs[] (transaction rows). 404 when the block does not exist." },
  { id: "txs", method: "GET", path: "/api/v1/txs", title: "Recent transactions", category: "Transactions", tags: ["transactions", "pagination"], overview: true,
    parameters: [limit, { name: "before", location: "query", pattern: /^\d+:\d+$/, description: "Cursor \"block:index\" of the previous page's last row." }, { name: "address", location: "query", pattern: /^0x[0-9a-fA-F]{40}$/, description: "Only transactions sent from or to this 0x address." }],
    description: "Indexed transactions, newest first. Amounts and fees are wei strings.",
    response: "Object: source, txs[] { hash, block_number, tx_index, time, from, to, contract_address, value, gas_used, effective_gas_price, fee, status, method, log_count }." },
  { id: "tx", method: "GET", path: "/api/v1/txs/:hash", title: "Transaction details", category: "Transactions", tags: ["transactions", "receipt"], overview: true,
    parameters: [{ name: "hash", location: "path", pattern: /^0x[0-9a-fA-F]{64}$/, description: "0x-prefixed 32-byte transaction hash." }],
    description: "Transaction and receipt fetched live from RPC, with decoded ERC-20/721 transfers and raw logs.",
    response: "Object: source, tx { …, pending, confirmations, input }, transfers[], logs[]. 404 when unknown." },
  { id: "address", method: "GET", path: "/api/v1/address/:addr", title: "Address summary", category: "Addresses", tags: ["address", "balance"], overview: true,
    parameters: [{ name: "addr", location: "path", pattern: /^0x[0-9a-fA-F]{40}$/, description: "0x-prefixed 20-byte address." }],
    description: "Live balance, nonce and code size from RPC, plus token metadata and capped activity counts from the indexed window.",
    response: "Object: address, balance (wei), nonce, is_contract, code_size, token, window { sent, received, count_cap }, transfers[]." },
  { id: "search", method: "GET", path: "/api/v1/search", title: "Search", category: "Addresses", tags: ["search"],
    parameters: [{ name: "q", location: "query", required: true, default: "", description: "Block number, transaction or block hash, or address." }],
    description: "Resolve free text to the page that shows it.",
    response: "Object: type (\"block\" | \"tx\" | \"address\") and id. 400 for unrecognised input, 404 for an unknown hash." },
  { id: "series", method: "GET", path: "/api/v1/series", title: "Activity series", category: "Analytics", tags: ["analytics", "series"],
    parameters: [{ name: "hours", location: "query", default: "1", min: 1, max: 72, description: "Trailing window in hours (1–72)." }],
    description: "Blocks, transactions and gas used per time bucket, straight from the block table.",
    response: "Object: hours, bucket_secs, points[] { t, blocks, txs, gas }." },
  { id: "health", method: "GET", path: "/health", title: "Health check", category: "Service", tags: ["health", "service"],
    description: "Returns once the API can query its database.",
    response: "Object: { ok: true }. 502 when the database is unreachable." },
  { id: "version", method: "GET", path: "/api/v1/version", title: "Deployed web build", category: "Service", tags: ["service", "build"],
    description: "Name of the web bundle currently served, so long-lived tabs can offer a reload.",
    response: "Object: web (bundle path or null)." },
  { id: "anchor", method: "GET", path: "/api/v1/anchor", title: "Parent-chain context", category: "Network", tags: ["rollup", "parent"], overview: true,
    description: "Parent height and send-tree fields from the latest indexed block. These do not prove settlement or intelligent-contract consensus status.",
    response: "Object: latest_l2_block, latest_l1_block, latest_time, send_count, send_root, window_blocks, blocks_with_l1. Missing header values are null." },
];
export function filterApiEndpoints(category: string, search: string): ApiEndpoint[] {
  const q = search.trim().toLowerCase();
  return API_ENDPOINTS.filter(e => (q ? `${e.method} ${e.path} ${e.title} ${e.description} ${e.response} ${e.tags.join(" ")}`.toLowerCase().includes(q) : category === "Overview" ? e.overview : e.category === category));
}
export function apiRequestPath(endpoint: ApiEndpoint, values: Record<string, string>): { path: string; error?: never } | { error: string; path?: never } {
  let path = endpoint.path;
  const query = new URLSearchParams();
  for (const p of endpoint.parameters ?? []) {
    const value = (values[p.name] ?? p.default ?? "").trim();
    if (!value && p.location === "query" && !p.required) continue;
    if (!value) return { error: `${p.name} is required.` };
    if (p.pattern && !p.pattern.test(value)) return { error: `${p.name}: ${p.description}` };
    if (p.choices && !p.choices.includes(value)) return { error: `${p.name} must be ${p.choices.join(", ")}.` };
    if (p.min !== undefined && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < p.min || Number(value) > p.max!)) return { error: `${p.name} must be a whole number between ${p.min.toLocaleString("en-US")} and ${p.max!.toLocaleString("en-US")}.` };
    if (p.location === "path") path = path.replace(`:${p.name}`, encodeURIComponent(value)); else query.set(p.name, value);
  }
  const qs = query.toString();
  return { path: path + (qs ? `?${qs}` : "") };
}
export function apiCurl(origin: string, path: string): string {
  const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
  return `curl --request GET \\\n  --url ${quote(origin + path)} \\\n  --header 'Accept: application/json'`;
}
/** Preview only: copying always uses the untouched response. */
export function apiPreview(body: string, maxLines = 7): string {
  const lines = body.split("\n");
  const preview = lines.slice(0, maxLines).map(line => line.length > 240 ? line.slice(0, 240) + "…" : line).join("\n");
  return preview + (lines.length > maxLines ? `\n… ${lines.length - maxLines} more lines` : "");
}
