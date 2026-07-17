# Assinaturas — guia de ativação

Este documento cobre a parte que só você consegue fazer (conta do Stripe, segredos,
deploy das Edge Functions). O código já está pronto no repositório.

## 1. Rodar o SQL

No SQL Editor do Supabase, rode `supabase/2026-07-17-subscriptions.sql` (nessa ordem,
depois dos outros scripts já aplicados anteriormente). Ele:

- Cria a tabela `subscriptions`.
- Faz o **grandfathering** das Casas já existentes (ficam com acesso ilimitado, de graça,
  pra sempre).
- Cria o trigger que dá 14 dias de trial pra toda Casa nova daqui pra frente.
- Adiciona as funções e políticas de RLS que travam escrita quando a Casa não tem
  assinatura válida, e o limite de 5 funcionários do plano Básico.

## 2. Criar os produtos no Stripe

No [Dashboard do Stripe](https://dashboard.stripe.com/test/products) (comece em **modo
de teste/sandbox**), cada plano é **1 produto com 2 Prices** (mensal e anual):

| Produto | Price mensal | Price anual |
|---|---|---|
| Atrium Casa — Básico | R$ 19,90/mês | R$ 199,00/ano |
| Atrium Casa — Premium | R$ 39,90/mês | R$ 399,00/ano |

Anote os **4 Price IDs** (`price_...`) — um pra cada combinação plano × período.

## 3. Configurar os segredos das Edge Functions

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são injetados
automaticamente pelo Supabase — não precisa configurar. Defina só estes:

```bash
npx supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_PRICE_ID_BASICO_MONTHLY=price_... \
  STRIPE_PRICE_ID_BASICO_ANNUAL=price_... \
  STRIPE_PRICE_ID_PREMIUM_MONTHLY=price_... \
  STRIPE_PRICE_ID_PREMIUM_ANNUAL=price_... \
  APP_URL=https://atrium-casa.com \
  --project-ref SEU_PROJECT_REF
```

(`STRIPE_WEBHOOK_SECRET` vem no passo 5, depois de criar o endpoint do webhook.)

## 4. Deploy das Edge Functions

```bash
npx supabase functions deploy create-checkout-session --project-ref SEU_PROJECT_REF
npx supabase functions deploy create-portal-session --project-ref SEU_PROJECT_REF
npx supabase functions deploy stripe-webhook --project-ref SEU_PROJECT_REF --no-verify-jwt
```

O `--no-verify-jwt` no webhook é obrigatório — quem chama essa function é o Stripe, não
um usuário logado do app, então ela não pode exigir JWT do Supabase.

## 5. Criar o endpoint de webhook no Stripe

No Dashboard do Stripe → **Developers → Webhooks → Add endpoint**:

- URL: `https://SEU_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
- Eventos: `customer.subscription.created`, `customer.subscription.updated`,
  `customer.subscription.deleted`
- Copie o **Signing secret** (`whsec_...`) gerado e defina:

```bash
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_... --project-ref SEU_PROJECT_REF
```

## 6. Testar em modo de teste

Use os [cartões de teste do Stripe](https://docs.stripe.com/testing#cards)
(ex: `4242 4242 4242 4242`, qualquer data futura/CVC) pra assinar um plano pela aba
Casa → Assinatura e confirmar que o status atualiza depois do checkout.

## 7. Ir pra produção

Repita os passos 2–5 com as chaves e produtos do **modo live** do Stripe (chaves
`sk_live_...`, novo webhook endpoint apontando pro mesmo projeto, novo
`whsec_...` — o Stripe usa segredos de webhook diferentes por modo).

## Limitações conhecidas / próximos passos

- **Apple/Google IAP**: o schema já tem a coluna `provider` pronta, mas a implementação
  real de compra pelas lojas só é possível depois que o app virar um wrapper nativo
  (projeto em stand-by).
- **Dunning**: hoje `invoice.payment_failed` não é tratado — a Casa só é travada quando o
  Stripe efetivamente cancela a assinatura (`customer.subscription.deleted`) ou quando o
  status da assinatura já não é `active`/`trialing`. Se quiser um período de graça mais
  granular em caso de cartão recusado, dá pra escutar `invoice.payment_failed` também.
- **Gestão de membros durante bloqueio**: o travamento de escrita cobre
  funcionários/folha/relatórios/configurações; convidar ou remover membros
  (`house_members`) não foi travado — decisão deliberada pra manter o escopo simples.
