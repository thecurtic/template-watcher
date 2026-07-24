import { createServer, type Server } from 'node:http';
import type { BlockDb, BlockRow } from './db.ts';

const PAGE_SIZE = 15;
const MAX_LIMIT = 500;
/** Blocks this far below tip are effectively immutable — let CDNs cache them. */
const IMMUTABLE_DEPTH = 8;

/** The slim mempool-API-compatible shape the Template Watch frontend consumes. */
function toRawBlock(row: BlockRow): Record<string, unknown> {
  return {
    id: row.id,
    height: row.height,
    version: row.version,
    timestamp: row.timestamp,
    tx_count: row.tx_count,
    extras: {
      pool: { id: row.pool_id, name: row.pool_name, slug: row.pool_slug },
      bip110Signaling: row.signaling === 1,
      bip110ViolationCount: row.violation_count,
      bip110ViolationWeight: row.violation_weight,
    },
  };
}

export function createApiServer(db: BlockDb, status: () => Record<string, unknown>): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const send = (code: number, body: unknown, headers: Record<string, string> = {}): void => {
      const json = JSON.stringify(body);
      res.writeHead(code, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...headers,
      });
      res.end(json);
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(405, { error: 'method not allowed' });
      return;
    }

    if (url.pathname === '/healthz') {
      send(200, status(), { 'Cache-Control': 'no-store' });
      return;
    }

    if (url.pathname === '/api/v1/blocks' || url.pathname === '/api/v1/blocks/') {
      send(200, db.latest(PAGE_SIZE).map(toRawBlock), { 'Cache-Control': 'no-store' });
      return;
    }

    const match = url.pathname.match(/^\/api\/v1\/blocks\/(\d+)$/);
    if (match) {
      const height = Number(match[1]);
      const limitParam = Number(url.searchParams.get('limit'));
      const limit = Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, MAX_LIMIT)
        : PAGE_SIZE;
      const rows = db.range(height, limit);
      const tip = db.tip() ?? 0;
      // A page whose newest block is deep enough can never change (barring a
      // > IMMUTABLE_DEPTH reorg) — mark it cacheable for CDNs like Cloudflare.
      const immutable = rows.length > 0 && height <= tip - IMMUTABLE_DEPTH;
      send(200, rows.map(toRawBlock), {
        'Cache-Control': immutable ? 'public, max-age=604800, immutable' : 'no-store',
      });
      return;
    }

    send(404, { error: 'not found' });
  });
}
