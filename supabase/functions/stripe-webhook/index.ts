import { verifyStripeSignature } from '../_shared/stripe.ts'
import { supabaseAdmin } from '../_shared/supabaseClients.ts'

interface StripePrice {
  id: string
}
interface StripeSubscriptionItem {
  price: StripePrice
}
interface StripeSubscription {
  id: string
  customer: string
  status: string
  current_period_end: number
  metadata?: { house_id?: string; tier?: string }
  items: { data: StripeSubscriptionItem[] }
}
interface StripeEvent {
  type: string
  data: { object: StripeSubscription }
}

/** Status do Stripe → status interno usado em `subscriptions.status`. */
function mapStatus(stripeStatus: string): 'active' | 'past_due' | 'canceled' {
  if (stripeStatus === 'active' || stripeStatus === 'trialing') return 'active'
  if (stripeStatus === 'past_due' || stripeStatus === 'unpaid' || stripeStatus === 'incomplete') return 'past_due'
  return 'canceled'
}

function priceIdToTier(priceId: string | undefined): 'basico' | 'premium' | null {
  if (!priceId) return null
  if (priceId === Deno.env.get('STRIPE_PRICE_ID_BASICO')) return 'basico'
  if (priceId === Deno.env.get('STRIPE_PRICE_ID_PREMIUM')) return 'premium'
  return null
}

Deno.serve(async (req) => {
  const rawBody = await req.text()
  const signature = req.headers.get('Stripe-Signature')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

  if (!webhookSecret) {
    return new Response('STRIPE_WEBHOOK_SECRET não configurada', { status: 500 })
  }
  const valid = await verifyStripeSignature(rawBody, signature, webhookSecret)
  if (!valid) {
    return new Response('Assinatura inválida', { status: 400 })
  }

  const event = JSON.parse(rawBody) as StripeEvent

  try {
    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const sub = event.data.object
      const houseId = sub.metadata?.house_id
      if (!houseId) {
        console.error('Assinatura do Stripe sem metadata.house_id — ignorando evento', sub.id)
        return new Response('ok (sem house_id)', { status: 200 })
      }

      const priceId = sub.items?.data?.[0]?.price?.id
      const tier = event.type === 'customer.subscription.deleted' ? null : priceIdToTier(priceId)
      const status = event.type === 'customer.subscription.deleted' ? 'canceled' : mapStatus(sub.status)

      const admin = supabaseAdmin()
      const { error } = await admin
        .from('subscriptions')
        .update({
          tier: tier ?? undefined,
          status,
          provider: 'stripe',
          provider_customer_id: sub.customer,
          provider_subscription_id: sub.id,
          current_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq('house_id', houseId)
      if (error) throw new Error(error.message)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('Erro processando webhook do Stripe:', e)
    // Responde 200 mesmo em erro interno pra evitar retentativas infinitas do Stripe
    // por um bug do nosso lado; o erro já foi logado pra investigação manual.
    return new Response(JSON.stringify({ received: true, warning: 'processed with error' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
