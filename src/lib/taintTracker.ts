import type { TaintLevel } from './types.ts';

export interface TaintAnalysis {
  level: TaintLevel;
  tags: string[];
  findings: string[];
  quarantineRecommended: boolean;
  score: number; // 0 (clean) to 100 (lethal)
}

const CRITICAL_PATTERNS = [
  { pattern: /(curl|wget).*?\|\s*(bash|sh|zsh)/i, tag: 'PIPE_TO_SHELL', desc: 'Download remoto canalizado diretamente para shell executável' },
  { pattern: /nc\s+-e|netcat.*?\/bin\/(ba)?sh/i, tag: 'REVERSE_SHELL', desc: 'Tentativa de socket de reverse shell via netcat' },
  { pattern: /\/dev\/tcp\/\d{1,3}\.\d{1,3}/i, tag: 'BASH_TCP_SOCKET', desc: 'Abertura direta de raw socket via bash' },
  { pattern: /rm\s+-rf\s+(\/|\/\*|~\/)/i, tag: 'DESTRUCTIVE_RM_ROOT', desc: 'Tentativa de destruição recursiva de sistema de arquivos raiz' },
  { pattern: /mkfs\.|dd\s+if=.*?of=\/dev\/(sd|nvme|vd)/i, tag: 'RAW_DISK_OVERWRITE', desc: 'Comando de destruição de partição ou sobrescrita de disco físico' },
  { pattern: /chmod\s+(-R\s+)?(777|666)\s+(\/|\/etc|\/bin)/i, tag: 'MASS_PRIV_DEGRADATION', desc: 'Remoção indiscriminada de permissões em diretórios do sistema' },
  { pattern: /eval\(|base64\s+-d.*?\|\s*bash/i, tag: 'OBFUSCATED_PAYLOAD', desc: 'Carga útil ofuscada com descompressão/execução imediata' },
  { pattern: /cat\s+\/etc\/shadow|id_rsa|authorized_keys/i, tag: 'CREDENTIAL_EXFIL', desc: 'Acesso a chaves criptográficas de host ou hashes de credenciais' },
];

const SUSPICIOUS_PATTERNS = [
  { pattern: /\.\.\/(\.\.\/)+/i, tag: 'DIRECTORY_TRAVERSAL', desc: 'Padrão repetitivo de escape de diretório (Directory Traversal)' },
  { pattern: /sudo\s+/i, tag: 'ELEVATED_SUDO_INVOCATION', desc: 'Solicitação de privilégios de superusuário sem autorização prévia' },
  { pattern: /iptables\s+-F|ufw\s+disable/i, tag: 'FIREWALL_TAMPER', desc: 'Tentativa de desarmar regras de firewall do host' },
  { pattern: /curl\s+https?:\/\/[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/i, tag: 'RAW_IP_EGRESS', desc: 'Conexão HTTP direta a endereço IP sem resolução DNS' },
  { pattern: /cron|systemctl\s+(stop|disable|enable)/i, tag: 'PERSISTENCE_ATTEMPT', desc: 'Tentativa de registrar daemon persistente ou alterar serviços de inicialização' },
];

export function analyzeTaint(input: string, source: 'user_prompt' | 'file_upload' | 'cli_command' | 'external_payload'): TaintAnalysis {
  if (!input || input.trim().length === 0) {
    return {
      level: 'CLEAN',
      tags: ['INPUT_EMPTY'],
      findings: [],
      quarantineRecommended: false,
      score: 0,
    };
  }

  const findings: string[] = [];
  const tags: string[] = [];
  let score = 0;

  for (const crit of CRITICAL_PATTERNS) {
    if (crit.pattern.test(input)) {
      tags.push(crit.tag);
      findings.push(`[CRÍTICO] ${crit.desc}`);
      score += 75;
    }
  }

  for (const susp of SUSPICIOUS_PATTERNS) {
    if (susp.pattern.test(input)) {
      tags.push(susp.tag);
      findings.push(`[SUSPEITO] ${susp.desc}`);
      score += 20;
    }
  }

  if (source === 'file_upload' || source === 'external_payload') {
    tags.push('EXTERNAL_ORIGIN_UNTRUSTED');
    score += 15;
    findings.push('[ORIGEM] Arquivo/Payload originado de fonte não confiável externa.');
  }

  let level: TaintLevel = 'CLEAN';
  if (score >= 45) {
    level = score >= 70 ? 'LETHAL_EXPLOIT' : 'TAINTED_UNTRUSTED';
  } else if (score >= 15) {
    level = 'SUSPICIOUS';
  }

  const quarantineRecommended = level === 'TAINTED_UNTRUSTED' || level === 'LETHAL_EXPLOIT';

  return {
    level,
    tags,
    findings,
    quarantineRecommended,
    score: Math.min(score, 100),
  };
}
