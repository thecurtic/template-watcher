import type { PoolStats } from '@/lib/templateWatch/types';
import { withOther, isExcludedPool } from '@/lib/templateWatch/analysis';

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
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
  const rows = withOther(pools, total, 0.01);

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
              <th scope="col" className="px-4 py-3 font-semibold">Pool</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Blocks</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Signaling %</th>
              {!signalingOnly && (
                <th scope="col" className="px-4 py-3 text-right font-semibold">Clean %</th>
              )}
              {!signalingOnly && (
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Clean, not signaling
                </th>
              )}
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
          <span className="text-[var(--tw-warn)]">Clean, not signaling</span> is the
          tell — a pool producing BIP-110-compliant templates without signaling for the fork.
          Pools under 1% of analyzed blocks are collapsed into "Other".
        </p>
      )}
    </section>
  );
}
