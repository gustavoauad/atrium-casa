import { useEffect, useState } from 'react'
import type { House } from '../../types/house'
import type { RegionalHoliday } from '../../lib/payroll/holidays'
import { fd } from '../../lib/payroll/format'
import { loadRegionalHolidays, saveRegionalHolidays } from '../../hooks/useSettings'

export function RegionalHolidaysScreen({ house }: { house: House }) {
  const [holidays, setHolidays] = useState<RegionalHoliday[] | null>(null)
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const canWrite = house.role === 'admin' || house.role === 'editor' || house.role === 'member'

  useEffect(() => {
    loadRegionalHolidays(house.id)
      .then(setHolidays)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [house.id])

  async function persist(next: RegionalHoliday[]) {
    setBusy(true)
    setError('')
    try {
      const sorted = [...next].sort((a, b) => a.date.localeCompare(b.date))
      await saveRegionalHolidays(house.id, sorted)
      setHolidays(sorted)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleAdd() {
    if (!date || !name.trim()) return
    const next = (holidays || []).filter((h) => h.date !== date)
    next.push({ date, name: name.trim() })
    await persist(next)
    setDate('')
    setName('')
  }

  async function handleRemove(dateToRemove: string) {
    await persist((holidays || []).filter((h) => h.date !== dateToRemove))
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      <h2 className="text-lg font-medium mb-1">Feriados Regionais</h2>
      <p className="text-xs text-muted mb-4">
        Além dos feriados nacionais, cadastre aqui feriados municipais/estaduais que afetam o cálculo de diárias recorrentes e VT.
      </p>

      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {canWrite && (
        <div className="flex gap-2 mb-4">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input className="input flex-1" placeholder="Nome do feriado" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" disabled={busy} onClick={handleAdd} className="btn-primary px-4 whitespace-nowrap">
            + Adicionar
          </button>
        </div>
      )}

      {holidays === null && <p className="text-sm text-muted">Carregando…</p>}
      {holidays?.length === 0 && <p className="text-sm text-muted">Nenhum feriado regional cadastrado.</p>}

      <ul className="space-y-1">
        {holidays?.map((h) => (
          <li key={h.date} className="flex items-center justify-between text-sm py-2 border-b border-border">
            <span>
              {fd(h.date)} — {h.name}
            </span>
            {canWrite && (
              <button type="button" onClick={() => handleRemove(h.date)} className="text-danger text-xs">
                Remover
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
