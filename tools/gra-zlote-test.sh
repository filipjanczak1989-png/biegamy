#!/usr/bin/env bash
# ZŁOTE CEGŁY NA PRAWDZIWEJ AKCJI: runda zwykłego konta przez gra_start_rundy i gra_zapisz_wynik w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# Pokazuje saldo, mur, punkty i miejsce w rankingu. Grę włącza tylko w tej transakcji (gra_aktywna), wystartowala_at nie rusza, więc bez pushu startu.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  tr -d '\r' < tools/gra-zlote-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY ZLOTYCH ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY ZLOTYCH ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
