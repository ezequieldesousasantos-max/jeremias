import React, { useState } from 'react';
import { KeyRound, X } from 'lucide-react';

interface ChangePasswordDialogProps {
  onClose: () => void;
  onSubmit: (currentPassword: string, authorizationCode: string, newPassword: string) => Promise<void>;
}

export const ChangePasswordDialog: React.FC<ChangePasswordDialogProps> = ({ onClose, onSubmit }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [authorizationCode, setAuthorizationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmation) {
      setError('As novas senhas não conferem.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(currentPassword, authorizationCode, newPassword);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível trocar a senha.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 py-6" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <KeyRound className="h-6 w-6 text-emerald-400" />
            <div>
              <h2 id="change-password-title" className="text-lg font-bold text-white">Alterar senha</h2>
              <p className="mt-1 text-xs text-slate-400">A troca exige sua senha atual e o código de autorização.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm text-slate-300">
            Senha atual
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-white outline-none focus:border-emerald-500"
            />
          </label>

          <label className="block text-sm text-slate-300">
            Código de autorização
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              maxLength={52}
              value={authorizationCode}
              onChange={(event) => setAuthorizationCode(event.target.value)}
              placeholder="JER-..."
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 font-mono text-white outline-none focus:border-emerald-500"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Use o arquivo aberto pelo menu Arquivo → Abrir código de autorização da senha; ele corresponde ao Jeremias em execução. Após cada troca, um novo código é gerado. Em desenvolvimento, o arquivo fica na pasta do projeto.
            </span>
          </label>

          <label className="block text-sm text-slate-300">
            Nova senha (mínimo 8 caracteres)
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-white outline-none focus:border-emerald-500"
            />
          </label>

          <label className="block text-sm text-slate-300">
            Confirme a nova senha
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-white outline-none focus:border-emerald-500"
            />
          </label>

          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !currentPassword || !authorizationCode || !newPassword || !confirmation}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Validando...' : 'Autorizar e alterar'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
