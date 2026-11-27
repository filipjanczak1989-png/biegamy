-- 20261228_WYCOFANIE_spolecznosc_dzis.sql — wycofanie 20261228_spolecznosc_dzis.sql: usuwa funkcję spolecznosc_dzis().
-- Funkcja nie ma tabel ani danych: wycofanie niczego nie gubi. Front bez funkcji chowa kafel „Społeczność” i zgłasza client_errors
-- (etap „spolecznosc”), reszta nowego Dziś działa bez zmian.
-- STANY: funkcja jest → usunięta; nie ma → bez zmian. W obu przypadkach komunikat w wyniku.
-- Uruchomienie (ręcznie, ścieżka bezwzględna):
--   supabase db query --linked --workdir ~/.cache/sb-audit -f "$PWD/supabase/migrations/20261228_WYCOFANIE_spolecznosc_dzis.sql"

begin;

create temp table if not exists _spolecznosc_komunikat (komunikat text) on commit drop;
truncate _spolecznosc_komunikat;
insert into _spolecznosc_komunikat
select case when to_regprocedure('public.spolecznosc_dzis()') is null
            then 'bez zmian: spolecznosc_dzis() nie było'
            else 'usunięto spolecznosc_dzis()' end;

drop function if exists public.spolecznosc_dzis();

do $$ begin
  if to_regprocedure('public.spolecznosc_dzis()') is not null then raise exception 'spolecznosc_dzis() dalej jest'; end if;
end $$;

notify pgrst, 'reload schema';

select komunikat from _spolecznosc_komunikat;
commit;
