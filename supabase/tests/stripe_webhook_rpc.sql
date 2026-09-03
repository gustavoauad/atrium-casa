-- Teste de integração de public.process_stripe_subscription_event.
-- NÃO EXECUTADO nesta sessão (sem Docker/psql disponíveis) — ver supabase/tests/README.md.
-- Rode com: psql "$DATABASE_URL" -f supabase/tests/stripe_webhook_rpc.sql
--
-- \set ON_ERROR_STOP on: qualquer erro NÃO tratado (ou seja, uma asserção que falhou de
-- verdade, não os testes negativos que já capturam a exceção esperada com
-- "exception when others") interrompe o script imediatamente com saída != 0 — sem essa
-- linha, psql seguiria para os comandos seguintes e a mensagem final de "passou" podia
-- aparecer mesmo com um teste quebrado no meio.
\set ON_ERROR_STOP on

-- Tudo roda em uma transação sem COMMIT em nenhum ponto — mesmo que ON_ERROR_STOP
-- interrompa o script no meio (erro real), a conexão do psql fecha sem commitar nada e
-- o Postgres descarta a transação sozinho. Cleanup garantido em qualquer caminho de
-- saída, não só no `rollback;` explícito do fim do arquivo.
begin;

-- Fixture de usuário: houses.created_by tem FK para auth.users, então não dá pra usar
-- gen_random_uuid() solto — precisa existir uma linha de verdade em auth.users. Este é
-- o insert mínimo usado por convenção em seeds de teste do Supabase local; os nomes de
-- coluna abaixo valem para o schema de auth padrão do Supabase — confira contra
-- `\d auth.users` no seu ambiente se a versão do GoTrue local divergir.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin
) values (
  '00000000-0000-0000-0000-000000000000',
  '33333333-3333-3333-3333-333333333333',
  'authenticated', 'authenticated', 'teste-rpc-webhook@example.test', '',
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false
);

-- Fixture: 1 Casa de teste (created_by = usuário real acima) + 1 assinatura vinculada.
-- O trigger trg_start_house_trial já cria a assinatura (tier=trial) ao inserir a
-- house; se o INSERT em subscriptions abaixo falhar por PK duplicada, é sinal de que o
-- trigger cobriu — o `on conflict do nothing` já lida com isso.
insert into public.houses (id, name, created_by)
values ('11111111-1111-1111-1111-111111111111', 'Casa de Teste RPC Webhook', '33333333-3333-3333-3333-333333333333');

insert into public.subscriptions (house_id, tier, status)
values ('11111111-1111-1111-1111-111111111111', 'trial', 'trialing')
on conflict (house_id) do nothing;

-- 1) evento novo -> processed. Deixa o tier em 'premium' (usado depois para confirmar
--    que o cancelamento preserva esse valor, não zera).
do $$
declare v_outcome text;
begin
  select outcome into v_outcome from public.process_stripe_subscription_event(
    'evt_test_1', 'customer.subscription.updated', now(),
    '11111111-1111-1111-1111-111111111111'::uuid, 'premium', 'active',
    'cus_test', 'sub_test', now() + interval '30 days'
  );
  if v_outcome <> 'processed' then
    raise exception 'esperava processed, veio %', v_outcome;
  end if;
  raise notice 'OK (1): evento novo -> processed';
end $$;

-- 2) mesmo event_id de novo, com valores DIFERENTES -> deduped, sem reaplicar.
do $$
declare v_outcome text;
begin
  select outcome into v_outcome from public.process_stripe_subscription_event(
    'evt_test_1', 'customer.subscription.updated', now(),
    '11111111-1111-1111-1111-111111111111'::uuid, 'basico', 'past_due',
    'cus_test', 'sub_test', now()
  );
  if v_outcome <> 'deduped' then raise exception 'esperava deduped, veio %', v_outcome; end if;
  if (select tier from public.subscriptions where house_id = '11111111-1111-1111-1111-111111111111') <> 'premium' then
    raise exception 'evento duplicado não deveria ter alterado o tier (deveria continuar premium)';
  end if;
  raise notice 'OK (2): mesmo event_id repetido -> deduped, sem reaplicar';
end $$;

-- 3) evento ESTRITAMENTE mais antigo que o último processado -> stale, não sobrescreve.
do $$
declare v_outcome text;
begin
  select outcome into v_outcome from public.process_stripe_subscription_event(
    'evt_test_2_antigo', 'customer.subscription.updated', now() - interval '1 hour',
    '11111111-1111-1111-1111-111111111111'::uuid, 'basico', 'past_due',
    'cus_test', 'sub_test', now()
  );
  if v_outcome <> 'stale' then raise exception 'esperava stale, veio %', v_outcome; end if;
  if (select tier from public.subscriptions where house_id = '11111111-1111-1111-1111-111111111111') <> 'premium' then
    raise exception 'evento stale não deveria ter alterado o tier';
  end if;
  raise notice 'OK (3): evento fora de ordem (mais antigo) -> stale, sem sobrescrever';
end $$;

-- 4) dois eventos DIFERENTES com o MESMO event_created_at (empate exato) -> NUNCA deve
--    virar stale automaticamente (política documentada na migration).
do $$
declare
  v_outcome text;
  v_last_created timestamptz;
begin
  select event_created_at into v_last_created from public.stripe_webhook_events where event_id = 'evt_test_1';
  select outcome into v_outcome from public.process_stripe_subscription_event(
    'evt_test_3_empate', 'customer.subscription.updated', v_last_created,
    '11111111-1111-1111-1111-111111111111'::uuid, 'premium', 'active',
    'cus_test', 'sub_test_empate', now() + interval '60 days'
  );
  if v_outcome <> 'processed' then
    raise exception 'empate exato de event_created_at NÃO deveria virar stale automaticamente, veio %', v_outcome;
  end if;
  raise notice 'OK (4): empate exato de event_created_at (evento diferente) -> processed (nunca stale só por empate)';
end $$;

-- 5) event_type fora do enum suportado -> rejeitado, sem aceitar texto arbitrário.
do $$
begin
  perform outcome from public.process_stripe_subscription_event(
    'evt_test_tipo_invalido', 'customer.subscription.trashed', now(),
    '11111111-1111-1111-1111-111111111111'::uuid, 'premium', 'active', 'cus_x', 'sub_x', now()
  );
  raise exception 'deveria ter rejeitado event_type desconhecido';
exception when others then
  if sqlstate <> '22023' then raise; end if;
  raise notice 'OK (5): event_type fora do enum suportado rejeitado (22023)';
end $$;

-- 6) house_id sem assinatura correspondente -> deve falhar com P0002, sem criar linha
--    em stripe_webhook_events (rollback atômico permite reentrega futura).
do $$
begin
  perform outcome from public.process_stripe_subscription_event(
    'evt_test_4_sem_casa', 'customer.subscription.updated', now(),
    '99999999-9999-9999-9999-999999999999'::uuid, 'premium', 'active',
    'cus_x', 'sub_x', now()
  );
  raise exception 'deveria ter lançado exceção para house_id sem assinatura correspondente';
exception
  when others then
    if sqlstate <> 'P0002' then raise; end if;
    raise notice 'OK (6): house_id sem assinatura -> exceção P0002 (nenhuma assinatura/casa correspondente)';
end $$;

do $$
begin
  if exists (select 1 from public.stripe_webhook_events where event_id = 'evt_test_4_sem_casa') then
    raise exception 'evento que falhou no update NÃO deveria estar em stripe_webhook_events (rollback incompleto)';
  end if;
  raise notice 'OK (6b): falha durante o update não deixa evento marcado como processado';
end $$;

-- 7) validação de argumentos: event_id nulo.
do $$
begin
  perform outcome from public.process_stripe_subscription_event(
    null, 'customer.subscription.updated', now(), '11111111-1111-1111-1111-111111111111'::uuid,
    'premium', 'active', 'cus_x', 'sub_x', now()
  );
  raise exception 'deveria ter rejeitado event_id nulo';
exception when others then
  if sqlstate <> '22023' then raise; end if;
  raise notice 'OK (7): event_id nulo rejeitado (22023)';
end $$;

-- 8) validação de argumentos: tier fora do enum.
do $$
begin
  perform outcome from public.process_stripe_subscription_event(
    'evt_test_5', 'customer.subscription.updated', now(), '11111111-1111-1111-1111-111111111111'::uuid,
    'tier-invalido', 'active', 'cus_x', 'sub_x', now()
  );
  raise exception 'deveria ter rejeitado tier inválido';
exception when others then
  if sqlstate <> '22023' then raise; end if;
  raise notice 'OK (8): tier inválido rejeitado (22023)';
end $$;

-- 9) validação de argumentos: tier nulo só é permitido em customer.subscription.deleted.
do $$
begin
  perform outcome from public.process_stripe_subscription_event(
    'evt_test_6', 'customer.subscription.updated', now(), '11111111-1111-1111-1111-111111111111'::uuid,
    null, 'active', 'cus_x', 'sub_x', now()
  );
  raise exception 'deveria ter rejeitado tier nulo em evento que não é deleted';
exception when others then
  if sqlstate <> '22023' then raise; end if;
  raise notice 'OK (9): tier nulo rejeitado fora de customer.subscription.deleted (22023)';
end $$;

-- 10) coerência tipo/status: customer.subscription.deleted com status != canceled.
do $$
begin
  perform outcome from public.process_stripe_subscription_event(
    'evt_test_status_incoerente', 'customer.subscription.deleted', now(), '11111111-1111-1111-1111-111111111111'::uuid,
    null, 'active', 'cus_x', 'sub_x', now()
  );
  raise exception 'deveria ter rejeitado deleted com status != canceled';
exception when others then
  if sqlstate <> '22023' then raise; end if;
  raise notice 'OK (10): customer.subscription.deleted com status incoerente rejeitado (22023)';
end $$;

-- 11) BUG CORRIGIDO: cancelamento (customer.subscription.deleted) PRESERVA o tier
--     anterior (premium, setado no passo 1/4) e só muda o status para canceled — não
--     tenta gravar tier=null numa coluna NOT NULL.
do $$
declare
  v_outcome text;
  v_tier text;
  v_status text;
begin
  select outcome into v_outcome from public.process_stripe_subscription_event(
    'evt_test_7_deleted', 'customer.subscription.deleted', now() + interval '1 minute',
    '11111111-1111-1111-1111-111111111111'::uuid, null, 'canceled', 'cus_test', 'sub_test', now()
  );
  if v_outcome <> 'processed' then raise exception 'esperava processed, veio %', v_outcome; end if;

  select tier, status into v_tier, v_status from public.subscriptions where house_id = '11111111-1111-1111-1111-111111111111';
  if v_tier <> 'premium' then
    raise exception 'cancelamento deveria PRESERVAR o tier anterior (premium), veio %', v_tier;
  end if;
  if v_status <> 'canceled' then
    raise exception 'cancelamento deveria definir status=canceled, veio %', v_status;
  end if;
  raise notice 'OK (11): customer.subscription.deleted preserva tier=premium e muda status para canceled';
end $$;

-- 12) repetição do MESMO cancelamento (mesmo event_id) -> deduped, sem reprocessar.
do $$
declare v_outcome text;
begin
  select outcome into v_outcome from public.process_stripe_subscription_event(
    'evt_test_7_deleted', 'customer.subscription.deleted', now() + interval '1 minute',
    '11111111-1111-1111-1111-111111111111'::uuid, null, 'canceled', 'cus_test', 'sub_test', now()
  );
  if v_outcome <> 'deduped' then raise exception 'esperava deduped na repetição do cancelamento, veio %', v_outcome; end if;
  raise notice 'OK (12): repetição do mesmo cancelamento -> deduped';
end $$;

rollback;

\echo 'Todos os cenários passaram (ROLLBACK aplicado — nenhum dado de teste ficou salvo).'
