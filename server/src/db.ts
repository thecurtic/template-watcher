import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface BlockRow {
  height: number;
  id: string;
  version: number;
  timestamp: number;
  tx_count: number;
  pool_id: number;
  pool_name: string;
  pool_slug: string;
  signaling: number; // 0/1, version bit 4 (kilombino semantics)
  violation_count: number;
  violation_weight: number;
}

export class BlockDb {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blocks (
        height INTEGER PRIMARY KEY,
        id TEXT NOT NULL,
        version INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        tx_count INTEGER NOT NULL,
        pool_id INTEGER NOT NULL,
        pool_name TEXT NOT NULL,
        pool_slug TEXT NOT NULL,
        signaling INTEGER NOT NULL,
        violation_count INTEGER NOT NULL,
        violation_weight INTEGER NOT NULL
      )
    `);
  }

  upsert(row: BlockRow): void {
    this.db
      .prepare(
        `INSERT INTO blocks
           (height, id, version, timestamp, tx_count, pool_id, pool_name, pool_slug,
            signaling, violation_count, violation_weight)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(height) DO UPDATE SET
           id = excluded.id,
           version = excluded.version,
           timestamp = excluded.timestamp,
           tx_count = excluded.tx_count,
           pool_id = excluded.pool_id,
           pool_name = excluded.pool_name,
           pool_slug = excluded.pool_slug,
           signaling = excluded.signaling,
           violation_count = excluded.violation_count,
           violation_weight = excluded.violation_weight`,
      )
      .run(
        row.height,
        row.id,
        row.version,
        row.timestamp,
        row.tx_count,
        row.pool_id,
        row.pool_name,
        row.pool_slug,
        row.signaling,
        row.violation_count,
        row.violation_weight,
      );
  }

  /** Newest-first blocks at and below `height` (mempool API pagination shape). */
  range(height: number, limit: number): BlockRow[] {
    return this.db
      .prepare('SELECT * FROM blocks WHERE height <= ? ORDER BY height DESC LIMIT ?')
      .all(height, limit) as unknown as BlockRow[];
  }

  latest(limit: number): BlockRow[] {
    return this.db
      .prepare('SELECT * FROM blocks ORDER BY height DESC LIMIT ?')
      .all(limit) as unknown as BlockRow[];
  }

  get(height: number): BlockRow | undefined {
    return this.db.prepare('SELECT * FROM blocks WHERE height = ?').get(height) as
      | BlockRow
      | undefined;
  }

  tip(): number | null {
    const row = this.db.prepare('SELECT MAX(height) AS h FROM blocks').get() as { h: number | null };
    return row.h;
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM blocks').get() as { c: number };
    return row.c;
  }

  heights(): Set<number> {
    const rows = this.db.prepare('SELECT height FROM blocks').all() as unknown as Array<{
      height: number;
    }>;
    return new Set(rows.map((r) => r.height));
  }

  close(): void {
    this.db.close();
  }
}
