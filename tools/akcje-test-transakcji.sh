#!/usr/bin/env bash
# Migracja 20261102_akcje.sql + poprawka startujących + testy zachowania (tools/akcje-test-transakcji.sql) w JEDNEJ transakcji
# na bazie połączonej (supabase link), zawsze wycofanej: blok testów kończy się wyjątkiem także przy
# zielonym wyniku. Zielono = komunikat „TESTY AKCJI ZIELONE”, kod wyjścia 0.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  # 20261102_akcje.sql jest NA PROD od 2.11 — testujemy żywe funkcje; bazę przed migracją: AKCJE_Z_MIGRACJA=1
  if [ "${AKCJE_Z_MIGRACJA:-0}" = 1 ]; then sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d' supabase/migrations/20261102_akcje.sql; fi
  sed -e '/^begin;$/d' -e '/^commit;$/d' supabase/migrations/20261102_akcje_startujacy_poprawka.sql
  cat tools/akcje-test-transakcji.sql
  echo 'rollback;'; } > "$TMP"
WD="${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}"
OUT="$(supabase db query --linked --workdir "$WD" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY AKCJI ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY AKCJI ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
