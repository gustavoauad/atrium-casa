import type { Adjustment } from '../../types/adjustment'
import { DEDUCTION_TYPES } from '../../types/adjustment'
import type { Contract, Employee } from '../../types/employee'
import type { WorkEvent } from '../../types/event'
import type { Payment, RecurringOccurrence } from '../../types/payment'
import { getContractForMonth } from './contracts'
import { parseLocalDate, r2 } from './format'
import { allHolidays, bday1, bday5, dim, mdays, type RegionalHoliday } from './holidays'
import { inssCalc, irrfCalc } from './inss'
import { DP } from './constants'
import { localISO } from './referenceMonth'

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
  /** Contrato vigente no mês de referência (ry, rm) — use para função/salário/etc históricos. */
  contract: Contract
  role: string
  vtDaily: number
  /** Valor de 1 dia de trabalho (salário ÷ dias úteis do mês, pela jornada do contrato) — usado para descontar faltas. 0 se não aplicável (diarista ou sem dias úteis no mês). */
  dailyRate: number
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
  fgtsIndenizatorio: number
  inssPatronal: number
  sat: number
  prov13: number
  provFerias: number
  custoTotal: number
  irrf: number
}

export function MK(y: number, m: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

/** Primeiro/último dia (ISO) do mês de referência — usado para travar lançamentos ao período do mês. */
export function monthDateRange(y: number, m: number): { min: string; max: string } {
  const last = dim(y, m)
  return { min: `${MK(y, m)}-01`, max: `${MK(y, m)}-${String(last).padStart(2, '0')}` }
}

/** Valor efetivamente pago — registros anteriores ao pagamento parcial não têm `paidAmount`, então caem no total. */
export function paidAmountOf(p: Payment): number {
  return p.paidAmount ?? p.total
}

export function isPartialPayment(p: Payment): boolean {
  return paidAmountOf(p) < p.total - 0.01
}

export function remainingBalance(p: Payment): number {
  return Math.max(0, r2(p.total - paidAmountOf(p)))
}

export type PaymentStatus = 'pago' | 'parcial' | 'nada_a_pagar' | 'pendente'

/**
 * Status único usado em todas as telas (Folha, Dashboard, Relatórios) para evitar
 * cada uma checar `c.payment` de um jeito diferente. `nada_a_pagar`: mês de
 * referência já encerrado, nada foi lançado (total 0) e não há pagamento — evita
 * cobrar confirmação de um pagamento que não existe. Assume que o chamador só
 * invoca para funcionários já filtrados como "ativos" naquele mês.
 */
export function paymentStatus(c: PayrollCalc): PaymentStatus {
  if (c.payment) return isPartialPayment(c.payment) ? 'parcial' : 'pago'
  if (c.total <= 0.01 && localISO(new Date()) > monthDateRange(c.ry, c.rm).max) return 'nada_a_pagar'
  return 'pendente'
}

export function calc(input: CalcInput): PayrollCalc {
  const { emp, ry, rm, events, adjustments, payment, regionalHolidays, vtManualDays } = input
  const contract = getContractForMonth(emp, ry, rm)
  const h = allHolidays(regionalHolidays)
  const days = mdays(ry, rm)
  const key = MK(ry, rm)

  const salBase = contract.salary || 0

  // Valor do dia de trabalho, pela jornada (dias da semana) do contrato — usado para
  // descontar faltas de mensalistas. Diaristas já são pagos por diária lançada, então
  // não há "falta" a descontar do salário-base (fica 0).
  const workDaysInMonth = contract.contract === 'mensalista'
    ? days.filter((d) => (contract.workDays || []).includes(d.dow) && !h[d.iso]).length
    : 0
  const dailyRate = workDaysInMonth > 0 ? r2(salBase / workDaysInMonth) : 0

  const recs: RecurringOccurrence[] = []
  const holWarns: { iso: string; hn: string; desc: string; val: number }[] = []

  for (const rec of contract.recurring || []) {
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

  const sortedAdjustments = [...adjustments].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  let deds = 0
  let bons = 0
  for (const a of adjustments) {
    if (DEDUCTION_TYPES.includes(a.type)) deds += a.value
    else if (a.type === 'bonus') bons += a.value
  }
  const inssAmt = contract.inss === 'yes' ? inssCalc(gross) : 0
  const netSal = gross + bons - deds - inssAmt

  const vtY = rm === 11 ? ry + 1 : ry
  const vtM = rm === 11 ? 0 : rm + 1
  const vtDays = mdays(vtY, vtM)
  const vtSet: Record<string, 1> = {}
  for (const d of vtDays) {
    if ((contract.workDays || []).includes(d.dow) && !h[d.iso]) vtSet[d.iso] = 1
  }
  for (const rec of contract.recurring || []) {
    for (const d of vtDays.filter((d) => d.dow === rec.dow && !h[d.iso])) vtSet[d.iso] = 1
  }
  const vtWdAuto = Object.keys(vtSet).length
  const vtWd = vtManualDays !== null ? vtManualDays : vtWdAuto
  const vtGross = vtWd * (contract.vtDaily || 0)
  const vtDisc = contract.vtDiscount === 'none' ? 0 : Math.min(salBase * 0.06, vtGross)
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

  // Encargos patronais e provisões — Simples Doméstico (LC 150/2015, art. 34):
  // FGTS mensal 8% + FGTS indenizatório 3,2% (substitui a multa rescisória de 40%) +
  // INSS Patronal (CPP) 8% + Seguro contra Acidente de Trabalho 0,8%.
  const baseEnc = gross
  const fgts = r2(baseEnc * 0.08)
  const fgtsIndenizatorio = r2(baseEnc * 0.032)
  const inssPatronal = r2(baseEnc * 0.08)
  const sat = r2(baseEnc * 0.008)
  const prov13 = r2(baseEnc / 12)
  const provFerias = r2((baseEnc / 12) * (4 / 3))
  const custoTotal = r2(finalTotal + fgts + fgtsIndenizatorio + inssPatronal + sat + prov13 + provFerias)

  const irrfBase = Math.max(0, gross - inssAmt)
  const irrf = irrfCalc(irrfBase)

  return {
    emp, contract, role: contract.role, vtDaily: contract.vtDaily || 0, dailyRate, ry, rm, key, payment, salBase, recs, recTot,
    avs, avTot, avPaid, holWarns, gross, adjs: sortedAdjustments,
    deds, bons, inssAmt, netSal, vtY, vtM, vtWd, vtWdAuto, vtManualDays, vtGross, vtDisc, vtNet,
    pay1: bday1(pyY, pyM, regionalHolidays), pay5: bday5(pyY, pyM, regionalHolidays), pyY, pyM,
    total: finalTotal, isFirstMonth, proRataDias, proRataSal, proRataSalBase, proRataActive, finalNetSal,
    fgts, fgtsIndenizatorio, inssPatronal, sat, prov13, provFerias, custoTotal, irrf,
  }
}
