/**
 * Chamadas cruas à API REST do Stripe via fetch — evita depender do SDK oficial
 * (que exige empacotamento Node) dentro do runtime Deno das Edge Functions.
 */
const STRIPE_API = 'https://api.stripe.com/v1'

function toFormBody(params: Record<string, unknown>, prefix = ''): string[] {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    const k = prefix ? `${prefix}[${key}]` : key
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        const ik = `${k}[${i}]`
        if (typeof item === 'object' && item !== null) {
          parts.push(...toFormBody(item as Record<string, unknown>, ik))
        } else {
          parts.push(`${encodeURIComponent(ik)}=${encodeURIComponent(String(item))}`)
        }
      })
    } else if (typeof value === 'object') {
      parts.push(...toFormBody(value as Record<string, unknown>, k))
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(value))}`)
    }
  }
  return parts
}

export async function stripePost<T>(path: string, params: Record<string, unknown>): Promise<T> {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY não configurada')

  const res = await fetch(`${STRIPE_API}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: toFormBody(params).join('&'),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || `Stripe API error (${res.status})`)
  return json as T
}

/** Verifica a assinatura HMAC-SHA256 do webhook do Stripe (header Stripe-Signature). */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!signatureHeader) return false
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const [k, v] = p.split('=')
      return [k, v]
    }),
  )
  const timestamp = parts.t
  const v1 = parts.v1
  if (!timestamp || !v1) return false

  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (age > toleranceSeconds) return false

  const signedPayload = `${timestamp}.${rawBody}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload))
  const expected = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  if (expected.length !== v1.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i)
  return diff === 0
}
