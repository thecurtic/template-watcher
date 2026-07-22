import { WifiOff, Loader2, Info, AlertTriangle, RefreshCw } from 'lucide-react';

export function BackfillBar({ progress }: { progress: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--tw-border)] bg-[var(--tw-bg-elev)] px-4 py-2.5 text-xs text-[var(--tw-muted)]">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--tw-accent)]" />
      <span>Backfilling history…</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--tw-bg-elev2)]">
        <div
          className="h-full rounded-full bg-[var(--tw-accent)] transition-all duration-500"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <span className="tw-tnum">{Math.round(progress * 100)}%</span>
    </div>
  );
}

export function OfflineBanner({ height }: { height: number | null }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--tw-warn)]/40 bg-[var(--tw-warn)]/5 px-4 py-2.5 text-xs text-[var(--tw-warn)]">
      <WifiOff className="h-3.5 w-3.5" />
      <span>
        offline — showing cached data{height !== null ? ` through height ${height.toLocaleString()}` : ''}
      </span>
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--tw-warn)]/50 bg-[var(--tw-warn)]/5 px-4 py-3 text-xs text-[var(--tw-warn)] sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Couldn't reach the data source: {message}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 self-start rounded-md border border-[var(--tw-warn)]/50 px-2.5 py-1 font-medium text-[var(--tw-warn)] transition-colors hover:bg-[var(--tw-warn)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tw-warn)] sm:self-auto"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Retry
      </button>
    </div>
  );
}

export function SignalingOnlyBanner() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--tw-border)] bg-[var(--tw-bg-elev)] px-4 py-2.5 text-xs text-[var(--tw-muted)]">
      <Info className="h-3.5 w-3.5 text-[var(--tw-accent)]" />
      <span>violation data not exposed by API — showing signaling only</span>
    </div>
  );
}
