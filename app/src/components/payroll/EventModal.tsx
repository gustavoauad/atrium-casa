import { useState } from 'react'
import type { Employee } from '../../types/employee'
import type { WorkEvent } from '../../types/event'
import { tod, uid } from '../../lib/payroll/format'
import { holName } from '../../lib/payroll/holidays'
import type { RegionalHoliday } from '../../lib/payroll/holidays'

interface Props {
  emp: Employee
  event: WorkEvent | null
  defaultDate: string
  regionalHolidays: RegionalHoliday[]
  onClose: () => void
  onSave: (ev: WorkEvent) => Promise<void>
  onDelete?: () => Promise<void>
}

export function EventModal({ emp, event, defaultDate, regionalHolidays, onClose, onSave, onDelete }: Props) {
  const firstType = emp.extraTypes[0]
  const [date, setDate] = useState(event?.date || defaultDate)
  const [value, setValue] = useState(event?.value ?? firstType?.value ?? 0)
  const [duration, setDuration] = useState(event?.duration || firstType?.name || '')
  const [notes, setNotes] = useState(event?.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const hn = holName(date, regionalHolidays)

  function selectType(t: { name: string; value: number } | 'custom') {
    if (t === 'custom') return
    setValue(t.value)
    setDuration(t.name)
  }

  async function handleSave() {
    setError('')
    setSaving(true)
    try {
      await onSave({
        id: event?.id || uid(),
        date,
        value,
        duration: duration.trim(),
        holiday: !!hn,
        notes: notes.trim(),
        _sbid: event?._sbid,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-medium">{event ? 'Editar diária' : 'Nova diária avulsa'}</h2>
          <button type="button" onClick={onClose} className="text-muted text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-3 text-left">
          <p className="text-sm">{emp.name}</p>
          {hn && (
            <p className="text-xs text-warn bg-warn/10 border border-warn/30 rounded-lg px-3 py-2">
              🎉 {hn} — se trabalhou neste feriado, confirme o valor da diária.
            </p>
          )}

          <Field label="Data">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>

          <Field label="Tipo">
            <select
              className="input"
              value="__pick"
              onChange={(e) => {
                if (e.target.value === 'custom') return
                selectType(JSON.parse(e.target.value))
              }}
            >
              <option value="__pick" disabled>
                Selecionar tipo pré-definido…
              </option>
              {emp.extraTypes.map((t, i) => (
                <option key={i} value={JSON.stringify(t)}>
                  {t.name} (R$ {t.value.toFixed(2)})
                </option>
              ))}
              <option value="custom">Personalizado…</option>
            </select>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Descrição">
              <input className="input" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Diária 12h" />
            </Field>
            <Field label="Valor (R$)">
              <input
                className="input"
                type="number"
                step="0.01"
                value={value || ''}
                onChange={(e) => setValue(+e.target.value || 0)}
              />
            </Field>
          </div>

          <Field label="Observações">
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex justify-between gap-2 px-6 py-4 border-t border-border">
          {onDelete ? (
            <button type="button" onClick={onDelete} className="px-4 py-2 rounded-lg border border-danger/40 text-danger text-sm">
              Excluir
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm">
              Fechar
            </button>
            <button type="button" disabled={saving} onClick={handleSave} className="btn-primary px-4">
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
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

export function defaultEventDate() {
  return tod()
}
