// Type definitions for Template Watch — a BIP-110 consensus observability tool.

/** Raw block object as returned by the mempool.kilombino.com REST API. */
export interface RawBlock {
  id: string;
  height: number;
  version: number;
  timestamp: number;
  tx_count: number;
  extras?: Record<string, unknown> & {
    pool?: { id?: number; name?: string; slug?: string };
  };
}

/** A block after normalization + BIP-110 analysis. */
export interface AnalyzedBlock {
  hash: string;
  height: number;
  version: number;
  timestamp: number;
  txCount: number;
  pool: string;
  signaling: boolean;
  /** null when violation data is not exposed by the API. */
  violationCount: number | null;
  /** true when violationCount === 0. Meaningless in signaling-only mode. */
  clean: boolean;
}

/** The four quadrant categories that matter per pool. */
export interface PoolStats {
  pool: string;
  blocks: number;
  signalingCount: number;
  cleanCount: number;
  signalingClean: number;
  signalingDirty: number;
  nonSignalingClean: number;
  nonSignalingDirty: number;
  signalingShare: number; // 0..1
  cleanShare: number; // 0..1
}

export type WatchEventType =
  | 'first_signaling'
  | 'first_clean_non_signaling'
  | 'share_jump';

/** An event surfaced in the WATCH FEED. */
export interface WatchEvent {
  id: string;
  type: WatchEventType;
  pool: string;
  height: number;
  timestamp: number; // block timestamp (seconds)
  severity: 'info' | 'warning';
  message: string;
  /** extra detail for share jumps */
  detail?: { from: number; to: number };
}

/** One day's aggregated data point for the trend chart. */
export interface TrendPoint {
  date: string; // YYYY-MM-DD
  ts: number; // ms of that day (for x-axis positioning)
  /** per-pool clean share (0..100) keyed by pool name, plus "__signaling" prefix variants */
  [key: string]: number | string;
}

/** How the violation field was discovered. */
export interface DiscoveryResult {
  violationField: string | null;
  source: 'list' | 'block' | 'none';
  signalingOnly: boolean;
}
