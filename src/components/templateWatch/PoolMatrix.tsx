import { useMemo, useState } from 'react';
import type { PoolStats } from '@/lib/templateWatch/types';
import { withOther, isExcludedPool } from '@/lib/templateWatch/analysis';

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

type SortKey = 'pool' | 'blocks' | 'signalingShare' | 'cleanShare' | 'nonSignalingClean';
type SortDir = 'asc' | 'desc';

const COLUMNS: Array<{ key: SortKey; label: string; numeric: boolean }> = [
  { key: 'pool', label: 'Pool', numeric: false },
  { key: 'blocks', label: 'Blocks', numeric: true },
  { key: 'signalingShare', label: 'Signaling %', numeric: true },
  { key: 'cleanShare', label: 'BIP-110 compliant %', numeric: true },
  { key: 'nonSignalingClean', label: 'Compliant, not signaling', numeric: true },
];

function compareRows(a: PoolStats, b: PoolStats, key: SortKey, dir: SortDir): number {
  let cmp: number;
  if (key === 'pool') {
    cmp = a.pool.toLowerCase().localeCompare(b.pool.toLowerCase());
  } else {
    cmp = a[key] - b[key];
  }
  return dir === 'asc' ? cmp : -cmp;
}

function HeaderButton({
  column,
  active,
  dir,
  onClick,
}: {
  column: (typeof COLUMNS)[number];
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  const indicator = active ? (dir === 'asc' ? '▲' : '▼') : '↕';
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex w-full items-center gap-1.5 font-semibold uppercase tracking-wider transition-colors hover:text-[var(--tw-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tw-accent)]',
        column.numeric ? 'flex-row-reverse text-right' : 'text-left',
        active ? 'text-[var(--tw-fg)]' : '',
      ].join(' ')}
    >
      <span>{column.label}</span>
      <span aria-hidden="true" className={active ? 'text-[var(--tw-accent)]' : 'opacity-50'}>
        {indicator}
      </span>
    </button>
  );
}

export function PoolMatrix({
  pools,
  total,
  signalingOnly,
}: {
  pools: PoolStats[];
  total: number;
  signalingOnly: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('blocks');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'pool' ? 'asc' : 'desc');
    }
  };

  const rows = useMemo(() => {
    const all = withOther(pools, total, 0.01);
    // "Other" stays pinned to the bottom regardless of sort.
    const other = all.filter((p) => p.pool === 'Other');
    const ranked = all
      .filter((p) => p.pool !== 'Other')
      .sort((a, b) => compareRows(a, b, sortKey, sortDir));
    return [...ranked, ...other];
  }, [pools, total, sortKey, sortDir]);

  const columns = signalingOnly ? COLUMNS.slice(0, 3) : COLUMNS;

  return (
    <section aria-labelledby="pool-matrix-heading" className="space-y-5">
      <h2
        id="pool-matrix-heading"
        className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--tw-muted)]"
      >
        Pool Matrix
      </h2>

      <div className="overflow-x-auto rounded-xl border border-[var(--tw-border)]">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--tw-border)] bg-[var(--tw-bg-elev)] text-[11px] uppercase tracking-wider text-[var(--tw-muted)]">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    sortKey === column.key
                      ? sortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  className={['px-4 py-3', column.numeric ? 'text-right' : ''].join(' ')}
                >
                  <HeaderButton
                    column={column}
                    active={sortKey === column.key}
                    dir={sortDir}
                    onClick={() => handleSort(column.key)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={signalingOnly ? 3 : 5}
                  className="px-4 py-10 text-center text-sm text-[var(--tw-muted)]"
                >
                  No blocks analyzed yet.
                </td>
              </tr>
            ) : (
              rows.map((p) => {
                const excluded = isExcludedPool(p.pool);
                const tell = !signalingOnly && p.nonSignalingClean > 0 && !excluded;
                return (
                  <tr
                    key={p.pool}
                    className="border-b border-[var(--tw-border)]/60 last:border-0 hover:bg-[var(--tw-bg-elev)]/60"
                  >
                    <th
                      scope="row"
                      className="px-4 py-3 text-sm font-medium text-[var(--tw-fg)]"
                    >
                      <span className="flex items-center gap-2">
                        {p.pool}
                        {excluded && (
                          <span className="rounded border border-[var(--tw-border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--tw-muted)]">
                            policy-filtered
                          </span>
                        )}
                      </span>
                    </th>
                    <td className="tw-tnum px-4 py-3 text-right text-sm text-[var(--tw-fg)]">
                      {p.blocks.toLocaleString()}
                    </td>
                    <td className="tw-tnum px-4 py-3 text-right text-sm text-[var(--tw-fg)]">
                      {pct(p.signalingShare)}
                    </td>
                    {!signalingOnly && (
                      <td className="tw-tnum px-4 py-3 text-right text-sm text-[var(--tw-fg)]">
                        {pct(p.cleanShare)}
                      </td>
                    )}
                    {!signalingOnly && (
                      <td className="px-4 py-3 text-right">
                        <span
                          className={[
                            'tw-tnum inline-flex min-w-8 justify-center rounded-md px-2 py-0.5 text-sm font-semibold',
                            tell
                              ? 'bg-[var(--tw-warn)]/15 text-[var(--tw-warn)]'
                              : 'text-[var(--tw-muted)]',
                          ].join(' ')}
                        >
                          {p.nonSignalingClean.toLocaleString()}
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {!signalingOnly && (
        <p className="text-xs text-[var(--tw-muted)]">
          <span className="text-[var(--tw-warn)]">Compliant, not signaling</span> is the
          tell — a pool producing BIP-110-compliant templates without signaling for the fork.
          Pools under 1% of analyzed blocks are collapsed into "Other".
        </p>
      )}
    </section>
  );
}
