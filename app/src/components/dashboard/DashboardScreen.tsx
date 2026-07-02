import { useEffect, useMemo, useState } from 'react'
import type { House } from '../../types/house'
import type { Employee } from '../../types/employee'
import type { WorkEvent } from '../../types/event'
import type { Adjustment } from '../../types/adjustment'
import type { Payment } from '../../types/payment'
import type { RegionalHoliday } from '../../lib/payroll/holidays'
import { bday5 } from '../../lib/payroll/holidays'
import { calc, MK, type PayrollCalc } from '../../lib/payroll/calc'
import { MP } from '../../lib/payroll/constants'
import { fm, fd } from '../../lib/payroll/format'
import { activeMonthsFor, type MonthRef } from '../../lib/payroll/activeMonths'
import { defaultReferenceMonth } from '../../lib/payroll/referenceMonth'
import { loadEmployees } from '../../hooks/useEmployees'
import { loadEventsForEmployee } from '../../hooks/useEvents'
import { loadAdjustmentsForEmployee } from '../../hooks/useAdjustments'
import { loadPaymentsForEmployee } from '../../hooks/usePayments'
import { loadRegionalHolidays, loadOverrides } from '../../hooks/useSettings'
import { BarChart, DonutChart, PieChart, StackedBarChart } from './charts'

type Mode = 'mes' | 'periodo'

export function DashboardScreen({ house }: { house: House }) {
  const [employees, setEmployees] = useState<Employee[] | null>(null)
  const [eventsByEmp, setEventsByEmp] = useState<Record<string, Record<string, WorkEvent[]>>>({})
  const [adjByEmp, setAdjByEmp] = useState<Record<string, Record<string, Adjustment[]>>>({})
  const [paymentsByEmp, setPaymentsByEmp] = useState<Record<string, Record<string, Payment>>>({})
  const [regional, setRegional] = useState<RegionalHoliday[]>([])
  const [overrides, setOverrides] = useState<Record<string, unknown>>({})
  const [error, setError] = useState('')

  const [mode, setMode] = useState<Mode>('mes')
  const now = new Date()
  const [selMonth, setSelMonth] = useState<MonthRef>(() => defaultReferenceMonth([]))
  const activeMonths = useMemo(() => activeMonthsFor(employees), [employees])
  const [from, setFrom] = useState<MonthRef | null>(null)
  const [to, setTo] = useState<MonthRef | null>(null)

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

  const rangeFrom = from ?? activeMonths[0] ?? selMonth
  const rangeTo = to ?? activeMonths[activeMonths.length - 1] ?? selMonth
  const inRange = useMemo(() => {
    const months: MonthRef[] = []
    let y = rangeFrom.y
    let m = rangeFrom.m
    // eslint-disable-next-line no-constant-condition
    while (true) {
      months.push({ y, m })
      if (y === rangeTo.y && m === rangeTo.m) break
      m++
      if (m > 11) {
        m = 0
        y++
      }
      if (months.length > 240) break // guarda-corpo
    }
    return months
  }, [rangeFrom.y, rangeFrom.m, rangeTo.y, rangeTo.m])

  const last6 = useMemo(() => {
    const months: MonthRef[] = []
    let y = selMonth.y
    let m = selMonth.m
    for (let i = 0; i < 6; i++) {
      months.unshift({ y, m })
      m--
      if (m < 0) {
        m = 11
        y--
      }
    }
    return months
  }, [selMonth.y, selMonth.m])

  if (employees === null) {
    return (
      <div className="w-full max-w-3xl mx-auto p-4">
        <p className="text-sm text-muted">Carregando…</p>
      </div>
    )
  }

  const active = employees.filter((e) => e.status !== 'desligado')

  if (mode === 'mes') {
    const calcs = active.map((e) => calcFor(e, selMonth.y, selMonth.m))
    const totSal = calcs.reduce((a, c) => a + c.finalNetSal, 0)
    const totVT = calcs.reduce((a, c) => a + c.vtNet, 0)
    const totAll = calcs.reduce((a, c) => a + c.total, 0)
    const totPago = calcs.reduce((a, c) => a + (c.payment?.total ?? 0), 0)
    const totAPagar = totAll - totPago
    const paidCount = calcs.filter((c) => c.payment).length
    const monthLabel = `${MP[selMonth.m]} ${selMonth.y}`
    const pyY = selMonth.m === 11 ? selMonth.y + 1 : selMonth.y
    const pyM = selMonth.m === 11 ? 0 : selMonth.m + 1
    const p5 = bday5(pyY, pyM, regional)

    const barData = last6.map(({ y, m }) => ({
      label: `${MP[m].slice(0, 3)}/${String(y).slice(2)}`,
      value: active.reduce((s, e) => s + calcFor(e, y, m).total, 0),
      current: y === selMonth.y && m === selMonth.m,
    }))
    const stackedData = last6.map(({ y, m }) => ({
      label: `${MP[m].slice(0, 3)}/${String(y).slice(2)}`,
      salario: active.reduce((s, e) => s + calcFor(e, y, m).finalNetSal, 0),
      vt: active.reduce((s, e) => s + calcFor(e, y, m).vtNet, 0),
      current: y === selMonth.y && m === selMonth.m,
    }))
    const pieSlices = calcs
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total)
      .map((c) => ({ label: firstLast(c.emp.name), value: c.total }))

    return (
      <div className="w-full max-w-3xl mx-auto p-4 space-y-4">
        <Header
          mode={mode}
          setMode={setMode}
          activeMonths={activeMonths}
          selMonth={selMonth}
          setSelMonth={setSelMonth}
          from={rangeFrom}
          to={rangeTo}
          setFrom={setFrom}
          setTo={setTo}
        />

        <div className="text-xs text-muted bg-cream rounded-lg px-3 py-2">
          <strong>{monthLabel}</strong> é o <strong>mês de referência</strong> (o mês trabalhado). O pagamento deve
          ocorrer até o 5º dia útil de <strong>{MP[pyM]} {pyY}</strong>
          {p5 ? ` — até ${fd(p5.iso)}` : ''}.
        </div>

        {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <SummaryCard label="Funcionários ativos" value={String(active.length)} sub="" colorClass="text-accent" />
          <SummaryCard label="Total salários" value={`R$ ${fm(totSal)}`} sub={monthLabel} colorClass="text-sage" />
          <SummaryCard label="Total VT" value={`R$ ${fm(totVT)}`} sub={monthLabel} colorClass="text-blue" />
          <SummaryCard label="Total a pagar" value={`R$ ${fm(totAll)}`} sub="sal. + VT" colorClass="text-accent" />
          <SummaryCard label="Valor pago" value={`R$ ${fm(totPago)}`} sub={monthLabel} colorClass="text-sage" />
          <SummaryCard label="Saldo a pagar" value={`R$ ${fm(totAPagar)}`} sub="total − pago" colorClass="text-warn" />
        </div>

        {calcs.length === 0 ? (
          <p className="text-sm text-muted">Nenhum funcionário cadastrado ainda.</p>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <BarChart title="Total a pagar — últimos 6 meses" bars={barData} />
              <DonutChart title={`Pagamentos — ${monthLabel}`} paid={paidCount} total={calcs.length} />
              <PieChart title={`Distribuição da folha — ${monthLabel}`} slices={pieSlices} total={totAll} />
              <StackedBarChart title="Composição mensal (salário vs. VT)" months={stackedData} />
            </div>

            <EmployeeStatusTable calcs={calcs} />
            <p className="text-xs text-muted">
              Para lançar diárias, ajustes ou confirmar pagamentos, use a aba <strong>Folha de Pagamento</strong>.
            </p>
          </>
        )}
      </div>
    )
  }

  // ── modo período ──────────────────────────────────────────
  const perCalcs = inRange.map((mr) => active.map((e) => calcFor(e, mr.y, mr.m)))
  const flatCalcs = perCalcs.flat()
  const totSal = flatCalcs.reduce((a, c) => a + c.finalNetSal, 0)
  const totVT = flatCalcs.reduce((a, c) => a + c.vtNet, 0)
  const totAll = flatCalcs.reduce((a, c) => a + c.total, 0)
  const totPago = flatCalcs.reduce((a, c) => a + (c.payment?.total ?? 0), 0)
  const totAPagar = totAll - totPago
  const paidCount = flatCalcs.filter((c) => c.payment).length
  const rangeLabel = `${MP[rangeFrom.m]} ${rangeFrom.y} → ${MP[rangeTo.m]} ${rangeTo.y}`

  const barData = inRange.map((mr, i) => ({
    label: `${MP[mr.m].slice(0, 3)}/${String(mr.y).slice(2)}`,
    value: perCalcs[i].reduce((s, c) => s + c.total, 0),
    current: mr.y === now.getFullYear() && mr.m === now.getMonth(),
  }))
  const stackedData = inRange.map((mr, i) => ({
    label: `${MP[mr.m].slice(0, 3)}/${String(mr.y).slice(2)}`,
    salario: perCalcs[i].reduce((s, c) => s + c.finalNetSal, 0),
    vt: perCalcs[i].reduce((s, c) => s + c.vtNet, 0),
    current: mr.y === now.getFullYear() && mr.m === now.getMonth(),
  }))
  const byEmp: Record<string, { label: string; value: number }> = {}
  for (const c of flatCalcs) {
    if (!byEmp[c.emp.id]) byEmp[c.emp.id] = { label: firstLast(c.emp.name), value: 0 }
    byEmp[c.emp.id].value += c.total
  }
  const pieSlices = Object.values(byEmp)
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)

  return (
    <div className="w-full max-w-3xl mx-auto p-4 space-y-4">
      <Header
        mode={mode}
        setMode={setMode}
        activeMonths={activeMonths}
        selMonth={selMonth}
        setSelMonth={setSelMonth}
        from={rangeFrom}
        to={rangeTo}
        setFrom={setFrom}
        setTo={setTo}
      />

      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <SummaryCard label="Funcionários ativos" value={String(active.length)} sub="" colorClass="text-accent" />
        <SummaryCard label="Total salários" value={`R$ ${fm(totSal)}`} sub={rangeLabel} colorClass="text-sage" />
        <SummaryCard label="Total VT" value={`R$ ${fm(totVT)}`} sub={rangeLabel} colorClass="text-blue" />
        <SummaryCard label="Total a pagar" value={`R$ ${fm(totAll)}`} sub="sal. + VT" colorClass="text-accent" />
        <SummaryCard label="Valor pago" value={`R$ ${fm(totPago)}`} sub={rangeLabel} colorClass="text-sage" />
        <SummaryCard label="Saldo a pagar" value={`R$ ${fm(totAPagar)}`} sub="total − pago" colorClass="text-warn" />
      </div>

      {flatCalcs.length === 0 ? (
        <p className="text-sm text-muted">Nenhum funcionário cadastrado ainda.</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <BarChart title={`Total a pagar — ${rangeLabel}`} bars={barData} />
            <DonutChart title={`Pagamentos — ${rangeLabel}`} paid={paidCount} total={flatCalcs.length} />
            <PieChart title={`Distribuição da folha — ${rangeLabel}`} slices={pieSlices} total={totAll} />
            <StackedBarChart title="Composição por mês (salário vs. VT)" months={stackedData} />
          </div>
          <p className="text-xs text-muted">
            Para lançar diárias, ajustes ou confirmar pagamentos, use a aba <strong>Folha de Pagamento</strong>.
          </p>
        </>
      )}
    </div>
  )
}

function Header({
  mode, setMode, activeMonths, selMonth, setSelMonth, from, to, setFrom, setTo,
}: {
  mode: Mode
  setMode: (m: Mode) => void
  activeMonths: MonthRef[]
  selMonth: MonthRef
  setSelMonth: (m: MonthRef) => void
  from: MonthRef
  to: MonthRef
  setFrom: (m: MonthRef) => void
  setTo: (m: MonthRef) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <h2 className="text-lg font-medium">Visão Geral</h2>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode('mes')}
            className={`px-2.5 py-1 rounded-lg text-[11px] border ${mode === 'mes' ? 'bg-accent text-white border-accent' : 'border-border text-muted'}`}
          >
            Mês
          </button>
          <button
            type="button"
            onClick={() => setMode('periodo')}
            className={`px-2.5 py-1 rounded-lg text-[11px] border ${mode === 'periodo' ? 'bg-accent text-white border-accent' : 'border-border text-muted'}`}
          >
            Período
          </button>
        </div>
        {mode === 'mes' ? (
          <select
            className="input w-auto"
            value={`${selMonth.y}-${selMonth.m}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number)
              setSelMonth({ y, m })
            }}
          >
            {activeMonths.map(({ y, m }) => (
              <option key={`${y}-${m}`} value={`${y}-${m}`}>
                {MP[m]} {y}
              </option>
            ))}
          </select>
        ) : (
          <>
            <select
              className="input w-auto"
              value={`${from.y}-${from.m}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-').map(Number)
                setFrom({ y, m })
              }}
            >
              {activeMonths.map(({ y, m }) => (
                <option key={`${y}-${m}`} value={`${y}-${m}`}>
                  {MP[m]} {y}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">até</span>
            <select
              className="input w-auto"
              value={`${to.y}-${to.m}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-').map(Number)
                setTo({ y, m })
              }}
            >
              {activeMonths.map(({ y, m }) => (
                <option key={`${y}-${m}`} value={`${y}-${m}`}>
                  {MP[m]} {y}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
    </div>
  )
}

function EmployeeStatusTable({ calcs }: { calcs: PayrollCalc[] }) {
  return (
    <div className="border border-border rounded-xl overflow-x-auto overflow-y-hidden">
      <table className="w-full text-xs min-w-[420px]">
        <thead>
          <tr className="border-b-2 border-border text-muted uppercase text-[10px]">
            <th className="text-left px-3 py-2">Funcionário</th>
            <th className="text-right px-3 py-2">Total</th>
            <th className="text-center px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {calcs.map((c) => (
            <tr key={c.emp.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2 whitespace-nowrap">
                <div>{c.emp.name}</div>
                <div className="text-muted text-[10px]">{c.role}</div>
              </td>
              <td className="text-right px-3 py-2 font-medium text-accent whitespace-nowrap">R$ {fm(c.total)}</td>
              <td className="text-center px-3 py-2 whitespace-nowrap">
                {c.payment ? (
                  <span className="text-sage">✓ Pago em {fd(c.payment.paidDate)}</span>
                ) : c.holWarns.length > 0 ? (
                  <span className="text-warn">⚠️ {c.holWarns.length} feriado(s)</span>
                ) : (
                  <span className="text-muted">○ Pendente</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SummaryCard({ label, value, sub, colorClass }: { label: string; value: string; sub: string; colorClass: string }) {
  return (
    <div className="border border-border rounded-xl p-3">
      <div className="text-[10px] text-muted mb-1">{label}</div>
      <div className={`font-medium text-lg ${colorClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
    </div>
  )
}

function firstLast(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0]
}
