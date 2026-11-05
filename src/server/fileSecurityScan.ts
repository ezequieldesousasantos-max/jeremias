import fs from 'node:fs';
import path from 'node:path';

export interface FileScanFinding {
  id: string;
  file: string;
  line: number;
  severity: 'medium' | 'high';
  rule: string;
  title: string;
}

export interface FileScanResult {
  roots: string[];
  findings: FileScanFinding[];
  summary: {
    filesScanned: number;
    filesSkipped: number;
    truncated: boolean;
    durationMs: number;
  };
}

interface ScanLimits {
  maxFiles?: number;
  maxMs?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
  maxDepth?: number;
}

const TEXT_EXTENSIONS = new Set([
  '.bat', '.c', '.cc', '.cfg', '.cjs', '.conf', '.cpp', '.cs', '.css', '.env.example',
  '.go', '.h', '.hpp', '.htm', '.html', '.ini', '.java', '.js', '.json', '.jsonc',
  '.jsx', '.kt', '.mjs', '.php', '.ps1', '.py', '.rb', '.rs', '.sh', '.sql',
  '.swift', '.toml', '.ts', '.tsx', '.xml', '.yaml', '.yml',
]);
const SKIP_DIRS = new Set([
  '.git', '.next', '.venv', 'appdata', 'build', 'dist', 'node_modules', 'target',
  'vendor', '$recycle.bin', 'system volume information',
]);
const SENSITIVE_FILE = /^(?:\.env(?:\..*)?|.*(?:secret|credential|password|private[-_.]?key|authorization[-_.]?code).*\.(?:json|txt|key|pem)|auth\.json|audit\.jsonl)$/i;
const RULES: Array<{
  id: string;
  title: string;
  severity: FileScanFinding['severity'];
  pattern: RegExp;
}> = [
  {
    id: 'hardcoded-credential',
    title: 'Possível credencial fixa no código',
    severity: 'high',
    pattern: /\b(?:api[_-]?key|secret|password|passwd|token|private[_-]?key)\b\s*[:=]\s*(['"])([^'"\r\n]{8,})\1/i,
  },
  {
    id: 'disabled-tls-verification',
    title: 'Verificação de certificado TLS desativada',
    severity: 'high',
    pattern: /(?:rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0\b)/i,
  },
  {
    id: 'dynamic-code-execution',
    title: 'Execução dinâmica de código para revisão',
    severity: 'medium',
    pattern: /\beval\s*\(|\bnew\s+Function\s*\(/,
  },
  {
    id: 'shell-execution',
    title: 'Chamada de processo/shell para revisão',
    severity: 'medium',
    pattern: /\b(?:exec|execSync|spawn|spawnSync)\s*\(/,
  },
  {
    id: 'html-injection-sink',
    title: 'Ponto de inserção HTML para revisão',
    severity: 'medium',
    pattern: /dangerouslySetInnerHTML/,
  },
];

function isScannableFile(name: string): boolean {
  if (SENSITIVE_FILE.test(name)) return false;
  const extension = path.extname(name).toLowerCase();
  return TEXT_EXTENSIONS.has(extension);
}

export async function scanAuthorizedFiles(
  roots: string[],
  limits: ScanLimits = {},
): Promise<FileScanResult> {
  const startedAt = Date.now();
  const maxFiles = limits.maxFiles ?? 1500;
  const maxMs = limits.maxMs ?? 5000;
  const maxFileBytes = limits.maxFileBytes ?? 512 * 1024;
  const maxTotalBytes = limits.maxTotalBytes ?? 10 * 1024 * 1024;
  const maxDepth = limits.maxDepth ?? 8;
  const findings: FileScanFinding[] = [];
  let filesScanned = 0;
  let filesSkipped = 0;
  let totalBytes = 0;
  let truncated = false;

  const walk = async (directory: string, depth: number): Promise<void> => {
    if (truncated) return;
    if (depth > maxDepth) {
      filesSkipped++;
      return;
    }

    let handle: fs.Dir;
    try {
      handle = await fs.promises.opendir(directory);
    } catch {
      filesSkipped++;
      return;
    }

    try {
      for await (const entry of handle) {
        if (Date.now() - startedAt >= maxMs || filesScanned >= maxFiles || totalBytes >= maxTotalBytes) {
          truncated = true;
          return;
        }
        if (entry.isSymbolicLink()) {
          filesSkipped++;
          continue;
        }

        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name.toLowerCase()) || entry.name.startsWith('.')) continue;
          await walk(fullPath, depth + 1);
          if (truncated) return;
          continue;
        }
        if (!entry.isFile() || !isScannableFile(entry.name)) continue;

        let stat: fs.Stats;
        try {
          stat = await fs.promises.stat(fullPath);
        } catch {
          filesSkipped++;
          continue;
        }
        if (stat.size > maxFileBytes || totalBytes + stat.size > maxTotalBytes) {
          filesSkipped++;
          continue;
        }

        let content: Buffer;
        try {
          content = await fs.promises.readFile(fullPath);
        } catch {
          filesSkipped++;
          continue;
        }
        filesScanned++;
        totalBytes += content.length;
        if (content.includes(0)) {
          filesSkipped++;
          continue;
        }

        const lines = content.toString('utf8').split(/\r?\n/);
        for (let index = 0; index < lines.length; index++) {
          for (const rule of RULES) {
            if (!rule.pattern.test(lines[index])) continue;
            findings.push({
              id: `${filesScanned}-${index + 1}-${rule.id}`,
              file: fullPath,
              line: index + 1,
              severity: rule.severity,
              rule: rule.id,
              title: rule.title,
            });
          }
        }
      }
    } catch {
      filesSkipped++;
    } finally {
      await handle.close().catch(() => {});
    }
  };

  for (const root of roots) {
    await walk(root, 0);
    if (truncated) break;
  }

  return {
    roots: [...roots],
    findings,
    summary: {
      filesScanned,
      filesSkipped,
      truncated,
      durationMs: Date.now() - startedAt,
    },
  };
}
