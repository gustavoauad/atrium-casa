import { describe, expect, it } from 'vitest'
import { inssCalc, irrfCalc } from '../inss'

/**
 * Testes de CARACTERIZAÇÃO: registram o comportamento atual de inssCalc/irrfCalc,
 * tabelas 2024 hard-coded em inss.ts. Não validam se os valores estão corretos para
 * a competência vigente — isso é responsabilidade de uma fase futura de atualização
 * das tabelas legais (fora do escopo desta Fase 1).
 *
 * TODO-LEGAL: as tabelas de INSS/IRRF doméstico aqui são de 2024. Confirmar reajuste
 * anual (Portaria Interministerial) antes de usar os valores em produção para
 * competências de 2025/2026 em diante.
 */
describe('inssCalc — caracterização', () => {
  it('primeira faixa (até R$ 1.412,00): 7,5%', () => {
    expect(inssCalc(1000)).toBeCloseTo(75, 5)
  })

  it('no limite exato da 1ª faixa, cobra só a alíquota da 1ª faixa', () => {
    // TODO-LEGAL: comportamento no limite exato da faixa (v <= lim) — confirmar se a
    // tabela oficial trata o valor-limite como pertencente à faixa de baixo ou de cima.
    expect(inssCalc(1412)).toBeCloseTo(1412 * 0.075, 5)
  })

  it('logo acima do limite da 1ª faixa, já soma a 2ª faixa progressivamente', () => {
    const v = 1412.01
    const expected = 1412 * 0.075 + (v - 1412) * 0.09
    expect(inssCalc(v)).toBeCloseTo(expected, 5)
  })

  it('valor dentro da 3ª faixa soma as 3 faixas progressivamente', () => {
    const v = 3000
    const expected = 1412 * 0.075 + (2666.68 - 1412) * 0.09 + (v - 2666.68) * 0.12
    expect(inssCalc(v)).toBeCloseTo(expected, 5)
  })

  it('valor acima do teto da tabela é limitado ao teto de desconto (R$ 908,85)', () => {
    expect(inssCalc(50000)).toBeCloseTo(908.85, 5)
  })

  it('valor exatamente no topo da última faixa não excede o teto', () => {
    expect(inssCalc(7786.02)).toBeLessThanOrEqual(908.85)
  })

  it('valor zero ou negativo — caracteriza o que a função faz hoje (não há guarda explícita)', () => {
    expect(inssCalc(0)).toBe(0)
    // TODO-LEGAL: valor negativo não é um caso de negócio real (salário não é negativo),
    // mas caracterizamos aqui para saber que a função não lança erro e não trava o cálculo
    // com um valor de INSS negativo/absurdo silenciosamente.
    expect(inssCalc(-100)).toBeLessThanOrEqual(0)
  })
})

describe('irrfCalc — caracterização', () => {
  it('base até R$ 2.259,20: isento', () => {
    expect(irrfCalc(2259.2)).toBe(0)
    expect(irrfCalc(2000)).toBe(0)
  })

  it('primeira faixa tributável (7,5%)', () => {
    const base = 2500
    expect(irrfCalc(base)).toBeCloseTo(base * 0.075 - 169.44, 2)
  })

  it('segunda faixa (15%)', () => {
    const base = 3000
    expect(irrfCalc(base)).toBeCloseTo(base * 0.15 - 381.44, 2)
  })

  it('terceira faixa (22,5%)', () => {
    const base = 3800
    expect(irrfCalc(base)).toBeCloseTo(base * 0.225 - 662.77, 2)
  })

  it('quarta faixa (27,5%)', () => {
    const base = 5000
    expect(irrfCalc(base)).toBeCloseTo(base * 0.275 - 896.0, 2)
  })

  it('exatamente no limite de uma faixa cai na faixa de baixo (comparação é ">", estrita)', () => {
    // TODO-LEGAL: confirmar se a Receita Federal trata o valor-limite exato como isento
    // ou como início da próxima faixa — aqui, `base > 2259.2` é estrito, então o valor
    // exato do limite ainda cai na faixa de baixo.
    expect(irrfCalc(2259.2)).toBe(0)
    expect(irrfCalc(2826.65)).toBeCloseTo(2826.65 * 0.075 - 169.44, 2)
  })

  it('base zero ou negativa: isenta (cai no caso padrão, sem erro)', () => {
    expect(irrfCalc(0)).toBe(0)
    expect(irrfCalc(-500)).toBe(0)
  })
})
