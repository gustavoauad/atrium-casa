/**
 * Verificação da assinatura do webhook do Stripe — lógica PURA (sem `Deno.*`), para
 * poder ser testada em Vitest/Node como em Deno. Só usa Web Crypto (`crypto.subtle`),
 * `TextEncoder` e `DOMException`, disponíveis nos dois runtimes. Mantida separada de
 * stripe.ts (que usa `Deno.env.get` em stripePost/stripeGet) pelo mesmo motivo de
 * logic.ts (stripe-webhook) e returnUrl.logic.ts (_shared/appUrl.ts): um arquivo que
 * referencia o global `Deno` não tipa em `tsc -b` do projeto React (sem lib do Deno) —
 * então qualquer coisa testada em Vitest precisa estar num arquivo sem essa referência.
 */

/**
 * Extrai timestamp e TODOS os valores `v1` do header `Stripe-Signature`. O Stripe pode
 * mandar mais de um `v1` no mesmo header durante rotação de segredo de webhook (uma
 * assinatura por segredo ativo); aceitar só o primeiro (como `Object.fromEntries`
 * fazia antes — chaves repetidas se sobrescrevem, sobrando só a última) rejeitava
 * webhooks legítimos assinados com o segredo "antigo" ainda válido durante a rotação.
 */
export function parseStripeSignatureHeader(signatureHeader: string): { timestamp: string | null; v1s: string[] } {
  let timestamp: string | null = null
  const v1s: string[] = []
  for (const part of signatureHeader.split(',')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key === 't') timestamp = value
    else if (key === 'v1' && value) v1s.push(value)
  }
  return { timestamp, v1s }
}

/** Comparação em tempo constante — evita vazar, via timing, quantos caracteres do
 *  início batem entre a assinatura calculada e a recebida. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Verifica a assinatura HMAC-SHA256 do webhook do Stripe (header Stripe-Signature).
 * Aceita se QUALQUER `v1` do header bater com a assinatura calculada — cobre rotação
 * de segredo, onde o Stripe manda múltiplas assinaturas (uma por segredo ativo).
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!signatureHeader) return false

  const { timestamp, v1s } = parseStripeSignatureHeader(signatureHeader)
  if (!timestamp || v1s.length === 0) return false
  if (!/^\d+$/.test(timestamp)) return false // timestamp precisa ser inteiro — nada de NaN/Infinity passando pela checagem de idade

  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (age > toleranceSeconds) return false

  const expected = await hmacSha256Hex(webhookSecret, `${timestamp}.${rawBody}`)
  return v1s.some((v1) => constantTimeEqual(expected, v1))
}
