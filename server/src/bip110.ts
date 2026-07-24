/**
 * BIP-110 "Reduced Data Temporary Softfork" violation detection.
 *
 * Ported from Kilombino/mempool-bip110 (backend/src/api/common.ts), itself
 * derived from paulscode/mempool-bip110. Both AGPL-3.0 — see server/README.md
 * for attribution. The logic is kept deliberately close to the original so
 * results stay comparable with mempool.kilombino.com.
 *
 * BIP110 Rules (per bip-0110.mediawiki Specification):
 * 1. New output scriptPubKeys > 34 bytes invalid (except OP_RETURN up to 83 bytes)
 * 2. OP_PUSHDATA* payloads and script argument witness items > 256 bytes invalid.
 *    Exempt items (limited/invalidated by another rule, or not at all): BIP16
 *    redeemScripts, witness scripts, Tapleaf scripts, control blocks (Rule 5),
 *    annexes (Rule 4), and Taproot key-path signatures (bounded by BIP341).
 *    OP_PUSHDATA* payloads inside the exempt executing scripts still apply.
 * 3. Spending undefined witness/Tapleaf versions (not v0, v1, or P2A) invalid
 * 4. Witness stacks with a Taproot annex invalid
 * 5. Taproot control blocks > 257 bytes (a merkle tree with 128 script leaves) invalid
 * 6. Tapscripts including OP_SUCCESS* opcodes anywhere (even unexecuted) invalid
 * 7. Tapscripts executing OP_IF or OP_NOTIF (regardless of result) invalid
 */

import { Buffer } from 'node:buffer';

const MAX_SCRIPTPUBKEY_SIZE = 34; // Rule 1: max scriptPubKey size (except OP_RETURN)
const MAX_OPRETURN_SIZE = 83; // Rule 1: max OP_RETURN size
const MAX_PUSHDATA_SIZE = 256; // Rule 2: max script-argument witness/PUSHDATA item size
const MAX_CONTROL_BLOCK_SIZE = 257; // Rule 5: max control block size (128 script leaves)
const VERSION_BIT = 4; // deployment 'reduced_data' signaling bit

/** Esplora-style scriptpubkey types, as used by the upstream checker. */
export type ScriptPubKeyType =
  | 'p2pk'
  | 'p2pkh'
  | 'p2sh'
  | 'v0_p2wpkh'
  | 'v0_p2wsh'
  | 'v1_p2tr'
  | 'multisig'
  | 'op_return'
  | 'anchor'
  | 'unknown';

export interface CheckVin {
  is_coinbase: boolean;
  /** scriptSig hex ('' when absent) */
  scriptsig: string;
  /** witness stack items, hex */
  witness: string[];
  prevout?: {
    scriptpubkey: string;
    scriptpubkey_type: ScriptPubKeyType;
  };
}

export interface CheckVout {
  scriptpubkey: string;
  scriptpubkey_type: ScriptPubKeyType;
}

export interface CheckTx {
  txid: string;
  weight: number;
  vin: CheckVin[];
  vout: CheckVout[];
}

export const Violation = {
  largeScriptPubKey: 1 << 0, // Rule 1
  largePushdata: 1 << 1, // Rule 2
  undefinedWitness: 1 << 2, // Rule 3
  taprootAnnex: 1 << 3, // Rule 4
  largeControlBlock: 1 << 4, // Rule 5
  opSuccess: 1 << 5, // Rule 6
  opIfNotif: 1 << 6, // Rule 7
} as const;

/** Block-version signaling per the 'reduced_data' deployment (version bit 4). */
export function isSignalingBIP110(version: number): boolean {
  return (version & (1 << VERSION_BIT)) !== 0;
}

// A witness program is any valid scriptpubkey that consists of a 1-byte push
// opcode followed by a data push between 2 and 40 bytes.
export function isWitnessProgram(
  scriptpubkey: string,
): false | { version: number; program: string } {
  if (scriptpubkey.length < 8 || scriptpubkey.length > 84) {
    return false;
  }
  const version = parseInt(scriptpubkey.slice(0, 2), 16);
  if ((version !== 0 && version < 0x51) || version > 0x60) {
    return false;
  }
  const push = parseInt(scriptpubkey.slice(2, 4), 16);
  if (push + 2 === scriptpubkey.length / 2) {
    return {
      version: version ? version - 0x50 : 0,
      program: scriptpubkey.slice(4),
    };
  }
  return false;
}

/**
 * BIP341 witness-stack parsing: return the Tapleaf script of a taproot
 * script-path spend, or null when the stack cannot be one.
 */
export function witnessToP2TRScript(witness: string[]): string | null {
  if (witness.length < 2) return null;
  const hasAnnex = witness[witness.length - 1].substring(0, 2) === '50';
  if (hasAnnex && witness.length < 3) return null;
  const positionOfScript = hasAnnex ? witness.length - 3 : witness.length - 2;
  return witness[positionOfScript];
}

/**
 * Check whether a script contains an OP_PUSHDATA* payload exceeding the
 * 256-byte limit (Rule 2). Walks raw bytes; a push only counts if its declared
 * data actually fits in the script (callers may pass items that are not really
 * scripts when the spend type is inferred without prevout data).
 */
export function scriptHasLargePush(scriptHex: string): boolean {
  if (!scriptHex) return false;
  let buf: Buffer;
  try {
    buf = Buffer.from(scriptHex, 'hex');
  } catch {
    return false;
  }

  let i = 0;
  while (i < buf.length) {
    const op = buf[i];
    let headerLen: number;
    let dataLen: number;
    if (op >= 0x01 && op <= 0x4b) {
      headerLen = 1;
      dataLen = op;
    } else if (op === 0x4c) {
      // OP_PUSHDATA1
      if (i + 2 > buf.length) break;
      headerLen = 2;
      dataLen = buf.readUInt8(i + 1);
    } else if (op === 0x4d) {
      // OP_PUSHDATA2
      if (i + 3 > buf.length) break;
      headerLen = 3;
      dataLen = buf.readUInt16LE(i + 1);
    } else if (op === 0x4e) {
      // OP_PUSHDATA4
      if (i + 5 > buf.length) break;
      headerLen = 5;
      dataLen = buf.readUInt32LE(i + 1);
    } else {
      i += 1; // non-push opcode
      continue;
    }
    if (i + headerLen + dataLen > buf.length) break;
    if (dataLen > MAX_PUSHDATA_SIZE) return true;
    i += headerLen + dataLen;
  }
  return false;
}

/**
 * Scan a raw Tapscript for Rule 6 (OP_SUCCESS*) and Rule 7 (OP_IF/OP_NOTIF).
 * Byte-walk that skips push payloads so data bytes are never mistaken for
 * opcodes. OP_SUCCESS opcodes (BIP342): 80, 98, 126-129, 131-134, 137-138,
 * 141-142, 149-153, 187-254. OP_IF = 0x63, OP_NOTIF = 0x64.
 */
export function scanTapscriptForViolations(scriptHex: string): {
  opSuccess: boolean;
  opIfNotif: boolean;
} {
  const result = { opSuccess: false, opIfNotif: false };
  if (!scriptHex) return result;

  let buf: Buffer;
  try {
    buf = Buffer.from(scriptHex, 'hex');
  } catch {
    return result;
  }

  let i = 0;
  while (i < buf.length) {
    const op = buf[i];
    if (op >= 0x01 && op <= 0x4b) {
      i += 1 + op;
      continue;
    } else if (op === 0x4c) {
      if (i + 1 >= buf.length) break;
      i += 2 + buf.readUInt8(i + 1);
      continue;
    } else if (op === 0x4d) {
      if (i + 2 >= buf.length) break;
      i += 3 + buf.readUInt16LE(i + 1);
      continue;
    } else if (op === 0x4e) {
      if (i + 4 >= buf.length) break;
      i += 5 + buf.readUInt32LE(i + 1);
      continue;
    }

    if (
      op === 80 || op === 98 ||
      (op >= 126 && op <= 129) || (op >= 131 && op <= 134) ||
      (op >= 137 && op <= 138) || (op >= 141 && op <= 142) ||
      (op >= 149 && op <= 153) || (op >= 187 && op <= 254)
    ) {
      result.opSuccess = true;
    } else if (op === 0x63 || op === 0x64) {
      result.opIfNotif = true;
    }
    i += 1;

    if (result.opSuccess && result.opIfNotif) break;
  }

  return result;
}

/**
 * Witness-related rules (2, 3, 4, 5, 6, 7).
 *
 * When prevout data is available we use its type directly. When it is not
 * (verbosity-2 fallback), taproot script-path spends are inferred from the
 * witness structure via witnessToP2TRScript() with control-block validation to
 * avoid false positives, exactly as upstream does.
 */
export function checkWitnessRules(vin: CheckVin): number {
  let flags = 0;

  if (!vin.witness.length) return flags;

  const lastWitness = vin.witness[vin.witness.length - 1];
  const hasAnnex = vin.witness.length > 1 && lastWitness.startsWith('50');

  const prevoutType = vin.prevout?.scriptpubkey_type;

  const isTaprootWithPrevout =
    prevoutType === 'v1_p2tr' && vin.witness.length > (hasAnnex ? 2 : 1);
  let tapscriptFromWitness: string | null = null;
  if (!prevoutType) {
    tapscriptFromWitness = witnessToP2TRScript(vin.witness);
    if (tapscriptFromWitness !== null) {
      // BIP341: control block = leaf_version_byte || internal_key_32B || 0+ 32B nodes.
      // Minimum 33 bytes, (length - 33) divisible by 32, leaf version >= 0xc0 —
      // filters non-taproot witnesses (e.g. P2WPKH pubkeys start 0x02/0x03).
      const cbIndex = vin.witness.length - (hasAnnex ? 2 : 1);
      const cb = vin.witness[cbIndex];
      const cbByteLen = cb.length / 2;
      const cbFirstByte = parseInt(cb.substring(0, 2), 16);
      if (cbByteLen < 33 || (cbByteLen - 33) % 32 !== 0 || (cbFirstByte & 0xfe) < 0xc0) {
        tapscriptFromWitness = null;
      }
    }
  }
  const isTaprootScriptPath = isTaprootWithPrevout || tapscriptFromWitness !== null;

  // Rule 4: Taproot annex is invalid
  if (hasAnnex && (prevoutType === 'v1_p2tr' || isTaprootScriptPath)) {
    flags |= Violation.taprootAnnex;
  }

  // Rule 2 applies the 256-byte limit only to "script argument witness items".
  // Witness scripts / Tapleaf scripts, control blocks (Rule 5), annexes
  // (Rule 4), and Taproot key-path signatures (bounded by BIP341) are exempt
  // as items; executing scripts still get their internal pushes scanned.
  const exemptItemIndices = new Set<number>();
  const executingScriptIndices: number[] = [];

  if (hasAnnex) {
    exemptItemIndices.add(vin.witness.length - 1);
  }

  if (isTaprootScriptPath) {
    // Layout (annex removed): [...script args, Tapleaf script, control block]
    const controlBlockIndex = vin.witness.length - (hasAnnex ? 2 : 1);
    const tapscriptIndex = controlBlockIndex - 1;
    exemptItemIndices.add(controlBlockIndex); // control block -> Rule 5
    if (tapscriptIndex >= 0) {
      exemptItemIndices.add(tapscriptIndex); // Tapleaf script -> not an item
      executingScriptIndices.push(tapscriptIndex);
    }
  } else if (prevoutType === 'v1_p2tr') {
    // Key-path spend: the sole (non-annex) item is the Schnorr signature.
    const sigIndex = vin.witness.length - 1 - (hasAnnex ? 1 : 0);
    if (sigIndex >= 0) {
      exemptItemIndices.add(sigIndex);
    }
  } else if (prevoutType === 'v0_p2wsh' || prevoutType === 'p2sh' || !prevoutType) {
    // P2WSH / P2SH-wrapped-P2WSH (and the prevout-less path): the last
    // non-annex item is the witness script. Treating P2WPKH/key-path's small
    // last item as a "script" here is harmless — it is well under 256 bytes
    // and contains no oversized pushes.
    const witnessScriptIndex = vin.witness.length - 1 - (hasAnnex ? 1 : 0);
    if (witnessScriptIndex >= 0) {
      exemptItemIndices.add(witnessScriptIndex);
      executingScriptIndices.push(witnessScriptIndex);
    }
  }
  // Otherwise (e.g. v0_p2wpkh with prevout): every item is a script argument.

  for (let i = 0; i < vin.witness.length; i++) {
    if (exemptItemIndices.has(i)) continue;
    if (vin.witness[i].length / 2 > MAX_PUSHDATA_SIZE) {
      flags |= Violation.largePushdata;
      break;
    }
  }

  if (isTaprootScriptPath) {
    const controlBlockIndex = vin.witness.length - (hasAnnex ? 2 : 1);
    const controlBlock = vin.witness[controlBlockIndex];

    // Rule 5: control block size
    if (controlBlock.length / 2 > MAX_CONTROL_BLOCK_SIZE) {
      flags |= Violation.largeControlBlock;
    }

    // Rule 3: undefined Tapleaf versions. Leaf version = first byte & 0xfe;
    // only 0xc0 (BIP342 tapscript) is currently defined.
    const leafVersion = parseInt(controlBlock.substring(0, 2), 16) & 0xfe;
    if (leafVersion !== 0xc0) {
      flags |= Violation.undefinedWitness;
    }

    // Rules 6 & 7: scan the Tapleaf script
    const tapscriptIndex = controlBlockIndex - 1;
    if (tapscriptIndex >= 0) {
      const scan = scanTapscriptForViolations(vin.witness[tapscriptIndex]);
      if (scan.opSuccess) flags |= Violation.opSuccess;
      if (scan.opIfNotif) flags |= Violation.opIfNotif;
    }
  }

  // Rule 2 (OP_PUSHDATA* payloads) inside executing scripts
  if ((flags & Violation.largePushdata) === 0) {
    for (const idx of executingScriptIndices) {
      if (scriptHasLargePush(vin.witness[idx])) {
        flags |= Violation.largePushdata;
        break;
      }
    }
  }

  // Rule 3: spending undefined witness versions (not v0, v1, or P2A).
  // P2A is witness v1 with a 2-byte program, so version > 1 correctly
  // excludes v0, v1, and P2A.
  if (vin.prevout?.scriptpubkey_type === 'unknown') {
    const witnessProgram = isWitnessProgram(vin.prevout.scriptpubkey);
    if (witnessProgram && witnessProgram.version > 1) {
      flags |= Violation.undefinedWitness;
    }
  }

  return flags;
}

/**
 * ScriptSig Rule 2 (large pushdata): payloads exceeding 256 bytes are
 * invalid, except the BIP16 redeemScript push (which is instead scanned for
 * oversized internal pushes). Upstream walks the generated ASM; this walks the
 * raw bytes with identical semantics — the "redeemScript" is the final push
 * when the script ends on one, mirroring the last-ASM-part rule.
 */
export function checkScriptSigRules(vin: CheckVin): number {
  let flags = 0;

  if (!vin.scriptsig || vin.scriptsig.length === 0) return flags;

  let buf: Buffer;
  try {
    buf = Buffer.from(vin.scriptsig, 'hex');
  } catch {
    return flags;
  }

  // Collect data pushes: [start, declaredLen, availableLen]
  const pushes: Array<{ start: number; len: number; end: number }> = [];
  let i = 0;
  while (i < buf.length) {
    const op = buf[i];
    let headerLen: number;
    let dataLen: number;
    if (op >= 0x01 && op <= 0x4b) {
      headerLen = 1;
      dataLen = op;
    } else if (op === 0x4c && i + 1 < buf.length) {
      headerLen = 2;
      dataLen = buf.readUInt8(i + 1);
    } else if (op === 0x4d && i + 2 < buf.length) {
      headerLen = 3;
      dataLen = buf.readUInt16LE(i + 1);
    } else if (op === 0x4e && i + 4 < buf.length) {
      headerLen = 5;
      dataLen = buf.readUInt32LE(i + 1);
    } else {
      i += 1;
      continue;
    }
    const start = i + headerLen;
    const avail = Math.min(dataLen, buf.length - start);
    pushes.push({ start, len: avail, end: start + avail });
    i = start + avail;
  }

  const isP2SH = vin.prevout?.scriptpubkey_type === 'p2sh';
  // The redeemScript is the final push of a P2SH scriptSig (script ends on it).
  const lastPush = pushes.length ? pushes[pushes.length - 1] : null;
  const redeemScriptPush = isP2SH && lastPush && lastPush.end === buf.length ? lastPush : null;

  for (const push of pushes) {
    if (push === redeemScriptPush) continue;
    if (push.len > MAX_PUSHDATA_SIZE) {
      flags |= Violation.largePushdata;
      break;
    }
  }

  if ((flags & Violation.largePushdata) === 0 && redeemScriptPush) {
    const redeemHex = buf.subarray(redeemScriptPush.start, redeemScriptPush.end).toString('hex');
    if (scriptHasLargePush(redeemHex)) {
      flags |= Violation.largePushdata;
    }
  }

  return flags;
}

/** All-rules check for one transaction. Returns a bitmask of Violation flags. */
export function getBIP110Flags(tx: CheckTx): number {
  let flags = 0;

  // Rule 1: output scriptPubKey sizes
  for (const vout of tx.vout) {
    const scriptSize = vout.scriptpubkey.length / 2;
    if (vout.scriptpubkey_type === 'op_return') {
      if (scriptSize > MAX_OPRETURN_SIZE) {
        flags |= Violation.largeScriptPubKey;
      }
    } else if (scriptSize > MAX_SCRIPTPUBKEY_SIZE) {
      flags |= Violation.largeScriptPubKey;
    }
  }

  for (const vin of tx.vin) {
    if (vin.is_coinbase) continue;
    flags |= checkWitnessRules(vin);
    flags |= checkScriptSigRules(vin);
  }

  return flags;
}

/**
 * Per-block aggregation, matching Kilombino's blocks.ts: count transactions
 * with any violation and sum their weight. The coinbase-only case (single tx)
 * is treated as "no data" upstream; here the caller always has the full set.
 */
export function analyzeBlockTxs(txs: CheckTx[]): {
  violationCount: number;
  violationWeight: number;
} {
  let violationCount = 0;
  let violationWeight = 0;
  for (const tx of txs) {
    if (getBIP110Flags(tx) !== 0) {
      violationCount++;
      violationWeight += tx.weight || 0;
    }
  }
  return { violationCount, violationWeight };
}
