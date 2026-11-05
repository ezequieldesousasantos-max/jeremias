import React, { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Cpu, FolderSearch, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';

interface DeveloperOverview {
  mode: string;
  nodeVersion: string;
  platform: string;
  architecture: string;
  uptimeSeconds: number;
  roots: string[];
  sandbox: { available: boolean; detail: string };
  system: {
    auditChainLength: number;
    chainIntegrity: string;
    pendingApprovals: number;
  };
}

interface FileScanFinding {
  id: string;
  file: string;
  line: number;
  severity: 'medium' | 'high';
  rule: string;
  title: string;
}

interface FileScanResult {
  roots: string[];
  findings: FileScanFinding[];
  summary: {
    filesScanned: number;
    filesSkipped: number;
    truncated: boolean;
    durationMs: number;
  };
}

interface DeveloperPanelProps {
  onNavigate: (tab: 'accesses' | 'audit' | 'components') => void;
}

export const DeveloperPanel: React.FC<DeveloperPanelProps> = ({ onNavigate }) => {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [overview, setOverview] = useState<DeveloperOverview | null>(null);
  const [overviewError, setOverviewError] = useState('');
  const [scan, setScan] = useState<FileScanResult | null>(null);
  const [scanError, setScanError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [auditResult, setAuditResult] = useState<{ valid: boolean; tamperedIndex?: number; reason?: string } | null>(null);
  const [auditError, setAuditError] = useState('');
  const [checkingAudit, setCheckingAudit] = useState(false);

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    setUnlocking(true);
    setUnlockError('');
    try {
      const response = await fetch('/api/developer/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Não foi possível desbloquear (${response.status}).`);
      setUnlocked(true);
      setPassword('');
    } catch (reason) {
      setUnlockError(reason instanceof Error ? reason.message : 'Falha ao validar a senha.');
    } finally {
      setUnlocking(false);
    }
  };

  const lock = async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/developer/lock', { method: 'POST' });
      if (!response.ok) throw new Error(`Não foi possível bloquear a aba (${response.status}).`);
      setUnlocked(false);
      setOverview(null);
      setScan(null);
      setAuditResult(null);
      return true;
    } catch (reason) {
      setOverviewError(reason instanceof Error ? reason.message : 'Falha ao bloquear a aba de desenvolvedor.');
      return false;
    }
  };

  const leaveFor = async (tab: 'accesses' | 'audit' | 'components') => {
    if (await lock()) onNavigate(tab);
  };

  useEffect(() => {
    if (!unlocked) return;
    let active = true;
    const loadOverview = async () => {
      try {
        const response = await fetch('/api/developer/overview');
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) {
          if (active) {
            setUnlocked(false);
            setUnlockError('A autorização expirou. Digite novamente sua senha.');
          }
          return;
        }
        if (!response.ok) throw new Error(data.error || `Falha ao carregar o diagnóstico (${response.status}).`);
        if (active) {
          setOverview(data as DeveloperOverview);
          setOverviewError('');
        }
      } catch (reason) {
        if (active) setOverviewError(reason instanceof Error ? reason.message : 'Falha ao carregar os diagnósticos.');
      }
    };
    void loadOverview();
    const timer = setInterval(() => void loadOverview(), 10_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [unlocked]);

  const startScan = async () => {
    setScanning(true);
    setScanError('');
    try {
      const response = await fetch('/api/developer/scan', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setUnlocked(false);
        throw new Error('A autorização expirou. Digite novamente sua senha.');
      }
      if (!response.ok) throw new Error(data.error || `A varredura falhou (${response.status}).`);
      setScan(data as FileScanResult);
    } catch (reason) {
      setScanError(reason instanceof Error ? reason.message : 'Não foi possível concluir a varredura.');
    } finally {
      setScanning(false);
    }
  };

  const verifyAudit = async () => {
    setCheckingAudit(true);
    setAuditError('');
    try {
      const response = await fetch('/api/developer/audit/verify', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setUnlocked(false);
        throw new Error('A autorização expirou. Digite novamente sua senha.');
      }
      if (!response.ok) throw new Error(data.error || `Falha ao verificar o ledger (${response.status}).`);
      setAuditResult(data as { valid: boolean; tamperedIndex?: number; reason?: string });
    } catch (reason) {
      setAuditError(reason instanceof Error ? reason.message : 'Não foi possível verificar o ledger.');
    } finally {
      setCheckingAudit(false);
    }
  };

  const card = 'rounded-xl border border-slate-800 bg-slate-900 p-4';

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-5">
      {!unlocked ? (
        <section className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
          <div className="mb-5 flex items-center gap-3">
            <LockKeyhole className="h-6 w-6 text-amber-300" />
            <div>
              <h2 className="text-lg font-bold text-white">Área do desenvolvedor</h2>
              <p className="mt-1 text-xs text-slate-400">Confirme sua senha atual do Jeremias para abrir as ferramentas.</p>
            </div>
          </div>
          <form onSubmit={unlock} className="space-y-4">
            <label className="block text-sm text-slate-300">
              Senha atual
              <input
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-amber-500"
              />
            </label>
            {unlockError && <p role="alert" className="text-sm text-rose-300">{unlockError}</p>}
            <button type="submit" disabled={unlocking || !password} className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
              <KeyRound className="h-4 w-4" />{unlocking ? 'Validando...' : 'Desbloquear'}
            </button>
          </form>
        </section>
      ) : (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div>
              <h2 className="text-base font-bold text-white">PAINEL DO DESENVOLVEDOR</h2>
              <p className="mt-1 text-xs text-slate-400">Diagnósticos locais, varredura somente leitura e estado dos controles de segurança.</p>
            </div>
            <button onClick={() => void lock()} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-amber-600 hover:text-amber-200">
              <LockKeyhole className="h-4 w-4" />Bloquear área
            </button>
          </header>

          {overviewError && <p role="alert" className="rounded border border-rose-800 bg-rose-950/60 p-3 text-xs text-rose-200">{overviewError}</p>}
          {overview && (
            <>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <article className={card}><p className="text-xs text-slate-400">Execução</p><p className="mt-2 text-sm font-semibold text-white">{overview.mode}</p><p className="mt-1 text-[11px] text-slate-500">{overview.nodeVersion} · {overview.platform} {overview.architecture}</p></article>
                <article className={card}><p className="text-xs text-slate-400">Servidor ativo</p><p className="mt-2 text-sm font-semibold text-emerald-300">{Math.floor(overview.uptimeSeconds / 60)} min</p><p className="mt-1 text-[11px] text-slate-500">Tempo de execução desta instância</p></article>
                <article className={card}><p className="text-xs text-slate-400">Integridade do ledger</p><p className={`mt-2 text-sm font-semibold ${overview.system.chainIntegrity === 'VERIFIED' ? 'text-emerald-300' : 'text-rose-300'}`}>{overview.system.chainIntegrity}</p><p className="mt-1 text-[11px] text-slate-500">{overview.system.auditChainLength} blocos · {overview.system.pendingApprovals} aprovações pendentes</p></article>
                <article className={card}><p className="text-xs text-slate-400">Sandbox Docker</p><p className={`mt-2 text-sm font-semibold ${overview.sandbox.available ? 'text-emerald-300' : 'text-amber-300'}`}>{overview.sandbox.available ? 'Disponível' : 'Indisponível'}</p><p className="mt-1 text-[11px] text-slate-500">{overview.sandbox.detail}</p></article>
              </section>

              <section className={`${card} space-y-2`}>
                <h3 className="text-sm font-bold text-slate-200">Pastas autorizadas para análise</h3>
                {overview.roots.length ? overview.roots.map((root) => <p key={root} className="break-all rounded bg-slate-950 px-3 py-2 text-xs font-mono text-slate-300">{root}</p>) : <p className="text-xs text-amber-300">Nenhuma pasta autorizada foi encontrada.</p>}
              </section>
            </>
          )}

          <section className={`${card} space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-200"><FolderSearch className="h-4 w-4 text-cyan-300" />Varredura de segurança dos arquivos</h3>
                <p className="mt-1 text-[11px] text-slate-400">Leitura local somente; não executa, modifica ou envia arquivos. Ignora segredos e pastas ocultas.</p>
              </div>
              <button type="button" onClick={() => void startScan()} disabled={scanning} className="rounded-lg border border-cyan-700 bg-cyan-950 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-900 disabled:opacity-50">
                {scanning ? 'Analisando arquivos...' : 'Iniciar varredura'}
              </button>
            </div>
            {scanError && <p role="alert" className="text-xs text-rose-300">{scanError}</p>}
            {scan && (
              <>
                <div className="flex flex-wrap gap-4 border-y border-slate-800 py-2 text-[11px] text-slate-300">
                  <span>{scan.summary.filesScanned} arquivos analisados</span><span>{scan.findings.length} itens para revisão</span><span>{scan.summary.filesSkipped} ignorados</span><span>{(scan.summary.durationMs / 1000).toFixed(1)} s</span>
                  {scan.summary.truncated && <strong className="text-amber-300">Resultado incompleto: limite atingido</strong>}
                </div>
                {scan.findings.length === 0 ? (
                  <p className="rounded border border-emerald-900 bg-emerald-950/30 p-3 text-xs text-emerald-200">Nenhum padrão configurado foi encontrado. Isso não garante ausência de vulnerabilidades.</p>
                ) : scan.findings.map((finding) => (
                  <article key={finding.id} className={`rounded border p-3 ${finding.severity === 'high' ? 'border-rose-800 bg-rose-950/30' : 'border-amber-800 bg-amber-950/30'}`}>
                    <div className="flex flex-wrap justify-between gap-2"><strong className="text-xs text-white">{finding.title}</strong><span className="text-[10px] uppercase text-slate-400">{finding.severity} · linha {finding.line}</span></div>
                    <p className="mt-1 break-all text-[11px] font-mono text-slate-400">{finding.file}</p>
                    <p className="mt-1 text-[10px] text-slate-500">Indício para revisão manual; não confirma uma vulnerabilidade.</p>
                  </article>
                ))}
              </>
            )}
          </section>

          <section className={`${card} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-200"><ShieldCheck className="h-4 w-4 text-emerald-300" />Verificação criptográfica</h3>
              <p className="mt-1 text-[11px] text-slate-400">{auditResult ? auditResult.valid ? 'Cadeia de auditoria válida.' : `Falha no bloco ${auditResult.tamperedIndex ?? 'desconhecido'}: ${auditResult.reason || 'divergência detectada'}` : 'Recalcula a integridade da cadeia do ledger sem modificá-la.'}</p>
              {auditError && <p role="alert" className="mt-1 text-xs text-rose-300">{auditError}</p>}
            </div>
            <button type="button" onClick={() => void verifyAudit()} disabled={checkingAudit} className="rounded-lg border border-emerald-800 bg-emerald-950 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-900 disabled:opacity-50">
              {checkingAudit ? 'Verificando...' : 'Verificar ledger'}
            </button>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <button onClick={() => void leaveFor('accesses')} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-4 text-left text-sm text-slate-200 hover:border-cyan-800"><Activity className="h-4 w-4 text-cyan-300" />Monitor de acessos</button>
            <button onClick={() => void leaveFor('audit')} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-4 text-left text-sm text-slate-200 hover:border-indigo-800"><ShieldCheck className="h-4 w-4 text-indigo-300" />Registro de segurança</button>
            <button onClick={() => void leaveFor('components')} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-4 text-left text-sm text-slate-200 hover:border-emerald-800"><Cpu className="h-4 w-4 text-emerald-300" />Componentes do computador</button>
          </section>
          <p className="flex items-start gap-2 text-[11px] text-slate-500"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />A autorização desta área expira após 15 minutos. Os diagnósticos não exibem valores de variáveis de ambiente nem conteúdo das linhas analisadas.</p>
        </>
      )}
    </div>
  );
};
