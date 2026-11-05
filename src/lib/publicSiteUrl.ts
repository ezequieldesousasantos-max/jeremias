export function extractPublicSiteAddress(text: string): string | null {
  const match = text.match(/(?:https?:\/\/|www\.)[^\s<>"']+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/i);
  return match?.[0].replace(/[),.;!?]+$/g, '') ?? null;
}

export function normalizePublicSiteUrl(input: string): string {
  const raw = input.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  const host = url.hostname.toLowerCase();
  const ipv4 = host.split('.').map(Number);
  const isIpv4 = ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
  const privateIpv4 = isIpv4 && (
    ipv4[0] === 0 || ipv4[0] === 10 || ipv4[0] === 127 ||
    (ipv4[0] === 100 && ipv4[1] >= 64 && ipv4[1] <= 127) || // CGNAT (100.64.0.0/10)
    (ipv4[0] === 169 && ipv4[1] === 254) ||
    (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) ||
    (ipv4[0] === 192 && ipv4[1] === 0 && ipv4[2] <= 2) || // 192.0.0.0/24 e 192.0.2.0/24
    (ipv4[0] === 192 && ipv4[1] === 168) ||
    (ipv4[0] === 198 && (ipv4[1] === 18 || ipv4[1] === 19)) || // testes de rede
    (ipv4[0] === 198 && ipv4[1] === 51 && ipv4[2] === 100) ||
    (ipv4[0] === 203 && ipv4[1] === 0 && ipv4[2] === 113) ||
    ipv4[0] >= 224 // multicast, reservado e broadcast
  );
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !host ||
    url.username ||
    url.password ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host.endsWith('.home.arpa') ||
    host.endsWith('.intranet') ||
    !host.includes('.') || // nome de rede interna, como "http://roteador"
    privateIpv4 ||
    host === '::1' ||
    host.startsWith('[')
  ) {
    throw new Error('Use um endereço público HTTP ou HTTPS. Endereços locais e privados não são permitidos.');
  }
  return url.href;
}

const FILE_EXTENSIONS = new Set([
  'html', 'htm', 'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'json', 'md', 'txt', 'pdf', 'css', 'scss', 'py', 'exe', 'bat',
  'cmd', 'ps1', 'sh', 'zip', 'rar', '7z', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp3', 'mp4', 'docx', 'xlsx',
  'pptx', 'csv', 'log', 'env', 'lock', 'yml', 'yaml', 'xml', 'ini', 'dll', 'msi', 'iso',
]);

const OPEN_INTENT =
  /\b(abr(?:a|e|ir|am|indo)|acess(?:a|e|ar|em)|entr(?:a|e|ar)\s+(?:em|no|na)|naveg(?:a|ue|ar)|visit(?:a|e|ar)|carreg(?:a|ue|ar)|jog(?:a|ar|ue|uemos|ando)|(?:ir|v[aá]|vai)\s+(?:para|pra|ao|no|na)|open|go\s+to)\b/i;

/**
 * Decide se a mensagem do chat é um pedido para ABRIR um site.
 * Só vale quando a mensagem é apenas o endereço ou traz um verbo de abrir/acessar.
 * Nomes de arquivo (index.html, node.js, package.json) nunca contam como site,
 * para perguntas comuns não serem desviadas para o navegador.
 */
export function siteToOpen(text: string): string | null {
  const address = extractPublicSiteAddress(text);
  if (!address) return null;
  const explicit = /^(?:https?:\/\/|www\.)/i.test(address);
  if (!explicit) {
    const host = address.split('/')[0].toLowerCase();
    if (FILE_EXTENSIONS.has(host.split('.').pop() ?? '')) return null;
  }
  const onlyAddress = text.trim().replace(/^<|>$/g, '').replace(/[\s.!?]+$/g, '') === address;
  return onlyAddress || OPEN_INTENT.test(text) ? address : null;
}
