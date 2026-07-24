/**
 * Mining pool attribution, following mempool's poolsParser.matchBlockMiner:
 * for each pool (in list order) match coinbase payout addresses exactly, then
 * match coinbase-tag regexes case-insensitively against the ASCII-decoded
 * coinbase scriptSig. First match wins; otherwise "Unknown".
 *
 * Dataset: pools.json vendored from https://github.com/mempool/mining-pools
 * (pools-v2.json). Refresh it occasionally to pick up new pools/tags.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface PoolDef {
  id: number;
  name: string;
  slug: string;
  addresses: string[];
  regexes: RegExp[];
}

export interface PoolMatch {
  id: number;
  name: string;
  slug: string;
}

export const UNKNOWN_POOL: PoolMatch = { id: 0, name: 'Unknown', slug: 'unknown' };

interface PoolJson {
  id: number;
  name: string;
  addresses?: string[];
  tags?: string[];
}

export function loadPools(path?: string): PoolDef[] {
  const file = path ?? fileURLToPath(new URL('../pools.json', import.meta.url));
  const raw = JSON.parse(readFileSync(file, 'utf8')) as PoolJson[];
  return raw
    .filter((p) => p.id && ((p.addresses?.length ?? 0) > 0 || (p.tags?.length ?? 0) > 0))
    .map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.name.replace(/[^a-z0-9]/gi, '').toLowerCase(),
      addresses: p.addresses ?? [],
      regexes: (p.tags ?? []).map((t) => new RegExp(t, 'i')),
    }));
}

export function hex2ascii(hex: string): string {
  let out = '';
  for (let i = 0; i < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
  }
  return out;
}

export function matchBlockMiner(
  pools: PoolDef[],
  coinbaseScriptSig: string,
  payoutAddresses: string[],
): PoolMatch {
  const asciiScriptSig = hex2ascii(coinbaseScriptSig);

  for (const pool of pools) {
    if (payoutAddresses.length) {
      for (const address of pool.addresses) {
        if (payoutAddresses.includes(address)) {
          return { id: pool.id, name: pool.name, slug: pool.slug };
        }
      }
    }
    for (const regex of pool.regexes) {
      if (regex.test(asciiScriptSig)) {
        return { id: pool.id, name: pool.name, slug: pool.slug };
      }
    }
  }
  return UNKNOWN_POOL;
}
