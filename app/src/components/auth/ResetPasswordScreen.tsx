import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Logo } from '../ui/Logo'

interface Props {
  onDone: () => void
}

export function ResetPasswordScreen({ onDone }: Props) {
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (pass.length < 6) {
      setError('Senha deve ter ao menos 6 caracteres.')
      return
    }
    if (pass !== confirm) {
      setError('As senhas não coincidem.')
      return
    }
    setBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password: pass })
    if (err) {
      setError(err.message)
      setBusy(false)
      return
    }
    // Encerra a sessão de recuperação — o usuário entra de novo já com a nova senha.
    await supabase.auth.signOut()
    onDone()
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6">
        <div className="flex justify-center mb-6">
          <Logo size={40} withText variant="auth" />
        </div>

        <h2 className="text-sm font-medium text-center mb-1">Redefinir senha</h2>
        <p className="text-xs text-muted text-center mb-5">Escolha uma nova senha para sua conta.</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Nova senha">
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} className="input" autoFocus />
          </Field>
          <Field label="Confirmar nova senha">
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" />
          </Field>
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>

        {error && (
          <p className="mt-4 text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-left">
      <span className="block text-[10px] uppercase tracking-wider text-muted font-medium mb-1">{label}</span>
      {children}
    </label>
  )
}
