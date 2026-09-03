# Atrium Casa

Aplicativo de gestão doméstica para empregadores de trabalhadores domésticos no Brasil
(babás, empregadas domésticas, diaristas, etc.): cadastro de funcionários e contratos,
folha de pagamento mensal, vale-transporte, férias/licenças, ajustes e adiantamentos,
relatórios, calculadora de rescisão e modelos de documentos trabalhistas.

> ⚠️ **Os cálculos deste app são uma ferramenta de apoio, não um substituto de
> orientação contábil/jurídica.** Confirme sempre as verbas, incidências (INSS, IRRF,
> FGTS) e o eSocial com um contador antes de efetuar qualquer pagamento ou rescisão.
> Nada aqui é um TRCT nem um documento oficial — ver `app/src/lib/payroll/rescisao.ts`
> e os avisos exibidos na Calculadora Rescisória e nos recibos.

## Arquitetura

- **`app/`** — SPA em React 19 + TypeScript + Vite, hospedada como PWA. Todo o motor
  de cálculo de folha vive em `app/src/lib/payroll/` (funções puras, sem dependência de
  UI ou de rede — ver `calc.ts`, `contracts.ts`, `inss.ts`, `rescisao.ts`, `holidays.ts`).
  Os hooks em `app/src/hooks/` são a única camada que fala com o Supabase.
- **`supabase/`** — schema, RLS, funções RPC (`SECURITY DEFINER`) e Edge Functions
  (Deno) do backend. Migrations são arquivos `.sql` datados (não usa o CLI de
  migrations do Supabase) — ver [Migrations](#migrations) abaixo. `supabase/functions/`
  contém a integração com Stripe (checkout, portal de assinatura, webhook).
- **`landing/`** — site estático de marketing (fora do app autenticado).
- Deploy: GitHub Pages, via `.github/workflows/deploy.yml` (`workflow_dispatch`
  manual) — publica `landing/` na raiz e `app/dist/` em `/app`.

### Modelo de dados (alto nível)

Cada usuário pertence a uma ou mais **Casas** (`houses`, via `house_members` com um
papel: `owner`/`admin`/`editor`/`member`/`viewer`). Dentro de uma Casa: `employees`
(funcionário + histórico de contratos, guardado como jsonb), `events` (diárias
avulsas), `adjustments` (bônus/descontos/encargos), `payments` (pagamentos lançados) e
`settings`. Assinatura/trial em `subscriptions`, sincronizada pelo webhook do Stripe.

## Configuração local

Pré-requisitos: Node >=24.15.0 (mesma faixa fixada em `.github/workflows/ci.yml` —
`jsdom@30`, usado pelos testes, exige `^22.22.2 || ^24.15.0 || >=26.0.0`; **Node 20.x
não funciona**, testado via CI real), uma conta Supabase (projeto próprio — **nunca**
use o projeto de produção para desenvolver/testar).

```bash
cd app
npm install
cp .env.example .env   # preencha com as credenciais do SEU projeto Supabase
npm run dev
```

### Variáveis de ambiente

`app/.env` (nunca commitado — está no `.gitignore`; use `app/.env.example` como
referência de quais chaves existem):

| Variável                  | Onde usar          | Descrição                                                        |
| -------------------------- | ------------------ | ------------------------------------------------------------------ |
| `VITE_SUPABASE_URL`        | `app/.env`          | URL do projeto Supabase.                                            |
| `VITE_SUPABASE_ANON_KEY`   | `app/.env`          | Chave pública (anon) do Supabase — protegida por RLS, não é secreta em si, mas ainda assim não deve ser commitada por projeto. |

Segredos do backend (Edge Functions — configurados via `supabase secrets set`, nunca em
arquivo versionado): `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_{BASICO,PREMIUM}_{MONTHLY,ANNUAL}`,
`APP_URL` (origem canônica do app, usada nos redirects pós-checkout do Stripe),
`APP_ALLOWED_ORIGINS` (opcional, CSV de origens extras permitidas — ex. localhost em
dev). Ver `supabase/SUBSCRIPTIONS_SETUP.md` e
`supabase/functions/_shared/appUrl.ts`.

## Comandos (rodar dentro de `app/`)

| Comando               | O que faz                                                                 |
| ---------------------- | -------------------------------------------------------------------------- |
| `npm run dev`           | Servidor de desenvolvimento (Vite).                                        |
| `npm run build`         | Typecheck (`tsc -b`) + build de produção.                                   |
| `npm run lint`          | Lint (oxlint).                                                              |
| `npm run test`          | Testes em modo watch (Vitest).                                             |
| `npm run test:run`      | Testes uma vez (usado no CI).                                              |
| `npm run test:coverage` | Testes com relatório de cobertura.                                          |
| `npm run preview`       | Serve o build de produção localmente.                                      |

CI (`.github/workflows/ci.yml`) roda `npm ci`, lint, typecheck+build, testes e
`npm audit` (informativo) em todo PR e push para `main`.

### Testes

`app/src/lib/payroll/**/__tests__/*.test.ts` e `app/src/test/*.test.ts` — Vitest +
Testing Library, ambiente jsdom, fuso fixado em `America/Belem` (ver
`app/vitest.config.ts`) para os testes de data serem determinísticos em qualquer
máquina/CI. **Nenhum teste depende do Supabase de produção** — são todos testes de
função pura ou de componente isolado, sem rede.

Boa parte dos testes de `app/src/lib/payroll/__tests__/` são **testes de
caracterização**: registram o comportamento atual do motor de cálculo, inclusive onde
ele pode estar juridicamente incompleto ou desatualizado (ver comentários `TODO-LEGAL`
no código e nos testes — por exemplo, as tabelas de INSS/IRRF em `inss.ts` são de 2024).
Eles existem para impedir regressões silenciosas, não como prova de que os valores
calculados batem com a legislação vigente — isso ainda depende de revisão
contábil/jurídica periódica.

## Migrations

Não há `supabase/migrations/` nem `supabase/config.toml` — as mudanças de schema/RLS
vivem como arquivos `.sql` datados (`supabase/AAAA-MM-DD-descrição.sql`), aplicados
manualmente no SQL Editor do Supabase, na ordem cronológica dos nomes de arquivo. Cada
arquivo novo traz, no cabeçalho: o que corrige, como reverter, e (quando relevante) como
testar antes de ir para produção. Ver `supabase/AUDIT_FASE1_MIGRATIONS.md` para o
detalhamento da leva de migrations mais recente (funções RPC transacionais para
criar/excluir Casa e excluir funcionário; idempotência do webhook do Stripe).

**Nunca aplique uma migration nova direto em produção sem antes rodá-la contra um
projeto Supabase local (`npx supabase start`) ou de staging.**

## Segurança

- RLS habilitado em todas as tabelas com dado de Casa; parte das policies vive apenas
  no painel do Supabase (não versionada neste repositório — ver nota em
  `supabase/2026-07-03-owner-role.sql`).
- Operações destrutivas/atômicas (criar Casa, excluir Casa, excluir funcionário) usam
  funções `SECURITY DEFINER` que validam `auth.uid()` e papel dentro do próprio banco,
  em vez de sequências de delete/insert feitas pelo client.
- Webhook do Stripe verifica a assinatura HMAC, é idempotente (deduplicação por
  `event.id`) e rejeita eventos entregues fora de ordem — ver
  `supabase/functions/stripe-webhook/`.
