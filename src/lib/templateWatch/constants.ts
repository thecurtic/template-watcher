/**
 * Base URL of the block API. Empty string = same origin: in production Caddy
 * proxies /api/* to the self-hosted Template Watch server (see server/), and
 * in dev the Vite proxy forwards it (vite.config.ts). Override with
 * VITE_TW_API_BASE to point at any mempool-compatible instance.
 */
export const MEMPOOL_BASE_URL: string =
  (import.meta.env.VITE_TW_API_BASE as string | undefined) ?? '';

/** Bumped whenever we ship a change worth confirming reached the device. */
export const BUILD_STAMP = 'self-host-1';

/** Height at which mandatory BIP-110 signaling begins (~Aug 7, 2026). */
export const MANDATORY_SIGNALING_HEIGHT = 961_632;

/** Estimated date of the mandatory signaling height, for chart positioning. */
export const MANDATORY_SIGNALING_DATE = new Date('2026-08-07T00:00:00Z');

/**
 * First block of March 1, 2026 UTC — the observation epoch. The first
 * BIP-110-signaling block (OCEAN / Barefoot Mining) was mined later that day.
 */
export const BACKFILL_TARGET_HEIGHT = 938_781;

/** Height of the first BIP-110-signaling block (OCEAN, 2026-03-01 18:41 UTC). */
export const FIRST_SIGNALING_HEIGHT = 938_903;

/** localStorage key prefix for cached blocks (keyed by height). */
export const CACHE_KEY_PREFIX = 'tw:block:';

/** Key that stores the sorted list of cached heights + tip metadata. */
export const CACHE_META_KEY = 'tw:meta';

/** Polite delay between sequential requests (ms). */
export const FETCH_DELAY_MS = 250;

/**
 * How often the dashboard re-checks for new blocks while the tab is visible.
 * Blocks arrive every ~10 minutes and the backend polls its node every ~30s,
 * so one minute keeps the page effectively live without request spam.
 */
export const AUTO_REFRESH_MS = 60_000;

/**
 * Whether to run the historical backfill loop.
 *
 * Backfill is expensive (~900 sequential requests to reach the target height),
 * so by default it is DISABLED in dev (`npm run dev`) and ENABLED in the
 * production build. You can override this with the `VITE_TW_BACKFILL` env var:
 *   VITE_TW_BACKFILL=on   → force backfill on  (even in dev)
 *   VITE_TW_BACKFILL=off  → force backfill off (even in prod)
 */
export const BACKFILL_ENABLED: boolean = (() => {
  const override = import.meta.env.VITE_TW_BACKFILL as string | undefined;
  if (override === 'on') return true;
  if (override === 'off') return false;
  return import.meta.env.PROD; // default: prod = on, dev = off
})();

/** Pools excluded from watch alerts (they filter by policy already). */
export const EXCLUDED_POOLS = ['OCEAN'];

/**
 * How long a watch-feed event stays on screen, measured from its block
 * timestamp. Events older than this are hidden; they visibly fade during the
 * last quarter of the window.
 */
export const WATCH_EVENT_TTL_MS = 24 * 60 * 60 * 1000;

/** Maximum events shown in the watch feed at once (newest first). */
export const WATCH_FEED_MAX_EVENTS = 3;

/** Average seconds per block, for date estimation. */
export const SECONDS_PER_BLOCK = 600;
