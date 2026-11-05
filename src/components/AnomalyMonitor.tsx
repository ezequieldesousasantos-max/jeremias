import React, { useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  Search,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { AnomalyAlert, EdgeSystemStatus } from '../lib/types.ts';

interface AnomalyMonitorProps {
  status: EdgeSystemStatus;
  alerts: AnomalyAlert[];
}

export const AnomalyMonitor: React.FC<AnomalyMonitorProps> = ({
  status,
  alerts,
}) => {
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredAlerts = alerts.filter((a) => {
    if (filterSeverity !== 'all' && a.severity !== filterSeverity) return false;
    if (
      searchTerm &&
      !a.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !a.details.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-4 space-y-6">
      {/* Header */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded bg-rose-950 border border-rose-600 text-rose-400">
              <Activity className="w-5 h-5" />
            </span>
            <h2 className="text-base font-bold text-white">
              MONITORAMENTO EM TEMPO REAL &amp; ALERTAS DE ANOMALIA
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Vigilância contínua do nó local contra desvios de integridade, picos de chamadas de sistema (syscall traps)
            e propagação de contaminação Taint.
          </p>
        </div>

      </div>

      {/* Telemetry Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono text-slate-400">Ações Bloqueadas</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {status.blockedSyscallsCount}
          </div>
          <div className="text-[10px] text-rose-400 mt-1">
            Negadas pela política
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono text-slate-400">Entidades Tainted</span>
            <AlertOctagon className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-300">
            {status.taintedEntitiesCount}
          </div>
          <div className="text-[10px] text-amber-400 mt-1">
            Entradas suspeitas/letais
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono text-slate-400">Memória Volátil Efêmera</span>
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-300">
            {status.ramVolatileUsedMb} MB
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {status.isRamVolatileWiped ? 'Status: 0x00 Wiped' : 'Volátil (Descarte Imediato)'}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono text-slate-400">Integridade Zero-Trust</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {status.chainIntegrity}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {status.auditChainLength} Blocos no Ledger SHA-256
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-lg bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-mono text-slate-400">Severidade:</span>
          {['all', 'critical', 'high', 'medium', 'low'].map((sev) => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition cursor-pointer ${
                filterSeverity === sev
                  ? 'bg-slate-700 text-white font-bold'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200'
              }`}
            >
              {sev.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar anomalias..."
            className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-rose-500"
          />
        </div>
      </div>

      {/* Alerts Feed */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-slate-900/60 border border-dashed border-slate-800 text-xs text-slate-500 font-mono">
            Nenhuma anomalia corresponde aos filtros ativos. Estado do nó nominal.
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-4 rounded-xl border text-xs font-mono space-y-2 transition shadow-lg ${
                alert.severity === 'critical'
                  ? 'bg-rose-950/40 border-rose-600 text-rose-200'
                  : alert.severity === 'high'
                  ? 'bg-amber-950/40 border-amber-600 text-amber-200'
                  : alert.severity === 'medium'
                  ? 'bg-cyan-950/40 border-cyan-700 text-cyan-200'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                      alert.severity === 'critical'
                        ? 'bg-rose-900 text-rose-100'
                        : alert.severity === 'high'
                        ? 'bg-amber-900 text-amber-100'
                        : 'bg-slate-800 text-slate-200'
                    }`}
                  >
                    {alert.severity.toUpperCase()}
                  </span>
                  <span className="font-bold text-sm text-white">{alert.title}</span>
                </div>

                <span className="text-[10px] text-slate-400">
                  {new Date(alert.timestamp).toLocaleTimeString()}
                </span>
              </div>

              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                {alert.details}
              </p>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
                <div>
                  <span className="text-slate-400">Regra de Segurança: </span>
                  <span className="text-amber-400">{alert.ruleTriggered}</span>
                </div>

                <div className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Mitigação: {alert.mitigationTaken}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
