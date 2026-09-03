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

/**
 * Exclui o funcionário e seus eventos/ajustes/pagamentos via RPC transacional — atômico
 * e valida papel (owner/admin) no próprio banco. Ver
 * supabase/2026-09-02-atomic-employee-delete.sql.
 */
export async function deleteEmployee(houseId: string, emp: Employee): Promise<void> {
  const { error } = await supabase.rpc('delete_employee', { p_house_id: houseId, p_emp_id: emp.id })
  if (error) throw new Error(error.message)
}
