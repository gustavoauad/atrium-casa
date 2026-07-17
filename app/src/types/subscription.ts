export type SubscriptionTier = 'trial' | 'basico' | 'premium' | 'grandfathered'
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

export interface Subscription {
  house_id: string
  tier: SubscriptionTier
  status: SubscriptionStatus
  trial_ends_at: string | null
  current_period_end: string | null
}

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  trial: 'Teste grátis',
  basico: 'Básico',
  premium: 'Premium',
  grandfathered: 'Premium',
}

/** A Casa tem acesso de escrita válido agora? (mesma regra usada na RLS — house_can_write). */
export function canWriteForSubscription(sub: Subscription | null | undefined): boolean {
  if (!sub) return false
  if (sub.tier === 'grandfathered') return true
  if (sub.tier === 'trial') return !!sub.trial_ends_at && new Date(sub.trial_ends_at) > new Date()
  return sub.status === 'active'
}

/** Limite de funcionários ativos; null = ilimitado. */
export function employeeLimitForSubscription(sub: Subscription | null | undefined): number | null {
  if (sub?.tier === 'basico' && sub.status === 'active') return 5
  return null
}

/** Dias restantes de trial; null se não estiver em trial. */
export function trialDaysLeft(sub: Subscription | null | undefined): number | null {
  if (!sub || sub.tier !== 'trial' || !sub.trial_ends_at) return null
  const ms = new Date(sub.trial_ends_at).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}
