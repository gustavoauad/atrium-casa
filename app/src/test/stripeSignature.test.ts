import { describe, expect, it } from 'vitest'
import { constantTimeEqual, parseStripeSignatureHeader, verifyStripeSignature } from '../../../supabase/functions/_shared/signature.logic'

const SECRET = 'whsec_test_secret'
const BODY = '{"id":"evt_123","type":"customer.subscription.updated"}'

/** Assina como o Stripe assinaria — usada só para montar fixtures de teste, não é a
 *  função sob teste (essa é `verifyStripeSignature`, importada acima). */
async function sign(secret: string, timestamp: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

describe('parseStripeSignatureHeader', () => {
  it('extrai timestamp e um único v1', () => {
    const { timestamp, v1s } = parseStripeSignatureHeader('t=1700000000,v1=abc123')
    expect(timestamp).toBe('1700000000')
    expect(v1s).toEqual(['abc123'])
  })

  it('extrai TODOS os v1 quando há múltiplos (rotação de segredo)', () => {
    const { timestamp, v1s } = parseStripeSignatureHeader('t=1700000000,v1=old_sig,v1=new_sig')
    expect(timestamp).toBe('1700000000')
    expect(v1s).toEqual(['old_sig', 'new_sig'])
  })

  it('ignora v0/outros esquemas de assinatura desconhecidos', () => {
    const { v1s } = parseStripeSignatureHeader('t=1700000000,v0=irrelevante,v1=abc')
    expect(v1s).toEqual(['abc'])
  })
})

describe('constantTimeEqual', () => {
  it('true para strings idênticas', () => {
    expect(constantTimeEqual('abc123', 'abc123')).toBe(true)
  })
  it('false para tamanhos diferentes ou conteúdo diferente', () => {
    expect(constantTimeEqual('abc', 'abcd')).toBe(false)
    expect(constantTimeEqual('abc123', 'abc124')).toBe(false)
  })
})

describe('verifyStripeSignature', () => {
  it('aceita uma assinatura única válida', async () => {
    const ts = Math.floor(Date.now() / 1000)
    const v1 = await sign(SECRET, ts, BODY)
    const header = `t=${ts},v1=${v1}`
    expect(await verifyStripeSignature(BODY, header, SECRET)).toBe(true)
  })

  it('SEGURANÇA (rotação de segredo): aceita quando há MÚLTIPLOS v1 e apenas um bate', async () => {
    const ts = Math.floor(Date.now() / 1000)
    const validV1 = await sign(SECRET, ts, BODY)
    const header = `t=${ts},v1=assinatura_de_outro_segredo,v1=${validV1}`
    expect(await verifyStripeSignature(BODY, header, SECRET)).toBe(true)
  })

  it('rejeita quando NENHUM v1 bate', async () => {
    const ts = Math.floor(Date.now() / 1000)
    const header = `t=${ts},v1=nao_bate_1,v1=nao_bate_2`
    expect(await verifyStripeSignature(BODY, header, SECRET)).toBe(false)
  })

  it('rejeita timestamp inválido (não numérico)', async () => {
    const v1 = await sign(SECRET, Math.floor(Date.now() / 1000), BODY)
    const header = `t=nao-e-um-numero,v1=${v1}`
    expect(await verifyStripeSignature(BODY, header, SECRET)).toBe(false)
  })

  it('rejeita timestamp fora da tolerância (replay de um webhook antigo)', async () => {
    const oldTs = Math.floor(Date.now() / 1000) - 3600 // 1h atrás, tolerância padrão é 300s
    const v1 = await sign(SECRET, oldTs, BODY)
    const header = `t=${oldTs},v1=${v1}`
    expect(await verifyStripeSignature(BODY, header, SECRET)).toBe(false)
  })

  it('rejeita payload alterado após a assinatura ser calculada', async () => {
    const ts = Math.floor(Date.now() / 1000)
    const v1 = await sign(SECRET, ts, BODY)
    const header = `t=${ts},v1=${v1}`
    const bodyAdulterado = BODY.replace('updated', 'deleted')
    expect(await verifyStripeSignature(bodyAdulterado, header, SECRET)).toBe(false)
  })

  it('rejeita quando o header de assinatura está ausente', async () => {
    expect(await verifyStripeSignature(BODY, null, SECRET)).toBe(false)
  })

  it('rejeita quando o header não tem v1 nenhum', async () => {
    const ts = Math.floor(Date.now() / 1000)
    expect(await verifyStripeSignature(BODY, `t=${ts}`, SECRET)).toBe(false)
  })
})
