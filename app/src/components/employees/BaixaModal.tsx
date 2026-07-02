import { useState } from 'react'
import type { Employee } from '../../types/employee'
import { calcVerbas, MOTIVO_LABELS, type MotivoRescisao, type VerbasResult } from '../../lib/payroll/rescisao'
import { getCurrentContract } from '../../lib/payroll/contracts'
import { tod } from '../../lib/payroll/format'
import { VerbasBreakdown } from '../rescisao/VerbasBreakdown'

interface Props {
  emp: Employee
  onClose: () => void
  onConfirm: (emp: Employee) => Promise<void>
}

export function BaixaModal({ emp, onClose, onConfirm }: Props) {
  const isEditing = emp.status === 'desligado'
  const [motivo, setMotivo] = useState<MotivoRescisao>((emp.motivoBaixa as MotivoRescisao) || 'pedido')
  const [admissao, setAdmissao] = useState(emp.admissao)
  const [dataDesc, setDataDesc] = useState(emp.dataBaixa || tod())
  const [obs, setObs] = useState(emp.obsBaixa || '')
  const [result, setResult] = useState<VerbasResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handleCalc() {
    setError('')
    if (!admissao || !dataDesc) {
      setError('Preencha as datas.')
      return
    }
    setResult(calcVerbas(getCurrentContract(emp).salary, motivo, admissao, dataDesc, 0, 'indenizado'))
  }

  async function handleConfirm() {
    setError('')
    if (!dataDesc) {
      setError('Informe a data do desligamento.')
      return
    }
    setSaving(true)
    try {
      await onConfirm({
        ...emp,
        status: 'desligado',
        motivoBaixa: motivo,
        dataBaixa: dataDesc,
        admissao,
        obsBaixa: obs.trim(),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-medium">{isEditing ? 'Editar Desligamento' : 'Baixa de Funcionário'}</h2>
          <button type="button" onClick={onClose} className="text-muted text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-3 text-left">
          <p className="text-sm bg-cream rounded-lg px-3 py-2">{emp.name}</p>

          <Field label="Motivo do desligamento">
            <select className="input" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoRescisao)}>
              {Object.entries(MOTIVO_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Data de admissão">
              <input className="input" type="date" value={admissao} onChange={(e) => setAdmissao(e.target.value)} />
            </Field>
            <Field label="Data do desligamento">
              <input className="input" type="date" value={dataDesc} onChange={(e) => setDataDesc(e.target.value)} />
            </Field>
          </div>

          <Field label="Observações">
            <textarea className="input" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Anotações sobre o desligamento..." />
          </Field>

          <button type="button" onClick={handleCalc} className="w-full px-4 py-2 rounded-lg border border-blue text-blue text-sm">
            🧮 Calcular verbas
          </button>

          {result && <VerbasBreakdown r={result} />}

          {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm">
            Cancelar
          </button>
          <button type="button" disabled={saving} onClick={handleConfirm} className="px-4 py-2 rounded-lg bg-danger text-white text-sm disabled:opacity-60">
            {saving ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Confirmar baixa'}
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
