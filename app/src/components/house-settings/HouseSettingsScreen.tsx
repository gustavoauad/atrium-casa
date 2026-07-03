import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { House, HouseRole } from '../../types/house'
import { ROLE_COLORS, ROLE_LABELS, isAdminOrOwner, isOwner } from '../../types/house'
import {
  changeMemberRole,
  loadHouseMembers,
  removeMember,
  transferOwnership,
  type HouseMember,
} from '../../hooks/useHouseMembers'
import { deleteHouse } from '../../hooks/useHouses'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme, type Theme } from '../../contexts/ThemeContext'

const THEME_OPTS: { v: Theme; l: string }[] = [
  { v: 'light', l: '☀ Claro' },
  { v: 'dark', l: '☾ Escuro' },
  { v: 'system', l: '⚙ Sistema' },
]

const ROLE_OPTS: { v: HouseRole; l: string }[] = [
  { v: 'viewer', l: 'Visitante' },
  { v: 'member', l: 'Membro' },
  { v: 'admin', l: 'Admin' },
]

interface Props {
  house: House
  onRoleChanged: (role: HouseRole) => void
  onHouseDeleted: () => void
}

export function HouseSettingsScreen({ house, onRoleChanged, onHouseDeleted }: Props) {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()
  const [members, setMembers] = useState<HouseMember[] | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [transferTarget, setTransferTarget] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const canManage = isAdminOrOwner(house.role)
  const owner = isOwner(house.role)

  useEffect(() => {
    refresh()
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

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-4">
      <h2 className="text-lg font-medium">Casa: {house.name}</h2>

      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>}

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
                {canManage && !isMe && m.role !== 'owner' && (
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
