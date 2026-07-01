import { useEffect, useMemo, useState } from 'react'
import type { House } from '../../types/house'
import type { Employee } from '../../types/employee'
import type { WorkEvent } from '../../types/event'
import type { Adjustment } from '../../types/adjustment'
import type { Payment } from '../../types/payment'
import type { RegionalHoliday } from '../../lib/payroll/holidays'
import { calc, MK } from '../../lib/payroll/calc'
import { MP } from '../../lib/payroll/constants'
import { loadEmployees } from '../../hooks/useEmployees'
import { loadEventsForMonth, saveEvent as saveEventApi, deleteEvent as deleteEventApi } from '../../hooks/useEvents'
import { loadAdjustmentsForMonth, saveAdjustment as saveAdjustmentApi, deleteAdjustment as deleteAdjustmentApi } from '../../hooks/useAdjustments'
import { loadPaymentsForMonth, savePayment as savePaymentApi } from '../../hooks/usePayments'
import { loadRegionalHolidays, loadOverrides, saveOverride } from '../../hooks/useSettings'
import { EmployeeMonthCard } from './EmployeeMonthCard'

export function PayrollScreen({ house }: { house: House }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const [employees, setEmployees] = useState<Employee[] | null>(null)
  const [eventsByEmp, setEventsByEmp] = useState<Record<string, WorkEvent[]>>({})
  const [adjByEmp, setAdjByEmp] = useState<Record<string, Adjustment[]>>({})
  const [paymentByEmp, setPaymentByEmp] = useState<Record<string, Payment>>({})
  const [regional, setRegional] = useState<RegionalHoliday[]>([])
  const [overrides, setOverrides] = useState<Record<string, unknown>>({})
  const [error, setError] = useState('')

  const canWrite = house.role === 'admin' || house.role === 'editor' || house.role === 'member'
  const monthKey = MK(year, month)

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [house.id, monthKey])

  async function refresh() {
    try {
      const [emps, events, adjs, payments, reg, ov] = await Promise.all([
        loadEmployees(house.id),
        loadEventsForMonth(house.id, monthKey),
        loadAdjustmentsForMonth(house.id, monthKey),
        loadPaymentsForMonth(house.id, monthKey),
        loadRegionalHolidays(house.id),
        loadOverrides(house.id),
      ])
      setEmployees(emps)
      setEventsByEmp(events)
      setAdjByEmp(adjs)
      setPaymentByEmp(payments)
      setRegional(reg)
      setOverrides(ov)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function changeMonth(delta: number) {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  const calcs = useMemo(() => {
    if (!employees) return null
    return employees.map((emp) => {
      const vtKey = `vt_${emp.id}_${monthKey}`
      const prKey = `prorata_${emp.id}_${monthKey}`
      const vtOverride = overrides[vtKey]
      const prOverride = overrides[prKey]
      return calc({
        emp,
        ry: year,
        rm: month,
        events: eventsByEmp[emp.id] || [],
        adjustments: adjByEmp[emp.id] || [],
        payment: paymentByEmp[emp.id] || null,
        regionalHolidays: regional,
        vtManualDays: typeof vtOverride === 'number' ? vtOverride : null,
        proRataOverride: prOverride === 0 ? false : undefined,
      })
    })
  }, [employees, eventsByEmp, adjByEmp, paymentByEmp, regional, overrides, year, month, monthKey])

  async function handleSaveEvent(empId: string, ev: WorkEvent) {
    const saved = await saveEventApi(house.id, empId, monthKey, ev)
    setEventsByEmp((prev) => {
      const list = prev[empId] || []
      const i = list.findIndex((e) => e.id === saved.id)
      const next = i >= 0 ? list.map((e, idx) => (idx === i ? saved : e)) : [...list, saved]
      return { ...prev, [empId]: next }
    })
  }

  async function handleDeleteEvent(empId: string, sbid: string) {
    await deleteEventApi(house.id, sbid)
    setEventsByEmp((prev) => ({ ...prev, [empId]: (prev[empId] || []).filter((e) => e._sbid !== sbid) }))
  }

  async function handleSaveAdjustment(empId: string, adj: Adjustment) {
    const saved = await saveAdjustmentApi(house.id, empId, monthKey, adj)
    setAdjByEmp((prev) => {
      const list = prev[empId] || []
      const i = list.findIndex((a) => a.id === saved.id)
      const next = i >= 0 ? list.map((a, idx) => (idx === i ? saved : a)) : [...list, saved]
      return { ...prev, [empId]: next }
    })
  }

  async function handleDeleteAdjustment(empId: string, sbid: string) {
    await deleteAdjustmentApi(house.id, sbid)
    setAdjByEmp((prev) => ({ ...prev, [empId]: (prev[empId] || []).filter((a) => a._sbid !== sbid) }))
  }

  async function handleSetVtOverride(empId: string, days: number | null) {
    const key = `vt_${empId}_${monthKey}`
    await saveOverride(house.id, key, days)
    setOverrides((prev) => ({ ...prev, [key]: days }))
  }

  async function handleSetProRata(empId: string, active: boolean) {
    const key = `prorata_${empId}_${monthKey}`
    await saveOverride(house.id, key, active ? null : 0)
    setOverrides((prev) => ({ ...prev, [key]: active ? null : 0 }))
  }

  async function handleConfirmPayment(empId: string, payment: Payment) {
    const saved = await savePaymentApi(house.id, empId, monthKey, payment)
    setPaymentByEmp((prev) => ({ ...prev, [empId]: saved }))
  }

  return (
    <div className="w-full max-w-3xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="text-lg font-medium">Folha de Pagamento</h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => changeMonth(-1)} className="w-8 h-8 rounded-lg border border-border shrink-0">
            ‹
          </button>
          <span className="text-sm font-medium w-28 sm:w-32 text-center">
            {MP[month]} {year}
          </span>
          <button type="button" onClick={() => changeMonth(1)} className="w-8 h-8 rounded-lg border border-border shrink-0">
            ›
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {calcs === null && <p className="text-sm text-muted">Carregando…</p>}
      {calcs?.length === 0 && <p className="text-sm text-muted">Nenhum funcionário cadastrado ainda.</p>}

      <div className="space-y-2">
        {calcs?.map((c) => (
          <EmployeeMonthCard
            key={c.emp.id}
            c={c}
            canWrite={canWrite}
            regionalHolidays={regional}
            onSaveEvent={(ev) => handleSaveEvent(c.emp.id, ev)}
            onDeleteEvent={(sbid) => handleDeleteEvent(c.emp.id, sbid)}
            onSaveAdjustment={(adj) => handleSaveAdjustment(c.emp.id, adj)}
            onDeleteAdjustment={(sbid) => handleDeleteAdjustment(c.emp.id, sbid)}
            onSetVtOverride={(days) => handleSetVtOverride(c.emp.id, days)}
            onSetProRata={(active) => handleSetProRata(c.emp.id, active)}
            onConfirmPayment={(payment) => handleConfirmPayment(c.emp.id, payment)}
          />
        ))}
      </div>
    </div>
  )
}
