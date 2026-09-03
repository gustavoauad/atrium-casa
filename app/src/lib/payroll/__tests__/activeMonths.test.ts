import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeMonthsFor } from '../activeMonths'
import type { Employee } from '../../../types/employee'

function employee(admissao: string, overrides: Partial<Employee> = {}): Employee {
  return { id: crypto.randomUUID(), name: 'Funcionária Teste', admissao, extraTypes: [], notes: '', ...overrides }
}

/** `new Date('YYYY-MM-DDTHH:mm:ss')` (sem 'Z'/offset) é interpretada como hora LOCAL
 *  pelo JS — diferente de `new Date('YYYY-MM-DD')` (só data), que é UTC. Usar aqui de
 *  propósito para fixar "agora" sem ambiguidade de fuso nos testes abaixo. */
function setNow(localIso: string) {
  vi.setSystemTime(new Date(localIso))
}

/**
 * Testes de activeMonthsFor() — roda sob TZ=America/Belem (ver vitest.config.ts).
 *
 * CHANGELOG (Fase 1): a função lia a admissão com `new Date(e.admissao)`, que
 * interpreta a data como meia-noite UTC. Sob fuso negativo (America/Belem, UTC-3),
 * uma admissão no dia 1 do mês virava dia 31 do mês anterior às 21h locais, deslocando
 * o mês inteiro para trás — no caso de 1º de janeiro, chegava a cair em dezembro do ano
 * anterior. Corrigido trocando por `parseLocalDate()` (mesmo helper já usado em
 * calc.ts/contracts.ts). Os testes marcados "regressão corrigida" abaixo travam o
 * comportamento CORRETO — não preservam o bug antigo como esperado.
 */
describe('activeMonthsFor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lista vazia de funcionários: só o mês atual', () => {
    setNow('2026-03-15T12:00:00')
    expect(activeMonthsFor([])).toEqual([{ y: 2026, m: 2 }])
  })

  it('null também é aceito (mesmo comportamento de lista vazia)', () => {
    setNow('2026-03-15T12:00:00')
    expect(activeMonthsFor(null)).toEqual([{ y: 2026, m: 2 }])
  })

  it('funcionário sem admissão (string vazia) é ignorado, não quebra nem estende a lista', () => {
    setNow('2026-03-15T12:00:00')
    expect(activeMonthsFor([employee('')])).toEqual([{ y: 2026, m: 2 }])
  })

  it('admissão dentro do mês atual não altera o início da lista', () => {
    setNow('2026-03-15T12:00:00')
    expect(activeMonthsFor([employee('2026-03-10')])).toEqual([{ y: 2026, m: 2 }])
  })

  it('admissão em ano anterior estende a lista até aquele ano/mês', () => {
    setNow('2026-03-01T12:00:00')
    const months = activeMonthsFor([employee('2025-05-10')])
    expect(months[0]).toEqual({ y: 2025, m: 4 }) // maio/2025
    expect(months[months.length - 1]).toEqual({ y: 2026, m: 2 }) // março/2026 (mês atual)
    expect(months).toHaveLength(11) // maio/2025 .. março/2026, inclusive
  })

  it('múltiplos funcionários: o início da lista usa a admissão mais antiga entre todos', () => {
    setNow('2026-06-01T12:00:00')
    const emps = [
      employee('2024-06-15'),
      employee('2023-02-15'), // a mais antiga das três
      employee('2025-01-15'),
    ]
    expect(activeMonthsFor(emps)[0]).toEqual({ y: 2023, m: 1 }) // fevereiro/2023
  })

  it('transição de dezembro para janeiro: sequência sem pular nem duplicar mês', () => {
    setNow('2026-01-20T12:00:00')
    const months = activeMonthsFor([employee('2025-11-15')])
    expect(months).toEqual([
      { y: 2025, m: 10 }, // novembro/2025
      { y: 2025, m: 11 }, // dezembro/2025
      { y: 2026, m: 0 }, // janeiro/2026
    ])
  })

  it('regressão corrigida: admissão no dia 1 do mês, sob America/Belem, fica no mês certo (não recua um mês)', () => {
    setNow('2026-03-10T12:00:00')
    const months = activeMonthsFor([employee('2026-02-01')])
    expect(months[0]).toEqual({ y: 2026, m: 1 }) // fevereiro/2026 — correto
    expect(months[0]).not.toEqual({ y: 2026, m: 0 }) // janeiro/2026 seria o bug antigo
  })

  it('regressão corrigida: admissão em 1º de janeiro de 2026 resulta em janeiro/2026, nunca dezembro/2025', () => {
    setNow('2026-01-01T12:00:00')
    const months = activeMonthsFor([employee('2026-01-01')])
    expect(months[0]).toEqual({ y: 2026, m: 0 }) // janeiro/2026 — correto
    expect(months[0]).not.toEqual({ y: 2025, m: 11 }) // dezembro/2025 seria o bug antigo (cruzava o ano)
    expect(months.some((mo) => mo.y === 2025 && mo.m === 11)).toBe(false) // dezembro/2025 não deve aparecer na lista
  })

  it('regressão corrigida: resultado é idêntico em UTC e em America/Belem (parseLocalDate não depende do fuso do processo)', () => {
    const originalTz = process.env.TZ
    try {
      setNow('2026-01-01T12:00:00')
      const emps = [employee('2026-01-01'), employee('2026-02-01'), employee('2025-11-15')]

      process.env.TZ = 'America/Belem'
      const belem = activeMonthsFor(emps)

      process.env.TZ = 'UTC'
      const utc = activeMonthsFor(emps)

      expect(utc).toEqual(belem)
      expect(belem[0]).toEqual({ y: 2025, m: 10 }) // novembro/2025 — a mais antiga das três, em ambos os fusos
    } finally {
      process.env.TZ = originalTz
    }
  })

  it('admissão em dia != 1 sempre esteve correta (não cruza a virada do mês) — mantido como contraste', () => {
    setNow('2026-03-10T12:00:00')
    const months = activeMonthsFor([employee('2026-02-15')])
    expect(months[0]).toEqual({ y: 2026, m: 1 }) // fevereiro — correto
  })
})
