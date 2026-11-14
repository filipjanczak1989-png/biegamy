#!/usr/bin/env bash
# BIEG WIRTUALNY, TEKSTY 14.11: testy po skutku migracji 20261130_akcja_bieg_regulamin_od.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# Przed wdrożeniem: AKCJA_BIEG_REGULAMIN_Z_MIGRACJA=1. Klucze pola `bieg` zbierane przed migracją na chwilowym biegu próbnym (tylko w tej transakcji).
# Strażnik licznika: akcja_licznik prawdziwej ulicy zapisany PRZED migracją obiema drogami produkcji (service_role jak EF akcja-licznik, authenticated jak RPC zalogowanych) i porównany po niej bez klucza `bieg`.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  echo "select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true); set local role service_role;"
  echo "create temp table _licznik_przed as select public.akcja_licznik('dla-fabianka') as j; reset role;"
  # druga droga produkcji: zalogowani pytają RPC akcja_licznik jako authenticated (js/akcja-cytaty.mjs odswiezStan); to samo konto przed i po migracji
  cat <<'SQL'
create temp table _konto_straznika as select a.user_id as sub from public.athletes a where a.user_id is not null and not exists (select 1 from public.coaches c where c.id = a.user_id) order by a.created_at limit 1;
select set_config('request.jwt.claims', json_build_object('sub', (select sub from _konto_straznika), 'role', 'authenticated')::text, true);
set local role authenticated;
create temp table _licznik_przed_zal as select public.akcja_licznik('dla-fabianka') as j;
reset role;
SQL
  cat <<'SQL'
insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
  values ('proba', 'Próba', 'Janek', (now() at time zone 'Europe/Warsaw')::date, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
delete from public.akcja_biegi where akcja_slug = 'proba';
insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
  values ('proba', 'proba-klucze', 'Klucze', (now() at time zone 'Europe/Warsaw')::date + 2, (now() at time zone 'Europe/Warsaw')::date + 3, (now() at time zone 'Europe/Warsaw')::date + 6, '{5,10}', 'otwarty', '2026-11-v1');
create temp table _klucze_przed as select array_agg(x) as klucze from jsonb_object_keys(public.akcja_bieg_publiczny('proba')) x where x <> 'regulamin_od';
SQL
  if [ "${AKCJA_BIEG_REGULAMIN_Z_MIGRACJA:-0}" = 1 ]; then tr -d '\r' < supabase/migrations/20261130_akcja_bieg_regulamin_od.sql | sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d'; fi
  tr -d '\r' < tools/akcja-bieg-regulamin-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY REGULAMIN_OD ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY REGULAMIN_OD ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
