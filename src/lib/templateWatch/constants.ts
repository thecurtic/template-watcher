export const MEMPOOL_BASE_URL = 'https://mempool.kilombino.com';

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

/** Pools excluded from watch alerts (they filter by policy already). */
export const EXCLUDED_POOLS = ['OCEAN'];

/** Average seconds per block, for date estimation. */
export const SECONDS_PER_BLOCK = 600;
