import { ChevronDown } from 'lucide-react';

/**
 * The seven BIP-110 rules, summarized for readers. These mirror the checks the
 * backend runs per transaction (server/src/bip110.ts, per bip-0110.mediawiki).
 */
const RULES: Array<{ title: string; detail: string }> = [
  {
    title: 'Output size',
    detail:
      'New output scriptPubKeys larger than 34 bytes are invalid — except OP_RETURN outputs, which are allowed up to 83 bytes.',
  },
  {
    title: 'Data push size',
    detail:
      'Script data pushes and witness stack arguments larger than 256 bytes are invalid. Scripts themselves (redeemScripts, witness scripts, Tapleaf scripts) are exempt as items, but the pushes inside them still count.',
  },
  {
    title: 'Undefined witness versions',
    detail:
      'Spending outputs with undefined witness or Tapleaf versions (anything other than v0, v1, or pay-to-anchor) is invalid.',
  },
  {
    title: 'Taproot annex',
    detail: 'Witness stacks that include a Taproot annex are invalid.',
  },
  {
    title: 'Control block size',
    detail:
      'Taproot control blocks larger than 257 bytes (a Merkle path of more than 128 script leaves) are invalid.',
  },
  {
    title: 'OP_SUCCESS opcodes',
    detail:
      'Tapscripts containing any OP_SUCCESS opcode are invalid, even if the opcode is never executed.',
  },
  {
    title: 'OP_IF / OP_NOTIF',
    detail:
      'Tapscripts that execute OP_IF or OP_NOTIF are invalid, regardless of which branch is taken.',
  },
];

export function ComplianceRules() {
  return (
    <section aria-labelledby="compliance-rules-heading" className="space-y-5">
      <h2
        id="compliance-rules-heading"
        className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--tw-muted)]"
      >
        Compliance Rules
      </h2>

      <details className="group rounded-xl border border-[var(--tw-border)] bg-[var(--tw-bg-elev)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm text-[var(--tw-fg)] [&::-webkit-details-marker]:hidden">
          <span>
            What makes a block BIP-110 compliant? A block is compliant when none of its
            transactions break any of the seven rules below.
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--tw-muted)] transition-transform group-open:rotate-180" />
        </summary>
        <ol className="space-y-3 border-t border-[var(--tw-border)]/60 px-4 py-4">
          {RULES.map((rule, i) => (
            <li key={rule.title} className="flex gap-3 text-sm">
              <span className="tw-tnum shrink-0 font-semibold text-[var(--tw-accent)]">
                {i + 1}
              </span>
              <span>
                <span className="font-medium text-[var(--tw-fg)]">{rule.title}.</span>{' '}
                <span className="text-[var(--tw-muted)]">{rule.detail}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="border-t border-[var(--tw-border)]/60 px-4 py-3 text-xs text-[var(--tw-muted)]">
          Rules are checked per transaction against the{' '}
          <a
            href="https://github.com/dathonohm/bips/blob/reduced-data/bip-0110.mediawiki"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--tw-accent)] hover:underline"
          >
            BIP-110 specification
          </a>
          . Inputs spending coins created before activation are exempt under the proposal;
          the counts here apply the rules to all transactions equally.
        </p>
      </details>
    </section>
  );
}
