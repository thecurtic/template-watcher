/** Minimal Bitcoin Core/Knots JSON-RPC client (no dependencies). */

export interface RpcOptions {
  url: string;
  auth: () => string; // "user:pass" (cookie files re-read per call)
  timeoutMs?: number;
}

export class RpcError extends Error {
  readonly code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
  }
}

export class BitcoinRpc {
  private id = 0;
  private readonly opts: RpcOptions;

  constructor(opts: RpcOptions) {
    this.opts = opts;
  }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 60_000);
    try {
      const res = await fetch(this.opts.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(this.opts.auth()).toString('base64')}`,
        },
        body: JSON.stringify({ jsonrpc: '1.0', id: ++this.id, method, params }),
        signal: controller.signal,
      });
      if (res.status === 401) {
        throw new RpcError('RPC authentication failed (401) — check credentials/cookie');
      }
      // Core returns 500 for RPC-level errors but still includes a JSON body.
      const body = (await res.json()) as {
        result?: T;
        error?: { code: number; message: string } | null;
      };
      if (body.error) {
        throw new RpcError(`${method}: ${body.error.message}`, body.error.code);
      }
      if (!res.ok) {
        throw new RpcError(`${method}: HTTP ${res.status}`);
      }
      return body.result as T;
    } finally {
      clearTimeout(timer);
    }
  }

  getBlockCount(): Promise<number> {
    return this.call('getblockcount');
  }

  getBlockHash(height: number): Promise<string> {
    return this.call('getblockhash', [height]);
  }

  getBestBlockHash(): Promise<string> {
    return this.call('getbestblockhash');
  }

  /** verbosity 3 includes prevouts (Core/Knots 25+); 2 decodes txs without them. */
  getBlock(hash: string, verbosity: 2 | 3): Promise<CoreBlock> {
    return this.call('getblock', [hash, verbosity]);
  }
}

// --- Core RPC JSON shapes (the subset we consume) ---

export interface CoreScriptPubKey {
  hex: string;
  type: string;
  address?: string;
}

export interface CoreVin {
  coinbase?: string;
  txid?: string;
  scriptSig?: { hex: string };
  txinwitness?: string[];
  prevout?: {
    scriptPubKey: CoreScriptPubKey;
    value: number;
  };
}

export interface CoreVout {
  value: number;
  scriptPubKey: CoreScriptPubKey;
}

export interface CoreTx {
  txid: string;
  weight: number;
  vin: CoreVin[];
  vout: CoreVout[];
}

export interface CoreBlock {
  hash: string;
  height: number;
  version: number;
  time: number;
  nTx: number;
  tx: CoreTx[];
}
