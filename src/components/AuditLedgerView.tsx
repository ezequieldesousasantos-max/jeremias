import React, { useState } from 'react';
import {
  Lock,
  ShieldCheck,
  ShieldAlert,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Bug,
  ChevronRight,
  Hash,
} from 'lucide-react';
import { SecurityAuditEvent } from '../lib/types.ts';

interface AuditLedgerViewProps {
  auditChain: SecurityAuditEvent[];
  onVerifyChain: () => Promise<{ valid: boolean; tamperedIndex?: number; reason?: string }>;
  onSimulateTamper: () => Promise<void>;
  onResetLedger: () => Promise<void>;
  /** botão de demonstração (adultera uma cópia em memória); só no modo avançado */
  showDemoControls?: boolean;
  highlightId?: string;
}

export const AuditLedgerView: React.FC<AuditLedgerViewProps> = ({
  auditChain,
  onVerifyChain,
  onSimulateTamper,
  onResetLedger,
  showDemoControls = false,
  highlightId,
}) => {
  const [selectedBlock, setSelectedBlock] = useState<SecurityAuditEvent | null>(
    auditChain[auditChain.length - 1] || null
  );
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    tamperedIndex?: number;
    reason?: string;
  } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      const res = await onVerifyChain();
      setVerificationResult(res);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-4 space-y-6">
      {/* Banner */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded bg-indigo-950 border border-indigo-600 text-indigo-400">
              <Lock className="w-5 h-5" />
            </span>
            <h2 className="text-base font-bold text-white">
              LEDGER DE AUDITORIA TAMPER-EVIDENT (HASH CHAINING SHA-256)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Cada evento do Jeremias A.S.O., decisão OPA e tentativa de invasão é vinculado
            criptograficamente ao hash do bloco anterior. Qualquer alteração invalida a cadeia imediatamente.
          </p>
        </div>

        {/* Verification Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleVerify}
            disabled={isVerifying}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{isVerifying ? 'Recalculando Hashes...' : 'Verificar Integridade'}</span>
          </button>

          {showDemoControls && (
          <button
            onClick={onSimulateTamper}
            className="px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-700 text-xs flex items-center gap-1.5 transition cursor-pointer"
            title="Adultera uma cópia EM MEMÓRIA para demonstrar a quebra do elo. O arquivo em disco não é tocado."
          >
            <Bug className="w-4 h-4" />
            <span>Simular Adulteração</span>
          </button>
          )}

          <button
            onClick={onResetLedger}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restaurar do Disco</span>
          </button>
        </div>
      </div>

      {/* Verification Status Banner */}
      {verificationResult && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-3 text-xs font-mono ${
            verificationResult.valid
              ? 'bg-emerald-950/70 border-emerald-600 text-emerald-300'
              : 'bg-rose-950/80 border-rose-600 text-rose-200 animate-pulse'
          }`}
        >
          {verificationResult.valid ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <span className="font-bold">INTEGRIDADE CRIPTOGRÁFICA 100% VÁLIDA:</span> Todos os {auditChain.length} blocos
                possuem encadeamento de hash SHA-256 matematicamente comprovado. Nenhuma adulteração detectada.
              </div>
            </>
          ) : (
            <>
              <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <span className="font-bold">ALERTA CRÍTICO: QUEBRA DE ELO DETECTADA NO BLOCO #{verificationResult.tamperedIndex}:</span>{' '}
                {verificationResult.reason || 'Divergência entre o hash armazenado e os dados do bloco.'}
              </div>
            </>
          )}
        </div>
      )}

      {/* Main Ledger Split: Chain Table & Block Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Blocks Table */}
        <div className="lg:col-span-7 space-y-3">
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Hash className="w-4 h-4 text-indigo-400" />
                Cadeia de Blocos Criptográficos ({auditChain.length} Blocos)
              </h3>
              <span className="text-[10px] font-mono text-slate-400">
                Gênesis: 000000000000...
              </span>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {auditChain.map((block) => {
                const isSelected = selectedBlock?.id === block.id;
                const isHighlighted = highlightId === block.id;

                return (
                  <div
                    key={block.id}
                    onClick={() => setSelectedBlock(block)}
                    className={`p-3 rounded-lg border text-xs font-mono cursor-pointer transition ${
                      isSelected
                        ? 'bg-indigo-950/60 border-indigo-500 shadow-lg'
                        : isHighlighted
                        ? 'bg-amber-950/60 border-amber-500'
                        : 'bg-slate-950 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-indigo-400">#{block.index}</span>
                        <span className="text-slate-200 font-semibold">{block.action}</span>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          block.decision === 'ALLOW'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : block.decision === 'DENY'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}
                      >
                        {block.decision}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 truncate mb-1">
                      {block.details}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 pt-1.5 border-t border-slate-900">
                      <div className="truncate">
                        Prev: <span className="text-slate-400">{block.previousHash.slice(0, 16)}...</span>
                      </div>
                      <div className="truncate text-right">
                        Hash: <span className="text-indigo-400">{block.hash.slice(0, 16)}...</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selected Block Inspector */}
        <div className="lg:col-span-5 space-y-3">
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Search className="w-4 h-4 text-cyan-400" />
              Inspetor de Integridade do Bloco
            </h3>

            {selectedBlock ? (
              <div className="space-y-3 text-xs font-mono">
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-1">
                  <div className="text-slate-400 text-[10px]">Identificador do Bloco:</div>
                  <div className="text-white font-bold text-sm">
                    {selectedBlock.id} (Índice #{selectedBlock.index})
                  </div>
                  <div className="text-slate-400 text-[10px]">
                    Timestamp: {new Date(selectedBlock.timestamp).toLocaleString()}
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Ator / Origem:</span>
                    <span className="text-emerald-400">{selectedBlock.actor}</span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px]">Alvo / Recurso:</span>
                    <span className="text-slate-200">{selectedBlock.target}</span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px]">Regra de Política Acionada:</span>
                    <span className="text-amber-400">{selectedBlock.ruleId}</span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px]">Marcação Taint:</span>
                    <span className="text-slate-200">{selectedBlock.taintLevel}</span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px]">Detalhes do Registro:</span>
                    <p className="p-2 rounded bg-slate-950 border border-slate-800 text-slate-300 font-sans text-xs">
                      {selectedBlock.details}
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-950 border border-indigo-900/50 space-y-2">
                  <div>
                    <div className="text-[10px] text-slate-400">Previous Hash (Elo Anterior):</div>
                    <div className="text-[10px] text-slate-400 break-all select-all font-mono">
                      {selectedBlock.previousHash}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-indigo-400 font-bold">Block Hash SHA-256 (Assinatura):</div>
                    <div className="text-[10px] text-emerald-400 break-all select-all font-mono font-bold">
                      {selectedBlock.hash}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 font-mono text-center p-8">
                Selecione um bloco da tabela para inspecionar a carga criptográfica.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
