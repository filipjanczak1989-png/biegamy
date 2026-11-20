-- WYCOFANIE 20261219_akcja_bieg_zamrozenie_po_koncu.sql. Po nim jak po 20261218: edycja i usunięcie treningu po końcu zmieniają wynik, automat 2 h po końcu (także dla ukończonych).
-- Kotwice z powrotem w odwrotnej kolejności, potem wyzwalacz, funkcje, tabela treningów zmienionych po końcu i kolumna wynik_zamrozony.
-- Uwaga: wynik zamrożony po usunięciu treningu (wynik_log_id NULL, wynik_zamrozony) po wycofaniu liczy się z dystansu biegu (km_wyniku → wynik_dystans_km),
-- więc czas z tempa takiego wyniku przestaje się zgadzać — przed wycofaniem sprawdź: select count(*) from public.akcja_bieg_uczestnicy where wynik_zamrozony is not null;
begin;

do $wycofanie$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      (1, 'public.akcja_bieg_wiszace_wyczysc()',
       $k$and u.wynik_usuniety_at is null and u.wynik_zamrozony is null loop$k$,
       $k$and u.wynik_usuniety_at is null loop$k$),
      (2, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$(now() < b.koniec_at or ((x.created_at < b.koniec_at or (x.source is not distinct from 'intervals' and x.created_at < b.koniec_at + interval '24 hours')) and not exists (select 1 from public.akcja_bieg_treningi_po_koncu e where e.log_id = x.id and e.bieg_id = b.id)))$k$,
       $k$(now() < b.koniec_at or x.created_at < b.koniec_at or x.source is not distinct from 'intervals')$k$),
      (3, 'public.akcja_bieg_automat()',
       $k$now() < b.koniec_at + interval '24 hours' and u.ukonczony_at is null))$k$,
       $k$now() < b.koniec_at + interval '2 hours'))$k$),
      (4, 'public.akcja_bieg_moi(text)',
       $k$'wynik_trening_km', coalesce((select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id), (u.wynik_zamrozony ->> 'km')::numeric)$k$,
       $k$'wynik_trening_km', (select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id)$k$),
      (5, 'public.akcja_bieg_wynik_z_zegarka(public.akcja_bieg_uczestnicy)',
       $k$select (u.rodzaj = 'ja' and u.zaliczony_przez is null and u.wynik_log_id is null and coalesce((u.wynik_zamrozony ->> 'zegarek')::boolean, false)) or u.rodzaj = 'ja' and u.wynik_log_id is not null and u.zaliczony_przez is null$k$,
       $k$select u.rodzaj = 'ja' and u.wynik_log_id is not null and u.zaliczony_przez is null$k$),
      (6, 'public.akcja_bieg_km_wyniku(public.akcja_bieg_uczestnicy)',
       $k$(u.wynik_zamrozony ->> 'km')::numeric, u.wynik_dystans_km::numeric);$k$,
       $k$u.wynik_dystans_km::numeric);$k$),
      (7, 'public.akcja_bieg_weryfikacja_od_nowa()',
       $k$if new.wynik_log_id is null and old.wynik_log_id is not null and new.wynik_zamrozony is not null and new.wynik_s is not distinct from old.wynik_s and new.wynik_dystans_km is not distinct from old.wynik_dystans_km and new.zaliczony_przez is not distinct from old.zaliczony_przez then return new; end if; new.weryfikacja := null; new.weryfikacja_at := null; new.weryfikacja_przez := null;$k$,
       $k$new.weryfikacja := null; new.weryfikacja_at := null; new.weryfikacja_przez := null;$k$),
      (8, 'public.akcja_bieg_trening_usuniety()',
       $k$update public.akcja_bieg_uczestnicy u set wynik_zamrozony = jsonb_build_object('km', old.distance_km, 'zegarek', coalesce(old.source = 'intervals' or (u.wynik_wskazany and old.external_source = 'intervals'), false)) where u.wynik_log_id = old.id and u.rodzaj = 'ja' and u.ukonczony_at is not null and u.zaliczony_przez is null and public.akcja_bieg_po_koncu(u.bieg_id); return old;$k$,
       $k$return old;$k$),
      (9, 'public.akcja_bieg_trening_usuniety()',
       $k$where u.wynik_log_id = old.id and u.rodzaj = 'ja' and not public.akcja_bieg_po_koncu(u.bieg_id) loop$k$,
       $k$where u.wynik_log_id = old.id and u.rodzaj = 'ja' loop$k$),
      (10, 'public.akcja_bieg_trening_zmieniony()',
       $k$insert into public.akcja_bieg_treningi_po_koncu (log_id, bieg_id) select new.id, u.bieg_id from public.akcja_bieg_uczestnicy u join public.akcja_biegi b on b.id = u.bieg_id where auth.uid() is not null and u.konto_id = new.athlete_id and u.rodzaj = 'ja' and u.wycofany_at is null and public.akcja_bieg_faza(b) = 'zakonczony' and (now() at time zone 'Europe/Warsaw')::date <= coalesce(b.zalicz_do, b.wynik_do + 7) on conflict do nothing; return null;$k$,
       $k$return null;$k$),
      (11, 'public.akcja_bieg_trening_zmieniony()',
       $k$where u.wynik_log_id = new.id and u.rodzaj = 'ja' and u.wycofany_at is null and not public.akcja_bieg_po_koncu(u.bieg_id) loop$k$,
       $k$where u.wynik_log_id = new.id and u.rodzaj = 'ja' and u.wycofany_at is null loop$k$)
    ) as t(nr, funkcja, kotwica, nowe) order by nr
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, r.kotwica, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
end $wycofanie$;

drop trigger akcja_bieg_zamrozony_wyczysc on public.akcja_bieg_uczestnicy;
drop function public.akcja_bieg_zamrozony_wyczysc();
drop function public.akcja_bieg_po_koncu(uuid);
drop table public.akcja_bieg_treningi_po_koncu;
alter table public.akcja_bieg_uczestnicy drop column wynik_zamrozony;

commit;
notify pgrst, 'reload schema';
