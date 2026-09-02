import type { Adjustment } from '../../types/adjustment'
import { DEDUCTION_TYPES } from '../../types/adjustment'
import type { Contract, Employee, LeavePeriod, LeaveType } from '../../types/employee'
import type { WorkEvent } from '../../types/event'
import type { Payment, RecurringOccurrence } from '../../types/payment'
import { getContractForDate, getContractForMonth, getPreviousContract } from './contracts'
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
  leavePeriods: LeavePeriod[]
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
  /**
   * Se o contrato vigente começou no meio deste mês (não no dia 1º) e não é o 1º mês do
   * funcionário, os dados usados pra prorratear o salário-base entre o contrato anterior e o
   * novo — dividido pela convenção de mês comercial de 30 dias (Art.64 CLT). null se o contrato
   * já valia desde o início do mês (caso comum) ou se é o 1º mês (usa proRataSalBase nesse caso).
   */
  midMonthChange: { date: string; prevSalary: number; newSalary: number; oldDays: number; newDays: number } | null
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
  /** Dias do mês cobertos por cada tipo de afastamento (LC 150/2015). */
  feriasDiasNoMes: number
  licencaMedicaDiasNoMes: number
  licencaMaternidadeDiasNoMes: number
  /** Adicional de 1/3 constitucional sobre os dias de férias no mês — sujeito a FGTS/INSS. */
  feriasAdicional: number
  /** Dias de férias vendidos (abono pecuniário) atribuídos a este mês de referência. */
  feriasDiasVendidos: number
  /** Valor do abono pecuniário (dias vendidos + 1/3) — verba indenizatória, isenta de INSS/IRRF/FGTS. */
  feriasAbono: number
  /** Descontado do salário — INSS paga direto, contrato suspenso, sai da base de FGTS/encargos. */
  licencaMedicaDeducao: number
  /** Descontado do salário — INSS paga direto, mas FGTS/encargos continuam sobre o valor cheio. */
  licencaMaternidadeDeducao: number
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
  const { emp, ry, rm, events, adjustments, payment, leavePeriods, regionalHolidays, vtManualDays } = input
  const contract = getContractForMonth(emp, ry, rm)
  const h = allHolidays(regionalHolidays)
  const days = mdays(ry, rm)
  const key = MK(ry, rm)

  const admissao = emp.admissao ? parseLocalDate(emp.admissao) : null
  const isFirstMonth = !!admissao && admissao.getFullYear() === ry && admissao.getMonth() === rm

  // Data ISO → tipo de afastamento, para todos os dias de todos os períodos (não só os do
  // mês de referência: o VT é calculado sobre o mês seguinte, então um período pode afetar
  // o VT de um mês sem "cair" no mês de referência do salário em si).
  const leaveDateType: Partial<Record<string, LeaveType>> = {}
  for (const lp of leavePeriods) {
    if (!lp.startDate || !lp.endDate || lp.startDate > lp.endDate) continue
    const end = parseLocalDate(lp.endDate)
    for (const d = parseLocalDate(lp.startDate); d <= end; d.setDate(d.getDate() + 1)) {
      leaveDateType[localISO(d)] = lp.type
    }
  }

  // Se o contrato vigente começou no meio deste mês de referência (não no dia 1º), prorrateia
  // o salário-base entre o contrato anterior e o novo pelo dia da mudança — mesma convenção de
  // mês comercial de 30 dias do pro-rata do 1º mês (Art.64 CLT), só que com um "antes" também.
  // Não combina com o pro-rata do 1º mês (isFirstMonth, abaixo): só é possível ter as duas coisas
  // se o 1º contrato do funcionário também começar no meio do próprio mês de admissão e um 2º
  // contrato começar depois, no mesmo mês — caso raríssimo, ajuste manual.
  const { min: refMonthMin, max: refMonthMax } = monthDateRange(ry, rm)
  const prevContractForMonth = getPreviousContract(emp, contract)
  const midMonthChangeDay = contract.startDate > refMonthMin && contract.startDate <= refMonthMax
    ? parseLocalDate(contract.startDate).getDate()
    : null
  const midMonthChange = !isFirstMonth && prevContractForMonth && midMonthChangeDay !== null
    ? {
        date: contract.startDate,
        prevSalary: prevContractForMonth.salary || 0,
        newSalary: contract.salary || 0,
        oldDays: midMonthChangeDay - 1,
        newDays: 31 - midMonthChangeDay,
      }
    : null

  const salBase = midMonthChange
    ? r2((midMonthChange.prevSalary * midMonthChange.oldDays + midMonthChange.newSalary * midMonthChange.newDays) / 30)
    : contract.salary || 0

  // Valor do dia de trabalho, pela jornada (dias da semana) do contrato — usado para
  // descontar faltas de mensalistas. Diaristas já são pagos por diária lançada, então
  // não há "falta" a descontar do salário-base (fica 0).
  const workDaysInMonth = contract.contract === 'mensalista'
    ? days.filter((d) => (contract.workDays || []).includes(d.dow) && !h[d.iso]).length
    : 0
  const dailyRate = workDaysInMonth > 0 ? r2(salBase / workDaysInMonth) : 0

  // Divisor fixo de 30 dias corridos — usado para férias/abono/licenças (Art. 130/143 CLT),
  // igual ao resto do CLT (13º, aviso prévio, pro-rata do 1º mês). Diferente de `dailyRate`
  // (dias úteis contratados), que só serve para descontar faltas: um contrato com poucos dias
  // de trabalho por semana (ex.: folguista) infla `dailyRate` e distorceria férias/abono se
  // fosse reaproveitado aqui.
  const dailyRate30 = contract.contract === 'mensalista' ? r2(salBase / 30) : 0

  const recs: RecurringOccurrence[] = []
  const holWarns: { iso: string; hn: string; desc: string; val: number }[] = []

  // Resolve o contrato dia a dia (não o único `contract` do mês inteiro) para que uma diária
  // recorrente só conte pelos dias em que o contrato que a cadastrou já estava (ou ainda estava)
  // vigente — necessário quando o contrato muda no meio do mês. Sem transição no mês, resolve
  // sempre pro mesmo `contract` (granularidade de dia bate com a de mês nesse caso), então isso
  // não muda nada no caso comum.
  for (const d of days) {
    if (leaveDateType[d.iso]) continue
    const dayContract = getContractForDate(emp, d.iso)
    for (const rec of dayContract.recurring || []) {
      if (rec.dow !== d.dow) continue
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

  // Dias de cada tipo de afastamento dentro do mês de referência (não do período todo,
  // que pode se estender por vários meses — ex.: licença-maternidade de 120 dias).
  let feriasDiasNoMes = 0
  let licencaMedicaDiasNoMes = 0
  let licencaMaternidadeDiasNoMes = 0
  for (const d of days) {
    const t = leaveDateType[d.iso]
    if (t === 'ferias') feriasDiasNoMes++
    else if (t === 'licenca_medica') licencaMedicaDiasNoMes++
    else if (t === 'licenca_maternidade') licencaMaternidadeDiasNoMes++
  }
  // Adicional de 1/3 constitucional (férias) — remuneração habitual, sujeita a FGTS/INSS.
  const feriasAdicional = r2((dailyRate30 * feriasDiasNoMes) / 3)

  // Abono pecuniário (dias de férias vendidos, Art. 143 CLT) — não são dias de afastamento
  // (a funcionária segue trabalhando normalmente), por isso não entram em `leaveDateType`
  // nem descontam VT/diárias. Atribuído ao mês de início do período de férias correspondente.
  // Verba indenizatória: isenta de INSS/IRRF/FGTS/INSS Patronal.
  let feriasDiasVendidos = 0
  for (const lp of leavePeriods) {
    if (lp.type !== 'ferias' || !lp.soldDays || !lp.startDate) continue
    const sd = parseLocalDate(lp.startDate)
    if (sd.getFullYear() === ry && sd.getMonth() === rm) feriasDiasVendidos += lp.soldDays
  }
  const feriasAbono = r2(dailyRate30 * feriasDiasVendidos * (4 / 3))
  // Licença médica: INSS paga desde o 1º dia, contrato suspenso — desconta do que o
  // empregador paga neste mês.
  const licencaMedicaDeducao = r2(dailyRate30 * licencaMedicaDiasNoMes)
  // Licença maternidade: INSS paga os 120 dias, mas o empregador não paga o salário desse
  // período — também desconta do valor pago ao empregado (FGTS/encargos continuam à parte).
  const licencaMaternidadeDeducao = r2(dailyRate30 * licencaMaternidadeDiasNoMes)
  // Valor efetivamente pago pelo empregador neste mês, já refletindo férias/licenças.
  const grossForPay = gross - licencaMedicaDeducao - licencaMaternidadeDeducao + feriasAdicional

  const sortedAdjustments = [...adjustments].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  let deds = 0
  let bons = 0
  for (const a of adjustments) {
    if (DEDUCTION_TYPES.includes(a.type)) deds += a.value
    else if (a.type === 'bonus') bons += a.value
  }
  const inssAmt = contract.inss === 'yes' ? inssCalc(grossForPay) : 0
  const netSal = grossForPay + bons - deds - inssAmt

  const vtY = rm === 11 ? ry + 1 : ry
  const vtM = rm === 11 ? 0 : rm + 1
  const vtDays = mdays(vtY, vtM)
  const vtSet: Record<string, 1> = {}
  for (const d of vtDays) {
    if ((contract.workDays || []).includes(d.dow) && !h[d.iso] && !leaveDateType[d.iso]) vtSet[d.iso] = 1
  }
  for (const rec of contract.recurring || []) {
    for (const d of vtDays.filter((d) => d.dow === rec.dow && !h[d.iso] && !leaveDateType[d.iso])) vtSet[d.iso] = 1
  }
  const vtWdAuto = Object.keys(vtSet).length
  const vtWd = vtManualDays !== null ? vtManualDays : vtWdAuto
  const vtGross = vtWd * (contract.vtDaily || 0)
  const vtDisc = contract.vtDiscount === 'none' ? 0 : Math.min(salBase * 0.06, vtGross)
  const vtNet = Math.max(0, vtGross - vtDisc)

  const pyY = rm === 11 ? ry + 1 : ry
  const pyM = rm === 11 ? 0 : rm + 1

  let proRataDias = 0
  let proRataSal = netSal
  let proRataActive = false
  let proRataSalBase = 0

  if (isFirstMonth && admissao) {
    // CLT Art.64: base 30 dias fixo; dias = 31 - diaAdmissao
    // Limitação conhecida: não combina pro-rata do 1º mês com férias/licença no mesmo mês
    // (proRataSal não reflete feriasAdicional/licencaXDeducao) — caso raro, ajuste manual.
    proRataDias = 31 - admissao.getDate()
    const fator = proRataDias / 30
    proRataSalBase = Math.round(salBase * fator * 100) / 100
    proRataSal = Math.round((proRataSalBase + recTot + avTot + bons - deds - inssAmt) * 100) / 100
    // Ativo por padrão; só desativa se explicitamente marcado como integral.
    proRataActive = input.proRataOverride !== false
  }

  const finalNetSal = proRataActive ? proRataSal : netSal
  // Abono de férias entra à parte no total — verba indenizatória, não é "salário".
  const finalTotal = r2((proRataActive ? proRataSal : netSal) + vtNet + feriasAbono)

  // Encargos patronais e provisões — Simples Doméstico (LC 150/2015, art. 34):
  // FGTS mensal 8% + FGTS indenizatório 3,2% (substitui a multa rescisória de 40%) +
  // INSS Patronal (CPP) 8% + Seguro contra Acidente de Trabalho 0,8%.
  // Base exclui a dedução de licença médica (contrato suspenso, FGTS não devido — LC 150/2015)
  // mas NÃO exclui a de licença-maternidade (FGTS continua normalmente) e inclui o adicional
  // de férias (1/3 constitucional é remuneração habitual, sujeito a FGTS/INSS — Súmula 200 TST).
  const baseEnc = gross - licencaMedicaDeducao + feriasAdicional
  const fgts = r2(baseEnc * 0.08)
  const fgtsIndenizatorio = r2(baseEnc * 0.032)
  const inssPatronal = r2(baseEnc * 0.08)
  const sat = r2(baseEnc * 0.008)
  const prov13 = r2(baseEnc / 12)
  const provFerias = r2((baseEnc / 12) * (4 / 3))
  const custoTotal = r2(finalTotal + fgts + fgtsIndenizatorio + inssPatronal + sat + prov13 + provFerias)

  const irrfBase = Math.max(0, grossForPay - inssAmt)
  const irrf = irrfCalc(irrfBase)

  return {
    emp, contract, role: contract.role, vtDaily: contract.vtDaily || 0, dailyRate, ry, rm, key, payment, salBase, midMonthChange, recs, recTot,
    avs, avTot, avPaid, holWarns, gross, adjs: sortedAdjustments,
    feriasDiasNoMes, licencaMedicaDiasNoMes, licencaMaternidadeDiasNoMes,
    feriasAdicional, licencaMedicaDeducao, licencaMaternidadeDeducao, feriasDiasVendidos, feriasAbono,
    deds, bons, inssAmt, netSal, vtY, vtM, vtWd, vtWdAuto, vtManualDays, vtGross, vtDisc, vtNet,
    pay1: bday1(pyY, pyM, regionalHolidays), pay5: bday5(pyY, pyM, regionalHolidays), pyY, pyM,
    total: finalTotal, isFirstMonth, proRataDias, proRataSal, proRataSalBase, proRataActive, finalNetSal,
    fgts, fgtsIndenizatorio, inssPatronal, sat, prov13, provFerias, custoTotal, irrf,
  }
}
