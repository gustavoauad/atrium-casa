import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { stripePost } from '../_shared/stripe.ts'
import { assertManagesHouse, supabaseAdmin } from '../_shared/supabaseClients.ts'

interface CheckoutSession {
  id: string
  url: string
  customer: string
}

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt

  try {
    const { house_id, tier, return_url } = await req.json()
    if (!house_id || (tier !== 'basico' && tier !== 'premium')) {
      throw new Error('Parâmetros inválidos: house_id e tier (basico|premium) são obrigatórios.')
    }

    await assertManagesHouse(req, house_id)

    const priceId =
      tier === 'basico' ? Deno.env.get('STRIPE_PRICE_ID_BASICO') : Deno.env.get('STRIPE_PRICE_ID_PREMIUM')
    if (!priceId) throw new Error(`Price do Stripe para o plano '${tier}' não configurado.`)

    const admin = supabaseAdmin()
    const { data: sub } = await admin
      .from('subscriptions')
      .select('provider_customer_id')
      .eq('house_id', house_id)
      .maybeSingle()

    const base = return_url || Deno.env.get('APP_URL') || 'https://gustavoauad.github.io/atrium-casa'

    const session = await stripePost<CheckoutSession>('checkout/sessions', {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: house_id,
      customer: sub?.provider_customer_id || undefined,
      metadata: { house_id, tier },
      subscription_data: { metadata: { house_id, tier } },
      success_url: `${base}?checkout=success`,
      cancel_url: `${base}?checkout=canceled`,
      allow_promotion_codes: true,
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
