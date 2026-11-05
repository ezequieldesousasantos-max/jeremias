export type Role = 'user' | 'model';

/**
 * Histórico de conversa guardado SOMENTE em memória, em Buffers.
 * Buffers podem ser sobrescritos com 0x00 (strings JS são imutáveis e não podem).
 * Limite: cópias transitórias criadas pelo V8/Express durante uma requisição
 * (ex.: a string do prompt) não são controláveis daqui.
 */
export class EphemeralMemory {
  private items: { role: Role; buf: Buffer }[] = [];
  private maxBytes: number;

  constructor(maxBytes = 256 * 1024) {
    this.maxBytes = maxBytes;
  }

  add(role: Role, text: string): void {
    this.items.push({ role, buf: Buffer.from(text, 'utf8') });
    while (this.sizeBytes() > this.maxBytes && this.items.length > 1) {
      this.items.shift()!.buf.fill(0); // descarte do mais antigo também zera
    }
  }

  history(): { role: Role; text: string }[] {
    return this.items.map((i) => ({ role: i.role, text: i.buf.toString('utf8') }));
  }

  sizeBytes(): number {
    return this.items.reduce((n, i) => n + i.buf.length, 0);
  }

  count(): number {
    return this.items.length;
  }

  /** Sobrescreve cada buffer com zeros e esvazia o histórico. */
  purge(): { zeroedBytes: number; messages: number } {
    const zeroedBytes = this.sizeBytes();
    const messages = this.items.length;
    for (const i of this.items) i.buf.fill(0);
    this.items = [];
    return { zeroedBytes, messages };
  }

  /** Apenas para testes: acesso aos buffers vivos. */
  _buffers(): Buffer[] {
    return this.items.map((i) => i.buf);
  }
}
