#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# BUILD DLA CLOUDFLARE PAGES (gałąź `test`) — 08.10.2026, docs/srodowisko-testowe.md
# Cloudflare: Build command `bash tools/test-env/cf-build.sh`, Build output directory `dist`.
# Odpowiednik kroków deploy.yml dla prod (GitHub Pages zostaje BEZ ZMIAN):
#   · te same wykluczenia co „Stage site" (bez .github/tests/tools/docs/.ai/supabase/journal.txt) + bez CNAME
#   · tylko pliki ŚLEDZONE przez git (jak checkout w CI) — lokalnie nieśledzone /_* (surowe generacje,
#     ~170 MB) nie mogą trafić do artefaktu; bez gita STOP
#   · CACHE_VERSION podbity w dist/sw.js (na prod robi to deploy.yml; bez tego SW testu nie unieważniałby cache)
#   · tools/wersjonuj-zasoby.js na dist (?v=<hash>) — narzędzie odmawia katalogu z .git, więc NIE na korzeniu
#   · limity Cloudflare Pages Free: 20 000 plików, 25 MiB na plik
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
if ! git rev-parse --git-dir >/dev/null 2>&1; then echo "BŁĄD: build wymaga repo git (lista plików śledzonych)"; exit 1; fi
rm -rf dist; mkdir dist
git ls-files -z \
  | grep -zvE '^(\.github|tests|tools|docs|\.ai|supabase)/' \
  | grep -zvxE 'journal\.txt|CNAME' \
  | tar --null -T - -cf - | (cd dist && tar -xf -)
for k in tests tools docs .ai supabase journal.txt .git CNAME; do
  if [ -e "dist/$k" ]; then echo "BŁĄD: $k w artefakcie"; exit 1; fi
done
test -f dist/zawodnik.html || { echo "BŁĄD: brak zawodnik.html"; exit 1; }
SHA="${CF_PAGES_COMMIT_SHA:-$(git rev-parse HEAD)}"
WERSJA="biegamy-test-$(date -u +%Y-%m-%d)-${SHA:0:7}"
sed -i "s|const CACHE_VERSION = '[^']*';|const CACHE_VERSION = '$WERSJA';|" dist/sw.js
grep -q "const CACHE_VERSION = '$WERSJA';" dist/sw.js || { echo "BŁĄD: CACHE_VERSION nie podbity"; exit 1; }
# Artefakt testowy: flaga w dist/sb.js (PRZED wersjonowaniem — ?v= liczy się z treści po podmianie)
sed -i 's|^  var BM_ARTEFAKT_TESTOWY = false;$|  var BM_ARTEFAKT_TESTOWY = true;|' dist/sb.js
grep -q '^  var BM_ARTEFAKT_TESTOWY = true;$' dist/sb.js || { echo "BŁĄD: flaga artefaktu testowego nie ustawiona w dist/sb.js"; exit 1; }
grep -q "var BM_TEST = { nazwa: 'test', url: 'https://[a-z0-9]*\.supabase\.co', key: 'sb_publishable_" dist/sb.js || { echo "BŁĄD: brak kompletnej konfiguracji testowej w sb.js"; exit 1; }
if grep -q '^  var BM_ARTEFAKT_TESTOWY = true;$' sb.js; then echo "BŁĄD: flaga testowa w sb.js w REPO — trafiłaby na prod"; exit 1; fi
node tools/wersjonuj-zasoby.js dist
node tools/wersjonuj-zasoby.js dist --sprawdz
DUZY="$(find dist -type f -size +25M | head -1)"
if [ -n "$DUZY" ]; then echo "BŁĄD: plik > 25 MiB (limit Cloudflare): $DUZY"; exit 1; fi
PLIKOW="$(find dist -type f | wc -l)"
if [ "$PLIKOW" -gt 20000 ]; then echo "BŁĄD: $PLIKOW plików > 20000 (limit Cloudflare)"; exit 1; fi
echo "✓ dist gotowy: $WERSJA ($(du -sh dist | cut -f1), $PLIKOW plików)"
