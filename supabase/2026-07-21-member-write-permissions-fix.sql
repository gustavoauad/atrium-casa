-- Corrige divergência entre o app e o RLS: o client já libera o papel 'member' pra
-- lançar/editar/excluir eventos, ajustes, funcionários (exceto excluir) e pagamentos
-- (types/house.ts: canWrite() inclui 'member'), mas as políticas abaixo foram criadas
-- antes do papel 'member' existir e só reconhecem 'admin'/'editor'. Rode isto no SQL
-- Editor do Supabase (Dashboard → SQL Editor). Só mexe em RLS, não precisa de deploy.

-- events ------------------------------------------------------------------
alter policy "editors_write_events" on public.events
  with check (house_id = my_house_id() and my_role() = any (array['admin', 'editor', 'member']));

alter policy "editors_update_events" on public.events
  using (house_id = my_house_id() and my_role() = any (array['admin', 'editor', 'member']));

alter policy "editors_delete_events" on public.events
  using (house_id = my_house_id() and my_role() = any (array['admin', 'editor', 'member']));

-- adjustments ---------------------------------------------------------------
alter policy "editors_write_adj" on public.adjustments
  with check (house_id = my_house_id() and my_role() = any (array['admin', 'editor', 'member']));

alter policy "editors_update_adj" on public.adjustments
  using (house_id = my_house_id() and my_role() = any (array['admin', 'editor', 'member']));

alter policy "editors_delete_adj" on public.adjustments
  using (house_id = my_house_id() and my_role() = any (array['admin', 'editor', 'member']));

-- employees (DELETE continua admin-only — intencional, bate com canDelete no app) -----
alter policy "editors_write_employees" on public.employees
  with check (house_id = my_house_id() and my_role() = any (array['admin', 'editor', 'member']));

alter policy "editors_update_employees" on public.employees
  using (house_id = my_house_id() and my_role() = any (array['admin', 'editor', 'member']));

-- payments (faltava até uma política de DELETE — hoje só o owner conseguia cancelar) --
alter policy "editors_write_payments" on public.payments
  with check (house_id = my_house_id() and my_role() = any (array['admin', 'editor', 'member']));

alter policy "editors_update_payments" on public.payments
  using (house_id = my_house_id() and my_role() = any (array['admin', 'editor', 'member']));

drop policy if exists "editors_delete_payments" on public.payments;
create policy "editors_delete_payments" on public.payments
  for delete
  using (house_id = my_house_id() and my_role() = any (array['admin', 'editor', 'member']));

-- settings ------------------------------------------------------------------
alter policy "editors_write_settings" on public.settings
  with check (house_id = my_house_id() and my_role() = any (array['admin', 'editor', 'member']));

alter policy "editors_update_settings" on public.settings
  using (house_id = my_house_id() and my_role() = any (array['admin', 'editor', 'member']));

-- Verificação (rode depois pra conferir):
--   select tablename, policyname, cmd, qual, with_check
--   from pg_policies
--   where tablename in ('events','adjustments','employees','payments','settings')
--   order by tablename, cmd;
