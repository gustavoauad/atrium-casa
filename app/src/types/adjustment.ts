export type AdjustmentType =
  | 'advance'
  | 'discount'
  | 'bonus'
  | 'loan'
  | 'other'
  | 'antecipacao'
  | 'fgts'
  | 'inssPatronal'
  | 'prov13'
  | 'provFerias'
  | 'irrf'

export interface Adjustment {
  id: string
  type: AdjustmentType
  value: number
  date: string
  desc: string
  evId?: string
  _sbid?: string
}

export const ADJUSTMENT_LABELS: Record<AdjustmentType, string> = {
  advance: 'Adiantamento',
  discount: 'Desconto/Falta',
  bonus: 'Bônus',
  loan: 'Parcela empréstimo',
  other: 'Outro desconto',
  antecipacao: 'Antecipação (diária avulsa)',
  fgts: 'FGTS (8%)',
  inssPatronal: 'INSS Patronal (20%)',
  prov13: 'Provisão 13º',
  provFerias: 'Provisão Férias+1/3',
  irrf: 'IRRF Retido',
}

export const DEDUCTION_TYPES: AdjustmentType[] = ['advance', 'discount', 'loan', 'other', 'antecipacao']
