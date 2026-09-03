import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseLocalDate, tod } from '../format'
import { dim, jd, mdays } from '../holidays'
import { calendarState, defaultReferenceMonth, localISO } from '../referenceMonth'

/**
 * Testes de CARACTERIZAÇÃO rodando sob TZ=America/Belem (UTC-3, sem horário de
 * verão — ver vitest.config.ts). Objetivo: travar que as funções de data do motor
 * de folha (parseLocalDate, mdays, localISO) são seguras em qualquer fuso, e expor
 * qualquer função que NÃO seja (comparando com toISOString(), que é baseado em UTC).
 */
describe('fuso horário — America/Belem', () => {
  it('o ambiente de teste está de fato rodando em America/Belem (UTC-3)', () => {
    expect(process.env.TZ).toBe('America/Belem')
    expect(new Date(2026, 7, 15, 12, 0, 0).getTimezoneOffset()).toBe(180)
  })

  it('parseLocalDate não sofre o deslocamento de -1 dia que new Date(iso) teria em UTC-3', () => {
    const d = parseLocalDate('2026-08-31')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(31)
    // Contraste documentado: new Date('YYYY-MM-DD') é meia-noite UTC — em UTC-3 isso
    // exibe o dia 30, não 31. parseLocalDate existe justamente para evitar isso.
    expect(new Date('2026-08-31').getDate()).toBe(30)
  })

  it('mdays/jd calculam o dia da semana correto para o fuso local (sem depender de UTC)', () => {
    const days = mdays(2026, 7) // agosto/2026
    const day31 = days.find((d) => d.d === 31)
    expect(day31?.iso).toBe('2026-08-31')
    // 31/08/2026 é uma segunda-feira → dow 0 (Seg) no formato do app.
    expect(day31?.dow).toBe(jd(new Date(2026, 7, 31).getDay()))
  })

  it('localISO(new Date()) usa data local (getFullYear/getMonth/getDate), não UTC', () => {
    vi.useFakeTimers()
    try {
      // 15/08/2026 23:30 em America/Belem (UTC-3) = 16/08/2026 02:30 UTC.
      vi.setSystemTime(new Date(2026, 7, 15, 23, 30, 0))
      expect(localISO(new Date())).toBe('2026-08-15')
    } finally {
      vi.useRealTimers()
    }
  })

  describe('tod() — BUG-TZ: usa toISOString() (UTC), diverge da data local perto da virada do dia', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('durante o dia (fuso e UTC concordam), tod() bate com a data local', () => {
      // 15/08/2026 10:00 America/Belem = 13:00 UTC — mesmo dia dos dois lados.
      vi.setSystemTime(new Date(2026, 7, 15, 10, 0, 0))
      expect(tod()).toBe('2026-08-15')
      expect(localISO(new Date())).toBe('2026-08-15')
    })

    it('às 23:30 locais, tod() retorna o dia seguinte (UTC já virou) — diverge de localISO', () => {
      // TODO-LEGAL: não é uma questão trabalhista, é um bug de fuso horário. tod() é
      // usado como "hoje" em vários lugares do app (datas padrão de formulários,
      // filtros "hoje", data de pagamento sugerida). Entre ~21h e 23h59 (horário de
      // Brasília/Belém), tod() já mostra o dia seguinte, enquanto localISO(new Date())
      // (usado em referenceMonth.ts) mostra o dia certo. Registrando o comportamento
      // atual tal como é — não corrigido nesta fase (Fase 1 é só caracterização).
      vi.setSystemTime(new Date(2026, 7, 15, 23, 30, 0))
      expect(tod()).toBe('2026-08-16') // errado: ainda é 15/08 em America/Belem
      expect(localISO(new Date())).toBe('2026-08-15') // correto
      expect(tod()).not.toBe(localISO(new Date()))
    })
  })

  describe('calendarState / defaultReferenceMonth', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('mês de referência permanece o mês anterior antes do 5º dia útil', () => {
      vi.useFakeTimers()
      // 03/09/2026 (antes do 5º dia útil de setembro) — mês de referência ainda é agosto.
      vi.setSystemTime(new Date(2026, 8, 3, 12, 0, 0))
      const ref = defaultReferenceMonth([])
      expect(ref).toEqual({ y: 2026, m: 7 })
    })

    it('mês de referência vira o mês corrente depois do 5º dia útil', () => {
      vi.useFakeTimers()
      // 10/09/2026 — já passou do 5º dia útil de setembro/2026.
      vi.setSystemTime(new Date(2026, 8, 10, 12, 0, 0))
      const ref = defaultReferenceMonth([])
      expect(ref).toEqual({ y: 2026, m: 8 })
      const state = calendarState([])
      expect(state.pastDeadline).toBe(true)
    })

    it('em janeiro, o mês anterior (py/pm) vira dezembro do ano anterior', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 0, 3, 12, 0, 0))
      const state = calendarState([])
      expect(state.py).toBe(2025)
      expect(state.pm).toBe(11)
    })
  })

  it('dim() calcula corretamente os últimos dias de fevereiro em ano bissexto vs. não bissexto', () => {
    expect(dim(2024, 1)).toBe(29) // 2024 é bissexto
    expect(dim(2026, 1)).toBe(28) // 2026 não é bissexto
  })
})
