# Testes de integração — Fase 1

Estes scripts cobrem cenários que só fazem sentido contra um Postgres/Supabase real
(transações, locks, condições de corrida) — não são testáveis em Vitest/Node puro.

**Não foram executados nesta sessão**: este ambiente não tem Docker nem `psql`
disponíveis (`supabase start`, usado pelo Supabase CLI para local dev, depende de
Docker). Os scripts abaixo estão prontos para rodar, mas ninguém os rodou ainda —
trate como "a rodar antes de aplicar em produção", não como "passou".

## Como rodar

1. Suba um Supabase local: `npx supabase init` (se necessário) e `npx supabase start`
   (requer Docker). Isso expõe Postgres em `postgresql://postgres:postgres@localhost:54322/postgres`.
2. Aplique as migrations desta fase, na ordem documentada em
   `supabase/AUDIT_FASE1_MIGRATIONS.md`.
3. `psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/tests/stripe_webhook_rpc.sql`
4. `DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres" bash supabase/tests/create_house_concurrency.sh`
5. `psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/tests/delete_house_integration.sql`
6. `psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/tests/delete_employee_integration.sql`

## O que cada um cobre

- **`stripe_webhook_rpc.sql`** — `public.process_stripe_subscription_event`: evento
  novo (processed), mesmo `event_id` repetido (deduped, sem reaplicar), evento mais
  antigo que o último processado (stale, sem sobrescrever), **dois eventos DIFERENTES
  com o mesmo `event_created_at`** (empate exato — não deve virar stale automaticamente,
  ver política em `2026-09-02-stripe-webhook-idempotency.sql`), `event_type` fora do
  enum suportado (rejeitado), `house_id`/assinatura inexistente (falha `P0002`, e a
  falha não deixa o evento marcado como processado — rollback atômico), argumentos
  inválidos (`event_id` nulo, `tier` fora do enum, `tier` nulo fora de `deleted`,
  `status` incoerente com `deleted`), **cancelamento (`customer.subscription.deleted`)
  preservando o tier anterior e mudando só o status para `canceled`** (bug corrigido
  na 2ª rodada de revisão — a versão anterior tentava gravar `tier=null` numa coluna
  `NOT NULL` e todo cancelamento falhava), e **repetição do mesmo cancelamento**
  (deduped). Usa `\set ON_ERROR_STOP on` — qualquer asserção que falhe de verdade
  interrompe o script na hora (saída != 0), então a mensagem final "todos os cenários
  passaram" só aparece se tudo tiver rodado sem erro. Roda em uma transação
  `BEGIN; ... ROLLBACK;` sem nenhum `COMMIT` — mesmo que `ON_ERROR_STOP` interrompa o
  script no meio, a conexão fecha sem commitar nada e o Postgres descarta a transação
  sozinho (cleanup garantido em qualquer caminho de saída, não só no `ROLLBACK`
  explícito do fim do arquivo). Cria uma fixture real em `auth.users` (não
  `gen_random_uuid()` solto) porque `houses.created_by` tem FK para lá.
  - "Dois eventos diferentes simultâneos e fora de ordem": como o
    `pg_advisory_xact_lock` por `house_id` serializa qualquer concorrência para a
    mesma Casa, duas chamadas concorrentes reduzem-se, na prática, a duas chamadas
    sequenciais em alguma ordem — exatamente o que os cenários de "stale"/"empate"
    acima já cobrem de forma determinística. Testar a concorrência de fato (2
    conexões simultâneas) segue o mesmo padrão de `create_house_concurrency.sh`.
  - `price_id` desconhecido **não** é testado aqui — essa checagem acontece em
    TypeScript, antes da RPC ser chamada (`buildSubscriptionUpdateParams` lança
    `UnknownPriceError`), e já é coberta por teste unitário
    (`app/src/test/stripeWebhookLogic.test.ts`).
  - "Assinatura inexistente no Stripe" (id que o Stripe não reconhece) também não é
    testável aqui — é uma falha de `stripeGet()` na Edge Function (Deno/HTTP), fora do
    alcance de um script SQL.

- **`create_house_concurrency.sh`** — dispara 2 chamadas SIMULTÂNEAS de
  `create_house_atomic` para o MESMO usuário e confirma: (1) exatamente uma teve
  sucesso e a outra falhou; (2) a que falhou foi rejeitada especificamente pela regra
  de "já tem uma Casa gratuita" (não por falta de autenticação nem outro erro
  qualquer); (3) existe exatamente 1 Casa e 1 `house_members(owner)` para o usuário no
  final — graças ao `pg_advisory_xact_lock` por `auth.uid()` adicionado nesta fase.
  Corrigido na 2ª rodada de revisão: antes, `set_config(..., is_local=true)` e a
  chamada da RPC estavam em `-c` separados do mesmo comando `psql` — cada `-c` roda em
  sua própria transação autocommit, então o claim (local à transação) sumia antes da
  RPC rodar. Agora ambos vão num único `-c` com `BEGIN; ...; COMMIT;` explícito,
  garantindo a mesma transação/conexão. Também não usa mais `set -e` (uma das duas
  chamadas falhar é o resultado ESPERADO do teste), cria e remove uma fixture real em
  `auth.users` (idem ao script SQL — `house_members.user_id`/`houses.created_by` têm
  FK para lá), usa `mktemp -d` em vez de caminhos fixos em `/tmp`, e instala `trap`
  para limpar o banco mesmo se o script for interrompido no meio.

- **`delete_house_integration.sql`** — autorização (member/não-owner rejeitado com
  `42501`, Casa continua intacta), rollback (falha injetada via trigger temporário em
  `payments` — nenhuma tabela é afetada, nem as que seriam apagadas antes de chegar em
  payments), exclusão completa (todas as tabelas vinculadas somem, `subscriptions`
  cascateia), e "concorrência" sequencial (2 chamadas na mesma Casa — a 1ª exclui, a 2ª
  falha com `42501` porque `house_members` já foi removido junto, então nem chega a
  checar existência da Casa). Mesmo padrão de `\set ON_ERROR_STOP on` +
  `BEGIN;...ROLLBACK;` do script do webhook. **Nota**: o cenário de concorrência aqui é
  sequencial dentro de um único script — concorrência de verdade (2 processos `psql`
  simultâneos) seguiria o padrão de `create_house_concurrency.sh`, não implementado
  para este caso porque `delete_house` não tem uma corrida de "check-then-act" como
  `create_house_atomic` tinha (deletes concorrentes na mesma linha já serializam via
  lock de linha do Postgres).

- **`delete_employee_integration.sql`** — mesma estrutura: autorização (member
  rejeitado com `42501`, só admin/owner passam), rollback (falha injetada em
  `payments`, nada de `emp-a` é afetado), exclusão completa **com controle** (`emp-a` é
  removido por inteiro, `emp-b` — outro funcionário da mesma Casa — permanece
  intacto, provando que o escopo é por `emp_id` e não a Casa inteira), e "concorrência"
  sequencial (2 chamadas para o mesmo `emp_id` — a 2ª falha com `P0002`, funcionário
  não encontrado). Mesma nota sobre concorrência sequencial vs. real do item acima.
