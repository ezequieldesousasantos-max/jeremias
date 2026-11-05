import React, { useState, useEffect } from 'react';
import { Navbar, type Tab } from './components/Navbar.tsx';
import { ApprovalQueue } from './components/ApprovalQueue.tsx';
import { AgentConsole } from './components/AgentConsole.tsx';
import { ZeroTrustPolicyBarrier } from './components/ZeroTrustPolicyBarrier.tsx';
import { TaintSandboxView } from './components/TaintSandboxView.tsx';
import { AuditLedgerView } from './components/AuditLedgerView.tsx';
import { AnomalyMonitor } from './components/AnomalyMonitor.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { ChangePasswordDialog } from './components/ChangePasswordDialog.tsx';
import { SystemMonitor } from './components/SystemMonitor.tsx';
import { AccessMonitor } from './components/AccessMonitor.tsx';
import { DeveloperPanel } from './components/DeveloperPanel.tsx';
import { DeveloperActivityMonitor } from './components/DeveloperActivityMonitor.tsx';
import { BrowserWorkspace } from './components/BrowserWorkspace.tsx';
import { GameRoom } from './components/GameRoom.tsx';
import { normalizePublicSiteUrl, siteToOpen } from './lib/publicSiteUrl.ts';
import { readNdjson } from './lib/chatStream.ts';
import {
  AnomalyAlert,
  EdgeSystemStatus,
  JeremiasMessage,
  PendingApproval,
  PolicyEvaluationResult,
  SandboxExecution,
  SecurityAuditEvent,
  SystemActionType,
} from './lib/types.ts';
import { createGenesisBlock } from './lib/auditLedger.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('console');
  const [authMode, setAuthMode] = useState<'checking' | 'unavailable' | 'setup' | 'login' | 'authenticated'>('checking');
  const [developmentMode, setDevelopmentMode] = useState(false);
  const [authError, setAuthError] = useState('');
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  // Modo assistente (padrão) esconde as abas de estudo/demonstração. A escolha fica lembrada neste navegador.
  const [advanced, setAdvanced] = useState<boolean>(() => {
    try {
      return localStorage.getItem('jeremias.advanced') === '1';
    } catch {
      return false;
    }
  });
  const toggleAdvanced = () => {
    const next = !advanced;
    setAdvanced(next);
    try {
      localStorage.setItem('jeremias.advanced', next ? '1' : '0');
    } catch {
      /* sem armazenamento: só não lembra a escolha */
    }
    // sai de abas que só existem no outro modo
    setActiveTab((tab) =>
      next ? (tab === 'approvals' ? 'policies' : tab) : tab === 'console' || tab === 'games' || tab === 'audit' || tab === 'components' || tab === 'accesses' ? tab : tab === 'policies' ? 'approvals' : 'console'
    );
  };

  const [status, setStatus] = useState<EdgeSystemStatus>({
    // Valores neutros até o servidor responder (nada aqui é medição)
    osKernel: '—',
    architecture: '—',
    edgeNodeId: '—',
    sovereigntyMode: 'STRICT_LOCAL_FIRST',
    zeroTrustStatus: 'ACTIVE_ENFORCED',
    cpuLimitPercentage: 0,
    ramTotalMb: 0,
    ramVolatileUsedMb: 0,
    isRamVolatileWiped: false,
    taintedEntitiesCount: 0,
    seccompStatus: 'UNAVAILABLE',
    cgroupsStatus: 'UNAVAILABLE',
    activeMicroVMs: 0,
    blockedSyscallsCount: 0,
    auditChainLength: 1,
    chainIntegrity: 'VERIFIED',
  });

  const [messages, setMessages] = useState<JeremiasMessage[]>([
    {
      id: 'init-msg-1',
      sender: 'jeremias',
      text: `Sistemas operacionais nominais. Sou o Jeremias A.S.O. (Assistente Pessoal Otimizado e Segurança Local).

O que está de fato ativo neste nó:
1. Memória efêmera: o histórico da conversa vive só na RAM do servidor e é sobrescrito com zeros (0x00) quando você purga. Nada de conversa vai para o disco.
2. Zero-Trust: toda ação passa pelo motor de políticas (negado por padrão) e fica registrada no ledger SHA-256 gravado em disco.
3. Local primeiro: hora, contas, conversões, validação de CPF/CNPJ/e-mail, busca de arquivos e hash rodam aqui, sem internet e sem IA. Conversa geral vai para o modelo local (Ollama), se instalado. A nuvem (Gemini) só entra para pesquisa na internet ou se não houver modelo local, e sempre depois do seu "sim". Cada resposta traz uma etiqueta mostrando quem respondeu.
4. Execução controlada: use "!comando". Rodam direto só os somente-leitura da lista permitida (!hostname e !whoami em qualquer sistema; !uname, !uptime, !df e !free só existem em Linux/Mac). No Windows, prefira perguntar em português: "quanta memória livre?", "quanto espaço livre no disco?". Os demais comandos exigem sua aprovação e rodam apenas no sandbox Docker, se disponível.

Qual a diretiva de segurança ou tarefa a executar?`,
      timestamp: new Date().toISOString(),
      threePillars: {
        modelAnalysis: 'Modelo configurado no servidor (Gemini na nuvem ou Ollama local).',
        opaAuthorization: 'Catálogo de políticas carregado. Postura padrão: Default Deny.',
        osEnforcement: 'Comandos só executam via política; scripts, apenas no sandbox Docker.',
      },
      isEphemeral: true,
      auditRefId: 'evt-0000',
    },
  ]);

  const [alerts, setAlerts] = useState<AnomalyAlert[]>([
    {
      id: 'alt-001',
      timestamp: new Date().toISOString(),
      severity: 'low',
      title: 'Inicialização de Guarda Local Zero-Trust',
      details: 'Políticas OPA ativas. Rastreamento Taint e memória volátil configurados.',
      ruleTriggered: 'POL-06-LOCAL-DIAGNOSTICS',
      mitigationTaken: 'Status nominal. Zero-Trust em execução.',
    },
  ]);

  const [sandboxes, setSandboxes] = useState<SandboxExecution[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [auditChain, setAuditChain] = useState<SecurityAuditEvent[]>([createGenesisBlock()]);
  const [isLoadingMessage, setIsLoadingMessage] = useState(false);
  const [isPurgingRam, setIsPurgingRam] = useState(false);
  const [highlightAuditId, setHighlightAuditId] = useState<string | undefined>();

  const refreshAuth = async () => {
    try {
      const res = await fetch('/api/auth/status');
      if (!res.ok) throw new Error(`Servidor local respondeu ${res.status}.`);
      const data = await res.json();
      setDevelopmentMode(data.developmentMode === true);
      setAuthMode(data.authenticated ? 'authenticated' : data.setupRequired ? 'setup' : 'login');
      setAuthError('');
    } catch (err) {
      setAuthMode('unavailable');
      setAuthError(err instanceof Error ? err.message : 'Não foi possível conectar ao servidor local.');
    }
  };

  useEffect(() => {
    void refreshAuth();
  }, []);

  const handleAuthSubmit = async (password: string) => {
    setAuthError('');
    try {
      const endpoint = authMode === 'setup' ? '/api/auth/setup' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Não foi possível entrar (${res.status}).`);
      setAuthMode('authenticated');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Não foi possível autenticar.');
    }
  };

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error(`Não foi possível encerrar a sessão (${res.status}).`);
      setMessages([]);
      setAuthMode('login');
      setAuthError('');
    } catch (err) {
      console.error('[ERRO AO ENCERRAR SESSÃO]:', err);
    }
  };

  const handleChangePassword = async (currentPassword: string, authorizationCode: string, newPassword: string) => {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, authorizationCode, newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Não foi possível trocar a senha (${res.status}).`);
    setChangePasswordOpen(false);
    setMessages((prev) => [
      ...prev,
      {
        id: `password-${Date.now()}`,
        sender: 'system',
        text: 'Senha alterada com autorização. As outras sessões foram encerradas.',
        timestamp: new Date().toISOString(),
        isEphemeral: true,
      },
    ]);
  };

  const handleTabChange = (tab: Tab) => {
    if (activeTab === 'developer' && tab !== activeTab) {
      void fetch('/api/developer/lock', { method: 'POST' })
        .then((response) => {
          if (!response.ok) throw new Error(`Não foi possível bloquear a área de desenvolvedor (${response.status}).`);
        })
        .catch((error) => console.error('[ERRO AO BLOQUEAR ÁREA DE DESENVOLVEDOR]:', error));
    }
    setActiveTab(tab);
  };

  // Fetch initial system status
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/system/status');
      if (res.status === 401) {
        setAuthMode('login');
        setAuthError('Sua sessão expirou. Entre novamente.');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (data.status) setStatus(data.status);
        if (data.recentAlerts && data.recentAlerts.length > 0) setAlerts(data.recentAlerts);
        if (data.sandboxes && data.sandboxes.length > 0) setSandboxes(data.sandboxes);
        if (data.auditChain && data.auditChain.length > 0) setAuditChain(data.auditChain);
        if (Array.isArray(data.approvals)) setApprovals(data.approvals);
      }
    } catch (err) {
      console.warn('Edge server polling fallback to local state:', err);
    }
  };

  useEffect(() => {
    if (authMode !== 'authenticated') return;
    fetchStatus();
    const timer = setInterval(fetchStatus, 5000); // métricas reais e fila de aprovação
    return () => clearInterval(timer);
  }, [authMode]);

  // Send message to Jeremias
  const handleSendMessage = async (text: string) => {
    setIsLoadingMessage(true);
    const userMsg: JeremiasMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toISOString(),
      isEphemeral: true,
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const siteAddress = siteToOpen(text); // só abre site com pedido claro; nome de arquivo não conta
      if (siteAddress) {
        if (!window.jeremiasDesktop?.isDesktop) {
          throw new Error('Para abrir e interagir com sites, use a versão desktop do Jeremias.');
        }
        const url = normalizePublicSiteUrl(siteAddress);
        window.open(`/browser?url=${encodeURIComponent(url)}`, 'jeremias-browser', 'width=1440,height=920');
        setMessages((prev) => [
          ...prev,
          {
            id: `site-${Date.now()}`,
            sender: 'jeremias',
            text: `Abri o link na janela Navegar sites:\n${url}\n\nVocê pode navegar normalmente. O Jeremias analisará a interface visível automaticamente.`,
            timestamp: new Date().toISOString(),
            isEphemeral: true,
          },
        ]);
        return;
      }

      const res = await fetch('/api/jeremias/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Jeremias-Stream': '1' },
        body: JSON.stringify({ prompt: text }),
      });

      if (!res.ok) {
        throw new Error(`Erro na API (${res.status})`);
      }

      // Resposta em streaming: o texto aparece enquanto o modelo local escreve
      if ((res.headers.get('content-type') || '').includes('application/x-ndjson') && res.body) {
        const botId = `jer-${Date.now()}`;
        let started = false;
        for await (const evt of readNdjson<any>(res.body)) {
          if (evt.type === 'meta') {
            started = true;
            setMessages((prev) => [
              ...prev,
              {
                id: botId,
                sender: 'jeremias',
                text: '',
                timestamp: new Date().toISOString(),
                threePillars: evt.threePillars,
                policyResult: evt.policyResult,
                taintLevel: evt.taint?.level,
                auditRefId: evt.auditBlock?.id,
                isEphemeral: true,
                engine: evt.engine,
              },
            ]);
            if (evt.auditBlock) setAuditChain((prev) => [...prev, evt.auditBlock]);
          } else if (evt.type === 'delta') {
            setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, text: m.text + evt.text } : m)));
          } else if (evt.type === 'done') {
            setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, text: evt.reply } : m)));
          } else if (evt.type === 'error') {
            const failure = `[ERRO NO MOTOR] ${evt.message}`;
            setMessages((prev) =>
              started
                ? prev.map((m) => (m.id === botId ? { ...m, text: m.text ? `${m.text}\n\n${failure}` : failure } : m))
                : [
                    ...prev,
                    { id: botId, sender: 'jeremias', text: failure, timestamp: new Date().toISOString(), isEphemeral: true },
                  ],
            );
          }
        }
        await fetchStatus();
        return;
      }

      const data = await res.json();

      const botMsg: JeremiasMessage = {
        id: `jer-${Date.now()}`,
        sender: 'jeremias',
        text: data.reply,
        timestamp: new Date().toISOString(),
        threePillars: data.threePillars,
        policyResult: data.policyResult,
        taintLevel: data.taint?.level,
        auditRefId: data.auditBlock?.id,
        isEphemeral: true,
        engine: data.engine,
        pendingCloud: data.pendingCloud,
        pendingWrite: data.pendingWrite,
      };

      setMessages((prev) => [...prev, botMsg]);

      if (data.auditBlock) {
        setAuditChain((prev) => [...prev, data.auditBlock]);
      }

      await fetchStatus();
    } catch (err: any) {
      const errorMsg: JeremiasMessage = {
        id: `err-${Date.now()}`,
        sender: 'jeremias',
        text: `[FALHA DE COMUNICAÇÃO INTERNA] ${err?.message || 'Erro ao processar instrução'}. Avalie conectividade com o nó local.`,
        timestamp: new Date().toISOString(),
        isEphemeral: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoadingMessage(false);
    }
  };

  // Confirmação (ou recusa) do envio à nuvem: nada sai da máquina sem este clique
  const handleCloudDecision = async (msgId: string, pendingId: string, accept: boolean) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId && m.pendingCloud ? { ...m, pendingCloud: { ...m.pendingCloud, resolved: true } } : m))
    );
    if (accept) setIsLoadingMessage(true);
    try {
      const res = await fetch(`/api/jeremias/cloud/${accept ? 'confirm' : 'cancel'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pendingId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erro (${res.status})`);
      setMessages((prev) => [
        ...prev,
        {
          id: `cld-${Date.now()}`,
          sender: accept ? 'jeremias' : 'system',
          text: data.reply,
          timestamp: new Date().toISOString(),
          isEphemeral: true,
          engine: accept ? data.engine : undefined,
          auditRefId: data.auditBlock?.id,
        },
      ]);
      if (data.auditBlock) setAuditChain((prev) => [...prev, data.auditBlock]);
      await fetchStatus();
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { id: `cld-err-${Date.now()}`, sender: 'system', text: `[NUVEM] ${err?.message || 'Falha.'}`, timestamp: new Date().toISOString(), isEphemeral: true },
      ]);
    } finally {
      setIsLoadingMessage(false);
    }
  };

  // Criar arquivo: nada é gravado sem este clique
  const handleFileDecision = async (msgId: string, pendingId: string, accept: boolean) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId && m.pendingWrite ? { ...m, pendingWrite: { ...m.pendingWrite, resolved: true } } : m))
    );
    try {
      const res = await fetch(`/api/files/${accept ? 'confirm' : 'cancel'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pendingId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erro (${res.status})`);
      setMessages((prev) => [
        ...prev,
        { id: `fil-${Date.now()}`, sender: 'system', text: data.reply, timestamp: new Date().toISOString(), isEphemeral: true, auditRefId: data.auditBlock?.id },
      ]);
      if (data.auditBlock) setAuditChain((prev) => [...prev, data.auditBlock]);
      await fetchStatus();
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { id: `fil-err-${Date.now()}`, sender: 'system', text: `[ARQUIVO] ${err?.message || 'Falha.'}`, timestamp: new Date().toISOString(), isEphemeral: true },
      ]);
    }
  };

  // Transformar uma resposta do Jeremias em arquivo (passa pela mesma confirmação)
  const handleSaveReply = async (text: string) => {
    const name = window.prompt('Nome do arquivo (ex.: resposta.md, pagina.html):', 'resposta.md');
    if (!name || !name.trim()) return;
    try {
      const res = await fetch('/api/files/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), content: text }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `fil-prop-${Date.now()}`,
          sender: 'jeremias',
          text: data.reply || data.error || 'Não consegui preparar o arquivo.',
          timestamp: new Date().toISOString(),
          isEphemeral: true,
          engine: data.pendingWrite ? 'pending' : 'local',
          pendingWrite: data.pendingWrite,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { id: `fil-prop-err-${Date.now()}`, sender: 'system', text: `[ARQUIVO] ${err?.message || 'Falha.'}`, timestamp: new Date().toISOString(), isEphemeral: true },
      ]);
    }
  };

  // Evaluate Policy Action
  const handleEvaluatePolicy = async (params: {
    action: SystemActionType;
    target?: string;
    payload?: string;
    networkDestination?: string;
  }): Promise<PolicyEvaluationResult> => {
    const res = await fetch('/api/policy/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (data.auditBlock) {
      setAuditChain((prev) => [...prev, data.auditBlock]);
    }
    await fetchStatus();
    return data.policyResult;
  };

  // Execute in Sandbox
  const handleExecuteSandbox = async (
    scriptName: string,
    scriptContent: string
  ): Promise<SandboxExecution> => {
    const res = await fetch('/api/sandbox/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptName, scriptContent }),
    });
    const data = await res.json();
    if (data.sandbox) {
      setSandboxes((prev) => [data.sandbox, ...prev]);
    }
    if (data.auditBlock) {
      setAuditChain((prev) => [...prev, data.auditBlock]);
    }
    await fetchStatus();
    return data.sandbox;
  };

  // Verify Audit Chain
  const handleVerifyChain = async () => {
    const res = await fetch('/api/audit/verify', { method: 'POST' });
    const data = await res.json();
    await fetchStatus();
    return {
      valid: data.valid,
      tamperedIndex: data.tamperedIndex,
      reason: data.reason,
    };
  };

  // Simulate Tamper
  const handleSimulateTamper = async () => {
    await fetch('/api/audit/simulate-tamper', { method: 'POST' });
    await fetchStatus();
  };

  // Reset Ledger
  const handleResetLedger = async () => {
    await fetch('/api/audit/reset', { method: 'POST' });
    await fetchStatus();
  };

  // Purge Volatile RAM Memory (0x00 WIPE)
  const handlePurgeRam = async () => {
    setIsPurgingRam(true);
    try {
      const res = await fetch('/api/ram/purge', { method: 'POST' });
      if (res.ok) {
        setMessages([
          {
            id: `purged-${Date.now()}`,
            sender: 'system',
            text: `[PURGA CONCLUÍDA - 0x00]
O histórico de conversa guardado na memória do servidor foi sobrescrito com zeros e descartado, e este painel foi limpo.
Nada de conversa é gravado em disco. (Registros do ledger de auditoria não contêm o texto das conversas.)`,
            timestamp: new Date().toISOString(),
            isEphemeral: true,
          },
        ]);
        await fetchStatus();
      }
    } finally {
      setIsPurgingRam(false);
    }
  };

  // Aprovação humana real: aprovar executa o comando SOMENTE no sandbox
  const handleResolveApproval = async (id: string, decision: 'approve' | 'deny') => {
    try {
      const res = await fetch(`/api/approvals/${id}/${decision}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erro (${res.status})`);
      const ap: PendingApproval | undefined = data.approval;
      const text =
        decision === 'deny'
          ? `[APROVAÇÃO ${id}] Negada. Nada foi executado.`
          : `[APROVAÇÃO ${id}] ${
              ap?.status === 'executed' ? 'Executado no sandbox.' : 'NÃO executado com sucesso.'
            }\n${ap?.output || '(sem saída)'}`;
      setMessages((prev) => [
        ...prev,
        { id: `apr-${Date.now()}`, sender: 'system', text, timestamp: new Date().toISOString(), isEphemeral: true },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `apr-err-${Date.now()}`,
          sender: 'system',
          text: `[APROVAÇÃO ${id}] ${err?.message || 'Falha ao resolver o pedido.'}`,
          timestamp: new Date().toISOString(),
          isEphemeral: true,
        },
      ]);
    } finally {
      await fetchStatus();
    }
  };

  const handleNavigateToAudit = (auditId?: string) => {
    setHighlightAuditId(auditId);
    handleTabChange('audit');
  };

  if (authMode !== 'authenticated') {
    return (
      <LoginScreen
        mode={authMode}
        error={authError}
        onSubmit={handleAuthSubmit}
        onRetry={() => void refreshAuth()}
      />
    );
  }

  const routePath: string = window.location.pathname;
  if (routePath === '/developer-activity') {
    if (!developmentMode) {
      return <div className="min-h-screen bg-[#050811] p-8 text-center text-slate-300">O monitor de atividade está disponível somente na versão de desenvolvimento.</div>;
    }
    return <DeveloperActivityMonitor onClose={() => window.close()} />;
  }
  if (routePath === '/browser') {
    return <BrowserWorkspace onClose={() => window.close()} />;
  }

  return (
    <div className="min-h-screen bg-[#050811] text-slate-100 flex flex-col selection:bg-emerald-500/30 selection:text-emerald-200">
      <Navbar
        status={status}
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        onPurgeRam={handlePurgeRam}
        isPurging={isPurgingRam}
        pendingApprovals={approvals.filter((a) => a.status === 'pending').length}
        advanced={advanced}
        onToggleAdvanced={toggleAdvanced}
        onLogout={handleLogout}
        onChangePassword={() => setChangePasswordOpen(true)}
        onOpenDeveloperActivity={() => window.open('/developer-activity', 'jeremias-developer-activity', 'width=1120,height=820')}
        onOpenBrowser={() => window.open('/browser', 'jeremias-browser', 'width=1440,height=920')}
        developmentMode={developmentMode}
        desktopMode={window.jeremiasDesktop?.isDesktop === true}
      />

      <main className="flex-1">
        {activeTab === 'components' && <SystemMonitor />}
        {activeTab === 'games' && <GameRoom />}
        {activeTab === 'accesses' && <AccessMonitor />}
        {activeTab === 'developer' && (
          <DeveloperPanel onNavigate={(tab) => setActiveTab(tab)} />
        )}
        {activeTab === 'console' && (
          <AgentConsole
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isLoadingMessage}
            onPurgeRam={handlePurgeRam}
            onNavigateToAudit={handleNavigateToAudit}
            onCloudDecision={handleCloudDecision}
            onFileDecision={handleFileDecision}
            onSaveReply={handleSaveReply}
            advanced={advanced}
          />
        )}

        {activeTab === 'approvals' && !advanced && (
          <div className="max-w-3xl mx-auto px-4 py-4">
            <ApprovalQueue approvals={approvals} onResolve={handleResolveApproval} />
          </div>
        )}

        {advanced && activeTab === 'policies' && (
          <ZeroTrustPolicyBarrier
            onEvaluatePolicy={handleEvaluatePolicy}
            approvals={approvals}
            onResolveApproval={handleResolveApproval}
          />
        )}

        {advanced && activeTab === 'sandbox' && (
          <TaintSandboxView
            onExecuteSandbox={handleExecuteSandbox}
            sandboxes={sandboxes}
            status={status}
          />
        )}

        {activeTab === 'audit' && (
          <AuditLedgerView
            auditChain={auditChain}
            onVerifyChain={handleVerifyChain}
            onSimulateTamper={handleSimulateTamper}
            onResetLedger={handleResetLedger}
            highlightId={highlightAuditId}
            showDemoControls={advanced}
          />
        )}

        {advanced && activeTab === 'anomalies' && (
          <AnomalyMonitor
            status={status}
            alerts={alerts}
          />
        )}
      </main>
      {changePasswordOpen && (
        <ChangePasswordDialog
          onClose={() => setChangePasswordOpen(false)}
          onSubmit={handleChangePassword}
        />
      )}
    </div>
  );
}
