#!/usr/bin/env bash
# BIEG WIRTUALNY (20.11): test po skutku migracji 20261219_akcja_bieg_zamrozenie_po_koncu.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# Przed wdrożeniem: AKCJA_BIEG_ZAMROZENIE_Z_MIGRACJA=1 (migracja w tej samej transakcji, też wycofana).
# Strażnik licznika: akcja_licznik prawdziwej ulicy zapisany PRZED migracją; strażnik ukończonych: liczba ukończonych w bieg-mikolajki przed migracją.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  echo "select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true); set local role service_role;"
  echo "create temp table _licznik_przed as select public.akcja_licznik('dla-fabianka') as j; reset role;"
  echo "create temp table _ukonczeni_przed as select count(*) as c from public.akcja_bieg_uczestnicy u join public.akcja_biegi y on y.id = u.bieg_id where y.slug = 'bieg-mikolajki' and u.ukonczony_at is not null and u.wycofany_at is null;"
  if [ "${AKCJA_BIEG_ZAMROZENIE_Z_MIGRACJA:-0}" = 1 ]; then tr -d '\r' < supabase/migrations/20261219_akcja_bieg_zamrozenie_po_koncu.sql | sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d'; fi
  tr -d '\r' < tools/akcja-bieg-zamrozenie-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY ZAMROZENIA PO KONCU ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY ZAMROZENIA PO KONCU ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
