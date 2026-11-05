import React, { useCallback, useEffect, useState } from 'react';
import { Activity, KeyRound, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';

interface ActivityEvent {
  id: number;
  timestamp: string;
  action: string;
  summary: string;
  locations: string[];
  status: 'in_progress' | 'completed';
}

interface DeveloperActivityMonitorProps {
  onClose?: () => void;
}

export const DeveloperActivityMonitor: React.FC<DeveloperActivityMonitorProps> = ({ onClose }) => {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/developer/activity');
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setUnlocked(false);
        setEvents([]);
        throw new Error('Autorização expirada. Digite novamente sua senha.');
      }
      if (!response.ok) throw new Error(data.error || `Falha ao carregar atividade (${response.status}).`);
      setEvents(Array.isArray(data.events) ? data.events as ActivityEvent[] : []);
      setUpdatedAt(new Date().toLocaleTimeString());
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a atividade.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 2500);
    return () => clearInterval(timer);
  }, [unlocked, refresh]);

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    setUnlocking(true);
    setError('');
    try {
      const response = await fetch('/api/developer/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Não foi possível desbloquear (${response.status}).`);
      setPassword('');
      setUnlocked(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao validar a senha.');
    } finally {
      setUnlocking(false);
    }
  };

  const lock = async () => {
    try {
      const response = await fetch('/api/developer/lock', { method: 'POST' });
      if (!response.ok) throw new Error(`Não foi possível bloquear o monitor (${response.status}).`);
      setUnlocked(false);
      setEvents([]);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível bloquear o monitor.');
    }
  };

  const closeWindow = async () => {
    if (unlocked) {
      try {
        const response = await fetch('/api/developer/lock', { method: 'POST' });
        if (!response.ok) throw new Error(`Não foi possível bloquear o monitor (${response.status}).`);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Não foi possível bloquear o monitor.');
        return;
      }
    }
    onClose?.();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-5">
      {!unlocked ? (
        <section className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
          <div className="mb-5 flex items-center gap-3">
            <LockKeyhole className="h-6 w-6 text-amber-300" />
            <div>
              <h2 className="text-lg font-bold text-white">Atividade de desenvolvimento</h2>
              <p className="mt-1 text-xs text-slate-400">Área experimental. Confirme a senha atual do Jeremias.</p>
            </div>
          </div>
          {onClose && <button onClick={() => void closeWindow()} className="mb-4 w-full rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-amber-700 hover:text-amber-200">Fechar janela</button>}
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
            {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
            <button type="submit" disabled={unlocking || !password} className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
              <KeyRound className="h-4 w-4" />{unlocking ? 'Validando...' : 'Desbloquear monitor'}
            </button>
          </form>
        </section>
      ) : (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-900/70 bg-slate-900 p-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-white"><Activity className="h-5 w-5 text-amber-300" />MONITOR DE ATIVIDADE — DESENVOLVIMENTO</h2>
              <p className="mt-1 text-xs text-slate-400">Etapas recentes do Jeremias, ferramentas utilizadas e caminhos locais consultados.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => void refresh()} disabled={loading} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-cyan-700 hover:text-cyan-200 disabled:opacity-50">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Atualizar
              </button>
              <button onClick={() => void lock()} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-amber-700 hover:text-amber-200">
                <LockKeyhole className="h-3.5 w-3.5" />Bloquear
              </button>
              {onClose && <button onClick={() => void closeWindow()} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-rose-700 hover:text-rose-200">Fechar janela</button>}
            </div>
          </header>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" />Somente desenvolvimento · em memória · máximo de 300 eventos</span>
            <span>{events.length} eventos · atualizado {updatedAt || 'aguardando'}</span>
          </div>

          {error && <p role="alert" className="rounded border border-rose-800 bg-rose-950/60 p-3 text-xs text-rose-200">{error}</p>}
          {events.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-400">
              Nenhuma atividade registrada nesta execução. Os prompts e o conteúdo dos arquivos não são armazenados pelo monitor.
            </div>
          ) : (
            <section className="space-y-3">
              {events.map((event) => (
                <article key={event.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-cyan-900 bg-cyan-950/70 px-2 py-0.5 text-[10px] font-mono uppercase text-cyan-200">{event.action}</span>
                      <span className={`rounded border px-2 py-0.5 text-[10px] uppercase ${event.status === 'in_progress' ? 'border-amber-800 bg-amber-950/70 text-amber-200' : 'border-emerald-900 bg-emerald-950/70 text-emerald-200'}`}>
                        {event.status === 'in_progress' ? 'Em andamento' : 'Concluído'}
                      </span>
                      <h3 className="text-sm font-semibold text-slate-100">{event.summary}</h3>
                    </div>
                    <time className="whitespace-nowrap text-[10px] font-mono text-slate-500">{new Date(event.timestamp).toLocaleString()}</time>
                  </div>
                  {event.locations.length > 0 && (
                    <div className="mt-3 space-y-1 border-t border-slate-800 pt-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Pastas e arquivos consultados</p>
                      {event.locations.map((location) => <p key={location} className="break-all text-[11px] font-mono text-slate-400">{location}</p>)}
                    </div>
                  )}
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
};
