import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Cpu,
  Trash2,
  Lock,
  Layers,
  Activity,
  Terminal,
  LogOut,
  MonitorCog,
  KeyRound,
  CodeXml,
  Globe2,
  Gamepad2,
} from 'lucide-react';
import { EdgeSystemStatus } from '../lib/types.ts';

export type Tab = 'console' | 'games' | 'components' | 'approvals' | 'policies' | 'sandbox' | 'audit' | 'anomalies' | 'accesses' | 'developer';

interface NavbarProps {
  status: EdgeSystemStatus;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  onPurgeRam: () => void;
  isPurging: boolean;
  pendingApprovals?: number;
  /** modo avançado: mostra as abas de estudo/demonstração */
  advanced: boolean;
  onToggleAdvanced: () => void;
  onLogout: () => void;
  onChangePassword: () => void;
  onOpenDeveloperActivity: () => void;
  onOpenBrowser: () => void;
  developmentMode?: boolean;
  desktopMode?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  status,
  activeTab,
  setActiveTab,
  onPurgeRam,
  isPurging,
  pendingApprovals = 0,
  advanced,
  onToggleAdvanced,
  onLogout,
  onChangePassword,
  onOpenDeveloperActivity,
  onOpenBrowser,
  developmentMode = false,
  desktopMode = false,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-50 px-4 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-400 shadow-md">
            <Lock className="w-5 h-5 text-emerald-400" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                JEREMIAS <span className="text-emerald-400">A.S.O.</span>
              </h1>
              {advanced && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono font-semibold border border-slate-700">
                  MODO AVANÇADO
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-medium">
              {advanced
                ? 'Assistente Pessoal Otimizado & Segurança Local | Zero-Trust Local-First'
                : 'Seu assistente pessoal: local primeiro, nuvem só com a sua permissão'}
            </p>
          </div>
        </div>

        {/* 3 Pillars Summary Badges */}
        <div className={`${advanced ? 'hidden lg:flex' : 'hidden'} items-center gap-2 text-[11px] font-mono`}>
          <div className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            <span className="text-slate-400 font-sans">1.</span> Modelo Sugere
          </div>
          <div className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            <span className="text-slate-400 font-sans">2.</span> Política Autoriza
          </div>
          <div className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span className="text-slate-400 font-sans">3.</span> OS Impõe Limites
          </div>
        </div>

        {/* Edge Status & Ram Purge Sovereignty Button */}
        <div className="flex items-center gap-3">
          {/* Audit Chain Status */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border ${
              status.chainIntegrity === 'VERIFIED'
                ? 'bg-emerald-950/50 border-emerald-800 text-emerald-400'
                : 'bg-rose-950/60 border-rose-700 text-rose-300 animate-pulse'
            }`}
          >
            {status.chainIntegrity === 'VERIFIED' ? (
              <ShieldCheck className="w-3.5 h-3.5" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5" />
            )}
            <span>LEDGER: {status.chainIntegrity}</span>
          </div>

          {/* Volatile RAM Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-slate-900 border border-slate-800 text-slate-300">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>RAM EFÊMERA: {status.ramVolatileUsedMb}MB</span>
          </div>

          {/* Purge Ram Button */}
          <button
            onClick={onPurgeRam}
            disabled={isPurging}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-700 transition cursor-pointer disabled:opacity-50"
            title="Descarte imediato de dados em memória volátil (Zero-Trace)"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isPurging ? 'PURGANDO...' : 'PURGAR RAM (0x00)'}</span>
          </button>
          <button
            onClick={onChangePassword}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-emerald-700 hover:text-emerald-300"
            title="Alterar senha com autorização"
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>Senha</span>
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-rose-700 hover:text-rose-300"
            title="Encerrar sessão"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="max-w-7xl mx-auto flex items-center gap-1 mt-3 pt-2 border-t border-slate-800/80 overflow-x-auto text-xs font-medium">
        <button
          onClick={() => setActiveTab('console')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer whitespace-nowrap ${
            activeTab === 'console'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>{advanced ? 'Console Jeremias A.S.O.' : 'Assistente'}</span>
        </button>

        <button
          onClick={() => setActiveTab('components')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer whitespace-nowrap ${
            activeTab === 'components'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <MonitorCog className="w-3.5 h-3.5" />
          <span>Componentes</span>
        </button>

        <button
          onClick={() => setActiveTab('games')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer whitespace-nowrap ${
            activeTab === 'games'
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Gamepad2 className="w-3.5 h-3.5" />
          <span>Jogos</span>
        </button>

        {!advanced && (
          <button
            onClick={() => setActiveTab('approvals')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer whitespace-nowrap ${
              activeTab === 'approvals'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Aprovações</span>
            {pendingApprovals > 0 && (
              <span className="ml-1 px-1.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold">
                {pendingApprovals}
              </span>
            )}
          </button>
        )}

        {advanced && (
          <>
        <button
          onClick={() => setActiveTab('policies')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer whitespace-nowrap ${
            activeTab === 'policies'
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Barreira Zero-Trust</span>
          {pendingApprovals > 0 && (
            <span className="ml-1 px-1.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold">
              {pendingApprovals}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('sandbox')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer whitespace-nowrap ${
            activeTab === 'sandbox'
              ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Taint &amp; MicroVM Sandbox</span>
        </button>
          </>
        )}

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer whitespace-nowrap ${
            activeTab === 'audit'
              ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>{advanced ? 'Ledger Tamper-Evident (SHA-256)' : 'Registro de segurança'}</span>
        </button>

        <button
          onClick={() => setActiveTab('accesses')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer whitespace-nowrap ${
            activeTab === 'accesses'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Acessos &amp; alertas</span>
        </button>

        <button
          onClick={() => setActiveTab('developer')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer whitespace-nowrap ${
            activeTab === 'developer'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <CodeXml className="w-3.5 h-3.5" />
          <span>Desenvolvedor</span>
        </button>

        {desktopMode && (
          <button
            onClick={onOpenBrowser}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer whitespace-nowrap text-cyan-300 border border-cyan-900/70 bg-cyan-950/30 hover:border-cyan-600 hover:bg-cyan-950/60"
            title="Abre uma janela de navegação com assistência do Jeremias"
          >
            <Globe2 className="w-3.5 h-3.5" />
            <span>Navegar sites ↗</span>
          </button>
        )}

        {developmentMode && (
          <button
            onClick={onOpenDeveloperActivity}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer whitespace-nowrap text-amber-300 border border-amber-900/70 bg-amber-950/30 hover:border-amber-600 hover:bg-amber-950/60"
            title="Abre uma janela separada de monitoramento, protegida por senha"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Monitor Dev ↗</span>
          </button>
        )}

        {advanced && (
        <button
          onClick={() => setActiveTab('anomalies')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer whitespace-nowrap ${
            activeTab === 'anomalies'
              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Monitor de Anomalias &amp; Logs</span>
        </button>
        )}

        <button
          onClick={onToggleAdvanced}
          className="ml-auto px-3 py-1.5 rounded-md text-[11px] font-mono text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800 cursor-pointer whitespace-nowrap"
          title="Mostra as abas de estudo e demonstração (simulador de políticas, sandbox de exemplos, monitor)"
        >
          {advanced ? 'Voltar ao modo assistente' : 'Modo avançado'}
        </button>
      </nav>
    </header>
  );
};
