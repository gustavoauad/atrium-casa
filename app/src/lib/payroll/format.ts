export function r2(n: number): number {
  return Math.round((+n || 0) * 100) / 100
}

export function fm(v: number): string {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fd(iso: string): string {
  if (!iso) return ''
  const p = iso.split('-')
  return `${p[2]}/${p[1]}/${p[0]}`
}

export function tod(): string {
  return new Date().toISOString().slice(0, 10)
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7)
}

/**
 * Parseia uma data ISO (YYYY-MM-DD) como data local, não UTC.
 * `new Date('YYYY-MM-DD')` é interpretado como meia-noite UTC pelo spec do JS,
 * o que desloca o dia em -1 em fusos negativos (ex: Brasil, UTC-3).
 */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
