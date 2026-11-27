#!/usr/bin/env bash
# E1 (obserwacje i powiadomienia tylko w relacjach): testy w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# E1_Z_MIGRACJA=1 dokłada niewdrożoną migrację 20261231 (przed wdrożeniem); bez niej test sprawdza bazę taką, jaka jest (po wdrożeniu).
# E1_Z_WYCOFANIEM=1 (razem z E1_Z_MIGRACJA=1) dokłada po migracji jej WYCOFANIE: test ma wtedy być CZERWONY (stare zasady wracają).
# Zapisy testowe (obserwacje, znajomość, wiadomość, trening, komentarz, pojedynek, powiadomienia) giną przy rollback.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
wytnij() { sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d' "$1"; }
{ echo 'begin;'
  if [ "${E1_Z_MIGRACJA:-0}" = "1" ]; then wytnij supabase/migrations/20261231_obserwacje_i_powiadomienia_relacje.sql; fi
  if [ "${E1_Z_WYCOFANIEM:-0}" = "1" ]; then wytnij supabase/migrations/20261231_WYCOFANIE_obserwacje_i_powiadomienia_relacje.sql; fi
  cat tools/relacje-uprawnienia-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY E1 ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*\|obserwacje i powiadomienia:[^"\\]*\|E1 wycofane[^"\\]*\|E1 nie było[^"\\]*' | head -4 || true
echo "$OUT" | grep -q 'TESTY E1 ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
