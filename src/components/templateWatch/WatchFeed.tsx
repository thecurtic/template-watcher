import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Radio, TrendingUp } from 'lucide-react';
import type { WatchEvent } from '@/lib/templateWatch/types';
import {
  MANDATORY_SIGNALING_HEIGHT,
  WATCH_EVENT_TTL_MS,
  WATCH_FEED_MAX_EVENTS,
} from '@/lib/templateWatch/constants';
import { NostrPublishButton } from './NostrPublishButton';

/** Events fade during the last quarter of their on-screen lifetime. */
const FADE_START_MS = WATCH_EVENT_TTL_MS * 0.75;

function eventOpacity(ageMs: number): number {
  if (ageMs <= FADE_START_MS) return 1;
  const fadeProgress = (ageMs - FADE_START_MS) / (WATCH_EVENT_TTL_MS - FADE_START_MS);
  return Math.max(0.3, 1 - fadeProgress * 0.7);
}

function formatDate(ts: number): string {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function timeAgo(ms: number | null): string {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function EventIcon({ event }: { event: WatchEvent }) {
  if (event.type === 'first_clean_non_signaling') {
    return <AlertTriangle className="h-5 w-5 text-[var(--tw-warn)]" />;
  }
  if (event.type === 'share_jump') {
    return <TrendingUp className="h-5 w-5 text-[var(--tw-warn)]" />;
  }
  return <Radio className="h-5 w-5 text-[var(--tw-accent)]" />;
}

function EmptyState({
  lastChecked,
  totalBlocks,
  tip,
}: {
  lastChecked: number | null;
  totalBlocks: number;
  tip: number | null;
}) {
  const remaining = tip ? Math.max(0, MANDATORY_SIGNALING_HEIGHT - tip) : null;
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="motion-safe:tw-pulse mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-[var(--tw-border)] bg-[var(--tw-bg-elev2)]">
        <CheckCircle2 className="h-14 w-14 text-[var(--tw-ok)]" strokeWidth={1.5} />
      </div>
      <h3 className="text-2xl font-semibold tracking-tight text-[var(--tw-fg)] sm:text-3xl">
        No positioning detected
      </h3>
      <p className="tw-tnum mt-2 text-sm text-[var(--tw-muted)]">
        last checked {timeAgo(lastChecked)} · {totalBlocks.toLocaleString()} blocks analyzed
      </p>
      {remaining !== null && (
        <div className="tw-tnum mt-5 inline-flex items-center gap-2 rounded-full border border-[var(--tw-border)] bg-[var(--tw-bg-elev)] px-4 py-1.5 text-xs text-[var(--tw-muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--tw-accent)]" />
          {remaining.toLocaleString()} blocks until mandatory signaling ({MANDATORY_SIGNALING_HEIGHT.toLocaleString()})
        </div>
      )}
    </div>
  );
}

export function WatchFeed({
  events,
  lastChecked,
  totalBlocks,
  tip,
  loading,
}: {
  events: WatchEvent[];
  lastChecked: number | null;
  totalBlocks: number;
  tip: number | null;
  loading: boolean;
}) {
  // Re-render every minute so events age, fade, and expire live — the feed
  // only shows events from the last 24h (by block timestamp) instead of the
  // full history, which used to swamp the page.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const visible = events
    .filter((e) => now - e.timestamp * 1000 < WATCH_EVENT_TTL_MS)
    .slice(0, WATCH_FEED_MAX_EVENTS);
  const hidden = events.length - visible.length;

  return (
    <section aria-labelledby="watch-feed-heading" className="space-y-5">
      <div className="flex items-center justify-between">
        <h2
          id="watch-feed-heading"
          className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--tw-muted)]"
        >
          Watch Feed
        </h2>
        <span className="tw-tnum text-xs text-[var(--tw-muted)]">
          {totalBlocks.toLocaleString()} blocks · updated {timeAgo(lastChecked)}
        </span>
      </div>

      {visible.length === 0 ? (
        loading && totalBlocks === 0 ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl border border-[var(--tw-border)] bg-[var(--tw-bg-elev)]"
              />
            ))}
          </div>
        ) : (
          <EmptyState lastChecked={lastChecked} totalBlocks={totalBlocks} tip={tip} />
        )
      ) : (
        <ul className="space-y-3">
          {visible.map((event) => {
            const isWarn = event.severity === 'warning';
            return (
              <li
                key={event.id}
                style={{ opacity: eventOpacity(now - event.timestamp * 1000) }}
                className={[
                  'tw-fade-in flex flex-col gap-3 rounded-xl border p-4 transition-opacity duration-1000 sm:flex-row sm:items-center sm:justify-between',
                  isWarn
                    ? 'border-[var(--tw-warn)]/40 bg-[var(--tw-warn)]/5'
                    : 'border-[var(--tw-border)] bg-[var(--tw-bg-elev)]',
                ].join(' ')}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    <EventIcon event={event} />
                  </div>
                  <div>
                    <p className="text-base font-medium leading-snug text-[var(--tw-fg)]">
                      {event.message}
                    </p>
                    <p className="tw-tnum mt-0.5 text-xs text-[var(--tw-muted)]">
                      {event.height > 0 && <>height {event.height.toLocaleString()} · </>}
                      {formatDate(event.timestamp)}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pl-8 sm:pl-0">
                  <NostrPublishButton event={event} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {hidden > 0 && (
        <p className="tw-tnum text-xs text-[var(--tw-muted)]">
          {hidden.toLocaleString()} more event{hidden === 1 ? '' : 's'} hidden (feed
          shows the {WATCH_FEED_MAX_EVENTS} most recent from the last 24 hours)
        </p>
      )}
    </section>
  );
}
