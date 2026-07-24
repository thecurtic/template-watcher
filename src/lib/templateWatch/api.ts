import type { RawBlock } from './types';
import {
  MEMPOOL_BASE_URL,
  CACHE_KEY_PREFIX,
  CACHE_META_KEY,
  FETCH_DELAY_MS,
} from './constants';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Which network path last succeeded — surfaced in the on-screen diagnostics so
 * issues can be debugged on devices without DevTools (e.g. iPad Safari).
 */
export type FetchMode = 'idle' | 'direct' | 'failed';
let lastFetchMode: FetchMode = 'idle';
export function getLastFetchMode(): FetchMode {
  return lastFetchMode;
}

export interface CacheMeta {
  tip: number | null;
  updatedAt: number;
}

export function readCacheMeta(): CacheMeta {
  try {
    const raw = localStorage.getItem(CACHE_META_KEY);
    if (raw) return JSON.parse(raw) as CacheMeta;
  } catch {
    // ignore
  }
  return { tip: null, updatedAt: 0 };
}

export function writeCacheMeta(meta: CacheMeta): void {
  try {
    localStorage.setItem(CACHE_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore quota errors
  }
}

export function readCachedBlock(height: number): RawBlock | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}${height}`);
    if (raw) return JSON.parse(raw) as RawBlock;
  } catch {
    // ignore
  }
  return null;
}

export function writeCachedBlock(block: RawBlock): void {
  try {
    localStorage.setItem(`${CACHE_KEY_PREFIX}${block.height}`, JSON.stringify(block));
  } catch {
    // localStorage full — prune oldest blocks and retry once.
    pruneCache(200);
    try {
      localStorage.setItem(`${CACHE_KEY_PREFIX}${block.height}`, JSON.stringify(block));
    } catch {
      // give up silently
    }
  }
}

/** Return all cached heights, ascending. */
export function cachedHeights(): number[] {
  const heights: number[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(CACHE_KEY_PREFIX)) {
      const h = Number(key.slice(CACHE_KEY_PREFIX.length));
      if (Number.isFinite(h)) heights.push(h);
    }
  }
  heights.sort((a, b) => a - b);
  return heights;
}

export function readAllCachedBlocks(): RawBlock[] {
  const out: RawBlock[] = [];
  for (const h of cachedHeights()) {
    const b = readCachedBlock(h);
    if (b) out.push(b);
  }
  return out;
}

/** Remove the `count` lowest-height cached blocks to free space. */
function pruneCache(count: number): void {
  const heights = cachedHeights();
  for (let i = 0; i < Math.min(count, heights.length); i++) {
    try {
      localStorage.removeItem(`${CACHE_KEY_PREFIX}${heights[i]}`);
    } catch {
      // ignore
    }
  }
}

async function rawFetch(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetch JSON with one retry. The API is same-origin (served by our own
 * backend behind Caddy), so there is no CORS fallback anymore.
 * Errors are logged (not swallowed) so failures are visible in the console.
 */
async function fetchJson(url: string): Promise<unknown> {
  try {
    const r = await rawFetch(url);
    lastFetchMode = 'direct';
    return r;
  } catch {
    await sleep(600);
    try {
      const r = await rawFetch(url);
      lastFetchMode = 'direct';
      return r;
    } catch (err2) {
      lastFetchMode = 'failed';
      console.error(`[TemplateWatch] fetch failed for ${url}`, err2);
      throw err2;
    }
  }
}

function isRawBlock(x: unknown): x is RawBlock {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as RawBlock).height === 'number' &&
    typeof (x as RawBlock).version === 'number'
  );
}

/** GET /api/v1/blocks — latest ~10 blocks, newest first. */
export async function fetchLatestBlocks(): Promise<RawBlock[]> {
  const data = await fetchJson(`${MEMPOOL_BASE_URL}/api/v1/blocks`);
  if (!Array.isArray(data)) return [];
  return data.filter(isRawBlock);
}

/**
 * GET /api/v1/blocks/{height} — blocks at and below {height}, newest first.
 * Our backend honors ?limit= (up to 500) so backfill takes far fewer round
 * trips; a stock mempool instance ignores the param and returns ~15.
 */
export async function fetchBlocksFrom(height: number): Promise<RawBlock[]> {
  const data = await fetchJson(`${MEMPOOL_BASE_URL}/api/v1/blocks/${height}?limit=100`);
  if (!Array.isArray(data)) return [];
  return data.filter(isRawBlock);
}

/** GET /api/v1/block/{hash} — single block detail. */
export async function fetchBlockByHash(hash: string): Promise<RawBlock | null> {
  const data = await fetchJson(`${MEMPOOL_BASE_URL}/api/v1/block/${hash}`);
  return isRawBlock(data) ? data : null;
}

export { FETCH_DELAY_MS };
