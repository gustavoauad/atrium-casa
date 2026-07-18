-- Registro de aceite dos Termos de Uso / Política de Privacidade (auditoria, append-only).
-- Cada linha é uma prova de que um usuário aceitou uma versão específica dos termos, num
-- momento específico. Não há política de update/delete: por design, nada aqui pode ser
-- apagado ou alterado depois de criado.

create table if not exists public.user_agreements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists user_agreements_user_id_idx on public.user_agreements(user_id);

alter table public.user_agreements enable row level security;

drop policy if exists "user_agreements_select_own" on public.user_agreements;
create policy "user_agreements_select_own" on public.user_agreements
  for select using (auth.uid() = user_id);

drop policy if exists "user_agreements_insert_own" on public.user_agreements;
create policy "user_agreements_insert_own" on public.user_agreements
  for insert with check (auth.uid() = user_id);

-- Sem política de update/delete: nega por padrão (RLS bloqueia tudo que não tem policy).
