import { createClient } from 'npm:@supabase/supabase-js@2'

/** Cliente com a service role — ignora RLS, só usado pra gravar em `subscriptions`. */
export function supabaseAdmin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

/** Cliente autenticado como o usuário que chamou a function (repassa o JWT do header). */
export function supabaseAsCaller(req: Request) {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
}

/** Confirma que o usuário autenticado é owner/admin da Casa — só eles gerenciam assinatura. */
export async function assertManagesHouse(req: Request, houseId: string): Promise<string> {
  const client = supabaseAsCaller(req)
  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user) throw new Error('Não autenticado.')

  const { data, error } = await client
    .from('house_members')
    .select('role')
    .eq('house_id', houseId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data || (data.role !== 'owner' && data.role !== 'admin')) {
    throw new Error('Só o Proprietário ou Admin da Casa podem gerenciar a assinatura.')
  }
  return user.id
}
