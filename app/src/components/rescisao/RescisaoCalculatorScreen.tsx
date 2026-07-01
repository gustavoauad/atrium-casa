import { useEffect, useState } from 'react'
import type { House } from '../../types/house'
import type { Employee } from '../../types/employee'
import { loadEmployees } from '../../hooks/useEmployees'
import { calcVerbas, MOTIVO_LABELS, AVISO_LABELS, type MotivoRescisao, type AvisoTipo, type VerbasResult } from '../../lib/payroll/rescisao'
import { fd, tod } from '../../lib/payroll/format'
import { VerbasBreakdown } from './VerbasBreakdown'
import { PrintableView } from '../ui/PrintableView'

export function RescisaoCalculatorScreen({ house }: { house: House }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [empId, setEmpId] = useState('')
  const [salario, setSalario] = useState(0)
  const [motivo, setMotivo] = useState<MotivoRescisao>('pedido')
  const [admissao, setAdmissao] = useState('')
  const [dataDesc, setDataDesc] = useState(tod())
  const [fgts, setFgts] = useState(0)
  const [aviso, setAviso] = useState<AvisoTipo>('trabalhado')
  const [result, setResult] = useState<VerbasResult | null>(null)
  const [error, setError] = useState('')
  const [showPrint, setShowPrint] = useState(false)

  useEffect(() => {
    loadEmployees(house.id).then(setEmployees).catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [house.id])

  function selectEmployee(id: string) {
    setEmpId(id)
    const emp = employees.find((e) => e.id === id)
    if (emp) {
      setSalario(emp.salary)
      setAdmissao(emp.admissao)
    }
  }

  function handleCalc() {
    setError('')
    if (!salario || !admissao || !dataDesc) {
      setError('Preencha salário e datas.')
      return
    }
    setResult(calcVerbas(salario, motivo, admissao, dataDesc, fgts, aviso))
  }

  const emp = employees.find((e) => e.id === empId)
  const nome = emp?.name || 'Funcionário'

  return (
    <div className="w-full max-w-xl mx-auto p-4">
      <h2 className="text-lg font-medium mb-1">Calculadora Rescisória</h2>
      <p className="text-xs text-muted mb-4">
        Estimativa de verbas rescisórias (saldo de salário, 13º e férias proporcionais, aviso prévio, multa FGTS). Consulte um
        contador antes de efetuar o pagamento — esta é uma estimativa, não um documento oficial.
      </p>

      <div className="space-y-3">
        <Field label="Funcionário">
          <select className="input" value={empId} onChange={(e) => selectEmployee(e.target.value)}>
            <option value="">Preenchimento manual</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Salário base">
          <input className="input" type="number" step="0.01" value={salario || ''} onChange={(e) => setSalario(+e.target.value || 0)} />
        </Field>

        <Field label="Motivo da rescisão">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Saldo FGTS acumulado (R$)">
            <input className="input" type="number" step="0.01" value={fgts || ''} onChange={(e) => setFgts(+e.target.value || 0)} />
          </Field>
          <Field label="Aviso prévio">
            <select className="input" value={aviso} onChange={(e) => setAviso(e.target.value as AvisoTipo)}>
              {Object.entries(AVISO_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <button type="button" onClick={handleCalc} className="btn-primary w-full">
          Calcular
        </button>

        {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>}

        {result && (
          <>
            <VerbasBreakdown r={result} />
            <button type="button" onClick={() => setShowPrint(true)} className="w-full px-4 py-2 rounded-lg border border-accent text-accent text-sm">
              🖨 Imprimir
            </button>
          </>
        )}
      </div>

      {showPrint && result && (
        <PrintableView title={`Cálculo de Rescisão — ${nome}`} onClose={() => setShowPrint(false)}>
          <h1 className="text-2xl font-medium mb-1">Cálculo de Rescisão</h1>
          <p className="text-sm mb-1">
            {nome} — {MOTIVO_LABELS[result.motivo]}
          </p>
          <p className="text-xs text-muted mb-4">
            Admissão: {fd(result.admissaoISO)} · Desligamento: {fd(result.desligamentoISO)}
          </p>
          <VerbasBreakdown r={result} />
        </PrintableView>
      )}
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
