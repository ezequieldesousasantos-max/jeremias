import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';

interface AccessEvent {
  id: number;
  timestamp: string;
  method: string;
  path: string;
  status: number;
}

interface AccessAlert {
  id: string;
  timestamp: string;
  severity: 'medium' | 'high';
  title: string;
  details: string;
  rule: string;
}

interface AccessSnapshot {
  events: AccessEvent[];
  alerts: AccessAlert[];
}

export const AccessMonitor: React.FC = () => {
  const [snapshot, setSnapshot] = useState<AccessSnapshot>({ events: [], alerts: [] });
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch('/api/security/access-log');
        if (!response.ok) throw new Error(`Não foi possível carregar o monitor (${response.status}).`);
        const data = await response.json() as AccessSnapshot;
        if (active) {
          setSnapshot(data);
          setUpdatedAt(new Date().toLocaleTimeString());
          setError('');
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Falha ao carregar o monitor de acessos.');
      }
    };

    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const deniedCount = snapshot.events.filter((event) => event.status === 401 || event.status === 403 || event.status === 429).length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-4 space-y-5">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="rounded-lg border border-cyan-700 bg-cyan-950 p-2 text-cyan-300"><Activity className="h-5 w-5" /></span>
            <div>
              <h2 className="text-base font-bold text-white">ACESSOS &amp; IRREGULARIDADES</h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
                Monitora passivamente eventos da API local e alerta sobre padrões incomuns de acesso.
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-300"><RefreshCw className="h-3.5 w-3.5" /> Atualização a cada 5 s</span>
        </div>
        {error && <p role="alert" className="mt-3 rounded border border-rose-800 bg-rose-950/60 p-2 text-xs text-rose-200">{error}</p>}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-400">Eventos recentes</p>
          <p className="mt-1 font-mono text-2xl font-bold text-white">{snapshot.events.length}</p>
          <p className="text-[11px] text-slate-500">Últimos 500 acessos desta execução</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-400">Acessos negados</p>
          <p className="mt-1 font-mono text-2xl font-bold text-amber-300">{deniedCount}</p>
          <p className="text-[11px] text-slate-500">HTTP 401, 403 ou 429 no histórico visível</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-400">Alertas gerados</p>
          <p className={`mt-1 font-mono text-2xl font-bold ${snapshot.alerts.length ? 'text-rose-300' : 'text-emerald-300'}`}>{snapshot.alerts.length}</p>
          <p className="text-[11px] text-slate-500">Atualizado {updatedAt || 'aguardando dados'}</p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-200"><AlertTriangle className="h-4 w-4 text-amber-400" />Análise automática</h3>
        {snapshot.alerts.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-900 bg-emerald-950/30 p-4 text-xs text-emerald-200">
            <ShieldCheck className="h-4 w-4 shrink-0" />Nenhuma irregularidade detectada pelas regras passivas desde que o servidor iniciou.
          </div>
        ) : snapshot.alerts.map((alert) => (
          <article key={alert.id} className={`rounded-xl border p-4 ${alert.severity === 'high' ? 'border-rose-800 bg-rose-950/30' : 'border-amber-800 bg-amber-950/30'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-white">{alert.title}</h4>
              <span className="text-[10px] font-mono text-slate-400">{new Date(alert.timestamp).toLocaleString()}</span>
            </div>
            <p className="mt-1 text-xs text-slate-300">{alert.details}</p>
            <p className="mt-2 text-[10px] font-mono text-slate-500">Regra: {alert.rule}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-200">Registro de acessos à API</h3>
          <span className="text-[10px] text-slate-500">Dados em memória; reiniciar o servidor limpa o histórico.</span>
        </div>
        <div className="max-h-[460px] overflow-auto">
          {snapshot.events.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-500">Nenhum evento registrado nesta execução.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-950 text-[10px] uppercase text-slate-500">
                <tr><th className="px-4 py-2">Horário</th><th className="px-4 py-2">Método</th><th className="px-4 py-2">Rota</th><th className="px-4 py-2">Status</th></tr>
              </thead>
              <tbody>
                {snapshot.events.map((event) => (
                  <tr key={event.id} className="border-t border-slate-800/80">
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-slate-400">{new Date(event.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-2 font-mono text-cyan-300">{event.method}</td>
                    <td className="max-w-[360px] truncate px-4 py-2 font-mono text-slate-300" title={event.path}>{event.path}</td>
                    <td className={`px-4 py-2 font-mono font-bold ${event.status >= 500 || event.status === 401 || event.status === 403 || event.status === 429 ? 'text-rose-300' : event.status >= 400 ? 'text-amber-300' : 'text-emerald-300'}`}>{event.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
};
