import type { RegionalHoliday } from './holidays'
import { bday5 } from './holidays'

export function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Mês corrente do calendário e se hoje já passou do seu 5º dia útil (prazo de pagamento do mês anterior). */
export function calendarState(regional: RegionalHoliday[]) {
  const now = new Date()
  const cy = now.getFullYear()
  const cm = now.getMonth()
  const p5 = bday5(cy, cm, regional)
  const pastDeadline = p5 ? localISO(now) > p5.iso : true
  const py = cm === 0 ? cy - 1 : cy
  const pm = cm === 0 ? 11 : cm - 1
  return { cy, cm, pastDeadline, py, pm }
}

/**
 * Mês de referência ativo por padrão: o mês trabalhado permanece "ativo" até o 5º dia útil
 * do mês seguinte (prazo de pagamento). Depois disso, o mês ativo passa a ser o mês corrente.
 */
export function defaultReferenceMonth(regional: RegionalHoliday[]): { y: number; m: number } {
  const { cy, cm, pastDeadline, py, pm } = calendarState(regional)
  return pastDeadline ? { y: cy, m: cm } : { y: py, m: pm }
}
