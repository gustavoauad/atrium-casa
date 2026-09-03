#!/usr/bin/env bash
# Teste de integração de concorrência para public.create_house_atomic.
# NÃO EXECUTADO nesta sessão (sem Docker/psql disponíveis) — ver supabase/tests/README.md.
#
# Rode com:
#   DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres" \
#     bash supabase/tests/create_house_concurrency.sh
#
# Dispara 2 chamadas SIMULTÂNEAS de create_house_atomic para o MESMO usuário e confirma
# que só 1 das duas cria uma Casa — a outra deve falhar por já ter Casa gratuita (não
# por falta de autenticação nem por qualquer outro erro), graças ao
# pg_advisory_xact_lock por auth.uid() adicionado nesta fase. Sem o lock, as duas
# podiam passar pela checagem de elegibilidade antes de qualquer uma commitar.
#
# NÃO usa `set -e`: uma das duas chamadas FALHAR é o resultado esperado do teste, não
# um erro de script — mataria o script antes de poder inspecionar qual falhou e por quê.
set -uo pipefail

DB="${DATABASE_URL:?defina DATABASE_URL apontando para o Postgres local do Supabase (ex.: supabase start)}"
USER_ID="22222222-2222-2222-2222-222222222222"

WORKDIR="$(mktemp -d)" || { echo "FALHOU: não consegui criar diretório temporário"; exit 1; }

cleanup() {
  local exit_code=$?
  echo "--- cleanup: removendo fixtures de teste ---"
  psql "$DB" -v ON_ERROR_STOP=0 -q -c "
    delete from public.house_members where user_id = '$USER_ID';
    delete from public.subscriptions where house_id in (select id from public.houses where created_by = '$USER_ID');
    delete from public.houses where created_by = '$USER_ID';
    delete from auth.users where id = '$USER_ID';
  " > "$WORKDIR/cleanup.log" 2>&1
  cat "$WORKDIR/cleanup.log"
  rm -rf "$WORKDIR"
  exit "$exit_code"
}
# Cleanup roda mesmo se o script for interrompido (Ctrl+C) ou sair por erro no meio —
# não só no caminho feliz do fim do arquivo.
trap cleanup EXIT INT TERM

# Fixture de usuário real: house_members.user_id / houses.created_by têm FK para
# auth.users, não dá pra simular com um uuid solto. Insert mínimo (mesmo padrão do
# supabase/tests/stripe_webhook_rpc.sql) — confira contra `\d auth.users` se a versão
# do GoTrue local divergir.
psql "$DB" -v ON_ERROR_STOP=1 -q -c "
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin
  ) values (
    '00000000-0000-0000-0000-000000000000', '$USER_ID',
    'authenticated', 'authenticated', 'teste-concorrencia@example.test', '',
    now(), now(), now(),
    '{\"provider\":\"email\",\"providers\":[\"email\"]}'::jsonb, '{}'::jsonb, false
  );
" || { echo "FALHOU: não consegui criar a fixture de usuário em auth.users"; exit 1; }

# claim (set_config) e a chamada da RPC precisam estar na MESMA transação/conexão — com
# `psql -c A -c B` cada `-c` roda em sua própria transação autocommit, então um
# set_config(..., is_local=true) da 1ª some antes da 2ª rodar. Uma única string com
# BEGIN...COMMIT, passada para UM `-c`, garante que tudo aconteça na mesma transação.
call_sql() {
  local name="$1"
  cat <<SQL
begin;
select set_config('request.jwt.claims', json_build_object('sub', '$USER_ID', 'role', 'authenticated')::text, true);
select * from public.create_house_atomic('Casa Concorrente $name');
commit;
SQL
}

psql "$DB" -v ON_ERROR_STOP=1 -c "$(call_sql A)" > "$WORKDIR/house_a.log" 2>&1 &
PID_A=$!
psql "$DB" -v ON_ERROR_STOP=1 -c "$(call_sql B)" > "$WORKDIR/house_b.log" 2>&1 &
PID_B=$!

wait "$PID_A"; STATUS_A=$?
wait "$PID_B"; STATUS_B=$?

echo "--- resultado chamada A (status=$STATUS_A) ---"
cat "$WORKDIR/house_a.log"
echo "--- resultado chamada B (status=$STATUS_B) ---"
cat "$WORKDIR/house_b.log"

FAIL=0

# Exatamente uma das duas deve ter passado (status 0) e a outra falhado (status != 0).
if [ "$STATUS_A" -eq 0 ] && [ "$STATUS_B" -eq 0 ]; then
  echo "FALHOU: as duas chamadas tiveram sucesso — deveriam ter criado 2 Casas gratuitas (lock não funcionou)."
  FAIL=1
elif [ "$STATUS_A" -ne 0 ] && [ "$STATUS_B" -ne 0 ]; then
  echo "FALHOU: as duas chamadas falharam — esperava exatamente 1 sucesso e 1 falha."
  FAIL=1
else
  echo "OK: exatamente 1 chamada teve sucesso e a outra falhou (como esperado)."
fi

# A que falhou precisa ter falhado pela regra de "já tem uma Casa gratuita" — não por
# falta de autenticação nem por qualquer outro erro (ex.: erro de sintaxe, tabela
# inexistente, etc. passariam despercebidos se só checássemos o exit code).
FAIL_LOG="$WORKDIR/house_b.log"
if [ "$STATUS_A" -ne 0 ]; then FAIL_LOG="$WORKDIR/house_a.log"; fi
if [ "$STATUS_A" -ne 0 ] || [ "$STATUS_B" -ne 0 ]; then
  if grep -qi "já tem uma Casa gratuita" "$FAIL_LOG"; then
    echo "OK: a chamada que falhou foi rejeitada pela regra de 2ª Casa gratuita (mensagem esperada encontrada)."
  else
    echo "FALHOU: a chamada que falhou NÃO trouxe a mensagem esperada de '2ª Casa gratuita' — pode ter falhado por outro motivo (ver log acima)."
    FAIL=1
  fi
  if grep -qi "não autenticado\|not authenticated\|28000" "$FAIL_LOG"; then
    echo "FALHOU: a falha parece ser de autenticação (claim JWT não aplicado), não da regra de negócio — o teste de concorrência não está validando o que deveria."
    FAIL=1
  fi
fi

# Exatamente 1 Casa e 1 owner para este usuário.
HOUSE_COUNT=$(psql "$DB" -t -A -v ON_ERROR_STOP=1 -c "select count(*) from public.houses where created_by = '$USER_ID';")
OWNER_COUNT=$(psql "$DB" -t -A -v ON_ERROR_STOP=1 -c "select count(*) from public.house_members where user_id = '$USER_ID' and role = 'owner';")

if [ "$HOUSE_COUNT" != "1" ]; then
  echo "FALHOU: esperava exatamente 1 Casa para o usuário, encontrou $HOUSE_COUNT"
  FAIL=1
fi
if [ "$OWNER_COUNT" != "1" ]; then
  echo "FALHOU: esperava exatamente 1 house_members(owner) para o usuário, encontrou $OWNER_COUNT"
  FAIL=1
fi

if [ "$FAIL" -eq 0 ]; then
  echo "OK: exatamente 1 Casa e 1 owner criados apesar das 2 chamadas concorrentes."
  exit 0
else
  exit 1
fi
