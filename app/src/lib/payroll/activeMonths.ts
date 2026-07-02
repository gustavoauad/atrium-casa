import type { Employee } from '../../types/employee'

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
