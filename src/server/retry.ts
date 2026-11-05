/** Falhas temporárias do provedor: vale tentar de novo. (429 = cota, NÃO é temporária.) */
export function isTransient(err: unknown): boolean {
  const m = String((err as any)?.message ?? err);
  return /\b(500|502|503|504)\b|UNAVAILABLE|overloaded|high demand|ECONNRESET|ETIMEDOUT|fetch failed/i.test(m);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { delaysMs?: number[]; sleep?: (ms: number) => Promise<void> } = {}
): Promise<T> {
  const delays = opts.delaysMs ?? [1500, 4000, 9000];
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isTransient(e) || i >= delays.length) throw e;
      await sleep(delays[i]);
    }
  }
}

/** Mensagem em português para o erro do modelo. */
export function describeModelError(err: unknown): string {
  const m = String((err as any)?.message ?? err);
  if (/\b503\b|UNAVAILABLE|high demand|overloaded/i.test(m)) {
    return 'O Gemini está com alta demanda no Google (erro 503, geralmente temporário). Tentei algumas vezes sem sucesso. Tente de novo em alguns minutos.';
  }
  if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(m)) {
    return 'A cota gratuita da chave foi atingida (erro 429). Espere o limite renovar ou use um modelo local (Ollama).';
  }
  if (/API key not valid|\b401\b|\b403\b|PERMISSION_DENIED|UNAUTHENTICATED/i.test(m)) {
    return 'O Google recusou a chave (erro de autenticação). Confira a GEMINI_API_KEY em Arquivo > Configurações.';
  }
  return m.slice(0, 300);
}