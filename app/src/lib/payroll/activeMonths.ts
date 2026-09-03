import type { Employee } from '../../types/employee'
import { parseLocalDate } from './format'

export interface MonthRef {
  y: number
  m: number
}

/** Lista de meses (do mais antigo funcionário admitido até o mês atual) para popular seletores. */
export function activeMonthsFor(employees: Employee[] | null): MonthRef[] {
  const now = new Date()
  let start = { y: now.getFullYear(), m: now.getMonth() }
  for (const e of employees || []) {
    if (!e.admissao) continue
    // Regressão corrigida (Fase 1): usava `new Date(e.admissao)`, que interpreta a data
    // como meia-noite UTC — sob fuso negativo (ex.: America/Belem, UTC-3), uma admissão
    // no dia 1 do mês virava dia 31 do mês anterior às 21h locais, deslocando o mês
    // inteiro para trás. parseLocalDate() lê a data como local, igual ao resto do motor
    // de folha (calc.ts, contracts.ts) — ver app/src/lib/payroll/format.ts.
    const d = parseLocalDate(e.admissao)
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
