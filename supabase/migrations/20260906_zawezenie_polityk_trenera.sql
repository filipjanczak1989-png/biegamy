-- Zawężenie trzech rodzin polityk, w których warunek sprawdzał ROLĘ albo
-- WŁAŚCICIELA WIERSZA, ale nie RELACJĘ, o którą naprawdę chodzi.
--
-- POWÓD SYSTEMOWY, NIE TRZY OSOBNE USTERKI. W ciągu tygodnia trzy razy wyszła
-- ta sama klasa (D7 → `trainings_athlete_update` → `signups_coach_read`), więc
-- zamiast łapać czwartą, przejrzeliśmy CAŁĄ migawkę z 29.08: 189 polityk na 67
-- tabelach, każda pod jednym pytaniem — czy warunek wiąże właściwą relację.
-- Ta migracja zamyka to, co z tego przeglądu wymagało decyzji i ją dostało.
--
-- ⚠️ CO SPRAWDZONO PRZED WYKONANIEM (żeby nie zabrać nikomu drogi, której używa):
--   • `service_role` ma `rolbypassrls = true`, a `FORCE RLS` na `training_logs`
--     i `nutrition_meals` jest WYŁĄCZONE — czyli sprzątanie duplikatów przez
--     `cc`/service_role omija RLS i te polityki nie są mu do niczego potrzebne.
--   • `trener.html` NIE KASUJE logów: zero wywołań `.delete()` na training_logs.
--   • `trener.html` pisze do `training_logs` w trzech miejscach i WYŁĄCZNIE
--     kolumny trenerskie: `coach_comment`, `coach_gif`, `read_by_coach`.
--   • `trener.html` do `nutrition_meals` tylko CZYTA — zero zapisów, więc nie
--     ma martwego przycisku do zdjęcia razem z politykami.

-- ── 1. training_logs: trener przestaje móc KASOWAĆ log zawodnika ────────────
-- `athletes_delete_own_logs` dawało prawo usunięcia wiersza zawodnikowi ORAZ
-- jego trenerowi. `privacy.html` obiecuje „dostęp… w celach coachingowych" —
-- kasowanie cudzego treningu nie mieści się w żadnym słowie tej obietnicy,
-- a jest nieodwracalne. Zasięg: 3191 wierszy.
-- ⚠️ Zawodnik NIE TRACI NIC: zostają `logs_delete` i `logs_delete_own`, obie
--    zawężone do jego własnych wierszy. (Że są DWIE robiące to samo, to osobny
--    dług — nie sprzątamy go tutaj, żeby ta migracja miała jeden temat.)
drop policy if exists "athletes_delete_own_logs" on public.training_logs;

-- ── 2. training_logs: zdjęcie DUPLIKATU uprawnienia do UPDATE ───────────────
-- ⚠️ TO NIE ZAMYKA TRENEROWI EDYCJI I TRZEBA TO WIEDZIEĆ. `athletes_update_own_logs`
--    było nadmiarowe po obu stronach: zawodnika pokrywa `logs_update`, trenera
--    `coach can mark logs read`. Po tym DROP-ie trener NADAL może zmienić każdą
--    kolumnę logu swojego zawodnika — bo tamta polityka, wbrew nazwie mówiącej
--    o „oznaczaniu jako przeczytane", nie ogranicza kolumn w żaden sposób.
--    RLS działa na WIERSZACH, więc zawężenia do trzech kolumn trenerskich
--    (`coach_comment`, `coach_gif`, `read_by_coach`) nie da się w niej wyrazić;
--    potrzebny jest trigger, tak jak przy `trainings` (20260906_trainings_guard_coach_plan).
--    Zapisane jako otwarte — ta migracja usuwa duplikat, nie udaje bramki.
drop policy if exists "athletes_update_own_logs" on public.training_logs;

-- ── 3. nutrition_meals: trzy polityki, które NIE MOGŁY ZADZIAŁAĆ ────────────
-- `nutrition_meals.athlete_id` trzyma `athletes.USER_ID`, nie `athletes.id`
-- (zmierzone: 171/171 pasuje do user_id, 0/171 do id). Trzy polityki trenera
-- łączyły po `a.id = nutrition_meals.athlete_id`, czyli po złej kolumnie —
-- warunek nie mógł być prawdziwy nigdy. Czwarta, SELECT, łączy poprawnie
-- po `a.user_id` i dlatego działa.
--
-- ⚠️ USUWAMY, ZAMIAST NAPRAWIAĆ — DECYZJA FILIPA Z 6.09.2026.
--    Jedzenie jest bliżej ciała niż plan. Wgląd wystarcza do rozmowy; edycja
--    daje możliwość nadpisania czyjegoś zapisu i nikt o nią nie prosił.
--    Naprawa złączenia dałaby trenerowi uprawnienie, którego świadomie nie
--    chcemy — a zostawienie martwych polityk zostawiłoby w migawce coś, co
--    wygląda jak działające uprawnienie i przy pierwszej „poprawce literówki"
--    ożyłoby bez niczyjej decyzji.
--    `coach_reads_athletes_meals` ZOSTAJE.
drop policy if exists "coach_inserts_athletes_meals" on public.nutrition_meals;
drop policy if exists "coach_updates_athletes_meals" on public.nutrition_meals;
drop policy if exists "coach_deletes_athletes_meals" on public.nutrition_meals;

-- ── 4. race_signups: „jesteś trenerem" → „jesteś TYM trenerem" ──────────────
-- `signups_coach_read` sprawdzało wyłącznie `EXISTS (coaches WHERE id = auth.uid())`,
-- czyli KAŻDY trener widział zapisy WSZYSTKICH 25 osób. `privacy.html` mówi
-- „Ty oraz TWÓJ trener". Trenerów jest dziś dwóch, więc ryzyko nie polegało na
-- tym, że zobaczy je ktoś obcy — tylko na tym, że polityka nie opisywała umowy,
-- którą zawarliśmy z ludźmi. Zasięg: 126 zapisów.
-- ⚠️ SKUTEK UBOCZNY DO ZNANIA: w races.html awatary uczestników (renderowane
--    tylko trenerowi) pokażą teraz WYŁĄCZNIE jego podopiecznych, a bąbel „+N"
--    liczy się z `races.signup_count`, czyli z sumy wszystkich. Liczba przy
--    awatarach będzie więc większa niż liczba twarzy — i to jest uczciwe:
--    tyle osób biegnie, tylu widzisz.
alter policy "signups_coach_read" on public.race_signups
  using (athlete_id in (select a.id from athletes a where a.coach_id = auth.uid()));

-- ══ SAMOKONTROLA — WYKONANA 6.09.2026, WYNIK PONIŻEJ ══════════════════════
-- ⚠️ SELECT na `pg_policies` dowodzi tylko, że polityka MA nową treść. Że
--    DZIAŁA — dowodzi wyłącznie podszycie się pod użytkownika. `supabase db
--    query` leci jako `postgres` z `rolbypassrls`, czyli ścieżką, która RLS
--    w ogóle nie dotyczy; bez `set local role authenticated` każdy taki test
--    świeciłby na zielono niezależnie od treści polityk.
--        begin;
--          set local role authenticated;
--          set local request.jwt.claims = '{"sub":"<user_id>","role":"authenticated"}';
--          <zapytanie>;
--        rollback;
--
--  1. race_signups oczami Filipa            93   (jego podopieczni)
--  2. race_signups oczami Kasi              12   (jej podopieczni)
--     kontrola z boku: Filip 93, Kasia 12, wszystkich 126 — przed migracją
--     każde z nich widziało 126
--  3. trener KASUJE log podopiecznego        0 wierszy   ← cel zmiany
--  4. trener zapisuje `coach_comment`        1 wiersz    ← panel działa dalej
--  5. zawodnik kasuje WŁASNY log             1 wiersz    ← nic nie stracił
--  6. trener CZYTA dietę podopiecznych      54 posiłki   ← wgląd zostaje
--  7. trener zmienia/kasuje cudzy posiłek    0 wierszy   ← edycja zdjęta
--  8. właściciel zmienia swój posiłek        1 wiersz    ← nic nie stracił
--
-- ⚠️ PUŁAPKA PRZY TEŚCIE 7: pierwsze podejście wyszło „1 zmieniony" i wyglądało
--    na porażkę zmiany. Powód: trener JEST TEŻ ZAWODNIKIEM, a trafiony wiersz
--    był jego własnym posiłkiem — zadziałało `users_update_own_meals`, nie
--    uprawnienie trenerskie. Test trzeba celować w posiłek CUDZY; inaczej mierzy
--    się własność, a nie relację trener–zawodnik.
-- ⚠️ SELECT na `pg_policies` dowodzi tylko, że polityka MA nową treść.
--    Że DZIAŁA — dowodzi wyłącznie podszycie się pod użytkownika:
--      begin;
--        set local role authenticated;
--        set local request.jwt.claims = '{"sub":"<user_id trenera>","role":"authenticated"}';
--        select count(*) from race_signups;      -- ma być tylko jego podopieczni
--      rollback;
