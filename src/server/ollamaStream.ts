export type HistoryItem = { role: 'user' | 'model'; text: string };

/**
 * Mantém só as mensagens mais recentes que cabem em `maxChars`.
 * Reenviar a conversa inteira a cada pergunta deixa o modelo local cada vez mais lento:
 * em CPU, processar o histórico custa mais do que gerar a resposta.
 */
export function trimHistory<T extends HistoryItem>(history: T[], maxChars: number): T[] {
  if (maxChars <= 0) return [];
  const kept: T[] = [];
  let total = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const len = history[i].text.length;
    if (total + len > maxChars) break;
    total += len;
    kept.unshift(history[i]);
  }
  // o modelo espera que a conversa comece por uma fala do usuário
  while (kept.length > 0 && kept[0].role !== 'user') kept.shift();
  return kept;
}

/** Lê a resposta em streaming do Ollama (/api/chat com stream:true) e devolve os pedaços de texto. */
export async function* parseOllamaStream(body: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';

  function* handle(line: string): Generator<string, boolean> {
    if (!line) return false;
    const obj = JSON.parse(line);
    if (obj.error) throw new Error(String(obj.error));
    const piece = obj?.message?.content;
    if (typeof piece === 'string' && piece) yield piece;
    return obj.done === true;
  }

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (yield* handle(line)) return;
    }
  }
  buffer += decoder.decode();
  yield* handle(buffer.trim());
}
