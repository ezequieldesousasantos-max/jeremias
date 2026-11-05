export type SystemActionType =
  | 'EXEC_SHELL'
  | 'WRITE_FILE_HOST'
  | 'READ_LOCAL_DIAGNOSTICS'
  | 'NETWORK_OUTBOUND'
  | 'SPAWN_MICROVM'
  | 'EXPORT_DATA'
  | 'PURGE_RAM'
  | 'INSPECT_FILE'
  | 'UPDATE_POLICY';

export type TaintLevel = 'CLEAN' | 'SUSPICIOUS' | 'TAINTED_UNTRUSTED' | 'LETHAL_EXPLOIT';

export type PolicyDecision =
  | 'ALLOW'
  | 'DENY'
  | 'REQUIRE_HUMAN_APPROVAL'
  | 'SANDBOX_QUARANTINE';

export interface SecurityPolicyRule {
  id: string;
  name: string;
  description: string;
  action: SystemActionType | '*';
  condition: (context: ActionContext) => boolean;
  decision: PolicyDecision;
  humanApprovalRequired: boolean;
  sandboxRequired: boolean;
  priority: number;
}

export interface ActionContext {
  action: SystemActionType;
  target?: string;
  payload?: string;
  taintLevel: TaintLevel;
  userRole: 'operator' | 'guest' | 'autonomous_agent';
  networkDestination?: string;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  matchedRuleId: string;
  matchedRuleName: string;
  reason: string;
  humanApprovalRequired: boolean;
  sandboxRequired: boolean;
  taintLevel: TaintLevel;
  taintTags: string[];
}

export interface SecurityAuditEvent {
  index: number;
  id: string;
  timestamp: string;
  action: SystemActionType;
  actor: string;
  target: string;
  decision: PolicyDecision;
  taintLevel: TaintLevel;
  ruleId: string;
  previousHash: string;
  hash: string;
  details: string;
}

export interface AnomalyAlert {
  id: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  details: string;
  ruleTriggered: string;
  mitigationTaken: string;
}

export interface SandboxExecution {
  id: string;
  target: string;
  status:
    | 'isolating'
    | 'running_sandboxed'
    | 'terminated_clean'
    | 'blocked_by_seccomp' // processo morto por SIGSYS (exit 159)
    | 'denied_by_policy' // nem chegou a executar
    | 'sandbox_unavailable' // Docker ausente/parado
    | 'timeout'
    | 'failed';
  taintScore: number;
  cgroupCpuLimit: string;
  cgroupMemLimit: string;
  seccompProfile: string;
  stdout: string[];
  anomaliesDetected: string[];
  timestamp: string;
}

export interface EdgeSystemStatus {
  osKernel: string;
  architecture: string;
  edgeNodeId: string;
  sovereigntyMode: 'STRICT_LOCAL_FIRST';
  zeroTrustStatus: 'ACTIVE_ENFORCED';
  cpuLimitPercentage: number;
  ramTotalMb: number;
  ramVolatileUsedMb: number;
  isRamVolatileWiped: boolean;
  taintedEntitiesCount: number;
  seccompStatus: 'ENFORCING' | 'UNAVAILABLE';
  cgroupsStatus: 'ISOLATED' | 'UNAVAILABLE';
  activeMicroVMs: number;
  blockedSyscallsCount: number;
  auditChainLength: number;
  chainIntegrity: 'VERIFIED' | 'TAMPERED';
}

export interface JeremiasMessage {
  id: string;
  sender: 'user' | 'jeremias' | 'system';
  text: string;
  timestamp: string;
  threePillars?: {
    modelAnalysis: string;
    opaAuthorization: string;
    osEnforcement: string;
  };
  policyResult?: PolicyEvaluationResult;
  taintLevel?: TaintLevel;
  auditRefId?: string;
  isEphemeral: boolean;
  /** quem respondeu: ferramenta local, modelo local, nuvem ou aguardando confirmação */
  engine?: 'local' | 'local-llm' | 'cloud' | 'pending' | 'error';
  engineDetail?: string;
  /** pedido à nuvem aguardando o "sim" do operador */
  pendingCloud?: { id: string; web: boolean; bytes: number; resolved?: boolean };
  /** arquivo a criar, aguardando o "sim" do operador */
  pendingWrite?: { id: string; path: string; bytes: number; resolved?: boolean };
}

export interface PendingApproval {
  id: string;
  createdAt: string;
  action: SystemActionType;
  command: string;
  policyId: string;
  reason: string;
  status: 'pending' | 'denied' | 'executed' | 'failed';
  resolvedAt?: string;
  output?: string;
}
