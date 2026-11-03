# ZWIAD: bezpośrednia integracja z producentami zegarków (3.11.2026) — tylko docs, budowa po 8.11

Powód: przypadek Kasi (zmiana telefonu → Garmin przestał wysyłać do intervals.icu, naprawa z dużym tarciem). Pytanie Filipa: czy iść
w Garmin bezpośrednio (Garmin Connect Developer Program — Activity API) i co z resztą. Zwiad z sieci (agent badawczy, 71 zapytań);
liczby z Garmina są skąpe — tam, gdzie źródło jest wtórne (DC Rainmaker, Sahha, OpenWearables), jest to oznaczone. Nic tu nie zbudowano.

## 0. Odkrycie, które zmienia tło

Garmin zmienił warunki dla partnerów (nowe T&C w portalu, bez ogłoszenia). Twórca intervals.icu napisał 9.10.2026: *„It is likely that
we will have to block access to Garmin data via the API soon”* [I1]. Intervals Pro zamknęło się 12.10 z tego powodu [I2]. Zakres: dane
z Garmina **przekazywane dalej przez API intervals.icu** (aktywności, FIT, strumienie, wellness, historia) [I2][I3]. Pliki FIT wgrane
ręcznie — „likely ok” [I3]. Daty blokady brak; 24.10 potwierdzenie, że aplikacje używające intervals jako mostu będą ograniczone
[I3, relacja z wątku]. Dane COROS/Polar/Suunto przez intervals — „na razie” nietknięte [I2].

**Dla BiegaMy: ścieżka Garmin → intervals → BiegaMy jest zagrożona niezależnie od resynchronizacji po zmianie telefonu.** To, a nie
tarcie Kasi, jest głównym argumentem za Garminem bezpośrednio. Przed decyzją sprawdzić status na forum intervals (wątek [I1]).

## 1. Garmin Connect Developer Program

Program był zamknięty dla nowych zgłoszeń od marca do 21.10.2026 (zalew wniosków „AI”), otwarty ponownie z trzema poziomami [G1][G2][G3].

| | Personal | Starter | Enterprise |
|---|---|---|---|
| Dla kogo | osoba, własne dane | „organizations building apps”; formularz „for businesses, organizations and other commercial entities” | firmy „operating at scale” |
| Koszt | 0 | 0 (do ~1000 użytkowników wg DCR; Garmin liczby nie podaje) | 1000 USD wpisowe + opłata per aktywny użytkownik/mies., negocjowana |
| Dostarczanie | pull only | **push only** | push lub ping/pull |
| Historia (backfill) | nie podano | **„Not included”** | „1 month +” |
| API | Activity (JSON+FIT), Health, Women's Health | + Courses, Training | + Golf, wsparcie |
| Wniosek | klucz w Garmin Connect, sekundy | formularz → „immediate access” wg FAQ, portal „po zatwierdzeniu” | po Starter |

- **Osoba prywatna / hobby?** FAQ: „from individual developers and startups to companies” [G5]. Formularz (`garmin.com/forms/GarminConnectDeveloperAccess`)
  składa podmiot, który „owns, operates, or distributes” aplikację; pyta o nazwę firmy, WWW, **URL polityki prywatności** (odrzucenie, gdy była tylko
  w apce — relacja z forum [G6]), model biznesowy, liczbę użytkowników (0–100 / 100–1000 / >1000) i **wszystkie usługi trzecie przetwarzające
  dane Garmina** (analityka, ML/AI) [G3][G6]. Czy jednoosobowa niekomercyjna inicjatywa przejdzie — **nie znaleziono** [G7].
- **Czas akceptacji:** nie podano; DCR: „virtually instant” dla Starter; dawniej do 2 tygodni [G2][G6]. „Typical integration 1–4 weeks” [G5].
- **OAuth:** 2.0 z PKCE S256 [G5][G8]; 1.0a w wygaszaniu (31.12.2026 wg źródła wtórnego) [G9].
- **Dane:** push = Garmin POST-uje payload na nasz URL; ping/pull tylko Enterprise. Webhooki także `deregistrations` i `userPermissionsChange`
  [G10]. Backfill: jeden endpoint na typ, okno ~30 dni, raz na typ/okno (duplikat = 409), **tylko Enterprise** [G2][G11]. intervals dostało
  osobną zgodę na 1 rok wstecz [I4].
- **Limity:** oficjalnie **nie znaleziono**; wtórnie ~100 req/min [G11].
- **Po naszej stronie:** publiczny HTTPS endpoint na webhooki (EF Supabase wystarczy, `verify_jwt=false` + sekret/podpis), tabela tokenów,
  obsługa deregistracji (usunięcie danych), mapowanie typów na `trainings`/`training_logs`, deduplikacja z intervals (ta sama aktywność z dwóch
  źródeł — reguła „kto wygrywa”), prywatność: dane Garmina z atrybucją, bez przekazywania dalej.
- **Obowiązki (umowa Rev. B 03/2026, relacja Sahha [G3]):** zakaz udostępniania klucza i API trzecim bez zgody (5.2); atrybucja Garmina na
  danych i pochodnych (6.4); AI wymaga jawnego oświadczenia i zgody (15.10); wypowiedzenie 30 dni. Starter = „unverified” na ekranie logowania [G12].

## 2. Strava — NIE

- Limity per aplikacja: 200/15 min i 2000/dobę (odczyt 100 / 1000). Nowe apki: **1 sportowiec** („Single Player Mode”), samodzielnie do **10**;
  wyżej — przegląd Strava bez gwarancji [S1].
- Od 1.06.2026 poziom Standard **wymaga subskrypcji Strava u dewelopera**; Extended ≥ 10 000 użytkowników; nowy host `api-v3` od 4.01.2027 [S2].
- **Trener widzi dane zawodnika?** API Policy §2.3/§6.1: dane „may be displayed … only to that user”; wyjątek dla ≤ 9 999 niejasny; o trenerach
  ani słowa [S3]; pytanie na forum bez odpowiedzi [S4]. Cache ≤ 7 dni, usunięcie w 30 dni po cofnięciu zgody, zakaz AI, zakaz pośredników.
- Webhook cienki (id), dane dociąga się REST-em; backfill = zwykłe listowanie w limicie [S6]. Werdykt: prawnie niepewna + płatna.

## 3. COROS, Suunto, Polar

- **COROS** — *Partner API* dla „platforms with an established user base”: wniosek na api@coros.com, OAuth 2.0, **webhook push ~5 min**, FIT,
  sandbox; brak kryterium „established”, cennika i czasu akceptacji (support.coros.com 403) [C1][C2][C3]. *MCP self-service* — tylko własne
  konto [C4]. 60 zawodników może nie być „established”.
- **Suunto Cloud API** — tylko firmy/organizacje („not for personal use”), wniosek przez Partner Program, odpowiedź ~2 tyg., umowa; limit
  **10 wywołań/min, 200/tydz.** (wyższy na prośbę); OAuth2, webhook per workout → FIT [U1][U2].
- **Polar AccessLink** — **każdy użytkownik Polar Flow może założyć klienta API** bez wniosku; OAuth2, token bez wygasania; webhook z HMAC
  (dezaktywacja po 7 dniach bez dostaw); FIT/TCX/GPX; **historia tylko 30 dni i tylko po rejestracji użytkownika**; limity 500+20×użytk./15 min
  [P1][P2].

## 4. Jedno konto w dwóch aplikacjach naraz

Garmin Connect pozwala na wiele „Connected Apps” (Strava + intervals to typowy układ) [I5]; limit — nie znaleziono. Zastrzeżenia: Garmin pamięta
wykonane backfille i odrzuca duplikaty (historia dla drugiej apki niegwarantowana) [I4]; dane Garmina pobrane przez intervals nie mogą być
udostępniane dalej (pkt 0). Polar/Suunto/COROS: brak udokumentowanego zakazu wielu partnerów.

## 5. Porównanie

| | Garmin Starter | Strava | COROS Partner | Suunto | Polar |
|---|---|---|---|---|---|
| Osoba fizyczna, bez firmy | niepewne | tak, ale subskrypcja | nie | nie | **tak** |
| Koszt | 0 (do ~1000 u.) | subskrypcja | nie podano | nie podano | nie podano |
| Trener widzi dane | tak (zakazu nie znaleziono) | **wątpliwe** | tak | tak | tak |
| Push/webhook | push | webhook | push ~5 min | webhook | webhook |
| Historia | **brak** | w limicie | nie podano | lista workoutów | 30 dni |
| FIT | tak | nie | tak | tak | tak |
| Czas do dostępu | „immediate” (niezweryfikowane) | od razu (1→10) | nie podano | ~2 tyg. | od razu |

## 6. Rekomendacja (szacunki własne, niepewne; EF Deno + tabela tokenów + webhook + mapowanie)

1. **Garmin Starter — najpierw, zaraz po 8.11** (~4–6 dni roboczych + oczekiwanie). Najwięcej zawodników, droga przez intervals w trakcie
   zamykania, OAuth2 PKCE i push pasują do EF. Ryzyka: brak firmy (potrzebna polityka prywatności na domenie biegamy.run, odpowiedź
   „non-commercial, coach-run”), **brak historii** (stary dorobek zostaje w intervals / ręczny FIT), „unverified” przy logowaniu.
2. **Polar — równolegle, tanio** (~2–3 dni): zero formalności, dobry test architektury webhook → FIT → `trainings`.
3. **COROS Partner — złożyć wniosek** (~3–4 dni po akceptacji; czas nieznany).
4. **Suunto** — tylko gdy pojawi się zawodnik z Suunto.
5. **Strava — nie.**

**Obie ścieżki naraz** (Garmin bezpośrednio + intervals dla reszty) są wykonalne i wręcz wymuszone: intervals zostaje dla COROS/Suunto/Polar
i jako historia; Garmin idzie bezpośrednio. Warunek: deduplikacja między źródłami i jedna reguła „kto wygrywa”.

Przed startem: aktualne T&C Garmina (klauzula o przekazywaniu danych trzecim dotyczy też nas) i status blokady na forum intervals.

## Źródła

- [G1] https://developer.garmin.com/gc-developer-program/overview/
- [G2] https://www.dcrainmaker.com/2026/10/garmin-connect-api-revamps-connect-developer.html
- [G3] https://sahha.ai/blog/garmin-connect-api-reopened-fees/
- [G4] https://developerportal.garmin.com/developer-programs/connect-developer-api
- [G5] https://developer.garmin.com/gc-developer-program/enterprise/program-faq/
- [G6] https://forums.garmin.com/developer/connect-iq/f/discussion/434542/ ; formularz: https://www.garmin.com/forms/GarminConnectDeveloperAccess
- [G7] https://forums.garmin.com/developer/connect-iq/f/discussion/441459/
- [G8] https://nango.dev/docs/api-integrations/garmin-oauth2
- [G9] https://github.com/stoufa06/php-garmin-connect-api/issues/23
- [G10] https://github.com/crvouga/mockingbird/issues/545
- [G11] https://openwearables.io/docs/providers/garmin-api-integration
- [G12] https://appsforstrava.com/blog/garmin-connect-developer-program-personal-api-key
- [I1] https://forum.intervals.icu/t/api-access-to-intervals-icu/609/752
- [I2] https://the5krunner.com/2026/10/14/garmin-api-intervals-third-party-apps/
- [I3] https://github.com/platypus45/domestique/issues/29
- [I4] https://forum.intervals.icu/t/garmin-connect-history-now-only-goes-back-one-year-max/3906
- [I5] https://forum.intervals.icu/t/solved-automatically-sync-garmin-activities-with-intervals-icu/35392
- [S1] https://developers.strava.com/docs/rate-limits/
- [S2] https://sahha.ai/blog/strava-api-changes-2026/ ; https://developers.strava.com/docs/changelog/
- [S3] https://www.strava.com/legal/api_policy
- [S4] https://communityhub.strava.com/developers-api-7/api-policy-2026-can-an-athlete-explicitly-authorize-their-coach-to-view-their-strava-data-14020
- [S6] https://hookdeck.com/webhooks/platforms/guide-to-strava-webhooks-features-and-best-practices
- [C1] https://support.coros.com/hc/en-us/articles/53181766856724-Partner-API-Access (403 przy pobraniu)
- [C2] https://support.coros.com/hc/en-us/articles/17085887816340-Submit-an-API-Application
- [C3] https://nango.dev/docs/integrations/all/coros
- [C4] https://support.coros.com/hc/en-us/articles/53181619102996-Build-on-COROS-MCP
- [U1] https://apizone.suunto.com/faq ; https://apizone.suunto.com/how-to-start
- [U2] https://openwearables.io/docs/providers/suunto-api-integration
- [P1] https://www.polar.com/accesslink-api/
- [P2] https://openwearables.io/docs/providers/polar-api-integration

Metodyka: support.coros.com i blog portalu Garmina zwracały 403; licencja Polar (PDF) i strona partnerska Suunto — 404.
