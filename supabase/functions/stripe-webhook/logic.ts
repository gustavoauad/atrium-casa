/**
 * Lógica pura do webhook do Stripe — sem `Deno.*`, sem imports `npm:`/`http` — para
 * poder rodar tanto na Edge Function (Deno) quanto nos testes (Vitest/Node). Mantém
 * index.ts fino: só orquestra I/O (verificar assinatura, buscar o estado atual da
 * assinatura no Stripe, chamar a RPC transacional) e usa estas funções para decidir
 * quais valores montar.
 *
 * Deduplicação e ordenação (evento repetido / fora de ordem / empatado) NÃO vivem mais
 * aqui — isso agora é responsabilidade exclusiva da RPC
 * `public.process_stripe_subscription_event` (ver
 * supabase/2026-09-02-stripe-webhook-idempotency.sql), que roda em uma única transação
 * com lock (`pg_advisory_xact_lock` por house_id) para evitar condição de corrida entre
 * entregas concorrentes do Stripe. Ter essa lógica em SQL, dentro da mesma transação da
 * escrita, é o que a torna atômica de verdade — replicar em JS só criaria uma segunda
 * fonte de verdade sujeita a divergir da primeira.
 */

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled'
export type SubscriptionTier = 'basico' | 'premium'

/** Status do Stripe → status interno usado em `subscriptions.status`. */
export function mapStatus(stripeStatus: string): SubscriptionStatus {
  if (stripeStatus === 'active' || stripeStatus === 'trialing') return 'active'
  if (stripeStatus === 'past_due' || stripeStatus === 'unpaid' || stripeStatus === 'incomplete') return 'past_due'
  return 'canceled'
}

/** Resolve o price_id do Stripe para um tier interno, a partir de um mapa conhecido
 *  (montado pelo caller a partir das env vars STRIPE_PRICE_ID_*). */
export function priceIdToTier(
  priceId: string | undefined,
  knownPrices: Record<string, SubscriptionTier>,
): SubscriptionTier | null {
  if (!priceId) return null
  return knownPrices[priceId] ?? null
}

/** Lançado quando um evento não-`deleted` referencia um `price_id` que não bate com
 *  nenhuma env var STRIPE_PRICE_ID_* configurada — index.ts deve responder erro (nunca
 *  silenciosamente manter o tier anterior) e NÃO chamar a RPC nesse caso. */
export class UnknownPriceError extends Error {
  readonly priceId: string | undefined

  constructor(priceId: string | undefined) {
    super(`price_id do Stripe não corresponde a nenhuma variável STRIPE_PRICE_ID_* configurada: ${priceId ?? '(ausente)'}`)
    this.name = 'UnknownPriceError'
    this.priceId = priceId
  }
}

export interface StripeSubscriptionLike {
  id: string
  customer: string
  status: string
  current_period_end: number
  items: { data: { price: { id: string } }[] }
}

export interface SubscriptionUpdateParams {
  tier: SubscriptionTier | null
  status: SubscriptionStatus
  provider_customer_id: string
  provider_subscription_id: string
  current_period_end: string | null
}

/**
 * Monta os valores a persistir a partir do estado ATUAL da assinatura (já rebuscado do
 * Stripe por index.ts via stripeGet — nunca a partir do snapshot embutido no payload do
 * webhook, que pode estar desatualizado). Lança `UnknownPriceError` se um evento
 * não-`deleted` não conseguir resolver um tier — o caller deve tratar isso como erro
 * (responder 5xx, não seguir em frente) em vez de persistir um tier vazio/indefinido.
 */
export function buildSubscriptionUpdateParams(
  eventType: string,
  sub: StripeSubscriptionLike,
  knownPrices: Record<string, SubscriptionTier>,
): SubscriptionUpdateParams {
  const isDeleted = eventType === 'customer.subscription.deleted'
  const priceId = sub.items?.data?.[0]?.price?.id

  let tier: SubscriptionTier | null = null
  if (!isDeleted) {
    tier = priceIdToTier(priceId, knownPrices)
    if (tier === null) throw new UnknownPriceError(priceId)
  }

  return {
    tier,
    status: isDeleted ? 'canceled' : mapStatus(sub.status),
    provider_customer_id: sub.customer,
    provider_subscription_id: sub.id,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
  }
}
