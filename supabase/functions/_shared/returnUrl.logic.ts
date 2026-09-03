/**
 * Lógica pura de resolução de return_url — sem `Deno.*`, testável em Vitest/Node.
 * Ver appUrl.ts para o wrapper que lê APP_URL/APP_ALLOWED_ORIGINS do ambiente Deno.
 */
export function parseOrigins(appUrl: string, extraOriginsCsv: string): Set<string> {
  const extra = extraOriginsCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const origins = new Set<string>()
  for (const url of [appUrl, ...extra]) {
    try {
      origins.add(new URL(url).origin)
    } catch {
      // Ignora entrada mal formada — não deve derrubar a function.
    }
  }
  return origins
}

/**
 * Decide qual URL usar como success_url/cancel_url/return_url do Stripe: a candidata
 * enviada pelo client SÓ é aceita se a origem estiver na allowlist; caso contrário
 * (ausente, malformada, protocolo não http(s), ou origem fora da allowlist) cai no
 * `appUrl` configurado no servidor.
 */
export function resolveReturnUrlCore(candidate: unknown, appUrl: string, allowed: Set<string>): string {
  if (typeof candidate !== 'string' || !candidate) return appUrl

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return appUrl
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return appUrl
  if (!allowed.has(parsed.origin)) return appUrl

  return parsed.toString()
}
