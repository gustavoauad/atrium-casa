import { newContract, type Contract, type Employee } from '../../types/employee'
import { parseLocalDate } from './format'

/** Retorna os contratos do funcionário, sintetizando um único contrato "legado" a partir dos campos antigos se `contracts` ainda não existir. */
export function resolveContracts(emp: Employee): Contract[] {
  if (emp.contracts && emp.contracts.length > 0) return emp.contracts
  return [
    {
      id: 'legacy',
      startDate: emp.admissao || '1970-01-01',
      role: emp.role ?? 'Empregada Doméstica',
      salary: emp.salary ?? 0,
      contract: emp.contract ?? 'mensalista',
      vtDaily: emp.vtDaily ?? 0,
      vtDiscount: emp.vtDiscount ?? 'legal',
      inss: emp.inss ?? 'yes',
      workDays: emp.workDays ?? [],
      recurring: emp.recurring ?? [],
    },
  ]
}

/** Contratos do funcionário ordenados do mais antigo pro mais recente (por startDate). */
export function sortedContracts(emp: Employee): Contract[] {
  return [...resolveContracts(emp)].sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))
}

/** Contrato vigente para o mês de referência (y, m) — o mais recente cuja startDate cai em y/m ou antes. */
export function getContractForMonth(emp: Employee, y: number, m: number): Contract {
  const list = sortedContracts(emp)
  const refMonthIndex = y * 12 + m
  let chosen = list[0]
  for (const c of list) {
    const d = c.startDate ? parseLocalDate(c.startDate) : null
    const startMonthIndex = d ? d.getFullYear() * 12 + d.getMonth() : -Infinity
    if (startMonthIndex <= refMonthIndex) chosen = c
  }
  return chosen ?? newContract(emp.admissao || '')
}

/**
 * Contrato vigente numa data exata (granularidade de dia, não de mês) — o mais recente cuja
 * startDate cai nela ou antes. Usado para prorratear diárias recorrentes/salário quando um
 * contrato muda no meio de um mês de referência (ver `getPreviousContract`).
 */
export function getContractForDate(emp: Employee, iso: string): Contract {
  const list = sortedContracts(emp)
  let chosen = list[0]
  for (const c of list) {
    if (c.startDate && c.startDate <= iso) chosen = c
  }
  return chosen ?? newContract(emp.admissao || '')
}

/** Contrato imediatamente anterior ao informado na linha do tempo — null se for o primeiro (admissão). */
export function getPreviousContract(emp: Employee, contract: Contract): Contract | null {
  const list = sortedContracts(emp)
  const idx = list.findIndex((c) => c.id === contract.id)
  return idx > 0 ? list[idx - 1] : null
}

/** Contrato vigente hoje. */
export function getCurrentContract(emp: Employee): Contract {
  const now = new Date()
  return getContractForMonth(emp, now.getFullYear(), now.getMonth())
}
