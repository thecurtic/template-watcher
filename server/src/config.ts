import { readFileSync } from 'node:fs';

/**
 * First block of March 1, 2026 UTC. The dashboard's observation epoch starts
 * here: the first BIP-110-signaling block (OCEAN / Barefoot Mining) was mined
 * later that day at height 938,903.
 */
export const DEFAULT_FLOOR_HEIGHT = 938_781;

function env(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === '' ? undefined : v;
}

function intEnv(name: string, fallback: number): number {
  const v = env(name);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${v}"`);
  return n;
}

export interface Config {
  rpcUrl: string;
  rpcAuth: () => string; // returns "user:pass"; re-reads cookie files on demand
  dbPath: string;
  port: number;
  host: string;
  floorHeight: number;
  pollIntervalMs: number;
  concurrency: number;
}

export function loadConfig(): Config {
  const cookieFile = env('TW_RPC_COOKIE_FILE');
  const user = env('TW_RPC_USER');
  const pass = env('TW_RPC_PASS');

  if (!cookieFile && !(user && pass)) {
    throw new Error(
      'RPC credentials required: set TW_RPC_USER + TW_RPC_PASS, or TW_RPC_COOKIE_FILE',
    );
  }

  const rpcAuth = cookieFile
    ? () => readFileSync(cookieFile, 'utf8').trim()
    : () => `${user}:${pass}`;

  return {
    rpcUrl: env('TW_RPC_URL') ?? 'http://127.0.0.1:8332',
    rpcAuth,
    dbPath: env('TW_DB_PATH') ?? 'data/template-watch.db',
    port: intEnv('TW_PORT', 8999),
    host: env('TW_HOST') ?? '127.0.0.1',
    floorHeight: intEnv('TW_FLOOR_HEIGHT', DEFAULT_FLOOR_HEIGHT),
    pollIntervalMs: intEnv('TW_POLL_INTERVAL_MS', 30_000),
    concurrency: intEnv('TW_CONCURRENCY', 4),
  };
}
