import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  doublePrecision,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/*
 * By default the database is a rolling window over the chain, not an
 * archive. GenLayer produces blocks continuously, so everything older than
 * RETAIN_HOURS is swept and the API reads it through from the archive RPC
 * instead. RETAIN_HOURS=0 keeps everything (full-history mode). Addresses
 * and hashes are stored lowercase 0x-hex; wei amounts are numeric because
 * they exceed every integer type.
 */

/** One row per finalized block, with GenLayer's L1-anchoring fields. */
export const blocks = pgTable(
  "blocks",
  {
    number: bigint("number", { mode: "number" }).primaryKey(),
    hash: text("hash").notNull(),
    parentHash: text("parent_hash").notNull(),
    time: timestamp("time", { withTimezone: true }).notNull(),
    /** Block beneficiary address (the `miner` field). */
    miner: text("miner").notNull(),
    gasUsed: bigint("gas_used", { mode: "number" }).notNull(),
    gasLimit: bigint("gas_limit", { mode: "number" }).notNull(),
    baseFeePerGas: numeric("base_fee_per_gas"),
    txCount: integer("tx_count").notNull(),
    size: integer("size"),
    /** Parent block observed by the sequencer; not a settlement proof. */
    l1BlockNumber: bigint("l1_block_number", { mode: "number" }),
    /** Cumulative L2-to-parent message count reported by the rollup. */
    sendCount: integer("send_count"),
    /** Rollup send-tree root reported in the block header. */
    sendRoot: text("send_root"),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byTime: index("blocks_time_idx").on(t.time),
    byHash: index("blocks_hash_idx").on(t.hash),
    byMiner: index("blocks_miner_idx").on(t.miner, t.number),
    byAnchor: index("blocks_anchor_idx").on(t.l1BlockNumber, t.number),
  }),
);

/**
 * One row per transaction, joined with its receipt. No FK to blocks: the hot
 * insert path runs in the same transaction as the block row anyway, and the
 * retention sweep deletes both by block number.
 */
export const transactions = pgTable(
  "transactions",
  {
    hash: text("hash").primaryKey(),
    blockNumber: bigint("block_number", { mode: "number" }).notNull(),
    txIndex: integer("tx_index").notNull(),
    time: timestamp("time", { withTimezone: true }).notNull(),
    from: text("from").notNull(),
    /** Null for contract creation. */
    to: text("to"),
    /** Address deployed by a creation transaction. */
    contractAddress: text("contract_address"),
    value: numeric("value").notNull(),
    nonce: bigint("nonce", { mode: "number" }).notNull(),
    type: smallint("type").notNull(),
    gasLimit: bigint("gas_limit", { mode: "number" }).notNull(),
    gasUsed: bigint("gas_used", { mode: "number" }).notNull(),
    effectiveGasPrice: numeric("effective_gas_price").notNull(),
    /** gas_used × effective_gas_price, in wei. */
    fee: numeric("fee").notNull(),
    /** 1 = success, 0 = reverted. */
    status: smallint("status").notNull(),
    /** First four bytes of calldata (0x-prefixed), null for plain transfers. */
    method: text("method"),
    inputSize: integer("input_size").notNull(),
    logCount: integer("log_count").notNull(),
  },
  (t) => ({
    byBlock: index("txs_block_idx").on(t.blockNumber, t.txIndex),
    byFrom: index("txs_from_idx").on(t.from, t.blockNumber),
    byTo: index("txs_to_idx").on(t.to, t.blockNumber),
  }),
);

/**
 * ERC-20 / ERC-721 `Transfer` events. Both standards share topic0; ERC-721
 * indexes the token id (4 topics) where ERC-20 puts the amount in data.
 */
export const tokenTransfers = pgTable(
  "token_transfers",
  {
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: bigint("block_number", { mode: "number" }).notNull(),
    time: timestamp("time", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    from: text("from").notNull(),
    to: text("to").notNull(),
    /** ERC-20 amount, or the ERC-721 token id. */
    value: numeric("value").notNull(),
    standard: text("standard").notNull(), // "erc20" | "erc721"
  },
  (t) => ({
    pk: primaryKey({ columns: [t.txHash, t.logIndex] }),
    byBlock: index("transfers_block_idx").on(t.blockNumber),
    byFrom: index("transfers_from_idx").on(t.from, t.blockNumber),
    byTo: index("transfers_to_idx").on(t.to, t.blockNumber),
    byToken: index("transfers_token_idx").on(t.token, t.blockNumber),
  }),
);

/**
 * Token metadata, resolved lazily over eth_call. Unlike the windowed tables
 * this is never swept: a contract's name and decimals do not expire.
 * Null fields mean the contract did not answer that call, not "unknown yet";
 * `resolvedAt` null means not attempted.
 */
export const tokens = pgTable(
  "tokens",
  {
    address: text("address").primaryKey(),
    name: text("name"),
    symbol: text("symbol"),
    decimals: smallint("decimals"),
    standard: text("standard").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    firstSeenBlock: bigint("first_seen_block", { mode: "number" }).notNull(),
  },
  (t) => ({
    unresolved: index("tokens_unresolved_idx")
      .on(t.address)
      .where(sql`${t.resolvedAt} is null`),
  }),
);

/**
 * Hourly per-contract usage, rolled up from `transactions` by the indexer so
 * day-scale leaderboards don't scan millions of rows. Distinct senders are
 * not additive across hours, so they are not kept here.
 */
export const usageHourly = pgTable(
  "usage_hourly",
  {
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    /** Called contract or recipient; "" for contract creations. */
    address: text("address").notNull(),
    txs: integer("txs").notNull(),
    failed: integer("failed").notNull(),
    gas: doublePrecision("gas").notNull(),
    fees: numeric("fees").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.hour, t.address] }),
  }),
);

/** Single-row indexer bookkeeping (id = 1). */
export const syncState = pgTable("sync_state", {
  id: integer("id").primaryKey(),
  chainId: integer("chain_id").notNull(),
  /** Newest block ingested by the live follower. */
  headNumber: bigint("head_number", { mode: "number" }),
  /** Oldest block the backfill should reach; moves forward with retention. */
  backfillTarget: bigint("backfill_target", { mode: "number" }),
  /** Newest finalized height the RPC reported at the last poll. */
  chainFinalized: bigint("chain_finalized", { mode: "number" }),
  activeRpc: text("active_rpc"),
  /** Newest block folded into usage_hourly. */
  usageRolledTo: bigint("usage_rolled_to", { mode: "number" }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Native protocol metadata is retained independently of the rolling EVM window. */
export const genContracts = pgTable("gen_contracts", {
  address: text("address").primaryKey(),
  kind: text("kind").notNull(),
  creator: text("creator"),
  deploymentId: text("deployment_id"),
  deploymentTx: text("deployment_tx"),
  deploymentBlock: bigint("deployment_block", { mode: "number" }),
  deployedAt: timestamp("deployed_at", { withTimezone: true }),
  firstSeenBlock: bigint("first_seen_block", { mode: "number" }).notNull(),
  name: text("name"),
  profile: jsonb("profile"),
  sourceHash: text("source_hash"),
  profileCheckedAt: timestamp("profile_checked_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const genTransactions = pgTable("gen_transactions", {
  id: text("id").primaryKey(),
  recipient: text("recipient").notNull(),
  submissionHash: text("submission_hash").notNull(),
  blockNumber: bigint("block_number", { mode: "number" }).notNull(),
  sender: text("sender"),
  createdAt: timestamp("created_at", { withTimezone: true }),
  status: text("status").notNull().default("Unknown"),
  kind: text("kind"),
  method: text("method"),
  confirmation: text("confirmation").notNull().default("confirmed"),
  submissionBlockHash: text("submission_block_hash"),
  observedAt: timestamp("observed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  executionResult: text("execution_result").notNull().default("unknown"),
  analysisVersion: integer("analysis_version").notNull().default(0),
  receipt: jsonb("receipt"),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const genSync = pgTable("gen_sync", {
  id: integer("id").primaryKey(),
  head: bigint("head", { mode: "number" }).notNull(),
  historyNext: bigint("history_next", { mode: "number" }).notNull(),
  startBlock: bigint("start_block", { mode: "number" }).notNull(),
  liveHead: bigint("live_head", { mode: "number" }),
  liveFrom: bigint("live_from", { mode: "number" }),
  liveUpdatedAt: timestamp("live_updated_at", { withTimezone: true }),
  liveError: text("live_error"),
  target: bigint("target", { mode: "number" }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastError: text("last_error"),
});

export const genContractSources = pgTable(
  "gen_contract_sources",
  {
    address: text("address").notNull(),
    sha256: text("sha256").notNull(),
    source: text("source").notNull(),
    profile: jsonb("profile").notNull(),
    firstObservedAt: timestamp("first_observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    observedBlock: bigint("observed_block", { mode: "number" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.address, t.sha256] }) }),
);
export const genValidatorVotes = pgTable(
  "gen_validator_votes",
  {
    txId: text("tx_id").notNull(),
    round: integer("round").notNull(),
    position: integer("position").notNull(),
    address: text("address").notNull(),
    leader: boolean("leader").notNull(),
    active: boolean("active").notNull().default(true),
    vote: integer("vote"),
    resultHash: text("result_hash"),
    consensusResult: integer("consensus_result"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.txId, t.round, t.position] }),
    byAddress: index("gen_validator_votes_address_idx").on(t.address, t.txId),
  }),
);
export const genReceiptObservations = pgTable(
  "gen_receipt_observations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    txId: text("tx_id").notNull(),
    status: text("status").notNull(),
    executionResult: text("execution_result").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byTx: index("gen_receipt_observations_tx_idx").on(t.txId, t.observedAt),
  }),
);
