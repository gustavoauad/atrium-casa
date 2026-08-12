import { useState } from 'react'
import {
  EMPLOYEE_ROLES,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPES,
  WEEKDAYS,
  newContract,
  newEmployee,
  newLeavePeriod,
  type Contract,
  type Employee,
  type ExtraType,
  type LeavePeriod,
  type LeaveType,
  type RecurringDaily,
} from '../../types/employee'
import { getCurrentContract, resolveContracts } from '../../lib/payroll/contracts'
import { fd, tod, uid } from '../../lib/payroll/format'

interface Props {
  employee: Employee | null
  onClose: () => void
  onSave: (emp: Employee) => Promise<void>
}

/** Campos do contrato que, se mudarem, geram um novo registro em vez de sobrescrever o vigente. */
function contractFieldsEqual(a: Contract, b: Contract) {
  const norm = (c: Contract) => ({
    role: c.role,
    salary: c.salary,
    contract: c.contract,
    vtDaily: c.vtDaily,
    vtDiscount: c.vtDiscount,
    inss: c.inss,
    workDays: [...c.workDays].sort(),
    recurring: c.recurring.filter((r) => r.value > 0),
  })
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b))
}

export function EmployeeModal({ employee, onClose, onSave }: Props) {
  const isNew = employee === null
  const [name, setName] = useState(employee?.name ?? '')
  const [admissao, setAdmissao] = useState(employee?.admissao ?? '')
  const [notes, setNotes] = useState(employee?.notes ?? '')
  const [extraTypes, setExtraTypes] = useState<ExtraType[]>(employee?.extraTypes ?? newEmployee().extraTypes)

  const originalContract = employee ? getCurrentContract(employee) : newContract(admissao)
  const [contract, setContract] = useState<Contract>(originalContract)
  const [changeDate, setChangeDate] = useState(tod())
  const [showHistory, setShowHistory] = useState(false)
  const [historyContracts, setHistoryContracts] = useState<Contract[]>(
    employee ? resolveContracts(employee).filter((c) => c.id !== originalContract.id) : [],
  )
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null)

  const [showLeaves, setShowLeaves] = useState(false)
  const [leavePeriods, setLeavePeriods] = useState<LeavePeriod[]>(employee?.leavePeriods ?? [])
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const contractChanged = !isNew && !contractFieldsEqual(contract, originalContract)

  /** id do contrato → data em que ele deixou de valer (início do contrato seguinte). O vigente atual não entra aqui. */
  const contractEndDates = new Map<string, string>()
  const chronological = [...historyContracts, contract].sort((a, b) =>
    a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0,
  )
  for (let i = 0; i < chronological.length - 1; i++) {
    contractEndDates.set(chronological[i].id, chronological[i + 1].startDate)
  }

  function removeHistoryContract(id: string) {
    if (!confirm('Excluir este contrato do histórico? Isso pode afetar o cálculo de meses passados que usavam essas condições.')) return
    setHistoryContracts((prev) => prev.filter((c) => c.id !== id))
    setEditingHistoryId((prev) => (prev === id ? null : prev))
  }

  function addHistoryContract() {
    const c = newContract(tod())
    setHistoryContracts((prev) => [...prev, c])
    setEditingHistoryId(c.id)
    setShowHistory(true)
  }

  function addLeavePeriod(type: LeaveType) {
    const lp = newLeavePeriod(type, tod())
    setLeavePeriods((prev) => [...prev, lp])
    setEditingLeaveId(lp.id)
    setShowLeaves(true)
  }

  function removeLeavePeriod(id: string) {
    if (!confirm('Excluir este período? Isso volta o cálculo dos meses afetados ao normal.')) return
    setLeavePeriods((prev) => prev.filter((lp) => lp.id !== id))
    setEditingLeaveId((prev) => (prev === id ? null : prev))
  }

  function updateLeavePeriod(id: string, patch: Partial<LeavePeriod>) {
    setLeavePeriods((prev) => prev.map((lp) => (lp.id === id ? { ...lp, ...patch } : lp)))
  }

  function updateContract<K extends keyof Contract>(key: K, value: Contract[K]) {
    setContract((prev) => ({ ...prev, [key]: value }))
  }

  function toggleDay(d: number) {
    setContract((prev) => ({
      ...prev,
      workDays: prev.workDays.includes(d) ? prev.workDays.filter((x) => x !== d) : [...prev.workDays, d],
    }))
  }

  function updateRecurring(i: number, patch: Partial<RecurringDaily>) {
    setContract((prev) => ({
      ...prev,
      recurring: prev.recurring.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }))
  }
  function addRecurring() {
    setContract((prev) => ({
      ...prev,
      recurring: [...prev.recurring, { dow: 0, desc: '', value: 0, countHolidays: false }],
    }))
  }
  function removeRecurring(i: number) {
    setContract((prev) => ({ ...prev, recurring: prev.recurring.filter((_, idx) => idx !== i) }))
  }

  function updateExtraType(i: number, patch: Partial<ExtraType>) {
    setExtraTypes((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  }
  function addExtraType() {
    setExtraTypes((prev) => [...prev, { name: '', value: 0 }])
  }
  function removeExtraType(i: number) {
    setExtraTypes((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    setError('')
    if (!name.trim()) {
      setError('Informe o nome.')
      return
    }
    if (contractChanged && !changeDate) {
      setError('Informe a partir de quando as novas condições valem.')
      return
    }
    if (historyContracts.some((c) => !c.startDate)) {
      setError('Todo contrato no histórico precisa de uma data de início.')
      return
    }
    if (leavePeriods.some((lp) => !lp.startDate || !lp.endDate || lp.startDate > lp.endDate)) {
      setError('Todo período de férias/licença precisa de uma data de início e uma data de fim, com o fim não antes do início.')
      return
    }
    if (!isNew) {
      // O contrato vigente precisa continuar sendo o de data de início mais recente — senão
      // getContractForMonth() passa a escolher um contrato do histórico no lugar dele para o
      // mês atual e os seguintes, porque ele passaria a ter a data mais recente entre os dois.
      const otherStarts = contractChanged ? [...historyContracts, originalContract] : historyContracts
      const maxOtherStart = otherStarts.reduce((max, c) => (c.startDate > max ? c.startDate : max), '')
      const currentStartDate = contractChanged ? changeDate : contract.startDate
      if (maxOtherStart && currentStartDate <= maxOtherStart) {
        setError(
          `A data de início do contrato vigente (${fd(currentStartDate)}) precisa ser posterior a todos os contratos do histórico — o mais recente começa em ${fd(maxOtherStart)}. Do contrário, o histórico passaria a valer no lugar do contrato atual a partir dali.`,
        )
        return
      }
    }
    setSaving(true)
    try {
      const cleanedContract: Contract = {
        ...contract,
        recurring: contract.recurring.filter((r) => r.value > 0),
      }
      const cleanedHistory = historyContracts.map((c) => ({ ...c, recurring: c.recurring.filter((r) => r.value > 0) }))
      const cleanedExtraTypes = extraTypes.filter((t) => t.name.trim())

      let contracts: Contract[]
      if (isNew) {
        contracts = [{ ...cleanedContract, id: uid(), startDate: admissao }]
      } else if (contractChanged) {
        contracts = [...cleanedHistory, originalContract, { ...cleanedContract, id: uid(), startDate: changeDate }]
      } else {
        contracts = [...cleanedHistory, cleanedContract]
      }

      await onSave({
        id: employee?.id ?? crypto.randomUUID(),
        name: name.trim(),
        admissao,
        notes: notes.trim(),
        extraTypes: cleanedExtraTypes,
        contracts,
        leavePeriods,
        createdAt: employee?.createdAt ?? new Date().toISOString(),
        status: employee?.status,
        desligamento: employee?.desligamento,
        motivoBaixa: employee?.motivoBaixa,
        dataBaixa: employee?.dataBaixa,
        obsBaixa: employee?.obsBaixa,
        _sbid: employee?._sbid,
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
          <h2 className="font-medium">{isNew ? 'Novo Funcionário' : 'Editar Funcionário'}</h2>
          <button type="button" onClick={onClose} className="text-muted text-xl leading-none">
            ×
          </button>
        </div>

        <div className="p-6 space-y-4 text-left">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nome completo">
              <input className="input" placeholder="Ana Silva" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Data de admissão">
              <input className="input" type="date" value={admissao} onChange={(e) => setAdmissao(e.target.value)} />
            </Field>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted mb-3">
              {isNew ? 'Condições contratuais' : 'Condições atuais'}
            </p>

            <div className="space-y-3">
              {!isNew && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Vigente desde">
                    <input
                      className="input"
                      type="date"
                      value={contract.startDate}
                      onChange={(e) => updateContract('startDate', e.target.value)}
                    />
                  </Field>
                  <Field label="Função">
                    <select className="input" value={contract.role} onChange={(e) => updateContract('role', e.target.value)}>
                      {EMPLOYEE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}
              {isNew && (
                <Field label="Função">
                  <select className="input" value={contract.role} onChange={(e) => updateContract('role', e.target.value)}>
                    {EMPLOYEE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Salário base (R$)">
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={contract.salary || ''}
                    onChange={(e) => updateContract('salary', +e.target.value || 0)}
                  />
                </Field>
                <Field label="Tipo de contrato">
                  <select className="input" value={contract.contract} onChange={(e) => updateContract('contract', e.target.value as Contract['contract'])}>
                    <option value="mensalista">Mensalista (CLT)</option>
                    <option value="diarista">Diarista</option>
                  </select>
                </Field>
              </div>

              <Field label="Desconto INSS">
                <select className="input" value={contract.inss} onChange={(e) => updateContract('inss', e.target.value as Contract['inss'])}>
                  <option value="yes">Sim — descontar automaticamente</option>
                  <option value="no">Não</option>
                </select>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="VT diário R$ (ida+volta)">
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={contract.vtDaily || ''}
                    onChange={(e) => updateContract('vtDaily', +e.target.value || 0)}
                  />
                </Field>
                <Field label="Desconto do VT">
                  <select className="input" value={contract.vtDiscount} onChange={(e) => updateContract('vtDiscount', e.target.value as Contract['vtDiscount'])}>
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
                        contract.workDays.includes(d) ? 'bg-accent text-white border-accent' : 'border-border text-muted'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted mb-1">Diárias Recorrentes</p>
                <p className="text-xs text-muted mb-2">🎉 = contar o valor mesmo em feriado (sem precisar lançar avulsa).</p>
                <div className="space-y-2">
                  {contract.recurring.map((r, i) => (
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
            </div>

            {contractChanged && (
              <div className="mt-4 bg-warn/10 border border-warn/30 rounded-lg p-3">
                <p className="text-xs text-warn mb-2">
                  As condições acima mudaram. Isso vai criar um <strong>novo contrato</strong> — os meses já calculados com
                  as condições antigas não serão afetados.
                </p>
                <Field label="Novas condições vigentes a partir de">
                  <input className="input" type="date" value={changeDate} onChange={(e) => setChangeDate(e.target.value)} />
                </Field>
              </div>
            )}
          </div>

          {!isNew && (
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="text-xs text-accent underline"
                >
                  {showHistory ? '▲ Ocultar' : '▼ Ver'} histórico de contratos ({historyContracts.length + 1})
                </button>
                {showHistory && (
                  <button type="button" onClick={addHistoryContract} className="text-xs text-accent underline">
                    + Adicionar contrato ao histórico
                  </button>
                )}
              </div>
              {showHistory && (
                <ul className="space-y-1.5">
                  <li className="text-xs bg-cream/50 border border-accent/30 rounded-lg px-3 py-2">
                    <div className="font-medium">
                      Vigente desde {fd(contract.startDate)} <span className="text-accent">(atual)</span>
                    </div>
                    <div className="text-muted">
                      {contract.role} · R$ {contract.salary.toFixed(2)} · {contract.contract === 'mensalista' ? 'Mensalista' : 'Diarista'} · VT R$ {contract.vtDaily.toFixed(2)}
                    </div>
                    <div className="text-muted text-[10px] mt-1">Edite nos campos de "Condições atuais" acima.</div>
                  </li>
                  {historyContracts.length === 0 && (
                    <li className="text-xs text-muted px-1 py-1">Nenhum contrato anterior.</li>
                  )}
                  {[...historyContracts]
                    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
                    .map((c) =>
                      editingHistoryId === c.id ? (
                        <li key={c.id}>
                          <HistoryContractEditor
                            contract={c}
                            onChange={(updated) =>
                              setHistoryContracts((prev) => prev.map((x) => (x.id === c.id ? updated : x)))
                            }
                            onDelete={() => removeHistoryContract(c.id)}
                            onDone={() => setEditingHistoryId(null)}
                          />
                        </li>
                      ) : (
                        <li key={c.id} className="text-xs bg-cream rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                          <div>
                            <div className="font-medium">
                              Vigente de {fd(c.startDate)}
                              {contractEndDates.has(c.id) && <> até {fd(contractEndDates.get(c.id)!)}</>}
                              <span className="text-muted font-normal"> (encerrado)</span>
                            </div>
                            <div className="text-muted">
                              {c.role} · R$ {c.salary.toFixed(2)} · {c.contract === 'mensalista' ? 'Mensalista' : 'Diarista'} · VT R$ {c.vtDaily.toFixed(2)}
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setEditingHistoryId(c.id)}
                              className="px-2 py-1 rounded-md border border-border text-[11px]"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => removeHistoryContract(c.id)}
                              className="px-2 py-1 rounded-md border border-danger/40 text-danger text-[11px]"
                            >
                              Excluir
                            </button>
                          </div>
                        </li>
                      ),
                    )}
                </ul>
              )}
            </div>
          )}

          {!isNew && (
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <button type="button" onClick={() => setShowLeaves((v) => !v)} className="text-xs text-accent underline">
                  {showLeaves ? '▲ Ocultar' : '▼ Ver'} férias e licenças ({leavePeriods.length})
                </button>
                {showLeaves && (
                  <div className="flex gap-2 flex-wrap">
                    {LEAVE_TYPES.map((t) => (
                      <button key={t} type="button" onClick={() => addLeavePeriod(t)} className="text-xs text-accent underline">
                        + {LEAVE_TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {showLeaves && (
                <>
                  <ul className="space-y-1.5">
                    {leavePeriods.length === 0 && (
                      <li className="text-xs text-muted px-1 py-1">Nenhum período lançado.</li>
                    )}
                    {[...leavePeriods]
                      .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
                      .map((lp) =>
                        editingLeaveId === lp.id ? (
                          <li key={lp.id}>
                            <LeavePeriodEditor
                              leave={lp}
                              onChange={(updated) => updateLeavePeriod(lp.id, updated)}
                              onDelete={() => removeLeavePeriod(lp.id)}
                              onDone={() => setEditingLeaveId(null)}
                            />
                          </li>
                        ) : (
                          <li key={lp.id} className="text-xs bg-cream rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                            <div>
                              <div className="font-medium">{LEAVE_TYPE_LABELS[lp.type]}</div>
                              <div className="text-muted">
                                {fd(lp.startDate)} até {fd(lp.endDate)}
                                {lp.notes && ` · ${lp.notes}`}
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => setEditingLeaveId(lp.id)}
                                className="px-2 py-1 rounded-md border border-border text-[11px]"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => removeLeavePeriod(lp.id)}
                                className="px-2 py-1 rounded-md border border-danger/40 text-danger text-[11px]"
                              >
                                Excluir
                              </button>
                            </div>
                          </li>
                        ),
                      )}
                  </ul>
                  <p className="text-[10px] text-muted mt-2">
                    Só afeta contrato mensalista. Não rastreamos saldo de dias já usados/adquiridos — lance o
                    período livremente; confira o direito antes de aprovar.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="border-t border-border pt-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted mb-2">Tipos de Diária Avulsa</p>
            <div className="space-y-2">
              {extraTypes.map((t, i) => (
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
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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

function HistoryContractEditor({
  contract,
  onChange,
  onDelete,
  onDone,
}: {
  contract: Contract
  onChange: (c: Contract) => void
  onDelete: () => void
  onDone: () => void
}) {
  function update<K extends keyof Contract>(key: K, value: Contract[K]) {
    onChange({ ...contract, [key]: value })
  }
  function toggleDay(d: number) {
    onChange({
      ...contract,
      workDays: contract.workDays.includes(d) ? contract.workDays.filter((x) => x !== d) : [...contract.workDays, d],
    })
  }
  function updateRecurring(i: number, patch: Partial<RecurringDaily>) {
    onChange({ ...contract, recurring: contract.recurring.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) })
  }
  function addRecurring() {
    onChange({ ...contract, recurring: [...contract.recurring, { dow: 0, desc: '', value: 0, countHolidays: false }] })
  }
  function removeRecurring(i: number) {
    onChange({ ...contract, recurring: contract.recurring.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="bg-cream rounded-lg p-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Vigente desde">
          <input className="input" type="date" value={contract.startDate} onChange={(e) => update('startDate', e.target.value)} />
        </Field>
        <Field label="Função">
          <select className="input" value={contract.role} onChange={(e) => update('role', e.target.value)}>
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
            value={contract.salary || ''}
            onChange={(e) => update('salary', +e.target.value || 0)}
          />
        </Field>
        <Field label="Tipo de contrato">
          <select className="input" value={contract.contract} onChange={(e) => update('contract', e.target.value as Contract['contract'])}>
            <option value="mensalista">Mensalista (CLT)</option>
            <option value="diarista">Diarista</option>
          </select>
        </Field>
      </div>

      <Field label="Desconto INSS">
        <select className="input" value={contract.inss} onChange={(e) => update('inss', e.target.value as Contract['inss'])}>
          <option value="yes">Sim — descontar automaticamente</option>
          <option value="no">Não</option>
        </select>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="VT diário R$ (ida+volta)">
          <input
            className="input"
            type="number"
            step="0.01"
            value={contract.vtDaily || ''}
            onChange={(e) => update('vtDaily', +e.target.value || 0)}
          />
        </Field>
        <Field label="Desconto do VT">
          <select className="input" value={contract.vtDiscount} onChange={(e) => update('vtDiscount', e.target.value as Contract['vtDiscount'])}>
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
                contract.workDays.includes(d) ? 'bg-accent text-white border-accent' : 'border-border text-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>

      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted mb-1">Diárias Recorrentes</p>
        <div className="space-y-2">
          {contract.recurring.map((r, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select className="input w-24 shrink-0" value={r.dow} onChange={(e) => updateRecurring(i, { dow: +e.target.value })}>
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

      <div className="flex justify-between items-center pt-2 border-t border-border">
        <button type="button" onClick={onDelete} className="text-xs text-danger underline">
          Excluir este contrato
        </button>
        <button type="button" onClick={onDone} className="px-3 py-1.5 rounded-lg border border-border text-xs">
          Concluir edição
        </button>
      </div>
    </div>
  )
}

function LeavePeriodEditor({
  leave,
  onChange,
  onDelete,
  onDone,
}: {
  leave: LeavePeriod
  onChange: (lp: LeavePeriod) => void
  onDelete: () => void
  onDone: () => void
}) {
  function update<K extends keyof LeavePeriod>(key: K, value: LeavePeriod[K]) {
    onChange({ ...leave, [key]: value })
  }

  return (
    <div className="bg-cream rounded-lg p-3 space-y-3">
      <Field label="Tipo">
        <select className="input" value={leave.type} onChange={(e) => update('type', e.target.value as LeaveType)}>
          {LEAVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {LEAVE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Início">
          <input className="input" type="date" value={leave.startDate} onChange={(e) => update('startDate', e.target.value)} />
        </Field>
        <Field label="Fim">
          <input className="input" type="date" value={leave.endDate} onChange={(e) => update('endDate', e.target.value)} />
        </Field>
      </div>

      <Field label="Observações">
        <input className="input" placeholder="Opcional" value={leave.notes} onChange={(e) => update('notes', e.target.value)} />
      </Field>

      <div className="flex justify-between items-center pt-2 border-t border-border">
        <button type="button" onClick={onDelete} className="text-xs text-danger underline">
          Excluir este período
        </button>
        <button type="button" onClick={onDone} className="px-3 py-1.5 rounded-lg border border-border text-xs">
          Concluir edição
        </button>
      </div>
    </div>
  )
}
