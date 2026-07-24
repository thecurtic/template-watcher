import { loadConfig } from './config.ts';
import { BlockDb } from './db.ts';
import { Indexer } from './indexer.ts';
import { loadPools } from './pools.ts';
import { BitcoinRpc } from './rpc.ts';
import { createApiServer } from './server.ts';

const config = loadConfig();
const db = new BlockDb(config.dbPath);
const rpc = new BitcoinRpc({ url: config.rpcUrl, auth: config.rpcAuth });
const pools = loadPools();

console.log(`[server] ${pools.length} pool definitions loaded`);
console.log(`[server] db: ${config.dbPath} (${db.count()} blocks, tip ${db.tip() ?? 'none'})`);
console.log(`[server] floor height: ${config.floorHeight}`);

const indexer = new Indexer(rpc, db, pools, {
  floorHeight: config.floorHeight,
  pollIntervalMs: config.pollIntervalMs,
  concurrency: config.concurrency,
});

const api = createApiServer(db, () => ({
  tip: db.tip(),
  floor: config.floorHeight,
  indexed: db.count(),
  backfillDone: indexer.backfillDone,
}));

api.listen(config.port, config.host, () => {
  console.log(`[server] listening on http://${config.host}:${config.port}`);
});

indexer.run().catch((err) => {
  console.error('[server] indexer crashed:', err);
  process.exitCode = 1;
});

function shutdown(): void {
  console.log('[server] shutting down');
  indexer.stop();
  api.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
