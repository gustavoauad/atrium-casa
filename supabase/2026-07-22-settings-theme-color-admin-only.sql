-- Refina a política de 'settings' (aplicada em 2026-07-21): a tabela guarda 3 coisas
-- diferentes sob a mesma chave-valor — theme_colors (cor da Casa, configuração de
-- Casa), regional (feriados) e ls:* (overrides de VT/pro-rata por funcionário). O fix
-- anterior liberou 'member' pra escrever em 'settings' de forma geral, o que também
-- liberava mudar a cor da Casa — que deve continuar restrito a quem gerencia a Casa
-- (admin/owner; 'editor' mantém o mesmo acesso que já tinha antes do fix de member).
-- Membro continua podendo escrever feriados regionais e overrides de VT normalmente.

alter policy "editors_write_settings" on public.settings
  with check (
    house_id = my_house_id() and (
      (key = 'theme_colors' and my_role() = any (array['admin', 'editor']))
      or
      (key <> 'theme_colors' and my_role() = any (array['admin', 'editor', 'member']))
    )
  );

alter policy "editors_update_settings" on public.settings
  using (
    house_id = my_house_id() and (
      (key = 'theme_colors' and my_role() = any (array['admin', 'editor']))
      or
      (key <> 'theme_colors' and my_role() = any (array['admin', 'editor', 'member']))
    )
  );

-- Verificação:
--   select policyname, cmd, qual, with_check from pg_policies
--   where tablename = 'settings' order by cmd;
