-- Migração: introduz o papel 'owner' (Proprietário) em house_members.
-- Rode isto no SQL Editor do Supabase (Dashboard → SQL Editor).
-- Não há integração de migrations automatizada neste repositório — este
-- script é para execução manual. Revise antes de rodar em produção.

-- ─────────────────────────────────────────────────────────────
-- PARTE 1 — obrigatório (roles + unicidade + migração de dados + RPC)
-- ─────────────────────────────────────────────────────────────

-- 1) Permite o novo valor 'owner' no papel de membro da Casa.
--    Se sua constraint de CHECK tiver outro nome, ajuste o DROP abaixo
--    (rode a consulta de verificação no fim do arquivo para conferir o nome real).
alter table public.house_members drop constraint if exists house_members_role_check;
alter table public.house_members
  add constraint house_members_role_check
  check (role in ('owner', 'admin', 'editor', 'member', 'viewer'));

-- 2) No máximo 1 'owner' por Casa.
create unique index if not exists house_members_one_owner_per_house
  on public.house_members (house_id)
  where role = 'owner';

-- 3) Promove automaticamente o criador de cada Casa já existente (hoje 'admin') a 'owner'.
update public.house_members hm
set role = 'owner'
from public.houses h
where hm.house_id = h.id
  and hm.user_id = h.created_by
  and hm.role = 'admin';

-- 4) Transferência de propriedade atômica — evita ter 2 owners simultâneos
--    (a troca é feita dentro de uma única transação/função).
--    SECURITY DEFINER roda com privilégios elevados, mas valida internamente
--    que quem chamou é de fato o Proprietário atual da Casa.
create or replace function public.transfer_house_ownership(p_house_id uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_target_role text;
begin
  select role into v_caller_role from house_members where house_id = p_house_id and user_id = v_caller;
  if v_caller_role is distinct from 'owner' then
    raise exception 'Só o Proprietário pode transferir a propriedade da Casa.';
  end if;

  select role into v_target_role from house_members where house_id = p_house_id and user_id = p_new_owner;
  if v_target_role is null then
    raise exception 'O usuário informado não é membro dessa Casa.';
  end if;

  update house_members set role = 'admin' where house_id = p_house_id and user_id = v_caller;
  update house_members set role = 'owner' where house_id = p_house_id and user_id = p_new_owner;
end;
$$;

grant execute on function public.transfer_house_ownership(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- PARTE 2 — revisão manual de RLS (obrigatório revisar, não dá pra automatizar às cegas)
-- ─────────────────────────────────────────────────────────────
-- Este repositório não versiona as policies do Supabase (elas vivem só no
-- painel), então não sei os nomes/definições exatas das suas policies atuais.
-- Rode a consulta abaixo para listar as policies de houses/house_members:
--
--   select schemaname, tablename, policyname, cmd, qual, with_check
--   from pg_policies
--   where tablename in ('houses', 'house_members');
--
-- Confira/ajuste manualmente para cobrir estas regras:
--
--  a) UPDATE em house_members (troca de role via app):
--     - a policy de UPDATE comum (admin/owner alterando o role de outro membro)
--       deve BLOQUEAR quem tenta setar role = 'owner' diretamente
--       (a promoção a 'owner' só deve acontecer via transfer_house_ownership,
--       que já roda com SECURITY DEFINER e ignora RLS).
--       Exemplo de WITH CHECK a incluir na policy existente:
--         with check (role <> 'owner')
--     - (opcional, recomendado) a policy também pode impedir que um Admin
--       altere a linha do Proprietário:
--         using (role <> 'owner' or user_id = auth.uid())
--
--  b) DELETE em house_members (remover membro):
--     - mesma ideia: bloquear remoção de uma linha com role = 'owner'.
--         using (role <> 'owner')
--
--  c) DELETE em houses (excluir a Casa):
--     - deve ser restrito a quem é 'owner' daquela casa. Exemplo:
--         using (
--           exists (
--             select 1 from house_members hm
--             where hm.house_id = houses.id
--               and hm.user_id = auth.uid()
--               and hm.role = 'owner'
--           )
--         )
