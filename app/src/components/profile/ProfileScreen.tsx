import type { House } from '../../types/house'
import { ROLE_LABELS } from '../../types/house'
import type { Subscription } from '../../types/subscription'
import { TIER_LABELS, trialDaysLeft } from '../../types/subscription'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme, type Theme } from '../../contexts/ThemeContext'

const THEME_OPTS: { v: Theme; l: string }[] = [
  { v: 'light', l: '☀ Claro' },
  { v: 'dark', l: '☾ Escuro' },
  { v: 'system', l: '⚙ Sistema' },
]

interface Props {
  house: House
  subscription: Subscription | null
}

export function ProfileScreen({ house, subscription }: Props) {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-4">
      <h2 className="text-lg font-medium">Perfil</h2>

      <div className="border border-border rounded-xl p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted font-medium mb-3">Conta</p>
        <p className="text-sm">{user?.email}</p>
        <p className="text-xs text-muted mt-1">
          Seu papel em <strong>{house.name}</strong>: {ROLE_LABELS[house.role] || house.role}
        </p>
      </div>

      <div className="border border-border rounded-xl p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted font-medium mb-3">◐ Tema</p>
        <div className="flex gap-2">
          {THEME_OPTS.map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setTheme(opt.v)}
              className={`flex-1 px-3 py-2 rounded-lg border text-xs ${
                theme === opt.v ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted'
              }`}
            >
              {opt.l}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-border rounded-xl p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted font-medium mb-3">💳 Assinatura de {house.name}</p>

        {subscription === null ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium">{TIER_LABELS[subscription.tier]}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${
                  subscription.status === 'active' || subscription.tier === 'grandfathered'
                    ? 'bg-sage/15 text-sage'
                    : subscription.status === 'trialing'
                      ? 'bg-blue/15 text-blue'
                      : 'bg-danger/15 text-danger'
                }`}
              >
                {subscription.status === 'trialing'
                  ? `${trialDaysLeft(subscription) ?? 0} dia(s) restante(s)`
                  : subscription.status === 'active'
                    ? 'Ativa'
                    : subscription.status === 'past_due'
                      ? 'Pagamento pendente'
                      : 'Cancelada'}
              </span>
            </div>
            <p className="text-xs text-muted">
              {house.role === 'owner' || house.role === 'admin'
                ? 'Gerencie o plano na aba Casa.'
                : 'Só o Proprietário ou Admin desta Casa podem gerenciar a assinatura.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
