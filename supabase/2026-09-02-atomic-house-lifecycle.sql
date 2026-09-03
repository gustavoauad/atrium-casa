-- Fase 1 do audit de segurança/confiabilidade (branch audit/fase-1-safety-foundation).
-- Ver supabase/AUDIT_FASE1_MIGRATIONS.md para ordem de aplicação, como testar contra
-- um projeto local/staging antes de produção, e estratégia de rollback.
--
-- Problemas corrigidos nesta migration:
--
--   1) createHouse() (app/src/hooks/useHouses.ts) fazia 2 inserts separados — houses,
--      depois house_members — em requisições HTTP distintas, sem transação. Se o 2º
--      falhasse (rede, RLS, etc.), sobrava uma Casa sem nenhum owner: "órfã", que
--      ninguém conseguia mais acessar nem excluir pelo app.
--   2) createHouse() recebia `userId` do frontend e confiava nele para popular
--      house_members.user_id — trocado por auth.uid() resolvido no banco.
--   3) deleteHouse() fazia 6 deletes sequenciais pelo client (events, adjustments,
--      payments, employees, settings, house_members, houses), cada um uma transação
--      própria, sem checagem explícita de papel — dependia inteiramente de policies de
--      DELETE por tabela que não são versionadas neste repositório. Uma falha no meio
--      deixava dado órfão (ex.: employees apagados mas payments não).
--   4) (revisão externa) create_house_atomic ainda tinha uma corrida possível: duas
--      chamadas concorrentes do MESMO usuário podiam passar as duas por
--      user_can_create_house() antes de qualquer uma commitar seu house_members(owner),
--      criando 2 Casas gratuitas em vez de bloquear a 2ª. Corrigido com
--      pg_advisory_xact_lock por auth.uid(), adquirido antes da checagem.
--
-- Rollback: `drop function if exists public.create_house_atomic(text); drop function
-- if exists public.delete_house(uuid);` — o client então precisa voltar a usar os
-- inserts/deletes manuais anteriores em useHouses.ts (git revert do commit que trocou
-- pela chamada de RPC).

-- ─────────────────────────────────────────────────────────────
-- 1) Criação de Casa atômica: houses + house_members(owner) + trial em 1 transação.
--    A checagem de elegibilidade (user_can_create_house) já existe desde
--    2026-07-17-subscriptions.sql e também é reforçada por uma policy RESTRICTIVE em
--    houses — repetida aqui porque esta função é SECURITY DEFINER e ignora RLS.
-- ─────────────────────────────────────────────────────────────
create or replace function public.create_house_atomic(p_name text)
returns table (id uuid, name text, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_house_id uuid;
  v_name text := trim(coalesce(p_name, ''));
begin
  if v_user_id is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;
  if v_name = '' then
    raise exception 'Nome da Casa é obrigatório.' using errcode = '22023';
  end if;

  -- Lock por usuário: sem isso, duas chamadas concorrentes do MESMO usuário podem
  -- passar as duas pela checagem de elegibilidade abaixo antes de qualquer uma delas
  -- ter inserido sua própria linha de house_members(owner) — criando 2 Casas gratuitas
  -- em vez de bloquear a 2ª. O lock serializa: a 2ª chamada só continua depois que a 1ª
  -- terminar (commit ou rollback) e liberar o lock, então já vê o house_members recém-
  -- criado pela 1ª ao rodar sua própria checagem. hashtextextended devolve um bigint de
  -- 64 bits — colisão prática entre usuários DIFERENTES (2 UUIDs distintos batendo no
  -- mesmo lock, travando um usuário por causa do outro) é astronomicamente improvável
  -- (~1 em 2^64) e não é tratada como preocupação real aqui. Ver
  -- supabase/tests/create_house_concurrency.sh para o teste desta seção (não executado
  -- nesta sessão — precisa de Postgres local).
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  if not public.user_can_create_house(v_user_id) then
    raise exception 'Você já tem uma Casa gratuita. Para gerenciar mais de uma Casa, assine o plano Premium em alguma delas.'
      using errcode = 'P0001';
  end if;

  insert into public.houses (name, created_by)
  values (v_name, v_user_id)
  returning public.houses.id into v_house_id;

  insert into public.house_members (house_id, user_id, role)
  values (v_house_id, v_user_id, 'owner');

  -- Defensivo: o trigger trg_start_house_trial (2026-07-17-subscriptions.sql) já cria
  -- essa linha via AFTER INSERT em houses, dentro da MESMA transação desta função. Este
  -- insert só garante o resultado mesmo que o trigger seja removido/alterado no futuro
  -- — on conflict absorve o caso normal (linha já criada pelo trigger).
  insert into public.subscriptions (house_id, tier, status, trial_ends_at)
  values (v_house_id, 'trial', 'trialing', now() + interval '14 days')
  on conflict (house_id) do nothing;

  return query select h.id, h.name, h.invite_code from public.houses h where h.id = v_house_id;
end;
$$;

revoke execute on function public.create_house_atomic(text) from public;
grant execute on function public.create_house_atomic(text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2) Exclusão de Casa atômica: valida auth.uid() + papel owner dentro da função, apaga
--    tudo em 1 transação (qualquer erro no meio desfaz tudo — sem exclusão parcial).
-- ─────────────────────────────────────────────────────────────
create or replace function public.delete_house(p_house_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
begin
  if v_user_id is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;
  if p_house_id is null then
    raise exception 'house_id é obrigatório.' using errcode = '22023';
  end if;

  select role into v_role from public.house_members
  where house_id = p_house_id and user_id = v_user_id;

  if v_role is distinct from 'owner' then
    raise exception 'Só o Proprietário pode excluir a Casa.' using errcode = '42501';
  end if;

  -- subscriptions.house_id já tem "on delete cascade" para houses(id)
  -- (2026-07-17-subscriptions.sql) — apagada automaticamente pelo delete final abaixo.
  delete from public.events where house_id = p_house_id;
  delete from public.adjustments where house_id = p_house_id;
  delete from public.payments where house_id = p_house_id;
  delete from public.employees where house_id = p_house_id;
  delete from public.settings where house_id = p_house_id;
  delete from public.house_members where house_id = p_house_id;
  delete from public.houses where id = p_house_id;

  if not found then
    raise exception 'Casa não encontrada.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.delete_house(uuid) from public;
grant execute on function public.delete_house(uuid) to authenticated;
