import { useCallback, useEffect, useRef, useState } from 'react';
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
  lastChecked: number | null;
  refresh: () => void;
}

const DEFAULT_DISCOVERY: DiscoveryResult = {
  violationField: null,
  source: 'none',
  signalingOnly: true,
};

export function useTemplateWatch(): TemplateWatchState {
  const [rawByHeight, setRawByHeight] = useState<Map<number, RawBlock>>(new Map());
  const [discovery, setDiscovery] = useState<DiscoveryResult>(DEFAULT_DISCOVERY);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState(0);
  const [offline, setOffline] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const discoveryRef = useRef<DiscoveryResult>(DEFAULT_DISCOVERY);
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
      // eslint-disable-next-line no-console
      console.info(`[TemplateWatch] violation field discovered: "${found.field}"`);
    } else {
      result = { violationField: null, source: 'none', signalingOnly: true };
      // eslint-disable-next-line no-console
      console.warn('[TemplateWatch] no violation field found — signaling-only mode');
    }
    discoveryRef.current = result;
    setDiscovery(result);
    return result;
  }, []);

  useEffect(() => {
    cancelledRef.current = false;

    // 1. Load cache immediately.
    const cached = readAllCachedBlocks();
    if (cached.length) {
      const map = new Map<number, RawBlock>();
      for (const b of cached) map.set(b.height, b);
      setRawByHeight(map);
      runDiscovery(cached[cached.length - 1]);
    }

    const run = async () => {
      setLoading(true);
      let latest: RawBlock[] = [];
      try {
        latest = await fetchLatestBlocks();
        setOffline(false);
        setLoadError(null);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[TemplateWatch] failed to fetch latest blocks', err);
        setOffline(cached.length > 0);
        setLoadError(err instanceof Error ? err.message : 'Failed to reach the data source');
        setLoading(false);
        if (!cached.length) return;
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

      const have = new Set<number>(readAllCachedBlocks().map((b) => b.height));
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

  // Derive analyzed data.
  const raws = [...rawByHeight.values()];
  const analyzed: AnalyzedBlock[] = raws.map((b) => analyzeBlock(b, discovery));
  const pools = computePoolStats(analyzed, discovery.signalingOnly);
  const events = computeWatchEvents(analyzed, discovery.signalingOnly);

  const heights = analyzed.map((b) => b.height);
  const minHeight = heights.length ? Math.min(...heights) : null;
  const maxHeight = heights.length ? Math.max(...heights) : null;

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
    lastChecked,
    refresh,
  };
}
