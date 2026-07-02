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

/** Contrato vigente para o mês de referência (y, m) — o mais recente cuja startDate cai em y/m ou antes. */
export function getContractForMonth(emp: Employee, y: number, m: number): Contract {
  const list = [...resolveContracts(emp)].sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))
  const refMonthIndex = y * 12 + m
  let chosen = list[0]
  for (const c of list) {
    const d = c.startDate ? parseLocalDate(c.startDate) : null
    const startMonthIndex = d ? d.getFullYear() * 12 + d.getMonth() : -Infinity
    if (startMonthIndex <= refMonthIndex) chosen = c
  }
  return chosen ?? newContract(emp.admissao || '')
}

/** Contrato vigente hoje. */
export function getCurrentContract(emp: Employee): Contract {
  const now = new Date()
  return getContractForMonth(emp, now.getFullYear(), now.getMonth())
}
