import { useState } from 'react'
import type { WorkEvent } from '../../types/event'
import { fd, fm, tod } from '../../lib/payroll/format'

const METHODS = ['PIX', 'Dinheiro', 'TED', 'Cartão']

interface Props {
  ev: WorkEvent
  onClose: () => void
  onConfirm: (paidDate: string, method: string, notes: string) => Promise<void>
}

export function PayEventModal({ ev, onClose, onConfirm }: Props) {
  const [paidDate, setPaidDate] = useState(tod())
  const [method, setMethod] = useState(METHODS[0])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    setError('')
    setSaving(true)
    try {
      await onConfirm(paidDate, method, notes.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-medium">Pagamento de Diária</h2>
          <button type="button" onClick={onClose} className="text-muted text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-3 text-left">
          <p className="text-sm bg-cream rounded-lg px-3 py-2">
            {fd(ev.date)} — {ev.duration} · R$ {fm(ev.value)}
          </p>

          <Field label="Data do pagamento">
            <input className="input" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </Field>

          <Field label="Forma">
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Observações">
            <input className="input" placeholder="Opcional" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm">
            Cancelar
          </button>
          <button type="button" disabled={saving} onClick={handleConfirm} className="px-4 py-2 rounded-lg bg-sage text-white text-sm disabled:opacity-60">
            {saving ? 'Confirmando…' : '✓ Confirmar pagamento'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-muted font-medium mb-1">{label}</span>
      {children}
    </label>
  )
}
