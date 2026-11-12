#!/usr/bin/env bash
# CUDZE PROFILE TYLKO PRZEZ WIDOK: test po skutku migracji kroku 3 (20261112_athletes_widok_i_funkcje.sql) i kroku 4
# (20261114_athletes_polityka_i_log_comments.sql) w JEDNEJ transakcji
# na bazie połączonej, zawsze wycofanej. Przed wdrożeniem: ATHLETES_Z_MIGRACJA=1 (migracja w tej samej transakcji).
# Bez kroku 4 na bazie test ma być CZERWONY (FAIL 2). ATHLETES_Z_MIGRACJA=1 dokłada OBA pliki (krok 3 jest idempotentny:
# create or replace), więc działa też przed wykonaniem kroku 3.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  if [ "${ATHLETES_Z_MIGRACJA:-0}" = 1 ]; then
    for m in supabase/migrations/20261112_athletes_widok_i_funkcje.sql supabase/migrations/20261114_athletes_polityka_i_log_comments.sql; do
      tr -d '\r' < "$m" | sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d'
    done
  fi
  tr -d '\r' < tools/athletes-cudze-profile-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY ATHLETES ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY ATHLETES ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
