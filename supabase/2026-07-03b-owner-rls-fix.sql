-- Corrige o acesso do papel 'owner' nas tabelas com Row Level Security.
--
-- Problema observado: "new row violates row-level security policy for table settings"
-- ao salvar a Cor da Casa como Proprietário. Causa provável: as políticas de RLS
-- existentes foram escritas checando role = 'admin' literalmente, então usuários
-- com role = 'owner' (que passou a existir só na migração anterior) ficam de fora.
--
-- Em vez de alterar as políticas atuais (não tenho visibilidade delas neste
-- repositório), este script ADICIONA uma política permissiva extra por tabela
-- liberando o Proprietário. Políticas permissivas no Postgres se combinam com
-- OR, então isso é seguro: só amplia acesso para quem já é 'owner' daquela Casa,
-- sem tocar no que já existe.
--
-- Rode isto no SQL Editor do Supabase.

create or replace function public.is_house_owner(p_house_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from house_members hm
    where hm.house_id = p_house_id
      and hm.user_id = auth.uid()
      and hm.role = 'owner'
  );
$$;

grant execute on function public.is_house_owner(uuid) to authenticated;

drop policy if exists "owner_full_access_settings" on public.settings;
create policy "owner_full_access_settings" on public.settings
  for all using (is_house_owner(house_id)) with check (is_house_owner(house_id));

drop policy if exists "owner_full_access_employees" on public.employees;
create policy "owner_full_access_employees" on public.employees
  for all using (is_house_owner(house_id)) with check (is_house_owner(house_id));

drop policy if exists "owner_full_access_events" on public.events;
create policy "owner_full_access_events" on public.events
  for all using (is_house_owner(house_id)) with check (is_house_owner(house_id));

drop policy if exists "owner_full_access_adjustments" on public.adjustments;
create policy "owner_full_access_adjustments" on public.adjustments
  for all using (is_house_owner(house_id)) with check (is_house_owner(house_id));

drop policy if exists "owner_full_access_payments" on public.payments;
create policy "owner_full_access_payments" on public.payments
  for all using (is_house_owner(house_id)) with check (is_house_owner(house_id));

-- house_members: libera o Proprietário para gerenciar membros, mas impede que ele
-- promova outra linha a 'owner' por essa via genérica (só a função
-- transfer_house_ownership, criada na migração anterior, pode fazer essa troca).
drop policy if exists "owner_full_access_house_members" on public.house_members;
create policy "owner_full_access_house_members" on public.house_members
  for all
  using (is_house_owner(house_id))
  with check (is_house_owner(house_id) and role <> 'owner');

drop policy if exists "owner_full_access_houses" on public.houses;
create policy "owner_full_access_houses" on public.houses
  for all using (is_house_owner(id)) with check (is_house_owner(id));
