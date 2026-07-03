import { useEffect, useState } from 'react'
import { deleteEmployee, loadEmployees, saveEmployee } from '../../hooks/useEmployees'
import type { Employee } from '../../types/employee'
import type { House } from '../../types/house'
import { canWrite as canWriteRole, isAdminOrOwner } from '../../types/house'
import { getCurrentContract } from '../../lib/payroll/contracts'
import { EmployeeModal } from './EmployeeModal'
import { BaixaModal } from './BaixaModal'

export function EmployeesScreen({ house }: { house: House }) {
  const [employees, setEmployees] = useState<Employee[] | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Employee | null | undefined>(undefined)
  const [baixaTarget, setBaixaTarget] = useState<Employee | null>(null)

  const canWrite = canWriteRole(house.role)
  const canDelete = isAdminOrOwner(house.role)

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [house.id])

  async function refresh() {
    try {
      const list = await loadEmployees(house.id)
      setEmployees(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleSave(emp: Employee) {
    await saveEmployee(house.id, emp)
    setEditing(undefined)
    await refresh()
  }

  async function handleDelete(emp: Employee) {
    if (!canDelete) {
      alert('Acesso negado: somente administradores podem excluir dados.')
      return
    }
    if (!confirm('Excluir funcionário permanentemente?')) return
    try {
      await deleteEmployee(house.id, emp)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleConfirmBaixa(emp: Employee) {
    await saveEmployee(house.id, emp)
    setBaixaTarget(null)
    await refresh()
  }

  return (
    <div className="w-full max-w-3xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Funcionários</h2>
        {canWrite && (
          <button type="button" onClick={() => setEditing(null)} className="btn-primary px-4">
            + Novo Funcionário
          </button>
        )}
      </div>

      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {employees === null && <p className="text-sm text-muted">Carregando…</p>}
      {employees?.length === 0 && <p className="text-sm text-muted">Nenhum funcionário cadastrado ainda.</p>}

      <ul className="space-y-2">
        {employees?.map((emp) => {
          const desligado = emp.status === 'desligado'
          const contract = getCurrentContract(emp)
          return (
            <li key={emp.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card">
              <div>
                <div className="font-medium text-sm flex items-center gap-2">
                  {emp.name}
                  {desligado && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-danger/10 text-danger">
                      Desligado(a) {emp.dataBaixa}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {contract.role} · R$ {contract.salary.toFixed(2)} · {contract.contract === 'mensalista' ? 'Mensalista' : 'Diarista'}
                </div>
              </div>
              <div className="flex gap-2">
                {canWrite && (
                  <button type="button" onClick={() => setEditing(emp)} className="px-3 py-1.5 rounded-lg border border-border text-xs">
                    Editar
                  </button>
                )}
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => setBaixaTarget(emp)}
                    className="px-3 py-1.5 rounded-lg border border-warn/40 text-warn text-xs"
                  >
                    {desligado ? 'Editar desligamento' : 'Dar baixa'}
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDelete(emp)}
                    className="px-3 py-1.5 rounded-lg border border-danger/40 text-danger text-xs"
                  >
                    Excluir
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {editing !== undefined && (
        <EmployeeModal employee={editing} onClose={() => setEditing(undefined)} onSave={handleSave} />
      )}

      {baixaTarget && (
        <BaixaModal emp={baixaTarget} onClose={() => setBaixaTarget(null)} onConfirm={handleConfirmBaixa} />
      )}
    </div>
  )
}
