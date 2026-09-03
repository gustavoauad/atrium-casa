import { stripeGet, verifyStripeSignature } from '../_shared/stripe.ts'
import { supabaseAdmin } from '../_shared/supabaseClients.ts'
import { buildSubscriptionUpdateParams, UnknownPriceError, type StripeSubscriptionLike, type SubscriptionTier } from './logic.ts'

interface StripeSubscription extends StripeSubscriptionLike {
  metadata?: { house_id?: string; tier?: string }
}
interface StripeEvent {
  id: string
  type: string
  /** Unix timestamp (segundos) de quando o Stripe gerou o evento — usado só para o log
   *  de auditoria (event_created_at); a decisão de ordenação/staleness em si é feita
   *  dentro da RPC transacional, não aqui. */
  created: number
  data: { object: StripeSubscription }
}

function knownPricesFromEnv(): Record<string, SubscriptionTier> {
  return {
    [Deno.env.get('STRIPE_PRICE_ID_BASICO_MONTHLY') ?? '']: 'basico',
    [Deno.env.get('STRIPE_PRICE_ID_BASICO_ANNUAL') ?? '']: 'basico',
    [Deno.env.get('STRIPE_PRICE_ID_PREMIUM_MONTHLY') ?? '']: 'premium',
    [Deno.env.get('STRIPE_PRICE_ID_PREMIUM_ANNUAL') ?? '']: 'premium',
  }
}

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
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
    // Assinatura inválida não é uma falha transitória — não adianta o Stripe retentar.
    return new Response('Assinatura inválida', { status: 400 })
  }

  let event: StripeEvent
  try {
    event = JSON.parse(rawBody) as StripeEvent
  } catch {
    return json({ received: false, error: 'payload não é JSON válido' }, 400)
  }
  if (!event?.id || !event?.type || !event?.created || !event?.data?.object?.id) {
    return json({ received: false, error: 'payload do evento incompleto (id/type/created/data.object.id)' }, 400)
  }

  if (
    event.type !== 'customer.subscription.created' &&
    event.type !== 'customer.subscription.updated' &&
    event.type !== 'customer.subscription.deleted'
  ) {
    // Tipo de evento que não tratamos — confirma recebimento sem processar nada.
    return json({ received: true, ignored: 'unhandled event type' }, 200)
  }

  // Sempre rebusca o estado ATUAL da assinatura no Stripe em vez de confiar no snapshot
  // embutido no payload do webhook — ver nota de política em
  // supabase/2026-09-02-stripe-webhook-idempotency.sql. Mesmo `customer.subscription.
  // deleted` continua buscável por id no Stripe (só some de endpoints de listagem).
  let sub: StripeSubscription
  try {
    sub = await stripeGet<StripeSubscription>(`subscriptions/${event.data.object.id}`)
  } catch (e) {
    // Log detalhado (timeout vs. rede vs. HTTP do Stripe, com `cause`) só no backend —
    // a resposta HTTP fica genérica de propósito.
    console.error('Erro buscando assinatura atual no Stripe:', e, e instanceof Error ? e.cause : undefined)
    // Cobre timeout, rede indisponível, resposta não-JSON e erro HTTP do Stripe (ver
    // StripeApiError em _shared/stripe.ts) — pedimos retentativa (5xx) em vez de
    // aplicar dados potencialmente desatualizados do payload do webhook.
    return json({ received: false, error: 'falha ao consultar a assinatura no Stripe' }, 500)
  }

  const houseId = sub.metadata?.house_id
  if (!houseId) {
    console.error('Assinatura do Stripe sem metadata.house_id — ignorando evento', sub.id)
    return json({ received: true, ignored: 'sem house_id' }, 200)
  }

  let params: ReturnType<typeof buildSubscriptionUpdateParams>
  try {
    params = buildSubscriptionUpdateParams(event.type, sub, knownPricesFromEnv())
  } catch (e) {
    if (e instanceof UnknownPriceError) {
      // Log detalhado (com o price_id) só no backend — a resposta HTTP não carrega
      // detalhes internos (nome de env var esperada, price_id recebido, etc.).
      console.error('price_id não configurado:', e.message)
      // Nunca mantém o tier anterior em silêncio: price_id não configurado é um erro
      // real (STRIPE_PRICE_ID_* faltando/errado) — precisa de correção manual, mas
      // respondemos 5xx (não 2xx) para deixar claro que o evento NÃO foi aplicado.
      return json({ received: false, error: 'configuração de preço inválida' }, 500)
    }
    throw e
  }

  const admin = supabaseAdmin()
  const { data, error } = await admin.rpc('process_stripe_subscription_event', {
    p_event_id: event.id,
    p_event_type: event.type,
    p_event_created_at: new Date(event.created * 1000).toISOString(),
    p_house_id: houseId,
    p_tier: params.tier,
    p_status: params.status,
    p_provider_customer_id: params.provider_customer_id,
    p_provider_subscription_id: params.provider_subscription_id,
    p_current_period_end: params.current_period_end,
  })

  if (error) {
    // Log detalhado (mensagem do Postgres, pode incluir house_id/nome de tabela) só no
    // backend — a resposta HTTP não repassa erro interno de banco para quem chamou.
    console.error('Erro na RPC process_stripe_subscription_event:', error.message)
    // Cobre tanto falha transitória de banco quanto "nenhuma assinatura encontrada para
    // essa Casa" (P0002) — em ambos os casos a transação foi desfeita por completo
    // (nenhum evento fica marcado como processado), então 5xx pedindo retentativa é
    // seguro; se for de fato um dado inconsistente (Casa sem linha em subscriptions),
    // vai falhar de novo e aparecer nos logs para investigação manual.
    return json({ received: false, error: 'falha ao processar o evento' }, 500)
  }

  const outcome = data?.[0]?.outcome as 'processed' | 'deduped' | 'stale' | undefined
  return json({ received: true, outcome }, 200)
})
