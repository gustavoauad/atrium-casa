import { useEffect, useState } from 'react'
import type { House } from '../../types/house'
import type { Employee } from '../../types/employee'
import { loadEmployees } from '../../hooks/useEmployees'
import { getCurrentContract } from '../../lib/payroll/contracts'
import { fd, fm, tod } from '../../lib/payroll/format'
import { PrintableView } from '../ui/PrintableView'

type DocType = 'aviso_previo' | 'trct' | 'quitacao' | 'acordo'

const DOC_LABELS: Record<DocType, string> = {
  aviso_previo: 'Aviso Prévio',
  trct: 'Termo de Rescisão (TRCT)',
  quitacao: 'Recibo de Quitação',
  acordo: 'Termo de Acordo Mútuo',
}

export function DocumentTemplatesScreen({ house }: { house: House }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [empId, setEmpId] = useState('')
  const [docType, setDocType] = useState<DocType>('aviso_previo')
  const [admissao, setAdmissao] = useState('')
  const [dataDesc, setDataDesc] = useState(tod())
  const [empregador, setEmpregador] = useState('')
  const [error, setError] = useState('')
  const [showDoc, setShowDoc] = useState(false)

  useEffect(() => {
    loadEmployees(house.id)
      .then((emps) => {
        setEmployees(emps)
        if (emps[0]) {
          setEmpId(emps[0].id)
          setAdmissao(emps[0].admissao || '')
          if (emps[0].desligamento) setDataDesc(emps[0].desligamento)
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [house.id])

  function selectEmployee(id: string) {
    setEmpId(id)
    const emp = employees.find((e) => e.id === id)
    if (emp) {
      setAdmissao(emp.admissao || '')
      if (emp.desligamento) setDataDesc(emp.desligamento)
    }
  }

  const emp = employees.find((e) => e.id === empId)

  function handleGenerate() {
    setError('')
    if (!emp) {
      setError('Selecione um funcionário.')
      return
    }
    setShowDoc(true)
  }

  return (
    <div className="w-full max-w-xl mx-auto p-4">
      <div className="print:hidden">
        <h2 className="text-lg font-medium mb-1">Templates Rescisórios</h2>
        <p className="text-xs text-muted mb-4">
          Modelos de documentos para formalizar o desligamento. Revise com atenção antes de usar — não substituem
          orientação jurídica/contábil.
        </p>

        <div className="space-y-3">
        <Field label="Funcionário">
          <select className="input" value={empId} onChange={(e) => selectEmployee(e.target.value)}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Documento">
          <select className="input" value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
            {Object.entries(DOC_LABELS).map(([k, v]) => (
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

        <Field label="Nome do empregador">
          <input className="input" placeholder="Seu nome completo" value={empregador} onChange={(e) => setEmpregador(e.target.value)} />
        </Field>

        <button type="button" onClick={handleGenerate} className="btn-primary w-full">
          📄 Gerar documento
        </button>

        {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>}
        </div>
      </div>

      {showDoc && emp && (
        <PrintableView title={DOC_LABELS[docType]} onClose={() => setShowDoc(false)}>
          <DocumentBody
            docType={docType}
            emp={emp}
            admissao={admissao}
            dataDesc={dataDesc}
            empregador={empregador.trim() || '[Nome do Empregador]'}
          />
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

function Campo({ children }: { children: React.ReactNode }) {
  return <span className="inline-block border-b border-text min-w-[120px] text-center font-medium px-1">{children}</span>
}

function Signatures({ empregador, empName, empLabel }: { empregador: string; empName: string; empLabel: string }) {
  return (
    <div className="grid grid-cols-2 gap-16 mt-16">
      <div className="border-t border-text pt-2 text-center text-[11px]">
        {empregador}
        <br />
        <span className="text-muted text-[10px]">Empregador(a)</span>
      </div>
      <div className="border-t border-text pt-2 text-center text-[11px]">
        {empName}
        <br />
        <span className="text-muted text-[10px]">{empLabel}</span>
      </div>
    </div>
  )
}

function DocumentBody({
  docType,
  emp,
  admissao,
  dataDesc,
  empregador,
}: {
  docType: DocType
  emp: Employee
  admissao: string
  dataDesc: string
  empregador: string
}) {
  const contract = getCurrentContract(emp)
  if (docType === 'aviso_previo') {
    return (
      <div className="leading-relaxed">
        <h1 className="font-medium text-2xl text-center mb-1">AVISO PRÉVIO</h1>
        <p className="text-center text-xs text-muted mb-6">Lei Complementar nº 150/2015</p>
        <p className="text-justify mb-3">
          Eu, <Campo>{empregador}</Campo>, empregador(a), comunico ao(a) <Campo>{emp.name}</Campo>, admitido(a) em{' '}
          <Campo>{fd(admissao)}</Campo>, função <Campo>{contract.role}</Campo>, a rescisão do contrato com início em{' '}
          <Campo>{fd(dataDesc)}</Campo>.
        </p>
        <p className="text-justify mb-3">Por ser expressão da verdade, firmamos o presente.</p>
        <p className="text-center">
          <Campo>&nbsp;</Campo>, <Campo>{fd(dataDesc)}</Campo>
        </p>
        <Signatures empregador={empregador} empName={emp.name} empLabel="Empregado(a) — ciente" />
      </div>
    )
  }

  if (docType === 'trct') {
    return (
      <div className="leading-relaxed">
        <h1 className="font-medium text-2xl text-center mb-1">TERMO DE RESCISÃO DO CONTRATO DE TRABALHO</h1>
        <p className="text-center text-xs text-muted mb-6">Lei Complementar nº 150/2015 — Empregado Doméstico</p>
        <p className="mb-3">
          <strong>EMPREGADOR(A):</strong> <Campo>{empregador}</Campo>
        </p>
        <p className="mb-3">
          <strong>EMPREGADO(A):</strong> <Campo>{emp.name}</Campo> &nbsp;&nbsp; <strong>FUNÇÃO:</strong> <Campo>{contract.role}</Campo>
        </p>
        <p className="mb-3">
          <strong>SALÁRIO:</strong> <Campo>R$ {fm(contract.salary)}</Campo> &nbsp;&nbsp; <strong>ADMISSÃO:</strong>{' '}
          <Campo>{fd(admissao)}</Campo> &nbsp;&nbsp; <strong>DESLIGAMENTO:</strong> <Campo>{fd(dataDesc)}</Campo>
        </p>
        <p className="text-justify mb-3">
          As partes declaram que o contrato de trabalho doméstico fica rescindido nesta data, tendo sido pagas todas as
          verbas trabalhistas devidas.
        </p>
        <Signatures empregador={empregador} empName={emp.name} empLabel="Empregado(a)" />
      </div>
    )
  }

  if (docType === 'quitacao') {
    return (
      <div className="leading-relaxed">
        <h1 className="font-medium text-2xl text-center mb-1">RECIBO DE QUITAÇÃO DE VERBAS RESCISÓRIAS</h1>
        <p className="text-center text-xs text-muted mb-6">Lei Complementar nº 150/2015</p>
        <p className="text-justify mb-3">
          Eu, <Campo>{emp.name}</Campo>, declaro ter recebido de <Campo>{empregador}</Campo> as verbas rescisórias devidas,
          dando plena quitação para nada mais reclamar.
        </p>
        <table className="w-full border-collapse my-4 text-sm">
          <thead>
            <tr className="bg-cream">
              <th className="text-left px-2 py-2 text-[11px] uppercase text-muted">Verba</th>
              <th className="text-right px-2 py-2 text-[11px] uppercase text-muted">Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="px-2 py-2">Saldo de salário</td>
              <td className="px-2 py-2 text-right">R$ ___________</td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-2 py-2">13º proporcional</td>
              <td className="px-2 py-2 text-right">R$ ___________</td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-2 py-2">Férias proporcionais + 1/3</td>
              <td className="px-2 py-2 text-right">R$ ___________</td>
            </tr>
            <tr className="border-b-2 border-text">
              <td className="px-2 py-2">Multa FGTS (se aplicável)</td>
              <td className="px-2 py-2 text-right">R$ ___________</td>
            </tr>
            <tr>
              <td className="px-2 py-3 font-semibold">TOTAL LÍQUIDO</td>
              <td className="px-2 py-3 text-right text-xl text-accent">R$ ___________</td>
            </tr>
          </tbody>
        </table>
        <Signatures empregador={empregador} empName={emp.name} empLabel="Empregado(a)" />
      </div>
    )
  }

  // acordo
  return (
    <div className="leading-relaxed">
      <h1 className="font-medium text-2xl text-center mb-1">TERMO DE ACORDO MÚTUO DE RESCISÃO</h1>
      <p className="text-center text-xs text-muted mb-6">Artigo 484-A da CLT</p>
      <p className="text-justify mb-3">
        De um lado, <Campo>{empregador}</Campo>, empregador(a), e de outro, <Campo>{emp.name}</Campo>, função{' '}
        <Campo>{contract.role}</Campo>, salário <Campo>R$ {fm(contract.salary)}</Campo>, admitido(a) em <Campo>{fd(admissao)}</Campo>;
      </p>
      <p className="text-justify mb-3">
        Resolvem, de comum acordo, rescindir o contrato com base no art. 484-A da CLT a partir de <Campo>{fd(dataDesc)}</Campo>,
        fazendo jus a 50% do aviso prévio e 50% da multa FGTS.
      </p>
      <Signatures empregador={empregador} empName={emp.name} empLabel="Empregado(a)" />
    </div>
  )
}
