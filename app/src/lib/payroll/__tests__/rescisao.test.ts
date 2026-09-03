import { describe, expect, it } from 'vitest'
import { calcVerbas } from '../rescisao'

/**
 * Testes de CARACTERIZAÇÃO de calcVerbas() — registram o comportamento atual "porta
 * fiel do app original", sem validar se cada regra está correta perante a legislação
 * vigente. Não corrigir estes testes silenciosamente: qualquer ajuste de regra deve
 * vir acompanhado de revisão jurídica/contábil explícita (fora do escopo da Fase 1).
 */
describe('calcVerbas — demissão sem justa causa, aviso indenizado', () => {
  const r = calcVerbas(3000, 'semjusta', '2025-01-01', '2026-08-15', 5000, 'indenizado')

  it('tempo de casa: anos/meses/dias restantes', () => {
    expect(r.anos).toBe(1)
    expect(r.meses).toBe(7)
    expect(r.diasR).toBe(21)
  })

  it('aviso prévio proporcional (30 + 3/ano, teto 90)', () => {
    expect(r.diasAviso).toBe(33)
    expect(r.avisoDesc).toBe('Indenizado (33 dias)')
  })

  it('saldo de salário = salário/30 × dia do desligamento no mês', () => {
    const saldo = r.itens.find((i) => i.l.startsWith('Saldo de salário'))
    expect(saldo?.v).toBeCloseTo(1500, 2) // 100/dia × 15 dias
  })

  it('13º proporcional, férias proporcionais+1/3, férias vencidas+1/3 e multa FGTS 40% entram no bruto', () => {
    expect(r.itens.find((i) => i.l.includes('13º proporcional'))?.v).toBeCloseTo(2000, 2)
    expect(r.itens.find((i) => i.l.includes('Férias proporcionais'))?.v).toBeCloseTo(2666.67, 2)
    expect(r.itens.find((i) => i.l === 'Férias vencidas + 1/3')?.v).toBeCloseTo(4000, 2)
    expect(r.itens.find((i) => i.l.includes('Multa FGTS 40%'))?.v).toBeCloseTo(2000, 2)
  })

  it('aviso prévio indenizado entra como valor positivo', () => {
    const aviso = r.itens.find((i) => i.l.startsWith('Aviso prévio indenizado'))
    expect(aviso?.v).toBeCloseTo(3300, 2)
    expect(aviso?.pos).toBe(true)
  })

  it('INSS incide sobre a soma das verbas salariais, com teto da tabela (não corrigido para 2025/2026 — TODO-LEGAL, ver inss.test.ts)', () => {
    const inss = r.itens.find((i) => i.l === 'INSS sobre verbas salariais')
    expect(inss?.pos).toBe(false)
    expect(inss?.v).toBeCloseTo(908.85, 2) // teto da tabela — base é bem acima do topo
  })

  it('total líquido = bruto - descontos', () => {
    expect(r.bruto).toBeCloseTo(15466.67, 2)
    expect(r.descs).toBeCloseTo(908.85, 2)
    expect(r.total).toBeCloseTo(14557.82, 2)
  })
})

describe('calcVerbas — pedido de demissão (aviso trabalhado)', () => {
  it('sem aviso indenizado e sem multa FGTS', () => {
    const r = calcVerbas(3000, 'pedido', '2025-01-01', '2026-08-15', 5000, 'trabalhado')
    expect(r.itens.find((i) => i.l.startsWith('Aviso prévio indenizado'))).toBeUndefined()
    expect(r.itens.find((i) => i.l.includes('Multa FGTS'))).toBeUndefined()
    expect(r.avisoDesc).toBe('Trabalhado (33 dias)')
  })

  it('ainda assim recebe saldo, 13º e férias proporcionais (motivo diferente de comjusta)', () => {
    const r = calcVerbas(3000, 'pedido', '2025-01-01', '2026-08-15', 5000, 'trabalhado')
    expect(r.itens.find((i) => i.l.startsWith('Saldo de salário'))).toBeDefined()
    expect(r.itens.find((i) => i.l.includes('13º proporcional'))).toBeDefined()
  })
})

describe('calcVerbas — demissão por justa causa', () => {
  it('TODO-LEGAL: só paga saldo de salário — 13º, férias, aviso, multa e INSS ficam de fora inteiramente', () => {
    // Caracteriza o comportamento atual (`if (motivo !== 'comjusta')` pula todo o resto).
    // Vale confirmar com um contador se férias VENCIDAS (já adquiridas antes da justa causa)
    // deveriam continuar sendo devidas mesmo nesse motivo — há controvérsia doutrinária/
    // jurisprudencial sobre isso e o código atual não distingue.
    const r = calcVerbas(3000, 'comjusta', '2025-01-01', '2026-08-15', 5000, 'trabalhado')
    expect(r.itens).toHaveLength(1)
    expect(r.itens[0].l).toMatch(/^Saldo de salário/)
    expect(r.total).toBeCloseTo(r.itens[0].v, 2)
  })
})

describe('calcVerbas — acordo mútuo (Art. 484-A CLT)', () => {
  it('aviso prévio pela metade e multa FGTS de 20%', () => {
    const r = calcVerbas(3000, 'acordo', '2025-01-01', '2026-08-15', 5000, 'trabalhado')
    // diasAviso = 33 → metade = 16.5, salDia = 100 → avisoVal = 1650
    expect(r.itens.find((i) => i.l.startsWith('Aviso prévio indenizado'))?.v).toBeCloseTo(1650, 2)
    expect(r.itens.find((i) => i.l.includes('Multa FGTS 20%'))?.v).toBeCloseTo(1000, 2) // 5000 × 20%
  })
})

describe('calcVerbas — funcionária com menos de 1 ano (sem férias vencidas)', () => {
  it('não gera "Férias vencidas + 1/3" quando anos < 1', () => {
    const r = calcVerbas(2000, 'semjusta', '2026-01-01', '2026-08-15', 1000, 'indenizado')
    expect(r.anos).toBe(0)
    expect(r.itens.find((i) => i.l === 'Férias vencidas + 1/3')).toBeUndefined()
  })
})

describe('calcVerbas — falecimento (TODO-LEGAL: motivo não tem tratamento específico)', () => {
  it('cai no fluxo genérico (motivo !== comjusta), sem aviso prévio nem multa FGTS calculados', () => {
    // TODO-LEGAL: `falecimento` não é tratado em nenhum `if` de aviso/multa em rescisao.ts —
    // recebe saldo/13º/férias proporcionais e vencidas normalmente, mas nenhuma verba
    // específica de falecimento (ex.: seguro obrigatório) é contemplada. Caracterizando
    // o que o código faz hoje, não validando se está completo.
    const r = calcVerbas(3000, 'falecimento', '2025-01-01', '2026-08-15', 5000, 'trabalhado')
    expect(r.itens.find((i) => i.l.startsWith('Aviso prévio indenizado'))).toBeUndefined()
    expect(r.itens.find((i) => i.l.includes('Multa FGTS'))).toBeUndefined()
    expect(r.itens.find((i) => i.l.includes('13º proporcional'))).toBeDefined()
  })
})
