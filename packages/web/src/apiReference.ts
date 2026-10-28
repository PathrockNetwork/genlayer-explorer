/** Routes implemented by this explorer's REST API (packages/api), not upstream JSON-RPC methods. */
export type ApiParameter = { name: string; location: "path" | "query"; description: string; default?: string; min?: number; max?: number; choices?: string[]; pattern?: RegExp; required?: boolean };
export type ApiEndpoint = { id: string; method: "GET"; path: string; title: string; description: string; response: string; category: string; tags: string[]; overview?: boolean; parameters?: ApiParameter[]; binary?: boolean };

const limit: ApiParameter = { name: "limit", location: "query", default: "25", min: 1, max: 100, description: "Rows returned (1–100, default 25)." };
const blockId: ApiParameter = { name: "id", location: "path", pattern: /^(\d+|0x[0-9a-fA-F]{64})$/, description: "Block number, or a 0x-prefixed 32-byte block hash." };

export const API_BASE = "/api/v1";
export const API_CATEGORIES = ["Overview", "Network", "Blocks", "Transactions", "Addresses", "Contracts", "Consensus", "Analytics", "Service"];
export const API_ENDPOINTS: ApiEndpoint[] = [
  {"id": "contract-health", "method": "GET", "path": "/api/v1/contracts/:address/analytics", "title": "Contract health and cost", "category": "Contracts", "description": "Confirmed native submissions over days=1,7,30. Returns outcome counts, distinct callers, consumed protocol fees, per-method aggregates and creation-to-last-vote timing. Unknown outcomes are not counted as returned.", "response": "summary, series[], methods[], coverage, since, until", "tags": ["genlayer", "contracts"]},
  {"id": "contract-profile", "method": "GET", "path": "/api/v1/contracts/:address/profile", "title": "Source-derived profile", "category": "Contracts", "description": "Source-extracted name, description and capabilities, observed source versions, and related deployments by source hash or creator. Inferred metadata is not a verified project identity.", "response": "contract, versions[], related[], note", "tags": ["genlayer", "contracts"]},
  {"id": "contract-snapshot", "method": "GET", "path": "/api/v1/contracts/:address/sources/:hash", "title": "Observed source snapshot", "category": "Contracts", "description": "Fetch a stored finalized source snapshot by its SHA-256 hash. Observation times do not establish exact upgrade times.", "response": "source, sha256, first_observed_at, last_observed_at", "tags": ["genlayer", "contracts"]},
  {"id": "native-explanation", "method": "GET", "path": "/api/v1/genlayer/transactions/:id/explanation", "title": "Execution explanation", "category": "Consensus", "description": "Protocol outcome classification, lifecycle evidence when available, and recently observed status changes. Missing traces are not replayed.", "response": "outcome, consensus, confirmation, lifecycle, observations[], receipt_observed_at", "tags": ["genlayer", "consensus"]},
  {"id": "native-attention", "method": "GET", "path": "/api/v1/genlayer/attention", "title": "Contracts needing attention", "category": "Contracts", "description": "Up to eight contracts with execution failures or consensus activity over 15 minutes in the past 24 hours. This is an observation, not a security assessment.", "response": "contracts[], window_hours, waiting_threshold_minutes", "tags": ["genlayer", "contracts"]},
  {"id": "validator-activity", "method": "GET", "path": "/api/v1/genlayer/validators", "title": "Observed validator participation", "category": "Consensus", "description": "Receipt-derived round assignments and execution vote breakdowns. days=1,7,30; q=address prefix; offset for 25-row pages. These are not uptime or accuracy scores.", "response": "validators[], total, days, coverage", "tags": ["genlayer", "consensus"]},
  {"id": "validator-history", "method": "GET", "path": "/api/v1/genlayer/validators/:address", "title": "Validator round history", "category": "Consensus", "description": "Observed participation summary, daily assignment counts, and a paginated transaction-round history. Supports days=1,7,30 and offset.", "response": "summary, series[], history[], coverage", "tags": ["genlayer", "consensus"]},
  {"id": "native-overview", "method": "GET", "path": "/api/v1/genlayer/overview", "title": "Native activity overview", "category": "Consensus", "description": "Intelligent-contract counts, native activity, consensus distribution, top contracts, and index coverage.", "response": "Object: contracts, activity, statuses, top_contracts, sync, genvm.", "tags": ["consensus", "genlayer"]},
  {"id": "contracts", "method": "GET", "path": "/api/v1/contracts", "title": "Contract directory", "category": "Contracts", "description": "Indexed intelligent contracts and EVM deployments. Filter by kind and address, source-derived name, description or public method; sort by recent or activity.", "response": "Object: contracts[], total, limit, offset.", "tags": ["contracts", "genlayer"]},
  {"id": "contract", "method": "GET", "path": "/api/v1/contracts/:address", "title": "Contract details", "category": "Contracts", "description": "Contract environment, creator and deployment when indexed, balance, and activity.", "response": "Object: contract, indexed.", "tags": ["contracts", "genlayer"], "parameters": [{"name": "address", "location": "path", "description": "0x-prefixed contract address.", "required": true}]},
  {"id": "contract-code", "method": "GET", "path": "/api/v1/contracts/:address/code", "title": "Contract source", "category": "Contracts", "description": "GenVM source code in decided or finalized state; EVM bytecode when original source is unavailable.", "response": "Object: source, language, sha256, state, size; or bytecode.", "tags": ["contracts", "genlayer"], "parameters": [{"name": "address", "location": "path", "description": "0x-prefixed contract address.", "required": true}]},
  {"id": "contract-schema", "method": "GET", "path": "/api/v1/contracts/:address/schema", "title": "Contract method schema", "category": "Contracts", "description": "Constructor and public method signatures with read-only and payable flags.", "response": "Object: schema.", "tags": ["contracts", "genlayer"], "parameters": [{"name": "address", "location": "path", "description": "0x-prefixed contract address.", "required": true}]},
  { id: "contract-read", method: "GET", path: "/api/v1/contracts/:address/read", title: "Read a contract method", category: "Contracts", tags: ["contracts", "genlayer"],
    description: "Executes a declared read-only GenVM method without a wallet. Maximum three concurrent reads; execution may take up to 60 seconds. Integers beyond JavaScript's safe range must be quoted decimal strings.",
    response: "Object: state, synced_block, status, result, raw. A failed execution returns an error.",
    parameters: [{ name: "address", location: "path", required: true, pattern: /^0x[0-9a-fA-F]{40}$/, description: "Contract address." }, { name: "method", location: "query", required: true, description: "Declared read-only method name." }, { name: "args", location: "query", default: "[]", description: "JSON array of positional arguments." }, { name: "kwargs", location: "query", default: "{}", description: "JSON object of keyword arguments." }, { name: "state", location: "query", default: "decided", choices: ["decided", "finalized"], description: "Contract state to read." }] },
  {"id": "native-txs", "method": "GET", "path": "/api/v1/genlayer/transactions", "title": "Native transactions", "category": "Consensus", "description": "Consensus transactions, optionally filtered by contract address, status, EVM submission hash, execution outcome, or submission confirmation. execution=failed covers error, timeout, disagreement and violation. confirmation=provisional exposes the bounded live feed; orphaned submissions are hidden by default.", "response": "Object: transactions[], total, limit, offset.", "tags": ["consensus", "genlayer"]},
  {"id": "native-receipt", "method": "GET", "path": "/api/v1/genlayer/transactions/:id", "title": "Consensus receipt", "category": "Consensus", "description": "Native execution state, validator rounds, timestamps, and protocol fee accounting.", "response": "Object: receipt, submission_hash, block_number, stale, checked_at.", "tags": ["consensus", "genlayer"], "parameters": [{"name": "id", "location": "path", "description": "GenLayer consensus ID (32-byte hex), not the EVM submission hash.", "required": true}]},
  {"id": "native-result", "method": "GET", "path": "/api/v1/genlayer/transactions/:id/result", "title": "Retained execution output", "category": "Consensus", "description": "On-chain transaction data and retained execution output. Missing traces are explicitly null. Optional round=0..255 requests a specific retained round.", "response": "Object: returnData, decoded_return, leaderPublicData and transaction fields.", "tags": ["consensus", "genlayer"], "parameters": [{"name": "id", "location": "path", "description": "GenLayer consensus ID (32-byte hex), not the EVM submission hash.", "required": true}]},
  {"id": "native-events", "method": "GET", "path": "/api/v1/contracts/:address/events", "title": "Contract events", "category": "Contracts", "description": "Native events across 5,000 acceptance blocks. Supports active, cancelled, or all states and earlier ranges via to.", "response": "Object: events[], from_block, to_block, next_to, note.", "tags": ["contracts", "genlayer"], "parameters": [{"name": "address", "location": "path", "description": "0x-prefixed contract address.", "required": true}]},
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
    response: "Object: type (\"block\" | \"tx\" | \"address\" | \"contract\" | \"consensus\") and id. 400 for unrecognised input, 404 for an unknown hash." },
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
