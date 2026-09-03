import { describe, expect, it } from 'vitest'
import { calc, paidAmountOf, paymentStatus, remainingBalance, isPartialPayment, type CalcInput } from '../calc'
import type { Contract, Employee, LeavePeriod } from '../../../types/employee'
import { newContract } from '../../../types/employee'
import type { Payment } from '../../../types/payment'

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    ...newContract('2020-01-01'),
    role: 'Babá',
    salary: 1621,
    contract: 'mensalista',
    vtDaily: 9.2,
    vtDiscount: 'none',
    inss: 'no',
    workDays: [1, 3, 5], // Ter, Qui, Sáb
    recurring: [],
    ...overrides,
  }
}

function employee(c: Contract, overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'e1',
    name: 'Ana',
    admissao: '2020-01-01',
    extraTypes: [],
    notes: '',
    contracts: [c],
    leavePeriods: [],
    ...overrides,
  }
}

function baseInput(overrides: Partial<CalcInput> = {}): CalcInput {
  const c = contract()
  return {
    emp: employee(c),
    ry: 2026,
    rm: 7, // agosto/2026
    events: [],
    adjustments: [],
    payment: null,
    leavePeriods: [],
    regionalHolidays: [],
    vtManualDays: null,
    ...overrides,
  }
}

describe('calc — diárias recorrentes (agosto/2026, mês de 31 dias)', () => {
  it('soma uma recorrência de sábado (350) para os 5 sábados do mês', () => {
    const c = contract({ recurring: [{ dow: 5, desc: 'Diária 24h', value: 350, countHolidays: false }] })
    const out = calc(baseInput({ emp: employee(c) }))
    expect(out.recs).toHaveLength(5)
    expect(out.recTot).toBe(1750)
  })

  it('VT conta os dias fixos de trabalho (Ter/Qui/Sáb) do mês seguinte, sem duplicar sábados que também são recorrência', () => {
    const c = contract({ recurring: [{ dow: 5, desc: 'Diária 24h', value: 350, countHolidays: false }] })
    const out = calc(baseInput({ emp: employee(c), rm: 6 })) // referência julho/2026 → VT calculado sobre agosto/2026
    // Agosto/2026: 4 terças + 4 quintas + 5 sábados = 13 dias úteis (sem feriados nacionais em agosto).
    expect(out.vtWdAuto).toBe(13)
    expect(out.vtGross).toBeCloseTo(13 * 9.2, 5)
  })

  it('feriado sem countHolidays vira aviso manual (holWarn), não soma automático', () => {
    // Tiradentes 21/04/2026 é uma terça-feira. holWarns só nasce de `contract.recurring`
    // (workDays sozinho não gera diária nem aviso — só afeta VT/dailyRate).
    const c = contract({ workDays: [], recurring: [{ dow: 1, desc: 'Diária Extra', value: 100, countHolidays: false }] })
    const out = calc(baseInput({ emp: employee(c), rm: 3 })) // abril/2026
    const warn = out.holWarns.find((w) => w.iso === '2026-04-21')
    expect(warn).toBeDefined()
    expect(out.recs.find((r) => r.iso === '2026-04-21')).toBeUndefined()
  })

  it('recorrência com countHolidays=true soma mesmo caindo em feriado', () => {
    const c = contract({ workDays: [], recurring: [{ dow: 1, desc: 'Diária', value: 100, countHolidays: true }] })
    const out = calc(baseInput({ emp: employee(c), rm: 3 })) // abril/2026, terças
    const holRec = out.recs.find((r) => r.iso === '2026-04-21')
    expect(holRec).toBeDefined()
    expect(holRec?.autoHol).toBe(true)
    expect(out.holWarns).toHaveLength(0)
  })
})

describe('calc — INSS empregado', () => {
  it('não desconta INSS quando contract.inss = "no"', () => {
    const out = calc(baseInput({ emp: employee(contract({ inss: 'no' })) }))
    expect(out.inssAmt).toBe(0)
  })

  it('desconta INSS progressivo quando contract.inss = "yes"', () => {
    const out = calc(baseInput({ emp: employee(contract({ inss: 'yes', salary: 1621 })) }))
    expect(out.inssAmt).toBeGreaterThan(0)
    expect(out.netSal).toBeCloseTo(out.gross - out.inssAmt, 5)
  })
})

describe('calc — primeiro mês de admissão (pro-rata, CLT Art. 64)', () => {
  it('admitida no meio do mês: salário-base rateado por dias/30', () => {
    const c = contract({ salary: 3000 })
    const emp = employee(c, { admissao: '2026-08-16' })
    const out = calc(baseInput({ emp, ry: 2026, rm: 7 }))
    expect(out.isFirstMonth).toBe(true)
    // proRataDias = 31 - 16 = 15; fator = 15/30 = 0.5
    expect(out.proRataDias).toBe(15)
    expect(out.proRataSalBase).toBeCloseTo(1500, 2)
    expect(out.proRataActive).toBe(true)
    expect(out.finalNetSal).toBeCloseTo(out.proRataSal, 5)
  })

  it('proRataOverride=false força salário integral mesmo no primeiro mês', () => {
    const c = contract({ salary: 3000 })
    const emp = employee(c, { admissao: '2026-08-16' })
    const out = calc(baseInput({ emp, ry: 2026, rm: 7, proRataOverride: false }))
    expect(out.proRataActive).toBe(false)
    expect(out.finalNetSal).toBeCloseTo(out.netSal, 5)
  })

  it('mês diferente do de admissão não é tratado como primeiro mês', () => {
    const c = contract({ salary: 3000 })
    const emp = employee(c, { admissao: '2026-08-16' })
    const out = calc(baseInput({ emp, ry: 2026, rm: 8 })) // setembro/2026
    expect(out.isFirstMonth).toBe(false)
    expect(out.proRataActive).toBe(false)
  })
})

describe('calc — férias (LC 150/2015)', () => {
  const leaveFerias = (start: string, end: string, soldDays = 0): LeavePeriod => ({
    id: 'lp1',
    type: 'ferias',
    startDate: start,
    endDate: end,
    soldDays,
    notes: '',
  })

  it('férias gozadas removem os dias do VT e das diárias recorrentes durante o período', () => {
    const c = contract({ workDays: [1, 3, 5], recurring: [{ dow: 5, desc: 'Diária', value: 350, countHolidays: false }] })
    const emp = employee(c, { leavePeriods: [leaveFerias('2026-08-01', '2026-08-30')] })
    const out = calc(baseInput({ emp, leavePeriods: emp.leavePeriods, ry: 2026, rm: 7 }))
    // Único dia de agosto fora do período de férias é 31/08 (segunda) — não é dia de recorrência
    // nem dia fixo de trabalho (Ter/Qui/Sáb), então nenhuma diária recorrente sobra no mês.
    expect(out.recTot).toBe(0)
    expect(out.feriasDiasNoMes).toBe(30)
    expect(out.feriasAdicional).toBeGreaterThan(0)
  })

  it('TODO-LEGAL: soldDays NUNCA reduz os dias de afastamento — startDate–endDate é sempre tratado como dias gozados, mesmo quando soldDays "cobre" o período inteiro', () => {
    // Caracterização do comportamento atual (Fase 1 não corrige isto — só registra e
    // marca para revisão jurídica/contábil futura, com testes, antes de qualquer mudança
    // de regra): leaveDateType é populado para TODOS os dias entre startDate e endDate,
    // sem excluir nada com base em soldDays. Se um período for cadastrado com
    // startDate–endDate cobrindo o mês inteiro E soldDays também "cobrir" o mês inteiro
    // (ex.: uma tentativa de registrar venda 100% das férias, funcionária continua
    // trabalhando), o cálculo de hoje:
    //   1) remove VT e diárias recorrentes do mês inteiro (como se fosse afastamento real);
    //   2) AINDA soma o abono de férias integral por cima (feriasAbono) — dupla
    //      contabilização potencial (afastamento + abono sobre os mesmos dias) que este
    //      teste apenas documenta, sem validar como correta.
    // TODO-LEGAL: para cadastrar uma venda de fato integral com o modelo atual, o período
    // (startDate–endDate) precisa representar SÓ os dias efetivamente gozados — nunca os
    // dias vendidos. Decidir com contador/jurídico se o cálculo deveria, em vez disso,
    // excluir automaticamente `soldDays` do afastamento, e só então implementar com testes.
    const c = contract({ workDays: [1, 3, 5], recurring: [{ dow: 5, desc: 'Diária 24h', value: 350, countHolidays: false }] })
    const emp = employee(c, { leavePeriods: [leaveFerias('2026-08-01', '2026-08-30', 30)] })
    const out = calc(baseInput({ emp, leavePeriods: emp.leavePeriods, ry: 2026, rm: 7 }))
    expect(out.recTot).toBe(0) // continua removido — soldDays não muda isso
    expect(out.feriasDiasNoMes).toBe(30) // startDate–endDate = dias gozados, sempre, independente de soldDays
    expect(out.feriasDiasVendidos).toBe(30)
    expect(out.feriasAbono).toBeGreaterThan(0) // pago por cima do afastamento já contabilizado acima
  })

  it('TODO-LEGAL: mesma regra vale para venda parcial — soldDays < período cadastrado também não reduz o afastamento', () => {
    // Mesma caracterização do teste anterior, com um período mais curto: não existe hoje
    // nenhuma lógica que distinga "venda parcial" de "venda integral" para fins de
    // remoção de dias de trabalho — soldDays é usado só para calcular feriasAbono.
    const c = contract({ workDays: [1, 3, 5], recurring: [] })
    const emp = employee(c, { leavePeriods: [leaveFerias('2026-08-01', '2026-08-10', 5)] })
    const out = calc(baseInput({ emp, leavePeriods: emp.leavePeriods, ry: 2026, rm: 7 }))
    expect(out.feriasDiasNoMes).toBe(10)
    expect(out.feriasDiasVendidos).toBe(5)
  })

  it('abono pecuniário é atribuído ao mês de início do período vendido', () => {
    const c = contract()
    const emp = employee(c, { leavePeriods: [leaveFerias('2026-08-01', '2026-08-30', 30)] })
    const outAgosto = calc(baseInput({ emp, leavePeriods: emp.leavePeriods, ry: 2026, rm: 7 }))
    const outSetembro = calc(baseInput({ emp, leavePeriods: emp.leavePeriods, ry: 2026, rm: 8 }))
    expect(outAgosto.feriasAbono).toBeGreaterThan(0)
    expect(outSetembro.feriasAbono).toBe(0)
  })
})

describe('calc — licença médica vs. licença maternidade', () => {
  it('licença médica desconta do salário e sai da base de FGTS/encargos', () => {
    const c = contract({ salary: 3000, workDays: [] })
    const leave: LeavePeriod = { id: 'lm', type: 'licenca_medica', startDate: '2026-08-01', endDate: '2026-08-10', notes: '' }
    const emp = employee(c, { leavePeriods: [leave] })
    const out = calc(baseInput({ emp, leavePeriods: emp.leavePeriods, ry: 2026, rm: 7 }))
    const dailyRate30 = 3000 / 30
    expect(out.licencaMedicaDiasNoMes).toBe(10)
    expect(out.licencaMedicaDeducao).toBeCloseTo(dailyRate30 * 10, 2)
    // baseEnc (FGTS) exclui a dedução de licença médica.
    expect(out.fgts).toBeCloseTo((out.gross - out.licencaMedicaDeducao) * 0.08, 2)
  })

  it('licença maternidade desconta do salário MAS mantém FGTS/encargos sobre o valor cheio', () => {
    const c = contract({ salary: 3000, workDays: [] })
    const leave: LeavePeriod = { id: 'lmat', type: 'licenca_maternidade', startDate: '2026-08-01', endDate: '2026-08-10', notes: '' }
    const emp = employee(c, { leavePeriods: [leave] })
    const out = calc(baseInput({ emp, leavePeriods: emp.leavePeriods, ry: 2026, rm: 7 }))
    const dailyRate30 = 3000 / 30
    expect(out.licencaMaternidadeDiasNoMes).toBe(10)
    expect(out.licencaMaternidadeDeducao).toBeCloseTo(dailyRate30 * 10, 2)
    // baseEnc (FGTS) NÃO exclui a dedução de licença-maternidade — diferente da médica.
    expect(out.fgts).toBeCloseTo(out.gross * 0.08, 2)
  })
})

describe('calc — pagamento parcial', () => {
  function payment(overrides: Partial<Payment> = {}): Payment {
    return {
      id: 'p1', empId: 'e1', empName: 'Ana', empRole: 'Babá', monthKey: '2026-08',
      ry: 2026, rm: 7, salBase: 1621, recTot: 0, avTot: 0, bons: 0, deds: 0, inssAmt: 0,
      netSal: 1621, proRataActive: false, vtNet: 0, vtGross: 0, vtDisc: 0, vtWd: 0, vtWdAuto: 0,
      vtY: 2026, vtM: 8, total: 1621, paidAmount: 1621, paidDate: '2026-09-02', method: 'pix',
      isRescisao: false, rescTotal: null, notes: '', events: [], adjs: [], recs: [], paidAt: '2026-09-02T00:00:00.000Z',
      ...overrides,
    }
  }

  it('isPartialPayment/remainingBalance detectam pagamento parcial', () => {
    const p = payment({ total: 1000, paidAmount: 600 })
    expect(isPartialPayment(p)).toBe(true)
    expect(remainingBalance(p)).toBeCloseTo(400, 2)
  })

  it('pagamento integral não é parcial e não deixa saldo', () => {
    const p = payment({ total: 1000, paidAmount: 1000 })
    expect(isPartialPayment(p)).toBe(false)
    expect(remainingBalance(p)).toBe(0)
  })

  it('registros antigos sem paidAmount caem no total via paidAmountOf', () => {
    // Caracteriza dado legado: linhas gravadas antes da feature de pagamento parcial não
    // têm a coluna paidAmount. Removida via clone genérico (sem any/ts-ignore) para simular
    // o que vem do banco nesses registros antigos.
    const clone: Record<string, unknown> = { ...payment({ total: 1000 }) }
    delete clone.paidAmount
    expect(paidAmountOf(clone as unknown as Payment)).toBe(1000)
  })

  it('paymentStatus retorna "parcial" e "pago" corretamente', () => {
    const out = calc(baseInput({ payment: payment({ total: 1000, paidAmount: 600 }) }))
    expect(paymentStatus(out)).toBe('parcial')
    const out2 = calc(baseInput({ payment: payment({ total: 1000, paidAmount: 1000 }) }))
    expect(paymentStatus(out2)).toBe('pago')
  })

  it('paymentStatus retorna "pendente" quando não há pagamento e o total é positivo', () => {
    const out = calc(baseInput({ payment: null }))
    expect(paymentStatus(out)).toBe('pendente')
  })
})

describe('calc — meses de 28/29/30/31 dias (via dias fixos de trabalho)', () => {
  const c = contract({ workDays: [0, 1, 2, 3, 4], recurring: [] }) // Seg-Sex

  it('fevereiro não bissexto (28 dias)', () => {
    const out = calc(baseInput({ emp: employee(c), ry: 2026, rm: 1 }))
    expect(out.dailyRate).toBeGreaterThan(0)
  })

  it('fevereiro bissexto (29 dias) — um dia útil a mais que em 2026', () => {
    const out2024 = calc(baseInput({ emp: employee(c), ry: 2024, rm: 1 }))
    const out2026 = calc(baseInput({ emp: employee(c), ry: 2026, rm: 1 }))
    // dailyRate = salário / dias úteis; mais dias úteis em 2024 (bissexto) → dailyRate menor ou igual.
    expect(out2024.dailyRate).toBeLessThanOrEqual(out2026.dailyRate)
  })

  it('mês de 30 dias (abril)', () => {
    const out = calc(baseInput({ emp: employee(c), ry: 2026, rm: 3 }))
    expect(out.dailyRate).toBeGreaterThan(0)
  })

  it('mês de 31 dias (agosto)', () => {
    const out = calc(baseInput({ emp: employee(c), ry: 2026, rm: 7 }))
    expect(out.dailyRate).toBeGreaterThan(0)
  })
})
