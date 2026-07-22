import type {
  RawBlock,
  AnalyzedBlock,
  PoolStats,
  WatchEvent,
  TrendPoint,
  DiscoveryResult,
} from './types';
import { EXCLUDED_POOLS } from './constants';

/**
 * signaling: (version & 0xE0000000) === 0x20000000 && (version & 0x10) !== 0
 * i.e. BIP9 version prefix (top 3 bits == 001) AND bit 4 set.
 * Uses unsigned 32-bit math.
 */
export function isSignaling(version: number): boolean {
  const v = version >>> 0;
  const prefixOk = (v >>> 29) === 1; // top 3 bits === 001
  const bit4 = (v & 0x10) !== 0;
  return prefixOk && bit4;
}

/** Normalize a pool name: trim; null/missing => "Unknown". Group case-insensitively. */
export function normalizePool(name: string | undefined | null): string {
  const trimmed = (name ?? '').trim();
  return trimmed.length ? trimmed : 'Unknown';
}

export function isExcludedPool(pool: string): boolean {
  return EXCLUDED_POOLS.some((p) => p.toUpperCase() === pool.toUpperCase());
}

const VIOLATION_KEY_HINTS = ['bip110', 'violation', 'violating', 'reduced'];

/**
 * Scan a block object (including inside `extras`) case-insensitively for a
 * numeric violation count field. Returns the discovered dotted field path and
 * the value, or null if nothing is found.
 */
export function discoverViolationField(
  block: RawBlock,
): { field: string; value: number } | null {
  const candidates: Array<{ path: string; value: unknown }> = [];

  const collect = (obj: Record<string, unknown>, prefix: string) => {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      candidates.push({ path, value: v });
    }
  };

  collect(block as unknown as Record<string, unknown>, '');
  if (block.extras && typeof block.extras === 'object') {
    collect(block.extras as Record<string, unknown>, 'extras');
  }

  // Prefer keys that mention violation/count over generic "reduced".
  const lc = (s: string) => s.toLowerCase();
  const scored = candidates
    .filter(({ path }) => VIOLATION_KEY_HINTS.some((h) => lc(path).includes(h)))
    .filter(({ path }) => lc(path).includes('count') || lc(path).includes('violation'))
    .filter(({ value }) => typeof value === 'number' || Array.isArray(value));

  // Sort so a name containing "violationcount" wins.
  scored.sort((a, b) => {
    const rank = (p: string) =>
      lc(p).includes('violationcount') ? 0 : lc(p).includes('count') ? 1 : 2;
    return rank(a.path) - rank(b.path);
  });

  const best = scored[0];
  if (!best) return null;
  const value = Array.isArray(best.value)
    ? best.value.length
    : (best.value as number);
  return { field: best.path, value };
}

/** Read a dotted field path (e.g. "extras.bip110ViolationCount") from a block. */
export function readViolationCount(
  block: RawBlock,
  field: string | null,
): number | null {
  if (!field) return null;
  const parts = field.split('.');
  let cur: unknown = block;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return null;
    }
  }
  if (Array.isArray(cur)) return cur.length;
  if (typeof cur === 'number') return cur;
  return null;
}

export function analyzeBlock(
  block: RawBlock,
  discovery: DiscoveryResult,
): AnalyzedBlock {
  const violationCount = discovery.signalingOnly
    ? null
    : readViolationCount(block, discovery.violationField);
  return {
    hash: block.id,
    height: block.height,
    version: block.version,
    timestamp: block.timestamp,
    txCount: block.tx_count,
    pool: normalizePool(block.extras?.pool?.name),
    signaling: isSignaling(block.version),
    violationCount,
    clean: violationCount === 0,
  };
}

/** Aggregate per-pool statistics, sorted by block count descending. */
export function computePoolStats(
  blocks: AnalyzedBlock[],
  signalingOnly: boolean,
): PoolStats[] {
  const map = new Map<string, PoolStats>();
  for (const b of blocks) {
    let s = map.get(b.pool);
    if (!s) {
      s = {
        pool: b.pool,
        blocks: 0,
        signalingCount: 0,
        cleanCount: 0,
        signalingClean: 0,
        signalingDirty: 0,
        nonSignalingClean: 0,
        nonSignalingDirty: 0,
        signalingShare: 0,
        cleanShare: 0,
      };
      map.set(b.pool, s);
    }
    s.blocks++;
    if (b.signaling) s.signalingCount++;
    if (!signalingOnly) {
      if (b.clean) s.cleanCount++;
      if (b.signaling && b.clean) s.signalingClean++;
      if (b.signaling && !b.clean) s.signalingDirty++;
      if (!b.signaling && b.clean) s.nonSignalingClean++;
      if (!b.signaling && !b.clean) s.nonSignalingDirty++;
    }
  }
  const stats = [...map.values()];
  for (const s of stats) {
    s.signalingShare = s.blocks ? s.signalingCount / s.blocks : 0;
    s.cleanShare = s.blocks ? s.cleanCount / s.blocks : 0;
  }
  stats.sort((a, b) => b.blocks - a.blocks);
  return stats;
}

/**
 * Collapse pools under `threshold` share of analyzed blocks into "Other".
 * Returns the visible pools (never collapsing "Other" itself).
 */
export function withOther(stats: PoolStats[], total: number, threshold = 0.01): PoolStats[] {
  const visible: PoolStats[] = [];
  let other: PoolStats | null = null;
  for (const s of stats) {
    if (total > 0 && s.blocks / total < threshold) {
      if (!other) {
        other = {
          pool: 'Other',
          blocks: 0,
          signalingCount: 0,
          cleanCount: 0,
          signalingClean: 0,
          signalingDirty: 0,
          nonSignalingClean: 0,
          nonSignalingDirty: 0,
          signalingShare: 0,
          cleanShare: 0,
        };
      }
      other.blocks += s.blocks;
      other.signalingCount += s.signalingCount;
      other.cleanCount += s.cleanCount;
      other.signalingClean += s.signalingClean;
      other.signalingDirty += s.signalingDirty;
      other.nonSignalingClean += s.nonSignalingClean;
      other.nonSignalingDirty += s.nonSignalingDirty;
    } else {
      visible.push(s);
    }
  }
  if (other) {
    other.signalingShare = other.blocks ? other.signalingCount / other.blocks : 0;
    other.cleanShare = other.blocks ? other.cleanCount / other.blocks : 0;
    visible.push(other);
  }
  return visible;
}

function dayKey(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/**
 * Derive the WATCH FEED events, chronologically (oldest first).
 * `blocks` may be in any order; we sort ascending by height internally.
 */
export function computeWatchEvents(
  blocks: AnalyzedBlock[],
  signalingOnly: boolean,
): WatchEvent[] {
  const sorted = [...blocks].sort((a, b) => a.height - b.height);
  const events: WatchEvent[] = [];

  const seenSignaling = new Set<string>();
  const seenCleanNonSignaling = new Set<string>();

  for (const b of sorted) {
    // First signaling block from a pool.
    if (b.signaling && !seenSignaling.has(b.pool)) {
      seenSignaling.add(b.pool);
      events.push({
        id: `sig-${b.pool}-${b.height}`,
        type: 'first_signaling',
        pool: b.pool,
        height: b.height,
        timestamp: b.timestamp,
        severity: 'info',
        message: `First signaling block from ${b.pool}`,
      });
    }

    // First clean non-signaling block (the tell). Requires violation data.
    if (
      !signalingOnly &&
      !b.signaling &&
      b.clean &&
      !isExcludedPool(b.pool) &&
      !seenCleanNonSignaling.has(b.pool)
    ) {
      seenCleanNonSignaling.add(b.pool);
      events.push({
        id: `clean-${b.pool}-${b.height}`,
        type: 'first_clean_non_signaling',
        pool: b.pool,
        height: b.height,
        timestamp: b.timestamp,
        severity: 'warning',
        message: `First clean non-signaling block from ${b.pool}`,
      });
    }
  }

  // Day-over-day clean-share jumps > 30 points on >=5 blocks/day.
  if (!signalingOnly) {
    const byPoolDay = new Map<string, Map<string, { clean: number; total: number }>>();
    for (const b of sorted) {
      if (isExcludedPool(b.pool)) continue;
      const dk = dayKey(b.timestamp);
      let days = byPoolDay.get(b.pool);
      if (!days) {
        days = new Map();
        byPoolDay.set(b.pool, days);
      }
      let cell = days.get(dk);
      if (!cell) {
        cell = { clean: 0, total: 0 };
        days.set(dk, cell);
      }
      cell.total++;
      if (b.clean) cell.clean++;
    }

    for (const [pool, days] of byPoolDay) {
      const keys = [...days.keys()].sort();
      for (let i = 1; i < keys.length; i++) {
        const prev = days.get(keys[i - 1])!;
        const cur = days.get(keys[i])!;
        if (cur.total >= 5 && prev.total >= 5) {
          const from = (prev.clean / prev.total) * 100;
          const to = (cur.clean / cur.total) * 100;
          if (to - from > 30) {
            events.push({
              id: `jump-${pool}-${keys[i]}`,
              type: 'share_jump',
              pool,
              height: 0,
              timestamp: new Date(keys[i]).getTime() / 1000,
              severity: 'warning',
              message: `${pool} clean-template share jumped ${Math.round(from)}→${Math.round(to)}% day-over-day`,
              detail: { from: Math.round(from), to: Math.round(to) },
            });
          }
        }
      }
    }
  }

  // Newest first for display.
  events.sort((a, b) => b.timestamp - a.timestamp);
  return events;
}

/**
 * Build daily trend points. For each day, compute clean share and signaling
 * share (0..100) per visible pool. Pools below `threshold` share aggregate
 * into "Other".
 */
export function computeTrend(
  blocks: AnalyzedBlock[],
  visiblePools: string[],
  signalingOnly: boolean,
): TrendPoint[] {
  const dayMap = new Map<
    string,
    Map<string, { clean: number; signaling: number; total: number }>
  >();

  const poolSet = new Set(visiblePools.filter((p) => p !== 'Other'));

  for (const b of blocks) {
    const dk = dayKey(b.timestamp);
    let pools = dayMap.get(dk);
    if (!pools) {
      pools = new Map();
      dayMap.set(dk, pools);
    }
    const key = poolSet.has(b.pool) ? b.pool : 'Other';
    let cell = pools.get(key);
    if (!cell) {
      cell = { clean: 0, signaling: 0, total: 0 };
      pools.set(key, cell);
    }
    cell.total++;
    if (b.signaling) cell.signaling++;
    if (!signalingOnly && b.clean) cell.clean++;
  }

  const points: TrendPoint[] = [];
  const dates = [...dayMap.keys()].sort();
  for (const date of dates) {
    const pools = dayMap.get(date)!;
    const point: TrendPoint = { date, ts: new Date(date).getTime() };
    for (const [pool, cell] of pools) {
      point[`clean:${pool}`] = cell.total ? (cell.clean / cell.total) * 100 : 0;
      point[`sig:${pool}`] = cell.total ? (cell.signaling / cell.total) * 100 : 0;
    }
    points.push(point);
  }
  return points;
}
