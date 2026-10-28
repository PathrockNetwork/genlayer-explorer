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


### Contract observatory

The explorer indexes native submission events in two tracks. Finalized submission history is retained independently of the EVM retention window. A provisional feed reconciles the latest unfinalized range on every pass, bounded to 1,000 recent blocks. Missing provisional submissions are marked orphaned; canonical submissions are promoted when finalized. Consensus finality, execution outcome, and submission confirmation are distinct fields.

Contract Health provides 24-hour, 7-day and 30-day analytics: returned/failed/unavailable outcomes, failure classes, distinct callers, consumed execution/storage/message fees, per-method aggregates, and creation-to-last-vote percentiles. The timing metric is not finalization latency. Amounts remain exact integer strings in the API; chart geometry is approximate. Analytics exclude provisional/orphaned submissions and undated receipts, with coverage displayed.

Names, descriptions and capability references are inferred from finalized on-chain source. Profiles are not verified project identities or security assessments. Source snapshots are refreshed every six hours (failed discoveries retry after ten minutes); first/last observation dates do not prove exact upgrade times. Versions can be compared with earlier snapshots or related deployments. No complete historical source archive is claimed.

Validator pages show observed round assignments, leadership and execution votes from indexed receipts, with sample coverage and transaction links. These metrics do not establish accuracy, agreement rates or uptime. Transaction explanations classify recorded protocol outcomes; lifecycle projections and observed state changes are labeled separately. Per-round outputs are fetched only on request and are explicitly unavailable when the node retained no trace. The explorer does not replay execution to manufacture missing evidence.

No watchlists or alerts are included. The dashboard's attention section is an on-page view of observed failures and extended consensus activity.

The GenLayer palette and official logo/token SVGs come from https://genlayer.com/brand. Pathrock Network remains the identified explorer operator. New visitors start in light mode; saved theme choices are respected.

The regular test suite covers classifications, source profiles/diffs and API validation. `packages/api/test/observatory.integration.test.ts` runs only when `DATABASE_URL` names `genlayer_features_preview`; it checks reconciliation and analytics against PostgreSQL using rollback-only fixtures. It is intentionally skipped against production.


## Loading and caching

The API keeps a bounded process-memory cache for selected public JSON snapshots: native activity and contract detail for 3–5 seconds, directories/attention for 10 seconds, analytics/validators for 15 seconds, and contract profiles/source snapshots for 30 seconds. Identical concurrent requests share work. Cache keys include the full path and sorted query parameters; addresses, filters and pagination stay separate. Failed responses are never retained. The cache is limited to 256 entries / 32 MiB, with at most 1 MiB per entry and 64 tracked in-flight requests. Restarting the API clears it; no cache files or extra service are needed.

API responses retain `Cache-Control: no-store` for browsers and proxies. `X-Explorer-Cache` reports MISS, HIT or COALESCED on eligible requests; `X-Explorer-Cache-Age-Ms` reports snapshot age. Send `Cache-Control: no-cache` to force a new snapshot. Health, version, search and contract method execution bypass this response cache. Existing RPC stats (2 seconds), endpoint probe (15 seconds), source (60 seconds) and content-keyed schema (5 minutes) caches remain separate.

The browser retains at most 48 recently visited page snapshots / 8 MiB in tab memory for 30 seconds. Returning to a page shows the saved data and its original timestamp while requesting an update; a failed update remains visible as an error and invalidates the saved snapshot for future visits. Keys include every address, filter, page and time window. Reloading the tab clears these snapshots.

Content-hashed Vite assets use `public, max-age=31536000, immutable`. HTML and unversioned branding assets use `no-cache` so clients revalidate and discover new releases. The release-version endpoint stays uncached.
