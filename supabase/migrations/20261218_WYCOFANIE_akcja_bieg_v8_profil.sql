-- WYCOFANIE 20261218_akcja_bieg_v8_profil.sql (regulamin v8). Po nim lista „Ukończyli” bez linku do profilu i bieg-mikolajki na v7 (regulamin_od jak przed migracją: 2026-11-19).
-- Kotwice z powrotem w odwrotnej kolejności. Front z v8 przy v7 w bazie działa (strona przyjmuje v2–v8; bez pola 'profil' imię bez linku).
begin;

do $wycofanie$
declare v_def text; n integer; r record;
begin
  update public.akcja_biegi set regulamin_wersja = '2026-11-v7', regulamin_od = date '2026-11-19' where slug = 'bieg-mikolajki' and regulamin_wersja = '2026-11-v8';
  for r in select * from (values
      (1, 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$'reczny', p.reczny) || case when p.profil is not null then jsonb_build_object('profil', p.profil) else '{}'::jsonb end$k$,
       $k$'reczny', p.reczny)$k$),
      (2, 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$(u.rodzaj = 'ja' and not public.akcja_bieg_wynik_z_zegarka(u)) as reczny, case when u.rodzaj = 'ja' and u.zgoda_imie and public.akcja_bieg_wersja_od(b.regulamin_wersja, 8) and not public.akcja_bieg_niepelnoletni(u.konto_id, b.dzien_od) and exists (select 1 from public.athletes a where a.id = u.konto_id and a.is_public and (a.date_of_birth is not null or u.ranking_zgoda_at is not null)) then u.konto_id end as profil$k$,
       $k$(u.rodzaj = 'ja' and not public.akcja_bieg_wynik_z_zegarka(u)) as reczny$k$)
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
    raise exception 'akcja_bieg (wycofanie 20261218): uprawnienia listy inne niż zamierzone, nic nie zmieniam';
  end if;
end $wycofanie$;

commit;
notify pgrst, 'reload schema';
