import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Terminal,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Cpu,
  Trash2,
  Sparkles,
  Lock,
  ArrowRight,
  SlidersHorizontal,
} from 'lucide-react';
import { JeremiasMessage } from '../lib/types.ts';
import { analyzeTaint } from '../lib/taintTracker.ts';

interface AgentConsoleProps {
  messages: JeremiasMessage[];
  onSendMessage: (text: string) => Promise<void>;
  isLoading: boolean;
  onPurgeRam: () => void;
  onNavigateToAudit?: (auditId?: string) => void;
  onCloudDecision?: (msgId: string, pendingId: string, accept: boolean) => void;
  onFileDecision?: (msgId: string, pendingId: string, accept: boolean) => void;
  onSaveReply?: (text: string) => void;
  /** modo avançado: mostra radar de taint, atalhos de demonstração e a decomposição em três pilares */
  advanced?: boolean;
}

type SuggestionCategory = 'arquivos' | 'escrita' | 'calculos' | 'computador' | 'pesquisa' | 'demonstracoes';

const SUGGESTION_CATEGORIES: { id: SuggestionCategory; label: string; advancedOnly?: boolean }[] = [
  { id: 'arquivos', label: 'Arquivos' },
  { id: 'escrita', label: 'Criar e salvar' },
  { id: 'calculos', label: 'Contas e conversões' },
  { id: 'computador', label: 'Computador' },
  { id: 'pesquisa', label: 'Pesquisa' },
  { id: 'demonstracoes', label: 'Demonstrações', advancedOnly: true },
];

const QUICK_PROMPTS: { title: string; prompt: string; category: SuggestionCategory; demo?: boolean }[] = [
  { title: 'Achar arquivo', prompt: 'Encontre o arquivo relatorio pdf', category: 'arquivos' },
  { title: 'Ler arquivo', prompt: 'Leia o arquivo notas.txt', category: 'arquivos' },
  { title: 'Criar arquivo', prompt: 'Crie o arquivo notas.txt com o texto Estudar CSS amanhã', category: 'escrita' },
  { title: 'Conta (offline)', prompt: 'Quanto é 15% de 230?', category: 'calculos' },
  { title: 'Converter unidades', prompt: 'Converta 10 km para milhas', category: 'calculos' },
  { title: 'Memória livre', prompt: 'Quanta memória livre eu tenho?', category: 'computador' },
  { title: 'Espaço em disco', prompt: 'Quanto espaço livre no disco?', category: 'computador' },
  { title: 'Pesquisar na web', prompt: 'Pesquise as últimas notícias sobre inteligência artificial', category: 'pesquisa' },
  { title: 'Diagnóstico local', prompt: 'Verificar integridade local do nó, status cgroups v2 e regras OPA.', category: 'demonstracoes', demo: true },
  { title: 'Comando Linux (!uname -a)', prompt: '!uname -a', category: 'demonstracoes', demo: true },
  { title: 'Entender a política', prompt: 'Explique como a política Zero-Trust avalia uma ação sem executá-la.', category: 'demonstracoes', demo: true },
  { title: 'Verificar o ledger', prompt: 'Como verifico a integridade do registro de auditoria?', category: 'demonstracoes', demo: true },
];

const SUGGESTIONS_STORAGE_KEY = 'jeremias.suggestionCategories';

function readSuggestionCategories(): SuggestionCategory[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SUGGESTIONS_STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter((value): value is SuggestionCategory =>
      SUGGESTION_CATEGORIES.some((category) => category.id === value)
    );
  } catch {
    return [];
  }
}

export const AgentConsole: React.FC<AgentConsoleProps> = ({
  messages,
  onSendMessage,
  isLoading,
  onPurgeRam,
  onNavigateToAudit,
  onCloudDecision,
  onFileDecision,
  onSaveReply,
  advanced = false,
}) => {
  const [inputText, setInputText] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<SuggestionCategory[]>(readSuggestionCategories);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const taintPreview = analyzeTaint(inputText, 'user_prompt');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    try {
      localStorage.setItem(SUGGESTIONS_STORAGE_KEY, JSON.stringify(selectedCategories));
    } catch {
      /* preferências ficam só nesta sessão se o armazenamento estiver indisponível */
    }
  }, [selectedCategories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    const text = inputText;
    setInputText('');
    await onSendMessage(text);
  };

  const availableCategories = SUGGESTION_CATEGORIES.filter((category) => !category.advancedOnly || advanced);
  const visiblePrompts = QUICK_PROMPTS.filter((prompt) =>
    selectedCategories.includes(prompt.category) && (!prompt.demo || advanced)
  );
  const toggleSuggestionCategory = (category: SuggestionCategory) => {
    setSelectedCategories((current) => {
      return current.includes(category) ? current.filter((value) => value !== category) : [...current, category];
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] max-w-7xl mx-auto px-4 py-2">
      {/* Top Banner: Core Principles Banner */}
      <div className={`${advanced ? 'grid' : 'hidden'} grid-cols-1 md:grid-cols-3 gap-2 mb-3`}>
        <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-start gap-2.5">
          <div className="p-1.5 rounded bg-cyan-950/80 border border-cyan-800 text-cyan-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-200">1. O MODELO SUGERE &amp; ANALISA</div>
            <div className="text-[11px] text-slate-400">
              Inferência Edge-native ou Gemini com descarte volátil instantâneo.
            </div>
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-start gap-2.5">
          <div className="p-1.5 rounded bg-amber-950/80 border border-amber-800 text-amber-400">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-200">2. A POLÍTICA (OPA) AUTORIZA</div>
            <div className="text-[11px] text-slate-400">
              Zero-Trust: Nenhuma ação é permitida por padrão. Verificação determinística.
            </div>
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-start gap-2.5">
          <div className="p-1.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-200">3. O S.O. IMPÕE LIMITES</div>
            <div className="text-[11px] text-slate-400">
              Confinamento seccomp, isolamento cgroups v2 e sandboxes MicroVM.
            </div>
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 rounded-xl border border-dashed border-slate-800 bg-slate-950/40">
            <div className="w-12 h-12 rounded-full bg-emerald-950/80 border border-emerald-600 flex items-center justify-center text-emerald-400 mb-3 shadow-lg">
              <Terminal className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-200">
              {advanced ? 'Jeremias A.S.O. Operacional & Confinado' : 'Em que posso ajudar?'}
            </h3>
            <p className="text-xs text-slate-400 max-w-lg mt-1 mb-4">
              Hora, contas, arquivos e verificação de dados rodam aqui, sem internet. A nuvem só entra
              para pesquisas, e depois do seu clique. Cada resposta mostra quem a deu.
            </p>

            <div className="w-full max-w-2xl text-left">
              <button
                onClick={() => setSuggestionsOpen((open) => !open)}
                aria-expanded={suggestionsOpen}
                className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-300 transition hover:border-emerald-700 hover:text-emerald-300"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {suggestionsOpen ? 'Ocultar sugestões' : 'Personalizar sugestões'}
              </button>
              {suggestionsOpen && (
                <div className="mt-3 space-y-3">
                  <p className="text-[11px] text-slate-400">
                    Escolha o que mostrar. Essa preferência fica neste navegador; o Jeremias não analisa seu histórico de uso.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {availableCategories.map((category) => {
                      const selected = selectedCategories.includes(category.id);
                      return (
                        <button
                          key={category.id}
                          onClick={() => toggleSuggestionCategory(category.id)}
                          aria-pressed={selected}
                          className={`rounded-full border px-3 py-1.5 text-xs transition ${
                            selected
                              ? 'border-emerald-600 bg-emerald-950/70 text-emerald-300'
                              : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500'
                          }`}
                        >
                          {category.label}
                        </button>
                      );
                    })}
                  </div>
                  {visiblePrompts.length > 0 && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {visiblePrompts.map((prompt) => (
                        <button
                          key={prompt.title}
                          onClick={() => setInputText(prompt.prompt)}
                          className="group rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 text-left text-xs transition hover:bg-slate-800/90"
                        >
                          <div className="flex items-center justify-between font-semibold text-slate-200 group-hover:text-emerald-400">
                            <span>{prompt.title}</span>
                            <ArrowRight className="h-3 w-3 text-slate-500 group-hover:text-emerald-400" />
                          </div>
                          <div className="mt-1 line-clamp-2 text-[11px] text-slate-400">{prompt.prompt}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.sender === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`max-w-3xl rounded-xl p-4 text-xs ${
                  msg.sender === 'user'
                    ? 'bg-slate-800 border border-slate-700 text-slate-100'
                    : 'bg-slate-900/90 border border-slate-800 text-slate-200 shadow-xl'
                }`}
              >
                {/* Header of message */}
                <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-2 mb-2 text-[11px]">
                  <div className="flex items-center gap-2 font-semibold">
                    {msg.sender === 'user' ? (
                      <span className="text-slate-300">OPERADOR AUTORIZADO</span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Terminal className="w-3.5 h-3.5" />
                        JEREMIAS A.S.O. [GUARDIÃO EDGE]
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                    {msg.engine && (
                      <span
                        className={`px-1.5 py-0.5 rounded border font-bold ${
                          msg.engine === 'local' || msg.engine === 'local-llm'
                            ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                            : msg.engine === 'cloud'
                            ? 'bg-sky-950/80 border-sky-700 text-sky-300'
                            : msg.engine === 'pending'
                            ? 'bg-amber-950/80 border-amber-700 text-amber-300'
                            : 'bg-rose-950/80 border-rose-800 text-rose-300'
                        }`}
                      >
                        {msg.engine === 'local'
                          ? 'LOCAL · SEM IA'
                          : msg.engine === 'local-llm'
                          ? 'LOCAL · MODELO'
                          : msg.engine === 'cloud'
                          ? 'NUVEM · API'
                          : msg.engine === 'pending'
                          ? 'AGUARDA SEU SIM'
                          : 'ERRO'}
                      </span>
                    )}
                    <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                    {msg.isEphemeral && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-800 text-amber-300">
                        RAM EFÊMERA
                      </span>
                    )}
                  </div>
                </div>

                {/* Message Body */}
                <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {msg.text}
                </div>

                {/* Modo assistente: detalhes de segurança recolhidos */}
                {!advanced && msg.sender === 'jeremias' && msg.policyResult && (
                  <details className="mt-2 pt-2 border-t border-slate-800/70 text-[10px] font-mono text-slate-400">
                    <summary className="cursor-pointer hover:text-slate-200">Ver detalhes de segurança</summary>
                    <div className="mt-1.5 space-y-1">
                      <div>
                        Política: {msg.policyResult.decision} · {msg.policyResult.matchedRuleId} · taint {msg.policyResult.taintLevel}
                      </div>
                      {msg.threePillars && <div>Motor: {msg.threePillars.modelAnalysis}</div>}
                      {msg.threePillars && <div>Execução: {msg.threePillars.osEnforcement}</div>}
                      {msg.auditRefId && onNavigateToAudit && (
                        <button onClick={() => onNavigateToAudit(msg.auditRefId)} className="text-indigo-400 hover:text-indigo-300 underline cursor-pointer">
                          Registro: {msg.auditRefId}
                        </button>
                      )}
                    </div>
                  </details>
                )}

                {/* Confirmação de envio à nuvem */}
                {msg.pendingCloud && onCloudDecision && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {msg.pendingCloud.resolved ? (
                      <span className="text-[11px] text-slate-400 font-mono">Decisão registrada.</span>
                    ) : (
                      <>
                        <button
                          onClick={() => onCloudDecision(msg.id, msg.pendingCloud!.id, true)}
                          disabled={isLoading}
                          className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-white font-bold text-xs cursor-pointer disabled:opacity-40"
                        >
                          Enviar à nuvem
                        </button>
                        <button
                          onClick={() => onCloudDecision(msg.id, msg.pendingCloud!.id, false)}
                          disabled={isLoading}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs cursor-pointer disabled:opacity-40"
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Confirmação de criação de arquivo */}
                {msg.pendingWrite && onFileDecision && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {msg.pendingWrite.resolved ? (
                      <span className="text-[11px] text-slate-400 font-mono">Decisão registrada.</span>
                    ) : (
                      <>
                        <button
                          onClick={() => onFileDecision(msg.id, msg.pendingWrite!.id, true)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs cursor-pointer"
                        >
                          Criar arquivo
                        </button>
                        <button
                          onClick={() => onFileDecision(msg.id, msg.pendingWrite!.id, false)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Salvar a resposta de um modelo como arquivo */}
                {onSaveReply && (msg.engine === 'local-llm' || msg.engine === 'cloud') && !msg.pendingCloud && (
                  <button
                    onClick={() => onSaveReply(msg.text)}
                    className="mt-2 text-[11px] font-mono text-slate-400 hover:text-emerald-300 underline cursor-pointer"
                  >
                    Salvar como arquivo
                  </button>
                )}

                {/* 3 Pillars Decomposition (for Jeremias Responses) */}
                {advanced && msg.threePillars && (
                  <div className="mt-3 pt-3 border-t border-slate-800/90 space-y-2">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-cyan-400" />
                      Decomposição nos Três Pilares da Arquitetura:
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] font-mono">
                      {/* Pillar 1 */}
                      <div className="p-2 rounded bg-cyan-950/40 border border-cyan-800/60">
                        <div className="text-cyan-400 font-bold mb-1 flex items-center gap-1">
                          <Cpu className="w-3 h-3" /> 1. MODELO
                        </div>
                        <div className="text-slate-300 text-[10px] leading-tight">
                          {msg.threePillars.modelAnalysis}
                        </div>
                      </div>

                      {/* Pillar 2 */}
                      <div className="p-2 rounded bg-amber-950/40 border border-amber-800/60">
                        <div className="text-amber-400 font-bold mb-1 flex items-center gap-1">
                          <Lock className="w-3 h-3" /> 2. POLÍTICA (OPA)
                        </div>
                        <div className="text-slate-300 text-[10px] leading-tight">
                          {msg.threePillars.opaAuthorization}
                        </div>
                      </div>

                      {/* Pillar 3 */}
                      <div className="p-2 rounded bg-emerald-950/40 border border-emerald-800/60">
                        <div className="text-emerald-400 font-bold mb-1 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> 3. S.O. LIMITES
                        </div>
                        <div className="text-slate-300 text-[10px] leading-tight">
                          {msg.threePillars.osEnforcement}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Policy & Taint Badges */}
                {advanced && msg.policyResult && (
                  <div className="mt-2.5 pt-2 border-t border-slate-800/70 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          msg.policyResult.decision === 'ALLOW'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : msg.policyResult.decision === 'DENY'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : msg.policyResult.decision === 'SANDBOX_QUARANTINE'
                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}
                      >
                        OPA: {msg.policyResult.decision}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded ${
                          msg.policyResult.taintLevel === 'CLEAN'
                            ? 'bg-slate-800 text-slate-300'
                            : msg.policyResult.taintLevel === 'SUSPICIOUS'
                            ? 'bg-amber-900/60 text-amber-300'
                            : 'bg-rose-950 text-rose-300 border border-rose-700'
                        }`}
                      >
                        TAINT: {msg.policyResult.taintLevel}
                      </span>
                    </div>

                    {msg.auditRefId && onNavigateToAudit && (
                      <button
                        onClick={() => onNavigateToAudit(msg.auditRefId)}
                        className="text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                      >
                        Audit Block: {msg.auditRefId}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-slate-300 max-w-md font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span>{advanced ? 'JEREMIAS: Processando input local, avaliando OPA e inspecionando taint...' : 'Jeremias está pensando...'}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box & Real-Time Taint Radar */}
      <div className="border border-slate-800 bg-slate-900/90 rounded-xl p-3 shadow-2xl">
        {/* Dynamic Taint Alert Preview */}
        {advanced && inputText.trim().length > 0 && taintPreview.tags.length > 0 && (
          <div
            className={`mb-2 px-3 py-1.5 rounded-md text-xs font-mono flex items-center justify-between border ${
              taintPreview.level === 'LETHAL_EXPLOIT'
                ? 'bg-rose-950/80 border-rose-700 text-rose-300 animate-pulse'
                : taintPreview.level === 'TAINTED_UNTRUSTED'
                ? 'bg-amber-950/80 border-amber-700 text-amber-300'
                : taintPreview.level === 'SUSPICIOUS'
                ? 'bg-amber-950/40 border-amber-800 text-amber-400'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>RADAR DE CONTAMINAÇÃO:</span>
              <span className="font-bold">[{taintPreview.level}]</span>
              <span>Tags: {taintPreview.tags.join(', ')}</span>
            </div>
            <div className="text-[10px]">
              Taint Score: {taintPreview.score}/100 {taintPreview.quarantineRecommended && '• Sandbox Obrigatória'}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Pergunte algo (hora, contas, arquivos, pesquisas) ou use ! para um comando (ex: !hostname, !whoami)..."
            disabled={isLoading}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
          />

          <button
            type="submit"
            disabled={isLoading || !inputText.trim()}
            className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
          >
            <span>Executar</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="flex justify-end mt-2 pt-2 border-t border-slate-800/80">
          <button
            onClick={onPurgeRam}
            className="flex items-center gap-1 rounded border border-rose-800 bg-rose-950 px-2 py-0.5 text-[11px] text-rose-300 transition hover:bg-rose-900"
          >
            <Trash2 className="w-3 h-3" />
            <span>Purga Imediata de Memória</span>
          </button>
        </div>
      </div>
    </div>
  );
};
