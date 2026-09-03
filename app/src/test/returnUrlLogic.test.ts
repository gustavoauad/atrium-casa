import { describe, expect, it } from 'vitest'
import { parseOrigins, resolveReturnUrlCore } from '../../../supabase/functions/_shared/returnUrl.logic'

const APP_URL = 'https://atrium-casa.com'

describe('resolveReturnUrlCore — allowlist de return_url do Stripe', () => {
  it('sem return_url do client, usa o APP_URL do servidor', () => {
    const allowed = parseOrigins(APP_URL, '')
    expect(resolveReturnUrlCore(undefined, APP_URL, allowed)).toBe(APP_URL)
  })

  it('return_url com a mesma origem do APP_URL é aceita (preserva o path)', () => {
    const allowed = parseOrigins(APP_URL, '')
    expect(resolveReturnUrlCore('https://atrium-casa.com/app?checkout=success', APP_URL, allowed)).toBe(
      'https://atrium-casa.com/app?checkout=success',
    )
  })

  it('SEGURANÇA: return_url de um domínio arbitrário (fora da allowlist) é ignorada', () => {
    const allowed = parseOrigins(APP_URL, '')
    expect(resolveReturnUrlCore('https://atacante.evil/phish', APP_URL, allowed)).toBe(APP_URL)
  })

  it('return_url malformada é ignorada, sem lançar erro', () => {
    const allowed = parseOrigins(APP_URL, '')
    expect(resolveReturnUrlCore('não é uma url', APP_URL, allowed)).toBe(APP_URL)
  })

  it('protocolo não http(s) (ex.: javascript:) é rejeitado mesmo que a origem coincida por acaso', () => {
    const allowed = parseOrigins(APP_URL, '')
    expect(resolveReturnUrlCore('javascript:alert(1)', APP_URL, allowed)).toBe(APP_URL)
  })

  it('origem extra explicitamente permitida (ex.: localhost em dev) é aceita', () => {
    const allowed = parseOrigins(APP_URL, 'http://localhost:5173')
    expect(resolveReturnUrlCore('http://localhost:5173/app', APP_URL, allowed)).toBe('http://localhost:5173/app')
  })

  it('entrada mal formada em APP_ALLOWED_ORIGINS é ignorada sem derrubar o parse', () => {
    const allowed = parseOrigins(APP_URL, 'não-é-url, http://localhost:5173')
    expect(allowed.has('http://localhost:5173')).toBe(true)
  })
})
