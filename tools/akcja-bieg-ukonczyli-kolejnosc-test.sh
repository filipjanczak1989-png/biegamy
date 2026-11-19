#!/usr/bin/env bash
# BIEG WIRTUALNY (19.11): test po skutku migracji 20261216_akcja_bieg_ukonczyli_kolejnosc.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# Przed wdrożeniem: AKCJA_BIEG_KOLEJNOSC_Z_MIGRACJA=1 (migracja w tej samej transakcji, też wycofana).
# Strażnik licznika: akcja_licznik prawdziwej ulicy zapisany PRZED migracją (service_role jak EF akcja-licznik); po niej suma km i procent te same.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  echo "select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true); set local role service_role;"
  echo "create temp table _licznik_przed as select public.akcja_licznik('dla-fabianka') as j; reset role;"
  if [ "${AKCJA_BIEG_KOLEJNOSC_Z_MIGRACJA:-0}" = 1 ]; then tr -d '\r' < supabase/migrations/20261216_akcja_bieg_ukonczyli_kolejnosc.sql | sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d'; fi
  tr -d '\r' < tools/akcja-bieg-ukonczyli-kolejnosc-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY KOLEJNOSCI UKONCZYLI ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY KOLEJNOSCI UKONCZYLI ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
