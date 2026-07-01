export interface RegionalHoliday {
  date: string
  name: string
}

/** Feriados nacionais fixos e móveis, 2024–2028 (mesma tabela do app original). */
export const NH: Record<string, string> = {
  '2024-01-01': 'Confraternização Universal', '2024-02-12': 'Carnaval (2ª)', '2024-02-13': 'Carnaval (3ª)',
  '2024-03-29': 'Sexta-feira Santa', '2024-03-31': 'Páscoa', '2024-04-21': 'Tiradentes',
  '2024-05-01': 'Dia do Trabalho', '2024-05-30': 'Corpus Christi', '2024-09-07': 'Independência',
  '2024-10-12': 'N.Sra. Aparecida', '2024-11-02': 'Finados', '2024-11-15': 'Proclamação da República',
  '2024-11-20': 'Consciência Negra', '2024-12-25': 'Natal',
  '2025-01-01': 'Confraternização Universal', '2025-03-03': 'Carnaval (2ª)', '2025-03-04': 'Carnaval (3ª)',
  '2025-04-18': 'Sexta-feira Santa', '2025-04-20': 'Páscoa', '2025-04-21': 'Tiradentes',
  '2025-05-01': 'Dia do Trabalho', '2025-06-19': 'Corpus Christi', '2025-09-07': 'Independência',
  '2025-10-12': 'N.Sra. Aparecida', '2025-11-02': 'Finados', '2025-11-15': 'Proclamação da República',
  '2025-11-20': 'Consciência Negra', '2025-12-25': 'Natal',
  '2026-01-01': 'Confraternização Universal', '2026-02-16': 'Carnaval (2ª)', '2026-02-17': 'Carnaval (3ª)',
  '2026-04-03': 'Sexta-feira Santa', '2026-04-05': 'Páscoa', '2026-04-21': 'Tiradentes',
  '2026-05-01': 'Dia do Trabalho', '2026-06-04': 'Corpus Christi', '2026-09-07': 'Independência',
  '2026-10-12': 'N.Sra. Aparecida', '2026-11-02': 'Finados', '2026-11-15': 'Proclamação da República',
  '2026-11-20': 'Consciência Negra', '2026-12-25': 'Natal',
  '2027-01-01': 'Confraternização Universal', '2027-02-08': 'Carnaval (2ª)', '2027-02-09': 'Carnaval (3ª)',
  '2027-03-26': 'Sexta-feira Santa', '2027-03-28': 'Páscoa', '2027-04-21': 'Tiradentes',
  '2027-05-01': 'Dia do Trabalho', '2027-05-27': 'Corpus Christi', '2027-09-07': 'Independência',
  '2027-10-12': 'N.Sra. Aparecida', '2027-11-02': 'Finados', '2027-11-15': 'Proclamação da República',
  '2027-11-20': 'Consciência Negra', '2027-12-25': 'Natal',
  '2028-01-01': 'Confraternização Universal', '2028-02-28': 'Carnaval (2ª)', '2028-02-29': 'Carnaval (3ª)',
  '2028-04-14': 'Sexta-feira Santa', '2028-04-16': 'Páscoa', '2028-04-21': 'Tiradentes',
  '2028-05-01': 'Dia do Trabalho', '2028-06-15': 'Corpus Christi', '2028-09-07': 'Independência',
  '2028-10-12': 'N.Sra. Aparecida', '2028-11-02': 'Finados', '2028-11-15': 'Proclamação da República',
  '2028-11-20': 'Consciência Negra', '2028-12-25': 'Natal',
}

/** Combina feriados nacionais com feriados regionais cadastrados pela casa. */
export function allHolidays(regional: RegionalHoliday[]): Record<string, string> {
  const o = { ...NH }
  for (const h of regional || []) o[h.date] = h.name
  return o
}

export function holName(iso: string, regional: RegionalHoliday[]): string | null {
  return allHolidays(regional)[iso] || null
}

/** Converte getDay() do JS (0=Dom) para o formato do app (0=Seg...6=Dom). */
export function jd(d: number): number {
  return d === 0 ? 6 : d - 1
}

export function dim(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate()
}

export interface MonthDay {
  d: number
  dow: number
  iso: string
}

export function mdays(y: number, m: number): MonthDay[] {
  const n = dim(y, m)
  const r: MonthDay[] = []
  for (let d = 1; d <= n; d++) {
    const dow = jd(new Date(y, m, d).getDay())
    r.push({ d, dow, iso: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
  }
  return r
}

export function bday1(y: number, m: number, regional: RegionalHoliday[]): { d: number; iso: string } | null {
  const h = allHolidays(regional)
  for (let d = 1; d <= dim(y, m); d++) {
    const dow = jd(new Date(y, m, d).getDay())
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (dow < 5 && !h[iso]) return { d, iso }
  }
  return null
}

export function bday5(y: number, m: number, regional: RegionalHoliday[]): { d: number; iso: string } | null {
  const h = allHolidays(regional)
  let cnt = 0
  for (let d = 1; d <= dim(y, m); d++) {
    const dow = jd(new Date(y, m, d).getDay())
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (dow < 5 && !h[iso]) {
      cnt++
      if (cnt === 5) return { d, iso }
    }
  }
  return null
}
