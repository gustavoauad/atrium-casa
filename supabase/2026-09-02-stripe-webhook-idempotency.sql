-- Fase 1 do audit de segurança/confiabilidade (branch audit/fase-1-safety-foundation).
-- Ver supabase/AUDIT_FASE1_MIGRATIONS.md para ordem de aplicação.
--
-- Revisão externa apontou que a primeira versão desta migration só criava a tabela de
-- deduplicação, mas a Edge Function ainda fazia SELECT → UPDATE → INSERT como 3
-- chamadas separadas ao Postgres — não atômico e com condição de corrida real entre
-- entregas concorrentes do mesmo webhook (duas requisições podem passar pelo SELECT
-- antes de qualquer uma delas fazer o INSERT). Esta versão move TODA a decisão
-- (dedup, ordenação, update) para dentro de uma única função transacional, travada por
-- Casa com `pg_advisory_xact_lock`, chamada só pelo service_role (nunca por
-- `authenticated`/`anon`/`PUBLIC` — só a Edge Function, usando a service role key, deve
-- executar isto).
--
-- Política de empate/ordem (documentada aqui porque é a única fonte de verdade sobre a
-- regra): `event.created` do Stripe só tem precisão de SEGUNDO — dois eventos
-- diferentes para a mesma Casa podem legitimamente compartilhar o mesmo timestamp. Por
-- isso um evento só é considerado "stale" (obsoleto) quando for ESTRITAMENTE mais
-- antigo (`<`, nunca `<=`) que o último evento já processado para aquela Casa — um
-- empate exato NUNCA é tratado como obsoleto automaticamente. Para não depender só
-- dessa comparação de timestamp em caso de empate/ordem duvidosa, a Edge Function
-- (index.ts) SEMPRE rebusca o estado atual da assinatura direto no Stripe
-- (`GET /v1/subscriptions/:id`, ver stripeGet em _shared/stripe.ts) antes de chamar esta
-- RPC — nunca confia só no snapshot embutido no payload do webhook. Como o refetch
-- sempre traz o mesmo estado "atual" do Stripe não importa qual das entregas concorrentes
-- disparou a busca, o resultado final converge para o mesmo valor de qualquer forma,
-- mesmo com dois eventos empatados no mesmo segundo.
--
-- Rollback: `drop function if exists public.process_stripe_subscription_event(text, text,
-- timestamptz, uuid, text, text, text, text, timestamptz); drop table if exists
-- public.stripe_webhook_events;` — reverta também o commit do app que trocou
-- stripe-webhook/index.ts para chamar esta RPC (ele precisaria voltar ao
-- SELECT/UPDATE/INSERT direto).
--
-- BUG CORRIGIDO (revisão externa, 2ª rodada): `subscriptions.tier` é `NOT NULL`
-- (2026-07-17-subscriptions.sql), mas `customer.subscription.deleted` sempre chama esta
-- RPC com `p_tier = null` (cancelamento não tem plano associado) — a versão anterior
-- fazia `tier = p_tier` direto, o que violava a constraint NOT NULL e fazia TODO
-- cancelamento de assinatura falhar permanentemente (a RPC nunca chegava a `processed`,
-- só gerava erro 500 sem fim, já que reentregas do mesmo evento batiam na mesma
-- violação). Corrigido preservando o tier anterior via `coalesce(p_tier,
-- subscriptions.tier)` — qualificado com o nome da tabela para não deixar dúvida de que
-- é a COLUNA (valor já salvo), nunca o parâmetro `p_tier` (que nesse caso é null).

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  house_id uuid references public.houses(id) on delete set null,
  -- Timestamp do próprio evento no Stripe (campo `created`), não de quando chegou aqui
  -- — usado para detectar entrega fora de ordem (um evento mais antigo chegando depois
  -- de um mais novo já ter sido aplicado para a mesma Casa).
  event_created_at timestamptz not null,
  received_at timestamptz not null default now()
);

create index if not exists stripe_webhook_events_house_id_idx
  on public.stripe_webhook_events (house_id, event_created_at desc);

alter table public.stripe_webhook_events enable row level security;
-- Sem policies: RLS ativo + nenhuma policy = nega tudo para anon/authenticated.
-- O service role (Edge Function) ignora RLS por padrão no Supabase.

-- ─────────────────────────────────────────────────────────────
-- RPC transacional: dedup + ordenação + update de subscriptions + log, tudo em 1
-- transação. Só chamada pela Edge Function stripe-webhook, com a service role key.
-- ─────────────────────────────────────────────────────────────
create or replace function public.process_stripe_subscription_event(
  p_event_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_house_id uuid,
  -- null só é válido quando p_event_type = 'customer.subscription.deleted' — a Edge
  -- Function nunca deve chamar esta função com tier null para outros tipos de evento
  -- (ver UnknownPriceError em stripe-webhook/logic.ts: um price_id não mapeado deve
  -- virar erro 5xx na Edge Function, e a RPC nunca é chamada nesse caso). Quando null,
  -- o UPDATE abaixo preserva o tier anterior via coalesce — subscriptions.tier é
  -- NOT NULL, então nunca escrevemos null de fato na coluna.
  p_tier text,
  p_status text,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_current_period_end timestamptz
)
returns table(outcome text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing text;
  v_latest timestamptz;
  v_updated_rows int;
begin
  -- 1) validação de todos os argumentos.
  if p_event_id is null or length(trim(p_event_id)) = 0 then
    raise exception 'event_id é obrigatório' using errcode = '22023';
  end if;
  -- Só os 3 tipos de evento que esta RPC sabe tratar — qualquer outro texto não vazio
  -- (typo, tipo de evento novo do Stripe ainda não suportado, etc.) é rejeitado em vez
  -- de aceito silenciosamente.
  if p_event_type is null or p_event_type not in (
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted'
  ) then
    raise exception 'event_type inválido ou não suportado: %', p_event_type using errcode = '22023';
  end if;
  if p_event_created_at is null then
    raise exception 'event_created_at é obrigatório' using errcode = '22023';
  end if;
  if p_house_id is null then
    raise exception 'house_id é obrigatório' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('active', 'past_due', 'canceled') then
    raise exception 'status inválido: %', p_status using errcode = '22023';
  end if;
  if p_tier is not null and p_tier not in ('trial', 'basico', 'premium', 'grandfathered') then
    raise exception 'tier inválido: %', p_tier using errcode = '22023';
  end if;
  if p_tier is null and p_event_type <> 'customer.subscription.deleted' then
    raise exception 'tier só pode ser nulo em customer.subscription.deleted (recebido: %)', p_event_type
      using errcode = '22023';
  end if;
  -- Coerência tipo/status: um cancelamento sempre deve chegar como status='canceled' —
  -- se a Edge Function mandar outra coisa aqui, é sinal de bug na montagem dos
  -- parâmetros (buildSubscriptionUpdateParams força isso, mas a RPC não confia só nisso).
  if p_event_type = 'customer.subscription.deleted' and p_status <> 'canceled' then
    raise exception 'customer.subscription.deleted precisa vir com status=canceled (recebido: %)', p_status
      using errcode = '22023';
  end if;
  if p_provider_customer_id is null or length(trim(p_provider_customer_id)) = 0 then
    raise exception 'provider_customer_id é obrigatório' using errcode = '22023';
  end if;
  if p_provider_subscription_id is null or length(trim(p_provider_subscription_id)) = 0 then
    raise exception 'provider_subscription_id é obrigatório' using errcode = '22023';
  end if;

  -- 2) lock por Casa — serializa qualquer processamento concorrente de eventos da MESMA
  --    Casa (entregas simultâneas do mesmo evento OU de eventos diferentes). Liberado
  --    automaticamente no fim da transação (xact = só dura a transação atual).
  perform pg_advisory_xact_lock(hashtextextended(p_house_id::text, 0));

  -- 3) idempotência: mesmo event_id já visto antes → confirma sem reprocessar.
  select event_id into v_existing from public.stripe_webhook_events where event_id = p_event_id;
  if v_existing is not null then
    return query select 'deduped'::text;
    return;
  end if;

  -- 4) ordenação: só é "stale" se ESTRITAMENTE mais antigo que o último já processado
  --    para esta Casa. Empate exato (mesmo segundo) nunca é considerado obsoleto — ver
  --    nota de política no cabeçalho deste arquivo.
  select max(event_created_at) into v_latest
  from public.stripe_webhook_events
  where house_id = p_house_id;

  if v_latest is not null and p_event_created_at < v_latest then
    insert into public.stripe_webhook_events (event_id, event_type, house_id, event_created_at)
    values (p_event_id, p_event_type, p_house_id, p_event_created_at);
    return query select 'stale'::text;
    return;
  end if;

  -- 5) atualiza EXATAMENTE uma linha de subscriptions — falha (raise) se a Casa não
  --    tiver assinatura correspondente, em vez de criar uma linha nova aqui ou seguir
  --    em frente silenciosamente.
  -- coalesce(p_tier, subscriptions.tier): em customer.subscription.deleted, p_tier
  -- chega null (cancelamento não tem plano) — preserva o tier anterior em vez de tentar
  -- gravar null numa coluna NOT NULL. `subscriptions.tier` (qualificado com o nome da
  -- tabela) é sempre a COLUNA/valor já salvo — nunca o parâmetro p_tier.
  update public.subscriptions
  set
    tier = coalesce(p_tier, subscriptions.tier),
    status = p_status,
    provider = 'stripe',
    provider_customer_id = p_provider_customer_id,
    provider_subscription_id = p_provider_subscription_id,
    current_period_end = p_current_period_end,
    updated_at = now()
  where house_id = p_house_id;

  get diagnostics v_updated_rows = row_count;
  if v_updated_rows <> 1 then
    raise exception 'Nenhuma assinatura encontrada para house_id=% (esperado exatamente 1, afetado %)', p_house_id, v_updated_rows
      using errcode = 'P0002';
  end if;

  -- 6) só registra o evento como processado DEPOIS do update ter sucesso — se o update
  --    falhar (exception acima), a transação inteira desfaz (nenhum insert acontece,
  --    nenhum rollback deixa o evento marcado como processado indevidamente).
  insert into public.stripe_webhook_events (event_id, event_type, house_id, event_created_at)
  values (p_event_id, p_event_type, p_house_id, p_event_created_at);

  return query select 'processed'::text;
end;
$$;

revoke all on function public.process_stripe_subscription_event(
  text, text, timestamptz, uuid, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.process_stripe_subscription_event(
  text, text, timestamptz, uuid, text, text, text, text, timestamptz
) to service_role;
