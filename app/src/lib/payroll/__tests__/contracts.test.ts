import { describe, expect, it } from 'vitest'
import { getContractForMonth, getCurrentContract, resolveContracts } from '../contracts'
import type { Contract, Employee } from '../../../types/employee'
import { newContract } from '../../../types/employee'

function contract(overrides: Partial<Contract>): Contract {
  return { ...newContract(overrides.startDate ?? '2020-01-01'), ...overrides }
}

function employee(overrides: Partial<Employee>): Employee {
  return {
    id: 'e1',
    name: 'Funcionária Teste',
    admissao: '2025-04-01',
    extraTypes: [],
    notes: '',
    ...overrides,
  }
}

describe('resolveContracts — fallback legado', () => {
  it('sintetiza um contrato único a partir dos campos legados quando `contracts` não existe', () => {
    const emp = employee({
      contracts: undefined,
      role: 'Babá',
      salary: 1500,
      contract: 'mensalista',
      vtDaily: 8,
      vtDiscount: 'legal',
      inss: 'yes',
      workDays: [0, 1, 2, 3, 4],
      recurring: [],
    })
    const list = resolveContracts(emp)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('legacy')
    expect(list[0].salary).toBe(1500)
    expect(list[0].startDate).toBe('2025-04-01')
  })

  it('usa `contracts` diretamente quando já existe, ignorando os campos legados', () => {
    const c = contract({ id: 'c1', startDate: '2025-04-01', salary: 2000 })
    const emp = employee({ contracts: [c], salary: 999 })
    expect(resolveContracts(emp)).toEqual([c])
  })
})

describe('getContractForMonth — seleção histórica (granularidade de mês, sem rateio intramês)', () => {
  const c2025 = contract({ id: 'old', startDate: '2025-04-01', salary: 1500 })
  const c2026 = contract({ id: 'new', startDate: '2026-07-31', salary: 1621 })
  const emp = employee({ contracts: [c2025, c2026] })

  it('mês antes de qualquer contrato: cai no fallback (contrato mais antigo da lista)', () => {
    const chosen = getContractForMonth(emp, 2024, 0)
    expect(chosen.id).toBe('old')
  })

  it('mês do contrato antigo (antes da mudança): usa o contrato antigo', () => {
    const chosen = getContractForMonth(emp, 2026, 5) // junho/2026
    expect(chosen.id).toBe('old')
  })

  it('MUDANÇA NO MEIO DO MÊS: contrato com startDate 2026-07-31 vale o mês de julho INTEIRO, não só o dia 31', () => {
    // Este é o comportamento documentado em contracts.ts: seleção por mês, sem rateio
    // intramês. Mesmo o novo contrato começando no último dia de julho, ele é escolhido
    // para julho inteiro — o contrato antigo não cobre nenhum dia de julho no cálculo.
    const chosen = getContractForMonth(emp, 2026, 6) // julho/2026
    expect(chosen.id).toBe('new')
  })

  it('mês seguinte à mudança: continua usando o novo contrato', () => {
    const chosen = getContractForMonth(emp, 2026, 7) // agosto/2026
    expect(chosen.id).toBe('new')
  })

  it('getCurrentContract usa o mês/ano correntes do relógio do sistema', () => {
    // Caracterização indireta: getCurrentContract delega para getContractForMonth com
    // `new Date()` — não há injeção de data, então depende do relógio real do processo.
    const chosen = getCurrentContract(emp)
    expect(['old', 'new']).toContain(chosen.id)
  })

  it('contratos com a mesma competência (mesmo ano/mês de início): o último da ordenação ascendente vence', () => {
    const a = contract({ id: 'a', startDate: '2026-03-01', salary: 100 })
    const b = contract({ id: 'b', startDate: '2026-03-15', salary: 200 })
    const empSameMonth = employee({ contracts: [a, b] })
    const chosen = getContractForMonth(empSameMonth, 2026, 2) // março/2026
    expect(chosen.id).toBe('b')
  })
})

describe('getContractForMonth — sem nenhum contrato', () => {
  it('sintetiza um contrato novo a partir da admissão quando a lista está vazia', () => {
    const emp = employee({ contracts: [], admissao: '2025-01-10' })
    const chosen = getContractForMonth(emp, 2025, 5)
    expect(chosen.startDate).toBe('2025-01-10')
    expect(chosen.salary).toBe(0)
  })
})
