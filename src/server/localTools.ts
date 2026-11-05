import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

/**
 * Ferramentas LOCAIS do Jeremias: funcionam sem internet e sem modelo de IA.
 * Nada aqui envia dados para fora da máquina. Cada ferramenta só dispara com um
 * padrão claro; na dúvida, devolve null e o pedido segue para o modelo.
 */

export interface LocalResult {
  tool: string;
  text: string;
  /** ferramentas que tocam em arquivos são registradas no ledger (sem nomes de arquivo) */
  touchesFiles?: boolean;
  /** pedido de criar arquivo: NADA é gravado até o operador confirmar */
  pendingWrite?: { name: string; content: string };
}

export interface LocalOptions {
  now?: Date;
  /** pastas onde a busca e o hash são permitidos (padrão: Documentos, Downloads, Área de Trabalho) */
  roots?: string[];
  timeZone?: string;
  /** verificação explícita de conectividade com a internet */
  checkInternet?: () => Promise<{ status: number }>;
  /** abre um arquivo no programa padrão (injetável nos testes) */
  opener?: (file: string) => Promise<void>;
}

const strip = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// ============================================================ hora e data
const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

function parseBrDate(s: string): Date | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export function timeTool(prompt: string, opts: LocalOptions = {}): LocalResult | null {
  const p = strip(prompt);
  const now = opts.now ?? new Date();
  const tz = opts.timeZone;
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { ...o, timeZone: tz }).format(now);

  if (/\bque horas? (sao|e)\b|\bhorario atual\b|\bme (diz|diga|fala|fale) as horas\b|\bhoras agora\b/.test(p)) {
    return { tool: 'hora', text: `Agora são ${fmt({ hour: '2-digit', minute: '2-digit' })} (relógio deste computador).` };
  }

  // quantos dias faltam para / passaram desde dd/mm/aaaa
  const diff = p.match(/quantos dias (faltam|passaram|se passaram|ha) (?:para|desde|de)\s+(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (diff) {
    const target = parseBrDate(diff[2]);
    if (!target) return { tool: 'data', text: `"${diff[2]}" não é uma data válida.` };
    const today = new Date(Date.UTC(
      Number(fmt({ year: 'numeric' })), Number(fmt({ month: 'numeric' })) - 1, Number(fmt({ day: 'numeric' })),
    ));
    const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
    if (days === 0) return { tool: 'data', text: 'É hoje.' };
    return {
      tool: 'data',
      text: days > 0 ? `Faltam ${days} dia(s) para ${diff[2]}.` : `Passaram-se ${-days} dia(s) desde ${diff[2]}.`,
    };
  }

  if (/\bque dia (e|eh) hoje\b|\bdata de hoje\b|\bqual (e )?a data\b|\bem que dia estamos\b|\bdia da semana\b|\bque dia da semana\b/.test(p)) {
    const wd = fmt({ weekday: 'long' });
    const rest = fmt({ day: 'numeric', month: 'long', year: 'numeric' });
    return { tool: 'data', text: `Hoje é ${wd}, ${rest}.` };
  }
  return null;
}

// ============================================================ contas
const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log10, ln: Math.log, exp: Math.exp,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'id'; v: string };

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = src.slice(i).match(/^\d*\.?\d+(?:e[+-]?\d+)?|^\d+\.?/);
      if (!m) return null;
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[a-z]/.test(c)) {
      const m = src.slice(i).match(/^[a-z]+/)!;
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === '*' && src[i + 1] === '*') { out.push({ t: 'op', v: '^' }); i += 2; continue; }
    if ('+-*/^()'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    return null;
  }
  return out;
}

class MathError extends Error {}

/** Parser descendente recursivo: nada de eval/Function. */
export function evaluateExpression(src: string): number {
  const toks = tokenize(src);
  if (!toks || toks.length === 0 || toks.length > 200) throw new MathError('Expressão inválida.');
  let pos = 0;
  let depth = 0;
  const peek = () => toks[pos];
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as any).v === v;

  const expr = (): number => {
    let v = term();
    while (isOp('+') || isOp('-')) {
      const op = (toks[pos++] as any).v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const term = (): number => {
    let v = unary();
    while (isOp('*') || isOp('/')) {
      const op = (toks[pos++] as any).v;
      const r = unary();
      if (op === '/' && r === 0) throw new MathError('Divisão por zero.');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const unary = (): number => {
    if (isOp('-')) { pos++; return -unary(); }
    if (isOp('+')) { pos++; return unary(); }
    return power();
  };
  const power = (): number => {
    const base = primary();
    if (isOp('^')) { pos++; return Math.pow(base, unary()); } // associativa à direita
    return base;
  };
  const primary = (): number => {
    if (++depth > 50) throw new MathError('Expressão aninhada demais.');
    const tk = toks[pos++];
    let v: number;
    if (!tk) throw new MathError('Expressão incompleta.');
    if (tk.t === 'num') v = tk.v;
    else if (tk.t === 'op' && tk.v === '(') {
      v = expr();
      if (!isOp(')')) throw new MathError('Faltou fechar um parêntese.');
      pos++;
    } else if (tk.t === 'id') {
      if (tk.v in CONSTS) v = CONSTS[tk.v];
      else if (tk.v in FUNCS) {
        if (!isOp('(')) throw new MathError(`Use ${tk.v}(...) com parênteses.`);
        pos++;
        const arg = expr();
        if (!isOp(')')) throw new MathError('Faltou fechar um parêntese.');
        pos++;
        if (tk.v === 'sqrt' && arg < 0) throw new MathError('Raiz quadrada de número negativo.');
        v = FUNCS[tk.v](arg);
      } else throw new MathError(`"${tk.v}" não é uma função conhecida.`);
    } else throw new MathError('Expressão inválida.');
    depth--;
    return v;
  };

  const result = expr();
  if (pos !== toks.length) throw new MathError('Expressão inválida.');
  if (!Number.isFinite(result)) throw new MathError('O resultado não é um número finito.');
  return result;
}

export function formatNumber(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return n.toLocaleString('pt-BR');
  const rounded = Number(n.toPrecision(12));
  return rounded.toLocaleString('pt-BR', { maximumFractionDigits: 10 });
}

/** Converte a escrita brasileira para a sintaxe do parser. */
function normalizeMath(raw: string): string {
  let s = strip(raw).replace(/[?=]+$/g, '').trim();
  s = s.replace(/^(quanto (e|sao|vale|da|fica)|calcule|calcula|calcular|resolva|resolve|qual (e )?o resultado (de|da)|me diga quanto (e|sao))\s+/, '');
  // separador de milhar (1.500 ou 1.234.567) e vírgula decimal
  s = s.replace(/\b([1-9]\d{0,2})((?:\.\d{3})+)(?!\d)/g, (_m, a, b) => a + b.replace(/\./g, ''));
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  s = s
    .replace(/raiz quadrada de\s+(\d+(?:\.\d+)?)/g, 'sqrt($1)')
    .replace(/ao quadrado/g, '^2').replace(/ao cubo/g, '^3')
    .replace(/elevado a/g, '^')
    .replace(/dividido por|dividido|\bdiv\b/g, '/')
    .replace(/multiplicado por|vezes/g, '*')
    .replace(/\bmais\b/g, '+').replace(/\bmenos\b/g, '-')
    .replace(/×/g, '*').replace(/÷/g, '/')
    .replace(/(\d)\s*x\s*(\d)/g, '$1*$2');
  return s.trim();
}

export function mathTool(prompt: string): LocalResult | null {
  const p = strip(prompt);

  // "15% de 230" / "15 por cento de 230"
  const pct = p.replace(/(\d),(\d)/g, '$1.$2').match(/(\d+(?:\.\d+)?)\s*(?:%|por cento)\s*de\s*(\d+(?:\.\d+)?)/);
  if (pct) {
    const r = (Number(pct[1]) / 100) * Number(pct[2]);
    return { tool: 'calculo', text: `${pct[1].replace('.', ',')}% de ${pct[2].replace('.', ',')} = ${formatNumber(r)}` };
  }

  const expr = normalizeMath(prompt);
  if (!expr || expr.length > 200) return null;
  // só aceita se SOBRAR apenas números, operadores, parênteses e nomes de função/constante
  const leftover = expr.replace(/\b(sqrt|abs|round|floor|ceil|sin|cos|tan|log|ln|exp|pi)\b|\be\b(?=\s*[^a-z]|$)/g, '');
  if (!/^[0-9+\-*/^().\s]*$/.test(leftover)) return null;
  if (!/[+\-*/^]|sqrt|abs|round|floor|ceil|sin|cos|tan|log|ln|exp/.test(expr)) return null;
  if (!/\d|\bpi\b/.test(expr)) return null;

  try {
    const v = evaluateExpression(expr);
    return { tool: 'calculo', text: `${expr.replace(/\s+/g, ' ')} = ${formatNumber(v)}` };
  } catch (e: any) {
    return { tool: 'calculo', text: `Não consegui calcular: ${e?.message || 'expressão inválida'}` };
  }
}

// ============================================================ conversão de unidades
type UnitDef = { kind: string; toBase: number; names: string[] };
const UNITS: UnitDef[] = [
  { kind: 'comprimento', toBase: 1, names: ['m', 'metro', 'metros'] },
  { kind: 'comprimento', toBase: 1000, names: ['km', 'quilometro', 'quilometros', 'kilometro', 'kilometros'] },
  { kind: 'comprimento', toBase: 0.01, names: ['cm', 'centimetro', 'centimetros'] },
  { kind: 'comprimento', toBase: 0.001, names: ['mm', 'milimetro', 'milimetros'] },
  { kind: 'comprimento', toBase: 1609.344, names: ['mi', 'milha', 'milhas'] },
  { kind: 'comprimento', toBase: 0.3048, names: ['ft', 'pe', 'pes'] },
  { kind: 'comprimento', toBase: 0.0254, names: ['in', 'polegada', 'polegadas'] },
  { kind: 'comprimento', toBase: 0.9144, names: ['jarda', 'jardas', 'yd'] },
  { kind: 'massa', toBase: 1, names: ['kg', 'quilo', 'quilos', 'quilograma', 'quilogramas'] },
  { kind: 'massa', toBase: 0.001, names: ['g', 'grama', 'gramas'] },
  { kind: 'massa', toBase: 1000, names: ['t', 'tonelada', 'toneladas'] },
  { kind: 'massa', toBase: 0.45359237, names: ['lb', 'libra', 'libras'] },
  { kind: 'massa', toBase: 0.028349523125, names: ['oz', 'onca', 'oncas'] },
  { kind: 'volume', toBase: 1, names: ['l', 'litro', 'litros'] },
  { kind: 'volume', toBase: 0.001, names: ['ml', 'mililitro', 'mililitros'] },
  { kind: 'volume', toBase: 3.785411784, names: ['gal', 'galao', 'galoes'] },
  { kind: 'dados', toBase: 1, names: ['b', 'byte', 'bytes'] },
  { kind: 'dados', toBase: 1024, names: ['kb', 'kib'] },
  { kind: 'dados', toBase: 1024 ** 2, names: ['mb', 'mib'] },
  { kind: 'dados', toBase: 1024 ** 3, names: ['gb', 'gib'] },
  { kind: 'dados', toBase: 1024 ** 4, names: ['tb', 'tib'] },
];
const TEMPS: Record<string, string> = {
  c: 'C', celsius: 'C', 'graus celsius': 'C', f: 'F', fahrenheit: 'F', 'graus fahrenheit': 'F', k: 'K', kelvin: 'K',
};

function findUnit(name: string): UnitDef | null {
  const n = strip(name).replace(/\.$/, '');
  return UNITS.find((u) => u.names.includes(n)) ?? null;
}

export function unitTool(prompt: string): LocalResult | null {
  const p = strip(prompt).replace(/(\d),(\d)/g, '$1.$2').replace(/°/g, '');
  const m = p.match(/(-?\d+(?:\.\d+)?)\s*([a-z]+(?: [a-z]+)?)\s+(?:para|em|->)\s+([a-z]+(?: [a-z]+)?)\b/);
  if (!m) return null;
  const value = Number(m[1]);

  // temperatura (aceita "graus celsius")
  const tf = TEMPS[m[2].replace(/^graus? /, '')] ?? TEMPS[m[2]];
  const tt = TEMPS[m[3].replace(/^graus? /, '')] ?? TEMPS[m[3]];
  if (tf && tt) {
    const toC = tf === 'C' ? value : tf === 'F' ? (value - 32) * (5 / 9) : value - 273.15;
    const out = tt === 'C' ? toC : tt === 'F' ? toC * (9 / 5) + 32 : toC + 273.15;
    return { tool: 'unidades', text: `${formatNumber(value)} °${tf} = ${formatNumber(out)} °${tt}` };
  }

  const from = findUnit(m[2].split(' ')[0]);
  const to = findUnit(m[3].split(' ')[0]);
  if (!from || !to) return null;
  if (from.kind !== to.kind) {
    return { tool: 'unidades', text: `Não dá para converter ${from.kind} em ${to.kind}.` };
  }
  const out = (value * from.toBase) / to.toBase;
  return { tool: 'unidades', text: `${formatNumber(value)} ${m[2].split(' ')[0]} = ${formatNumber(out)} ${m[3].split(' ')[0]}` };
}

// ============================================================ verificação de dados
export function isValidCpf(input: string): boolean {
  const d = input.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCnpj(input: string): boolean {
  const d = input.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function validateTool(prompt: string): LocalResult | null {
  const p = strip(prompt);
  if (!/\b(valid\w*|verifi\w*|confer\w*|checa\w*|e valido|esta correto)\b/.test(p) && !/\b(cpf|cnpj)\b.*\b(valido|invalido|correto)\b/.test(p)) {
    return null;
  }
  if (/\bcnpj\b/.test(p)) {
    const m = prompt.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
    if (!m) return { tool: 'validar', text: 'Não achei um CNPJ no texto. Use o formato 12.345.678/0001-95 ou só os 14 números.' };
    return { tool: 'validar', text: `CNPJ ${m[0]}: ${isValidCnpj(m[0]) ? 'dígitos verificadores corretos' : 'INVÁLIDO (dígitos verificadores não conferem)'}.\nIsto confere só a matemática do número; não consulta a Receita Federal.` };
  }
  if (/\bcpf\b/.test(p)) {
    const m = prompt.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
    if (!m) return { tool: 'validar', text: 'Não achei um CPF no texto. Use o formato 123.456.789-09 ou só os 11 números.' };
    return { tool: 'validar', text: `CPF ${m[0]}: ${isValidCpf(m[0]) ? 'dígitos verificadores corretos' : 'INVÁLIDO (dígitos verificadores não conferem)'}.\nIsto confere só a matemática do número; não diz se o CPF existe ou de quem é.` };
  }
  const em = prompt.match(/[^\s"'<>]+@[^\s"'<>]+/);
  if (em && /\be-?mail\b/.test(p)) {
    const addr = em[0].replace(/[.,;:!?)]+$/, '');
    return { tool: 'validar', text: `E-mail ${addr}: ${EMAIL_RE.test(addr) ? 'formato válido' : 'formato INVÁLIDO'}.\nConfere só o formato; não garante que a caixa exista.` };
  }
  const dt = prompt.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/);
  if (dt) {
    return { tool: 'validar', text: `Data ${dt[0]}: ${parseBrDate(dt[0]) ? 'válida' : 'INVÁLIDA (não existe no calendário)'}.` };
  }
  return null;
}

// ============================================================ estado do computador (funciona em Windows, Mac e Linux)
const gb = (n: number) => `${(n / 1073741824).toFixed(1).replace('.', ',')} GB`;

export async function systemTool(prompt: string, opts: LocalOptions = {}): Promise<LocalResult | null> {
  const p = strip(prompt);
  const lines: string[] = [];
  const mem = /\b(memoria|ram)\b/.test(p) && /\b(livre|usad[ao]|disponivel|tenho|quanta|quanto|total)\b/.test(p);
  const disk = /\b(espaco|disco|armazenamento)\b/.test(p) && /\b(livre|disponivel|sobrando|tenho|quanto|quanta|resta)\b/.test(p);
  const up = /\b(ligado|uptime|tempo ligado)\b/.test(p) && /\b(computador|pc|notebook|maquina|quanto|ha quanto)\b/.test(p);
  const cpu = /\b(processador|cpu)\b/.test(p) && /\b(qual|modelo|tenho|quantos|nucleos)\b/.test(p);
  const sys = /\b(que sistema|qual sistema|versao do windows|sistema operacional)\b/.test(p);
  const hardware = /\b(componentes?|hardware|especificacoes|configuracao)\b/.test(p) &&
    /\b(computador|pc|notebook|maquina|sistema|meu|minha)\b/.test(p);
  const internet = /\b(internet|conexao|conectividade)\b/.test(p) &&
    /\b(verifi\w*|test\w*|chec\w*|status|online|acess\w*|interag\w*|conect\w*)\b/.test(p);
  if (!mem && !disk && !up && !cpu && !sys && !hardware && !internet) return null;

  if (mem || hardware) {
    const total = os.totalmem(), free = os.freemem();
    lines.push(`Memória RAM: ${gb(free)} livres de ${gb(total)} (${Math.round(((total - free) / total) * 100)}% em uso).`);
  }
  if (disk || hardware) {
    try {
      const where = path.parse(process.cwd()).root || os.homedir();
      const st = await fs.promises.statfs(where);
      const total = st.blocks * st.bsize, free = st.bavail * st.bsize;
      lines.push(`Disco (${where}): ${gb(free)} livres de ${gb(total)}.`);
    } catch {
      lines.push('Não consegui ler o espaço em disco neste sistema.');
    }
  }
  if (up || hardware) {
    const s = Math.floor(os.uptime());
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    lines.push(`Computador ligado há ${d ? `${d} dia(s), ` : ''}${h} h e ${m} min.`);
  }
  if (cpu || hardware) {
    const c = os.cpus();
    const speed = c[0]?.speed;
    lines.push(`Processador: ${c[0]?.model?.trim() || 'desconhecido'} (${c.length} processadores lógicos${speed ? `, ${speed} MHz` : ''}).`);
  }
  if (sys || hardware) lines.push(`Sistema: ${os.type()} ${os.release()} (${os.arch()}), máquina "${os.hostname()}".`);
  if (hardware) {
    const interfaces = Object.entries(os.networkInterfaces())
      .flatMap(([name, addresses]) => (addresses ?? [])
        .filter((address) => !address.internal)
        .map((address) => `${name} (${address.family})`));
    lines.push(`Interfaces de rede ativas: ${interfaces.length ? [...new Set(interfaces)].join(', ') : 'nenhuma detectada'}.`);
    lines.push('GPU e placa-mãe: não disponíveis pela inspeção portátil do sistema.');
  }
  if (internet) {
    try {
      const check = opts.checkInternet ?? (async () => {
        const response = await fetch('https://connectivitycheck.gstatic.com/generate_204', {
          signal: AbortSignal.timeout(3000),
          redirect: 'manual',
        });
        await response.body?.cancel();
        return { status: response.status };
      });
      const { status } = await check();
      lines.push(status === 204
        ? 'Internet: conexão externa confirmada (resposta HTTP 204).'
        : status >= 200 && status < 400
          ? `Internet: o servidor de verificação respondeu HTTP ${status}; pode haver redirecionamento ou portal de acesso.`
          : `Internet: o servidor de verificação respondeu HTTP ${status}.`);
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      lines.push(timedOut
        ? 'Internet: a verificação excedeu 3 segundos; conexão lenta ou indisponível.'
        : 'Internet: não foi possível alcançar o serviço de verificação.');
    }
    lines.push('A verificação envia apenas uma solicitação vazia ao serviço do Google; não envia mensagens, arquivos ou histórico.');
    lines.push('Isto testa a conectividade do Jeremias, não monitora o tráfego de outros programas.');
  }
  return { tool: 'sistema', text: lines.join('\n') };
}

// ============================================================ arquivos (somente leitura)
export function defaultRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.JEREMIAS_FILE_ROOTS) {
    return env.JEREMIAS_FILE_ROOTS.split(path.delimiter).map((s) => s.trim()).filter(Boolean).filter((d) => fs.existsSync(d));
  }
  const home = os.homedir();
  const cands = ['Documents', 'Documentos', 'Downloads', 'Desktop', 'Área de Trabalho']
    .flatMap((n) => [path.join(home, n), path.join(home, 'OneDrive', n)]);
  return [...new Set(cands)].filter((d) => fs.existsSync(d));
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'appdata', '$recycle.bin', 'system volume information']);
const MAX_RESULTS = 15;
const MAX_DEPTH = 8;
const MAX_MS = 5000;
const MAX_VISITED = 200_000;

export interface FoundFile { path: string; size: number; mtime: Date }

export async function searchFiles(
  terms: string[],
  exts: string[],
  roots: string[],
  limits: { maxMs?: number } = {},
): Promise<{ files: FoundFile[]; truncated: boolean }> {
  const files: FoundFile[] = [];
  const deadline = Date.now() + (limits.maxMs ?? MAX_MS);
  let visited = 0;
  let truncated = false;

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (truncated || depth > MAX_DEPTH) return;
    let handle: fs.Dir;
    try { handle = await fs.promises.opendir(dir); } catch { return; }
    try {
      for await (const ent of handle) {
        if (++visited > MAX_VISITED || Date.now() > deadline) { truncated = true; return; }
        if (ent.isSymbolicLink()) continue; // nunca segue atalhos para fora das pastas permitidas
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (SKIP_DIRS.has(ent.name.toLowerCase()) || ent.name.startsWith('.')) continue;
          await walk(full, depth + 1);
        } else if (ent.isFile()) {
          const name = strip(ent.name);
          if (terms.every((t) => name.includes(t)) && (exts.length === 0 || exts.some((e) => name.endsWith(e)))) {
            try {
              const st = await fs.promises.stat(full);
              files.push({ path: full, size: st.size, mtime: st.mtime });
            } catch { /* arquivo sumiu no meio da busca */ }
          }
        }
      }
    } finally {
      await handle.close().catch(() => {});
    }
  };

  for (const r of roots) await walk(r, 0);
  files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  if (files.length > MAX_RESULTS) truncated = true;
  return { files: files.slice(0, MAX_RESULTS), truncated };
}

const EXT_HINTS: Record<string, string[]> = {
  pdf: ['.pdf'], planilha: ['.xlsx', '.xls', '.csv', '.ods'], excel: ['.xlsx', '.xls'],
  foto: ['.jpg', '.jpeg', '.png', '.heic'], imagem: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  word: ['.docx', '.doc'], apresentacao: ['.pptx', '.ppt'], zip: ['.zip'], musica: ['.mp3', '.flac', '.m4a'], video: ['.mp4', '.mkv', '.avi', '.mov'],
};
const STOP = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'meu', 'minha', 'meus', 'minhas', 'que', 'se', 'chama', 'chamado', 'chamada',
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'com', 'nome', 'por', 'favor', 'pra', 'para', 'arquivo', 'arquivos',
  'pasta', 'documento', 'documentos', 'comeca', 'contem', 'tem', 'e', 'esta', 'estao', 'onde', 'computador', 'pc',
]);

export function parseFileQuery(prompt: string): { terms: string[]; exts: string[] } | null {
  const p = strip(prompt);
  const exactFilename = prompt.trim().replace(/[?!,;:]+$/, '').trim();
  const isExactFilename = /^[^\\/:*?"<>|]+\.[a-z0-9]{2,5}$/i.test(exactFilename);
  if (!isExactFilename && !/\b(encontr\w*|procur\w*|ach[ea]\w*|busc\w*|localiz\w*|onde (esta|estao|fica))\b/.test(p)) return null;
  if (!isExactFilename && !/\b(arquivos?|pasta|documentos?|pdf|planilha|excel|foto|imagem|word|apresentacao|zip|musica|video)\b|\.\w{2,5}\b/.test(p)) return null;

  const quoted = prompt.match(/["“'‘]([^"”'’]+)["”'’]/);
  let words = quoted ? [strip(quoted[1])] : p
    .replace(/\b(encontr\w*|procur\w*|ach[ea]\w*|busc\w*|localiz\w*)\b/g, ' ')
    .replace(/[?!,;:]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));

  const exts: string[] = [];
  for (const w of [...words]) {
    if (EXT_HINTS[w]) { exts.push(...EXT_HINTS[w]); words = words.filter((x) => x !== w); }
    else if (/^\*?\.[a-z0-9]{2,5}$/.test(w)) { exts.push(w.replace('*', '')); words = words.filter((x) => x !== w); }
  }
  const terms = quoted ? words : words.map((w) => w.replace(/^\*|\*$/g, '')).filter(Boolean);
  if (terms.length === 0 && exts.length === 0) return null;
  return { terms, exts };
}

const fmtSize = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`;

export async function fileSearchTool(prompt: string, opts: LocalOptions = {}): Promise<LocalResult | null> {
  const q = parseFileQuery(prompt);
  if (!q) return null;
  const roots = opts.roots ?? defaultRoots();
  if (roots.length === 0) {
    return {
      tool: 'arquivos', touchesFiles: true,
      text: 'Nenhuma pasta autorizada para busca. Defina JEREMIAS_FILE_ROOTS no .env.local (várias pastas separadas por ";" no Windows).',
    };
  }
  const { files, truncated } = await searchFiles(q.terms, q.exts, roots);
  const what = [...q.terms, ...q.exts].join(' ');
  if (files.length === 0) {
    return { tool: 'arquivos', touchesFiles: true, text: `Nenhum arquivo encontrado para "${what}" nas pastas autorizadas:\n${roots.join('\n')}` };
  }
  const lines = files.map((f) => `• ${f.path}  (${fmtSize(f.size)}, ${f.mtime.toLocaleDateString('pt-BR')})`);
  return {
    tool: 'arquivos', touchesFiles: true,
    text: `${files.length} arquivo(s) para "${what}" (mais recentes primeiro):\n${lines.join('\n')}${truncated ? '\n(Há mais resultados ou a busca atingiu o limite; refine o nome.)' : ''}`,
  };
}

/** Resolve um caminho garantindo que ele está DENTRO de uma pasta autorizada (anti path traversal e atalhos). */
export function resolveInsideRoots(target: string, roots: string[]): string | null {
  let real: string;
  try { real = fs.realpathSync(path.resolve(target)); } catch { return null; }
  for (const r of roots) {
    let rr: string;
    try { rr = fs.realpathSync(r); } catch { continue; }
    const rel = path.relative(rr, real);
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return real;
  }
  return null;
}

export async function hashFile(file: string): Promise<{ hex: string; size: number }> {
  const st = await fs.promises.stat(file);
  if (!st.isFile()) throw new Error('Não é um arquivo.');
  if (st.size > 4 * 1024 ** 3) throw new Error('Arquivo grande demais (limite de 4 GB).');
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    fs.createReadStream(file)
      .on('data', (c) => h.update(c))
      .on('error', reject)
      .on('end', () => resolve({ hex: h.digest('hex'), size: st.size }));
  });
}

export async function hashTool(prompt: string, opts: LocalOptions = {}): Promise<LocalResult | null> {
  const p = strip(prompt);
  if (!/\b(hash|sha-?256|checksum)\b/.test(p)) return null;
  const quoted = prompt.match(/["“]([^"”]+)["”]/);
  const win = prompt.match(/[A-Za-z]:\\[^\s"“”]+/);
  const unix = prompt.match(/(?:^|\s)(\/[^\s"“”]+)/);
  const target = quoted?.[1] ?? win?.[0] ?? unix?.[1];
  if (!target) return null;
  const roots = opts.roots ?? defaultRoots();
  const safe = resolveInsideRoots(target, roots);
  if (!safe) {
    return { tool: 'hash', touchesFiles: true, text: `Não posso ler "${target}": o arquivo não existe ou está fora das pastas autorizadas.\nPastas autorizadas:\n${roots.join('\n') || '(nenhuma)'}` };
  }
  try {
    const { hex, size } = await hashFile(safe);
    return { tool: 'hash', touchesFiles: true, text: `SHA-256 de ${safe} (${fmtSize(size)}):\n${hex}` };
  } catch (e: any) {
    return { tool: 'hash', touchesFiles: true, text: `Não consegui ler o arquivo: ${e?.message || 'erro'}` };
  }
}

// ============================================================ abrir e ler arquivos
const SECRET_NAME = /^(\.env.*|id_rsa.*|id_ed25519.*|.*\.(pem|key|pfx|p12|kdbx|ovpn)|usuarios\.json|conversas\.jsonl|audit\.jsonl)$/i;
/** Tipos que podem abrir no programa padrão. Executáveis e scripts (.exe, .bat, .cmd, .ps1, .vbs, .lnk, .msi...) ficam de fora. */
const OPEN_EXTS = new Set([
  'pdf', 'doc', 'docx', 'odt', 'xls', 'xlsx', 'ods', 'csv', 'ppt', 'pptx', 'txt', 'md',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'mp3', 'wav', 'flac', 'm4a', 'mp4', 'mkv', 'mov', 'avi', 'html', 'htm',
]);
const MAX_READ = 100 * 1024;
const OPEN_STOP = new Set([
  'abra', 'abre', 'abrir', 'leia', 'ler', 'le', 'mostre', 'mostrar', 'exiba', 'exibir', 'veja', 'ver', 'conteudo', 'aberto', 'texto', 'pra', 'me',
]);

function defaultOpener(file: string): Promise<void> {
  const [cmd, args]: [string, string[]] =
    process.platform === 'win32' ? ['explorer.exe', [file]] : process.platform === 'darwin' ? ['open', [file]] : ['xdg-open', [file]];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', shell: false });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

export function parseOpenQuery(prompt: string): { mode: 'read' | 'open'; pathHint?: string; terms: string[]; exts: string[] } | null {
  const p = strip(prompt);
  const read = /\b(leia|ler|le|mostre|mostrar|exiba|exibir|veja|ver)\b/.test(p);
  const open = /\babr(a|e|ir)\b/.test(p);
  if (!read && !open) return null;
  if (/https?:/.test(p) || /\b(encontr|procur|busc|localiz)\w*/.test(p)) return null;
  const hasFileWord = /\b(arquivo|arquivos|documento|pdf|planilha|foto|imagem)\b/.test(p);
  const hasName = /[\w-]+\.[a-z0-9]{2,5}\b/.test(p);
  if (!hasFileWord && !hasName) return null;

  const quoted = prompt.match(/["“'‘]([^"”'’]+)["”'’]/)?.[1];
  const win = prompt.match(/[A-Za-z]:\\[^\s"“”]+/)?.[0];
  const unix = prompt.match(/(?:^|\s)(\/[^\s"“”]+)/)?.[1];
  const hint = [quoted, win, unix].find((h) => h && /[\\/]/.test(h));

  let words = (hint ? '' : quoted ? strip(quoted) : p)
    .replace(/[?!,;:]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w) && !OPEN_STOP.has(w));
  const exts: string[] = [];
  for (const w of [...words]) {
    if (EXT_HINTS[w]) { exts.push(...EXT_HINTS[w]); words = words.filter((x) => x !== w); }
  }
  if (!hint && words.length === 0) return null;
  return { mode: open ? 'open' : 'read', pathHint: hint, terms: quoted && !hint ? [strip(quoted)] : words, exts };
}

export async function openOrReadTool(prompt: string, opts: LocalOptions = {}): Promise<LocalResult | null> {
  const q = parseOpenQuery(prompt);
  if (!q) return null;
  const out = (text: string): LocalResult => ({ tool: q.mode === 'open' ? 'abrir' : 'ler', text, touchesFiles: true });
  const roots = opts.roots ?? defaultRoots();
  if (roots.length === 0) return out('Nenhuma pasta autorizada. Defina JEREMIAS_FILE_ROOTS no .env.local.');

  let target: string | null;
  if (q.pathHint) {
    target = resolveInsideRoots(q.pathHint, roots);
    if (!target) return out(`Não posso acessar "${q.pathHint}": não existe ou está fora das pastas autorizadas.\nPastas autorizadas:\n${roots.join('\n')}`);
  } else {
    const { files } = await searchFiles(q.terms, q.exts, roots);
    if (files.length === 0) return out(`Não achei nenhum arquivo para "${[...q.terms, ...q.exts].join(' ')}" nas pastas autorizadas.`);
    if (files.length > 1) {
      return out(`Achei ${files.length} arquivos parecidos. Diga o nome completo ou o caminho entre aspas:\n${files.slice(0, 6).map((f) => `• ${f.path}`).join('\n')}`);
    }
    target = files[0].path;
  }

  const base = path.basename(target);
  if (SECRET_NAME.test(base)) return out(`Por segurança não abro nem leio "${base}" (parece conter segredos).`);
  let st: fs.Stats;
  try { st = await fs.promises.stat(target); } catch { return out('Não consegui acessar o arquivo.'); }
  if (!st.isFile()) return out('Isso não é um arquivo.');

  if (q.mode === 'open') {
    const ext = path.extname(base).slice(1).toLowerCase();
    if (!OPEN_EXTS.has(ext)) return out(`Não abro arquivos ".${ext || 'sem extensão'}" por segurança (programas e scripts ficam de fora).`);
    try {
      await (opts.opener ?? defaultOpener)(target);
      return out(`Abri "${base}" no programa padrão do computador.\n${target}`);
    } catch (e: any) {
      return out(`Não consegui abrir o arquivo: ${e?.message || 'erro'}`);
    }
  }

  // ler: mostra o texto no chat (não vai à nuvem e não entra no histórico)
  const fh = await fs.promises.open(target, 'r');
  try {
    const buf = Buffer.alloc(Math.min(st.size, MAX_READ));
    await fh.read(buf, 0, buf.length, 0);
    if (buf.includes(0)) return out(`"${base}" parece ser binário (não é texto). Use "abra o arquivo ..." para abrir no programa padrão.`);
    const note = st.size > MAX_READ ? ` — mostrando só os primeiros ${MAX_READ / 1024} KB` : '';
    return out(`Conteúdo de ${target} (${fmtSize(st.size)})${note}:\n\n${buf.toString('utf8')}`);
  } finally {
    await fh.close();
  }
}

// ============================================================ criar arquivos (só depois da confirmação do operador)
/** Extensões permitidas na criação. Sem .js/.vbs/.bat/.ps1/.exe etc.: no Windows alguns rodam com dois cliques. */
const CREATE_EXTS_BASE = ['txt', 'md', 'csv', 'tsv', 'json', 'html', 'htm', 'css', 'xml', 'yaml', 'yml', 'log'];
const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
export const MAX_CREATE_BYTES = 200 * 1024;

export function createExts(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const extra = (env.JEREMIAS_EXTRA_EXTS || '')
    .split(/[,;\s]+/)
    .map((e) => e.replace(/^\./, '').toLowerCase())
    .filter((e) => /^[a-z0-9]{1,6}$/.test(e));
  return new Set([...CREATE_EXTS_BASE, ...extra]);
}

export function validateNewFile(name: string, content: string, env: NodeJS.ProcessEnv = process.env): { ok: true } | { ok: false; error: string } {
  if (!name || name.length > 100) return { ok: false, error: 'Nome de arquivo vazio ou longo demais (máximo 100 caracteres).' };
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(name) || name.startsWith('.') || /[. ]$/.test(name) || name.includes('..')) {
    return { ok: false, error: `Nome inválido: "${name}". Use só o nome do arquivo, sem pastas nem símbolos especiais.` };
  }
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (WIN_RESERVED.test(stem)) return { ok: false, error: `"${stem}" é um nome reservado do Windows.` };
  if (!ext || !createExts(env).has(ext)) {
    return {
      ok: false,
      error: `Não crio arquivos ".${ext || 'sem extensão'}". Permitidos: ${[...createExts(env)].join(', ')}. Scripts e programas ficam de fora por segurança; dá para liberar outros tipos com JEREMIAS_EXTRA_EXTS no .env.local.`,
    };
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_CREATE_BYTES) return { ok: false, error: `Conteúdo grande demais (limite de ${MAX_CREATE_BYTES / 1024} KB).` };
  if (content.includes('\u0000')) return { ok: false, error: 'O conteúdo tem caracteres inválidos.' };
  return { ok: true };
}

/** Pasta onde o Jeremias cria arquivos (e só ela). */
export function workDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.JEREMIAS_WORK_DIR ? path.resolve(env.JEREMIAS_WORK_DIR) : path.join(os.homedir(), 'Documents', 'Jeremias');
}

/** Grava SEM sobrescrever: se o nome existir, usa "nome (2).ext". Devolve o caminho final. */
export async function writeNewFile(dir: string, name: string, content: string): Promise<string> {
  await fs.promises.mkdir(dir, { recursive: true });
  const dot = name.lastIndexOf('.');
  const stem = name.slice(0, dot), ext = name.slice(dot);
  for (let i = 1; i <= 99; i++) {
    const candidate = path.join(dir, i === 1 ? name : `${stem} (${i})${ext}`);
    try {
      await fs.promises.writeFile(candidate, content, { encoding: 'utf8', flag: 'wx' });
      return candidate;
    } catch (e: any) {
      if (e?.code !== 'EEXIST') throw e;
    }
  }
  throw new Error('Já existem muitos arquivos com esse nome.');
}

const CONNECTOR =
  /^\s*[,.]?\s*(?:e\s+)?(?:(?:com|contendo|tendo)\b(?:\s+(?:o\s+)?(?:seguinte\s+)?(?:texto|conte[úu]do)\b)?|escrito|escrevendo|escreva(?:\s+nele)?(?:\s+o\s+texto)?|coloque(?:\s+nele)?)\s*:?\s*/iu;

/** "crie o arquivo notas.txt com o texto ..." → nome + conteúdo. Na dúvida devolve null (o pedido segue para o modelo). */
export function parseCreateRequest(prompt: string, now: Date = new Date()): { name: string; content: string } | null {
  if (!/\b(cri[ae]\w*|criar|salv[ae]\w*|escrev\w*|fa[cç]a|gere|gerar)\b/iu.test(prompt)) return null;
  const m = /\barquivo\b/i.exec(prompt);
  if (!m) return null;
  let rest = prompt.slice(m.index + m[0].length);
  const isEmpty = /^\s*vazio\b/i.test(rest);
  rest = rest.replace(/^\s*(?:vazio\s+)?(?:novo\s+)?(?:chamado\s+|com o nome\s+|de nome\s+|nome\s+)?/i, '');

  let name = '';
  const nm = rest.match(/^(?:"([^"]+)"|“([^”]+)”|([^\s"“”,:]+\.[A-Za-z0-9]{1,5}))/u);
  if (nm) { name = nm[1] ?? nm[2] ?? nm[3]; rest = rest.slice(nm[0].length); }

  let content = '';
  if (rest.trim()) {
    const cm = CONNECTOR.exec(rest);
    if (!cm || cm[0].trim() === '') return null;
    content = rest.slice(cm[0].length);
    const q = content.match(/^\s*(?:"([\s\S]*)"|“([\s\S]*)”)\s*$/u);
    content = (q ? (q[1] ?? q[2]) : content.trim()).replace(/\\n/g, '\n');
  } else if (!name && !isEmpty) {
    return null;
  }
  if (!name) {
    const z = (n: number) => String(n).padStart(2, '0');
    name = `jeremias-${now.getFullYear()}${z(now.getMonth() + 1)}${z(now.getDate())}-${z(now.getHours())}${z(now.getMinutes())}.txt`;
  }
  if (!/\.[A-Za-z0-9]{1,5}$/.test(name)) name += '.txt';
  return { name, content };
}

export function createTool(prompt: string, opts: LocalOptions = {}): LocalResult | null {
  const r = parseCreateRequest(prompt, opts.now);
  if (!r) return null;
  const v = validateNewFile(r.name, r.content);
  if (!v.ok) return { tool: 'criar', text: v.error };
  return { tool: 'criar', text: '', pendingWrite: r };
}

// ============================================================ roteador
/** Tenta resolver o pedido localmente. null = nenhuma ferramenta local reconheceu o padrão. */
export async function routeLocal(prompt: string, opts: LocalOptions = {}): Promise<LocalResult | null> {
  return (
    timeTool(prompt, opts) ??
    validateTool(prompt) ??
    (await systemTool(prompt, opts)) ??
    createTool(prompt, opts) ??
    (await openOrReadTool(prompt, opts)) ??
    (await hashTool(prompt, opts)) ??
    (await fileSearchTool(prompt, opts)) ??
    unitTool(prompt) ??
    mathTool(prompt)
  );
}

/** O pedido precisa de informação da internet ou atual? Então só a nuvem (com busca) resolve. */
export function needsWeb(prompt: string): boolean {
  const p = strip(prompt);
  return /\b(pesquis\w*|busque na (web|internet)|na internet|no google|noticias?|ultimas? (noticias|informacoes|versao|versoes)|cotacao|dolar|euro hoje|bitcoin|previsao do tempo|clima (em|de|hoje)|resultado d[oa] (jogo|partida)|quem (e|ganhou)|lancamento|preco (do|da|de)|atualmente|em 202[5-9])\b/.test(p);
}
