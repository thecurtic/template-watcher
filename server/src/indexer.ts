import { analyzeBlockTxs, isSignalingBIP110 } from './bip110.ts';
import { convertTx } from './coretx.ts';
import type { BlockDb, BlockRow } from './db.ts';
import { matchBlockMiner, type PoolDef } from './pools.ts';
import type { BitcoinRpc, CoreBlock } from './rpc.ts';
import { RpcError } from './rpc.ts';

const REORG_DEPTH = 6;

export interface IndexerOptions {
  floorHeight: number;
  pollIntervalMs: number;
  concurrency: number;
  log?: (msg: string) => void;
}

export class Indexer {
  private stopped = false;
  private verbosity: 2 | 3 = 3;
  public backfillDone = false;

  private readonly rpc: BitcoinRpc;
  private readonly db: BlockDb;
  private readonly pools: PoolDef[];
  private readonly opts: IndexerOptions;

  constructor(rpc: BitcoinRpc, db: BlockDb, pools: PoolDef[], opts: IndexerOptions) {
    this.rpc = rpc;
    this.db = db;
    this.pools = pools;
    this.opts = opts;
  }

  private log(msg: string): void {
    (this.opts.log ?? console.log)(`[indexer] ${msg}`);
  }

  stop(): void {
    this.stopped = true;
  }

  private async fetchBlock(hash: string): Promise<CoreBlock> {
    if (this.verbosity === 3) {
      try {
        return await this.rpc.getBlock(hash, 3);
      } catch (err) {
        // Older nodes (< 25.0) reject verbosity 3; fall back to 2 permanently.
        // Without prevouts the checker infers taproot spends from witness
        // structure, matching kilombino's prevout-less path.
        if (err instanceof RpcError && err.code === -8) {
          this.log('getblock verbosity 3 unsupported; falling back to 2 (no prevouts)');
          this.verbosity = 2;
        } else {
          throw err;
        }
      }
    }
    return this.rpc.getBlock(hash, 2);
  }

  private toRow(block: CoreBlock): BlockRow {
    const coinbase = block.tx[0];
    const payoutAddresses = coinbase.vout
      .map((v) => v.scriptPubKey.address)
      .filter((a): a is string => !!a);
    const pool = matchBlockMiner(this.pools, coinbase.vin[0]?.coinbase ?? '', payoutAddresses);

    const { violationCount, violationWeight } = analyzeBlockTxs(block.tx.map(convertTx));

    return {
      height: block.height,
      id: block.hash,
      version: block.version,
      timestamp: block.time,
      tx_count: block.nTx,
      pool_id: pool.id,
      pool_name: pool.name,
      pool_slug: pool.slug,
      signaling: isSignalingBIP110(block.version) ? 1 : 0,
      violation_count: violationCount,
      violation_weight: violationWeight,
    };
  }

  async indexHeight(height: number): Promise<void> {
    const hash = await this.rpc.getBlockHash(height);
    const block = await this.fetchBlock(hash);
    this.db.upsert(this.toRow(block));
  }

  /** Bring the DB up to the node's tip, repairing shallow reorgs. */
  private async syncTip(): Promise<void> {
    const nodeTip = await this.rpc.getBlockCount();
    const dbTip = this.db.tip();

    // Repair reorged heights near our tip.
    if (dbTip !== null) {
      for (let h = Math.max(this.opts.floorHeight, dbTip - REORG_DEPTH); h <= Math.min(dbTip, nodeTip); h++) {
        const stored = this.db.get(h);
        if (!stored) continue;
        const hash = await this.rpc.getBlockHash(h);
        if (hash !== stored.id) {
          this.log(`reorg at ${h}: reindexing`);
          await this.indexHeight(h);
        }
      }
    }

    const from = dbTip === null ? nodeTip : dbTip + 1;
    for (let h = from; h <= nodeTip && !this.stopped; h++) {
      await this.indexHeight(h);
      this.log(`new block ${h}`);
    }
  }

  /** Fill every missing height between floor and the DB tip, newest first. */
  private async backfill(): Promise<void> {
    const have = this.db.heights();
    const tip = this.db.tip();
    if (tip === null) return;

    const missing: number[] = [];
    for (let h = tip; h >= this.opts.floorHeight; h--) {
      if (!have.has(h)) missing.push(h);
    }
    if (!missing.length) {
      if (!this.backfillDone) this.log('backfill complete');
      this.backfillDone = true;
      return;
    }

    this.log(`backfilling ${missing.length} blocks (${this.opts.concurrency} at a time)`);
    let next = 0;
    let done = 0;
    const total = missing.length;
    const worker = async (): Promise<void> => {
      while (!this.stopped) {
        const idx = next++;
        if (idx >= missing.length) return;
        try {
          await this.indexHeight(missing[idx]);
        } catch (err) {
          this.log(`height ${missing[idx]} failed: ${err instanceof Error ? err.message : err}`);
          // leave it missing; picked up on the next cycle
        }
        done++;
        if (done % 250 === 0) this.log(`backfill ${done}/${total}`);
      }
    };
    await Promise.all(Array.from({ length: this.opts.concurrency }, worker));
    if (!this.stopped && next >= missing.length) {
      this.backfillDone = true;
      this.log('backfill complete');
    }
  }

  /** Main loop: follow the tip, then backfill history, then poll. */
  async run(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.syncTip();
        await this.backfill();
      } catch (err) {
        this.log(`cycle failed: ${err instanceof Error ? err.message : err}`);
      }
      await new Promise((r) => setTimeout(r, this.opts.pollIntervalMs));
    }
  }
}
