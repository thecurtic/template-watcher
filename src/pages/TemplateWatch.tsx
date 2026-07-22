import { useSeoMeta } from '@unhead/react';
import { Activity } from 'lucide-react';
import { LoginArea } from '@/components/auth/LoginArea';
import { useTemplateWatch } from '@/hooks/useTemplateWatch';
import { WatchFeed } from '@/components/templateWatch/WatchFeed';
import { PoolMatrix } from '@/components/templateWatch/PoolMatrix';
import { TrendChart } from '@/components/templateWatch/TrendChart';
import {
  BackfillBar,
  OfflineBanner,
  SignalingOnlyBanner,
} from '@/components/templateWatch/StatusBar';

export default function TemplateWatch() {
  useSeoMeta({
    title: 'Template Watch — BIP-110 Consensus Observability',
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
    lastChecked,
  } = useTemplateWatch();

  const signalingOnly = discovery.signalingOnly;

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
                Template&nbsp;Watch
              </h1>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--tw-muted)]">
              A neutral measurement of the BIP-110 soft fork debate: which mining pools
              produce compliant ("clean") block templates{' '}
              <span className="text-[var(--tw-fg)]">without signaling</span> for the fork —
              the leading indicator of a quiet position change.
            </p>
          </div>
          <div className="shrink-0">
            <LoginArea className="max-w-60" />
          </div>
        </header>

        {/* Status banners */}
        <div className="mb-8 space-y-2">
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
            Data:{' '}
            <a
              href="https://mempool.kilombino.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--tw-accent)] hover:underline"
            >
              mempool.kilombino.com
            </a>{' '}
            (community BIP-110 explorer) · independent project, affiliated with no side ·
            built at bitcoin++ Toronto 2026
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
