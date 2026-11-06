#!/usr/bin/env bash
# Czy małe kopie z biegamy-assets/m/ (tools/male-obrazy-m.txt) i logo LOG są pod adresem. Tylko odczyt (curl -I), nic nie zmienia.
# Wynik: liczba 200 i lista adresów z innym kodem. Kod wyjścia 1, gdy którykolwiek adres nie daje 200 image/*.
set -uo pipefail
cd "$(dirname "$0")/.."
B=https://filipjanczak1989-png.github.io/biegamy-assets
ok=0; zle=0
sprawdz() {
  local h kod typ
  h="$(curl -sI "$1" | tr -d '\r')"
  kod="$(printf '%s\n' "$h" | awk 'NR==1{print $2}')"
  typ="$(printf '%s\n' "$h" | awk -F': ' 'tolower($1)=="content-type"{print $2}')"
  if [ "$kod" = 200 ] && [[ "$typ" == image/* ]]; then ok=$((ok + 1)); else zle=$((zle + 1)); echo "NIE: $kod $typ $1"; fi
}
sprawdz "$B/bm-nav.webp"
while read -r f; do [ -n "$f" ] && sprawdz "$B/m/$f"; done < <(tr -d '\r' < tools/male-obrazy-m.txt)
echo "200: $ok, inne: $zle"
[ "$zle" -eq 0 ]
