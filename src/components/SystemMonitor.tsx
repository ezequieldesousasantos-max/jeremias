import React, { useCallback, useEffect, useState } from 'react';
import { Activity, CheckCircle2, Cpu, HardDrive, MemoryStick, Network, RefreshCw, ShieldAlert, Wifi, WifiOff } from 'lucide-react';
import type { SystemMonitorSnapshot } from '../server/systemMonitor.ts';

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${bytes.toLocaleString('pt-BR')} B`;
}

function UsageBar({ value, color }: { value: number | null; color: string }) {
  const shown = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${shown}%` }} />
    </div>
  );
}

export const SystemMonitor: React.FC = () => {
  const [snapshot, setSnapshot] = useState<SystemMonitorSnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/system/components', { signal });
      if (response.status === 401) throw new Error('Sessão encerrada. Entre novamente.');
      if (!response.ok) throw new Error(`O monitor respondeu HTTP ${response.status}.`);
      setSnapshot(await response.json());
      setError('');
    } catch (reason) {
      if (reason instanceof Error && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : 'Falha ao consultar o monitor.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = setInterval(() => void refresh(controller.signal), 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refresh]);

  const card = 'rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg';
  const online = snapshot?.internet.connected;

  return (
    <section className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-5">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white">Componentes em funcionamento</h2>
          </div>
          <p className="mt-1 text-sm text-slate-400">Medições locais atualizadas a cada 5 segundos.</p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300 transition hover:border-emerald-700 hover:text-emerald-300 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </header>

      {error && <div role="alert" className="rounded-lg border border-rose-800 bg-rose-950/50 p-3 text-sm text-rose-300">{error}</div>}
      {!snapshot && !error && <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">Coletando medições do computador...</div>}

      {snapshot && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className={card}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Processador</span>
                <Cpu className="h-5 w-5 text-cyan-400" />
              </div>
              <p className="mt-3 font-semibold text-white">{snapshot.cpu.model}</p>
              <p className="mt-1 text-xs text-slate-400">
                {snapshot.cpu.logicalCores} núcleos lógicos{snapshot.cpu.speedMhz ? ` · ${snapshot.cpu.speedMhz} MHz` : ''}
              </p>
              <div className="mt-4 flex justify-between text-xs text-slate-400">
                <span>Uso atual</span><strong className="text-cyan-300">{snapshot.cpu.usagePercent === null ? 'Medindo…' : `${snapshot.cpu.usagePercent}%`}</strong>
              </div>
              <div className="mt-2"><UsageBar value={snapshot.cpu.usagePercent} color="bg-cyan-400" /></div>
            </article>

            <article className={card}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Memória RAM</span>
                <MemoryStick className="h-5 w-5 text-violet-400" />
              </div>
              <p className="mt-3 text-2xl font-bold text-white">{snapshot.memory.usagePercent}%</p>
              <p className="mt-1 text-xs text-slate-400">{formatBytes(snapshot.memory.usedBytes)} usados de {formatBytes(snapshot.memory.totalBytes)}</p>
              <div className="mt-4"><UsageBar value={snapshot.memory.usagePercent} color="bg-violet-400" /></div>
              <p className="mt-2 text-xs text-slate-400">{formatBytes(snapshot.memory.freeBytes)} disponíveis</p>
            </article>

            <article className={card}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Armazenamento</span>
                <HardDrive className="h-5 w-5 text-amber-400" />
              </div>
              {'error' in snapshot.storage ? (
                <p className="mt-3 text-sm text-amber-300">{snapshot.storage.error}</p>
              ) : (
                <>
                  <p className="mt-3 text-2xl font-bold text-white">{snapshot.storage.usagePercent}%</p>
                  <p className="mt-1 text-xs text-slate-400">Unidade {snapshot.storage.path}</p>
                  <div className="mt-4"><UsageBar value={snapshot.storage.usagePercent} color="bg-amber-400" /></div>
                  <p className="mt-2 text-xs text-slate-400">{formatBytes(snapshot.storage.freeBytes)} livres de {formatBytes(snapshot.storage.totalBytes)}</p>
                </>
              )}
            </article>

            <article className={`${card} ${online ? 'border-emerald-900' : 'border-rose-900'}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Conexão com a internet</span>
                {online ? <Wifi className="h-5 w-5 text-emerald-400" /> : <WifiOff className="h-5 w-5 text-rose-400" />}
              </div>
              <p className={`mt-3 text-xl font-bold ${online ? 'text-emerald-300' : 'text-rose-300'}`}>
                {online ? 'Conectado' : 'Sem conexão confirmada'}
              </p>
              <p className="mt-1 text-xs text-slate-400">{snapshot.internet.detail}</p>
              {snapshot.internet.latencyMs !== null && <p className="mt-3 text-sm text-slate-300">Resposta externa: {snapshot.internet.latencyMs} ms</p>}
              <p className="mt-2 text-[11px] text-slate-500">Teste de conectividade do Jeremias; não monitora outros aplicativos.</p>
            </article>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <article className={card}>
              <div className="flex items-center gap-2">
                <Network className="h-5 w-5 text-emerald-400" />
                <h3 className="font-semibold text-white">Interfaces de rede ativas</h3>
              </div>
              {snapshot.network.interfaces.length ? (
                <ul className="mt-4 space-y-2">
                  {snapshot.network.interfaces.map((network) => (
                    <li key={network.name} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                      <span className="text-sm text-slate-200">{network.name}</span>
                      <span className="text-xs text-slate-400">{network.addresses.join(', ')}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-4 text-sm text-slate-400">Nenhuma interface externa detectada.</p>}
              <p className="mt-3 text-xs text-slate-500">O sistema informa interfaces disponíveis, não o tráfego de cada uma.</p>
            </article>

            <article className={card}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-cyan-400" />
                <h3 className="font-semibold text-white">Como o Jeremias usa a rede</h3>
              </div>
              <ol className="mt-4 space-y-3 text-sm text-slate-300">
                <li><span className="font-semibold text-emerald-300">1. Este monitor</span> envia uma verificação vazia de conectividade; nenhum prompt ou arquivo é transmitido.</li>
                <li><span className="font-semibold text-cyan-300">2. Ollama</span> responde localmente, quando disponível e selecionado pelo roteador.</li>
                <li><span className="font-semibold text-amber-300">3. Gemini</span> só recebe o prompt atual quando o modo ou a confirmação permitir; o histórico e os arquivos não são enviados.</li>
              </ol>
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-400">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                O Jeremias não captura nem inspeciona o tráfego de outros programas do computador.
              </div>
            </article>
          </div>

          <p className="text-right text-xs text-slate-500">
            Sistema: {snapshot.sampledAt ? new Date(snapshot.sampledAt).toLocaleTimeString() : '—'} · GPU e placa-mãe não são expostas pela inspeção portátil atual.
          </p>
        </>
      )}
    </section>
  );
};
