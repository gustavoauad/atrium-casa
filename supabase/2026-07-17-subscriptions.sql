-- Sistema de assinaturas: tabela subscriptions, limites por plano, e travamento de
-- escrita quando a Casa não tem acesso válido (trial vencido, assinatura cancelada/
-- inadimplente). Rode isto no SQL Editor do Supabase. Revise antes de aplicar em produção.

-- ─────────────────────────────────────────────────────────────
-- PARTE 1 — tabela subscriptions
-- ─────────────────────────────────────────────────────────────

create table if not exists public.subscriptions (
  house_id uuid primary key references public.houses(id) on delete cascade,
  tier text not null check (tier in ('trial', 'basico', 'premium', 'grandfathered')),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled')),
  provider text check (provider in ('stripe', 'apple', 'google')),
  provider_customer_id text,
  provider_subscription_id text,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Qualquer membro da Casa pode LER o status da assinatura (pra mostrar banner/contagem).
drop policy if exists "subscriptions_select_house_members" on public.subscriptions;
create policy "subscriptions_select_house_members" on public.subscriptions
  for select
  using (
    exists (
      select 1 from house_members hm
      where hm.house_id = subscriptions.house_id
        and hm.user_id = auth.uid()
    )
  );

-- Só o backend (service role, usado pelas Edge Functions) pode escrever aqui — nenhuma
-- policy de INSERT/UPDATE/DELETE para o role "authenticated". O service role do
-- Supabase ignora RLS por padrão, então as Edge Functions funcionam sem policy extra.

-- ─────────────────────────────────────────────────────────────
-- PARTE 2 — trial automático em Casa nova
-- ─────────────────────────────────────────────────────────────

create or replace function public.start_house_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into subscriptions (house_id, tier, status, trial_ends_at)
  values (new.id, 'trial', 'trialing', now() + interval '14 days');
  return new;
end;
$$;

drop trigger if exists trg_start_house_trial on public.houses;
create trigger trg_start_house_trial
  after insert on public.houses
  for each row execute function public.start_house_trial();

-- ─────────────────────────────────────────────────────────────
-- PARTE 3 — grandfathering das Casas já existentes
-- ─────────────────────────────────────────────────────────────
-- Rode isso UMA VEZ, antes de qualquer Casa nova ser criada com o trigger acima ativo.

insert into public.subscriptions (house_id, tier, status)
select h.id, 'grandfathered', 'active'
from public.houses h
where not exists (select 1 from public.subscriptions s where s.house_id = h.id);

-- ─────────────────────────────────────────────────────────────
-- PARTE 4 — funções de elegibilidade (usadas pela RLS e pelo app)
-- ─────────────────────────────────────────────────────────────

-- A Casa tem acesso de escrita válido agora? (grandfathered, trial dentro do prazo,
-- ou assinatura paga ativa). Usada nas policies de escrita das tabelas de dados.
create or replace function public.house_can_write(p_house_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select
        case
          when s.tier = 'grandfathered' then true
          when s.tier = 'trial' then s.trial_ends_at > now()
          when s.status = 'active' then true
          else false
        end
      from subscriptions s
      where s.house_id = p_house_id
    ),
    false
  );
$$;

grant execute on function public.house_can_write(uuid) to authenticated;

-- Quantos funcionários ativos essa Casa pode ter? null = ilimitado.
create or replace function public.house_employee_limit(p_house_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when s.tier = 'basico' and s.status = 'active' then 5
    else null
  end
  from subscriptions s
  where s.house_id = p_house_id;
$$;

grant execute on function public.house_employee_limit(uuid) to authenticated;

-- Pode inserir mais um funcionário ativo nessa Casa? (bloqueia só o Nº 6+ do Básico,
-- não afeta os já existentes se a Casa cair de tier depois).
create or replace function public.house_can_add_employee(p_house_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    house_can_write(p_house_id)
    and (
      house_employee_limit(p_house_id) is null
      or (
        select count(*) from employees e
        where e.house_id = p_house_id
          and coalesce(e.data->>'status', 'ativo') <> 'desligado'
      ) < house_employee_limit(p_house_id)
    );
$$;

grant execute on function public.house_can_add_employee(uuid) to authenticated;

-- Esse usuário pode criar mais uma Casa (além da 1ª)? Só se já for dono de alguma
-- Casa com assinatura Premium ativa.
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
        and s.tier = 'premium'
        and s.status = 'active'
    );
$$;

grant execute on function public.user_can_create_house(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- PARTE 5 — reforço de RLS nas tabelas de dados (aditivo, mesmo padrão do fix de owner)
-- ─────────────────────────────────────────────────────────────
-- Isso ADICIONA uma policy restritiva (RESTRICTIVE, não permissiva) que trava a escrita
-- quando a Casa não tem acesso válido — independente de quais outras policies permissivas
-- já existirem. Policies RESTRICTIVE são combinadas com AND, então isso funciona como um
-- "trava geral" por cima de tudo, sem precisar conhecer/alterar as policies atuais.

drop policy if exists "require_active_subscription_employees" on public.employees;
create policy "require_active_subscription_employees" on public.employees
  as restrictive
  for insert
  with check (house_can_add_employee(house_id));

drop policy if exists "require_active_subscription_employees_upd" on public.employees;
create policy "require_active_subscription_employees_upd" on public.employees
  as restrictive
  for update
  using (house_can_write(house_id));

drop policy if exists "require_active_subscription_events" on public.events;
create policy "require_active_subscription_events" on public.events
  as restrictive
  for all
  using (house_can_write(house_id))
  with check (house_can_write(house_id));

drop policy if exists "require_active_subscription_adjustments" on public.adjustments;
create policy "require_active_subscription_adjustments" on public.adjustments
  as restrictive
  for all
  using (house_can_write(house_id))
  with check (house_can_write(house_id));

drop policy if exists "require_active_subscription_payments" on public.payments;
create policy "require_active_subscription_payments" on public.payments
  as restrictive
  for all
  using (house_can_write(house_id))
  with check (house_can_write(house_id));

drop policy if exists "require_active_subscription_settings" on public.settings;
create policy "require_active_subscription_settings" on public.settings
  as restrictive
  for all
  using (house_can_write(house_id))
  with check (house_can_write(house_id));

-- Casas: impede criar uma 2ª+ Casa sem Premium ativo em alguma Casa já possuída.
drop policy if exists "require_premium_for_extra_house" on public.houses;
create policy "require_premium_for_extra_house" on public.houses
  as restrictive
  for insert
  with check (user_can_create_house(auth.uid()));

-- NOTA: policies RESTRICTIVE só têm efeito se a tabela já tiver pelo menos uma policy
-- PERMISSIVE cobrindo o mesmo comando (senão nunca haveria acesso nenhum). Como essas
-- tabelas já são usadas em produção, isso já deve estar garantido — mas vale conferir
-- com a consulta abaixo caso algo pareça bloqueado incorretamente:
--
--   select schemaname, tablename, policyname, permissive, cmd
--   from pg_policies
--   where tablename in ('employees','events','adjustments','payments','settings','houses');
