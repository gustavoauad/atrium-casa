import { supabase } from '../lib/supabase'
import type { Adjustment } from '../types/adjustment'

export async function loadAdjustmentsForEmployee(houseId: string, empId: string): Promise<Record<string, Adjustment[]>> {
  const { data, error } = await supabase
    .from('adjustments')
    .select('id, month_key, data')
    .eq('house_id', houseId)
    .eq('emp_id', empId)
    .order('id')
  if (error) throw new Error(error.message)
  const byMonth: Record<string, Adjustment[]> = {}
  for (const row of data || []) {
    const mk = row.month_key as string
    if (!byMonth[mk]) byMonth[mk] = []
    byMonth[mk].push({ ...(row.data as Adjustment), _sbid: row.id })
  }
  return byMonth
}

export async function loadAdjustmentsForMonth(houseId: string, monthKey: string): Promise<Record<string, Adjustment[]>> {
  const { data, error } = await supabase
    .from('adjustments')
    .select('id, emp_id, data')
    .eq('house_id', houseId)
    .eq('month_key', monthKey)
    .order('id')
  if (error) throw new Error(error.message)
  const byEmp: Record<string, Adjustment[]> = {}
  for (const row of data || []) {
    const eid = row.emp_id as string
    if (!byEmp[eid]) byEmp[eid] = []
    byEmp[eid].push({ ...(row.data as Adjustment), _sbid: row.id })
  }
  return byEmp
}

export async function saveAdjustment(houseId: string, empId: string, monthKey: string, adj: Adjustment): Promise<Adjustment> {
  const payload = { emp_id: empId, month_key: monthKey, data: adj, house_id: houseId, updated_at: new Date().toISOString() }
  if (adj._sbid) {
    const { error } = await supabase.from('adjustments').update(payload).eq('id', adj._sbid).eq('house_id', houseId)
    if (error) throw new Error(error.message)
    return adj
  }
  const { data, error } = await supabase.from('adjustments').insert(payload).select('id').single()
  if (error) throw new Error(error.message)
  return { ...adj, _sbid: data.id }
}

export async function deleteAdjustment(houseId: string, sbid: string): Promise<void> {
  const { error } = await supabase.from('adjustments').delete().eq('id', sbid).eq('house_id', houseId)
  if (error) throw new Error(error.message)
}
