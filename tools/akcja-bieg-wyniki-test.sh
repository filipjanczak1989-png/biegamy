#!/usr/bin/env bash
# BIEG WIRTUALNY, ETAP 2: testy po skutku migracji 20261126_akcja_bieg_wyniki.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# Przed wdrożeniem etapu 2: AKCJA_BIEG_WYNIKI_Z_MIGRACJA=1. Gdy na bazie nie ma jeszcze etapu 1: dodatkowo AKCJA_BIEG_Z_MIGRACJA=1 (oba pliki w tej samej transakcji).
# Strażnik licznika: akcja_licznik prawdziwej ulicy zapisany PRZED migracjami obiema drogami produkcji (service_role jak EF akcja-licznik, authenticated jak RPC zalogowanych)
# i porównany po nich. Test wstawia treningi, odznaki i powiadomienia TYLKO w tej transakcji (rollback), jak tools/akcje-test-transakcji.sh.
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
  if [ "${AKCJA_BIEG_Z_MIGRACJA:-0}" = 1 ]; then tr -d '\r' < supabase/migrations/20261120_akcja_bieg.sql | sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d'; fi
  if [ "${AKCJA_BIEG_WYNIKI_Z_MIGRACJA:-0}" = 1 ]; then tr -d '\r' < supabase/migrations/20261126_akcja_bieg_wyniki.sql | sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d'; fi
  tr -d '\r' < tools/akcja-bieg-wyniki-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY WYNIKÓW BIEGU ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY WYNIKÓW BIEGU ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
