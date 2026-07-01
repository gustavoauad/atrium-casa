import { supabase } from '../lib/supabase'
import type { Payment } from '../types/payment'

export async function loadPaymentsForEmployee(houseId: string, empId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('id, data')
    .eq('house_id', houseId)
    .eq('emp_id', empId)
    .order('id')
  if (error) throw new Error(error.message)
  return (data || []).map((row) => ({ ...(row.data as Payment), _sbid: row.id }))
}

export async function loadPaymentsForMonth(houseId: string, monthKey: string): Promise<Record<string, Payment>> {
  const { data, error } = await supabase
    .from('payments')
    .select('id, emp_id, data')
    .eq('house_id', houseId)
    .eq('month_key', monthKey)
  if (error) throw new Error(error.message)
  const byEmp: Record<string, Payment> = {}
  for (const row of data || []) {
    byEmp[row.emp_id as string] = { ...(row.data as Payment), _sbid: row.id }
  }
  return byEmp
}

export async function savePayment(houseId: string, empId: string, monthKey: string, payment: Payment): Promise<Payment> {
  const payload = { emp_id: empId, month_key: monthKey, data: payment, house_id: houseId, updated_at: new Date().toISOString() }
  if (payment._sbid) {
    const { error } = await supabase.from('payments').update(payload).eq('id', payment._sbid).eq('house_id', houseId)
    if (error) throw new Error(error.message)
    return payment
  }
  const { data, error } = await supabase.from('payments').insert(payload).select('id').single()
  if (error) throw new Error(error.message)
  return { ...payment, _sbid: data.id }
}
