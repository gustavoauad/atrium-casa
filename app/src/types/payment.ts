import type { Adjustment } from './adjustment'
import type { WorkEvent } from './event'

export interface RecurringOccurrence {
  iso: string
  desc: string
  value: number
  hn: string | null
  autoHol: boolean
}

export interface Payment {
  id: string
  empId: string
  empName: string
  empRole: string
  monthKey: string
  ry: number
  rm: number
  salBase: number
  recTot: number
  avTot: number
  bons: number
  deds: number
  inssAmt: number
  netSal: number
  proRataActive: boolean
  vtNet: number
  vtGross: number
  vtDisc: number
  vtWd: number
  vtWdAuto: number
  vtY: number
  vtM: number
  total: number
  /** Valor efetivamente pago — pode ser menor que `total` (pagamento parcial). Registros antigos não têm essa chave; use `paidAmountOf()`. */
  paidAmount: number
  paidDate: string
  method: string
  isRescisao: boolean
  rescTotal: number | null
  notes: string
  events: WorkEvent[]
  adjs: Adjustment[]
  recs: RecurringOccurrence[]
  paidAt: string
  _sbid?: string
}
