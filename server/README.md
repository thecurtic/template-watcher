# Template Watch server

A zero-dependency Node service that replaces the public `mempool.kilombino.com` API for
the Template Watch dashboard. It reads blocks straight from your own Bitcoin Knots (or
Core) node over JSON-RPC, computes BIP-110 signaling + violation data per block, stores
a slim index in SQLite, and serves the mempool-compatible endpoints the frontend
already speaks.

Nothing is installed on the node machine — only an RPC config change (below).

## Attribution & license

The seven-rule BIP-110 violation checker in `src/bip110.ts` is ported from
[Kilombino/mempool-bip110](https://github.com/Kilombino/mempool-bip110)
(`backend/src/api/common.ts`), derived from
[paulscode/mempool-bip110](https://github.com/paulscode/mempool-bip110). Both are
**AGPL-3.0**, so this server directory is AGPL-3.0 too. `src/validate.ts` verifies the
port produces byte-identical results against Kilombino's public instance.

Pool attribution follows mempool's `matchBlockMiner` using the open
[mempool/mining-pools](https://github.com/mempool/mining-pools) dataset, vendored as
`pools.json` — refresh it occasionally:

```bash
curl -sL https://raw.githubusercontent.com/mempool/mining-pools/master/pools-v2.json -o pools.json
```

## Requirements

- **Node.js ≥ 23.6** (runs TypeScript natively; uses built-in `node:sqlite`) — no npm
  packages needed at runtime
- A **non-pruned** Bitcoin Knots/Core node reachable over the tailnet
  - `getblock` verbosity 3 (prevouts) needs Core/Knots ≥ 25; older nodes fall back to
    verbosity 2 automatically (violation detection then infers taproot spends from
    witness structure, same as Kilombino's prevout-less path)

## Node machine: bitcoin.conf

Add a read-only RPC user for the webserver's tailnet IP (example tailnet addresses —
substitute your own). `rpcauth` line generated with `share/rpcauth/rpcauth.py`:

```ini
# Listen on the tailnet interface too (keep 127.0.0.1 if other things use it)
rpcbind=127.0.0.1
rpcbind=100.x.y.z          # the node's tailscale IP
rpcallowip=127.0.0.1
rpcallowip=100.a.b.c/32    # the webserver's tailscale IP

# Read-only user for template-watch (password via rpcauth, not rpcpassword)
rpcauth=templatewatch:<hash from rpcauth.py>
rpcwhitelist=templatewatch:getblockcount,getbestblockhash,getblockhash,getblockheader,getblock
rpcwhitelistdefault=0
```

Restart the node after editing. Even if the webserver were compromised, this user can
only read block data.

## Running on the webserver

```bash
cd server
TW_RPC_URL=http://100.x.y.z:8332 \
TW_RPC_USER=templatewatch \
TW_RPC_PASS=... \
node src/index.ts
```

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `TW_RPC_URL` | `http://127.0.0.1:8332` | Node RPC endpoint (tailnet IP) |
| `TW_RPC_USER` / `TW_RPC_PASS` | — | RPC credentials |
| `TW_RPC_COOKIE_FILE` | — | Alternative to user/pass |
| `TW_DB_PATH` | `data/template-watch.db` | SQLite index location |
| `TW_HOST` / `TW_PORT` | `127.0.0.1` / `8999` | API bind address |
| `TW_FLOOR_HEIGHT` | `938781` | Backfill floor (first block of Mar 1, 2026) |
| `TW_POLL_INTERVAL_MS` | `30000` | Tip poll interval |
| `TW_CONCURRENCY` | `4` | Parallel RPC calls during backfill |

On first start it follows the tip, then backfills ~21,000 blocks down to the floor
(an hour or two depending on the node's disk). Progress is logged every 250 blocks and
visible at `/healthz`. The index is ~5 MB; re-runs only fetch missing heights.

### systemd unit

```ini
# /etc/systemd/system/template-watch.service
[Unit]
Description=Template Watch BIP-110 indexer/API
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
User=templatewatch
WorkingDirectory=/opt/template-watcher/server
Environment=TW_RPC_URL=http://100.x.y.z:8332
Environment=TW_RPC_USER=templatewatch
Environment=TW_RPC_PASS=CHANGE_ME
ExecStart=/usr/bin/node src/index.ts
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## Caddy (template-watcher.curtisheinen.com)

Frontend and API share one origin — no CORS anywhere:

```caddyfile
template-watcher.curtisheinen.com {
    encode gzip

    handle /api/* {
        reverse_proxy 127.0.0.1:8999
    }
    handle /healthz {
        reverse_proxy 127.0.0.1:8999
    }

    handle {
        root * /opt/template-watcher/dist
        try_files {path} /index.html
        file_server
    }
}
```

Build the frontend with `npm run build` at the repo root and deploy `dist/`.

If you proxy through Cloudflare: deep block pages are served with
`Cache-Control: public, max-age=604800, immutable`, so a cache rule on
`/api/v1/blocks/*` (cache by respecting origin headers) makes visitor backfills hit
your server almost never.

## API

- `GET /api/v1/blocks` — newest 15 blocks
- `GET /api/v1/blocks/{height}?limit=N` — blocks at/below height, newest first
  (default 15, max 500)
- `GET /healthz` — `{ tip, floor, indexed, backfillDone }`

Blocks are returned in the slim mempool-compatible shape the dashboard consumes:
`{ id, height, version, timestamp, tx_count, extras: { pool, bip110Signaling,
bip110ViolationCount, bip110ViolationWeight } }`.

## Validation

Prove the ported checker matches Kilombino's numbers (audited range only —
kilombino's own audit starts at height 953,087; their earlier blocks are 0-filled):

```bash
node src/validate.ts                # 3 most recent blocks
node src/validate.ts 954000 959353  # specific heights
```

It fetches every transaction of each block from `mempool.kilombino.com`, runs our
checker, and compares counts and weights. Expect `ALL BLOCKS MATCH`.

## Development

```bash
npm install       # dev-only: typescript + @types/node
npm run typecheck
npm start
```
