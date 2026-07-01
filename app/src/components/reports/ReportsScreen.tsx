import { useEffect, useMemo, useState } from 'react'
import type { House } from '../../types/house'
import type { Employee } from '../../types/employee'
import type { WorkEvent } from '../../types/event'
import type { Adjustment } from '../../types/adjustment'
import type { Payment } from '../../types/payment'
import type { RegionalHoliday } from '../../lib/payroll/holidays'
import { calc, MK, type PayrollCalc } from '../../lib/payroll/calc'
import { MP } from '../../lib/payroll/constants'
import { fm } from '../../lib/payroll/format'
import { loadEmployees } from '../../hooks/useEmployees'
import { loadEventsForEmployee } from '../../hooks/useEvents'
import { loadAdjustmentsForEmployee } from '../../hooks/useAdjustments'
import { loadPaymentsForEmployee } from '../../hooks/usePayments'
import { loadRegionalHolidays, loadOverrides } from '../../hooks/useSettings'
import { PrintableView } from '../ui/PrintableView'

type SubTab = 'mensal' | 'acumulado'

interface MonthRef {
  y: number
  m: number
}

export function ReportsScreen({ house }: { house: House }) {
  const [subTab, setSubTab] = useState<SubTab>('mensal')
  const [employees, setEmployees] = useState<Employee[] | null>(null)
  const [eventsByEmp, setEventsByEmp] = useState<Record<string, Record<string, WorkEvent[]>>>({})
  const [adjByEmp, setAdjByEmp] = useState<Record<string, Record<string, Adjustment[]>>>({})
  const [paymentsByEmp, setPaymentsByEmp] = useState<Record<string, Record<string, Payment>>>({})
  const [regional, setRegional] = useState<RegionalHoliday[]>([])
  const [overrides, setOverrides] = useState<Record<string, unknown>>({})
  const [error, setError] = useState('')

  const [inclDes, setInclDes] = useState(false)
  const [empFilter, setEmpFilter] = useState('')

  const now = new Date()
  const [month, setMonth] = useState<MonthRef>({ y: now.getFullYear(), m: now.getMonth() })

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [house.id])

  async function refresh() {
    try {
      const emps = await loadEmployees(house.id)
      setEmployees(emps)
      const [reg, ov] = await Promise.all([loadRegionalHolidays(house.id), loadOverrides(house.id)])
      setRegional(reg)
      setOverrides(ov)

      const eventsAcc: Record<string, Record<string, WorkEvent[]>> = {}
      const adjAcc: Record<string, Record<string, Adjustment[]>> = {}
      const payAcc: Record<string, Record<string, Payment>> = {}
      await Promise.all(
        emps.map(async (e) => {
          const [ev, adj, pays] = await Promise.all([
            loadEventsForEmployee(house.id, e.id),
            loadAdjustmentsForEmployee(house.id, e.id),
            loadPaymentsForEmployee(house.id, e.id),
          ])
          eventsAcc[e.id] = ev
          adjAcc[e.id] = adj
          payAcc[e.id] = {}
          for (const p of pays) payAcc[e.id][p.monthKey] = p
        }),
      )
      setEventsByEmp(eventsAcc)
      setAdjByEmp(adjAcc)
      setPaymentsByEmp(payAcc)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const activeMonths = useMemo(() => activeMonthsFor(employees), [employees])

  function calcFor(emp: Employee, y: number, m: number): PayrollCalc {
    const mk = MK(y, m)
    const vtOverride = overrides[`vt_${emp.id}_${mk}`]
    const prOverride = overrides[`prorata_${emp.id}_${mk}`]
    return calc({
      emp,
      ry: y,
      rm: m,
      events: eventsByEmp[emp.id]?.[mk] || [],
      adjustments: adjByEmp[emp.id]?.[mk] || [],
      payment: paymentsByEmp[emp.id]?.[mk] || null,
      regionalHolidays: regional,
      vtManualDays: typeof vtOverride === 'number' ? vtOverride : null,
      proRataOverride: prOverride === 0 ? false : undefined,
    })
  }

  if (employees === null) {
    return (
      <div className="w-full max-w-3xl mx-auto p-4">
        <p className="text-sm text-muted">Carregando…</p>
      </div>
    )
  }

  const baseEmps = inclDes ? employees : employees.filter((e) => e.status !== 'desligado')
  const filteredEmps = empFilter ? baseEmps.filter((e) => e.id === empFilter) : baseEmps

  return (
    <div className="w-full max-w-3xl mx-auto p-4">
      <h2 className="text-lg font-medium mb-3">Relatórios</h2>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setSubTab('mensal')}
          className={`px-3 py-1.5 rounded-lg text-xs border ${subTab === 'mensal' ? 'bg-sage text-white border-sage' : 'border-border text-muted'}`}
        >
          Mensal
        </button>
        <button
          type="button"
          onClick={() => setSubTab('acumulado')}
          className={`px-3 py-1.5 rounded-lg text-xs border ${subTab === 'acumulado' ? 'bg-sage text-white border-sage' : 'border-border text-muted'}`}
        >
          Acumulado
        </button>
      </div>

      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {subTab === 'mensal' ? (
        <MonthlyReport
          employees={employees}
          filteredEmps={filteredEmps}
          activeMonths={activeMonths}
          month={month}
          setMonth={setMonth}
          empFilter={empFilter}
          setEmpFilter={setEmpFilter}
          inclDes={inclDes}
          setInclDes={setInclDes}
          calcFor={calcFor}
        />
      ) : (
        <AccumulatedReport employees={baseEmps} activeMonths={activeMonths} calcFor={calcFor} />
      )}
    </div>
  )
}

function activeMonthsFor(employees: Employee[] | null): MonthRef[] {
  const now = new Date()
  let start = { y: now.getFullYear(), m: now.getMonth() }
  for (const e of employees || []) {
    if (!e.admissao) continue
    const d = new Date(e.admissao)
    if (d.getFullYear() < start.y || (d.getFullYear() === start.y && d.getMonth() < start.m)) {
      start = { y: d.getFullYear(), m: d.getMonth() }
    }
  }
  const months: MonthRef[] = []
  let y = start.y
  let m = start.m
  const endY = now.getFullYear()
  const endM = now.getMonth()
  while (y < endY || (y === endY && m <= endM)) {
    months.push({ y, m })
    m++
    if (m > 11) {
      m = 0
      y++
    }
  }
  return months
}

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((v) => `"${String(v).split('"').join('""')}"`).join(',')).join('\r\n')
  const a = document.createElement('a')
  a.href = 'data:text/csv;charset=utf-8,﻿' + encodeURIComponent(csv)
  a.download = filename
  a.click()
}

interface MonthlyProps {
  employees: Employee[]
  filteredEmps: Employee[]
  activeMonths: MonthRef[]
  month: MonthRef
  setMonth: (m: MonthRef) => void
  empFilter: string
  setEmpFilter: (id: string) => void
  inclDes: boolean
  setInclDes: (v: boolean) => void
  calcFor: (emp: Employee, y: number, m: number) => PayrollCalc
}

function MonthlyReport({ employees, filteredEmps, activeMonths, month, setMonth, empFilter, setEmpFilter, inclDes, setInclDes, calcFor }: MonthlyProps) {
  const [showPrint, setShowPrint] = useState(false)
  const calcs = filteredEmps.map((e) => calcFor(e, month.y, month.m))
  const totSal = calcs.reduce((a, c) => a + c.finalNetSal, 0)
  const totVT = calcs.reduce((a, c) => a + c.vtNet, 0)
  const totAll = calcs.reduce((a, c) => a + c.total, 0)
  const totInss = calcs.reduce((a, c) => a + c.inssAmt, 0)
  const paidCount = calcs.filter((c) => c.payment).length
  const refLabel = `${MP[month.m]} ${month.y}`
  const pyY = month.m === 11 ? month.y + 1 : month.y
  const pyM = month.m === 11 ? 0 : month.m + 1
  const payLabel = `${MP[pyM]} ${pyY}`

  function exportCSV() {
    const rows: (string | number)[][] = [
      ['Funcionário', 'Função', 'Sal. Base', 'Diárias Rec.', 'Diárias Avulsas', 'Bônus', 'Descontos', 'INSS', 'Sal. Líquido', 'VT Dias', 'VT', 'Total Envelope', 'Pago em', 'Forma', 'Status'],
    ]
    calcs.forEach((c) =>
      rows.push([
        c.emp.name, c.emp.role, c.salBase.toFixed(2), c.recTot.toFixed(2), c.avTot.toFixed(2), c.bons.toFixed(2),
        c.deds.toFixed(2), c.inssAmt.toFixed(2), c.netSal.toFixed(2), c.vtWd, c.vtNet.toFixed(2), c.total.toFixed(2),
        c.payment?.paidDate || '', c.payment?.method || '', c.payment ? 'Pago' : 'Pendente',
      ]),
    )
    downloadCSV(`atrium_relatorio_${MP[month.m]}_${month.y}.csv`, rows)
  }

  return (
    <div>
      <div className="flex gap-2 flex-wrap items-center mb-4">
        <select className="input w-auto" value={`${month.y}-${month.m}`} onChange={(e) => {
          const [y, m] = e.target.value.split('-').map(Number)
          setMonth({ y, m })
        }}>
          {activeMonths.map(({ y, m }) => (
            <option key={`${y}-${m}`} value={`${y}-${m}`}>
              {MP[m]} {y}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
          <option value="">Todos os func.</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.status === 'desligado' ? ' (deslig.)' : ''}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={inclDes} onChange={(e) => setInclDes(e.target.checked)} />
          Desligados
        </label>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => setShowPrint(true)} className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs">
            🖨 PDF
          </button>
          <button type="button" onClick={exportCSV} className="px-3 py-1.5 rounded-lg border border-border text-xs">
            ↓ CSV
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 text-xs text-muted">
        <span>{refLabel} · pago em {payLabel}</span>
        <span className={`px-2 py-0.5 rounded-full ${paidCount === calcs.length && calcs.length > 0 ? 'bg-sage/15 text-sage' : 'bg-warn/15 text-warn'}`}>
          {paidCount}/{calcs.length} pagos
        </span>
      </div>

      {calcs.length === 0 ? (
        <p className="text-sm text-muted">Nenhum funcionário encontrado.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <TotalCard label="Total salários" value={totSal} colorClass="text-sage" />
            <TotalCard label="Total VT" value={totVT} colorClass="text-blue" />
            <TotalCard label="Total a pagar" value={totAll} colorClass="text-accent" />
            <TotalCard label="Total INSS" value={totInss} colorClass="text-muted" />
          </div>

          <div className="border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="border-b-2 border-border text-muted uppercase text-[10px]">
                  <th className="text-left px-2 py-2">Funcionário</th>
                  <th className="text-right px-2 py-2">Sal. líq.</th>
                  <th className="text-right px-2 py-2">VT</th>
                  <th className="text-right px-2 py-2">Total</th>
                  <th className="text-center px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {calcs.map((c) => (
                  <tr key={c.emp.id} className="border-b border-border">
                    <td className="px-2 py-2">
                      <div>{c.emp.name}</div>
                      <div className="text-muted text-[10px]">{c.emp.role}</div>
                    </td>
                    <td className="text-right px-2 py-2">R$ {fm(c.finalNetSal)}</td>
                    <td className="text-right px-2 py-2 text-blue">R$ {fm(c.vtNet)}</td>
                    <td className="text-right px-2 py-2 font-medium text-accent">R$ {fm(c.total)}</td>
                    <td className="text-center px-2 py-2">
                      {c.payment ? <span className="text-sage">✓ Pago</span> : <span className="text-warn">○ Pendente</span>}
                    </td>
                  </tr>
                ))}
                <tr className="bg-cream font-medium">
                  <td className="px-2 py-2">TOTAL ({calcs.length})</td>
                  <td className="text-right px-2 py-2">R$ {fm(totSal)}</td>
                  <td className="text-right px-2 py-2 text-blue">R$ {fm(totVT)}</td>
                  <td className="text-right px-2 py-2 text-accent">R$ {fm(totAll)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {showPrint && (
        <PrintableView title={`Relatório de Pagamentos — ${refLabel}`} onClose={() => setShowPrint(false)}>
          <h1 className="text-2xl font-medium mb-1">Relatório de Pagamentos</h1>
          <p className="text-xs text-muted mb-6">
            Competência: <strong>{refLabel}</strong> · Pagamento: <strong>{payLabel}</strong>
          </p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-cream">
                <th className="text-left px-3 py-2 uppercase text-[10px] text-muted">Funcionário</th>
                <th className="text-right px-3 py-2 uppercase text-[10px] text-muted">Sal. Base</th>
                <th className="text-right px-3 py-2 uppercase text-[10px] text-muted">Diárias</th>
                <th className="text-right px-3 py-2 uppercase text-[10px] text-muted">Descontos</th>
                <th className="text-right px-3 py-2 uppercase text-[10px] text-muted">Sal. Líq.</th>
                <th className="text-right px-3 py-2 uppercase text-[10px] text-muted">VT</th>
                <th className="text-right px-3 py-2 uppercase text-[10px] text-muted">Total</th>
                <th className="text-center px-3 py-2 uppercase text-[10px] text-muted">Status</th>
              </tr>
            </thead>
            <tbody>
              {calcs.map((c) => (
                <tr key={c.emp.id} className="border-b border-border">
                  <td className="px-3 py-2.5">
                    {c.emp.name}
                    <br />
                    <span className="text-[11px] text-muted">{c.emp.role}</span>
                  </td>
                  <td className="text-right px-3 py-2.5">R$ {fm(c.salBase)}</td>
                  <td className="text-right px-3 py-2.5 text-sage">R$ {fm(c.recTot + c.avTot)}</td>
                  <td className="text-right px-3 py-2.5 text-danger">R$ {fm(c.deds + c.inssAmt)}</td>
                  <td className="text-right px-3 py-2.5 font-medium">R$ {fm(c.netSal)}</td>
                  <td className="text-right px-3 py-2.5 text-blue">R$ {fm(c.vtNet)}</td>
                  <td className="text-right px-3 py-2.5 text-base text-accent font-medium">R$ {fm(c.total)}</td>
                  <td className="text-center px-3 py-2.5 text-[11px]">
                    {c.payment ? <span className="text-sage">✓ Pago</span> : <span className="text-warn">⏳ Pendente</span>}
                  </td>
                </tr>
              ))}
              <tr className="bg-cream font-medium">
                <td className="px-3 py-3">TOTAL</td>
                <td colSpan={3} />
                <td />
                <td className="text-right px-3 py-3 text-blue">R$ {fm(totVT)}</td>
                <td className="text-right px-3 py-3 text-lg text-accent">R$ {fm(totAll)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </PrintableView>
      )}
    </div>
  )
}

interface AccProps {
  employees: Employee[]
  activeMonths: MonthRef[]
  calcFor: (emp: Employee, y: number, m: number) => PayrollCalc
}

function AccumulatedReport({ employees, activeMonths, calcFor }: AccProps) {
  const [from, setFrom] = useState(() => activeMonths[0] || { y: new Date().getFullYear(), m: 0 })
  const [to, setTo] = useState(() => activeMonths[activeMonths.length - 1] || { y: new Date().getFullYear(), m: 0 })

  const inRange = activeMonths.filter(
    ({ y, m }) => (y > from.y || (y === from.y && m >= from.m)) && (y < to.y || (y === to.y && m <= to.m)),
  )

  const rows = employees
    .map((emp) => {
      let totSal = 0
      let totVT = 0
      let totInss = 0
      let total = 0
      let paid = 0
      for (const { y, m } of inRange) {
        const c = calcFor(emp, y, m)
        totSal += c.finalNetSal
        totVT += c.vtNet
        totInss += c.inssAmt
        total += c.total
        if (c.payment) paid++
      }
      return { emp, months: inRange.length, totSal, totVT, totInss, total, paid }
    })
    .filter((r) => r.months > 0)
    .sort((a, b) => a.emp.name.localeCompare(b.emp.name, 'pt-BR'))

  const gTot = rows.reduce(
    (acc, r) => ({ sal: acc.sal + r.totSal, vt: acc.vt + r.totVT, inss: acc.inss + r.totInss, total: acc.total + r.total }),
    { sal: 0, vt: 0, inss: 0, total: 0 },
  )

  const rangeLabel = inRange.length ? `${MP[from.m]} ${from.y} → ${MP[to.m]} ${to.y} (${inRange.length} ${inRange.length === 1 ? 'mês' : 'meses'})` : '—'

  function exportCSV() {
    const rowsOut: (string | number)[][] = [['Funcionário', 'Função', 'Meses', 'Sal. Total', 'VT Total', 'INSS Total', 'Total']]
    rows.forEach((r) => rowsOut.push([r.emp.name, r.emp.role, r.months, fm(r.totSal), fm(r.totVT), fm(r.totInss), fm(r.total)]))
    downloadCSV('acumulado.csv', rowsOut)
  }

  const maxTotal = Math.max(...inRange.map(({ y, m }) => employees.reduce((s, e) => s + calcFor(e, y, m).total, 0)), 1)

  return (
    <div>
      <div className="flex gap-2 flex-wrap items-center mb-4">
        <span className="text-xs text-muted">De</span>
        <select className="input w-auto" value={`${from.y}-${from.m}`} onChange={(e) => {
          const [y, m] = e.target.value.split('-').map(Number)
          setFrom({ y, m })
        }}>
          {activeMonths.map(({ y, m }) => (
            <option key={`${y}-${m}`} value={`${y}-${m}`}>
              {MP[m]} {y}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">até</span>
        <select className="input w-auto" value={`${to.y}-${to.m}`} onChange={(e) => {
          const [y, m] = e.target.value.split('-').map(Number)
          setTo({ y, m })
        }}>
          {activeMonths.map(({ y, m }) => (
            <option key={`${y}-${m}`} value={`${y}-${m}`}>
              {MP[m]} {y}
            </option>
          ))}
        </select>
        <button type="button" onClick={exportCSV} className="ml-auto px-3 py-1.5 rounded-lg bg-accent text-white text-xs">
          ↓ CSV
        </button>
      </div>

      {!inRange.length ? (
        <p className="text-sm text-muted">Intervalo sem dados.</p>
      ) : (
        <>
          <div className="border border-border rounded-xl overflow-x-auto mb-4">
            <table className="w-full text-xs min-w-[500px]">
              <thead>
                <tr className="border-b-2 border-border text-muted uppercase text-[10px]">
                  <th className="text-left px-2 py-2">Funcionário ({rangeLabel})</th>
                  <th className="text-right px-2 py-2">Meses</th>
                  <th className="text-right px-2 py-2">Sal. total</th>
                  <th className="text-right px-2 py-2">VT total</th>
                  <th className="text-right px-2 py-2">INSS total</th>
                  <th className="text-right px-2 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.emp.id} className="border-b border-border">
                    <td className="px-2 py-2">
                      <div>{r.emp.name}</div>
                      <div className="text-muted text-[10px]">{r.emp.role}</div>
                    </td>
                    <td className="text-right px-2 py-2 text-muted">{r.paid}/{r.months}</td>
                    <td className="text-right px-2 py-2">R$ {fm(r.totSal)}</td>
                    <td className="text-right px-2 py-2 text-blue">R$ {fm(r.totVT)}</td>
                    <td className="text-right px-2 py-2 text-muted">R$ {fm(r.totInss)}</td>
                    <td className="text-right px-2 py-2 font-medium text-accent">R$ {fm(r.total)}</td>
                  </tr>
                ))}
                <tr className="bg-cream font-medium">
                  <td className="px-2 py-2">TOTAL ({rows.length} func.)</td>
                  <td></td>
                  <td className="text-right px-2 py-2">R$ {fm(gTot.sal)}</td>
                  <td className="text-right px-2 py-2 text-blue">R$ {fm(gTot.vt)}</td>
                  <td className="text-right px-2 py-2 text-muted">R$ {fm(gTot.inss)}</td>
                  <td className="text-right px-2 py-2 text-accent">R$ {fm(gTot.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="border border-border rounded-xl p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted mb-3">Envelope por mês</p>
            <div className="flex items-end gap-2 h-32 overflow-x-auto pb-6">
              {inRange.map(({ y, m }) => {
                const tot = employees.reduce((s, e) => s + calcFor(e, y, m).total, 0)
                const h = Math.max(4, (tot / maxTotal) * 100)
                return (
                  <div key={`${y}-${m}`} className="flex flex-col items-center gap-1 shrink-0 w-12">
                    <div className="w-full bg-accent/70 rounded-t" style={{ height: `${h}px` }} title={`R$ ${fm(tot)}`} />
                    <span className="text-[9px] text-muted">{MP[m].slice(0, 3)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function TotalCard({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className="border border-border rounded-xl p-3">
      <div className="text-[10px] text-muted mb-1">{label}</div>
      <div className={`font-medium ${colorClass}`}>R$ {fm(value)}</div>
    </div>
  )
}
