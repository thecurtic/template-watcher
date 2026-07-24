import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  RawBlock,
  AnalyzedBlock,
  PoolStats,
  WatchEvent,
  DiscoveryResult,
} from '@/lib/templateWatch/types';
import {
  fetchLatestBlocks,
  fetchBlocksFrom,
  readAllCachedBlocks,
  writeCachedBlock,
  readCacheMeta,
  writeCacheMeta,
  getLastFetchMode,
  sleep,
  FETCH_DELAY_MS,
} from '@/lib/templateWatch/api';
import {
  analyzeBlock,
  computePoolStats,
  computeWatchEvents,
  discoverViolationField,
} from '@/lib/templateWatch/analysis';
import {
  BACKFILL_TARGET_HEIGHT,
  BACKFILL_ENABLED,
  AUTO_REFRESH_MS,
} from '@/lib/templateWatch/constants';

export interface TemplateWatchState {
  blocks: AnalyzedBlock[];
  pools: PoolStats[];
  events: WatchEvent[];
  discovery: DiscoveryResult;
  tip: number | null;
  minHeight: number | null;
  maxHeight: number | null;
  totalBlocks: number;
  loading: boolean;
  backfilling: boolean;
  backfillProgress: number; // 0..1
  offline: boolean;
  loadError: string | null;
  fetchMode: string;
  lastChecked: number | null;
  refresh: () => void;
}

const DEFAULT_DISCOVERY: DiscoveryResult = {
  violationField: null,
  source: 'none',
  signalingOnly: true,
};

export function useTemplateWatch(): TemplateWatchState {
  // Seed state from the localStorage cache in lazy initializers (rather than an
  // effect) so the first render already shows cached data without a re-render.
  const [rawByHeight, setRawByHeight] = useState<Map<number, RawBlock>>(() => {
    const map = new Map<number, RawBlock>();
    for (const b of readAllCachedBlocks()) map.set(b.height, b);
    return map;
  });
  const [discovery, setDiscovery] = useState<DiscoveryResult>(() => {
    const cached = [...rawByHeight.values()];
    if (!cached.length) return DEFAULT_DISCOVERY;
    const found = discoverViolationField(cached[cached.length - 1]);
    return found
      ? { violationField: found.field, source: 'list', signalingOnly: false }
      : DEFAULT_DISCOVERY;
  });
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState(0);
  const [offline, setOffline] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetchMode, setFetchMode] = useState<string>('idle');
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const discoveryRef = useRef<DiscoveryResult>(discovery);
  const cancelledRef = useRef(false);

  const ingest = useCallback((blocks: RawBlock[]) => {
    if (!blocks.length) return;
    for (const b of blocks) writeCachedBlock(b);
    setRawByHeight((prev) => {
      const next = new Map(prev);
      for (const b of blocks) next.set(b.height, b);
      return next;
    });
  }, []);

  // Run discovery on the first available block.
  const runDiscovery = useCallback((block: RawBlock): DiscoveryResult => {
    const found = discoverViolationField(block);
    let result: DiscoveryResult;
    if (found) {
      result = { violationField: found.field, source: 'list', signalingOnly: false };
      console.info(`[TemplateWatch] violation field discovered: "${found.field}"`);
    } else {
      result = { violationField: null, source: 'none', signalingOnly: true };
      console.warn('[TemplateWatch] no violation field found — signaling-only mode');
    }
    discoveryRef.current = result;
    setDiscovery(result);
    return result;
  }, []);

  useEffect(() => {
    cancelledRef.current = false;

    // Blocks already in memory (seeded from cache on mount, grown since).
    const hadBlocks = rawByHeight.size > 0;

    const run = async () => {
      setLoading(true);
      let latest: RawBlock[] = [];
      try {
        latest = await fetchLatestBlocks();
        setOffline(false);
        setLoadError(null);
        setFetchMode(getLastFetchMode());
      } catch (err) {
        console.error('[TemplateWatch] failed to fetch latest blocks', err);
        setOffline(hadBlocks);
        setLoadError(err instanceof Error ? err.message : 'Failed to reach the data source');
        setFetchMode(getLastFetchMode());
        setLoading(false);
        if (!hadBlocks) return;
      }

      if (latest.length) {
        if (discoveryRef.current.source === 'none') runDiscovery(latest[0]);
        ingest(latest);
        const tip = Math.max(...latest.map((b) => b.height));
        writeCacheMeta({ tip, updatedAt: Date.now() });
      }
      setLastChecked(Date.now());
      setLoading(false);

      // 2. Backfill missing history down to target height.
      //    Disabled in dev by default (see BACKFILL_ENABLED). When off, we keep
      //    whatever is already cached and mark progress complete.
      if (cancelledRef.current) return;
      if (!BACKFILL_ENABLED) {
        setBackfillProgress(1);
        setBackfilling(false);
        return;
      }
      setBackfilling(true);

      const have = new Set<number>(rawByHeight.keys());
      for (const b of latest) have.add(b.height);
      const tip = latest.length
        ? Math.max(...latest.map((b) => b.height))
        : readCacheMeta().tip ?? Math.max(...[...have], BACKFILL_TARGET_HEIGHT);

      const span = Math.max(1, tip - BACKFILL_TARGET_HEIGHT);
      let cursor = tip;

      while (cursor > BACKFILL_TARGET_HEIGHT && !cancelledRef.current) {
        // Find the lowest contiguous height we still need.
        let target = cursor;
        while (target > BACKFILL_TARGET_HEIGHT && have.has(target)) target--;
        if (target <= BACKFILL_TARGET_HEIGHT && have.has(target)) break;

        try {
          const batch = await fetchBlocksFrom(target);
          setOffline(false);
          if (batch.length) {
            ingest(batch);
            for (const b of batch) have.add(b.height);
            cursor = Math.min(...batch.map((b) => b.height)) - 1;
          } else {
            cursor = target - 1;
          }
        } catch {
          // retry already happened inside fetch; skip this batch and continue.
          cursor = target - 15;
        }

        setBackfillProgress(
          Math.min(1, Math.max(0, (tip - cursor) / span)),
        );
        await sleep(FETCH_DELAY_MS);
      }

      setBackfillProgress(1);
      setBackfilling(false);
    };

    run();

    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Auto-refresh: poll for new blocks while the tab is visible, and catch up
  // immediately when the user returns to the tab. Skipped mid-backfill so the
  // historical fetch loop is never cancelled and restarted by a poll.
  const backfillingRef = useRef(false);
  useEffect(() => {
    backfillingRef.current = backfilling;
  }, [backfilling]);
  const lastRunRef = useRef(0);
  useEffect(() => {
    lastRunRef.current = Date.now();
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      if (backfillingRef.current) return;
      if (Date.now() - lastRunRef.current < AUTO_REFRESH_MS / 2) return;
      lastRunRef.current = Date.now();
      setRefreshKey((k) => k + 1);
    };
    const id = setInterval(tick, AUTO_REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  // Derive analyzed data. Memoized — the full analysis pass over every block
  // would otherwise rerun on each of the ~950 renders backfill triggers.
  const { analyzed, pools, events, minHeight, maxHeight } = useMemo(() => {
    const raws = [...rawByHeight.values()];
    const analyzed: AnalyzedBlock[] = raws.map((b) => analyzeBlock(b, discovery));
    const pools = computePoolStats(analyzed, discovery.signalingOnly);
    const events = computeWatchEvents(analyzed, discovery.signalingOnly);

    let minHeight: number | null = null;
    let maxHeight: number | null = null;
    for (const b of analyzed) {
      if (minHeight === null || b.height < minHeight) minHeight = b.height;
      if (maxHeight === null || b.height > maxHeight) maxHeight = b.height;
    }
    return { analyzed, pools, events, minHeight, maxHeight };
  }, [rawByHeight, discovery]);

  return {
    blocks: analyzed,
    pools,
    events,
    discovery,
    tip: maxHeight,
    minHeight,
    maxHeight,
    totalBlocks: analyzed.length,
    loading,
    backfilling,
    backfillProgress,
    offline,
    loadError,
    fetchMode,
    lastChecked,
    refresh,
  };
}
