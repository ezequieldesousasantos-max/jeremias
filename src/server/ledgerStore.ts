import fs from 'node:fs';
import path from 'node:path';
import type { SecurityAuditEvent } from '../lib/types.ts';

export interface LedgerStore {
  /** Lê a cadeia persistida. Lança se o arquivo estiver ilegível. */
  load(): SecurityAuditEvent[];
  append(event: SecurityAuditEvent): void;
  /** Isola um arquivo ilegível para análise (não apaga). */
  quarantine(): void;
}

export function memoryStore(): LedgerStore {
  const list: SecurityAuditEvent[] = [];
  return {
    load: () => [...list],
    append: (e) => void list.push(e),
    quarantine: () => void (list.length = 0),
  };
}

/** Ledger append-only em JSONL: uma linha por bloco. */
export function fileStore(file: string): LedgerStore {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return {
    load() {
      if (!fs.existsSync(file)) return [];
      return fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as SecurityAuditEvent);
    },
    append(e) {
      fs.appendFileSync(file, JSON.stringify(e) + '\n');
    },
    quarantine() {
      if (fs.existsSync(file)) fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
    },
  };
}
