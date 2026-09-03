import { describe, expect, it } from 'vitest'
import {
  buildSubscriptionUpdateParams,
  mapStatus,
  priceIdToTier,
  UnknownPriceError,
  type StripeSubscriptionLike,
} from '../../../supabase/functions/stripe-webhook/logic'

/**
 * Testes UNITÁRIOS (executados via Vitest/Node) da lógica PURA do webhook do Stripe
 * (supabase/functions/stripe-webhook/logic.ts). O handler HTTP completo (index.ts) roda
 * em Deno, depende de I/O real com Stripe/Supabase (assinatura, refetch da assinatura,
 * chamada da RPC transacional) e NÃO é exercitado aqui — isso exigiria um teste de
 * integração contra Postgres local, não disponível neste ambiente (sem Docker). A
 * dedução/ordenação de eventos (duplicado, fora de ordem, empate) também não é testada
 * aqui porque não vive mais em JS — foi movida para dentro da RPC
 * `public.process_stripe_subscription_event`, coberta por
 * supabase/tests/stripe_webhook_rpc.sql (script de integração, não executado nesta
 * sessão — ver relatório da Fase 1).
 */
describe('mapStatus', () => {
  it('active/trialing → active', () => {
    expect(mapStatus('active')).toBe('active')
    expect(mapStatus('trialing')).toBe('active')
  })
  it('past_due/unpaid/incomplete → past_due', () => {
    expect(mapStatus('past_due')).toBe('past_due')
    expect(mapStatus('unpaid')).toBe('past_due')
    expect(mapStatus('incomplete')).toBe('past_due')
  })
  it('qualquer outro status → canceled', () => {
    expect(mapStatus('canceled')).toBe('canceled')
    expect(mapStatus('algo-desconhecido')).toBe('canceled')
  })
})

describe('priceIdToTier', () => {
  const known = { price_basico: 'basico', price_premium: 'premium' } as const

  it('resolve um price_id conhecido', () => {
    expect(priceIdToTier('price_basico', known)).toBe('basico')
  })
  it('price_id desconhecido retorna null', () => {
    expect(priceIdToTier('price_outro', known)).toBeNull()
  })
  it('price_id undefined retorna null', () => {
    expect(priceIdToTier(undefined, known)).toBeNull()
  })
})

describe('buildSubscriptionUpdateParams', () => {
  const sub: StripeSubscriptionLike = {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    current_period_end: 1786800000,
    items: { data: [{ price: { id: 'price_premium' } }] },
  }
  const known = { price_premium: 'premium' } as const

  it('subscription.updated/created resolvem tier e status a partir do objeto atual', () => {
    const out = buildSubscriptionUpdateParams('customer.subscription.updated', sub, known)
    expect(out.tier).toBe('premium')
    expect(out.status).toBe('active')
    expect(out.provider_subscription_id).toBe('sub_1')
    expect(out.current_period_end).toBe(new Date(1786800000 * 1000).toISOString())
  })

  it('subscription.deleted força tier=null e status=canceled, mesmo com price/status ainda "ativos" no objeto', () => {
    const out = buildSubscriptionUpdateParams('customer.subscription.deleted', sub, known)
    expect(out.tier).toBeNull()
    expect(out.status).toBe('canceled')
  })

  it('SEGURANÇA: price_id desconhecido em evento não-deleted lança UnknownPriceError — nunca mantém tier anterior em silêncio', () => {
    const subComPriceDesconhecido: StripeSubscriptionLike = {
      ...sub,
      items: { data: [{ price: { id: 'price_nao_configurado' } }] },
    }
    expect(() => buildSubscriptionUpdateParams('customer.subscription.updated', subComPriceDesconhecido, known)).toThrow(
      UnknownPriceError,
    )
    expect(() => buildSubscriptionUpdateParams('customer.subscription.created', subComPriceDesconhecido, known)).toThrow(
      UnknownPriceError,
    )
  })

  it('price_id desconhecido em evento deleted NÃO lança — deleted nunca depende do price', () => {
    const subComPriceDesconhecido: StripeSubscriptionLike = {
      ...sub,
      items: { data: [{ price: { id: 'price_nao_configurado' } }] },
    }
    expect(() => buildSubscriptionUpdateParams('customer.subscription.deleted', subComPriceDesconhecido, known)).not.toThrow()
  })
})
