-- Fase 1 do audit de segurança/confiabilidade (branch audit/fase-1-safety-foundation).
-- Ver supabase/AUDIT_FASE1_MIGRATIONS.md para ordem de aplicação e como testar.
--
-- Problema corrigido: deleteEmployee() (app/src/hooks/useEmployees.ts) apagava
-- events/adjustments/payments e depois employees em 4 requisições HTTP sequenciais,
-- sem transação nem checagem explícita de papel.
--
-- Por que não é um FK real com ON DELETE CASCADE (pedido pela auditoria, mas o schema
-- atual não permite com segurança): `events.emp_id`, `adjustments.emp_id` e
-- `payments.emp_id` guardam o id INTERNO do funcionário (Employee.id, gerado no client
-- via crypto.randomUUID() e salvo dentro da coluna jsonb `employees.data`) — não a
-- chave primária `employees.id` (gerada pelo Postgres). São dois espaços de UUID
-- diferentes hoje; uma FK `emp_id references employees(id)` apontaria para a coluna
-- errada e quebraria silenciosamente. Corrigir isso de verdade exige migrar
-- events/adjustments/payments.emp_id para referenciar employees.id (a chave real) —
-- mudança maior, fora do escopo "aditivo e não disruptivo" desta Fase 1. Até lá, esta
-- função é a abordagem equivalente: atômica e com a mesma checagem de autorização de
-- uma FK CASCADE (não solta os dados de quem não é dono).
--
-- Rollback: `drop function if exists public.delete_employee(uuid, text);` — o client
-- então precisa voltar ao delete sequencial anterior em useEmployees.ts.

create or replace function public.delete_employee(p_house_id uuid, p_emp_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_deleted_id uuid;
begin
  if v_user_id is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;
  if p_house_id is null or p_emp_id is null or p_emp_id = '' then
    raise exception 'house_id e emp_id são obrigatórios.' using errcode = '22023';
  end if;

  select role into v_role from public.house_members
  where house_id = p_house_id and user_id = v_user_id;

  -- Exclusão de funcionário é admin-only, igual à policy RLS atual de employees
  -- (2026-07-21-member-write-permissions-fix.sql: "DELETE continua admin-only").
  if v_role is distinct from 'owner' and v_role is distinct from 'admin' then
    raise exception 'Só o Proprietário ou Admin podem excluir funcionários.' using errcode = '42501';
  end if;

  delete from public.events where house_id = p_house_id and emp_id::text = p_emp_id;
  delete from public.adjustments where house_id = p_house_id and emp_id::text = p_emp_id;
  delete from public.payments where house_id = p_house_id and emp_id::text = p_emp_id;

  delete from public.employees
  where house_id = p_house_id and (data->>'id') = p_emp_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Funcionário não encontrado nesta Casa.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.delete_employee(uuid, text) from public;
grant execute on function public.delete_employee(uuid, text) to authenticated;
