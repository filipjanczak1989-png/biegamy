#!/usr/bin/env bash
# BIEG WIRTUALNY (19.11, blizna-305): test po skutku BEZ migracji — poprawa czasu w treningu przelicza wynik (wyzwalacz z 20261212).
# JEDNA transakcja na bazie połączonej, zawsze wycofana. Bieg próbny, zapisy i treningi testu powstają tylko w tej transakcji.
# Strażnik licznika: akcja_licznik prawdziwej ulicy przed i po teście (suma km i procent te same).
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  echo "select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true); set local role service_role;"
  echo "create temp table _licznik_przed as select public.akcja_licznik('dla-fabianka') as j; reset role;"
  tr -d '\r' < tools/akcja-bieg-czas-poprawa-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY POPRAWY CZASU ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY POPRAWY CZASU ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
