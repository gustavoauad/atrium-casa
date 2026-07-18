import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/**
 * Garante que o aceite dos Termos fique registrado em public.user_agreements (log de
 * auditoria). Cobre o caso de contas que exigiram confirmação por e-mail — o aceite é
 * capturado no signUp via user_metadata, mas só há sessão (e permissão de RLS pra
 * escrever) depois que o usuário confirma e faz o primeiro login.
 */
export async function ensureTermsAgreementRecorded(user: User): Promise<void> {
  const version = user.user_metadata?.terms_version
  if (!version) return

  const { data: existing } = await supabase
    .from('user_agreements')
    .select('id')
    .eq('user_id', user.id)
    .eq('terms_version', version)
    .limit(1)

  if (existing && existing.length > 0) return

  await supabase.from('user_agreements').insert({
    user_id: user.id,
    terms_version: version,
    accepted_at: user.user_metadata?.terms_accepted_at || new Date().toISOString(),
  })
}
