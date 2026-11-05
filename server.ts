import dotenv from 'dotenv';
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { timingSafeEqual, randomBytes } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { createCore, VALID_ACTIONS } from './src/server/core.ts';
import { createDockerSandbox, runHostCommand } from './src/server/executor.ts';
import { fileStore } from './src/server/ledgerStore.ts';
import { ALLOWLIST_HELP } from './src/lib/commands.ts';
import { routeLocal, needsWeb, defaultRoots, workDir, validateNewFile, writeNewFile } from './src/server/localTools.ts';
import fs from 'node:fs';
import { withRetry, isTransient, describeModelError } from './src/server/retry.ts';
import { LocalPasswordAuth } from './src/server/localAuth.ts';
import { createSystemMonitor } from './src/server/systemMonitor.ts';
import { createAccessMonitor } from './src/server/accessMonitor.ts';
import { scanAuthorizedFiles } from './src/server/fileSecurityScan.ts';
import type { SystemActionType } from './src/lib/types.ts';

// Com override:true o arquivo vence variáveis já exportadas (e vazias) no terminal,
// e o ÚLTIMO arquivo da lista vence: .env.local tem prioridade sobre .env.
const ENV_DIR = process.env.ENV_DIR || process.cwd();
// No app desktop o Electron define estas variáveis; o .env.local não pode sobrescrevê-las.
const FORCED = process.env.JEREMIAS_TOKEN
  ? (['PORT', 'HOST', 'LEDGER_FILE', 'DIST_DIR', 'JEREMIAS_TOKEN', 'JEREMIAS_AUTH_FILE', 'JEREMIAS_AUTH_CODE_FILE', 'NODE_ENV'] as const).map((k) => [k, process.env[k]] as const)
  : [];
dotenv.config({ path: [path.join(ENV_DIR, '.env'), path.join(ENV_DIR, '.env.local')], override: true, quiet: true });
for (const [k, v] of FORCED) if (v !== undefined) process.env[k] = v;

const PORT = Number(process.env.PORT) || 3000;
// Só a própria máquina acessa. Este servidor executa comandos: não exponha na rede/ngrok.
const HOST = process.env.HOST || '127.0.0.1';
const IS_PROD = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');
// LLM_MODE: auto (padrão) = ferramentas locais -> Ollama -> nuvem só quando precisa, com confirmação
//           local = nunca usa a nuvem | cloud = vai direto ao Gemini (sem confirmar)
// O valor antigo LLM_PROVIDER=ollama equivale a local; LLM_PROVIDER=gemini NÃO liga mais o modo nuvem.
const MODE: 'auto' | 'local' | 'cloud' = (() => {
  const m = (process.env.LLM_MODE || '').toLowerCase();
  if (m === 'local' || m === 'cloud' || m === 'auto') return m;
  return (process.env.LLM_PROVIDER || '').toLowerCase() === 'ollama' ? 'local' : 'auto';
})();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
// Opcional: modelo reserva se o principal continuar fora do ar (alta demanda). Vazio = desligado.
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || '';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = (process.env.OLLAMA_MODEL || 'qwen3.5:4b').trim();
const LEDGER_FILE = process.env.LEDGER_FILE || path.resolve(process.cwd(), 'data', 'audit.jsonl');
const AUTH_FILE = process.env.JEREMIAS_AUTH_FILE || path.join(os.homedir(), '.jeremias-aso', 'auth.json');
const AUTH_CODE_FILE = process.env.JEREMIAS_AUTH_CODE_FILE || path.resolve(process.cwd(), 'codigo-autorizacao.txt');
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE || 'alpine:3';
const MAX_PROMPT_CHARS = 8000;
const MAX_SCRIPT_CHARS = 100_000;

// Nível de raciocínio do Gemini 3.x: auto (padrão) | low | medium | high. 3.8 Flash não aceita 'minimal'.
const THINKING_SETTING = process.env.GEMINI_THINKING_LEVEL || 'auto';
function pickThinkingLevel(prompt: string): string {
  if (THINKING_SETTING !== 'auto') return THINKING_SETTING;
  const analytical = /(analis|audit|compar|explic|por que|porqu[êe]|passo a passo|detalh|arquitetur|avali|investig)/i.test(prompt);
  return prompt.length > 400 || analytical ? 'medium' : 'low';
}

const SYSTEM_INSTRUCTION = `Você é o Jeremias A.S.O. (Assistente Pessoal Otimizado e Segurança Local), um assistente de segurança.
Responda em português do Brasil, de forma objetiva e técnica.
Você apenas SUGERE e ANALISA: nunca afirme ter executado comandos. Comandos só são executados pelo operador, com prefixo "!", e passam por política de segurança.
Se pedirem algo perigoso, explique o risco e proponha uma alternativa segura.`;

const sandboxCtl = createDockerSandbox({ image: SANDBOX_IMAGE, seccompProfile: process.env.SANDBOX_SECCOMP_PROFILE });
const core = createCore({
  store: fileStore(LEDGER_FILE),
  sandbox: { run: sandboxCtl.run, info: sandboxCtl.info },
});
const passwordAuth = new LocalPasswordAuth(AUTH_FILE, AUTH_CODE_FILE);
const systemMonitor = createSystemMonitor();
const accessMonitor = createAccessMonitor();
let fileScanInProgress = false;
const authSessions = new Map<string, number>();
const developerSessions = new Map<string, { expires: number; sessionToken: string }>();
const loginFailures = new Map<string, { count: number; lockedUntil: number }>();
const SESSION_TTL_MS = 12 * 60 * 60_000;
const DEVELOPER_SESSION_TTL_MS = 15 * 60_000;
const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCKOUT_MS = 15 * 60_000;

function sessionToken(req: express.Request): string | undefined {
  const cookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('jeremias_session='));
  return cookie?.slice('jeremias_session='.length);
}

function developerToken(req: express.Request): string | undefined {
  const cookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('jeremias_developer='));
  return cookie?.slice('jeremias_developer='.length);
}

function hasValidSession(req: express.Request): boolean {
  const token = sessionToken(req);
  if (!token) return false;
  const expires = authSessions.get(token);
  if (!expires) return false;
  if (expires <= Date.now()) {
    authSessions.delete(token);
    return false;
  }
  return true;
}

function startAuthSession(res: express.Response): void {
  const now = Date.now();
  for (const [token, expires] of authSessions) if (expires <= now) authSessions.delete(token);
  for (const [token, session] of developerSessions) if (session.expires <= now) developerSessions.delete(token);
  const token = randomBytes(32).toString('hex');
  authSessions.set(token, now + SESSION_TTL_MS);
  res.setHeader('Set-Cookie', `jeremias_session=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${SESSION_TTL_MS / 1000}`);
}

function hasValidDeveloperSession(req: express.Request): boolean {
  const token = developerToken(req);
  const currentSession = sessionToken(req);
  if (!token || !currentSession || !hasValidSession(req)) return false;
  const session = developerSessions.get(token);
  if (!session) return false;
  if (session.expires <= Date.now()) {
    developerSessions.delete(token);
    return false;
  }
  return session.sessionToken === currentSession;
}

function startDeveloperSession(req: express.Request, res: express.Response): void {
  const now = Date.now();
  for (const [token, session] of developerSessions) if (session.expires <= now) developerSessions.delete(token);
  const currentSession = sessionToken(req);
  if (!currentSession) return;
  const token = randomBytes(32).toString('hex');
  developerSessions.set(token, { expires: now + DEVELOPER_SESSION_TTL_MS, sessionToken: currentSession });
  res.setHeader('Set-Cookie', `jeremias_developer=${token}; HttpOnly; SameSite=Strict; Path=/api/developer; Max-Age=${DEVELOPER_SESSION_TTL_MS / 1000}`);
}

function clearDeveloperSession(req: express.Request, res: express.Response): void {
  const token = developerToken(req);
  if (token) developerSessions.delete(token);
  res.setHeader('Set-Cookie', 'jeremias_developer=; HttpOnly; SameSite=Strict; Path=/api/developer; Max-Age=0');
}

function clearAuthSession(req: express.Request, res: express.Response): void {
  const token = sessionToken(req);
  if (token) authSessions.delete(token);
  res.setHeader('Set-Cookie', 'jeremias_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0');
}

let aiClient: GoogleGenAI | null = null;
function getAi(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) aiClient = new GoogleGenAI({ apiKey });
  return aiClient;
}

const WORK_DIR = workDir();
/** Pastas liberadas para busca, leitura e hash: as configuradas + a pasta de trabalho (quando já existe). */
const getRoots = (): string[] => [...new Set([...defaultRoots(), ...(fs.existsSync(WORK_DIR) ? [WORK_DIR] : [])])];

// ---------- Ollama (local) ----------
let ollamaState: { ok: boolean; at: number } = { ok: false, at: 0 };
async function ollamaAvailable(): Promise<boolean> {
  if (Date.now() - ollamaState.at < 15_000) return ollamaState.ok;
  let ok = false;
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) {
      const data: any = await r.json();
      const base = OLLAMA_MODEL.split(':')[0];
      ok = Array.isArray(data?.models) && data.models.some((m: any) => String(m?.name || '').startsWith(base));
    }
  } catch { ok = false; }
  ollamaState = { ok, at: Date.now() };
  return ok;
}

async function askOllama(prompt: string): Promise<string> {
  const history = core.history();
  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      think: false,
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        ...history.map((h) => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.text })),
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!r.ok) throw new Error(`Ollama respondeu ${r.status}. O modelo "${OLLAMA_MODEL}" foi baixado? (ollama pull ${OLLAMA_MODEL})`);
  const data: any = await r.json();
  return data?.message?.content || 'Sem resposta gerada pelo modelo.';
}

// ---------- Gemini (nuvem): só chamado após decisão do roteador / confirmação ----------
/** Envia SOMENTE o prompt atual: o histórico da conversa não sai da máquina. */
async function askGemini(prompt: string, web: boolean): Promise<string> {
  const ai = getAi();
  if (!ai) throw new Error('GEMINI_API_KEY não configurada. Defina-a no .env.local e reinicie o servidor.');

  const callGemini = async (model: string) => {
    const response: any = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingLevel: pickThinkingLevel(prompt) as any },
        ...(web ? { tools: [{ googleSearch: {} }] } : {}),
      },
    });
    let text: string = response.text || 'Sem resposta gerada pelo modelo.';
    if (web) {
      const chunks: any[] = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const seen = new Set<string>();
      const src = chunks
        .map((c) => c?.web)
        .filter((w) => w?.uri && !seen.has(w.uri) && seen.add(w.uri))
        .slice(0, 5)
        .map((w) => `• ${w.title || w.uri}: ${w.uri}`);
      if (src.length) text += `\n\nFontes:\n${src.join('\n')}`;
    }
    return text;
  };

  try {
    return await withRetry(() => callGemini(GEMINI_MODEL)); // 503/queda de conexão: 3 tentativas (1,5 s, 4 s, 9 s)
  } catch (e) {
    // 429 (cota) e chave inválida não são temporários: falham na hora, sem modelo reserva
    if (GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_MODEL && isTransient(e)) {
      return await withRetry(() => callGemini(GEMINI_FALLBACK_MODEL), { delaysMs: [1500] });
    }
    throw e;
  }
}

// ---------- Criação de arquivos aguardando o "sim" do operador (só em memória, expiram em 5 min) ----------
const pendingWrites = new Map<string, { name: string; content: string; expires: number }>();
function proposeWrite(name: string, content: string) {
  const v = validateNewFile(name, content);
  if (!v.ok) return { error: v.error } as const;
  for (const [k, w] of pendingWrites) if (w.expires < Date.now()) pendingWrites.delete(k);
  if (pendingWrites.size >= 20) pendingWrites.delete(pendingWrites.keys().next().value as string);
  const id = `fil-${randomBytes(4).toString('hex')}`;
  pendingWrites.set(id, { name, content, expires: Date.now() + 5 * 60_000 });
  return {
    id,
    path: path.join(WORK_DIR, name),
    bytes: Buffer.byteLength(content, 'utf8'),
    preview: content.length > 600 ? `${content.slice(0, 600)}…` : content,
  } as const;
}

// ---------- Pedidos à nuvem aguardando o "sim" do operador (só em memória, expiram em 5 min) ----------
const pendingCloud = new Map<string, { prompt: string; web: boolean; expires: number }>();
function addPending(prompt: string, web: boolean): string {
  for (const [k, v] of pendingCloud) if (v.expires < Date.now()) pendingCloud.delete(k);
  if (pendingCloud.size >= 20) pendingCloud.delete(pendingCloud.keys().next().value as string);
  const id = `cld-${randomBytes(4).toString('hex')}`;
  pendingCloud.set(id, { prompt, web, expires: Date.now() + 5 * 60_000 });
  return id;
}

async function startServer() {
  await passwordAuth.initializeAuthorizationCode();
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.use('/api', (req, res, next) => {
    if (req.path === '/security/access-log') return next();
    res.on('finish', () => {
      accessMonitor.record({ method: req.method, path: req.path, status: res.statusCode });
    });
    next();
  });

  // Bloqueia requisições vindas de OUTROS sites (CSRF): o navegador envia Origin e ele
  // precisa ser o mesmo host do servidor. Ferramentas locais (curl) não enviam Origin.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) {
          return res.status(403).json({ error: 'Origem não permitida.' });
        }
      } catch {
        return res.status(403).json({ error: 'Origem inválida.' });
      }
    }
    next();
  });

  // No app desktop, só a janela do Jeremias (que conhece o token) fala com a API.
  // Outros programas da máquina que descobrirem a porta recebem 401.
  const TOKEN = process.env.JEREMIAS_TOKEN;
  if (TOKEN) {
    const expected = Buffer.from(TOKEN);
    app.use('/api', (req, res, next) => {
      const given = Buffer.from(String(req.headers['x-jeremias-token'] ?? ''));
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return res.status(401).json({ error: 'Não autorizado.' });
      }
      next();
    });
  }

  app.get('/api/auth/status', (req, res) => {
    res.json({
      setupRequired: !passwordAuth.configured,
      authenticated: passwordAuth.configured && hasValidSession(req),
    });
  });

  app.post('/api/auth/setup', async (req, res) => {
    if (passwordAuth.configured) return res.status(409).json({ error: 'A senha já foi configurada. Entre com sua senha.' });
    const { password } = req.body ?? {};
    if (typeof password !== 'string') return res.status(400).json({ error: 'Informe uma senha.' });
    try {
      await passwordAuth.setup(password);
      loginFailures.clear();
      startAuthSession(res);
      return res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro inesperado ao configurar a senha.';
      if (message.includes('já foi configurada')) return res.status(409).json({ error: message });
      if (message.startsWith('A senha deve')) return res.status(400).json({ error: message });
      console.error('[ERRO AUTENTICAÇÃO]:', message);
      return res.status(500).json({ error: 'Não foi possível salvar a senha com segurança.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    if (!passwordAuth.configured) return res.status(409).json({ error: 'Configure uma senha antes de entrar.' });
    const address = req.socket.remoteAddress || 'local';
    const attempt = loginFailures.get(address);
    if (attempt && attempt.lockedUntil > Date.now()) {
      const retryAfter = Math.ceil((attempt.lockedUntil - Date.now()) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: `Muitas tentativas. Tente novamente em ${Math.ceil(retryAfter / 60)} minuto(s).` });
    }

    const password = req.body?.password;
    const valid = typeof password === 'string' && await passwordAuth.verify(password);
    if (!valid) {
      const count = attempt && attempt.lockedUntil > 0 && attempt.lockedUntil <= Date.now() ? 0 : attempt?.count ?? 0;
      const nextCount = count + 1;
      loginFailures.set(address, {
        count: nextCount,
        lockedUntil: nextCount >= MAX_LOGIN_FAILURES ? Date.now() + LOGIN_LOCKOUT_MS : 0,
      });
      if (nextCount >= MAX_LOGIN_FAILURES) {
        res.setHeader('Retry-After', String(LOGIN_LOCKOUT_MS / 1000));
        return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em 15 minutos.' });
      }
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    loginFailures.delete(address);
    startAuthSession(res);
    return res.json({ ok: true });
  });

  app.post('/api/auth/change-password', async (req, res) => {
    const { currentPassword, authorizationCode, newPassword } = req.body ?? {};
    if (
      typeof currentPassword !== 'string' ||
      typeof authorizationCode !== 'string' ||
      typeof newPassword !== 'string'
    ) {
      return res.status(400).json({ error: 'Senha atual, código de autorização e nova senha são obrigatórios.' });
    }

    try {
      await passwordAuth.updatePassword(currentPassword, authorizationCode, newPassword);
      authSessions.clear();
      startAuthSession(res);
      return res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro inesperado ao trocar a senha.';
      if (message.includes('inválido')) return res.status(401).json({ error: message });
      if (message.startsWith('A senha deve')) return res.status(400).json({ error: message });
      if (message.includes('em andamento')) return res.status(409).json({ error: message });
      console.error('[ERRO TROCA DE SENHA]:', message);
      return res.status(500).json({ error: 'Não foi possível trocar a senha com segurança.' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    if (hasValidSession(req)) core.purgeRam();
    clearAuthSession(req, res);
    res.json({ ok: true });
  });

  app.use('/api', (req, res, next) => {
    if (passwordAuth.configured && hasValidSession(req)) return next();
    return res.status(401).json({ error: 'Sessão encerrada. Entre novamente.' });
  });

  app.post('/api/developer/unlock', async (req, res) => {
    const address = req.socket.remoteAddress || 'local';
    const attempt = loginFailures.get(address);
    if (attempt && attempt.lockedUntil > Date.now()) {
      const retryAfter = Math.ceil((attempt.lockedUntil - Date.now()) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: `Muitas tentativas. Tente novamente em ${Math.ceil(retryAfter / 60)} minuto(s).` });
    }

    const password = req.body?.password;
    const valid = typeof password === 'string' && await passwordAuth.verify(password);
    if (!valid) {
      const count = attempt && attempt.lockedUntil > 0 && attempt.lockedUntil <= Date.now() ? 0 : attempt?.count ?? 0;
      const nextCount = count + 1;
      loginFailures.set(address, {
        count: nextCount,
        lockedUntil: nextCount >= MAX_LOGIN_FAILURES ? Date.now() + LOGIN_LOCKOUT_MS : 0,
      });
      if (nextCount >= MAX_LOGIN_FAILURES) {
        res.setHeader('Retry-After', String(LOGIN_LOCKOUT_MS / 1000));
        return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em 15 minutos.' });
      }
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    loginFailures.delete(address);
    if (!sessionToken(req)) return res.status(401).json({ error: 'Sessão encerrada. Entre novamente.' });
    startDeveloperSession(req, res);
    return res.json({ ok: true, expiresInSeconds: DEVELOPER_SESSION_TTL_MS / 1000 });
  });

  app.post('/api/developer/lock', (req, res) => {
    clearDeveloperSession(req, res);
    res.json({ ok: true });
  });

  app.use('/api/developer', (req, res, next) => {
    if (hasValidDeveloperSession(req)) return next();
    return res.status(401).json({ error: 'Área do desenvolvedor bloqueada ou autorização expirada.' });
  });

  app.get('/api/developer/overview', (_req, res) => {
    const snapshot = core.getSnapshot();
    res.json({
      mode: IS_PROD ? 'production' : 'development',
      nodeVersion: process.version,
      platform: os.platform(),
      architecture: os.arch(),
      uptimeSeconds: Math.floor(process.uptime()),
      roots: getRoots(),
      sandbox: sandboxCtl.info(),
      system: {
        auditChainLength: snapshot.status.auditChainLength,
        chainIntegrity: snapshot.status.chainIntegrity,
        pendingApprovals: snapshot.approvals.filter((approval) => approval.status === 'pending').length,
      },
    });
  });

  app.post('/api/developer/scan', async (_req, res) => {
    if (fileScanInProgress) return res.status(409).json({ error: 'Já existe uma varredura em andamento.' });
    fileScanInProgress = true;
    try {
      const result = await scanAuthorizedFiles(getRoots());
      return res.json(result);
    } catch (error) {
      console.error('[VARREDURA DE ARQUIVOS]:', error);
      return res.status(500).json({ error: 'Não foi possível concluir a varredura das pastas autorizadas.' });
    } finally {
      fileScanInProgress = false;
    }
  });

  app.post('/api/developer/audit/verify', (_req, res) => res.json(core.verifyLedger()));

  app.get('/api/security/access-log', (_req, res) => res.json(accessMonitor.snapshot()));
  app.get('/api/system/status', (_req, res) => res.json(core.getSnapshot()));
  app.get('/api/system/components', async (_req, res) => {
    try {
      res.json(await systemMonitor());
    } catch (error) {
      console.error('[MONITOR DO SISTEMA]:', error);
      res.status(503).json({ error: 'Não foi possível coletar as medições do computador.' });
    }
  });

  // ---------- Chat e comandos: a política decide ANTES de qualquer execução ----------
  app.post('/api/jeremias/chat', async (req, res) => {
    const prompt = req.body?.prompt;
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt é obrigatório.' });
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
      return res.status(413).json({ error: `Prompt excede ${MAX_PROMPT_CHARS} caracteres.` });
    }
    if (prompt.trim() === '!') {
      return res.json({
        reply: `Use "!" seguido de um comando. Rodam direto (somente leitura): ${ALLOWLIST_HELP}.\nOutros comandos limpos exigem sua aprovação e rodam apenas no sandbox.`,
      });
    }

    const gate = core.gateChat(prompt);
    const { policyResult } = gate;

    const threePillars = {
      modelAnalysis: `Input: ${gate.inputBytes} bytes. Taint: ${policyResult.taintLevel} (score ${gate.taintScore}/100). Ação: ${gate.action}.${
        gate.allowModelCall ? ' Roteador: local primeiro; nuvem só com confirmação.' : ''
      }`,
      opaAuthorization: `Regra: ${policyResult.matchedRuleId} → ${policyResult.decision}.`,
      osEnforcement: gate.allowHostExec
        ? 'Comando da lista permitida, executado sem shell, com timeout e saída limitada.'
        : gate.needsApproval
        ? 'Nada executou. Se aprovado, rodará somente no sandbox (Docker), nunca no host.'
        : gate.allowModelCall
        ? 'Nenhuma syscall do host foi emitida por esta consulta; apenas inferência no modelo.'
        : 'Barrado antes de tocar o host; nada foi enviado ao modelo.',
    };
    const base = { threePillars, policyResult, taint: { level: policyResult.taintLevel }, auditBlock: gate.auditBlock };

    if (gate.purged) {
      return res.json({
        ...base,
        reply: '[PURGA CONCLUÍDA] O histórico de conversa em memória foi sobrescrito com zeros (0x00) e descartado. Nada de conversa é gravado em disco.',
      });
    }

    // ----- comando "!" -----
    if (gate.mode === 'command') {
      if (gate.allowHostExec && gate.argv) {
        const out = await runHostCommand(gate.argv);
        core.recordHostExecution(gate.command!, out);
        const body = [out.stdout.trim(), out.stderr.trim() && `[stderr] ${out.stderr.trim()}`, out.error && `[erro] ${out.error}`]
          .filter(Boolean)
          .join('\n');
        return res.json({ ...base, reply: `$ ${gate.command}\n${body || '(sem saída)'}` });
      }
      if (gate.needsApproval) {
        const ap = core.createApproval({
          command: gate.command!,
          policyId: policyResult.matchedRuleId,
          reason: policyResult.reason,
        });
        return res.json({
          ...base,
          reply: `[APROVAÇÃO NECESSÁRIA] "${gate.command}" não está na lista permitida.\nPedido ${ap.id} aguarda sua decisão na aba "Barreira Zero-Trust". Se aprovado, roda SOMENTE no sandbox.`,
        });
      }
      return res.json({
        ...base,
        reply: `[${policyResult.decision}] Comando não executado.\nRegra: ${policyResult.matchedRuleId} — ${policyResult.matchedRuleName}\nMotivo: ${policyResult.reason}`,
      });
    }

    // ----- chat bloqueado / quarentena / aprovação -----
    if (!gate.allowModelCall) {
      const why: Record<string, string> = {
        DENY: 'Ação NEGADA pela política Zero-Trust.',
        SANDBOX_QUARANTINE: 'Entrada em QUARENTENA: só pode ser analisada no sandbox isolado.',
        REQUIRE_HUMAN_APPROVAL: 'Esta ação exige APROVAÇÃO HUMANA e não tem executor no chat.',
        ALLOW: 'Ação permitida, mas não há execução associada a este pedido.',
      };
      return res.json({
        ...base,
        reply: `[${policyResult.decision}] ${why[policyResult.decision]}\n\nRegra: ${policyResult.matchedRuleId} — ${policyResult.matchedRuleName}\nMotivo: ${policyResult.reason}`,
      });
    }

    // ----- chat autorizado: roteador local -> Ollama -> nuvem (só quando precisa) -----
    const withEngine = (engine: string, detail: string, extra: object = {}) => ({
      ...base,
      engine,
      threePillars: { ...threePillars, modelAnalysis: `${threePillars.modelAnalysis} Motor: ${detail}` },
      ...extra,
    });
    const askCloudConfirm = (web: boolean, why: string) => {
      const id = addPending(prompt, web);
      return withEngine('pending', 'aguardando sua confirmação (nada foi enviado)', {
        reply: `${why}\n\nSe você confirmar, SOMENTE este texto (${Buffer.byteLength(prompt)} bytes) vai para a nuvem do Google${web ? ', com busca na web' : ''}. O histórico da conversa e arquivos não vão.`,
        pendingCloud: { id, web, bytes: Buffer.byteLength(prompt) },
      });
    };

    try {
      // 1) ferramentas locais (sem IA, sem internet)
      const local = await routeLocal(prompt, { roots: getRoots() });
      if (local) {
        if (local.pendingWrite) {
          const pw = proposeWrite(local.pendingWrite.name, local.pendingWrite.content);
          if ('error' in pw) return res.json(withEngine('local', 'criar arquivo (recusado)', { reply: pw.error }));
          return res.json(withEngine('pending', 'aguardando sua confirmação (nada foi gravado)', {
            reply: `Vou criar o arquivo abaixo. Nada é gravado até você confirmar.\n\nCaminho: ${pw.path}\nTamanho: ${pw.bytes} bytes\nConteúdo:\n${pw.preview || '(vazio)'}\n\nSe o nome já existir, o Jeremias não sobrescreve: cria "nome (2)".`,
            pendingWrite: { id: pw.id, path: pw.path, bytes: pw.bytes },
          }));
        }
        if (local.touchesFiles) core.recordLocalTool(local.tool);
        // resposta local NÃO entra no histórico (que pode alimentar um modelo depois)
        return res.json(withEngine('local', `ferramenta local "${local.tool}" (sem IA, sem internet)`, { reply: local.text }));
      }

      const web = needsWeb(prompt);

      // 2) modo nuvem explícito
      if (MODE === 'cloud') {
        const reply = await askGemini(prompt, web);
        core.recordCloudCall({ bytes: Buffer.byteLength(prompt), web });
        core.remember('user', prompt);
        core.remember('model', reply);
        return res.json(withEngine('cloud', `${GEMINI_MODEL} na nuvem (modo cloud)`, { reply }));
      }

      // 3) precisa de internet / informação atual
      if (web) {
        if (MODE === 'local') {
          return res.json(withEngine('local', 'modo local (sem internet)', {
            reply: 'Isto precisa de informação da internet, e o Jeremias está em modo local (LLM_MODE=local). Troque para LLM_MODE=auto para permitir a nuvem com confirmação.',
          }));
        }
        return res.json(askCloudConfirm(true, 'Esta pergunta precisa de pesquisa na internet ou de informação atual, que o modelo local não tem.'));
      }

      // 4) conversa geral: modelo local (Ollama) se existir
      if (await ollamaAvailable()) {
        const reply = await askOllama(prompt);
        core.remember('user', prompt);
        core.remember('model', reply);
        return res.json(withEngine('local-llm', `${OLLAMA_MODEL} via Ollama (local, os dados não saem desta máquina)`, { reply }));
      }

      // 5) sem modelo local
      if (MODE === 'local') {
        return res.json(withEngine('local', 'modo local', {
          reply: `O Ollama não está disponível ou o modelo "${OLLAMA_MODEL}" não foi baixado (ollama pull ${OLLAMA_MODEL}). Em modo local não uso a nuvem.`,
        }));
      }
      return res.json(askCloudConfirm(false, 'Não achei um modelo local (Ollama) para responder esta pergunta, e nenhuma ferramenta offline a resolve.'));
    } catch (error: any) {
      console.error('[ERRO MODELO]:', error?.message || error);
      return res.json({ ...base, engine: 'error', reply: `[ERRO NO MOTOR] ${describeModelError(error)}` });
    }
  });

  // ---------- Confirmação (ou recusa) do envio à nuvem ----------
  app.post('/api/jeremias/cloud/confirm', async (req, res) => {
    const id = String(req.body?.id ?? '');
    const p = pendingCloud.get(id);
    pendingCloud.delete(id); // uso único
    if (!p || p.expires < Date.now()) return res.status(404).json({ error: 'Pedido expirado ou inexistente. Envie a pergunta de novo.' });
    try {
      const reply = await askGemini(p.prompt, p.web);
      const auditBlock = core.recordCloudCall({ bytes: Buffer.byteLength(p.prompt), web: p.web });
      core.remember('user', p.prompt);
      core.remember('model', reply);
      res.json({ reply, engine: 'cloud', engineDetail: `${GEMINI_MODEL} na nuvem (confirmado por você)`, auditBlock });
    } catch (error: any) {
      console.error('[ERRO NUVEM]:', error?.message || error);
      res.json({ reply: `[ERRO NA NUVEM] ${describeModelError(error)}`, engine: 'error' });
    }
  });
  // ---------- Criação de arquivos: propor (a partir de uma resposta), confirmar, cancelar ----------
  app.post('/api/files/propose', (req, res) => {
    const { name, content } = req.body ?? {};
    if (typeof name !== 'string' || typeof content !== 'string') return res.status(400).json({ error: 'name e content são obrigatórios.' });
    const pw = proposeWrite(name.trim(), content);
    if ('error' in pw) return res.json({ reply: pw.error });
    res.json({
      reply: `Vou criar o arquivo abaixo. Nada é gravado até você confirmar.\n\nCaminho: ${pw.path}\nTamanho: ${pw.bytes} bytes\nConteúdo:\n${pw.preview || '(vazio)'}`,
      pendingWrite: { id: pw.id, path: pw.path, bytes: pw.bytes },
    });
  });
  app.post('/api/files/confirm', async (req, res) => {
    const id = String(req.body?.id ?? '');
    const w = pendingWrites.get(id);
    pendingWrites.delete(id); // uso único
    if (!w || w.expires < Date.now()) return res.status(404).json({ error: 'Pedido expirado ou inexistente. Peça de novo.' });
    try {
      const finalPath = await writeNewFile(WORK_DIR, w.name, w.content);
      const auditBlock = core.recordFileWrite({ bytes: Buffer.byteLength(w.content, 'utf8'), ext: (w.name.split('.').pop() || '').toLowerCase() });
      res.json({ reply: `Arquivo criado:\n${finalPath}`, auditBlock });
    } catch (e: any) {
      res.json({ reply: `[ERRO AO CRIAR] ${e?.message || 'erro desconhecido'}` });
    }
  });
  app.post('/api/files/cancel', (req, res) => {
    pendingWrites.delete(String(req.body?.id ?? ''));
    res.json({ ok: true, reply: 'Cancelado. Nada foi gravado.' });
  });

  app.post('/api/jeremias/cloud/cancel', (req, res) => {
    pendingCloud.delete(String(req.body?.id ?? ''));
    res.json({ ok: true, reply: 'Cancelado. Nada foi enviado à nuvem.' });
  });

  // ---------- Simulador de políticas (dry-run: avalia e registra, não executa nada) ----------
  app.post('/api/policy/evaluate', (req, res) => {
    const { action, target, payload, networkDestination } = req.body ?? {};
    if (!VALID_ACTIONS.includes(action)) return res.status(400).json({ error: 'Ação inválida.' });
    const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, MAX_SCRIPT_CHARS) : undefined);
    const { policyResult, auditBlock } = core.evaluate({
      action: action as SystemActionType,
      target: str(target),
      payload: str(payload),
      networkDestination: str(networkDestination),
      actor: 'policy_simulator',
    });
    res.json({ policyResult, auditBlock });
  });

  // ---------- Sandbox (Docker real) ----------
  app.post('/api/sandbox/execute', async (req, res) => {
    const { scriptName, scriptContent } = req.body ?? {};
    if (typeof scriptName !== 'string' || typeof scriptContent !== 'string') {
      return res.status(400).json({ error: 'scriptName e scriptContent são obrigatórios.' });
    }
    if (scriptContent.length > MAX_SCRIPT_CHARS) return res.status(413).json({ error: 'Script grande demais.' });
    res.json(await core.runSandbox(scriptName.slice(0, 120), scriptContent));
  });

  // ---------- Aprovação humana ----------
  app.post('/api/approvals/:id/approve', async (req, res) => {
    const a = core.takeApproval(req.params.id);
    if (!a) return res.status(404).json({ error: 'Pedido inexistente ou já resolvido.' });
    const run = await sandboxCtl.run(a.command);
    res.json(core.completeApproval(a.id, run));
  });
  app.post('/api/approvals/:id/deny', (req, res) => {
    const r = core.denyApproval(req.params.id);
    if (!r) return res.status(404).json({ error: 'Pedido inexistente ou já resolvido.' });
    res.json(r);
  });

  // ---------- Ledger ----------
  app.post('/api/audit/verify', (_req, res) => res.json(core.verifyLedger()));
  app.post('/api/audit/simulate-tamper', (_req, res) => res.json(core.simulateTamper())); // só em memória
  app.post('/api/audit/reset', (_req, res) => {
    core.reloadLedger(); // restaura do disco; nunca apaga registros
    res.json({ ok: true });
  });

  // ---------- RAM ----------
  app.post('/api/ram/purge', (_req, res) => {
    const { policyResult, auditBlock } = core.purgeRam();
    res.json({ ok: policyResult.decision === 'ALLOW', policyResult, auditBlock });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  // ---------- Front-end ----------
  if (!IS_PROD) {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = process.env.DIST_DIR || path.resolve(process.cwd(), 'dist');
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  await sandboxCtl.refresh();
  const sandboxTimer: any = setInterval(() => void sandboxCtl.refresh(), 30_000);
  sandboxTimer.unref?.(); // não impede o processo de encerrar

  app.listen(PORT, HOST, () => {
    console.log(`Jeremias A.S.O. em http://localhost:${PORT} (${IS_PROD ? 'produção' : 'desenvolvimento'}) · escutando em ${HOST}`);
    console.log(`Ledger: ${LEDGER_FILE}`);
    console.log(`Sandbox: ${sandboxCtl.info().detail}${sandboxCtl.info().available ? '' : ' → scripts NÃO serão executados'}`);
    console.log(`Modo: ${MODE} · pastas liberadas para busca/hash: ${getRoots().join(' | ') || '(nenhuma: defina JEREMIAS_FILE_ROOTS)'} · pasta de trabalho (onde ele cria arquivos): ${WORK_DIR}`);
    void ollamaAvailable().then((ok) =>
      console.log(ok ? `✔ Ollama local pronto (${OLLAMA_MODEL})` : `ℹ Ollama/modelo ${OLLAMA_MODEL} não encontrado: conversa geral pedirá confirmação para usar a nuvem`)
    );
    console.log(process.env.GEMINI_API_KEY ? `Gemini disponível (${GEMINI_MODEL}), usado só quando preciso e confirmado` : 'ℹ GEMINI_API_KEY ausente: sem nuvem (hora, contas, arquivos e Ollama seguem funcionando)');
  });
}

startServer();
