import { describe, expect, it } from 'vitest'
import { allHolidays, bday1, bday5, dim, jd, mdays } from '../holidays'

describe('dim — dias no mês (28/29/30/31)', () => {
  it('fevereiro em ano não bissexto (28 dias)', () => {
    expect(dim(2026, 1)).toBe(28)
  })
  it('fevereiro em ano bissexto (29 dias)', () => {
    expect(dim(2024, 1)).toBe(29)
  })
  it('abril (30 dias)', () => {
    expect(dim(2026, 3)).toBe(30)
  })
  it('agosto (31 dias)', () => {
    expect(dim(2026, 7)).toBe(31)
  })
})

describe('mdays — gera exatamente N dias, cada um com dow/iso corretos', () => {
  it('mês de 28 dias', () => {
    const days = mdays(2026, 1)
    expect(days).toHaveLength(28)
    expect(days[0].iso).toBe('2026-02-01')
    expect(days[27].iso).toBe('2026-02-28')
  })
  it('mês de 29 dias (bissexto)', () => {
    const days = mdays(2024, 1)
    expect(days).toHaveLength(29)
    expect(days[28].iso).toBe('2024-02-29')
  })
  it('mês de 30 dias', () => {
    const days = mdays(2026, 3)
    expect(days).toHaveLength(30)
    expect(days[29].iso).toBe('2026-04-30')
  })
  it('mês de 31 dias', () => {
    const days = mdays(2026, 7)
    expect(days).toHaveLength(31)
    expect(days[30].iso).toBe('2026-08-31')
  })
  it('todo dow está no intervalo 0..6 (Seg..Dom)', () => {
    for (const d of mdays(2026, 7)) {
      expect(d.dow).toBeGreaterThanOrEqual(0)
      expect(d.dow).toBeLessThanOrEqual(6)
    }
  })
})

describe('jd — conversão getDay() JS (0=Dom) → formato do app (0=Seg..6=Dom)', () => {
  it('domingo (JS 0) vira 6', () => {
    expect(jd(0)).toBe(6)
  })
  it('segunda (JS 1) vira 0', () => {
    expect(jd(1)).toBe(0)
  })
  it('sábado (JS 6) vira 5', () => {
    expect(jd(6)).toBe(5)
  })
})

describe('allHolidays — combina feriados nacionais fixos com os regionais cadastrados', () => {
  it('feriado nacional presente mesmo sem regionais', () => {
    const h = allHolidays([])
    expect(h['2026-01-01']).toBe('Confraternização Universal')
  })
  it('feriado regional é adicionado ao mapa', () => {
    const h = allHolidays([{ date: '2026-08-15', name: 'Aniversário da cidade' }])
    expect(h['2026-08-15']).toBe('Aniversário da cidade')
  })
  it('feriado regional na mesma data de um nacional sobrescreve o nome do nacional', () => {
    // Caracteriza o comportamento atual: regional é espalhado por último em allHolidays(),
    // então uma data coincidente troca o nome exibido. Não é validado se isso é desejável.
    const h = allHolidays([{ date: '2026-01-01', name: 'Feriado Regional Duplicado' }])
    expect(h['2026-01-01']).toBe('Feriado Regional Duplicado')
  })
})

describe('bday1 / bday5 — 1º e 5º dia útil do mês (usados no prazo de pagamento)', () => {
  it('bday1 pula fins de semana e feriados', () => {
    // Agosto/2026: dia 1 é sábado, dia 2 domingo → 1º dia útil é 03/08 (segunda).
    const b1 = bday1(2026, 7, [])
    expect(b1?.iso).toBe('2026-08-03')
  })

  it('bday5 conta 5 dias úteis a partir do início do mês', () => {
    const b5 = bday5(2026, 7, [])
    expect(b5).not.toBeNull()
    expect(b5?.d).toBeGreaterThan(0)
  })

  it('feriado regional em dia útil empurra bday1 para o próximo dia útil', () => {
    const semRegional = bday1(2026, 7, [])
    const comRegional = bday1(2026, 7, [{ date: '2026-08-03', name: 'Feriado Local' }])
    expect(comRegional?.iso).not.toBe(semRegional?.iso)
    expect(comRegional?.iso).toBe('2026-08-04')
  })

  it('mês sem nenhum dia útil (caracterização de caso extremo) retorna null', () => {
    // Não existe mês real sem nenhum dia útil, mas caracterizamos o retorno da função
    // quando todos os dias possíveis são "feriados" — usada defensivamente no app
    // (bday1/bday5 podem retornar null e o chamador precisa tratar isso).
    const todosOsDias = mdays(2026, 7).map((d) => ({ date: d.iso, name: 'Feriado Forçado (teste)' }))
    expect(bday1(2026, 7, todosOsDias)).toBeNull()
    expect(bday5(2026, 7, todosOsDias)).toBeNull()
  })
})
