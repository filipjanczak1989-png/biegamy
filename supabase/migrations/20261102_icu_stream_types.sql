-- POMIAR DO DECYZJI O MAPKACH (2.11.2026): training_logs.icu_stream_types + icu_trainer z intervals.icu.
-- Warunek powrotu tras (decyzja Filipa 24.08): udział aktywności ze śladem > 50%. Dziś niepoliczalny —
-- docs/dzis-najpierw-dane-zwiad.md §0/§2. Pola przychodzą w liście aktywności, którą sync/webhook już pobierają:
-- zero dodatkowych zapytań, zero tras w bazie, bez UI.
-- ⚠️ KOLEJNOŚĆ: TA migracja PRZED wdrożeniem intervals-sync i intervals-webhook z nowymi polami — odwrotnie
--    insert z nieznaną kolumną wywraca CAŁY import (PGRST204).
-- Kolumny nullable bez wartości domyślnej: ALTER bez przepisywania tabeli. NULL = „intervals nie podał", nie „brak GPS".
begin;
alter table public.training_logs add column icu_stream_types text[];
alter table public.training_logs add column icu_trainer boolean;
comment on column public.training_logs.icu_stream_types is 'intervals.icu Activity.stream_types (latlng = GPS). Pomiar do decyzji o mapkach, 2.11.2026.';
comment on column public.training_logs.icu_trainer is 'intervals.icu Activity.trainer (bieżnia/trenażer). NULL = brak pola.';
do $$
begin
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'training_logs'
        and column_name in ('icu_stream_types', 'icu_trainer')) <> 2 then raise exception 'icu_stream_types: brak kolumn'; end if;
end $$;
notify pgrst, 'reload schema';
commit;
