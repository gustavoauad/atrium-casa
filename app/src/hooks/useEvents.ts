import { supabase } from '../lib/supabase'
import type { WorkEvent } from '../types/event'

export async function loadEventsForEmployee(houseId: string, empId: string): Promise<Record<string, WorkEvent[]>> {
  const { data, error } = await supabase
    .from('events')
    .select('id, month_key, data')
    .eq('house_id', houseId)
    .eq('emp_id', empId)
    .order('id')
  if (error) throw new Error(error.message)
  const byMonth: Record<string, WorkEvent[]> = {}
  for (const row of data || []) {
    const mk = row.month_key as string
    if (!byMonth[mk]) byMonth[mk] = []
    byMonth[mk].push({ ...(row.data as WorkEvent), _sbid: row.id })
  }
  return byMonth
}

export async function loadEventsForMonth(houseId: string, monthKey: string): Promise<Record<string, WorkEvent[]>> {
  const { data, error } = await supabase
    .from('events')
    .select('id, emp_id, data')
    .eq('house_id', houseId)
    .eq('month_key', monthKey)
    .order('id')
  if (error) throw new Error(error.message)
  const byEmp: Record<string, WorkEvent[]> = {}
  for (const row of data || []) {
    const eid = row.emp_id as string
    if (!byEmp[eid]) byEmp[eid] = []
    byEmp[eid].push({ ...(row.data as WorkEvent), _sbid: row.id })
  }
  return byEmp
}

export async function saveEvent(houseId: string, empId: string, monthKey: string, ev: WorkEvent): Promise<WorkEvent> {
  const payload = { emp_id: empId, month_key: monthKey, data: ev, house_id: houseId, updated_at: new Date().toISOString() }
  if (ev._sbid) {
    const { error } = await supabase.from('events').update(payload).eq('id', ev._sbid).eq('house_id', houseId)
    if (error) throw new Error(error.message)
    return ev
  }
  const { data, error } = await supabase.from('events').insert(payload).select('id').single()
  if (error) throw new Error(error.message)
  return { ...ev, _sbid: data.id }
}

export async function deleteEvent(houseId: string, sbid: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', sbid).eq('house_id', houseId)
  if (error) throw new Error(error.message)
}
