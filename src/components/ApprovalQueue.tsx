import React, { useState } from 'react';
import { CheckCircle2, XCircle, KeyRound } from 'lucide-react';
import type { PendingApproval } from '../lib/types.ts';

interface ApprovalQueueProps {
  approvals: PendingApproval[];
  onResolve: (id: string, decision: 'approve' | 'deny') => Promise<void>;
}

export const ApprovalQueue: React.FC<ApprovalQueueProps> = ({ approvals, onResolve }) => {
  const [busyId, setBusyId] = useState<string | null>(null);

  const resolve = async (id: string, decision: 'approve' | 'deny') => {
    setBusyId(id);
    try {
      await onResolve(id, decision);
    } finally {
      setBusyId(null);
    }
  };

  const pending = approvals.filter((a) => a.status === 'pending');
  const history = approvals.filter((a) => a.status !== 'pending').slice(0, 5);

  return (
    <div className="p-4 rounded-xl bg-slate-900/90 border border-amber-700/60 shadow-xl space-y-3">
      <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-amber-400" />
        Fila de Aprovação Humana
        <span className="text-[10px] font-mono text-slate-400">
          ({pending.length} pendente{pending.length === 1 ? '' : 's'})
        </span>
      </h3>
      <p className="text-[11px] text-slate-400">
        Comandos digitados com <span className="font-mono text-amber-300">!</span> no console que não estão na lista
        permitida chegam aqui. Aprovar executa o comando <b>somente no sandbox</b> (Docker), nunca no host.
      </p>

      {pending.length === 0 && (
        <div className="p-3 text-center rounded-lg bg-slate-950/60 border border-dashed border-slate-800 text-xs text-slate-500 font-mono">
          Nenhum pedido aguardando decisão.
        </div>
      )}

      {pending.map((a) => (
        <div key={a.id} className="p-3 rounded-lg bg-slate-950 border border-amber-800/70 space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between gap-2">
            <span className="text-amber-400 font-bold">{a.id}</span>
            <span className="text-[10px] text-slate-400">{new Date(a.createdAt).toLocaleTimeString()}</span>
          </div>
          <div className="text-slate-100 break-all">$ {a.command}</div>
          <div className="text-[10px] text-slate-400">Política: {a.policyId}</div>
          <div className="flex gap-2 pt-1">
            <button
              disabled={busyId === a.id}
              onClick={() => resolve(a.id, 'approve')}
              className="flex-1 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold transition cursor-pointer disabled:opacity-50"
            >
              {busyId === a.id ? 'Executando no sandbox...' : 'Aprovar (rodar no sandbox)'}
            </button>
            <button
              disabled={busyId === a.id}
              onClick={() => resolve(a.id, 'deny')}
              className="px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer disabled:opacity-50"
            >
              Negar
            </button>
          </div>
        </div>
      ))}

      {history.length > 0 && (
        <div className="pt-2 border-t border-slate-800 space-y-1">
          <div className="text-[10px] font-mono text-slate-400">Decisões recentes:</div>
          {history.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-[11px] font-mono text-slate-300">
              {a.status === 'executed' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              )}
              <span className="text-slate-400">{a.id}</span>
              <span className="truncate">{a.command}</span>
              <span className="ml-auto text-slate-400">{a.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
