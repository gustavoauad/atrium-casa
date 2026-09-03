# Fase 1 do audit de segurança/confiabilidade — migrations

Branch: `audit/fase-1-safety-foundation`. Este repositório não usa o CLI de migrations
do Supabase (não há `supabase/config.toml` nem `supabase/migrations/`) — as migrations
são arquivos `.sql` datados, aplicados manualmente no SQL Editor do Supabase. Isso já
era assim antes desta Fase 1 (ver nota em `2026-07-03-owner-role.sql`); mantido para não
introduzir uma mudança de processo fora do escopo pedido.

**Nenhuma destas migrations foi aplicada em produção por esta auditoria.** Elas só
existem como arquivo neste branch — quem revisar decide quando/se aplicar.

## Ordem de aplicação

Aplique nesta ordem (cada arquivo é independente dos dois seguintes, mas todos
dependem do schema já existente em produção — `houses`, `house_members`,
`subscriptions`, `employees`, `events`, `adjustments`, `payments`, `settings`):

1. `2026-09-02-atomic-house-lifecycle.sql` — `create_house_atomic()` (com
   `pg_advisory_xact_lock` por `auth.uid()`, adicionado após revisão externa) e
   `delete_house()`.
2. `2026-09-02-atomic-employee-delete.sql` — `delete_employee()`.
3. `2026-09-02-stripe-webhook-idempotency.sql` — tabela `stripe_webhook_events` e a RPC
   transacional `process_stripe_subscription_event()` (dedup + ordenação + update, tudo
   em 1 transação com `pg_advisory_xact_lock` por `house_id` — reescrita após revisão
   externa apontar que a 1ª versão desta migration só criava a tabela, deixando a Edge
   Function fazer SELECT → UPDATE → INSERT como 3 chamadas não-atômicas).

Depois de aplicar as 3, faça o deploy das Edge Functions atualizadas (`stripe-webhook`,
`create-checkout-session`, `create-portal-session` — mudaram para usar
`resolveReturnUrl()`; `stripe-webhook` mudou para usar `stripe_webhook_events`) **antes**
ou **junto** do deploy do app com os novos hooks (`useHouses.ts`/`useEmployees.ts`
passaram a chamar as RPCs em vez de fazer delete/insert direto nas tabelas). Se o app
novo for ao ar antes das migrations, as chamadas a `create_house_atomic`/`delete_house`/
`delete_employee` vão falhar com "function does not exist" — trave o deploy do frontend
até confirmar que as 3 migrations foram aplicadas com sucesso.

## Como testar antes de produção

**Não teste contra o projeto de produção** (ref `nrlzctnwtzlcarfchmca`, visto em
`app/.env`). Use um dos dois caminhos:

- **Supabase local** (recomendado): `npx supabase init` (se ainda não houver stack
  local), `npx supabase start`, depois aplique os 3 arquivos na ordem acima via
  `psql` ou pelo SQL Editor do Studio local (`http://localhost:54323`). Rode os
  cenários abaixo contra esse ambiente.
- **Projeto de staging separado no Supabase** (um projeto novo, não o de produção):
  aplique o schema de produção primeiro (dump/replay), depois as 3 migrations, e teste
  por lá.

### Status real: unitário (executado) vs. integração (escrito, NÃO executado)

- **Testes unitários** (Vitest/Node, executados nesta sessão, sem rede/DB): funções
  puras em `app/src/lib/payroll/**` e a lógica extraída das Edge Functions
  (`app/src/test/*.test.ts` — `mapStatus`, `priceIdToTier`,
  `buildSubscriptionUpdateParams`/`UnknownPriceError`, allowlist de `return_url`).
- **Testes de integração** (`supabase/tests/*.sql` e `*.sh`, escritos nesta fase mas
  **NÃO executados** — este ambiente não tem Docker/`psql` disponíveis, e
  `supabase start` depende de Docker): cobrem exatamente os cenários abaixo, contra um
  Postgres real. Ver `supabase/tests/README.md` para como rodá-los. Não trate isso como
  "passou" até alguém rodar de fato contra um Supabase local/staging.

Cenários cobertos pelos scripts de integração (não pelos testes automatizados de CI
desta fase):

- `create_house_atomic` (`supabase/tests/create_house_concurrency.sh`): 2 chamadas
  **simultâneas** do mesmo usuário devem resultar em exatamente 1 Casa criada (o
  `pg_advisory_xact_lock` por `auth.uid()` serializa as duas), com a chamada rejeitada
  falhando pela regra certa (2ª Casa gratuita), não por falta de autenticação.
- `delete_house` (`supabase/tests/delete_house_integration.sql`): autorização
  (não-owner rejeitado com `42501`, Casa continua intacta); rollback (falha injetada
  via trigger temporário em `payments` — confirma que NADA foi apagado, nem as tabelas
  que seriam removidas antes de chegar em payments); exclusão completa (todas as
  tabelas vinculadas somem, `subscriptions` cascateia); 2 chamadas na mesma Casa em
  sequência (a 2ª falha, pois `house_members` já foi removido pela 1ª).
- `delete_employee` (`supabase/tests/delete_employee_integration.sql`): mesma
  estrutura — autorização (member rejeitado, só admin/owner passam), rollback (falha
  injetada em `payments`), exclusão completa **com funcionário de controle** (só o
  funcionário-alvo some, outro da mesma Casa fica intacto), 2 chamadas para o mesmo
  `emp_id` em sequência (a 2ª falha com `P0002`).
- `process_stripe_subscription_event` (`supabase/tests/stripe_webhook_rpc.sql`):
  evento novo (`processed`); mesmo `event_id` repetido (`deduped`, sem reaplicar);
  evento estritamente mais antigo que o último processado (`stale`, sem sobrescrever);
  **dois eventos DIFERENTES com o mesmo `event_created_at`** (empate exato — nunca vira
  `stale` automaticamente, ver política de desempate abaixo); `event_type` fora do
  enum suportado (rejeitado); `house_id`/assinatura inexistente (falha `P0002`, sem
  deixar o evento marcado como processado — rollback atômico); argumentos inválidos
  (`event_id` nulo, `tier` fora do enum, `tier` nulo fora de `deleted`, `status`
  incoerente com `deleted`); **`customer.subscription.deleted` PRESERVANDO o tier
  anterior** (bug corrigido na 2ª rodada de revisão — a versão anterior tentava gravar
  `tier=null` numa coluna `NOT NULL` e todo cancelamento falhava permanentemente) e
  mudando só o status para `canceled`; repetição do mesmo cancelamento (`deduped`).
  - `price_id` desconhecido: coberto por teste **unitário** (não de integração) — a
    checagem acontece em TypeScript antes de chamar a RPC.
  - "Assinatura inexistente no Stripe" (id que o Stripe não reconhece): é uma falha de
    rede/API na Edge Function (Deno), não testável em SQL puro — não coberta por
    nenhum teste automatizado nesta fase.

**Nenhum destes scripts foi executado contra um Postgres real em nenhuma rodada desta
Fase 1** — todos exigem `supabase/tests/` rodando contra `supabase start` (Docker) ou
staging, o que nenhuma das sessões de trabalho até agora teve disponível. Tratar como
"pronto para rodar", nunca como "passou", até alguém efetivamente executar e reportar
a saída completa.

### Política de desempate (`event.created` do Stripe tem precisão de segundo)

Documentada por completo no cabeçalho de `2026-09-02-stripe-webhook-idempotency.sql`:
um evento só é `stale` quando **estritamente** mais antigo (`<`) que o último já
processado para a mesma Casa — empate exato nunca é automaticamente obsoleto. Para não
depender só dessa comparação em caso de empate/ordem duvidosa, a Edge Function sempre
rebusca o estado ATUAL da assinatura direto no Stripe (`GET /v1/subscriptions/:id`)
antes de chamar a RPC, em vez de confiar no snapshot embutido no payload do webhook —
como o refetch sempre traz o mesmo estado "atual", o resultado final converge
independente de qual evento concorrente disparou a busca.

## Typecheck das Edge Functions no CI

`.github/workflows/ci.yml` tem um job separado (`edge-functions-typecheck`) que roda
`deno check` nos 3 entrypoints (`create-checkout-session`, `create-portal-session`,
`stripe-webhook`) — cada `deno check <entrypoint>` já segue automaticamente todo import
relativo e `npm:` a partir dali, então `_shared/*.ts` e `stripe-webhook/logic.ts` entram
no typecheck sem precisar ser listados um a um. Falha em qualquer erro de tipo/import.

- **Versão do Deno**: fixada em `2.1.4` no workflow — era a versão que
  `supabase functions serve` reportava como compatível no momento em que isto foi
  escrito (checado via busca, não contra este projeto especificamente). Confirme contra
  a saída de `supabase functions serve` do seu ambiente antes de assumir que continua
  válida — o Edge Runtime do Supabase pode mudar a versão suportada com o tempo.
- **`supabase/functions/deno.json`**: config mínima (`compilerOptions.strict: true`) —
  sem isso, `deno check` roda sem modo estrito. Não precisa de import map: os imports
  já são relativos (`./logic.ts`) ou `npm:` explícitos (`npm:@supabase/supabase-js@2`),
  que o Deno resolve nativamente.
- **Sem credenciais reais**: `deno check` é só análise estática — nunca executa as
  functions nem lê `Deno.env.get(...)` de verdade, então não precisa (e não deve
  receber) nenhum segredo configurado no CI.
- **Não executado localmente nesta sessão** — sem Deno instalado neste ambiente. O job
  está configurado e deve rodar na próxima execução do workflow no GitHub, mas isso
  ainda não foi confirmado; trate como "configurado", não como "validado", até um
  workflow run real passar.

## Rollback

Cada migration tem uma seção "Rollback" no próprio arquivo (`drop function`/
`drop table`). Se reverter uma migration, reverta também o commit do app que passou a
depender dela (`useHouses.ts`, `useEmployees.ts`, ou as Edge Functions), senão o client
chama uma função que não existe mais.

## O que NÃO mudou nesta fase

- Nenhuma tabela/coluna de `employees`/`events`/`adjustments`/`payments` foi alterada —
  `delete_employee()` é uma função equivalente a `ON DELETE CASCADE`, não uma FK real,
  porque `emp_id` nessas tabelas referencia o id interno do funcionário (dentro do jsonb
  `employees.data`), não a chave primária `employees.id` — ver comentário no topo de
  `2026-09-02-atomic-employee-delete.sql`. Migrar isso de verdade (fazer `emp_id`
  apontar pra `employees.id` e criar a FK) é uma mudança de schema maior, fora do
  escopo aditivo desta Fase 1.
- As policies de RLS existentes (não versionadas neste repositório — vivem só no
  painel do Supabase, ver nota em `2026-07-03-owner-role.sql`) não foram tocadas. As
  novas funções são `SECURITY DEFINER` e fazem sua própria checagem de autorização
  internamente, então funcionam independentemente do que essas policies permitem ou não
  — mas elas continuam existindo e valendo para qualquer outro acesso direto às tabelas.
