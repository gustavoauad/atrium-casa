-- Corrige user_can_create_house(): Casas grandfathered (criadas antes do sistema de
-- assinaturas, migradas com acesso ilimitado permanente) devem ter os mesmos direitos
-- de um Premium ativo — inclusive poder criar Casas adicionais. A versão anterior só
-- reconhecia tier = 'premium', deixando donos de Casas grandfathered presos a 1 Casa
-- mesmo tendo, na prática, acesso "Premium Vitalício".
--
-- Já aplicado em produção via Supabase MCP em 2026-07-18. Este arquivo documenta a
-- mudança no histórico do repositório.

create or replace function public.user_can_create_house(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from house_members hm where hm.user_id = p_user_id and hm.role = 'owner') = 0
    or exists (
      select 1
      from house_members hm
      join subscriptions s on s.house_id = hm.house_id
      where hm.user_id = p_user_id
        and hm.role = 'owner'
        and (
          (s.tier = 'premium' and s.status = 'active')
          or s.tier = 'grandfathered'
        )
    );
$$;
