-- WYCOFANIE 20261216_akcja_bieg_ukonczyli_kolejnosc.sql. Po nim lista „Wszyscy” znów od najnowszego ukończenia (ranking tylko w zakładce dystansu na górze).
-- Kotwice z powrotem w odwrotnej kolejności. Bez danych. Front działa z każdą kolejnością.
begin;

do $wycofanie$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      (1, 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$case when m.czas is not null then m.wynik_dystans_km end, m.czas nulls last, m.ukonczony_at desc, m.numer) as poz from m$k$,
       $k$case when p_dystans is not null then m.czas end nulls last, m.ukonczony_at desc, m.numer) as poz from m$k$),
      (2, 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$row_number() over (order by case when m.czas is not null then 0 else 1 end,$k$,
       $k$row_number() over (order by case when p_dystans is not null and m.czas is not null then 0 else 1 end,$k$)
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
    raise exception 'akcja_bieg (wycofanie 20261216): uprawnienia listy inne niż zamierzone, nic nie zmieniam';
  end if;
end $wycofanie$;

commit;
notify pgrst, 'reload schema';
