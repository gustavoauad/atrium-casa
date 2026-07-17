import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { createHouse, findHouseByInviteCode, joinHouseByInviteCode } from '../../hooks/useHouses'
import { Logo } from '../ui/Logo'

type Tab = 'login' | 'signup'
type CasaMode = 'new' | 'join'

export function AuthScreen() {
  const [tab, setTab] = useState<Tab>('login')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')

  const [signupEmail, setSignupEmail] = useState('')
  const [signupPass, setSignupPass] = useState('')
  const [casaMode, setCasaMode] = useState<CasaMode>('new')
  const [casaName, setCasaName] = useState('')
  const [inviteCode, setInviteCode] = useState('')

  function switchTab(next: Tab) {
    setTab(next)
    setError('')
    setInfo('')
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!loginEmail.trim() || !loginPass) {
      setError('Preencha e-mail e senha.')
      return
    }
    setBusy(true)
    const { error: err } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPass,
    })
    setBusy(false)
    if (err) setError(err.message)
  }

  async function handleResetPassword() {
    setError('')
    setInfo('')
    if (!loginEmail.trim()) {
      setError('Informe seu e-mail para redefinir a senha.')
      return
    }
    const { error: err } = await supabase.auth.resetPasswordForEmail(loginEmail.trim(), {
      redirectTo: window.location.origin,
    })
    if (err) setError(err.message)
    else setInfo('E-mail de redefinição enviado! Verifique sua caixa de entrada.')
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')

    const email = signupEmail.trim()
    if (!email || !signupPass) return setError('Preencha e-mail e senha.')
    if (signupPass.length < 6) return setError('Senha deve ter ao menos 6 caracteres.')
    if (casaMode === 'new' && !casaName.trim()) return setError('Informe o nome da sua Casa.')
    if (casaMode === 'join' && !inviteCode.trim()) return setError('Informe o código de convite.')

    setBusy(true)
    try {
      // Valida o convite ANTES de criar o usuário, evitando conta órfã
      if (casaMode === 'join') {
        const house = await findHouseByInviteCode(inviteCode)
        if (!house) {
          throw new Error(`Código '${inviteCode.toLowerCase().trim()}' não encontrado. Verifique se copiou corretamente.`)
        }
      }

      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email,
        password: signupPass,
      })
      if (authErr) throw new Error('Erro no cadastro: ' + authErr.message)

      if (!authData.session) {
        setInfo('Conta criada! Verifique seu e-mail para confirmar antes de entrar.')
        setBusy(false)
        return
      }

      const userId = authData.session.user.id
      if (casaMode === 'new') {
        await createHouse(userId, casaName.trim())
      } else {
        await joinHouseByInviteCode(userId, inviteCode, authData.session.user.email)
      }
      // onAuthStateChange no AuthContext já detecta a sessão e troca de tela
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6">
        <div className="flex justify-center mb-6">
          <Logo size={40} withText variant="auth" />
        </div>

        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={() => switchTab('login')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === 'login' ? 'bg-accent text-white' : 'bg-cream text-muted'}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => switchTab('signup')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === 'signup' ? 'bg-accent text-white' : 'bg-cream text-muted'}`}
          >
            Criar conta
          </button>
        </div>

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-3">
            <Field label="E-mail">
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Senha">
              <input
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                className="input"
              />
            </Field>
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
            <button
              type="button"
              onClick={handleResetPassword}
              className="text-xs text-muted underline w-full text-center mt-1"
            >
              Esqueci minha senha
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup} className="space-y-3">
            <Field label="E-mail">
              <input
                type="email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Senha">
              <input
                type="password"
                value={signupPass}
                onChange={(e) => setSignupPass(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Casa">
              <select
                value={casaMode}
                onChange={(e) => setCasaMode(e.target.value as CasaMode)}
                className="input"
              >
                <option value="new">Criar nova Casa</option>
                <option value="join">Entrar com código de convite</option>
              </select>
            </Field>
            {casaMode === 'new' ? (
              <Field label="Nome da Casa">
                <input
                  value={casaName}
                  onChange={(e) => setCasaName(e.target.value)}
                  placeholder="Ex: Família Silva"
                  className="input"
                />
              </Field>
            ) : (
              <Field label="Código de convite">
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toLowerCase())}
                  placeholder="Ex: a3f9c2b1"
                  className="input"
                />
              </Field>
            )}
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? 'Criando conta…' : 'Criar conta'}
            </button>
          </form>
        )}

        {error && (
          <p className="mt-4 text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        {info && (
          <p className="mt-4 text-xs text-blue bg-blue/10 border border-blue/30 rounded-lg px-3 py-2">
            {info}
          </p>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-left">
      <span className="block text-[10px] uppercase tracking-wider text-muted font-medium mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}
