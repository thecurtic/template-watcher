import { useState } from 'react';
import { Send, Copy, Check } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import type { WatchEvent } from '@/lib/templateWatch/types';

function noteText(event: WatchEvent): string {
  const url = typeof window !== 'undefined' ? window.location.origin : '';
  if (event.type === 'first_clean_non_signaling') {
    return `TEMPLATE WATCH: first clean non-signaling block from ${event.pool} at height ${event.height}. ${url}`;
  }
  if (event.type === 'first_signaling') {
    return `TEMPLATE WATCH: first signaling block from ${event.pool} at height ${event.height}. ${url}`;
  }
  return `TEMPLATE WATCH: ${event.message}. ${url}`;
}

export function NostrPublishButton({ event }: { event: WatchEvent }) {
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent, isPending } = useNostrPublish();
  const { toast } = useToast();
  const [done, setDone] = useState(false);

  const text = noteText(event);

  const handleClick = async () => {
    if (user) {
      try {
        await createEvent({ kind: 1, content: text });
        setDone(true);
        toast({ title: 'Published to Nostr', description: 'Your note is live on the relays.' });
        setTimeout(() => setDone(false), 2500);
      } catch {
        toast({
          title: 'Publish failed',
          description: 'Could not reach relays. Try again.',
          variant: 'destructive',
        });
      }
    } else {
      // Fallback: copy the note text.
      try {
        await navigator.clipboard.writeText(text);
        setDone(true);
        toast({ title: 'Copied note text', description: 'Log in with Nostr to publish directly.' });
        setTimeout(() => setDone(false), 2500);
      } catch {
        toast({ title: 'Copy failed', variant: 'destructive' });
      }
    }
  };

  const Icon = done ? Check : user ? Send : Copy;
  const label = done
    ? user
      ? 'Published'
      : 'Copied'
    : user
      ? 'Publish to Nostr'
      : 'Copy note';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label={label}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--tw-border)] bg-[var(--tw-bg-elev2)] px-2.5 py-1.5 text-xs font-medium text-[var(--tw-muted)] transition-colors hover:border-[var(--tw-accent-dim)] hover:text-[var(--tw-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tw-accent)] disabled:opacity-50"
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}
