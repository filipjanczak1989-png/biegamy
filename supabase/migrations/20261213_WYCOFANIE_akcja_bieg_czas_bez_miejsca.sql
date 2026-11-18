-- WYCOFANIE 20261213_akcja_bieg_czas_bez_miejsca.sql: lista „ukończyli” bez czasu dłuższego treningu, panel bez szczegółów wyniku (kotwice z powrotem), funkcje skasowane.
-- Strona po wycofaniu: wiersz bez trening_km rysuje się jak dotąd (bez czasu).
begin;

do $wycofanie$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      (1, 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$|| case when p.czas is not null then jsonb_build_object('czas_s', p.czas, 'miejsce', p.miejsce) when p.czas_bez_miejsca is not null then jsonb_build_object('czas_s', p.czas_bez_miejsca, 'trening_km', round(p.km_treningu, 2)) else '{}'::jsonb end order by p.poz)$k$,
       $k$|| case when p.czas is not null then jsonb_build_object('czas_s', p.czas, 'miejsce', p.miejsce) else '{}'::jsonb end order by p.poz)$k$),
      (2, 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$public.akcja_bieg_czas_rankingu(u, b) as czas, public.akcja_bieg_czas_bez_miejsca(u, b) as czas_bez_miejsca, public.akcja_bieg_km_wyniku(u) as km_treningu, $k$,
       $k$public.akcja_bieg_czas_rankingu(u, b) as czas, $k$),
      (3, 'public.akcja_bieg_panel(text)',
       $k$'weryfikacja', u.weryfikacja, 'wynik_s', case when u.ukonczony_at is not null then u.wynik_s end, 'trening_km', case when u.rodzaj = 'ja' and u.ukonczony_at is not null then round(public.akcja_bieg_km_wyniku(u), 2) end, 'zrodlo', public.akcja_bieg_zrodlo_wyniku(u)) order by u.numer)$k$,
       $k$'weryfikacja', u.weryfikacja) order by u.numer)$k$)
    ) as t(nr, funkcja, kotwica, nowe) order by nr
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: fragment z 20261213 wystąpił % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
end $wycofanie$;

drop function public.akcja_bieg_czas_bez_miejsca(public.akcja_bieg_uczestnicy, public.akcja_biegi);
drop function public.akcja_bieg_zrodlo_wyniku(public.akcja_bieg_uczestnicy);

commit;
notify pgrst, 'reload schema';
