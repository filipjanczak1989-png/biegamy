# Projekt F — audyt całości przed sobotą (2.11.2026, wieczór)

Świeże oko (agent tylko do odczytu, stan repo `543cc7c`), potem poprawki. Reguła Filipa: **bez migracji — od razu; z migracją — pokazać.**

## Naprawione tego samego wieczoru (bez migracji)

| # | Ryzyko | Co było | Poprawka |
|---|---|---|---|
| 1 | **wysokie** | `sw.js` znało tylko `.js` — 7 modułów `.mjs` z precache szło do sieci. Bez sieci po >10 min `js/akcja-cytaty.mjs` nie wstawał → `OKNO_OD = NaN` → guzik nigdy się nie uzbrajał, a `setTimeout(NaN)` kręcił pętlę. | regex `m?js`; w `start-akcji.html` bez modułu jasny błąd „włącz sieć i odśwież” zamiast pętli. |
| 2 | **wysokie** | Wygasły token (1 h) + brak sieci → `getSession()` = null → „Zaloguj się”, guzik znika, choć sesja jest w pamięci telefonu. | guzik zostaje, gdy w `localStorage` jest `sb-*-auth-token`; naciśnięcie zapisuje się lokalnie, RPC leci po powrocie sieci. |
| 3 | średnie | Zakładka `?proba=1` po próbie generalnej: w sobotę naciśnięcie wystartowałoby PRÓBĘ, nie akcję (obrona = napis PRÓBA). | w oknie startu `?proba=1` odmawia: „Dziś jest prawdziwy start. Otwórz start-akcji.html bez ?proba=1”. |
| 6 | średnie | 22023 (serwer: przed 06:00, bo zegar telefonu spieszy) kasowało naciśnięcie. | naciśnięcie zostaje, ponawiamy co 30 s do końca okna; po oknie — czyścimy jak dotąd. |
| 9 | niskie | EF `akcja-licznik` oddawała anonowi `?slug=proba` (po próbie: „Próba guzika”, `testowa: true`). | akcja testowa → 404. |
| 10 | niskie | Strony publiczne pokazywały „Zrobiliśmy to” i chowały „Dołącz” w chwili dobicia sumy (`zamknieta`), kilkanaście godzin przed zamknięciem doby (`koniec`); karta Dziś mówiła „trwa”. | `dla-fabianka.html` i `index.html` idą po `koniec`, jak karta Dziś. |

Blizna-96 pilnuje 1, 2, 3, 6, 9 (regexy na kod). Pozycje 5 i 14 z listy audytu sprawdziłem: EF `akcja-push` ma już try/catch na odbiorcę (jeden błąd nie wywraca reszty); stan modułu okienka jest ustawiany synchronicznie tuż przed `dopasuj()` (komentarz w `okienko/index.ts`).

## Wymagały migracji — OK Filipa 2.11 wieczorem, NA PROD (`20261102_akcja_push_nie_blokuje_startu.sql`)

Test: `tools/akcje-test-transakcji.sql` część 12 — 66/66; bez migracji 12a czerwone. ⚠️ Błędu w `net.http_post` nie da się wstrzyknąć z roli `postgres` (`net.*` i `vault.*` należą do `supabase_admin`), więc osłona jest sprawdzana po kształcie definicji, a zachowanie bez błędu (start + 1 żądanie w kolejce) na danych.

**4. Wyzwalacz pushu może wycofać sam start** (`akcje_push_start`, AFTER UPDATE w transakcji `akcja_start`): wyjątek z `net.http_post` albo z odczytu Vault = rollback `wystartowala_at`; telefon dostaje błąd ≠ 42501/22023 i ponawia bez końca. Mało prawdopodobne (pg_net tylko wstawia do kolejki), ale push nie powinien móc zablokować startu.

```sql
create or replace function public.akcje_push_start() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if old.wystartowala_at is null and new.wystartowala_at is not null and new.push_start_at is null then
    begin
      perform net.http_post(
        url     := 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/akcja-push',
        headers := jsonb_build_object('Content-Type', 'application/json',
                   'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_hook_secret')),
        body    := jsonb_build_object('rodzaj', 'start', 'slug', new.slug));
    exception when others then
      raise warning 'akcje_push_start: push nie wysłany (%), start zapisany', sqlerrm;   -- start ważniejszy niż push
    end;
  end if;
  return new;
end $fn$;
```
Cena: gdyby push nie poszedł, nikt nie dostanie powiadomienia o starcie, a trigger nie odpali drugi raz (`wystartowala_at` już ustawione). Ręczne wyjście: EF `akcja-push` `{rodzaj:'start', slug}` z sekretem.

**7. `akcja_km_okna` dla `service_role` tylko z default ACL** — żadna migracja nie daje jawnego grantu; `share-card` (karta akcji) i `akcja-push` (niedziela) polegają na `pg_default_acl`. Gdyby zniknął: „brak kilometrów w akcji” i „Ten tydzień: 0 km” bez błędu.

```sql
grant execute on function public.akcja_km_okna(uuid, date, date, uuid[]) to service_role;
do $$ begin
  if not has_function_privilege('service_role', 'public.akcja_km_okna(uuid, date, date, uuid[])', 'execute') then raise exception 'km_okna: service_role'; end if;
  if has_function_privilege('authenticated', 'public.akcja_km_okna(uuid, date, date, uuid[])', 'execute') then raise exception 'km_okna: authenticated'; end if;
end $$;
```

Obie w jednej migracji, wykonanej 2.11 wieczorem.

## Decyzje, nie kod

- **8. Imię i nazwisko są już publiczne — DECYZJA Filipa 2.11: świadoma akceptacja.** Powody: GitHub Pages wymaga publicznego repo; nazwisko i tak jest w publicznym linku zbiórki (siepomaga); o chorobie nie ma ani słowa nigdzie. Stan faktyczny: nazwisko w `supabase/migrations/20261102_akcje_dane_zbiorki.sql` (URL siepomaga; historia gita na zawsze) i w `docs/akcja-f-spec.md`; imię w `start-akcji.html`, `js/akcja-cytaty.mjs` (precache u wszystkich, „view source”), `router.mjs` (`fabian`), nazwa pliku `dla-fabianka.html` i slug w żądaniu EF od 2.11. Reguła „nic przed startem” jest dziś spełniona dla *stron* (teaser), nie dla *repo*. Opcje: repo prywatne do 7.11 albo świadoma akceptacja. Nie da się cofnąć nazwiska z migracji bez przepisania historii.
- **11. Liczenie podwójne (zegarek + ręcznie) — BACKLOG PO STARCIE (decyzja Filipa 2.11: nie teraz).** dedup tylko w `intervals-sync` (ta sama doba, bieg, dystans ±5 %) i tylko gdy import idzie PO wpisie ręcznym; ręczny PO imporcie = pytanie „drugi trening?” bez blokady. W `akcja_km_okna` brak dedupu; obrona = `cap_km_doba` 100 km/osobę/dobę. Zostawiamy (świadomie).
- **12. `logged_at` z intervals bez offsetu** — `start_date_local` zapisywany jako UTC: bieg 23:00–23:59 CET ląduje w następnej dobie warszawskiej. Przesuwa dzień, nie gubi km. Osobny temat, poza akcją.
- **13. Odznaki km wstawiane z przeglądarki** — jak wszystkie odznaki w apce (`achievements_okno` pilnuje okna, nie progu). Próg w triggerze = migracja; nie na sobotę.
- **15. Cron zamknięcia 23:15 UTC** — w listopadzie 00:15 CET, OK; po 28.03.2027 01:15 — dalej „wczoraj”. Jedna nieudana noc = `koniec` o dobę później.

## Backlog po starcie (7.11+)
- Dedup zegarek + ręczny wpis w `akcja_km_okna` (ta sama doba, bieg/chód, dystans ±5 % — jak `_shared/kolizja-importu.mjs`) albo blokada ręcznego wpisu PO imporcie; dziś obrona = cap 100 km/dobę.
- Próg km odznak akcji w triggerze (dziś `achievements_okno` pilnuje tylko okna).
- `logged_at` z intervals bez offsetu (`start_date_local` jako UTC) — bieg 23:00–23:59 CET w następnej dobie.
- Plakat: napis „Liczy się każdy kilometr” zostaje (decyzja Filipa 2.11) mimo zasady „bieg i spacer”.

## Sprawdzone i OK (z audytu)
Idempotencja startu (`for update` + `where wystartowala_at is null`, EF CAS na `push_start_at`); okno i strefa (klient `+01:00`, serwer `Europe/Warsaw`, czas klienta tylko w oknie i ≤ now+2 min); granty (anon zero na `akcja_*`, `akcja_km_okna` bez EXECUTE dla authenticated → `p_tylko` nieosiągalne z przeglądarki, wszystko po `auth.uid()`); licznik przed startem (same agregaty, asercje grepują imię/nazwisko/siepomaga); SW (nawigacja network-first 3 s, `?proba=1` pokryte `ignoreSearch`, `/functions/v1/` i RPC poza SW); zamknięcie (`koniec = wczoraj` tylko gdy suma ≥ cel, km dnia dobicia liczone do końca doby); odznaki (okno front + trigger, seria 7 od startu, sponsor w transakcji deklaracji); share-card (akcja testowa, wymaga `wystartowala` i `moje_km > 0`); sekret `x-push-secret` obowiązkowy.
