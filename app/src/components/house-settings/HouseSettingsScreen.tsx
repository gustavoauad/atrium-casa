import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { House, HouseRole } from '../../types/house'
import { ROLE_COLORS, ROLE_LABELS, isOwner } from '../../types/house'
import {
  changeMemberRole,
  loadHouseMembers,
  removeMember,
  transferOwnership,
  type HouseMember,
} from '../../hooks/useHouseMembers'
import { deleteHouse } from '../../hooks/useHouses'
import { loadHouseThemeColors, saveHouseThemeColors } from '../../hooks/useSettings'
import { DEFAULT_ACCENT, type HouseThemeColors } from '../../lib/houseTheme'
import { isValidHexColor } from '../../lib/color'
import { useAuth } from '../../contexts/AuthContext'
import type { Subscription } from '../../types/subscription'
import { TIER_LABELS, trialDaysLeft } from '../../types/subscription'
import { startCheckout, openBillingPortal } from '../../hooks/useSubscription'

const ROLE_OPTS: { v: HouseRole; l: string }[] = [
  { v: 'viewer', l: 'Visitante' },
  { v: 'member', l: 'Membro' },
  { v: 'admin', l: 'Admin' },
]

const PLAN_PRICES = {
  basico: { monthly: 19.9, annual: 199 },
  premium: { monthly: 39.9, annual: 399 },
}

interface Props {
  house: House
  subscription: Subscription | null
  onSubscriptionRefresh: () => void
  onRoleChanged: (role: HouseRole) => void
  onHouseDeleted: () => void
  onThemeChanged: (colors: HouseThemeColors | null) => void
}

export function HouseSettingsScreen({
  house,
  subscription,
  onSubscriptionRefresh,
  onRoleChanged,
  onHouseDeleted,
  onThemeChanged,
}: Props) {
  const { user } = useAuth()
  const [members, setMembers] = useState<HouseMember[] | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [transferTarget, setTransferTarget] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT)
  const [savingTheme, setSavingTheme] = useState(false)
  const [billingBusy, setBillingBusy] = useState(false)
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly')

  const owner = isOwner(house.role)

  useEffect(() => {
    refresh()
    loadHouseThemeColors(house.id)
      .then((colors) => setAccentColor(colors?.accent || DEFAULT_ACCENT))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [house.id])

  useEffect(() => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${house.invite_code}`
    QRCode.toDataURL(inviteUrl, { width: 160, margin: 1, color: { dark: '#2A2520', light: '#FDFCFA' } })
      .then(setQrDataUrl)
      .catch(() => {})
  }, [house.invite_code])

  async function refresh() {
    try {
      const list = await loadHouseMembers(house.id)
      setMembers(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleRoleChange(userId: string, role: HouseRole) {
    try {
      await changeMemberRole(house.id, userId, role)
      await refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleRemove(userId: string, display: string) {
    if (!confirm(`Remover ${display} da casa?`)) return
    try {
      await removeMember(house.id, userId)
      await refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleTransfer() {
    if (!transferTarget) return
    const target = members?.find((m) => m.user_id === transferTarget)
    const disp = target?.email || target?.display_name || 'este membro'
    if (!confirm(`Transferir a propriedade da Casa para ${disp}? Você vira Admin e não poderá desfazer sozinho(a).`)) return
    setTransferring(true)
    try {
      await transferOwnership(house.id, transferTarget)
      onRoleChanged('admin')
      setTransferTarget('')
      await refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setTransferring(false)
    }
  }

  async function handleDeleteHouse() {
    if (deleteConfirmText.trim() !== house.name) return
    if (!confirm('Essa ação é irreversível e apaga todos os dados da Casa (funcionários, folha, configurações). Confirma?')) return
    setDeleting(true)
    try {
      await deleteHouse(house.id)
      onHouseDeleted()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
      setDeleting(false)
    }
  }

  async function handleSaveThemeColor() {
    if (!isValidHexColor(accentColor)) {
      setError('Cor inválida.')
      return
    }
    setSavingTheme(true)
    setError('')
    try {
      const colors: HouseThemeColors = { accent: accentColor }
      await saveHouseThemeColors(house.id, colors)
      onThemeChanged(colors)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingTheme(false)
    }
  }

  async function handleResetThemeColor() {
    setSavingTheme(true)
    setError('')
    try {
      await saveHouseThemeColors(house.id, null)
      setAccentColor(DEFAULT_ACCENT)
      onThemeChanged(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingTheme(false)
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(house.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function downloadQR() {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = 'atrium-convite.png'
    a.click()
  }

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
    <div className="space-y-4">
      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>}

      <div className="border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] uppercase tracking-wider text-muted font-medium">💳 Assinatura</p>
          <button type="button" onClick={onSubscriptionRefresh} className="text-[11px] text-muted underline">
            Atualizar status
          </button>
        </div>

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

      <div className="border border-border rounded-xl p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted font-medium mb-3">🎨 Cor da Casa</p>
        <p className="text-xs text-muted mb-3">
          Personalize a cor de destaque desta Casa. Vale para todos os membros e visitantes, em qualquer dispositivo.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="color"
            value={isValidHexColor(accentColor) ? accentColor : DEFAULT_ACCENT}
            onChange={(e) => setAccentColor(e.target.value)}
            className="w-11 h-11 rounded-lg border border-border p-0.5 bg-transparent cursor-pointer"
          />
          <input
            className="input flex-1 min-w-[120px] max-w-[140px] font-mono"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            placeholder={DEFAULT_ACCENT}
          />
          <button
            type="button"
            disabled={savingTheme || !isValidHexColor(accentColor)}
            onClick={handleSaveThemeColor}
            className="btn-primary px-4 whitespace-nowrap"
          >
            {savingTheme ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            type="button"
            disabled={savingTheme}
            onClick={handleResetThemeColor}
            className="px-3 py-2.5 rounded-lg border border-border text-xs whitespace-nowrap"
          >
            Restaurar padrão
          </button>
        </div>
      </div>

      <div className="border border-border rounded-xl p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted font-medium mb-3">Código de Convite &amp; QR Code</p>
        <div className="flex gap-5 flex-wrap items-start">
          <div className="flex-1 min-w-[150px]">
            <div className="text-2xl tracking-[0.2em] font-medium mb-2">{house.invite_code}</div>
            <p className="text-xs text-muted mb-3">
              Compartilhe o código ou o QR Code com quem você quer adicionar à Casa. Ao acessar o link com esse código, a
              pessoa entra automaticamente como Visitante (você pode promover depois).
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={copyCode} className="px-3 py-1.5 rounded-lg border border-border text-xs">
                {copied ? '✓ Copiado!' : '📋 Copiar código'}
              </button>
              <button type="button" onClick={downloadQR} className="px-3 py-1.5 rounded-lg border border-border text-xs">
                ⬇ Baixar QR
              </button>
            </div>
          </div>
          {qrDataUrl && <img src={qrDataUrl} alt="QR Code de convite" width={128} height={128} className="rounded-lg border border-border" />}
        </div>
      </div>

      <div className="border border-border rounded-xl p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted font-medium mb-3">Membros ({members?.length ?? '…'})</p>

        {members === null && <p className="text-sm text-muted">Carregando…</p>}

        <ul>
          {members?.map((m) => {
            const isMe = m.user_id === user?.id
            const disp = m.email || m.display_name || `${m.user_id.slice(0, 8)}…`
            const initial = (m.email || m.display_name || '?')[0]?.toUpperCase()
            return (
              <li key={m.user_id} className="flex items-center justify-between gap-2 py-3 border-b border-border last:border-0 flex-wrap">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-cream border border-border flex items-center justify-center text-sm shrink-0">
                    {initial}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm truncate">
                      {disp} {isMe && <strong className="text-accent">(você)</strong>}
                    </div>
                    <div className={`text-xs mt-0.5 ${ROLE_COLORS[m.role] || 'text-muted'}`}>{ROLE_LABELS[m.role] || m.role}</div>
                  </div>
                </div>
                {!isMe && m.role !== 'owner' && (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.user_id, e.target.value as HouseRole)}
                      className="text-xs px-2 py-1 rounded-lg border border-border bg-cream"
                    >
                      {ROLE_OPTS.map((r) => (
                        <option key={r.v} value={r.v}>
                          {r.l}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleRemove(m.user_id, disp)}
                      className="w-7 h-7 rounded-lg border border-danger/30 text-danger text-xs"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {owner && (
        <div className="border border-border rounded-xl p-4">
          <p className="text-[11px] uppercase tracking-wider text-muted font-medium mb-3">Transferir Propriedade</p>
          <p className="text-xs text-muted mb-3">
            Passe o título de Proprietário para outro membro da Casa. Você vira Admin automaticamente.
          </p>
          <div className="flex gap-2 flex-wrap">
            <select
              value={transferTarget}
              onChange={(e) => setTransferTarget(e.target.value)}
              className="input flex-1 min-w-[160px]"
            >
              <option value="">Selecione um membro…</option>
              {members
                ?.filter((m) => m.user_id !== user?.id)
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.email || m.display_name || m.user_id.slice(0, 8)} ({ROLE_LABELS[m.role] || m.role})
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={!transferTarget || transferring}
              onClick={handleTransfer}
              className="btn-primary px-4 whitespace-nowrap"
            >
              {transferring ? 'Transferindo…' : 'Transferir'}
            </button>
          </div>
        </div>
      )}

      {owner && (
        <div className="border border-danger/30 rounded-xl p-4">
          <p className="text-[11px] uppercase tracking-wider text-danger font-medium mb-3">⚠ Zona de Perigo</p>
          <p className="text-xs text-muted mb-3">
            Excluir a Casa apaga permanentemente todos os funcionários, folhas, pagamentos e configurações. Essa ação não
            pode ser desfeita. Digite <strong>{house.name}</strong> para confirmar.
          </p>
          <div className="flex gap-2 flex-wrap">
            <input
              className="input flex-1 min-w-[160px]"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={house.name}
            />
            <button
              type="button"
              disabled={deleteConfirmText.trim() !== house.name || deleting}
              onClick={handleDeleteHouse}
              className="px-4 py-2.5 rounded-lg bg-danger text-white text-sm font-medium disabled:opacity-60 whitespace-nowrap"
            >
              {deleting ? 'Excluindo…' : 'Excluir Casa'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
