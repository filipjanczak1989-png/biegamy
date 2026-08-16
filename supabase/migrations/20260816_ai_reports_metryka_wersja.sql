-- ─────────────────────────────────────────────────────────────────────────────
-- ai_reports.metryka_wersja — którą metodą policzono liczby formy w raporcie.
--
-- POWÓD. Do 16.08.2026 EF raportów liczyły CTL/ATL/TSB naiwną EMA od zera,
-- bez FORMA-SEED, którego aplikacja używa od dawna (`sb.js:3212`). Zmierzone
-- na 23 zawodnikach: u 10 z nich raport nazwałby stan formy INNĄ kategorią
-- niż wykres, który widzi ten sam człowiek. Największy rozjazd: 58 punktów
-- TSB (raport „świeżość", aplikacja „obciążenie").
--
-- ⚠️ ISTNIEJĄCYCH RAPORTÓW NIE PRZELICZAMY. Raport jest zapisem tego, co model
--    wtedy dostał — przeliczenie zrobiłoby z niego dokument, którego nigdy nie
--    było. Zamiast tego ZNACZYMY, a `raporty.html` mówi o tym czytelnikowi.
--
-- ⚠️ NULL = stara metoda (bez seeda). Celowo NIE ma wartości domyślnej dla
--    starych wierszy: brak znacznika ma znaczyć „nie wiemy dokładnie jak",
--    a nie udawać wersję, której wtedy nie było.
--
-- To odpowiedź na tę samą pułapkę co `raw_data_snapshot`, który nie zawierał
-- czatu ani screenów — przez co audyt po nim oskarżał model o zmyślenie treści,
-- którą dostał. Dane bez znacznika pochodzenia mylą w obie strony.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.ai_reports add column if not exists metryka_wersja text;

comment on column public.ai_reports.metryka_wersja is
  'Wersja metryk formy użyta przy generowaniu. NULL = przed 16.08.2026, naiwna EMA bez FORMA-SEED (rozjazd z wykresem w aplikacji do 58 pkt TSB). v2 = wspólna implementacja z supabase/functions/_shared/reguly-treningow.mjs.';

-- GRANTY — SPRAWDZONE, nie założone (16.08.2026). `ai_reports` ma granty
-- KOLUMNOWE na 17 kolumnach, co zwykle znaczy „trzeba dograć ręcznie", ale tutaj
-- należą do `authenticated`, który ma RÓWNIEŻ grant TABELOWY (arwdDxtm) —
-- więc nowa kolumna dziedziczy i osobny GRANT jest zbędny. `anon` nie ma
-- SELECT-a na tej tabeli w ogóle. Zapytanie kontrolne:
--   select attname, attacl from pg_attribute
--    where attrelid='public.ai_reports'::regclass and attacl is not null;
--   select has_table_privilege('authenticated','public.ai_reports','SELECT');
