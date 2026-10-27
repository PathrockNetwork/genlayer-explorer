# GenLayer Explorer

GenLayer explorer (bradbury testnet) — blocks, transactions, token transfers,
indexed activity, and parent-chain block context. A Pathrock Network
explorer: same codebase family as `monad-explorer`, ported to GenLayer's
EVM JSON-RPC surface.

## Layout

| Path | What it is |
|---|---|
| `packages/core` | DB schema + migrations, rate-limited JSON-RPC client, pure decoding (`evm.ts`) |
| `packages/indexer` | Follows `finalized` blocks over HTTP polling, backfill/gap repair, retention sweep, token metadata, hourly usage rollup |
| `packages/api` | Fastify REST API (`/api/v1/*`) and host for the built web app |
| `packages/web` | React explorer (Vite) |
| `deploy/` | systemd units |

## GenLayer specifics

- This explorer covers the Bradbury EVM chain (4221). Intelligent-contract consensus is a separate layer.
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
