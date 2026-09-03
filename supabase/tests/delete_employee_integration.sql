-- Teste de integração de public.delete_employee.
-- NÃO EXECUTADO nesta sessão (sem Docker/psql disponíveis) — ver supabase/tests/README.md.
-- Rode com: psql "$DATABASE_URL" -f supabase/tests/delete_employee_integration.sql
\set ON_ERROR_STOP on

-- Tudo roda em uma transação sem COMMIT — cleanup garantido mesmo se ON_ERROR_STOP
-- interromper o script no meio.
begin;

-- Fixtures: 3 usuários reais (owner, admin, member — delete_employee é admin-only,
-- então member serve pra provar que NÃO basta ser membro comum).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin
) values
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999991',
   'authenticated', 'authenticated', 'owner-delete-emp@example.test', '',
   now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999992',
   'authenticated', 'authenticated', 'admin-delete-emp@example.test', '',
   now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999993',
   'authenticated', 'authenticated', 'member-delete-emp@example.test', '',
   now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false);

insert into public.houses (id, name, created_by)
values ('11111111-2222-3333-4444-555555555555', 'Casa de Teste delete_employee', '99999999-9999-9999-9999-999999999991');

insert into public.house_members (house_id, user_id, role) values
  ('11111111-2222-3333-4444-555555555555', '99999999-9999-9999-9999-999999999991', 'owner'),
  ('11111111-2222-3333-4444-555555555555', '99999999-9999-9999-9999-999999999992', 'admin'),
  ('11111111-2222-3333-4444-555555555555', '99999999-9999-9999-9999-999999999993', 'member');

-- Funcionário A (o que vamos tentar excluir) e Funcionário B (controle — precisa
-- sobreviver intacto a todos os cenários, prova que o delete é escopado por emp_id).
insert into public.employees (id, house_id, data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-2222-3333-4444-555555555555', '{"id":"emp-a","name":"Funcionária A"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-2222-3333-4444-555555555555', '{"id":"emp-b","name":"Funcionária B"}'::jsonb);

insert into public.events (house_id, emp_id, month_key, data) values
  ('11111111-2222-3333-4444-555555555555', 'emp-a', '2026-08', '{"date":"2026-08-01","value":100}'::jsonb),
  ('11111111-2222-3333-4444-555555555555', 'emp-b', '2026-08', '{"date":"2026-08-01","value":200}'::jsonb);
insert into public.adjustments (house_id, emp_id, data) values
  ('11111111-2222-3333-4444-555555555555', 'emp-a', '{"type":"bonus","value":50}'::jsonb),
  ('11111111-2222-3333-4444-555555555555', 'emp-b', '{"type":"bonus","value":60}'::jsonb);
insert into public.payments (house_id, emp_id, data) values
  ('11111111-2222-3333-4444-555555555555', 'emp-a', '{"total":1000}'::jsonb),
  ('11111111-2222-3333-4444-555555555555', 'emp-b', '{"total":2000}'::jsonb);

-- 1) AUTORIZAÇÃO: member não pode excluir funcionário (delete_employee é admin-only).
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '99999999-9999-9999-9999-999999999993')::text, true);
  perform public.delete_employee('11111111-2222-3333-4444-555555555555'::uuid, 'emp-a');
  raise exception 'member deveria ter sido rejeitado ao tentar excluir funcionário';
exception when others then
  if sqlstate <> '42501' then raise; end if;
  raise notice 'OK (1): member rejeitado com 42501 (delete_employee é admin/owner-only)';
end $$;

do $$
begin
  if not exists (select 1 from public.employees where id = 'aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'emp-a NÃO deveria ter sido apagado pela tentativa não autorizada do member';
  end if;
  raise notice 'OK (1b): emp-a continua intacto após tentativa rejeitada';
end $$;

-- 2) ROLLBACK: injeta falha em `payments` e confirma que nada foi removido (nem os
--    events/adjustments de emp-a que seriam apagados antes de chegar em payments).
create or replace function pg_temp.fail_on_delete_emp() returns trigger as $$
begin
  raise exception 'FALHA INJETADA PARA TESTE DE ROLLBACK (delete_employee)';
end;
$$ language plpgsql;

create trigger trg_fail_delete_employee
  before delete on public.payments
  for each row execute function pg_temp.fail_on_delete_emp();

do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '99999999-9999-9999-9999-999999999992')::text, true);
  perform public.delete_employee('11111111-2222-3333-4444-555555555555'::uuid, 'emp-a');
  raise exception 'delete_employee deveria ter propagado a falha injetada em payments';
exception when others then
  raise notice 'OK (2): delete_employee propagou a falha injetada em payments (sqlstate=%)', sqlstate;
end $$;

do $$
begin
  if not exists (select 1 from public.employees where id = 'aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'ROLLBACK falhou: emp-a foi apagado mesmo com a falha injetada em payments';
  end if;
  if not exists (select 1 from public.events where house_id = '11111111-2222-3333-4444-555555555555' and emp_id = 'emp-a') then
    raise exception 'ROLLBACK falhou: events de emp-a foi apagado mesmo com a falha em payments (exclusão parcial)';
  end if;
  if not exists (select 1 from public.adjustments where house_id = '11111111-2222-3333-4444-555555555555' and emp_id = 'emp-a') then
    raise exception 'ROLLBACK falhou: adjustments de emp-a foi apagado mesmo com a falha em payments (exclusão parcial)';
  end if;
  raise notice 'OK (2b): nenhuma exclusão parcial — employees/events/adjustments de emp-a continuam intactos';
end $$;

drop trigger trg_fail_delete_employee on public.payments;

-- 3) EXCLUSÃO COMPLETA: admin exclui emp-a com sucesso — só emp-a some, emp-b (controle)
--    fica intacto (prova que o escopo é por emp_id, não a Casa inteira).
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '99999999-9999-9999-9999-999999999992')::text, true);
  perform public.delete_employee('11111111-2222-3333-4444-555555555555'::uuid, 'emp-a');
  raise notice 'OK (3): delete_employee executou sem erro para o admin';
end $$;

do $$
begin
  if exists (select 1 from public.employees where id = 'aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'emp-a ainda existe após delete_employee';
  end if;
  if exists (select 1 from public.events where house_id = '11111111-2222-3333-4444-555555555555' and emp_id = 'emp-a') then
    raise exception 'events de emp-a ainda existe após delete_employee';
  end if;
  if exists (select 1 from public.adjustments where house_id = '11111111-2222-3333-4444-555555555555' and emp_id = 'emp-a') then
    raise exception 'adjustments de emp-a ainda existe após delete_employee';
  end if;
  if exists (select 1 from public.payments where house_id = '11111111-2222-3333-4444-555555555555' and emp_id = 'emp-a') then
    raise exception 'payments de emp-a ainda existe após delete_employee';
  end if;
  -- Controle: emp-b não pode ter sido tocado.
  if not exists (select 1 from public.employees where id = 'aaaaaaaa-0000-0000-0000-000000000002') then
    raise exception 'emp-b (controle) foi apagado por engano — delete_employee vazou pro funcionário errado';
  end if;
  if (select count(*) from public.events where house_id = '11111111-2222-3333-4444-555555555555' and emp_id = 'emp-b') <> 1 then
    raise exception 'events de emp-b (controle) foi afetado por engano';
  end if;
  raise notice 'OK (3b): emp-a totalmente removido; emp-b (controle) permanece intacto';
end $$;

-- 4) CONCORRÊNCIA: 2 chamadas para o MESMO emp_id (emp-b) — a 1ª exclui de verdade, a
--    2ª (rodando depois) falha com P0002 por já não encontrar o funcionário. Mesma
--    ressalva de delete_house_integration.sql: concorrência de verdade (2 conexões
--    simultâneas) seguiria o padrão de create_house_concurrency.sh, não escrito para
--    este caso — aqui a serialização é sequencial dentro de um único script.
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '99999999-9999-9999-9999-999999999991')::text, true);
  perform public.delete_employee('11111111-2222-3333-4444-555555555555'::uuid, 'emp-b');
  raise notice 'OK (4): 1ª chamada excluiu emp-b com sucesso';
end $$;

do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '99999999-9999-9999-9999-999999999991')::text, true);
  perform public.delete_employee('11111111-2222-3333-4444-555555555555'::uuid, 'emp-b');
  raise exception '2ª chamada deveria ter falhado (emp-b já foi excluído)';
exception when others then
  if sqlstate <> 'P0002' then raise; end if;
  raise notice 'OK (4b): 2ª chamada (repetida) falha corretamente com P0002 (funcionário não encontrado)';
end $$;

rollback;

\echo 'Todos os cenários de delete_employee passaram (ROLLBACK aplicado — nenhum dado de teste ficou salvo).'
