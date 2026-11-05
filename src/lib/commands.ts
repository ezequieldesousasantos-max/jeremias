// Comandos que o Jeremias pode executar no host SEM aprovação.
// Regras: somente leitura, sem argumentos livres, sem shell.
const SHELL_META = /[;&|`$()<>\\\n\r"'*?{}[\]~#!]/;

const ALLOWED: Record<string, readonly string[]> = {
  uname: ['-a', '-r', '-m', '-s', '-n'],
  uptime: [],
  date: [],
  hostname: [],
  whoami: [],
  df: ['-h'],
  free: ['-m', '-h'],
};

/** Quebra a linha em argv. Retorna null se houver metacaracteres de shell ou tamanho abusivo. */
export function parseCommand(input: string): string[] | null {
  const s = (input || '').trim();
  if (!s || s.length > 200 || SHELL_META.test(s)) return null;
  return s.split(/\s+/);
}

export function isAllowlisted(argv: string[] | null): boolean {
  if (!argv || argv.length === 0) return false;
  const [cmd, ...args] = argv;
  const flags = ALLOWED[cmd];
  if (!flags) return false;
  return args.every((a) => flags.includes(a)) && new Set(args).size === args.length;
}

export const ALLOWLIST_HELP = Object.entries(ALLOWED)
  .map(([c, f]) => (f.length ? `${c} [${f.join('|')}]` : c))
  .join(', ');
