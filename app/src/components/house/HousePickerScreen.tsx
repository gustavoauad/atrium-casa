import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { createHouse, joinHouseByInviteCode, loadUserHouses } from '../../hooks/useHouses'
import type { House } from '../../types/house'
import { ROLE_LABELS } from '../../types/house'

export function HousePickerScreen({ onSelect }: { onSelect: (house: House) => void }) {
  const { user } = useAuth()
  const [houses, setHouses] = useState<House[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [newCasaName, setNewCasaName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [showJoinForm, setShowJoinForm] = useState(false)

  useEffect(() => {
    if (!user) return
    loadUserHouses(user.id)
      .then(setHouses)
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function handleCreateHouse() {
    if (!user || !newCasaName.trim()) return
    setBusy(true)
    setError('')
    try {
      const house = await createHouse(user.id, newCasaName.trim())
      onSelect(house)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleJoinHouse() {
    if (!user || !joinCode.trim()) return
    setBusy(true)
    setError('')
    try {
      const house = await joinHouseByInviteCode(user.id, joinCode, user.email)
      onSelect(house)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6">
        <h1 className="text-xl font-medium text-center mb-5">Suas Casas</h1>

        {houses === null && <p className="text-sm text-muted text-center">Carregando…</p>}

        {houses?.length ? (
          <ul className="space-y-2 mb-5">
            {houses.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => onSelect(h)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-surface hover:border-accent text-left"
                >
                  <div>
                    <div className="font-medium text-sm">{h.name}</div>
                    <div className="text-[11px] text-muted mt-0.5">Código: {h.invite_code}</div>
                  </div>
                  <span className="text-[11px] px-2 py-1 rounded-full bg-accent-2/10 text-accent">
                    {ROLE_LABELS[h.role] || h.role}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : houses !== null ? (
          <p className="text-sm text-muted text-center mb-5">Você ainda não pertence a nenhuma Casa.</p>
        ) : null}

        {houses !== null && (
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="block text-[10px] uppercase tracking-wider text-muted font-medium">
                Nova Casa
              </span>
              <div className="flex gap-2">
                <input
                  value={newCasaName}
                  onChange={(e) => setNewCasaName(e.target.value)}
                  placeholder="Ex: Família Silva"
                  className="input"
                />
                <button type="button" disabled={busy} onClick={handleCreateHouse} className="btn-primary px-4 whitespace-nowrap">
                  Criar
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowJoinForm((v) => !v)}
              className="text-xs text-muted underline"
            >
              Tenho um código de convite
            </button>

            {showJoinForm && (
              <div className="flex gap-2">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toLowerCase())}
                  placeholder="Ex: a3f9c2b1"
                  className="input"
                />
                <button type="button" disabled={busy} onClick={handleJoinHouse} className="btn-primary px-4 whitespace-nowrap">
                  Entrar
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
