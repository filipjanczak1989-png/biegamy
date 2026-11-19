-- BIEG WIRTUALNY, kolejność listy „Ukończyli” (decyzja Filipa 19.11). Lista „Wszyscy” (bez dystansu, jedyna przy biegu z jednym dystansem, np. bieg-mikolajki 5 km)
-- szła dotąd od najnowszego ukończenia, a ranking z miejscami był rozsiany po liście. Teraz:
--   najpierw ranking: osoby z miejscem (czas_s + miejsce, akcja_bieg_czas_rankingu), w każdym dystansie od 1. miejsca (dystanse rosnąco),
--   remis miejsca: jak dotąd w zakładce dystansu (ukonczony_at desc, numer);
--   potem pozostali (bez zgody na ranking, dzieci, czas bez miejsca, ranking po „Zatwierdź”) w dotychczasowej kolejności: ukonczony_at desc, numer.
-- Zakładka jednego dystansu (p_dystans) daje to samo co przed migracją (ranking tego dystansu, potem reszta). Liczby (razem, w_rankingu), pola wierszy,
-- stronicowanie i uprawnienia bez zmian; tylko porządek row_number() (dwie kotwice w akcja_bieg_ukonczyli). Bez danych, bez zmiany wersji regulaminu.
-- Front bez zmian (lista rysuje wiersze w kolejności z serwera; EF bieg-ukonczyli przekazuje dalej, pamięć 60 s).
-- Test po skutku: tools/akcja-bieg-ukonczyli-kolejnosc-test.sh (przed wdrożeniem AKCJA_BIEG_KOLEJNOSC_Z_MIGRACJA=1).
-- Wycofanie: 20261216_WYCOFANIE_akcja_bieg_ukonczyli_kolejnosc.sql.
begin;

do $migracja$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      (1, 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$row_number() over (order by case when p_dystans is not null and m.czas is not null then 0 else 1 end,$k$,
       $k$row_number() over (order by case when m.czas is not null then 0 else 1 end,$k$),
      (2, 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$case when p_dystans is not null then m.czas end nulls last, m.ukonczony_at desc, m.numer) as poz from m$k$,
       $k$case when m.czas is not null then m.wynik_dystans_km end, m.czas nulls last, m.ukonczony_at desc, m.numer) as poz from m$k$)
    ) as t(nr, funkcja, kotwica, nowe) order by nr
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, r.kotwica, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
  if has_function_privilege('anon', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)', 'execute')
     or not has_function_privilege('service_role', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)', 'execute') then
    raise exception 'akcja_bieg (20261216): uprawnienia listy inne niż zamierzone (tylko service_role), nic nie zmieniam';
  end if;
end $migracja$;

commit;
notify pgrst, 'reload schema';
