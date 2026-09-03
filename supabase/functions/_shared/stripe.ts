/**
 * Chamadas cruas à API REST do Stripe via fetch — evita depender do SDK oficial
 * (que exige empacotamento Node) dentro do runtime Deno das Edge Functions.
 */
export { constantTimeEqual, parseStripeSignatureHeader, verifyStripeSignature } from './signature.logic.ts'

const STRIPE_API = 'https://api.stripe.com/v1'

/** Tempo máximo de espera por uma resposta do Stripe antes de desistir e deixar o
 *  caller decidir o que fazer (no stripe-webhook, isso vira 5xx → Stripe reentrega). */
const STRIPE_REQUEST_TIMEOUT_MS = 8000

/** Erro de rede/timeout/HTTP ao falar com o Stripe — a mensagem em si nunca inclui a
 *  resposta crua do Stripe (pode ter detalhes internos da conta); o corpo original,
 *  quando disponível, vai em `cause` (padrão ES2022) — destinado a `console.error` no
 *  backend, nunca a ser repassado numa resposta HTTP para quem chamou o webhook. */
export class StripeApiError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'StripeApiError'
  }
}

/** `res.json()` mas sem lançar um erro genérico do parser quando o Stripe (ou uma
 *  falha de borda/proxy) devolve algo que não é JSON — transforma em StripeApiError
 *  com contexto (status HTTP), sem vazar o corpo cru na mensagem. */
async function parseJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch (e) {
    throw new StripeApiError(`Resposta do Stripe não é JSON válido (status ${res.status})`, e)
  }
}

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
  if (!secretKey) throw new StripeApiError('STRIPE_SECRET_KEY não configurada')

  let res: Response
  try {
    res = await fetch(`${STRIPE_API}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: toFormBody(params).join('&'),
      signal: AbortSignal.timeout(STRIPE_REQUEST_TIMEOUT_MS),
    })
  } catch (e) {
    throw new StripeApiError(
      e instanceof DOMException && e.name === 'TimeoutError' ? `Timeout consultando o Stripe (${path})` : `Falha de rede consultando o Stripe (${path})`,
      e,
    )
  }
  const json = (await parseJsonResponse(res)) as { error?: { message?: string } }
  if (!res.ok) throw new StripeApiError(`Stripe API error (${res.status}) em ${path}`, json)
  return json as T
}

/**
 * Busca o estado ATUAL de um objeto no Stripe (ex.: `subscriptions/sub_123`) em vez de
 * confiar só no snapshot embutido no payload do webhook. Usado no stripe-webhook para
 * sempre persistir a verdade mais recente do Stripe, independente da ordem de entrega
 * dos eventos — elimina a necessidade de tratar caso a caso "evento empatado/fora de
 * ordem": não importa qual evento chegou por último, o refetch sempre traz o mesmo
 * estado atual, então o resultado final converge para o mesmo valor de qualquer forma.
 *
 * Custo dessa escolha (documentado, não "corrigido" — é uma troca deliberada): o
 * webhook passa a depender da disponibilidade do Stripe além da entrega do próprio
 * evento — se `GET /v1/subscriptions/:id` falhar (rede, timeout, Stripe fora do ar),
 * stripe-webhook/index.ts responde 5xx, o que faz o Stripe reentregar mais tarde. Uma
 * assinatura cancelada continua retornável por id (só some de endpoints de listagem),
 * então cancelamento não é um caso especial aqui.
 */
export async function stripeGet<T>(path: string): Promise<T> {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!secretKey) throw new StripeApiError('STRIPE_SECRET_KEY não configurada')

  let res: Response
  try {
    res = await fetch(`${STRIPE_API}/${path}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(STRIPE_REQUEST_TIMEOUT_MS),
    })
  } catch (e) {
    throw new StripeApiError(
      e instanceof DOMException && e.name === 'TimeoutError' ? `Timeout consultando o Stripe (${path})` : `Falha de rede consultando o Stripe (${path})`,
      e,
    )
  }
  const json = (await parseJsonResponse(res)) as { error?: { message?: string } }
  if (!res.ok) throw new StripeApiError(`Stripe API error (${res.status}) em ${path}`, json)
  return json as T
}
