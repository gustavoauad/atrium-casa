export interface WorkEvent {
  id: string
  date: string
  value: number
  duration: string
  holiday: boolean
  notes: string
  paidDate?: string
  paidMethod?: string
  paidNotes?: string
  _sbid?: string
}
