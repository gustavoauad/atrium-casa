import { useState } from 'react'
import type { House } from '../../types/house'
import { ROLE_LABELS, isAdminOrOwner } from '../../types/house'
import type { Subscription } from '../../types/subscription'
import { TIER_LABELS, trialDaysLeft } from '../../types/subscription'
import { startCheckout, openBillingPortal } from '../../hooks/useSubscription'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme, type Theme } from '../../contexts/ThemeContext'

const THEME_OPTS: { v: Theme; l: string }[] = [
  { v: 'light', l: '☀ Claro' },
  { v: 'dark', l: '☾ Escuro' },
  { v: 'system', l: '⚙ Sistema' },
]

const PLAN_PRICES = {
  basico: { monthly: 19.9, annual: 199 },
  premium: { monthly: 39.9, annual: 399 },
}

interface Props {
  house: House
  subscription: Subscription | null
  onSubscriptionRefresh: () => void
}

export function ProfileScreen({ house, subscription, onSubscriptionRefresh }: Props) {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()
  const [error, setError] = useState('')
  const [billingBusy, setBillingBusy] = useState(false)
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly')

  const canManage = isAdminOrOwner(house.role)

  async function handleSubscribe(tier: 'basico' | 'premium') {
    setBillingBusy(true)
    setError('')
    try {
      const url = await startCheckout(house.id, tier, billingPeriod)
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBillingBusy(false)
    }
  }

  async function handleManageBilling() {
    setBillingBusy(true)
    setError('')
    try {
      const url = await openBillingPortal(house.id)
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBillingBusy(false)
    }
  }

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
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] uppercase tracking-wider text-muted font-medium">💳 Assinatura de {house.name}</p>
          {canManage && (
            <button type="button" onClick={onSubscriptionRefresh} className="text-[11px] text-muted underline">
              Atualizar status
            </button>
          )}
        </div>

        {error && (
          <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-3">{error}</p>
        )}

        {subscription === null ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-sm font-medium">{TIER_LABELS[subscription.tier]}</span>
              {subscription.tier === 'grandfathered' && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-medium">
                  ⭐ Vitalício
                </span>
              )}
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

            {subscription.tier === 'grandfathered' ? (
              <p className="text-[11px] text-muted">
                Acesso Premium vitalício e gratuito, concedido por ser uma Casa dos primeiros tempos do Atrium Casa.
                Obrigado por confiar no app desde o início! 💛
              </p>
            ) : !canManage ? (
              <p className="text-xs text-muted">Só o Proprietário ou Admin desta Casa podem gerenciar a assinatura.</p>
            ) : (
              <>
                {subscription.tier !== 'basico' && subscription.tier !== 'premium' && (
                  <div className="flex gap-1 mb-3">
                    <button
                      type="button"
                      onClick={() => setBillingPeriod('monthly')}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${billingPeriod === 'monthly' ? 'bg-accent text-white border-accent' : 'border-border text-muted'}`}
                    >
                      Mensal
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillingPeriod('annual')}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${billingPeriod === 'annual' ? 'bg-accent text-white border-accent' : 'border-border text-muted'}`}
                    >
                      Anual (2 meses grátis)
                    </button>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  {subscription.tier !== 'premium' && (
                    <button
                      type="button"
                      disabled={billingBusy}
                      onClick={() => handleSubscribe('premium')}
                      className="btn-primary px-4"
                    >
                      Assinar Premium — R$ {PLAN_PRICES.premium[billingPeriod].toFixed(2)}
                      {billingPeriod === 'monthly' ? '/mês' : '/ano'}
                    </button>
                  )}
                  {subscription.tier !== 'basico' && subscription.tier !== 'premium' && (
                    <button
                      type="button"
                      disabled={billingBusy}
                      onClick={() => handleSubscribe('basico')}
                      className="px-4 py-2.5 rounded-lg border border-border text-sm"
                    >
                      Assinar Básico — R$ {PLAN_PRICES.basico[billingPeriod].toFixed(2)}
                      {billingPeriod === 'monthly' ? '/mês' : '/ano'}
                    </button>
                  )}
                  {(subscription.tier === 'basico' || subscription.tier === 'premium') && (
                    <button
                      type="button"
                      disabled={billingBusy}
                      onClick={handleManageBilling}
                      className="px-4 py-2.5 rounded-lg border border-border text-sm"
                    >
                      Gerenciar assinatura
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-muted mt-2">
                  Básico: até 5 funcionários ativos, 1 Casa. Premium: funcionários e Casas ilimitados.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
