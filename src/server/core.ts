import type {
  AnomalyAlert,
  EdgeSystemStatus,
  PendingApproval,
  PolicyEvaluationResult,
  SandboxExecution,
  SecurityAuditEvent,
  SystemActionType,
  TaintLevel,
} from '../lib/types.ts';
import { analyzeTaint } from '../lib/taintTracker.ts';
import { evaluateSecurityPolicy } from '../lib/policyEngine.ts';
import { appendAuditEvent, createGenesisBlock, verifyAuditChain } from '../lib/auditLedger.ts';
import { parseCommand } from '../lib/commands.ts';
import { EphemeralMemory } from './ephemeralMemory.ts';
import { memoryStore, type LedgerStore } from './ledgerStore.ts';
import { readTelemetry, type Telemetry } from './telemetry.ts';
import { SANDBOX_LIMITS, type SandboxRun, type SandboxRunner } from './executor.ts';

export const VALID_ACTIONS: SystemActionType[] = [
  'EXEC_SHELL',
  'WRITE_FILE_HOST',
  'READ_LOCAL_DIAGNOSTICS',
  'NETWORK_OUTBOUND',
  'SPAWN_MICROVM',
  'EXPORT_DATA',
  'PURGE_RAM',
  'INSPECT_FILE',
  'UPDATE_POLICY',
];

const MAX_ALERTS = 100;
const MAX_SANDBOXES = 20;
const MAX_APPROVALS = 50;

export interface CoreDeps {
  store?: LedgerStore;
  memory?: EphemeralMemory;
  telemetry?: () => Telemetry;
  sandbox?: { run: SandboxRunner; info: () => { available: boolean; detail: string } };
}

export interface GateResult {
  mode: 'chat' | 'command';
  action: SystemActionType;
  /** comando digitado após "!" (somente no modo command) */
  command?: string;
  argv?: string[] | null;
  policyResult: PolicyEvaluationResult;
  taintScore: number;
  inputBytes: number;
  auditBlock: SecurityAuditEvent;
  /** pode enviar o prompt ao modelo */
  allowModelCall: boolean;
  /** comando autorizado para rodar no host (lista de permissão) */
  allowHostExec: boolean;
  /** comando que exige aprovação humana (rodará só no sandbox) */
  needsApproval: boolean;
  /** a ação era uma purga de RAM (já executada) */
  purged: boolean;
}

export function inferAction(prompt: string): {
  action: SystemActionType;
  networkDestination?: string;
  command?: string;
} {
  const trimmed = prompt.trimStart();
  if (trimmed.startsWith('!')) return { action: 'EXEC_SHELL', command: trimmed.slice(1).trim() };

  const url = prompt.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
  if (/(purg|descart|sobrescrev|0x00|wipe)/i.test(prompt) && /(mem[óo]ria|ram|buffer)/i.test(prompt)) {
    return { action: 'PURGE_RAM' };
  }
  if (url && /(conex|rede|network|sa[ií]da|outbound|enviar|exfil|upload)/i.test(prompt)) {
    return { action: 'NETWORK_OUTBOUND', networkDestination: url };
  }
  const taint = analyzeTaint(prompt, 'user_prompt');
  if (taint.level !== 'CLEAN') return { action: 'EXEC_SHELL' };
  return { action: 'READ_LOCAL_DIAGNOSTICS' };
}

const unavailableRunner: SandboxRunner = async () => ({
  available: false, exitCode: null, stdout: '', stderr: '', timedOut: false, durationMs: 0,
  error: 'Nenhum sandbox configurado',
});

export function createCore(deps: CoreDeps = {}) {
  const store = deps.store ?? memoryStore();
  const memory = deps.memory ?? new EphemeralMemory();
  const telemetry = deps.telemetry ?? readTelemetry;
  const sandbox = deps.sandbox ?? { run: unavailableRunner, info: () => ({ available: false, detail: 'sem sandbox' }) };

  let alerts: AnomalyAlert[] = [];
  let sandboxes: SandboxExecution[] = [];
  let approvals: PendingApproval[] = [];
  const inFlight = new Set<string>();
  let blockedActions = 0;
  let taintedEntities = 0;
  let ramWiped = false;
  let runningSandboxes = 0;
  let sandboxCounter = 100;
  let alertCounter = 0;
  let approvalCounter = 0;
  let integrityCache: { len: number; head: string; valid: boolean } | null = null;

  // ---------- ledger: carrega do disco ou cria o gênesis ----------
  let chain: SecurityAuditEvent[] = [];
  let corruptStart = false;
  try {
    chain = store.load();
  } catch {
    corruptStart = true;
    store.quarantine();
    chain = [];
  }
  if (chain.length === 0) {
    const genesis = createGenesisBlock();
    store.append(genesis);
    chain = [genesis];
  }

  const pushAlert = (a: Omit<AnomalyAlert, 'id' | 'timestamp'>) => {
    alerts = [
      { id: `alt-${String(++alertCounter).padStart(3, '0')}`, timestamp: new Date().toISOString(), ...a },
      ...alerts,
    ].slice(0, MAX_ALERTS);
  };

  pushAlert({
    severity: 'low',
    title: 'Inicialização de Guarda Local Zero-Trust',
    details: `Ledger carregado com ${chain.length} bloco(s). Sandbox: ${sandbox.info().detail}.`,
    ruleTriggered: 'POL-06-LOCAL-DIAGNOSTICS',
    mitigationTaken: 'Status nominal.',
  });
  if (corruptStart) {
    pushAlert({
      severity: 'critical',
      title: 'Arquivo de ledger ilegível',
      details: 'O arquivo foi isolado (renomeado com sufixo .corrupt) e uma nova cadeia foi iniciada.',
      ruleTriggered: 'LEDGER-INTEGRITY',
      mitigationTaken: 'Original preservado para análise.',
    });
  }
  if (!verifyAuditChain(chain).valid) {
    pushAlert({
      severity: 'critical',
      title: 'Ledger adulterado no disco',
      details: 'A cadeia carregada na inicialização não passa na verificação de hashes.',
      ruleTriggered: 'LEDGER-INTEGRITY',
      mitigationTaken: 'Cadeia marcada como TAMPERED.',
    });
  }

  const audit = (p: {
    action: SystemActionType;
    actor: string;
    target: string;
    decision: SecurityAuditEvent['decision'];
    taintLevel: TaintLevel;
    ruleId: string;
    details: string;
  }) => {
    const { updatedChain, newEvent } = appendAuditEvent(chain, p);
    chain = updatedChain;
    integrityCache = null;
    try {
      store.append(newEvent);
    } catch (e) {
      console.error('[LEDGER] falha ao gravar no disco:', e);
    }
    return newEvent;
  };

  const integrity = (): boolean => {
    const head = chain[chain.length - 1]?.hash ?? '';
    if (integrityCache && integrityCache.len === chain.length && integrityCache.head === head) {
      return integrityCache.valid;
    }
    const valid = verifyAuditChain(chain).valid;
    integrityCache = { len: chain.length, head, valid };
    return valid;
  };

  const registerOutcome = (res: PolicyEvaluationResult, label: string) => {
    if (res.taintLevel === 'TAINTED_UNTRUSTED' || res.taintLevel === 'LETHAL_EXPLOIT') taintedEntities++;
    if (res.decision === 'ALLOW') return;
    if (res.decision === 'DENY') blockedActions++;
    const severity: AnomalyAlert['severity'] =
      res.taintLevel === 'LETHAL_EXPLOIT' ? 'critical' : res.decision === 'DENY' ? 'high' : 'medium';
    pushAlert({
      severity,
      title:
        res.decision === 'DENY'
          ? `Ação bloqueada: ${label}`
          : res.decision === 'SANDBOX_QUARANTINE'
          ? `Entrada em quarentena: ${label}`
          : `Aprovação humana exigida: ${label}`,
      details: res.reason,
      ruleTriggered: res.matchedRuleId,
      mitigationTaken:
        res.decision === 'DENY'
          ? 'Execução negada pelo motor de políticas.'
          : res.decision === 'SANDBOX_QUARANTINE'
          ? 'Só pode ser analisada no sandbox; host não tocado.'
          : 'Aguardando decisão do operador.',
    });
  };

  const outputText = (stdout: string, stderr: string, error?: string) =>
    [stdout.trim(), stderr.trim() && `[stderr] ${stderr.trim()}`, error && `[erro] ${error}`]
      .filter(Boolean)
      .join('\n')
      .slice(0, 4000);

  const core = {
    // ---------- status (métricas reais) ----------
    getStatus(): EdgeSystemStatus {
      const t = telemetry();
      const sb = sandbox.info();
      return {
        osKernel: t.osKernel,
        architecture: t.architecture,
        edgeNodeId: t.hostname,
        sovereigntyMode: 'STRICT_LOCAL_FIRST',
        zeroTrustStatus: 'ACTIVE_ENFORCED',
        cpuLimitPercentage: t.cpuLoadPercent,
        ramTotalMb: t.ramTotalMb,
        ramVolatileUsedMb: Math.round((memory.sizeBytes() / 1048576) * 1000) / 1000,
        isRamVolatileWiped: ramWiped,
        taintedEntitiesCount: taintedEntities,
        seccompStatus: sb.available ? 'ENFORCING' : 'UNAVAILABLE',
        cgroupsStatus: sb.available ? 'ISOLATED' : 'UNAVAILABLE',
        activeMicroVMs: runningSandboxes,
        blockedSyscallsCount: blockedActions,
        auditChainLength: chain.length,
        chainIntegrity: integrity() ? 'VERIFIED' : 'TAMPERED',
      };
    },
    getSnapshot() {
      return {
        status: core.getStatus(),
        recentAlerts: alerts,
        sandboxes,
        auditChain: chain,
        approvals: [...approvals].reverse(),
      };
    },

    // ---------- memória efêmera ----------
    remember: (role: 'user' | 'model', text: string) => memory.add(role, text),
    history: () => memory.history(),

    // ---------- política ----------
    evaluate(params: {
      action: SystemActionType;
      target?: string;
      payload?: string;
      networkDestination?: string;
      actor?: string;
    }) {
      const policyResult = evaluateSecurityPolicy({
        action: params.action,
        target: params.target,
        payload: params.payload,
        networkDestination: params.networkDestination,
        taintLevel: 'CLEAN',
        userRole: 'operator',
      });
      let purged = false;
      if (params.action === 'PURGE_RAM' && policyResult.decision === 'ALLOW') {
        memory.purge();
        ramWiped = true;
        purged = true;
      }
      const auditBlock = audit({
        action: params.action,
        actor: params.actor ?? 'operator_console',
        target: (params.target || params.networkDestination || '-').slice(0, 200),
        decision: policyResult.decision,
        taintLevel: policyResult.taintLevel,
        ruleId: policyResult.matchedRuleId,
        details: `${policyResult.matchedRuleName}: ${policyResult.decision}`,
      });
      registerOutcome(policyResult, params.action);
      return { policyResult, auditBlock, purged };
    },

    // ---------- chat e comandos ----------
    gateChat(prompt: string): GateResult {
      const { action, networkDestination, command } = inferAction(prompt);
      const mode: GateResult['mode'] = command !== undefined ? 'command' : 'chat';
      const payload = command ?? prompt;
      const { policyResult, auditBlock, purged } = core.evaluate({
        action,
        payload,
        networkDestination,
        target: networkDestination,
        actor: mode === 'command' ? 'operator_command' : 'operator_chat',
      });
      if (!purged) ramWiped = false;
      const allow = policyResult.decision === 'ALLOW';
      return {
        mode,
        action,
        command,
        argv: command !== undefined ? parseCommand(command) : undefined,
        policyResult,
        taintScore: analyzeTaint(payload, 'user_prompt').score,
        inputBytes: Buffer.byteLength(prompt),
        auditBlock,
        allowModelCall: allow && mode === 'chat' && action === 'READ_LOCAL_DIAGNOSTICS',
        allowHostExec: allow && mode === 'command',
        needsApproval: policyResult.decision === 'REQUIRE_HUMAN_APPROVAL' && mode === 'command',
        purged,
      };
    },

    // ---------- fila de aprovação humana ----------
    createApproval(p: { command: string; policyId: string; reason: string }): PendingApproval {
      const a: PendingApproval = {
        id: `apr-${String(++approvalCounter).padStart(3, '0')}`,
        createdAt: new Date().toISOString(),
        action: 'EXEC_SHELL',
        command: p.command,
        policyId: p.policyId,
        reason: p.reason,
        status: 'pending',
      };
      approvals = [...approvals, a].slice(-MAX_APPROVALS);
      return a;
    },
    /** Reserva uma aprovação pendente para execução (evita duplo clique). */
    takeApproval(id: string): PendingApproval | null {
      const a = approvals.find((x) => x.id === id);
      if (!a || a.status !== 'pending' || inFlight.has(id)) return null;
      inFlight.add(id);
      return a;
    },
    denyApproval(id: string) {
      const a = approvals.find((x) => x.id === id);
      if (!a || a.status !== 'pending' || inFlight.has(id)) return null;
      a.status = 'denied';
      a.resolvedAt = new Date().toISOString();
      const auditBlock = audit({
        action: 'EXEC_SHELL',
        actor: 'human_operator',
        target: a.command.slice(0, 200),
        decision: 'DENY',
        taintLevel: 'CLEAN',
        ruleId: a.policyId,
        details: `${a.id}: negado pelo operador`,
      });
      return { approval: a, auditBlock };
    },
    completeApproval(id: string, run: SandboxRun) {
      const a = approvals.find((x) => x.id === id)!;
      inFlight.delete(id);
      a.status = run.available && !run.timedOut && run.exitCode === 0 ? 'executed' : 'failed';
      a.resolvedAt = new Date().toISOString();
      a.output = outputText(run.stdout, run.stderr, run.error ?? (run.timedOut ? 'timeout' : undefined));
      const auditBlock = audit({
        action: 'EXEC_SHELL',
        actor: 'human_operator',
        target: a.command.slice(0, 200),
        decision: 'ALLOW',
        taintLevel: 'CLEAN',
        ruleId: a.policyId,
        details: run.available
          ? `${a.id}: aprovado pelo operador; executado no sandbox (exit ${run.exitCode})`
          : `${a.id}: aprovado, mas NÃO executado (${run.error})`,
      });
      return { approval: a, auditBlock };
    },
    recordHostExecution(commandText: string, res: { exitCode: number | null; error?: string }) {
      return audit({
        action: 'EXEC_SHELL',
        actor: 'operator_command',
        target: commandText.slice(0, 200),
        decision: 'ALLOW',
        taintLevel: 'CLEAN',
        ruleId: 'POL-09-ALLOWLISTED-EXEC',
        details: `executado no host (exit ${res.exitCode}${res.error ? `, ${res.error}` : ''})`,
      });
    },

    /** Ferramenta local que toca em arquivos (busca, hash). Registra só o nome da ferramenta, nunca caminhos. */
    recordLocalTool(tool: string) {
      return audit({
        action: 'INSPECT_FILE',
        actor: 'local_tools',
        target: tool.slice(0, 60),
        decision: 'ALLOW',
        taintLevel: 'CLEAN',
        ruleId: 'POL-12-LOCAL-TOOL',
        details: `ferramenta local "${tool}" (somente leitura, pastas autorizadas, nada enviado à nuvem)`,
      });
    },
    /** Arquivo criado após confirmação do operador. Registra só tamanho e extensão, nunca nome nem conteúdo. */
    recordFileWrite(p: { bytes: number; ext: string }) {
      return audit({
        action: 'WRITE_FILE_HOST',
        actor: 'human_operator',
        target: `.${p.ext}`.slice(0, 20),
        decision: 'ALLOW',
        taintLevel: 'CLEAN',
        ruleId: 'POL-13-FILE-CREATE-CONFIRMED',
        details: `arquivo .${p.ext} (${p.bytes} bytes) criado na pasta de trabalho com confirmação do operador; sem sobrescrever`,
      });
    },
    /** Envio à nuvem confirmado pelo operador. Registra só o tamanho, nunca o conteúdo. */
    recordCloudCall(p: { bytes: number; web: boolean }) {
      return audit({
        action: 'NETWORK_OUTBOUND',
        actor: 'human_operator',
        target: 'api-nuvem',
        decision: 'ALLOW',
        taintLevel: 'CLEAN',
        ruleId: 'POL-11-CLOUD-CONFIRMED',
        details: `${p.bytes} bytes enviados à nuvem com confirmação do operador (busca na web: ${p.web ? 'sim' : 'não'})`,
      });
    },

    // ---------- RAM ----------
    purgeRam() {
      return core.evaluate({ action: 'PURGE_RAM', target: 'volatile_buffer', payload: '0x00 memory zeroing' });
    },

    // ---------- sandbox (Docker real; se indisponível, NÃO executa) ----------
    async runSandbox(
      scriptName: string,
      scriptContent: string
    ): Promise<{ sandbox: SandboxExecution; auditBlock: SecurityAuditEvent }> {
      const taint = analyzeTaint(scriptContent, 'file_upload');
      const id = `vm-${++sandboxCounter}`;
      const lethal = taint.level === 'LETHAL_EXPLOIT';
      const stdout: string[] = [];
      let status: SandboxExecution['status'];
      let run: SandboxRun | null = null;

      stdout.push(`[TAINT] Score ${taint.score}/100 — nível ${taint.level}.`);

      if (lethal) {
        status = 'denied_by_policy';
        stdout.push('[POLICY] POL-01-CRIT-EXPLOIT: execução NEGADA antes de iniciar. O script não foi executado.');
      } else {
        runningSandboxes++;
        try {
          run = await sandbox.run(scriptContent);
        } finally {
          runningSandboxes--;
        }
        if (!run.available) {
          status = 'sandbox_unavailable';
          stdout.push(`[SANDBOX INIT] Sandbox indisponível: ${run.error}`);
          stdout.push('[SANDBOX] O script NÃO foi executado.');
        } else {
          stdout.push(`[SANDBOX INIT] Container ${id} iniciado: rede desligada, FS somente-leitura, sem capabilities.`);
          stdout.push(
            `[CGROUPS] cpus=${SANDBOX_LIMITS.cpus} memory=${SANDBOX_LIMITS.memory} pids=${SANDBOX_LIMITS.pids} (cgroups via Docker)`
          );
          stdout.push('[SECCOMP] Perfil seccomp ativo (padrão do Docker ou o configurado).');
          for (const l of run.stdout.split('\n').filter(Boolean).slice(0, 200)) stdout.push(`[STDOUT] ${l}`);
          for (const l of run.stderr.split('\n').filter(Boolean).slice(0, 200)) stdout.push(`[STDERR] ${l}`);
          if (run.timedOut) {
            status = 'timeout';
            stdout.push(`[KILL] Tempo limite de ${SANDBOX_LIMITS.timeoutMs / 1000}s excedido; container encerrado.`);
          } else if (run.exitCode === 0) {
            status = 'terminated_clean';
            stdout.push('[EXIT] Código 0. Container descartado, sem persistência.');
          } else if (run.exitCode === 159) {
            status = 'blocked_by_seccomp';
            stdout.push('[KERNEL TRAP] Syscall bloqueada pelo seccomp (SIGSYS, exit 159).');
            stdout.push('[KILL] Processo encerrado pelo kernel. Host intocado.');
          } else {
            status = 'failed';
            stdout.push(`[EXIT] Código ${run.exitCode}.`);
          }
        }
      }

      const sandboxResult: SandboxExecution = {
        id,
        target: scriptName,
        status,
        taintScore: taint.score,
        cgroupCpuLimit: `${SANDBOX_LIMITS.cpus} CPU`,
        cgroupMemLimit: SANDBOX_LIMITS.memory.replace('m', ' MB'),
        seccompProfile: 'padrão do Docker',
        stdout,
        anomaliesDetected: taint.findings,
        timestamp: new Date().toISOString(),
      };
      sandboxes = [sandboxResult, ...sandboxes].slice(0, MAX_SANDBOXES);

      if (taint.level === 'TAINTED_UNTRUSTED' || lethal) taintedEntities++;
      if (lethal || status === 'blocked_by_seccomp') blockedActions++;

      const auditBlock = audit({
        action: 'SPAWN_MICROVM',
        actor: 'sandbox_orchestrator',
        target: scriptName.slice(0, 200),
        decision: lethal ? 'DENY' : taint.level === 'CLEAN' ? 'ALLOW' : 'SANDBOX_QUARANTINE',
        taintLevel: taint.level,
        ruleId: lethal ? 'POL-01-CRIT-EXPLOIT' : taint.level === 'CLEAN' ? 'POL-07-MICROVM-PROVISION' : 'POL-02-TAINT-ISOLATION',
        details: `${id} → ${status} (score ${taint.score})`,
      });

      if (lethal || taint.level === 'TAINTED_UNTRUSTED' || status === 'blocked_by_seccomp') {
        pushAlert({
          severity: lethal || status === 'blocked_by_seccomp' ? 'critical' : 'high',
          title: lethal ? `Script negado pela política: ${scriptName}` : `Script suspeito no sandbox: ${scriptName}`,
          details: taint.findings.join(' | ') || `Status: ${status}`,
          ruleTriggered: lethal ? 'POL-01-CRIT-EXPLOIT' : 'POL-02-TAINT-ISOLATION',
          mitigationTaken: lethal ? 'Não executado.' : `Confinado no sandbox (${status}).`,
        });
      }
      return { sandbox: sandboxResult, auditBlock };
    },

    // ---------- ledger ----------
    verifyLedger() {
      const result = verifyAuditChain(chain);
      integrityCache = { len: chain.length, head: chain[chain.length - 1]?.hash ?? '', valid: result.valid };
      if (!result.valid) {
        pushAlert({
          severity: 'critical',
          title: `Quebra de integridade do ledger (bloco #${result.tamperedIndex})`,
          details: result.reason ?? 'Hash divergente.',
          ruleTriggered: 'LEDGER-INTEGRITY',
          mitigationTaken: 'Cadeia marcada como TAMPERED. Investigação necessária.',
        });
      }
      return result;
    },
    /** Demonstração: adultera a cópia EM MEMÓRIA. O arquivo em disco não é tocado. */
    simulateTamper() {
      const idx = chain.length > 1 ? Math.floor(chain.length / 2) : 0;
      chain = chain.map((b, i) => (i === idx ? { ...b, details: `${b.details} [ADULTERADO POR SIMULAÇÃO]` } : b));
      integrityCache = null;
      return { tamperedIndex: idx };
    },
    /** Recarrega a cadeia do armazenamento (desfaz a simulação; nunca apaga registros). */
    reloadLedger() {
      try {
        const fresh = store.load();
        if (fresh.length > 0) chain = fresh;
      } catch {
        /* mantém a cadeia atual */
      }
      integrityCache = null;
      pushAlert({
        severity: 'low',
        title: 'Ledger recarregado do armazenamento',
        details: `${chain.length} bloco(s) lidos do disco.`,
        ruleTriggered: 'POLICY_INIT',
        mitigationTaken: 'Status nominal.',
      });
    },
  };
  return core;
}

export type Core = ReturnType<typeof createCore>;
