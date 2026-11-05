import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Layers,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
} from 'lucide-react';
import { DEFAULT_SECURITY_POLICIES } from '../lib/policyEngine.ts';
import { PendingApproval, PolicyEvaluationResult, SystemActionType } from '../lib/types.ts';
import { ApprovalQueue } from './ApprovalQueue.tsx';

interface ZeroTrustPolicyBarrierProps {
  onEvaluatePolicy: (params: {
    action: SystemActionType;
    target?: string;
    payload?: string;
    networkDestination?: string;
  }) => Promise<PolicyEvaluationResult>;
  approvals: PendingApproval[];
  onResolveApproval: (id: string, decision: 'approve' | 'deny') => Promise<void>;
}

export const ZeroTrustPolicyBarrier: React.FC<ZeroTrustPolicyBarrierProps> = ({
  onEvaluatePolicy,
  approvals,
  onResolveApproval,
}) => {
  const [selectedAction, setSelectedAction] = useState<SystemActionType>('NETWORK_OUTBOUND');
  const [targetInput, setTargetInput] = useState('https://api.external-cloud.net/v1/sync');
  const [payloadInput, setPayloadInput] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [lastResult, setLastResult] = useState<PolicyEvaluationResult | null>(null);


  const handleSimulate = async () => {
    setIsEvaluating(true);
    try {
      const res = await onEvaluatePolicy({
        action: selectedAction,
        target: targetInput,
        payload: payloadInput,
        networkDestination: selectedAction === 'NETWORK_OUTBOUND' ? targetInput : undefined,
      });
      setLastResult(res);
    } finally {
      setIsEvaluating(false);
    }
  };

  const presets = [
    {
      name: 'Saída de Rede Não Autorizada',
      action: 'NETWORK_OUTBOUND' as SystemActionType,
      target: 'https://exfiltrate-data.shadow-net.io/upload',
      payload: 'POST /upload secret_token=x492',
    },
    {
      name: 'Sobrescrita em Arquivo de Sistema Host',
      action: 'WRITE_FILE_HOST' as SystemActionType,
      target: '/etc/cron.d/malicious_job',
      payload: '* * * * * root /bin/sh /tmp/run.sh',
    },
    {
      name: 'Escrita em Memória Efêmera RAM (Permitida)',
      action: 'WRITE_FILE_HOST' as SystemActionType,
      target: '/tmp/jeremias_ephemeral/scratchpad.txt',
      payload: 'Log transitório para descarte volátil',
    },
    {
      name: 'Comando Destrutivo de Disco',
      action: 'EXEC_SHELL' as SystemActionType,
      target: '/dev/nvme0n1',
      payload: 'dd if=/dev/zero of=/dev/nvme0n1 bs=1M',
    },
    {
      name: 'Diagnóstico Local Seguro',
      action: 'READ_LOCAL_DIAGNOSTICS' as SystemActionType,
      target: 'proc_meminfo',
      payload: 'free -m && cat /proc/cgroups',
    },
    {
      name: 'Purga Volátil de Memória (Soberania)',
      action: 'PURGE_RAM' as SystemActionType,
      target: 'volatile_buffer',
      payload: '0x00 memory zeroing',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-4 space-y-6">
      {/* Title & Philosophy Banner */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded bg-amber-950 border border-amber-600 text-amber-400">
              <Layers className="w-5 h-5" />
            </span>
            <h2 className="text-base font-bold text-white">
              2º PILAR: MOTOR DE POLÍTICAS (POLICY-AS-CODE / OPA)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Zero-Trust estrito: Nenhuma ação com impacto no sistema operacional é assumida como autorizada.
            O motor de políticas avalia as regras e exige autenticação humana para operações de risco.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-400">
            MOTOR: POLICY-AS-CODE (TYPESCRIPT)
          </span>
          <span className="px-3 py-1 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
            {DEFAULT_SECURITY_POLICIES.length} REGRAS ATIVAS
          </span>
        </div>
      </div>

      <ApprovalQueue approvals={approvals} onResolve={onResolveApproval} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Policy Simulator */}
        <div className="lg:col-span-6 space-y-4">
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
              <KeyRound className="w-4 h-4 text-amber-400" />
              Simulador de Políticas (dry-run: avalia e registra, não executa nada)
            </h3>

            {/* Presets */}
            <div className="mb-4">
              <div className="text-[11px] font-mono text-slate-400 mb-1.5">
                Cenários Rápidos de Teste:
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {presets.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setSelectedAction(p.action);
                      setTargetInput(p.target);
                      setPayloadInput(p.payload);
                      setLastResult(null);
                    }}
                    className="p-2 text-left rounded bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-[11px] text-slate-300 transition cursor-pointer"
                  >
                    <div className="font-semibold text-slate-200">{p.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono truncate">{p.action}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Action Type */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Tipo de Ação Solicitada (SystemActionType):
                </label>
                <select
                  value={selectedAction}
                  onChange={(e) => setSelectedAction(e.target.value as SystemActionType)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="NETWORK_OUTBOUND">NETWORK_OUTBOUND (Saída de Rede Externa)</option>
                  <option value="EXEC_SHELL">EXEC_SHELL (Execução de Shell Script/Binário)</option>
                  <option value="WRITE_FILE_HOST">WRITE_FILE_HOST (Escrita no Sistema de Arquivos Host)</option>
                  <option value="PURGE_RAM">PURGE_RAM (Purga de Memória Volátil / Soberania)</option>
                  <option value="READ_LOCAL_DIAGNOSTICS">READ_LOCAL_DIAGNOSTICS (Diagnóstico Local)</option>
                  <option value="SPAWN_MICROVM">SPAWN_MICROVM (Instanciação de MicroVM Efêmera)</option>
                </select>
              </div>

              {/* Target */}
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Alvo / Recurso (Target / URL / Caminho):
                </label>
                <input
                  type="text"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  placeholder="Ex: /etc/shadow ou https://api.exemplo.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Payload */}
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Carga Útil / Argumentos (Payload):
                </label>
                <textarea
                  rows={3}
                  value={payloadInput}
                  onChange={(e) => setPayloadInput(e.target.value)}
                  placeholder="Instruções ou comandos a serem inspecionados..."
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <button
                onClick={handleSimulate}
                disabled={isEvaluating}
                className="w-full py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                <span>{isEvaluating ? 'Avaliando contra catálogo OPA...' : 'Submeter ao Motor de Políticas (OPA)'}</span>
              </button>
            </div>

            {/* Evaluation Result Output */}
            {lastResult && (
              <div className="mt-4 p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Decisão OPA:</span>
                  <span
                    className={`px-2.5 py-0.5 rounded font-bold text-xs ${
                      lastResult.decision === 'ALLOW'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-700'
                        : lastResult.decision === 'DENY'
                        ? 'bg-rose-950 text-rose-300 border border-rose-700'
                        : lastResult.decision === 'SANDBOX_QUARANTINE'
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                        : 'bg-amber-950 text-amber-300 border border-amber-700'
                    }`}
                  >
                    {lastResult.decision}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400">Regra Acionada: </span>
                  <span className="text-amber-400">{lastResult.matchedRuleId} ({lastResult.matchedRuleName})</span>
                </div>

                <div>
                  <span className="text-slate-400">Justificativa: </span>
                  <span className="text-slate-200">{lastResult.reason}</span>
                </div>

                <div className="flex items-center gap-3 pt-1 border-t border-slate-800 text-[11px]">
                  <span>Aprovação Humana: {lastResult.humanApprovalRequired ? 'SIM (Obrigatória)' : 'NÃO'}</span>
                  <span>Sandbox MicroVM: {lastResult.sandboxRequired ? 'SIM' : 'NÃO'}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Policies Catalog Table */}
        <div className="lg:col-span-6 space-y-3">
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Catálogo de Políticas Ativas (Policy-as-Code)
            </h3>

            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {DEFAULT_SECURITY_POLICIES.map((rule) => (
                <div
                  key={rule.id}
                  className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition text-xs"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-amber-400">{rule.id}</span>
                      <span className="font-semibold text-slate-200">{rule.name}</span>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        rule.decision === 'ALLOW'
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                          : rule.decision === 'DENY'
                          ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                          : rule.decision === 'SANDBOX_QUARANTINE'
                          ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800'
                          : 'bg-amber-950/80 text-amber-300 border border-amber-800'
                      }`}
                    >
                      {rule.decision}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed mb-2">
                    {rule.description}
                  </p>

                  <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400 border-t border-slate-900 pt-1.5">
                    <span>Ação: {rule.action}</span>
                    <span>Prioridade: {rule.priority}</span>
                    {rule.humanApprovalRequired && (
                      <span className="text-amber-400 flex items-center gap-1 font-bold">
                        <Lock className="w-3 h-3" /> Requer Dupla Autorização
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
