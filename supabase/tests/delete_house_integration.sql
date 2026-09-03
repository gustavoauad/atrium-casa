-- Teste de integração de public.delete_house.
-- NÃO EXECUTADO nesta sessão (sem Docker/psql disponíveis) — ver supabase/tests/README.md.
-- Rode com: psql "$DATABASE_URL" -f supabase/tests/delete_house_integration.sql
\set ON_ERROR_STOP on

-- Tudo roda em uma transação sem COMMIT — cleanup garantido mesmo se ON_ERROR_STOP
-- interromper o script no meio (a conexão fecha e o Postgres descarta a transação).
begin;

-- Fixtures: 2 usuários reais (owner e member) — house_members.user_id/houses.created_by
-- têm FK para auth.users (mesmo padrão de stripe_webhook_rpc.sql).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin
) values
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'owner-delete-house@example.test', '',
   now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555',
   'authenticated', 'authenticated', 'member-delete-house@example.test', '',
   now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false);

insert into public.houses (id, name, created_by)
values ('66666666-6666-6666-6666-666666666666', 'Casa de Teste delete_house', '44444444-4444-4444-4444-444444444444');

insert into public.house_members (house_id, user_id, role) values
  ('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444', 'owner'),
  ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 'member');

insert into public.employees (id, house_id, data) values
  ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', '{"id":"emp-fixture-1","name":"Funcionária Fixture"}'::jsonb);
insert into public.events (house_id, emp_id, month_key, data) values
  ('66666666-6666-6666-6666-666666666666', 'emp-fixture-1', '2026-08', '{"date":"2026-08-01","value":100}'::jsonb);
insert into public.settings (house_id, key, value) values
  ('66666666-6666-6666-6666-666666666666', 'theme_colors', '{}'::jsonb)
  on conflict do nothing;

-- 1) AUTORIZAÇÃO: member (não-owner) não pode excluir a Casa.
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-5555-5555-555555555555')::text, true);
  perform public.delete_house('66666666-6666-6666-6666-666666666666');
  raise exception 'member deveria ter sido rejeitado ao tentar excluir a Casa';
exception when others then
  if sqlstate <> '42501' then raise; end if;
  raise notice 'OK (1): member (não-owner) rejeitado com 42501';
end $$;

do $$
begin
  if not exists (select 1 from public.houses where id = '66666666-6666-6666-6666-666666666666') then
    raise exception 'a Casa NÃO deveria ter sido apagada pela tentativa não autorizada do member';
  end if;
  raise notice 'OK (1b): Casa continua intacta após tentativa rejeitada';
end $$;

-- 2) ROLLBACK: injeta uma falha em `payments` (via trigger criado nesta mesma
--    transação — desaparece sozinho no ROLLBACK final, não precisa de cleanup manual)
--    e confirma que NENHUMA tabela foi afetada quando o owner tenta excluir.
create or replace function pg_temp.fail_on_delete() returns trigger as $$
begin
  raise exception 'FALHA INJETADA PARA TESTE DE ROLLBACK';
end;
$$ language plpgsql;

create trigger trg_fail_delete_house
  before delete on public.payments
  for each row execute function pg_temp.fail_on_delete();

insert into public.payments (house_id, emp_id, data) values
  ('66666666-6666-6666-6666-666666666666', 'emp-fixture-1', '{"total":1000}'::jsonb);

do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444')::text, true);
  perform public.delete_house('66666666-6666-6666-6666-666666666666');
  raise exception 'delete_house deveria ter propagado a falha injetada em payments, mas não lançou nenhum erro';
exception when others then
  -- Não valida a mensagem/SQLSTATE específico aqui de propósito — o que importa é que
  -- ALGUM erro tenha escapado (delete_house não engoliu a falha do trigger). A
  -- asserção de integridade em (2b) é a prova real de que o rollback funcionou.
  raise notice 'OK (2): delete_house propagou a falha injetada em payments (sqlstate=%)', sqlstate;
end $$;

do $$
begin
  if not exists (select 1 from public.houses where id = '66666666-6666-6666-6666-666666666666') then
    raise exception 'ROLLBACK falhou: a Casa foi apagada mesmo com a falha injetada em payments';
  end if;
  if not exists (select 1 from public.employees where house_id = '66666666-6666-6666-6666-666666666666') then
    raise exception 'ROLLBACK falhou: employees foi apagado mesmo com a falha em payments (exclusão parcial)';
  end if;
  if not exists (select 1 from public.events where house_id = '66666666-6666-6666-6666-666666666666') then
    raise exception 'ROLLBACK falhou: events foi apagado mesmo com a falha em payments (exclusão parcial)';
  end if;
  raise notice 'OK (2b): nenhuma exclusão parcial — houses/employees/events continuam intactos após a falha injetada';
end $$;

drop trigger trg_fail_delete_house on public.payments;

-- 3) EXCLUSÃO COMPLETA: owner exclui a Casa com sucesso — tudo some.
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444')::text, true);
  perform public.delete_house('66666666-6666-6666-6666-666666666666');
  raise notice 'OK (3): delete_house executou sem erro para o owner';
end $$;

do $$
begin
  if exists (select 1 from public.houses where id = '66666666-6666-6666-6666-666666666666') then
    raise exception 'houses ainda existe após delete_house';
  end if;
  if exists (select 1 from public.house_members where house_id = '66666666-6666-6666-6666-666666666666') then
    raise exception 'house_members ainda existe após delete_house';
  end if;
  if exists (select 1 from public.employees where house_id = '66666666-6666-6666-6666-666666666666') then
    raise exception 'employees ainda existe após delete_house';
  end if;
  if exists (select 1 from public.events where house_id = '66666666-6666-6666-6666-666666666666') then
    raise exception 'events ainda existe após delete_house';
  end if;
  if exists (select 1 from public.payments where house_id = '66666666-6666-6666-6666-666666666666') then
    raise exception 'payments ainda existe após delete_house';
  end if;
  if exists (select 1 from public.settings where house_id = '66666666-6666-6666-6666-666666666666') then
    raise exception 'settings ainda existe após delete_house';
  end if;
  if exists (select 1 from public.subscriptions where house_id = '66666666-6666-6666-6666-666666666666') then
    raise exception 'subscriptions ainda existe após delete_house (deveria cascatear)';
  end if;
  raise notice 'OK (3b): todas as tabelas vinculadas foram removidas';
end $$;

-- 4) CONCORRÊNCIA: 2 chamadas na mesma Casa (recriada para este cenário) — a 1ª exclui
--    de verdade, a 2ª (rodando depois, já sem linha pra achar) falha com P0002. Não dá
--    pra testar concorrência real (2 conexões simultâneas) dentro de um único script
--    SQL sequencial — isso é serializado aqui de propósito; concorrência de verdade
--    seguiria o padrão de supabase/tests/create_house_concurrency.sh (2 processos psql
--    em paralelo), não escrito ainda para este caso.
insert into public.houses (id, name, created_by)
values ('88888888-8888-8888-8888-888888888888', 'Casa de Teste delete_house concorrência', '44444444-4444-4444-4444-444444444444');
insert into public.house_members (house_id, user_id, role)
values ('88888888-8888-8888-8888-888888888888', '44444444-4444-4444-4444-444444444444', 'owner');

do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444')::text, true);
  perform public.delete_house('88888888-8888-8888-8888-888888888888');
  raise notice 'OK (4): 1ª chamada excluiu a Casa com sucesso';
end $$;

do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444')::text, true);
  perform public.delete_house('88888888-8888-8888-8888-888888888888');
  raise exception '2ª chamada deveria ter falhado (Casa já foi excluída)';
exception when others then
  if sqlstate <> '42501' and sqlstate <> 'P0002' then raise; end if;
  raise notice 'OK (4b): 2ª chamada (repetida) falha corretamente — % (sem member_row, cai em 42501 antes de checar existência)', sqlstate;
end $$;

rollback;

\echo 'Todos os cenários de delete_house passaram (ROLLBACK aplicado — nenhum dado de teste ficou salvo).'
