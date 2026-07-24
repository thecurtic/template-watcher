# Template Watch

**A neutral, real-time observability dashboard for the BIP-110 soft fork debate.**

Template Watch answers one question no existing tool answers: **which mining pools are
producing BIP-110-compliant block templates _without signaling_ for the fork** —
the leading indicator that a miner may be quietly positioning to switch sides before the
mandatory signaling window begins at block height **961,632** (~Aug 7, 2026).

The tone is deliberately neutral measurement, not advocacy. The most likely finding is
"no positioning detected" — and that empty state is treated as the headline, not an error.

[![Edit with Shakespeare](https://shakespeare.diy/badge.svg)](https://shakespeare.diy/clone?url=https%3A%2F%2Fgithub.com%2Fthecurtic%2Ftemplate-watcher.git)

---

## What it shows

The dashboard is a single page with three stacked sections in a dark monitoring-console
aesthetic:

1. **Watch Feed** — notable events from the last 24 hours (older events fade out and
   age away, keeping the feed compact):
   - First signaling block from a pool
   - ⚠ First **BIP-110-compliant non-signaling** block from a pool (the tell)
   - ⚠ Day-over-day jumps in a pool's BIP-110-compliant template share
   - When nothing is happening, a calm "No positioning detected" state with a countdown of
     blocks remaining until height 961,632.
2. **Pool Matrix** — one row per pool: block count, signaling %, BIP-110 compliant %, and a highlighted
   "compliant but not signaling" column. Pools under 1% of analyzed blocks collapse into "Other".
3. **Trend** — a per-day line chart of BIP-110-compliant template (or signaling) share per pool, with a
   dashed marker for the estimated mandatory-signaling date. Toggle the y-axis between compliant
   share and signaling share.

## Data source

Data is served by our own lightweight backend in [`server/`](server/), which indexes
blocks directly from a self-hosted Bitcoin full node and exposes a mempool-compatible
API on the same origin (`/api/*`):

- `GET /api/v1/blocks` — latest blocks, newest first
- `GET /api/v1/blocks/{height}` — a page of blocks at and below `{height}` (used for
  backfill; supports `?limit=` up to 500)
- `GET /healthz` — indexer status (tip, floor, backfill progress)

The index reaches back to height **938,781** (March 1, 2026 — the first
BIP-110-signaling block, from OCEAN / Barefoot Mining, was mined later that day at
height 938,903).

### Credit

The BIP-110 violation-detection method — the seven-rule per-transaction checker and
the per-block violation counts — is ported from
[**Kilombino's mempool fork**](https://github.com/Kilombino/mempool-bip110)
(`backend/src/api/common.ts`), itself derived from
[paulscode/mempool-bip110](https://github.com/paulscode/mempool-bip110). Both are
AGPL-3.0; the ported code in `server/src/bip110.ts` remains AGPL-3.0. Before we
self-hosted, this dashboard ran against Kilombino's public instance at
[`mempool.kilombino.com`](https://mempool.kilombino.com), which remains the reference
we validate against (`server/src/validate.ts`). Pool attribution uses the open
[mempool/mining-pools](https://github.com/mempool/mining-pools) dataset (vendored as
`server/pools.json`).

The app auto-discovers the violation field on the first fetched block (case-insensitively
scanning for `bip110`, `violation`, `violating`, `reduced`). It resolves to
`extras.bip110ViolationCount`. If no violation field is exposed, the app degrades
gracefully into **signaling-only mode** and hides the compliance columns.

### Definitions

- **signaling**: `(version & 0xE0000000) === 0x20000000 && (version & 0x10) !== 0`
  (BIP9 version prefix **and** bit 4 set), computed with unsigned 32-bit math.
- **BIP-110 compliant** (`clean` in code): `violationCount === 0` for that block.
- **OCEAN** is excluded from watch _alerts_ (they filter by policy already) but still appears
  in the matrix.
- Missing/`null` pool or version fields are counted as **"Unknown"** rather than crashing.

## Resilience

- Every fetched block is cached in `localStorage` keyed by height. On reload the cache is
  used and only missing heights are fetched.
- Requests are sequential with a ~250ms delay (no parallel storms) and retried once with
  backoff before being skipped.
- Backfill runs incrementally from the current tip back to height 938,781 (March 1, 2026),
  rendering as data arrives with a progress indicator — the UI is never blocked.
- If the API is unreachable, the app renders entirely from cache with an
  "offline — showing cached data" banner.

## Nostr integration

Each watch-feed event has a **Publish to Nostr** button. When you are logged in with a Nostr
signer (NIP-07 extension, nsec, or remote signer), it signs a plain-text `kind 1` note and
publishes it to the app's default relays. If no signer is available, it falls back to copying
the note text to your clipboard. There is no auto-posting and no key generation.

## Tech stack

- **React 19** + **TypeScript** + **Vite**
- **TailwindCSS 4** + **shadcn/ui**
- **Recharts** for the trend chart
- **Nostrify** (`@nostrify/react`) for Nostr publishing
- **TanStack Query** for data/state
- Built on the [MKStack](https://gitlab.com/soapbox-pub/mkstack) template

## Development

```bash
npm install    # install dependencies
npm run dev    # start the dev server
npm run build  # production build into dist/
npm test       # typecheck + lint + tests + build
```

## Self-hosting

The site runs at `template-watcher.curtisheinen.com`: the static frontend plus the
`server/` backend behind Caddy on the same subdomain, with the backend reading blocks
over Tailscale from a Bitcoin full node. See [`server/README.md`](server/README.md)
for the full deployment guide (node RPC config, Caddy, systemd, validation).

## Project layout

```
server/                     # self-hosted backend (see server/README.md)
├── src/
│   ├── bip110.ts           # 7-rule violation checker (ported from Kilombino)
│   ├── pools.ts            # pool attribution (mempool mining-pools dataset)
│   ├── indexer.ts          # tip-follow + backfill from node RPC
│   ├── server.ts           # mempool-compatible HTTP API
│   └── validate.ts         # parity check against mempool.kilombino.com
src/
├── lib/templateWatch/
│   ├── types.ts        # shared type definitions
│   ├── constants.ts    # heights, URLs, cache keys, tuning
│   ├── api.ts          # fetching + localStorage caching
│   └── analysis.ts     # signaling/compliance math, pool stats, events, trend
├── hooks/
│   └── useTemplateWatch.ts   # orchestrates fetch → cache → backfill → analyze
├── components/templateWatch/
│   ├── WatchFeed.tsx
│   ├── PoolMatrix.tsx
│   ├── TrendChart.tsx
│   ├── StatusBar.tsx          # offline / signaling-only / backfill banners
│   └── NostrPublishButton.tsx
└── pages/
    └── TemplateWatch.tsx      # the single dashboard page (mounted at "/")
```

## Disclaimer

Template Watch is an independent project, affiliated with no side of the BIP-110 debate.
Signatures and on-chain data prove _what happened_, not intent. "Positioning" is an
inference, not a fact — read the numbers, draw your own conclusions.

Built at bitcoin++ Toronto 2026 · Vibed with [Shakespeare](https://shakespeare.diy).
