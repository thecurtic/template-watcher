/**
 * Validate the ported BIP-110 checker against mempool.kilombino.com.
 *
 * For each sample block (audited range only, height >= 953,087) this fetches
 * the full transaction list in esplora format from kilombino's API, runs our
 * checker on it, and compares to the bip110ViolationCount / Weight the site
 * publishes. Exact parity proves the port is faithful.
 *
 * Usage:
 *   node src/validate.ts                 # 3 recent blocks
 *   node src/validate.ts 954000 955123   # specific heights
 */

import { analyzeBlockTxs, type CheckTx, type ScriptPubKeyType } from './bip110.ts';

const BASE = process.env.TW_VALIDATE_BASE ?? 'https://mempool.kilombino.com';
const AUDIT_START = 953_087; // kilombino's audit went live here; earlier counts are 0-filled

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } });
    if (res.ok) return res.json() as Promise<T>;
    if (attempt >= 2) throw new Error(`HTTP ${res.status} for ${path}`);
    await sleep(1000);
  }
}

interface ApiBlock {
  id: string;
  height: number;
  tx_count: number;
  extras?: { bip110ViolationCount?: number; bip110ViolationWeight?: number };
}

// Esplora tx shape (subset) — structurally compatible with CheckTx except that
// optional fields may be absent; normalize defensively.
interface EsploraTx {
  txid: string;
  weight: number;
  vin: Array<{
    is_coinbase: boolean;
    scriptsig?: string;
    witness?: string[];
    prevout?: { scriptpubkey: string; scriptpubkey_type: string } | null;
  }>;
  vout: Array<{ scriptpubkey: string; scriptpubkey_type: string }>;
}

function toCheckTx(tx: EsploraTx): CheckTx {
  return {
    txid: tx.txid,
    weight: tx.weight,
    vin: tx.vin.map((vin) => ({
      is_coinbase: vin.is_coinbase,
      scriptsig: vin.scriptsig ?? '',
      witness: vin.witness ?? [],
      prevout: vin.prevout
        ? {
            scriptpubkey: vin.prevout.scriptpubkey,
            scriptpubkey_type: vin.prevout.scriptpubkey_type as ScriptPubKeyType,
          }
        : undefined,
    })),
    vout: tx.vout.map((vout) => ({
      scriptpubkey: vout.scriptpubkey,
      scriptpubkey_type: vout.scriptpubkey_type as ScriptPubKeyType,
    })),
  };
}

async function validateBlock(block: ApiBlock): Promise<boolean> {
  const txs: CheckTx[] = [];
  // Page size varies by instance (10 on kilombino, 25 on stock esplora) —
  // advance by however many the server actually returned.
  let start = 0;
  while (start < block.tx_count) {
    const page = await getJson<EsploraTx[]>(`/api/block/${block.id}/txs/${start}`);
    if (!page.length) break;
    txs.push(...page.map(toCheckTx));
    start += page.length;
    await sleep(100);
    if (txs.length % 500 < page.length && txs.length >= 500) {
      console.log(`  ...${txs.length}/${block.tx_count} txs`);
    }
  }
  if (txs.length !== block.tx_count) {
    throw new Error(`fetched ${txs.length} txs, expected ${block.tx_count}`);
  }

  const ours = analyzeBlockTxs(txs);
  const theirs = {
    violationCount: block.extras?.bip110ViolationCount ?? -1,
    violationWeight: block.extras?.bip110ViolationWeight ?? -1,
  };
  const match =
    ours.violationCount === theirs.violationCount &&
    ours.violationWeight === theirs.violationWeight;

  console.log(
    `block ${block.height}: ours count=${ours.violationCount} weight=${ours.violationWeight} | ` +
      `kilombino count=${theirs.violationCount} weight=${theirs.violationWeight} | ` +
      (match ? 'MATCH' : 'MISMATCH'),
  );
  return match;
}

const args = process.argv.slice(2).map(Number).filter(Number.isFinite);

let targets: ApiBlock[];
if (args.length) {
  targets = [];
  for (const height of args) {
    const [block] = await getJson<ApiBlock[]>(`/api/v1/blocks/${height}`);
    targets.push(block);
  }
} else {
  targets = (await getJson<ApiBlock[]>('/api/v1/blocks')).slice(0, 3);
}

let allMatch = true;
for (const block of targets) {
  if (block.height < AUDIT_START) {
    console.log(`block ${block.height}: below audit start ${AUDIT_START}, skipping (0-filled upstream)`);
    continue;
  }
  console.log(`validating block ${block.height} (${block.tx_count} txs)...`);
  allMatch = (await validateBlock(block)) && allMatch;
}

console.log(allMatch ? 'ALL BLOCKS MATCH' : 'MISMATCHES FOUND');
process.exitCode = allMatch ? 0 : 1;
