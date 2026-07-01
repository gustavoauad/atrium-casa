import type { Adjustment } from '../../types/adjustment'
import { DEDUCTION_TYPES } from '../../types/adjustment'
import type { Employee } from '../../types/employee'
import type { WorkEvent } from '../../types/event'
import type { Payment, RecurringOccurrence } from '../../types/payment'
import { parseLocalDate, r2 } from './format'
import { allHolidays, bday1, bday5, mdays, type RegionalHoliday } from './holidays'
import { inssCalc, irrfCalc } from './inss'
import { DP } from './constants'

export interface CalcInput {
  emp: Employee
  ry: number
  rm: number
  events: WorkEvent[]
  adjustments: Adjustment[]
  payment: Payment | null
  regionalHolidays: RegionalHoliday[]
  /** Dias de VT informados manualmente para este mês; null = calcular automaticamente pelos dias fixos. */
  vtManualDays: number | null
  /** Override do pro-rata do 1º mês; undefined = usar padrão (ativo). */
  proRataOverride?: boolean
}

export interface PayrollCalc {
  emp: Employee
  ry: number
  rm: number
  key: string
  payment: Payment | null
  salBase: number
  recs: RecurringOccurrence[]
  recTot: number
  avs: (WorkEvent & { hn: string | null })[]
  avTot: number
  avPaid: number
  holWarns: { iso: string; hn: string; desc: string; val: number }[]
  gross: number
  adjs: Adjustment[]
  deds: number
  bons: number
  inssAmt: number
  netSal: number
  vtY: number
  vtM: number
  vtWd: number
  vtWdAuto: number
  vtManualDays: number | null
  vtGross: number
  vtDisc: number
  vtNet: number
  pay1: { d: number; iso: string } | null
  pay5: { d: number; iso: string } | null
  pyY: number
  pyM: number
  total: number
  isFirstMonth: boolean
  proRataDias: number
  proRataSal: number
  proRataSalBase: number
  proRataActive: boolean
  finalNetSal: number
  fgts: number
  inssPatronal: number
  prov13: number
  provFerias: number
  custoTotal: number
  irrf: number
}

export function MK(y: number, m: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

export function calc(input: CalcInput): PayrollCalc {
  const { emp, ry, rm, events, adjustments, payment, regionalHolidays, vtManualDays } = input
  const h = allHolidays(regionalHolidays)
  const days = mdays(ry, rm)
  const key = MK(ry, rm)

  const salBase = emp.salary || 0
  const recs: RecurringOccurrence[] = []
  const holWarns: { iso: string; hn: string; desc: string; val: number }[] = []

  for (const rec of emp.recurring || []) {
    for (const d of days.filter((d) => d.dow === rec.dow)) {
      const hn = h[d.iso] || null
      const hasEv = events.some((e) => e.date === d.iso)
      if (hn && !hasEv) {
        if (rec.countHolidays) {
          recs.push({ iso: d.iso, desc: rec.desc || DP[rec.dow], value: rec.value, hn, autoHol: true })
        } else {
          holWarns.push({ iso: d.iso, hn, desc: rec.desc, val: rec.value })
        }
      } else {
        recs.push({ iso: d.iso, desc: rec.desc || DP[rec.dow], value: rec.value, hn, autoHol: false })
      }
    }
  }
  const recTot = recs.reduce((a, r) => a + r.value, 0)

  const avs = events
    .map((e) => ({ ...e, hn: h[e.date] || null }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const avPaid = avs.filter((e) => e.paidDate).reduce((a, e) => a + e.value, 0)
  const avTot = avs.reduce((a, e) => a + e.value, 0)
  const gross = salBase + recTot + avTot

  let deds = 0
  let bons = 0
  for (const a of adjustments) {
    if (DEDUCTION_TYPES.includes(a.type)) deds += a.value
    else if (a.type === 'bonus') bons += a.value
  }
  const inssAmt = emp.inss === 'yes' ? inssCalc(gross) : 0
  const netSal = gross + bons - deds - inssAmt

  const vtY = rm === 11 ? ry + 1 : ry
  const vtM = rm === 11 ? 0 : rm + 1
  const vtDays = mdays(vtY, vtM)
  const vtSet: Record<string, 1> = {}
  for (const d of vtDays) {
    if ((emp.workDays || []).includes(d.dow) && !h[d.iso]) vtSet[d.iso] = 1
  }
  for (const rec of emp.recurring || []) {
    for (const d of vtDays.filter((d) => d.dow === rec.dow && !h[d.iso])) vtSet[d.iso] = 1
  }
  const vtWdAuto = Object.keys(vtSet).length
  const vtWd = vtManualDays !== null ? vtManualDays : vtWdAuto
  const vtGross = vtWd * (emp.vtDaily || 0)
  const vtDisc = emp.vtDiscount === 'none' ? 0 : Math.min(salBase * 0.06, vtGross)
  const vtNet = Math.max(0, vtGross - vtDisc)

  const pyY = rm === 11 ? ry + 1 : ry
  const pyM = rm === 11 ? 0 : rm + 1

  const admissao = emp.admissao ? parseLocalDate(emp.admissao) : null
  const isFirstMonth = !!admissao && admissao.getFullYear() === ry && admissao.getMonth() === rm

  let proRataDias = 0
  let proRataSal = netSal
  let proRataActive = false
  let proRataSalBase = 0

  if (isFirstMonth && admissao) {
    // CLT Art.64: base 30 dias fixo; dias = 31 - diaAdmissao
    proRataDias = 31 - admissao.getDate()
    const fator = proRataDias / 30
    proRataSalBase = Math.round(salBase * fator * 100) / 100
    proRataSal = Math.round((proRataSalBase + recTot + avTot + bons - deds - inssAmt) * 100) / 100
    // Ativo por padrão; só desativa se explicitamente marcado como integral.
    proRataActive = input.proRataOverride !== false
  }

  const finalNetSal = proRataActive ? proRataSal : netSal
  const finalTotal = proRataActive ? r2(proRataSal + vtNet) : r2(netSal + vtNet)

  // Encargos patronais e provisões (LC 150/2015)
  const baseEnc = gross
  const fgts = r2(baseEnc * 0.08)
  const inssPatronal = r2(baseEnc * 0.2)
  const prov13 = r2(baseEnc / 12)
  const provFerias = r2((baseEnc / 12) * (4 / 3))
  const custoTotal = r2(finalTotal + fgts + inssPatronal + prov13 + provFerias)

  const irrfBase = Math.max(0, gross - inssAmt)
  const irrf = irrfCalc(irrfBase)

  return {
    emp, ry, rm, key, payment, salBase, recs, recTot, avs, avTot, avPaid, holWarns, gross, adjs: adjustments,
    deds, bons, inssAmt, netSal, vtY, vtM, vtWd, vtWdAuto, vtManualDays, vtGross, vtDisc, vtNet,
    pay1: bday1(pyY, pyM, regionalHolidays), pay5: bday5(pyY, pyM, regionalHolidays), pyY, pyM,
    total: finalTotal, isFirstMonth, proRataDias, proRataSal, proRataSalBase, proRataActive, finalNetSal,
    fgts, inssPatronal, prov13, provFerias, custoTotal, irrf,
  }
}
