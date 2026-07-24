/** Convert Core/Knots RPC JSON into the esplora-style shape the checker uses. */

import type { CheckTx, CheckVin, ScriptPubKeyType } from './bip110.ts';
import type { CoreScriptPubKey, CoreTx } from './rpc.ts';

/** Core `scriptPubKey.type` -> esplora-style type (as used by mempool/esplora). */
export function mapScriptType(coreType: string): ScriptPubKeyType {
  switch (coreType) {
    case 'pubkey':
      return 'p2pk';
    case 'pubkeyhash':
      return 'p2pkh';
    case 'scripthash':
      return 'p2sh';
    case 'witness_v0_keyhash':
      return 'v0_p2wpkh';
    case 'witness_v0_scripthash':
      return 'v0_p2wsh';
    case 'witness_v1_taproot':
      return 'v1_p2tr';
    case 'multisig':
      return 'multisig';
    case 'nulldata':
      return 'op_return';
    case 'anchor':
      return 'anchor';
    default:
      // 'witness_unknown', 'nonstandard', anything new
      return 'unknown';
  }
}

function convertPrevout(spk: CoreScriptPubKey): CheckVin['prevout'] {
  return {
    scriptpubkey: spk.hex,
    scriptpubkey_type: mapScriptType(spk.type),
  };
}

export function convertTx(tx: CoreTx): CheckTx {
  return {
    txid: tx.txid,
    weight: tx.weight,
    vin: tx.vin.map((vin): CheckVin => ({
      is_coinbase: vin.coinbase !== undefined,
      scriptsig: vin.scriptSig?.hex ?? '',
      witness: vin.txinwitness ?? [],
      prevout: vin.prevout ? convertPrevout(vin.prevout.scriptPubKey) : undefined,
    })),
    vout: tx.vout.map((vout) => ({
      scriptpubkey: vout.scriptPubKey.hex,
      scriptpubkey_type: mapScriptType(vout.scriptPubKey.type),
    })),
  };
}
