export const EMPLOYEE_ROLES = [
  'Empregada Doméstica',
  'Babá',
  'Babá Folguista',
  'Diarista',
  'Passadeira',
  'Cozinheira',
  'Jardineiro',
  'Motorista',
  'Outro',
] as const

export const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export interface RecurringDaily {
  dow: number
  desc: string
  value: number
  countHolidays: boolean
}

export interface ExtraType {
  name: string
  value: number
}

/**
 * Condições contratuais vigentes a partir de `startDate`. Um funcionário pode ter vários
 * contratos ao longo do tempo; o cálculo da folha de um mês usa o contrato vigente naquele
 * mês (não o mais recente), para não reescrever retroativamente meses já trabalhados.
 */
export interface Contract {
  id: string
  /** Mês/ano a partir do qual este contrato vale (granularidade de mês — sem rateio intramês). */
  startDate: string
  role: string
  salary: number
  contract: 'mensalista' | 'diarista'
  vtDaily: number
  vtDiscount: 'legal' | 'none'
  inss: 'yes' | 'no'
  workDays: number[]
  recurring: RecurringDaily[]
}

export const LEAVE_TYPES = ['ferias', 'licenca_medica', 'licenca_maternidade'] as const
export type LeaveType = (typeof LEAVE_TYPES)[number]

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  ferias: 'Férias',
  licenca_medica: 'Licença médica',
  licenca_maternidade: 'Licença maternidade',
}

/**
 * Período de afastamento (LC 150/2015). O tratamento no cálculo da folha difere por tipo:
 * - `ferias`: salário integral mantido + adicional de 1/3 constitucional (sujeito a FGTS/INSS).
 * - `licenca_medica`: INSS paga desde o 1º dia, contrato suspenso — desconta do salário e
 *   sai da base de FGTS/INSS Patronal/provisões.
 * - `licenca_maternidade`: INSS paga os 120 dias, mas FGTS/encargos continuam sobre o valor cheio.
 * Em todos os casos, os dias do período saem do VT e das diárias recorrentes (não há expediente).
 * Só afeta contrato mensalista (mesma limitação de `dailyRate`).
 */
export interface LeavePeriod {
  id: string
  type: LeaveType
  /** Datas ISO, ambas inclusive. */
  startDate: string
  endDate: string
  notes: string
}

export function newLeavePeriod(type: LeaveType, startDate: string): LeavePeriod {
  return { id: crypto.randomUUID(), type, startDate, endDate: startDate, notes: '' }
}

export interface Employee {
  id: string
  name: string
  admissao: string
  extraTypes: ExtraType[]
  notes: string
  contracts?: Contract[]
  leavePeriods?: LeavePeriod[]
  createdAt?: string
  status?: 'ativo' | 'desligado'
  desligamento?: string
  motivoBaixa?: string
  dataBaixa?: string
  obsBaixa?: string
  /** id da linha na tabela `employees` do Supabase */
  _sbid?: string

  // ── Campos legados (pré-contratos) — mantidos só como fallback de migração.
  // Nunca mais escritos após o primeiro salvamento pela UI atual; use
  // getContractForMonth()/getCurrentContract() em vez de ler estes campos direto.
  role?: string
  salary?: number
  contract?: 'mensalista' | 'diarista'
  vtDaily?: number
  vtDiscount?: 'legal' | 'none'
  inss?: 'yes' | 'no'
  workDays?: number[]
  recurring?: RecurringDaily[]
}

export const DEFAULT_EXTRA_TYPES: ExtraType[] = [
  { name: 'Diária 12h', value: 200 },
  { name: 'Diária 24h', value: 350 },
]

export function newContract(startDate: string): Contract {
  return {
    id: crypto.randomUUID(),
    startDate,
    role: EMPLOYEE_ROLES[0],
    salary: 0,
    contract: 'mensalista',
    vtDaily: 0,
    vtDiscount: 'legal',
    inss: 'yes',
    workDays: [],
    recurring: [],
  }
}

export function newEmployee(): Employee {
  const admissao = ''
  return {
    id: crypto.randomUUID(),
    name: '',
    admissao,
    extraTypes: DEFAULT_EXTRA_TYPES,
    notes: '',
    contracts: [newContract(admissao)],
  }
}
