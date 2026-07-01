import { useState } from 'react'
import {
  EMPLOYEE_ROLES,
  WEEKDAYS,
  newEmployee,
  type Employee,
  type ExtraType,
  type RecurringDaily,
} from '../../types/employee'

interface Props {
  employee: Employee | null
  onClose: () => void
  onSave: (emp: Employee) => Promise<void>
}

export function EmployeeModal({ employee, onClose, onSave }: Props) {
  const [emp, setEmp] = useState<Employee>(employee ?? newEmployee())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update<K extends keyof Employee>(key: K, value: Employee[K]) {
    setEmp((prev) => ({ ...prev, [key]: value }))
  }

  function toggleDay(d: number) {
    setEmp((prev) => ({
      ...prev,
      workDays: prev.workDays.includes(d) ? prev.workDays.filter((x) => x !== d) : [...prev.workDays, d],
    }))
  }

  function updateRecurring(i: number, patch: Partial<RecurringDaily>) {
    setEmp((prev) => ({
      ...prev,
      recurring: prev.recurring.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }))
  }
  function addRecurring() {
    setEmp((prev) => ({
      ...prev,
      recurring: [...prev.recurring, { dow: 0, desc: '', value: 0, countHolidays: false }],
    }))
  }
  function removeRecurring(i: number) {
    setEmp((prev) => ({ ...prev, recurring: prev.recurring.filter((_, idx) => idx !== i) }))
  }

  function updateExtraType(i: number, patch: Partial<ExtraType>) {
    setEmp((prev) => ({
      ...prev,
      extraTypes: prev.extraTypes.map((t, idx) => (idx === i ? { ...t, ...patch } : t)),
    }))
  }
  function addExtraType() {
    setEmp((prev) => ({ ...prev, extraTypes: [...prev.extraTypes, { name: '', value: 0 }] }))
  }
  function removeExtraType(i: number) {
    setEmp((prev) => ({ ...prev, extraTypes: prev.extraTypes.filter((_, idx) => idx !== i) }))
  }

  async function handleSave() {
    setError('')
    if (!emp.name.trim()) {
      setError('Informe o nome.')
      return
    }
    setSaving(true)
    try {
      const cleanedRecurring = emp.recurring.filter((r) => r.value > 0)
      const cleanedExtraTypes = emp.extraTypes.filter((t) => t.name.trim())
      await onSave({
        ...emp,
        name: emp.name.trim(),
        notes: emp.notes.trim(),
        recurring: cleanedRecurring,
        extraTypes: cleanedExtraTypes,
        createdAt: emp.createdAt ?? new Date().toISOString(),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-medium">{employee ? 'Editar Funcionário' : 'Novo Funcionário'}</h2>
          <button type="button" onClick={onClose} className="text-muted text-xl leading-none">
            ×
          </button>
        </div>

        <div className="p-6 space-y-4 text-left">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nome completo">
              <input className="input" placeholder="Ana Silva" value={emp.name} onChange={(e) => update('name', e.target.value)} />
            </Field>
            <Field label="Função">
              <select className="input" value={emp.role} onChange={(e) => update('role', e.target.value)}>
                {EMPLOYEE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Salário base (R$)">
              <input
                className="input"
                type="number"
                step="0.01"
                placeholder="0,00"
                value={emp.salary || ''}
                onChange={(e) => update('salary', +e.target.value || 0)}
              />
            </Field>
            <Field label="Tipo de contrato">
              <select className="input" value={emp.contract} onChange={(e) => update('contract', e.target.value as Employee['contract'])}>
                <option value="mensalista">Mensalista (CLT)</option>
                <option value="diarista">Diarista</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Data de admissão">
              <input className="input" type="date" value={emp.admissao} onChange={(e) => update('admissao', e.target.value)} />
            </Field>
            <Field label="Desconto INSS">
              <select className="input" value={emp.inss} onChange={(e) => update('inss', e.target.value as Employee['inss'])}>
                <option value="yes">Sim — descontar automaticamente</option>
                <option value="no">Não</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="VT diário R$ (ida+volta)">
              <input
                className="input"
                type="number"
                step="0.01"
                value={emp.vtDaily || ''}
                onChange={(e) => update('vtDaily', +e.target.value || 0)}
              />
            </Field>
            <Field label="Desconto do VT">
              <select className="input" value={emp.vtDiscount} onChange={(e) => update('vtDiscount', e.target.value as Employee['vtDiscount'])}>
                <option value="legal">6% do salário base — limite legal CLT</option>
                <option value="none">Sem desconto — empregador paga integral</option>
              </select>
            </Field>
          </div>

          <Field label="Dias fixos de trabalho">
            <div className="flex gap-1.5 flex-wrap mt-1">
              {WEEKDAYS.map((label, d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs border ${
                    emp.workDays.includes(d) ? 'bg-accent text-white border-accent' : 'border-border text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <div className="border-t border-border pt-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted mb-1">Diárias Recorrentes</p>
            <p className="text-xs text-muted mb-2">🎉 = contar o valor mesmo em feriado (sem precisar lançar avulsa).</p>
            <div className="space-y-2">
              {emp.recurring.map((r, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    className="input w-24 shrink-0"
                    value={r.dow}
                    onChange={(e) => updateRecurring(i, { dow: +e.target.value })}
                  >
                    {WEEKDAYS.map((label, d) => (
                      <option key={d} value={d}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input flex-1"
                    placeholder="Descrição"
                    value={r.desc}
                    onChange={(e) => updateRecurring(i, { desc: e.target.value })}
                  />
                  <input
                    className="input w-20 shrink-0"
                    type="number"
                    step="0.01"
                    placeholder="R$"
                    value={r.value || ''}
                    onChange={(e) => updateRecurring(i, { value: +e.target.value || 0 })}
                  />
                  <label className="flex items-center gap-1 text-[10px] text-muted shrink-0 whitespace-nowrap">
                    <input type="checkbox" checked={r.countHolidays} onChange={(e) => updateRecurring(i, { countHolidays: e.target.checked })} />
                    🎉
                  </label>
                  <button type="button" onClick={() => removeRecurring(i)} className="w-7 h-8 rounded-md border border-border text-muted shrink-0">
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addRecurring} className="text-xs text-accent underline mt-2">
              + Adicionar recorrência
            </button>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted mb-2">Tipos de Diária Avulsa</p>
            <div className="space-y-2">
              {emp.extraTypes.map((t, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    className="input flex-[2]"
                    placeholder="Nome"
                    value={t.name}
                    onChange={(e) => updateExtraType(i, { name: e.target.value })}
                  />
                  <input
                    className="input w-24 shrink-0"
                    type="number"
                    step="0.01"
                    placeholder="R$"
                    value={t.value || ''}
                    onChange={(e) => updateExtraType(i, { value: +e.target.value || 0 })}
                  />
                  <button type="button" onClick={() => removeExtraType(i)} className="w-7 h-8 rounded-md border border-border text-muted shrink-0">
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addExtraType} className="text-xs text-accent underline mt-2">
              + Adicionar tipo
            </button>
          </div>

          <Field label="Observações">
            <textarea
              className="input"
              rows={3}
              placeholder="Combinados, particularidades..."
              value={emp.notes}
              onChange={(e) => update('notes', e.target.value)}
            />
          </Field>

          {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm">
            Fechar
          </button>
          <button type="button" disabled={saving} onClick={handleSave} className="btn-primary px-4">
            {saving ? 'Salvando…' : 'Salvar'}
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
