import React, { useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';

interface LoginScreenProps {
  mode: 'checking' | 'unavailable' | 'setup' | 'login';
  error?: string;
  onSubmit: (password: string) => Promise<void>;
  onRetry: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ mode, error, onSubmit, onRetry }) => {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const setup = mode === 'setup';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(password);
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#050811] text-slate-100 flex items-center justify-center px-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950/90 p-8 shadow-2xl">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-950/70 text-emerald-400">
            {mode === 'checking' || mode === 'unavailable' ? <ShieldCheck className="h-6 w-6" /> : <LockKeyhole className="h-6 w-6" />}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Jeremias <span className="text-emerald-400">A.S.O.</span></h1>
            <p className="text-sm text-slate-400">Acesso protegido por senha</p>
          </div>
        </div>

        {mode === 'checking' ? (
          <p className="text-sm text-slate-300" role="status">Verificando a conexão segura...</p>
        ) : mode === 'unavailable' ? (
          <div className="space-y-4">
            <p className="text-sm text-rose-300">{error || 'Não foi possível conectar ao servidor local.'}</p>
            <button onClick={onRetry} className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-500">
              Tentar novamente
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">{setup ? 'Crie sua senha' : 'Entre no Jeremias'}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {setup
                  ? 'Esta senha protege o acesso ao assistente neste computador. Ela não pode ser recuperada.'
                  : 'Digite sua senha para continuar.'}
              </p>
            </div>

            <label className="block text-sm font-medium text-slate-300" htmlFor="jeremias-password">
              Senha
              <input
                id="jeremias-password"
                type="password"
                autoComplete={setup ? 'new-password' : 'current-password'}
                autoFocus
                required
                minLength={setup ? 8 : undefined}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-white outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </label>

            {setup && <p className="text-xs text-slate-500">Use pelo menos 8 caracteres. A senha é armazenada como hash, não em texto puro.</p>}
            {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !password}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Aguarde...' : setup ? 'Criar senha e entrar' : 'Entrar'}
            </button>
          </form>
        )}

        <p className="mt-7 border-t border-slate-800 pt-4 text-xs text-slate-500">
          A senha fica neste computador; nenhuma credencial é enviada à nuvem.
        </p>
      </section>
    </main>
  );
};
