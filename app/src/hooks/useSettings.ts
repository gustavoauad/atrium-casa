import { supabase } from '../lib/supabase'
import type { RegionalHoliday } from '../lib/payroll/holidays'
import type { HouseThemeColors } from '../lib/houseTheme'

export async function loadRegionalHolidays(houseId: string): Promise<RegionalHoliday[]> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('house_id', houseId)
    .eq('key', 'regional')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.value as RegionalHoliday[]) || []
}

export async function saveRegionalHolidays(houseId: string, regional: RegionalHoliday[]): Promise<void> {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'regional', value: regional, house_id: houseId }, { onConflict: 'key,house_id' })
  if (error) throw new Error(error.message)
}

/** Overrides por funcionário/mês (VT manual, pro-rata) — compatíveis com o app antigo (prefixo `ls:`). */
export async function loadOverrides(houseId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('settings')
    .select('key, value')
    .eq('house_id', houseId)
    .like('key', 'ls:%')
  if (error) throw new Error(error.message)
  const result: Record<string, unknown> = {}
  for (const row of data || []) {
    result[(row.key as string).slice(3)] = row.value
  }
  return result
}

export async function saveOverride(houseId: string, key: string, value: unknown): Promise<void> {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'ls:' + key, value: value ?? null, house_id: houseId }, { onConflict: 'key,house_id' })
  if (error) throw new Error(error.message)
}

/** Cor de destaque personalizada da Casa. `null` = usa a cor padrão da marca. */
export async function loadHouseThemeColors(houseId: string): Promise<HouseThemeColors | null> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('house_id', houseId)
    .eq('key', 'theme_colors')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.value as HouseThemeColors) || null
}

export async function saveHouseThemeColors(houseId: string, colors: HouseThemeColors | null): Promise<void> {
  if (!colors) {
    const { error } = await supabase.from('settings').delete().eq('house_id', houseId).eq('key', 'theme_colors')
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'theme_colors', value: colors, house_id: houseId }, { onConflict: 'key,house_id' })
  if (error) throw new Error(error.message)
}
