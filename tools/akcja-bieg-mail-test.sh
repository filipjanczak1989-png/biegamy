#!/usr/bin/env bash
# BIEG WIRTUALNY, E-MAIL PRZED BIEGIEM (14.11): test po skutku migracji 20261201_akcja_bieg_mail_ponowienie.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# Przed wdrożeniem: AKCJA_BIEG_MAIL_Z_MIGRACJA=1. Rezerwacja, ponowienie po odrzuceniu (15 min, 3 próby), niepewny i przerwany bez ponowienia, limit doby, cofnięta zgoda, stara droga zapisu.
# Strażnik licznika: akcja_licznik prawdziwej ulicy zapisany PRZED migracją obiema drogami produkcji i porównany po niej.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  echo "select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true); set local role service_role;"
  echo "create temp table _licznik_przed as select public.akcja_licznik('dla-fabianka') as j; reset role;"
  cat <<'SQL'
create temp table _konto_straznika as select a.user_id as sub from public.athletes a where a.user_id is not null and not exists (select 1 from public.coaches c where c.id = a.user_id) order by a.created_at limit 1;
select set_config('request.jwt.claims', json_build_object('sub', (select sub from _konto_straznika), 'role', 'authenticated')::text, true);
set local role authenticated;
create temp table _licznik_przed_zal as select public.akcja_licznik('dla-fabianka') as j;
reset role;
SQL
  if [ "${AKCJA_BIEG_MAIL_Z_MIGRACJA:-0}" = 1 ]; then tr -d '\r' < supabase/migrations/20261201_akcja_bieg_mail_ponowienie.sql | sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d'; fi
  tr -d '\r' < tools/akcja-bieg-mail-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY E-MAILA BIEGU ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY E-MAILA BIEGU ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
