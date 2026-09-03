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

/**
 * Cria a Casa via RPC transacional (houses + house_members(owner) + trial em uma única
 * transação no banco — auth.uid() resolvido no servidor, não confia em nenhum id vindo
 * do client). Ver supabase/2026-09-02-atomic-house-lifecycle.sql.
 */
export async function createHouse(name: string): Promise<House> {
  const { data, error } = await supabase.rpc('create_house_atomic', { p_name: name }).single()
  if (error) throw new Error('Erro ao criar Casa: ' + error.message)
  const row = data as { id: string; name: string; invite_code: string }
  return { id: row.id, name: row.name, invite_code: row.invite_code, role: 'owner' }
}

/**
 * Exclui a Casa e todos os dados vinculados via RPC transacional — atômico (sem
 * exclusão parcial em caso de erro no meio) e valida papel de Proprietário no próprio
 * banco. Irreversível. Ver supabase/2026-09-02-atomic-house-lifecycle.sql.
 */
export async function deleteHouse(houseId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_house', { p_house_id: houseId })
  if (error) throw new Error('Erro ao excluir Casa: ' + error.message)
}

export async function findHouseByInviteCode(code: string) {
  const normalized = code.toLowerCase().trim()
  const { data, error } = await supabase.rpc('find_house_by_invite_code', { p_code: normalized })
  if (error) throw new Error('Erro ao verificar código: ' + error.message)
  const row = data?.[0]
  return row ? { id: row.id, name: row.name, invite_code: normalized } : null
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
