import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import type { AnalyzedBlock, PoolStats } from '@/lib/templateWatch/types';
import { computeTrend, withOther } from '@/lib/templateWatch/analysis';
import { MANDATORY_SIGNALING_DATE } from '@/lib/templateWatch/constants';

// A palette derived around the amber accent, distinct but muted.
const PALETTE = [
  'hsl(38 96% 56%)',
  'hsl(190 70% 55%)',
  'hsl(150 55% 52%)',
  'hsl(280 60% 65%)',
  'hsl(0 70% 62%)',
  'hsl(220 70% 62%)',
  'hsl(320 60% 62%)',
  'hsl(60 70% 55%)',
];

type Metric = 'clean' | 'sig';

type Horizon = '7d' | '30d' | '90d' | 'all';

const HORIZONS: Array<{ key: Horizon; label: string; days: number | null }> = [
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
  { key: 'all', label: 'All', days: null },
];

const DAY_MS = 86_400_000;

export function TrendChart({
  blocks,
  pools,
  total,
  signalingOnly,
}: {
  blocks: AnalyzedBlock[];
  pools: PoolStats[];
  total: number;
  signalingOnly: boolean;
}) {
  const [metric, setMetric] = useState<Metric>(signalingOnly ? 'sig' : 'clean');
  // Default to the last 30 days: the run-up to mandatory signaling is the
  // period that matters, and the x-axis extends to the activation date below.
  const [horizon, setHorizon] = useState<Horizon>('30d');

  const visiblePools = useMemo(
    () => withOther(pools, total, 0.01).map((p) => p.pool),
    [pools, total],
  );

  const data = useMemo(() => {
    const all = computeTrend(blocks, visiblePools, signalingOnly);
    const days = HORIZONS.find((h) => h.key === horizon)?.days ?? null;
    if (days === null || all.length === 0) return all;
    // Window is anchored to the newest data point (not the wall clock), so a
    // stale cache still shows a full window.
    const cutoff = all[all.length - 1].ts - (days - 1) * DAY_MS;
    return all.filter((p) => p.ts >= cutoff);
  }, [blocks, visiblePools, signalingOnly, horizon]);

  const markerTs = MANDATORY_SIGNALING_DATE.getTime();

  const activeMetric: Metric = signalingOnly ? 'sig' : metric;

  return (
    <section aria-labelledby="trend-heading" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="trend-heading"
          className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--tw-muted)]"
        >
          Trend
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[var(--tw-border)] bg-[var(--tw-bg-elev)] p-0.5 text-xs">
            {HORIZONS.map((h) => (
              <button
                key={h.key}
                type="button"
                onClick={() => setHorizon(h.key)}
                aria-pressed={horizon === h.key}
                className={[
                  'rounded-md px-3 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tw-accent)]',
                  horizon === h.key
                    ? 'bg-[var(--tw-accent)] text-black'
                    : 'text-[var(--tw-muted)] hover:text-[var(--tw-fg)]',
                ].join(' ')}
              >
                {h.label}
              </button>
            ))}
          </div>
          {!signalingOnly && (
            <div className="inline-flex rounded-lg border border-[var(--tw-border)] bg-[var(--tw-bg-elev)] p-0.5 text-xs">
              {(['clean', 'sig'] as Metric[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetric(m)}
                  className={[
                    'rounded-md px-3 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tw-accent)]',
                    activeMetric === m
                      ? 'bg-[var(--tw-accent)] text-black'
                      : 'text-[var(--tw-muted)] hover:text-[var(--tw-fg)]',
                  ].join(' ')}
                >
                  {m === 'clean' ? 'BIP-110 compliant share' : 'Signaling share'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--tw-border)] bg-[var(--tw-bg-elev)] p-4">
        {data.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-[var(--tw-muted)]">
            Not enough data to plot a trend yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: -8 }}>
              <CartesianGrid stroke="hsl(220 14% 18%)" vertical={false} />
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                // Extend the right edge to the mandatory-signaling date so the
                // remaining runway to activation is always in frame; once the
                // date has passed, this naturally falls back to the data max.
                domain={['dataMin', (dataMax: number) => Math.max(dataMax, markerTs + DAY_MS / 2)]}
                tickFormatter={(ts) =>
                  new Date(ts).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })
                }
                stroke="hsl(215 15% 55%)"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: 'hsl(220 14% 18%)' }}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                stroke="hsl(215 15% 55%)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(220 18% 9%)',
                  border: '1px solid hsl(220 14% 18%)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'hsl(215 15% 55%)' }}
                labelFormatter={(ts) => new Date(ts as number).toLocaleDateString()}
                formatter={(value, name) => [
                  `${Number(value).toFixed(1)}%`,
                  name,
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: 'hsl(215 15% 55%)' }}
              />
              {markerTs >= data[0].ts && (
                <ReferenceLine
                  x={markerTs}
                  stroke="hsl(38 96% 56%)"
                  strokeDasharray="6 4"
                  label={{
                    value: 'mandatory signaling · 961,632',
                    position: 'insideTopRight',
                    fill: 'hsl(38 96% 56%)',
                    fontSize: 10,
                  }}
                />
              )}
              {visiblePools.map((pool, i) => (
                <Line
                  key={pool}
                  type="monotone"
                  dataKey={`${activeMetric}:${pool}`}
                  name={pool}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
        <p className="mt-3 text-xs text-[var(--tw-muted)]">
          {activeMetric === 'clean' ? 'BIP-110-compliant template' : 'Signaling'} share per day for
          pools ≥1% of analyzed blocks (others aggregated). Dashed marker estimates the
          mandatory signaling height by date.
        </p>
      </div>
    </section>
  );
}
