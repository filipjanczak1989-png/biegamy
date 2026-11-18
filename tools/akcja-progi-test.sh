#!/usr/bin/env bash
# AKCJA, KAMIENIE MILOWE CO 1000 KM (18.11): testy po skutku migracji 20261210_akcja_progi.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# Przed wdrożeniem: AKCJA_PROGI_Z_MIGRACJA=1 (wtedy także porównanie historii ulicy z niezależnym odtworzeniem). Akcje próbne i kamienie tylko w tej transakcji.
# Strażnik licznika: akcja_licznik prawdziwej ulicy zapisany PRZED migracją (service_role jak EF akcja-licznik) i porównany po niej bez pola prog; suma km i procent te same.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  echo "select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true); set local role service_role;"
  echo "create temp table _licznik_przed as select public.akcja_licznik('dla-fabianka') as j; reset role;"
  if [ "${AKCJA_PROGI_Z_MIGRACJA:-0}" = 1 ]; then
    echo 'create temp table _z_migracja as select 1 as x;'
    tr -d '\r' < supabase/migrations/20261210_akcja_progi.sql | sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d'
  fi
  tr -d '\r' < tools/akcja-progi-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY KAMIENI ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY KAMIENI ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
