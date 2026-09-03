import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { stripePost } from '../_shared/stripe.ts'
import { assertManagesHouse, supabaseAdmin } from '../_shared/supabaseClients.ts'
import { resolveReturnUrl } from '../_shared/appUrl.ts'

interface PortalSession {
  url: string
}

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt

  try {
    const { house_id, return_url } = await req.json()
    if (!house_id) throw new Error('house_id é obrigatório.')

    await assertManagesHouse(req, house_id)

    const admin = supabaseAdmin()
    const { data: sub, error } = await admin
      .from('subscriptions')
      .select('provider_customer_id')
      .eq('house_id', house_id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!sub?.provider_customer_id) {
      throw new Error('Esta Casa ainda não tem uma assinatura paga — assine um plano primeiro.')
    }

    const base = resolveReturnUrl(return_url)

    const session = await stripePost<PortalSession>('billing_portal/sessions', {
      customer: sub.provider_customer_id,
      return_url: base,
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
