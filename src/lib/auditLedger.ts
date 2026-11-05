import type { SecurityAuditEvent, SystemActionType, PolicyDecision, TaintLevel } from './types.ts';

// Pure deterministic SHA-256 implementation
function sha256Sync(input: string): string {
  // Codifica em UTF-8 (cada char vira 1 byte 0-255), exigido pelo SHA-256 padrão
  let ascii = unescape(encodeURIComponent(input));
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i = 0, j = 0;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return ''; // non-ascii
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength | 0;

  for (j = 0; j < words.length;) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15],
        w2 = w[i - 2];

      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      w[i] = (i < 16) ? (w[i] | 0) : ((w[i - 16] + s0 + w[i - 7] + s1) | 0);

      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const t1 = (hash[7] + (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) + ch + k[i] + w[i]) | 0;
      const t2 = ((rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) + maj) | 0;

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + t1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (t1 + t2) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (8 * j)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

export function computeEventHash(
  index: number,
  timestamp: string,
  action: SystemActionType,
  actor: string,
  target: string,
  decision: PolicyDecision,
  taintLevel: TaintLevel,
  ruleId: string,
  previousHash: string,
  details: string
): string {
  const payload = `${index}|${timestamp}|${action}|${actor}|${target}|${decision}|${taintLevel}|${ruleId}|${previousHash}|${details}`;
  return sha256Sync(payload);
}

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export function createGenesisBlock(): SecurityAuditEvent {
  const timestamp = new Date().toISOString();
  const hash = computeEventHash(
    0,
    timestamp,
    'READ_LOCAL_DIAGNOSTICS',
    'system_kernel',
    'edge_bootloader',
    'ALLOW',
    'CLEAN',
    'POLICY_INIT',
    GENESIS_HASH,
    'Genesis Block: Inicialização de Nó Local Zero-Trust Jeremias A.S.O.'
  );

  return {
    index: 0,
    id: 'evt-0000',
    timestamp,
    action: 'READ_LOCAL_DIAGNOSTICS',
    actor: 'system_kernel',
    target: 'edge_bootloader',
    decision: 'ALLOW',
    taintLevel: 'CLEAN',
    ruleId: 'POLICY_INIT',
    previousHash: GENESIS_HASH,
    hash,
    details: 'Genesis Block: Inicialização de Nó Local Zero-Trust Jeremias A.S.O.',
  };
}

export function appendAuditEvent(
  chain: SecurityAuditEvent[],
  params: {
    action: SystemActionType;
    actor: string;
    target: string;
    decision: PolicyDecision;
    taintLevel: TaintLevel;
    ruleId: string;
    details: string;
    timestamp?: string;
  }
): { updatedChain: SecurityAuditEvent[]; newEvent: SecurityAuditEvent } {
  const previousBlock = chain[chain.length - 1] || createGenesisBlock();
  const index = chain.length;
  const timestamp = params.timestamp || new Date().toISOString();
  const previousHash = previousBlock.hash;

  const hash = computeEventHash(
    index,
    timestamp,
    params.action,
    params.actor,
    params.target,
    params.decision,
    params.taintLevel,
    params.ruleId,
    previousHash,
    params.details
  );

  const newEvent: SecurityAuditEvent = {
    index,
    id: `evt-${String(index).padStart(4, '0')}`,
    timestamp,
    action: params.action,
    actor: params.actor,
    target: params.target,
    decision: params.decision,
    taintLevel: params.taintLevel,
    ruleId: params.ruleId,
    previousHash,
    hash,
    details: params.details,
  };

  return {
    updatedChain: [...chain, newEvent],
    newEvent,
  };
}

export function verifyAuditChain(chain: SecurityAuditEvent[]): {
  valid: boolean;
  tamperedIndex?: number;
  reason?: string;
} {
  if (!chain || chain.length === 0) {
    return { valid: true };
  }

  for (let i = 0; i < chain.length; i++) {
    const block = chain[i];
    const expectedPreviousHash = i === 0 ? GENESIS_HASH : chain[i - 1].hash;

    if (block.previousHash !== expectedPreviousHash) {
      return {
        valid: false,
        tamperedIndex: i,
        reason: `Quebra de elo criptográfico no bloco #${i}: previousHash esperado ${expectedPreviousHash.slice(0, 8)}... mas encontrado ${block.previousHash.slice(0, 8)}...`,
      };
    }

    const recomputed = computeEventHash(
      block.index,
      block.timestamp,
      block.action,
      block.actor,
      block.target,
      block.decision,
      block.taintLevel,
      block.ruleId,
      block.previousHash,
      block.details
    );

    if (recomputed !== block.hash) {
      return {
        valid: false,
        tamperedIndex: i,
        reason: `Assinatura adulterada no bloco #${i}: hash gravado ${block.hash.slice(0, 8)}... diverge do hash recalculado ${recomputed.slice(0, 8)}...`,
      };
    }
  }

  return { valid: true };
}
