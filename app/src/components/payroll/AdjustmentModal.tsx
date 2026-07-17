import { useState } from 'react'
import type { Employee } from '../../types/employee'
import type { Adjustment, AdjustmentType } from '../../types/adjustment'
import { ADJUSTMENT_LABELS } from '../../types/adjustment'
import { tod, uid } from '../../lib/payroll/format'

interface Props {
  emp: Employee
  adjustment: Adjustment | null
  defaultType?: AdjustmentType
  defaultValue?: number
  defaultDesc?: string
  onClose: () => void
  onSave: (adj: Adjustment) => Promise<void>
  onDelete?: () => Promise<void>
}

const USER_TYPES: AdjustmentType[] = ['advance', 'discount', 'falta', 'bonus', 'loan', 'other']

export function AdjustmentModal({ emp, adjustment, defaultType, defaultValue, defaultDesc, onClose, onSave, onDelete }: Props) {
  const [type, setType] = useState<AdjustmentType>(adjustment?.type || defaultType || 'advance')
  const [value, setValue] = useState(adjustment?.value ?? defaultValue ?? 0)
  const [date, setDate] = useState(adjustment?.date || tod())
  const [desc, setDesc] = useState(adjustment?.desc || defaultDesc || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setError('')
    setSaving(true)
    try {
      await onSave({
        id: adjustment?.id || uid(),
        type,
        value,
        date,
        desc: desc.trim(),
        _sbid: adjustment?._sbid,
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
          <h2 className="font-medium">{adjustment ? 'Editar ajuste' : 'Novo ajuste'}</h2>
          <button type="button" onClick={onClose} className="text-muted text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-3 text-left">
          <p className="text-sm">{emp.name}</p>

          <Field label="Tipo">
            <select className="input" value={type} onChange={(e) => setType(e.target.value as AdjustmentType)}>
              {(USER_TYPES.includes(type) ? USER_TYPES : [type, ...USER_TYPES]).map((t) => (
                <option key={t} value={t}>
                  {ADJUSTMENT_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Valor (R$)">
              <input className="input" type="number" step="0.01" value={value || ''} onChange={(e) => setValue(+e.target.value || 0)} />
            </Field>
            <Field label="Data">
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>

          <Field label="Descrição">
            <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Opcional" />
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
