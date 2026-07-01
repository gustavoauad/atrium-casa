import { supabase } from '../lib/supabase'
import type { House, HouseRole } from '../types/house'

export async function loadUserHouses(userId: string): Promise<House[]> {
  const { data: memberships, error: err1 } = await supabase
    .from('house_members')
    .select('house_id, role')
    .eq('user_id', userId)
  if (err1) throw new Error(err1.message)
  if (!memberships?.length) return []

  const houseIds = memberships.map((m) => m.house_id)
  const { data: houses, error: err2 } = await supabase
    .from('houses')
    .select('id, name, invite_code')
    .in('id', houseIds)
  if (err2) throw new Error(err2.message)

  return memberships.map((m) => {
    const h = (houses || []).find((x) => x.id === m.house_id)
    return {
      id: m.house_id,
      name: h?.name || 'Minha Casa',
      invite_code: h?.invite_code || '',
      role: m.role as HouseRole,
    }
  })
}

export async function createHouse(userId: string, name: string): Promise<House> {
  const { data: houseRow, error: hErr } = await supabase
    .from('houses')
    .insert({ name, created_by: userId })
    .select('id, name, invite_code')
    .single()
  if (hErr) throw new Error('Erro ao criar Casa: ' + hErr.message)

  const { error: mErr } = await supabase
    .from('house_members')
    .insert({ house_id: houseRow.id, user_id: userId, role: 'admin' })
  if (mErr) throw new Error('Erro ao associar membro: ' + mErr.message)

  return { id: houseRow.id, name: houseRow.name, invite_code: houseRow.invite_code, role: 'admin' }
}

export async function findHouseByInviteCode(code: string) {
  const { data, error } = await supabase
    .from('houses')
    .select('id, name, invite_code')
    .eq('invite_code', code.toLowerCase().trim())
    .maybeSingle()
  if (error) throw new Error('Erro ao verificar código: ' + error.message)
  return data
}

export async function joinHouseByInviteCode(
  userId: string,
  code: string,
  email?: string | null,
): Promise<House> {
  const house = await findHouseByInviteCode(code)
  if (!house) throw new Error(`Código '${code.toLowerCase().trim()}' não encontrado. Verifique se copiou corretamente.`)

  const { error: mErr } = await supabase.from('house_members').insert({
    house_id: house.id,
    user_id: userId,
    role: 'viewer',
    email: email ?? null,
    display_name: email?.split('@')[0] ?? null,
  })
  if (mErr && !mErr.message.includes('duplicate')) {
    throw new Error('Erro ao entrar na Casa: ' + mErr.message)
  }

  return { id: house.id, name: house.name, invite_code: house.invite_code, role: 'viewer' }
}
