-- Corrige vazamento crítico de dados encontrado em auditoria: as tabelas `houses` e
-- `house_members` tinham políticas de SELECT com qual = true (sem escopo nenhum),
-- liberando leitura de TODAS as Casas/membros do produto para qualquer requisição
-- (anon_read_invite/authenticated_read_invite em houses; admin_see_all_members em
-- house_members, apesar do nome, também sem checagem real). Não estavam versionadas
-- em nenhum arquivo deste repositório — criadas direto no painel do Supabase em algum
-- momento anterior.
--
-- O motivo dessas políticas existirem: o fluxo de "entrar com código de convite"
-- (useHouses.ts: findHouseByInviteCode) precisa buscar uma Casa pelo invite_code
-- ANTES da pessoa ser membro dela — inclusive antes de existir sessão, no caso de
-- validar o convite durante o cadastro (AuthScreen.tsx). Como RLS não sabe "por qual
-- coluna o client filtrou", não dá pra restringir a leitura da tabela e ainda permitir
-- essa busca por código. A solução correta é mover essa busca para uma função
-- SECURITY DEFINER que devolve só (id, name) — nunca a linha inteira — e então travar
-- a tabela de verdade para leitura só por quem já é membro.
--
-- Rode isto no SQL Editor do Supabase.

-- 1) Função para buscar Casa por código de convite sem expor a tabela inteira.
create or replace function public.find_house_by_invite_code(p_code text)
returns table(id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.name
  from houses h
  where lower(h.invite_code) = lower(trim(p_code))
  limit 1;
$$;

grant execute on function public.find_house_by_invite_code(text) to anon, authenticated;

-- 2) Remove as políticas de SELECT abertas (qual = true) em `houses`.
drop policy if exists "anon_read_invite" on public.houses;
drop policy if exists "authenticated_read_invite" on public.houses;

-- 3) Função auxiliar (mesmo padrão de is_house_owner): devolve as Casas do usuário
--    atual via SECURITY DEFINER, bypassando RLS na consulta interna. Necessário porque
--    uma policy de SELECT em `house_members` que faz subquery direta em `house_members`
--    dispara "infinite recursion detected in policy for relation house_members" — RLS
--    reavalia a mesma policy pra resolver a subquery.
create or replace function public.my_house_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select house_id from house_members where user_id = auth.uid();
$$;

grant execute on function public.my_house_ids() to authenticated;

-- 4) Repõe o acesso legítimo: qualquer membro (não só o dono) pode ler a Casa dela.
--    `creator_sees_house` e `owner_full_access_houses` continuam cobrindo dono/criador.
drop policy if exists "member_sees_house" on public.houses;
create policy "member_sees_house" on public.houses
  for select
  to authenticated
  using (id in (select my_house_ids()));

-- 5) Remove a política de SELECT aberta (qual = true) em `house_members`.
drop policy if exists "admin_see_all_members" on public.house_members;

-- 6) Repõe o acesso legítimo: qualquer membro vê os outros membros da(s) mesma(s) Casa(s)
--    (necessário pra tela de gerenciar membros funcionar para todo mundo, não só o dono).
drop policy if exists "members_see_housemates" on public.house_members;
create policy "members_see_housemates" on public.house_members
  for select
  to authenticated
  using (house_id in (select my_house_ids()));
