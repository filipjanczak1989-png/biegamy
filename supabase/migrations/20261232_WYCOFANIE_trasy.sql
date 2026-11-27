-- 20261232_WYCOFANIE_trasy.sql — usunięcie tabeli trasy (T1). Kształty są pochodną śladu z intervals: da się je policzyć od nowa (T3).
-- Przed wycofaniem wyłącz TRASY_WLACZONE w funkcjach Edge (inaczej import będzie próbował pisać do nieistniejącej tabeli — błąd jest łapany,
-- import idzie dalej, ale w logach pojawi się „zapis 42P01”).
-- Uruchomienie (ręcznie, ścieżka bezwzględna):
--   supabase db query --linked --workdir ~/.cache/sb-audit -f "$PWD/supabase/migrations/20261232_WYCOFANIE_trasy.sql"

begin;

create temp table if not exists _trasy_wycofanie (komunikat text) on commit drop;
truncate _trasy_wycofanie;
insert into _trasy_wycofanie
select case when to_regclass('public.trasy') is null then 'trasy nie było: nic do zrobienia'
            else 'trasy usunięta' end;

drop table if exists public.trasy;

notify pgrst, 'reload schema';

select komunikat from _trasy_wycofanie;
commit;
