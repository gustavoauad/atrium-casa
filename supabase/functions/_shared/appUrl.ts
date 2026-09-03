import { parseOrigins, resolveReturnUrlCore } from './returnUrl.logic.ts'

/**
 * Resolve a URL de retorno pós-checkout/portal do Stripe sem confiar cegamente no que
 * o client manda. Antes, create-checkout-session e create-portal-session usavam
 * `return_url` do corpo da requisição diretamente como base de success_url/cancel_url/
 * return_url do Stripe — qualquer chamador autenticado podia mandar um domínio
 * arbitrário e fazer o Stripe redirecionar o usuário pra lá depois do pagamento
 * (abre espaço pra phishing logo após uma tela de cobrança real).
 *
 * Agora só aceita `return_url` se a origem bater com a allowlist (APP_URL + origens
 * extras opcionais em APP_ALLOWED_ORIGINS, ex.: "http://localhost:5173" em dev); caso
 * contrário ignora silenciosamente e cai no APP_URL configurado no servidor.
 */
const DEFAULT_APP_URL = 'https://atrium-casa.com'

export function resolveReturnUrl(candidate: unknown): string {
  const appUrl = Deno.env.get('APP_URL') || DEFAULT_APP_URL
  const allowed = parseOrigins(appUrl, Deno.env.get('APP_ALLOWED_ORIGINS') || '')
  return resolveReturnUrlCore(candidate, appUrl, allowed)
}
