import { useEffect, useState } from 'react'
import type { House } from '../../types/house'
import type { Employee } from '../../types/employee'
import { loadEmployees } from '../../hooks/useEmployees'
import { calcVerbas, MOTIVO_LABELS, AVISO_LABELS, type MotivoRescisao, type AvisoTipo, type VerbasResult } from '../../lib/payroll/rescisao'
import { fm, tod } from '../../lib/payroll/format'
import { VerbasBreakdown } from './VerbasBreakdown'

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

  function handlePrint() {
    if (!result) return
    const emp = employees.find((e) => e.id === empId)
    const nome = emp?.name || 'Funcionário'
    const w = window.open('', '_blank', 'width=700,height=800')
    if (!w) return
    const rows = result.itens
      .map(
        (it) =>
          `<tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:8px 0;font-size:13px;">${it.l}</td><td style="padding:8px 0;text-align:right;font-size:15px;color:${it.pos ? '#8A9B8A' : '#B85C5C'}">${it.pos ? '+' : '−'} R$ ${fm(it.v)}</td></tr>`,
      )
      .join('')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Rescisão — ${nome}</title>
      <style>body{font-family:sans-serif;color:#2A2520;max-width:600px;margin:32px auto;padding:0 24px;}
      h1{font-size:24px;font-weight:500;}table{width:100%;border-collapse:collapse;margin-top:16px;}
      .tot{background:#F0EBE0;font-weight:600;}@media print{button{display:none!important;}}</style></head>
      <body><h1>Cálculo de Rescisão</h1><p>${nome} — ${MOTIVO_LABELS[result.motivo]}</p>
      <p style="font-size:12px;color:#9C9087;">Admissão: ${result.admissaoISO} · Desligamento: ${result.desligamentoISO}</p>
      <table>${rows}<tr class="tot"><td style="padding:10px 0;">TOTAL LÍQUIDO</td><td style="padding:10px 0;text-align:right;">R$ ${fm(result.total)}</td></tr></table>
      <div style="margin-top:24px;text-align:center;"><button onclick="window.print()" style="padding:10px 24px;background:#2A2520;color:#fff;border:none;border-radius:8px;cursor:pointer;">Imprimir / Salvar PDF</button></div>
      </body></html>`)
    w.document.close()
  }

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
            <button type="button" onClick={handlePrint} className="w-full px-4 py-2 rounded-lg border border-accent text-accent text-sm">
              🖨 Imprimir
            </button>
          </>
        )}
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
