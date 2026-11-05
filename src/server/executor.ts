import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

export interface SandboxRun {
  available: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  error?: string;
}
export type SandboxRunner = (script: string) => Promise<SandboxRun>;

export const SANDBOX_LIMITS = { cpus: '0.1', memory: '64m', pids: '32', timeoutMs: 10_000 };
const OUTPUT_CAP = 64 * 1024;

/** Argumentos do `docker run`: rede desligada, FS somente-leitura, sem capabilities, limites cgroup. */
export function buildDockerArgs(name: string, image: string, seccompProfile?: string): string[] {
  const { cpus, memory, pids } = SANDBOX_LIMITS;
  const args = [
    'run', '--rm', '-i', '--name', name,
    '--pull', 'never',
    '--network', 'none',
    '--cpus', cpus,
    '--memory', memory, '--memory-swap', memory,
    '--pids-limit', pids,
    '--read-only',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=8m',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--user', '65534:65534',
  ];
  // Sem perfil próprio, o Docker aplica o perfil seccomp padrão dele.
  if (seccompProfile) args.push('--security-opt', `seccomp=${seccompProfile}`);
  args.push(image, 'sh', '-s'); // script entra por stdin
  return args;
}

const unavailable = (error: string): SandboxRun => ({
  available: false, exitCode: null, stdout: '', stderr: '', timedOut: false, durationMs: 0, error,
});

/** Sandbox real baseado em Docker. Se o Docker não existir, devolve available:false (não finge). */
export function createDockerSandbox(opts: { image: string; seccompProfile?: string }) {
  let state: { available: boolean | null; checkedAt: number; detail: string } = {
    available: null, checkedAt: 0, detail: 'não verificado',
  };

  const refresh = (): Promise<void> =>
    new Promise((resolve) => {
      execFile('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 4000 }, (err, stdout) => {
        state = err
          ? { available: false, checkedAt: Date.now(), detail: 'Docker não encontrado ou daemon parado' }
          : { available: true, checkedAt: Date.now(), detail: `Docker ${String(stdout).trim()}` };
        resolve();
      });
    });

  const run: SandboxRunner = async (script) => {
    if (state.available === null || Date.now() - state.checkedAt > 30_000) await refresh();
    if (!state.available) return unavailable(state.detail);

    return new Promise<SandboxRun>((resolve) => {
      const name = `jeremias-sbx-${randomBytes(4).toString('hex')}`;
      const started = Date.now();
      const child = spawn('docker', buildDockerArgs(name, opts.image, opts.seccompProfile), {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const add = (cur: string, chunk: Buffer) => (cur.length < OUTPUT_CAP ? cur + chunk.toString('utf8') : cur);
      child.stdout.on('data', (c) => (stdout = add(stdout, c)));
      child.stderr.on('data', (c) => (stderr = add(stderr, c)));
      child.stdin.on('error', () => {});
      child.stdin.end(script);

      const timer = setTimeout(() => {
        timedOut = true;
        execFile('docker', ['kill', name], () => {});
        child.kill('SIGKILL');
      }, SANDBOX_LIMITS.timeoutMs);

      child.on('error', (e) => {
        clearTimeout(timer);
        resolve(unavailable(`Falha ao iniciar o docker: ${e.message}`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (/Unable to find image|No such image/i.test(stderr)) {
          return resolve(unavailable(`Imagem ausente. Rode: docker pull ${opts.image}`));
        }
        resolve({
          available: true, exitCode: code, stdout: stdout.slice(0, OUTPUT_CAP), stderr: stderr.slice(0, OUTPUT_CAP),
          timedOut, durationMs: Date.now() - started,
        });
      });
    });
  };

  return { run, refresh, info: () => ({ available: state.available === true, detail: state.detail }) };
}

export interface HostRun {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
}

/** Executa um comando JÁ aprovado pela política, sem shell, com timeout e saída limitada. */
export function runHostCommand(argv: string[]): Promise<HostRun> {
  return new Promise((resolve) => {
    execFile(
      argv[0],
      argv.slice(1),
      { timeout: 5000, maxBuffer: OUTPUT_CAP, env: { PATH: process.env.PATH }, shell: false },
      (err: any, stdout, stderr) => {
        if (err && err.code === 'ENOENT') {
          return resolve({ ok: false, exitCode: null, stdout: '', stderr: '', error: `"${argv[0]}" não existe neste sistema` });
        }
        const exitCode = err ? (typeof err.code === 'number' ? err.code : null) : 0;
        resolve({ ok: !err, exitCode, stdout: String(stdout), stderr: String(stderr), error: err && err.killed ? 'timeout' : undefined });
      }
    );
  });
}
