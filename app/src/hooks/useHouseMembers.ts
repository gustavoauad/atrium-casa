import { supabase } from '../lib/supabase'
import type { HouseRole } from '../types/house'

export interface HouseMember {
  user_id: string
  role: HouseRole
  display_name?: string | null
  email?: string | null
}

export async function loadHouseMembers(houseId: string): Promise<HouseMember[]> {
  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_house_members_with_email', { p_house_id: houseId })
  if (!rpcErr && rpcData) return rpcData as HouseMember[]

  const { data, error } = await supabase
    .from('house_members')
    .select('user_id, role, display_name, email')
    .eq('house_id', houseId)
  if (error) throw new Error(error.message)
  return (data || []) as HouseMember[]
}

export async function changeMemberRole(houseId: string, userId: string, newRole: HouseRole): Promise<void> {
  const { data, error } = await supabase
    .from('house_members')
    .update({ role: newRole })
    .eq('house_id', houseId)
    .eq('user_id', userId)
    .select()
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Permissão negada pelo banco. Verifique se sua conta é Admin.')
  }
}

export async function removeMember(houseId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('house_members').delete().eq('house_id', houseId).eq('user_id', userId)
  if (error) throw new Error(error.message)
}

/** Transfere a propriedade da Casa para outro membro (o antigo Proprietário vira Admin). Só o Proprietário pode chamar isso. */
export async function transferOwnership(houseId: string, newOwnerUserId: string): Promise<void> {
  const { error } = await supabase.rpc('transfer_house_ownership', {
    p_house_id: houseId,
    p_new_owner: newOwnerUserId,
  })
  if (error) throw new Error(error.message)
}
