import { useSeoMeta } from '@unhead/react';
import { useSearchParams } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { LoginArea } from '@/components/auth/LoginArea';
import { useTemplateWatch } from '@/hooks/useTemplateWatch';
import { BUILD_STAMP } from '@/lib/templateWatch/constants';
import { WatchFeed } from '@/components/templateWatch/WatchFeed';
import { PoolMatrix } from '@/components/templateWatch/PoolMatrix';
import { TrendChart } from '@/components/templateWatch/TrendChart';
import {
  BackfillBar,
  OfflineBanner,
  SignalingOnlyBanner,
  ErrorBanner,
} from '@/components/templateWatch/StatusBar';

export default function TemplateWatch() {
  useSeoMeta({
    title: 'Template Watcher — BIP-110 Consensus Observability',
    description:
      'Which mining pools produce BIP-110-compliant block templates without signaling for the fork? A neutral measurement dashboard.',
  });

  const {
    blocks,
    pools,
    events,
    discovery,
    minHeight,
    maxHeight,
    tip,
    totalBlocks,
    loading,
    backfilling,
    backfillProgress,
    offline,
    loadError,
    fetchMode,
    lastChecked,
    refresh,
  } = useTemplateWatch();

  const signalingOnly = discovery.signalingOnly;

  const [searchParams] = useSearchParams();
  const showDiagnostics = searchParams.has('debug');

  return (
    <div className="tw-console min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--tw-border)] bg-[var(--tw-bg-elev2)]">
                <Activity className="h-5 w-5 text-[var(--tw-accent)]" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--tw-fg)] sm:text-3xl">
                Template&nbsp;Watcher
              </h1>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--tw-muted)]">
              A neutral measurement of the BIP-110 soft fork debate: which mining pools
              produce BIP-110-compliant block templates{' '}
              <span className="text-[var(--tw-fg)]">without signaling</span> for the fork —
              the leading indicator of a quiet position change.
            </p>
          </div>
          <div className="shrink-0">
            <LoginArea className="max-w-60" />
          </div>
        </header>

        {/* Diagnostics, readable without DevTools (e.g. on iPad) — add ?debug to the URL */}
        {showDiagnostics && (
          <div className="tw-tnum mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--tw-border)] bg-[var(--tw-bg-elev)] px-3 py-2 text-[11px] text-[var(--tw-muted)]">
            <span>build:{BUILD_STAMP}</span>
            <span>·</span>
            <span>{loading ? 'loading…' : 'idle'}</span>
            <span>·</span>
            <span>fetch:{fetchMode}</span>
            <span>·</span>
            <span>blocks:{totalBlocks.toLocaleString()}</span>
            <span>·</span>
            <span>{loadError ? `error: ${loadError}` : 'no errors'}</span>
            <button
              type="button"
              onClick={refresh}
              className="ml-auto rounded border border-[var(--tw-border)] px-2 py-0.5 font-medium hover:border-[var(--tw-accent-dim)] hover:text-[var(--tw-accent)]"
            >
              reload data
            </button>
          </div>
        )}

        {/* Status banners */}
        <div className="mb-8 space-y-2">
          {loadError && totalBlocks === 0 && (
            <ErrorBanner message={loadError} onRetry={refresh} />
          )}
          {offline && <OfflineBanner height={maxHeight} />}
          {signalingOnly && <SignalingOnlyBanner />}
          {backfilling && <BackfillBar progress={backfillProgress} />}
        </div>

        {/* Sections */}
        <div className="space-y-12">
          <WatchFeed
            events={events}
            lastChecked={lastChecked}
            totalBlocks={totalBlocks}
            tip={tip}
            loading={loading}
          />

          <PoolMatrix pools={pools} total={totalBlocks} signalingOnly={signalingOnly} />

          <TrendChart
            blocks={blocks}
            pools={pools}
            total={totalBlocks}
            signalingOnly={signalingOnly}
          />
        </div>

        {/* Footer */}
        <footer className="mt-16 border-t border-[var(--tw-border)] pt-6 text-xs leading-relaxed text-[var(--tw-muted)]">
          <p>
            Data: self-hosted index from our own Bitcoin Knots node · BIP-110
            detection method from{' '}
            <a
              href="https://github.com/Kilombino/mempool-bip110"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--tw-accent)] hover:underline"
            >
              Kilombino&apos;s mempool fork
            </a>{' '}
            · independent project, affiliated with no side · built at bitcoin++
            Toronto 2026
          </p>
          {minHeight !== null && maxHeight !== null && (
            <p className="tw-tnum mt-1">
              analyzing blocks {minHeight.toLocaleString()}–{maxHeight.toLocaleString()}
            </p>
          )}
          <p className="mt-3">
            <a
              href="https://shakespeare.diy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--tw-muted)] hover:text-[var(--tw-accent)] hover:underline"
            >
              Vibed with Shakespeare
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
