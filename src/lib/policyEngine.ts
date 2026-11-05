import type {
  ActionContext,
  PolicyDecision,
  PolicyEvaluationResult,
  SecurityPolicyRule,
} from './types.ts';
import { analyzeTaint } from './taintTracker.ts';
import { isAllowlisted, parseCommand } from './commands.ts';

export const DEFAULT_SECURITY_POLICIES: SecurityPolicyRule[] = [
  {
    id: 'POL-01-CRIT-EXPLOIT',
    name: 'Contenção Absoluta de Exploits Letais',
    description: 'Bloqueio incondicional de comandos que tentam destruição de partições, sockets de reverse shell ou sobreposição de binários de host.',
    action: '*',
    condition: (ctx) => ctx.taintLevel === 'LETHAL_EXPLOIT',
    decision: 'DENY',
    humanApprovalRequired: false,
    sandboxRequired: false,
    priority: 100,
  },
  {
    id: 'POL-02-TAINT-ISOLATION',
    name: 'Isolamento de Carga Tainted em MicroVM',
    description: 'Qualquer script externo, payload ou input com marcação Tainted não toca o OS anfitrião e é confinado em MicroVM isolada.',
    action: '*',
    condition: (ctx) => ctx.taintLevel === 'TAINTED_UNTRUSTED',
    decision: 'SANDBOX_QUARANTINE',
    humanApprovalRequired: false,
    sandboxRequired: true,
    priority: 90,
  },
  {
    id: 'POL-03-ZERO-TRUST-NET',
    name: 'Barreira Zero-Trust de Saída de Rede',
    description: 'Conexões externas não autorizadas são bloqueadas por padrão; conexões de rede exigem autorização humana explícita.',
    action: 'NETWORK_OUTBOUND',
    condition: (ctx) => {
      const dest = ctx.networkDestination || '';
      const isLoopback = dest.includes('127.0.0.1') || dest.includes('localhost');
      return !isLoopback;
    },
    decision: 'REQUIRE_HUMAN_APPROVAL',
    humanApprovalRequired: true,
    sandboxRequired: false,
    priority: 80,
  },
  {
    id: 'POL-04-HOST-FS-IMMUTABILITY',
    name: 'Proteção de Integridade do Sistema de Arquivos Host',
    description: 'Escritas no disco do anfitrião fora do diretório efêmero em RAM exigem validação humana de alto privilégio.',
    action: 'WRITE_FILE_HOST',
    condition: (ctx) => {
      const target = ctx.target || '';
      const isEphemeralPath = target.startsWith('/tmp/jeremias_ephemeral') || target.startsWith('memfs://');
      return !isEphemeralPath;
    },
    decision: 'REQUIRE_HUMAN_APPROVAL',
    humanApprovalRequired: true,
    sandboxRequired: false,
    priority: 75,
  },
  {
    id: 'POL-09-ALLOWLISTED-EXEC',
    name: 'Execução de Comandos Somente-Leitura Permitidos',
    description: 'Comandos da lista de permissão (uname, uptime, df...), sem metacaracteres de shell e com taint CLEAN, rodam no host com timeout e sem shell.',
    action: 'EXEC_SHELL',
    condition: (ctx) => ctx.taintLevel === 'CLEAN' && isAllowlisted(parseCommand(ctx.payload || '')),
    decision: 'ALLOW',
    humanApprovalRequired: false,
    sandboxRequired: false,
    priority: 60,
  },
  {
    id: 'POL-10-EXEC-APPROVAL',
    name: 'Execução Fora da Lista Exige Aprovação e Sandbox',
    description: 'Comandos limpos fora da lista de permissão só rodam após aprovação humana e SEMPRE dentro do sandbox, nunca no host.',
    action: 'EXEC_SHELL',
    condition: (ctx) => ctx.taintLevel === 'CLEAN',
    decision: 'REQUIRE_HUMAN_APPROVAL',
    humanApprovalRequired: true,
    sandboxRequired: true,
    priority: 55,
  },
  {
    id: 'POL-05-RAM-PURGE-SOVEREIGNTY',
    name: 'Descarte Imediato e Volatilidade de Memória',
    description: 'Diretriz Soberana Local: Operação de limpeza e purga de memória volátil é autorizada imediatamente sem fricção.',
    action: 'PURGE_RAM',
    condition: () => true,
    decision: 'ALLOW',
    humanApprovalRequired: false,
    sandboxRequired: false,
    priority: 70,
  },
  {
    id: 'POL-06-LOCAL-DIAGNOSTICS',
    name: 'Telemetria e Diagnóstico Local',
    description: 'Consultas locais de leitura à saúde do nó, estatísticas de kernel e integridade do ledger são permitidas.',
    action: 'READ_LOCAL_DIAGNOSTICS',
    condition: (ctx) => ctx.taintLevel === 'CLEAN',
    decision: 'ALLOW',
    humanApprovalRequired: false,
    sandboxRequired: false,
    priority: 50,
  },
  {
    id: 'POL-07-MICROVM-PROVISION',
    name: 'Orquestração de Sandbox Efêmera',
    description: 'Criação de MicroVM efêmera sob perfil seccomp/cgroups para análise controlada.',
    action: 'SPAWN_MICROVM',
    condition: () => true,
    decision: 'ALLOW',
    humanApprovalRequired: false,
    sandboxRequired: true,
    priority: 40,
  },
  {
    id: 'POL-08-DEFAULT-ZERO-TRUST-DENY',
    name: 'Postura Padrão Zero-Trust (Default Deny)',
    description: 'Qualquer ação não categorizada ou sem política explícita de permissão é bloqueada por segurança.',
    action: '*',
    condition: () => true,
    decision: 'DENY',
    humanApprovalRequired: false,
    sandboxRequired: false,
    priority: 1,
  },
];

export function evaluateSecurityPolicy(
  context: ActionContext,
  customPolicies: SecurityPolicyRule[] = []
): PolicyEvaluationResult {
  // 1. Analyze taint dynamically if payload exists
  const taintAnalysis = analyzeTaint(
    (context.payload || '') + ' ' + (context.target || ''),
    'cli_command'
  );

  const effectiveTaintLevel =
    context.taintLevel === 'LETHAL_EXPLOIT' || taintAnalysis.level === 'LETHAL_EXPLOIT'
      ? 'LETHAL_EXPLOIT'
      : context.taintLevel === 'TAINTED_UNTRUSTED' || taintAnalysis.level === 'TAINTED_UNTRUSTED'
      ? 'TAINTED_UNTRUSTED'
      : context.taintLevel === 'SUSPICIOUS' || taintAnalysis.level === 'SUSPICIOUS'
      ? 'SUSPICIOUS'
      : 'CLEAN';

  const enrichedContext: ActionContext = {
    ...context,
    taintLevel: effectiveTaintLevel,
  };

  const allPolicies = [...customPolicies, ...DEFAULT_SECURITY_POLICIES].sort(
    (a, b) => b.priority - a.priority
  );

  for (const rule of allPolicies) {
    if (rule.action === '*' || rule.action === enrichedContext.action) {
      if (rule.condition(enrichedContext)) {
        let reason = rule.description;
        if (taintAnalysis.findings.length > 0) {
          reason += ` [Detecções Taint: ${taintAnalysis.findings.join(' | ')}]`;
        }

        return {
          decision: rule.decision,
          matchedRuleId: rule.id,
          matchedRuleName: rule.name,
          reason,
          humanApprovalRequired: rule.humanApprovalRequired,
          sandboxRequired: rule.sandboxRequired,
          taintLevel: effectiveTaintLevel,
          taintTags: taintAnalysis.tags,
        };
      }
    }
  }

  return {
    decision: 'DENY',
    matchedRuleId: 'FALLBACK_DENY',
    matchedRuleName: 'Default Deny Posture',
    reason: 'Zero-Trust: Nenhuma política autorizou explicitamente esta operação.',
    humanApprovalRequired: false,
    sandboxRequired: false,
    taintLevel: effectiveTaintLevel,
    taintTags: ['UNAUTHORIZED_ATTEMPT'],
  };
}
