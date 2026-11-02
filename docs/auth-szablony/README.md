# Szablony maili Supabase Auth — BiegaMy (1.11.2026)

Trzy pliki do wklejenia w **Dashboard → Authentication → Emails → Templates** (pole „Message body"; temat w „Subject"):

| plik | szablon w Dashboardzie | temat |
|---|---|---|
| `reset-hasla.html` | Reset Password | Ustaw nowe hasło w BiegaMy |
| `potwierdz-konto.html` | Confirm signup | Potwierdź konto w BiegaMy |
| `zmiana-email.html` | Change Email Address | Potwierdź nowy adres e-mail w BiegaMy |

- Zmienne Supabase: `{{ .ConfirmationURL }}` (link akcji — przy resecie zawiera `redirectTo=…/index.html?reset=1`
  z aplikacji, blizna-85), `{{ .Email }}`, `{{ .NewEmail }}` (tylko zmiana adresu). Style inline, układ tabelami —
  klienci poczty wycinają `<style>`. Bez słowa „AI".
- „Confirm signup" ma znaczenie tylko przy włączonym potwierdzaniu adresu (dziś 83/90 kont potwierdzonych bez maila).
- Zmiany e-maila aplikacja dziś nie oferuje (0 prób w bazie) — szablon jest na zapas, żeby po angielsku nic nie wyszło.

## SMTP przez Resend (zwiad 1.11.2026)
- Domena **biegamy.run** jest skonfigurowana w Resend: DKIM `resend._domainkey.biegamy.run`, ścieżka zwrotna
  `send.biegamy.run` (MX + SPF → Amazon SES eu-west-1), SPF na `biegamy.run`. EF `send-report-email` wysyła z
  `BiegaMy <noreply@biegamy.run>`. Stanu „Verified" w panelu Resend nie widzę (bez klucza) — DNS jest kompletny.
- **Brak rekordu DMARC** (`_dmarc.biegamy.run`). Dla małego ruchu działa, ale Gmail/Yahoo coraz częściej go wymagają —
  dodaj `v=DMARC1; p=none; rua=mailto:biegamy.run@gmail.com` (TXT `_dmarc`), po tygodniu bez problemów `p=quarantine`.
- Klucz: **nowy, osobny** klucz API w Resend (uprawnienie „Sending access", domena biegamy.run) — nie stary z historii
  repo (13.09: wyciekł w historii na zawsze, `project_zaleglosc_klucz_resend_w_repo`).

## Instrukcja dla Filipa (5 linijek)
1. Resend → API Keys → Create: nazwa „supabase-auth-smtp", Sending access, domena biegamy.run → skopiuj klucz.
2. Supabase → Authentication → Emails → SMTP Settings → Enable custom SMTP: host `smtp.resend.com`, port `465`, user `resend`, hasło = klucz z pkt 1.
3. Tamże: Sender email `noreply@biegamy.run`, Sender name `BiegaMy`; zapisz. Potem Rate Limits → „emails per hour" podnieś z 2 (np. 30).
4. Templates: wklej trzy pliki z tej teczki + tematy z tabeli wyżej.
5. Test: index.html → „Zapomniałem hasła" na koncie testowym → mail po polsku od BiegaMy → link → „Ustaw nowe hasło".

## Stan 2.11.2026 (zwiad dnia 6 projektu F) i weryfikacja
- **„Confirm email" jest WYŁĄCZONE** (`/auth/v1/settings`: `mailer_autoconfirm: true`) → **rejestracja nie wysyła maila**
  i nie zatrzymuje się na limicie maili: 50 rejestracji w 2 h po poście przejdzie (limit rejestracji jest liczony od IP,
  a każdy rejestruje się ze swojego telefonu). Logowanie Google też jest włączone.
- Mail idzie przy **resecie hasła** (i ewentualnie linku magicznym). Na wbudowanym SMTP Supabase to **2 maile na godzinę
  dla całego projektu** — 7.11 kilka osób z „Zapomniałem hasła" utknie. Dlatego SMTP Resend (instrukcja wyżej) przed 7.11.
- Czy SMTP jest już ustawione i jakie są limity — z tej sesji niewidoczne (Dashboard → Authentication → Emails / Rate Limits).
- **Dodatkowo do instrukcji:** 6. Resend → API Keys → **usuń stary klucz** (ten z historii repo, 13.09) — „Revoke".
  7. DNS: TXT `_dmarc.biegamy.run` = `v=DMARC1; p=none; rua=mailto:biegamy.run@gmail.com`.
- **Weryfikacja (cc, po słowie Filipa „SMTP gotowe"):** jeden reset hasła na konto testowe (`biegamy.run@gmail.com`) przez
  publiczne API → Filip potwierdza: mail po polsku od „BiegaMy <noreply@biegamy.run>", link prowadzi do „Ustaw nowe hasło".
