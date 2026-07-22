export const MEMPOOL_BASE_URL = 'https://mempool.kilombino.com';

/** Bumped whenever we ship a change worth confirming reached the device. */
export const BUILD_STAMP = 'diag-1';

/** Height at which mandatory BIP-110 signaling begins (~Aug 7, 2026). */
export const MANDATORY_SIGNALING_HEIGHT = 961_632;

/** Estimated date of the mandatory signaling height, for chart positioning. */
export const MANDATORY_SIGNALING_DATE = new Date('2026-08-07T00:00:00Z');

/** Backfill floor — about 2.5 months of history. */
export const BACKFILL_TARGET_HEIGHT = 945_000;

/** localStorage key prefix for cached blocks (keyed by height). */
export const CACHE_KEY_PREFIX = 'tw:block:';

/** Key that stores the sorted list of cached heights + tip metadata. */
export const CACHE_META_KEY = 'tw:meta';

/** Polite delay between sequential requests (ms). */
export const FETCH_DELAY_MS = 250;

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

/** Average seconds per block, for date estimation. */
export const SECONDS_PER_BLOCK = 600;
