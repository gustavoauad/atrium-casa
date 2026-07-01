import { supabase } from '../lib/supabase'
import type { Employee } from '../types/employee'

export async function loadEmployees(houseId: string): Promise<Employee[]> {
  const { data, error } = await supabase
    .from('employees')
    .select('id, data')
    .eq('house_id', houseId)
    .order('id')
  if (error) throw new Error(error.message)
  return (data || []).map((row) => ({ ...(row.data as Employee), _sbid: row.id }))
}

export async function saveEmployee(houseId: string, emp: Employee): Promise<Employee> {
  const payload = { data: emp, house_id: houseId, updated_at: new Date().toISOString() }
  if (emp._sbid) {
    const { error } = await supabase.from('employees').update(payload).eq('id', emp._sbid).eq('house_id', houseId)
    if (error) throw new Error(error.message)
    return emp
  }
  const { data, error } = await supabase.from('employees').insert(payload).select('id').single()
  if (error) throw new Error(error.message)
  return { ...emp, _sbid: data.id }
}

export async function deleteEmployee(houseId: string, emp: Employee): Promise<void> {
  await supabase.from('events').delete().eq('emp_id', emp.id).eq('house_id', houseId)
  await supabase.from('adjustments').delete().eq('emp_id', emp.id).eq('house_id', houseId)
  await supabase.from('payments').delete().eq('emp_id', emp.id).eq('house_id', houseId)
  if (emp._sbid) {
    const { error } = await supabase.from('employees').delete().eq('id', emp._sbid).eq('house_id', houseId)
    if (error) throw new Error(error.message)
  }
}
