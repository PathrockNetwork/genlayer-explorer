import { get } from "./api";
export type Contract = {
  address: string;
  kind: "intelligent" | "evm";
  name?: string | null;
  profile?: {
    description: string;
    tags: string[];
    methods: { name: string; readonly: boolean }[];
  } | null;
  source_hash?: string | null;
  creator: string | null;
  deployment_id: string | null;
  deployment_tx: string | null;
  deployment_block: number | null;
  deployed_at: string | null;
  first_seen_block: number | null;
  calls_24h: number;
  callers_24h?: number;
  balance?: string;
  source_available?: boolean;
  bytecode?: string | null;
};
export type NativeTransaction = {
  id: string;
  recipient: string;
  submission_hash: string;
  block_number: number;
  sender: string | null;
  created_at: string | null;
  status: string;
  kind: string | null;
  method: string | null;
  rounds: number | null;
  checked_at: string | null;
  execution_result?: string;
  confirmation?: string;
  observed_at?: string;
  contract_name?: string | null;
};
export type NativeOverview = {
  contracts: { total: number; intelligent: number; new_24h: number };
  activity: {
    total: number;
    calls_24h: number;
    active_24h: number;
    in_consensus: number;
    unresolved: number;
    failed_24h: number;
    provisional: number;
  };
  statuses: { status: string; count: number }[];
  top_contracts: {
    address: string;
    name?: string | null;
    calls_24h: number;
    callers_24h: number;
  }[];
  sync: {
    live_head?: string;
    live_from?: string;
    live_updated_at?: string;
    live_error?: string | null;
    head: string;
    history_next: string;
    start_block: string;
    target: string;
    updated_at: string;
    last_error: string | null;
  } | null;
  genvm: {
    synced_block: number;
    latest_block: number;
    blocks_behind: number;
  } | null;
};
export const contractRoute = (address: string) => `#/contracts/${address}`;
export const consensusRoute = (id: string) => `#/consensus/${id}`;
export const loadNativeOverview = () =>
  get<NativeOverview>("/api/v1/genlayer/overview");
export const getNativeTransactions = (query: Record<string, string> = {}) =>
  get<{ transactions: NativeTransaction[]; total: number }>(
    `/api/v1/genlayer/transactions?${new URLSearchParams(query)}`,
  );
export const statusTone = (status: string) =>
  status === "Finalized"
    ? "neutral"
    : status === "Canceled"
      ? "failed"
      : status === "Unknown"
        ? "neutral"
        : "pending";
export const statusLabel = (status: string) =>
  status === "Unknown"
    ? "Awaiting receipt"
    : status.replace(/([a-z])([A-Z])/g, "$1 $2");
export const resultLabel = (result: number) =>
  [
    "Idle",
    "Majority agree",
    "Majority disagree",
    "Majority timeout",
    "Deterministic violation",
    "No majority",
  ][result] ?? `Result ${result}`;
export const voteLabel = (vote: number | null) =>
  vote == null
    ? "Unavailable"
    : ([
        "Not voted",
        "Returned",
        "Execution error",
        "Timeout",
        "Nondeterministic disagreement",
        "Deterministic violation",
      ][vote] ?? `Vote ${vote}`);
