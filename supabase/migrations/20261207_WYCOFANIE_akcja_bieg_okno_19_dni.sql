-- WYCOFANIE 20261207_akcja_bieg_okno_19_dni.sql: automat i lista e-maili wracają 1:1 (odwrotna zamiana kotwic), CHECK dat wraca do 2 dni.
-- ⚠️ Gdy jakiś bieg ma już dłuższy okres (np. prawdziwy po 34c), stary CHECK wraca jako NOT VALID: istniejące wiersze zostają, nowe i zmieniane muszą go spełniać
--    (komunikat NOTICE). Pełny powrót: najpierw daty biegu z powrotem (32 i 34), potem ten plik.
begin;

do $wycofanie$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      ('public.akcja_bieg_do_przypomnienia(timestamp with time zone, integer)',
       $k$'dni_do_biegu', b.dzien_od - v_dzis, 'dni_do_konca', b.dzien_do - v_dzis,$k$,
       $k$'dni_do_biegu', b.dzien_od - v_dzis,$k$),
      ('public.akcja_bieg_do_przypomnienia(timestamp with time zone, integer)',
       $k$and ((b.dzien_do = v_dzis + 3 and v_godz >= time '08:00') or b.dzien_do = v_dzis + 2)$k$,
       $k$and ((b.dzien_od = v_dzis + 2 and v_godz >= time '18:00') or (b.dzien_od = v_dzis + 1 and v_godz >= time '08:00'))$k$),
      ('public.akcja_bieg_automat()',
       $k$v := public.akcja_bieg_wynik_z_treningu(r.id, null); if (v->>'ok')::boolean and (v->>'log_id')::uuid is distinct from r.wynik_log_id then n := n + 1; end if;$k$,
       $k$if (public.akcja_bieg_wynik_z_treningu(r.id, null)->>'ok')::boolean then n := n + 1; end if;$k$),
      ('public.akcja_bieg_automat()',
       $k$and u.wycofany_at is null and (u.ukonczony_at is null or (not u.wynik_wskazany and u.zaliczony_przez is null and u.weryfikacja is distinct from 'zatwierdzony')) loop$k$,
       $k$and u.wycofany_at is null and u.ukonczony_at is null loop$k$),
      ('public.akcja_bieg_automat()',
       $k$for r in select u.id, u.wynik_log_id from$k$,
       $k$for r in select u.id from$k$),
      ('public.akcja_bieg_automat()',
       $k$declare r record; n integer := 0; v jsonb;$k$,
       $k$declare r record; n integer := 0;$k$)
    ) as t(funkcja, nowe, stare)
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.nowe, ''))) / length(r.nowe);
    if n <> 1 then raise exception '%: fragment z 20261207 wystąpił % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, n; end if;
    execute replace(v_def, r.nowe, r.stare);
  end loop;
end $wycofanie$;

alter table public.akcja_biegi drop constraint akcja_biegi_dni;
do $wycofanie_dat$
begin
  if exists (select 1 from public.akcja_biegi where dzien_do - dzien_od > 1) then
    alter table public.akcja_biegi add constraint akcja_biegi_dni check (dzien_do >= dzien_od and dzien_do - dzien_od <= 1 and wynik_do >= dzien_do and wynik_do - dzien_do <= 7) not valid;
    raise notice 'akcja_biegi_dni wraca jako NOT VALID: są biegi dłuższe niż 2 dni';
  else
    alter table public.akcja_biegi add constraint akcja_biegi_dni check (dzien_do >= dzien_od and dzien_do - dzien_od <= 1 and wynik_do >= dzien_do and wynik_do - dzien_do <= 7);
  end if;
end $wycofanie_dat$;

commit;
notify pgrst, 'reload schema';
