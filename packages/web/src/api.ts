/** Typed client for the GenLayer explorer REST API. Shapes mirror packages/api. */

/**
 * Drives which variant every panel renders. `dberror` is synthesised in the
 * client when the API itself is unreachable.
 */
export type SystemState = "normal" | "loading" | "empty" | "stopped" | "dberror" | "backfill";

export type Source = "db" | "rpc";

export type RpcStatus = { url: string; healthy: boolean; benchedUntil: number; lastError: string | null; latencyMs: number | null };

/** /api/v1/stats — the chain + indexer snapshot every page reads. */
export type Network = {
  chain_id: number;
  indexed_head: number | null;
  chain_finalized: number | null;
  lag_blocks: number | null;
  indexer_updated_at: string | null;
  earliest_indexed: number | null;
  earliest_indexed_time: string | null;
  blocks_indexed: number;
  backfill_target: number | null;
  backfill_remaining: number | null;
  latest_block_time: string | null;
  observed_at: string;
  avg_block_time_ms: number | null;
  tps: number | null;
  blocks_24h: number;
  txs_24h: number;
  gas_price: string | null;
  rpc: RpcStatus[];
  epoch: number | null;
  epoch_delay_period: boolean | null;
  validators_active: number;
  validators_total: number;
  /** Total stake in force this epoch (active set), wei. */
  total_stake: string;
  blocks_10m: number;
  /** Per-minute blocks/txs over the last 30 minutes, oldest first. */
  recent_minutes: { t: string; blocks: number; txs: number }[];
};

export type Block = {
  number: number;
  hash: string;
  parent_hash: string;
  time: string;
  miner: string;
  gas_used: number;
  gas_limit: number;
  base_fee_per_gas: string | null;
  tx_count: number;
  size: number | null;
  l1_block_number: number | null;
  send_count: number | null;
  send_root: string | null;
};

export type Tx = {
  hash: string;
  block_number: number;
  tx_index: number;
  time: string;
  from: string;
  to: string | null;
  contract_address: string | null;
  value: string;
  nonce: number;
  type: number;
  gas_limit: number;
  gas_used: number;
  effective_gas_price: string;
  fee: string;
  status: number;
  method: string | null;
  input_size: number;
  log_count: number;
};

export type TokenMeta = { address: string; name: string | null; symbol: string | null; decimals: number | null; standard: string };

export type Transfer = {
  tx_hash?: string;
  log_index?: number;
  logIndex?: number;
  block_number?: number;
  time?: string;
  token: string;
  from: string;
  to: string;
  value: string;
  standard: "erc20" | "erc721";
  token_meta: TokenMeta | null;
};

export type TxDetail = {
  source: Source;
  tx: {
    hash: string;
    pending: boolean;
    block_number: number | null;
    block_hash: string | null;
    tx_index: number | null;
    time: string | null;
    confirmations: number | null;
    from: string;
    to: string | null;
    contract_address: string | null;
    value: string;
    nonce: number;
    type: number;
    gas_limit: number;
    gas_used: number | null;
    gas_price: string | null;
    max_fee_per_gas: string | null;
    max_priority_fee_per_gas: string | null;
    effective_gas_price: string | null;
    fee: string | null;
    status: number | null;
    input: string;
  };
  transfers: Transfer[];
  logs: { address: string; topics: string[]; data: string; log_index: number }[];
};

export type AddressInfo = {
  address: string;
  balance: string;
  nonce: number;
  is_contract: boolean;
  code_size: number;
  token: (TokenMeta & { first_seen_block: string }) | null;
  validator: { id: number; name: string | null; logo: string | null; role: "auth" | "beneficiary" } | null;
  window: { sent: number; received: number; count_cap: number; blocks_proposed: number };
  transfers: Transfer[];
};


export type MetricsPoint = {
  t: string;
  blocks: number;
  txs: number;
  tps: number;
  avg_block_time_ms: number | null;
  gas_utilization: number | null;
};

export type Metrics = {
  hours: number;
  allowed_hours: number[];
  bucket_secs: number;
  stats: {
    blocks: number;
    txs: number;
    avg_block_time_ms: number | null;
    tps: number | null;
    gas_utilization: number | null;
    max_txs_in_block: number | null;
  };
  series: MetricsPoint[];
  proposers: { id: number; name: string | null; logo: string | null; n: number; share: number | null }[];
};

export type Endpoint = {
  url: string;
  healthy: boolean;
  latency_ms: number | null;
  height: number | null;
  client: string | null;
  error: string | null;
  priority: number;
  used_by_indexer: boolean;
};

export type EndpointList = {
  indexer_rpc: string | null;
  chain_finalized: number | null;
  endpoints: Endpoint[];
  api_rpc: RpcStatus[];
};

export type Config = {
  chain: { name: string; network: string; chain_id: number; currency: { symbol: string; decimals: number } };
  rpc_endpoints: string[];
  indexer: { head: string; retain_hours: number; backfill_depth: number; database: string };
  validator_registry: string;
  metric_hours: number[];
  /** What the configured RPC allows; a private node raises these. */
  features: {
    full_history: boolean;
    trace_every: number;
    gas_replay: boolean;
    staking_history: boolean;
    staking_logs_range: number;
    pipeline: boolean;
  };
};


export type SearchResult = { type: "block" | "tx" | "address" | "contract" | "contracts" | "consensus"; id: string };

/** Parent-chain context from the latest indexed rollup block. */
export type Anchor = {
  latest_l1_block: number | null;
  latest_l2_block: number | null;
  latest_time: string | null;
  send_count: number | null;
  send_root: string | null;
  window_blocks: number;
  blocks_with_l1: number;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function get<T>(path: string, timeoutMs = 15_000): Promise<T> {
  const r = await fetch(path, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) {
    let detail = `${r.status}`;
    try {
      const body = (await r.json()) as { error?: string };
      if (body?.error) detail = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, r.status);
  }
  return r.json() as Promise<T>;
}

export const getNetwork = () => get<Network>("/api/v1/stats");
export const getBlocks = (limit = 25, before?: number) =>
  get<{ source: Source; blocks: Block[] }>(`/api/v1/blocks?limit=${limit}${before ? `&before=${before}` : ""}`);
export const getBlock = (id: number | string) =>
  get<{ source: Source; block: Block; txs: Tx[] }>(`/api/v1/blocks/${encodeURIComponent(String(id))}`);
/** `before` is the "block:index" cursor of the previous page's last row. */
export const getTransactions = (limit = 25, opts: { before?: string; address?: string } = {}) => {
  const q = new URLSearchParams({ limit: String(limit) });
  if (opts.before) q.set("before", opts.before);
  if (opts.address) q.set("address", opts.address);
  return get<{ source: Source; txs: Tx[] }>(`/api/v1/txs?${q}`);
};
export const getTransaction = (hash: string) => get<TxDetail>(`/api/v1/txs/${encodeURIComponent(hash)}`);
export const getAnchor = () => get<Anchor>("/api/v1/anchor");
export const getAddress = (address: string) => get<AddressInfo>(`/api/v1/address/${encodeURIComponent(address)}`);
export const getMetrics = (hours = 24) => get<Metrics>(`/api/v1/metrics?hours=${hours}`);
export const getEndpoints = () => get<EndpointList>("/api/v1/endpoints");
export const getConfig = () => get<Config>("/api/v1/config");
export const search = (q: string) => get<SearchResult>(`/api/v1/search?q=${encodeURIComponent(q)}`);

/** Same-origin logo URL for a validator (the API proxies and caches the registry logo). */
export const validatorLogoUrl = (id: number) => `/api/v1/validators/${id}/logo`;

