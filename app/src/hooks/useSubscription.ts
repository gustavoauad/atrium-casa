import { supabase } from '../lib/supabase'
import type { Subscription } from '../types/subscription'

export async function loadSubscription(houseId: string): Promise<Subscription | null> {
  const { data, error } = await supabase.from('subscriptions').select('*').eq('house_id', houseId).maybeSingle()
  if (error) throw new Error(error.message)
  return data as Subscription | null
}

/** Abre o Checkout do Stripe pra assinar um plano pago; retorna a URL pra redirecionar. */
export async function startCheckout(houseId: string, tier: 'basico' | 'premium'): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: { house_id: houseId, tier, return_url: window.location.origin + window.location.pathname },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data.url as string
}

/** Abre o Customer Portal do Stripe (trocar cartão, cancelar, ver faturas). */
export async function openBillingPortal(houseId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-portal-session', {
    body: { house_id: houseId, return_url: window.location.origin + window.location.pathname },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data.url as string
}
