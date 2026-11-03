# Wniosek do Garmin Connect Developer Program (Starter) — treść do skopiowania (3.11.2026)

Formularz: https://www.garmin.com/forms/GarminConnectDeveloperAccess (poziom Starter: bezpłatny, tylko push, bez historii; OAuth 2.0 PKCE).
Pyta o: nazwę organizacji, WWW, URL polityki prywatności, kontakt, opis aplikacji, model biznesowy, spodziewaną liczbę użytkowników,
zakres danych/API, **wszystkie usługi trzecie przetwarzające dane Garmina** (w tym AI). Fakty poniżej są z kodu i z privacy.html;
nic nie jest wymyślone. Przed wysłaniem: zrobić poprawki w privacy.html / privacy-en.html z sekcji „Luki” (Garmin sprawdza stronę).

⚠️ Decyzja Filipa przed wysłaniem (pkt „AI”): dziś dane treningowe (w tym importowane z zegarka) trafiają do Anthropic (raporty, plany,
brief trenera, OCR) i do Google Gemini (Okienko — odpowiedzi o własnych treningach). Umowa Garmina (Rev. B 03/2026, §15.10 wg relacji
Sahha) wymaga jawnego oświadczenia o AI. Dwie drogi: (a) zadeklarować oba, (b) wyłączyć dane z Garmina z AI (osobna flaga na
`external_source`) i zadeklarować „no AI on Garmin data”. Tekst poniżej zakłada (a) — przy (b) usunąć zdania oznaczone [AI].

## PL — dla Filipa (co i dlaczego mówimy)

**Nazwa / organizacja:** BiegaMy (biegamy.run). Inicjatywa niekomercyjna prowadzona przez osobę fizyczną (Filip Jańczak), bez działalności
gospodarczej — tak stoi w privacy.html §1. Nie udajemy firmy; w polu „company” wpisujemy nazwę projektu, w opisie wprost „non-commercial,
coach-run”.

**Co to jest:** aplikacja PWA do prowadzenia biegaczy przez trenera: plan tygodniowy, dziennik treningów, forma (TSB), rekordy, cele startowe,
czat trener–zawodnik. Około 60 aktywnych zawodników, jeden trener. Treningi z zegarków importujemy dziś przez intervals.icu.

**Po co Garmin bezpośrednio:** niezawodność importu (dziś łańcuch Garmin → intervals → BiegaMy rwie się przy zmianie telefonu i zależy od
zgody Garmina na przekazywanie danych przez intervals) i mniejsza liczba pośredników przy danych zawodników.

**Jakie dane (tylko Activity API):** podsumowania aktywności (typ, czas startu, czas trwania, dystans, tempo, tętno średnie/maks., przewyższenie,
kalorie, urządzenie) i — jeśli dostępne na Starter — pliki FIT/szczegóły dla tras i stref tętna. NIE: Health API (sen, stres, Body Battery),
Women's Health, Courses, Training. Dane tylko użytkowników, którzy sami połączą konto Garmin w BiegaMy (OAuth 2.0, zgoda w Garmin Connect).

**Jak przechowujemy:** Supabase, centrum danych UE (Irlandia), HTTPS, dostęp przez RLS — dane widzi zawodnik i jego trener. Tokeny Garmina
tylko po stronie serwera (Edge Function), nigdy w przeglądarce.

**Usuwanie:** (1) użytkownik usuwa konto w aplikacji → wszystkie treningi i tokeny usuwane natychmiast (privacy.html §9); (2) użytkownik
odłącza Garmin w BiegaMy → token usuwany, import ustaje; (3) deregistracja po stronie Garmin Connect → webhook `deregistrations` → token
usuwany, import ustaje; (4) na żądanie e-mailem. Nie sprzedajemy danych, nie przekazujemy reklamodawcom, nie udostępniamy danych Garmina
innym aplikacjom ani osobom poza zawodnikiem i jego trenerem.

**Usługi trzecie przetwarzające dane:** Supabase (hosting/baza, UE); [AI] Anthropic (raporty i plany treningowe generowane na życzenie z danych
treningowych, przez API, bez trenowania modeli); [AI] Google Gemini (asystent „Okienko” odpowiadający zawodnikowi na pytania o jego własne
treningi). Brak narzędzi analitycznych i reklamowych.

**Model biznesowy:** brak — bez opłat, bez reklam, bez sprzedaży danych. **Użytkownicy:** 0–100 (dziś ~60).

**Atrybucja:** przy treningach z Garmina pokażemy „Dane: Garmin Connect” (wymóg §6.4 umowy); przy ekranie logowania Garmin pokaże „unverified”
(normalne dla Starter).

## EN — do wklejenia w formularz

**Organization / application name:** BiegaMy (biegamy.run) — a non-commercial, coach-run running-coaching web app operated by an individual
(Filip Jańczak, Poland). Not a registered company.

**Website:** https://biegamy.run — **Privacy policy:** https://biegamy.run/privacy-en.html (Polish: https://biegamy.run/privacy.html)
— **Contact:** biegamy.run@gmail.com

**Application description:** BiegaMy is a Progressive Web App used by one running coach and about 60 athletes. It provides weekly training
plans, a training log, form/fatigue tracking, personal records, race goals and coach–athlete messaging. Athletes' workouts are currently
imported through intervals.icu; we want to connect Garmin directly so that the import is reliable (no intermediary) and so that athletes'
data passes through fewer third parties.

**Intended use of Garmin data:** Activity API only. We will receive activity summaries (type, start time, duration, distance, pace, average
and maximum heart rate, elevation gain, calories, device) and, where available, activity details/FIT files for route and heart-rate zones.
We do not request Health, Women's Health, Courses or Training APIs. Data is used solely to show the athlete's own workouts to the athlete
and to their coach, and to compute training load for the athlete. Only users who explicitly connect their Garmin account in BiegaMy
(OAuth 2.0 consent in Garmin Connect) are affected.

**Data storage and security:** Data is stored in Supabase (PostgreSQL) in the EU (Ireland), transmitted over HTTPS and protected by row-level
security: each workout is visible only to the athlete and their coach. Garmin access tokens are held server-side only (never sent to the
browser). Garmin data is not sold, not shared with advertisers and not redistributed to any other application or third party.

**Data retention and deletion:** Garmin data is kept only while the user keeps a BiegaMy account and the Garmin connection. It is deleted
immediately when (1) the user deletes their account in the app (self-service, all workouts and tokens are removed), (2) the user disconnects
Garmin in BiegaMy, (3) we receive a deregistration notification from Garmin (we stop ingestion and delete the token), or (4) the user asks
by e-mail. Deregistration and user-permission-change notifications will be handled by our webhook endpoint.

**Third-party services that process Garmin data:** Supabase (hosting and database, EU). [AI] Anthropic API (Claude): on the athlete's or
coach's request, training-log data (which may include Garmin-sourced workouts) is sent to generate a written training report or plan; the
API does not train on this data. [AI] Google Gemini API: an in-app assistant answers an athlete's questions about their own workouts. No
analytics, advertising or tracking services.

**Business model:** none — free, no ads, no data monetisation. **Expected users:** 0–100 (about 60 today).

**Attribution and display:** Garmin-sourced workouts will be labelled "Data from Garmin Connect" in the app.

**Technical setup:** Supabase Edge Functions (Deno) will host the OAuth 2.0 (PKCE) flow and the HTTPS push endpoint for activity, deregistration
and user-permission-change notifications. Typical expected volume: under 100 activities per day.

## Luki w privacy.html / privacy-en.html wobec wymagań Garmina (do poprawy PRZED wysłaniem)

1. **Google Gemini nie jest wymieniony** w §5 (procesorzy), a kod wysyła tam pytania Okienka (okienko, okienko-v2) i generuje okładki
   (okladki-imprez, race-image — bez danych osobowych). To luka niezależna od Garmina: polityka mówi tylko o Anthropic. Dodać pozycję
   „Google (Gemini)” z zakresem: treść pytania w Okienku i dane treningowe potrzebne do odpowiedzi; okładki bez danych osobowych.
2. **Garmin jako bezpośrednie źródło:** §2 „Klucze integracji” i §5 mówią o intervals.icu i Stravie. Dodać „Garmin Connect” (po akceptacji):
   co pobieramy (aktywności), podstawa = zgoda, tokeny po stronie serwera, atrybucja „Dane: Garmin Connect”, usunięcie przy odłączeniu,
   deregistracji w Garmin Connect i usunięciu konta.
3. **Usuwanie danych Garmina przy deregistracji** — §9 opisuje usunięcie konta i odłączenie integracji, brakuje zdania o deregistracji po
   stronie Garmina (webhook) i o tym, że po odłączeniu zaimportowane treningi ZOSTAJĄ (dziś tak jest dla intervals — zdanie jest; dla
   Garmina trzeba zdecydować: zostają czy nie; umowa Garmina skłania do „usuwamy dane Garmina na żądanie/deregistrację”).
4. **Strava** jest opisana jako działająca integracja (§2, §3, §5, §9), a w kodzie jej nie ma (brak EF, brak tokenów) — Garmin może to
   porównać z aplikacją; usunąć albo oznaczyć „planowane”.
5. **§6 „Kto widzi Twoje dane”** mówi, że izolacja między zawodnikami „jest dopiero wdrażana” i część danych profilowych innych jest
   widoczna — po przeglądzie RLS (6.9.2026, 189 polityk) to zdanie jest nieaktualne i przy wniosku szkodzi. Zaktualizować.
6. **AI na danych Garmina** — jeśli (a): dopisać w §5 przy Anthropic i Gemini, że dotyczy też treningów z zegarka; jeśli (b): dopisać
   „dane z Garmina nie są przekazywane do usług AI”.
7. **Data i wersja** („Obowiązuje od 1 lipca 2026, wersja 1.0”) — podbić przy zmianie; EN musi być równoległe (privacy-en.html to osobny plik).
8. Formalnie OK już teraz: administrator i kontakt (§1), lokalizacja danych UE (§6), RLS, tokeny po stronie serwera, samodzielne usunięcie
   konta (§9), brak sprzedaży danych, brak cookies śledzących.
