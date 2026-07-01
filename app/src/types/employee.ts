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

export interface Employee {
  id: string
  name: string
  role: string
  salary: number
  contract: 'mensalista' | 'diarista'
  admissao: string
  vtDaily: number
  vtDiscount: 'legal' | 'none'
  inss: 'yes' | 'no'
  workDays: number[]
  recurring: RecurringDaily[]
  extraTypes: ExtraType[]
  notes: string
  createdAt?: string
  status?: 'ativo' | 'desligado'
  desligamento?: string
  motivoBaixa?: string
  dataBaixa?: string
  obsBaixa?: string
  /** id da linha na tabela `employees` do Supabase */
  _sbid?: string
}

export const DEFAULT_EXTRA_TYPES: ExtraType[] = [
  { name: 'Diária 12h', value: 200 },
  { name: 'Diária 24h', value: 350 },
]

export function newEmployee(): Employee {
  return {
    id: crypto.randomUUID(),
    name: '',
    role: EMPLOYEE_ROLES[0],
    salary: 0,
    contract: 'mensalista',
    admissao: '',
    vtDaily: 0,
    vtDiscount: 'legal',
    inss: 'yes',
    workDays: [],
    recurring: [],
    extraTypes: DEFAULT_EXTRA_TYPES,
    notes: '',
  }
}
