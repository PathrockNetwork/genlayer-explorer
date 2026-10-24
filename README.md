# genlayer-monitor

GenLayer explorer (bradbury testnet) — blocks, transactions, token transfers,
usage analytics, and GenLayer's L1-anchoring cadence. A Pathrock Network
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

- Blocks carry `l1BlockNumber` / `sendCount` / `sendRoot` — the L1-anchoring
  commitment. Indexed per block and surfaced on the overview and block pages
  plus `/api/v1/anchor`.
- No staking precompile, no trace methods, no BFT-stage subscription on the
  public RPC, so those Monad-explorer features are absent rather than stubbed.

## Setup

```bash
pnpm install
cp .env.example .env            # set DATABASE_URL + RPC_URLS
pnpm --filter @genlayer-explorer/core db:migrate
pnpm dev                        # or build + run under systemd (see deploy/)
```
