import { useEffect, useMemo, useState } from 'react'
import type { House } from '../../types/house'
import type { Employee } from '../../types/employee'
import type { WorkEvent } from '../../types/event'
import type { Adjustment } from '../../types/adjustment'
import type { Payment } from '../../types/payment'
import type { RegionalHoliday } from '../../lib/payroll/holidays'
import { calc, MK, type PayrollCalc } from '../../lib/payroll/calc'
import { MP } from '../../lib/payroll/constants'
import { fm, fd } from '../../lib/payroll/format'
import { loadEmployees } from '../../hooks/useEmployees'
import { loadEventsForEmployee } from '../../hooks/useEvents'
import { loadAdjustmentsForEmployee } from '../../hooks/useAdjustments'
import { loadPaymentsForEmployee } from '../../hooks/usePayments'
import { loadRegionalHolidays, loadOverrides } from '../../hooks/useSettings'
import { BarChart, DonutChart, PieChart, StackedBarChart } from './charts'

export function DashboardScreen({ house }: { house: House }) {
  const [employees, setEmployees] = useState<Employee[] | null>(null)
  const [eventsByEmp, setEventsByEmp] = useState<Record<string, Record<string, WorkEvent[]>>>({})
  const [adjByEmp, setAdjByEmp] = useState<Record<string, Record<string, Adjustment[]>>>({})
  const [paymentsByEmp, setPaymentsByEmp] = useState<Record<string, Record<string, Payment>>>({})
  const [regional, setRegional] = useState<RegionalHoliday[]>([])
  const [overrides, setOverrides] = useState<Record<string, unknown>>({})
  const [error, setError] = useState('')

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

  const now = new Date()
  const curY = now.getFullYear()
  const curM = now.getMonth()

  const last6 = useMemo(() => {
    const months: { y: number; m: number }[] = []
    let y = curY
    let m = curM
    for (let i = 0; i < 6; i++) {
      months.unshift({ y, m })
      m--
      if (m < 0) {
        m = 11
        y--
      }
    }
    return months
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curY, curM])

  if (employees === null) {
    return (
      <div className="w-full max-w-3xl mx-auto p-4">
        <p className="text-sm text-muted">Carregando…</p>
      </div>
    )
  }

  const active = employees.filter((e) => e.status !== 'desligado')
  const calcs = active.map((e) => calcFor(e, curY, curM))
  const totSal = calcs.reduce((a, c) => a + c.finalNetSal, 0)
  const totVT = calcs.reduce((a, c) => a + c.vtNet, 0)
  const totAll = calcs.reduce((a, c) => a + c.total, 0)
  const paidCount = calcs.filter((c) => c.payment).length
  const monthLabel = `${MP[curM]} ${curY}`

  const barData = last6.map(({ y, m }) => ({
    label: `${MP[m].slice(0, 3)}/${String(y).slice(2)}`,
    value: active.reduce((s, e) => s + calcFor(e, y, m).total, 0),
    current: y === curY && m === curM,
  }))

  const stackedData = last6.map(({ y, m }) => ({
    label: `${MP[m].slice(0, 3)}/${String(y).slice(2)}`,
    salario: active.reduce((s, e) => s + calcFor(e, y, m).finalNetSal, 0),
    vt: active.reduce((s, e) => s + calcFor(e, y, m).vtNet, 0),
    current: y === curY && m === curM,
  }))

  const pieSlices = calcs
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .map((c) => ({ label: firstLast(c.emp.name), value: c.total }))

  return (
    <div className="w-full max-w-3xl mx-auto p-4 space-y-4">
      <h2 className="text-lg font-medium">Visão Geral</h2>

      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SummaryCard label="Funcionários ativos" value={String(active.length)} sub="" colorClass="text-accent" />
        <SummaryCard label="Total salários" value={`R$ ${fm(totSal)}`} sub={monthLabel} colorClass="text-sage" />
        <SummaryCard label="Total VT" value={`R$ ${fm(totVT)}`} sub={monthLabel} colorClass="text-blue" />
        <SummaryCard label="Total a pagar" value={`R$ ${fm(totAll)}`} sub="sal. + VT" colorClass="text-accent" />
      </div>

      {calcs.length === 0 ? (
        <p className="text-sm text-muted">Nenhum funcionário cadastrado ainda.</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <BarChart title={`Total a pagar — últimos 6 meses`} bars={barData} />
            <DonutChart title={`Pagamentos — ${monthLabel}`} paid={paidCount} total={calcs.length} />
            <PieChart title={`Distribuição da folha — ${monthLabel}`} slices={pieSlices} total={totAll} />
            <StackedBarChart title="Composição mensal (salário vs. VT)" months={stackedData} />
          </div>

          <div className="border border-border rounded-xl overflow-x-auto">
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
                    <td className="px-3 py-2">
                      <div>{c.emp.name}</div>
                      <div className="text-muted text-[10px]">{c.emp.role}</div>
                    </td>
                    <td className="text-right px-3 py-2 font-medium text-accent">R$ {fm(c.total)}</td>
                    <td className="text-center px-3 py-2">
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
          <p className="text-xs text-muted">
            Para lançar diárias, ajustes ou confirmar pagamentos, use a aba <strong>Folha de Pagamento</strong>.
          </p>
        </>
      )}
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
