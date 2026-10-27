# GenLayer Explorer

GenLayer explorer (bradbury testnet) — blocks, transactions, token transfers,
indexed activity, and parent-chain block context. A Pathrock Network
explorer: same codebase family as `monad-explorer`, ported to GenLayer's
EVM and native GenLayer JSON-RPC surfaces.

## Layout

| Path | What it is |
|---|---|
| `packages/core` | DB schema + migrations, rate-limited JSON-RPC client, pure decoding (`evm.ts`) |
| `packages/indexer` | Follows `finalized` blocks over HTTP polling, backfill/gap repair, retention sweep, token metadata, hourly usage rollup |
| `packages/api` | Fastify REST API (`/api/v1/*`) and host for the built web app |
| `packages/web` | React explorer (Vite) |
| `deploy/` | systemd units |

## GenLayer specifics

- This explorer covers the Bradbury EVM chain (4221) and native intelligent contracts. EVM submission hashes and GenLayer consensus IDs have distinct pages and finality states.
- `l1BlockNumber` is the parent block observed by the sequencer; `sendCount` and `sendRoot` are rollup message-tree fields. `/api/v1/anchor` exposes these as context, without inferring settlement or consensus finality.
- The overview shows indexed head, block time, transaction rate, gas price, recent blocks and transactions, and finalized activity. Zero values, unavailable data, request failures, and paused refreshes are distinct states.
- Backfill completeness counts missing blocks in the target range. The indexer updates its heartbeat after every successful finalized-head poll, including idle periods.
- References: [GenLayer networks](https://docs.genlayer.com/developers/networks) and [Arbitrum block fields](https://docs.arbitrum.io/build-decentralized-apps/troubleshooting-building).

## Setup

```bash
pnpm install
cp .env.example .env            # set DATABASE_URL + RPC_URLS
pnpm --filter @genlayer-explorer/core db:migrate
pnpm dev                        # or build + run under systemd (see deploy/)
```


## Intelligent contracts and consensus

The Contracts directory discovers native recipients from authenticated `NewTransaction` and `InternalMessageProcessed` events emitted by the Bradbury Phase 2 consensus contract. Its address and genesis are pinned in `packages/core/src/genlayer.ts` from the official protocol manifest. The SDK network addresses are not used because its deployment configuration predates the current chain.

An independent native index records submissions and periodically refreshes nonterminal receipts. It starts near the finalized EVM tip, backfills to protocol genesis, and persists its cursors in Postgres. Discovery and receipt enrichment have independent progress; the UI reports incomplete coverage and unresolved receipts. Native submissions and contract metadata are retained; the existing rolling EVM retention policy is unchanged. All migrations are additive.

Contract pages expose source, source hash, method schemas, read-only queries, native transactions, and events. Original Solidity source is not reconstructed from EVM bytecode. Deployment metadata is shown only when supported by a decoded deployment or EVM creation receipt. Source references to LLM/web APIs are explicitly static observations.

Consensus pages show live receipt status, rounds, validator execution votes, lifecycle timestamps, fee budgets/consumption, and optional retained output. `Accepted` is not `Finalized`; cancelled event rounds remain inspectable. Native events use GenVM calldata encoding and current event lifecycle state, with a bounded 5,000-block range and explicit node-retention caveat.

Read requests are GET endpoints for compatibility with the read-only proxy, but execute only `gen_call` with `type: read` after checking the method schema. They have no signer or wallet. Source/schema caches are bounded; concurrent reads are limited; GenVM execution gets a 60-second timeout and is never automatically retried. Current GenVM calls use the empty-key method convention documented at https://sdk.genlayer.com/main/spec/04-contract-interface/02-abi.html; the SDK supplies binary calldata encoding. Schema-based argument conversion preserves exact integers and native address and byte types.
