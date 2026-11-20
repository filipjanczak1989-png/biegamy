-- BIEG WIRTUALNY: ZAMROŻENIE WYNIKU PO KOŃCU BIEGU i 24 h na trening z zegarka (decyzja Filipa 20.11, po zwiadzie końca biegu). Bez zmiany regulaminu (§ 2 ust. 3).
-- „Po końcu” = faza 'zakonczony' (akcja_bieg_faza: od koniec_at, a bez koniec_at po wynik_do), helper akcja_bieg_po_koncu(bieg).
--   1. EDYCJA treningu po końcu nie rusza wyniku: wyzwalacz akcja_bieg_trening_zmieniony pomija zapisy w zakończonym biegu. Trening zmieniony po końcu przez osobę
--      (auth.uid() — zawodnik albo trener; synchronizacja zegarka idzie bez użytkownika) trafia do akcja_bieg_treningi_po_koncu i nie liczy się już do wyniku tego biegu.
--   2. USUNIĘCIE treningu po końcu nie rusza wyniku: akcja_bieg_trening_usuniety nie czyści wyniku, a przed usunięciem zapamiętuje w wynik_zamrozony dystans
--      i źródło treningu (FK wynik_log_id → NULL robi baza). km_wyniku, wynik_z_zegarka i „moje zapisy” biorą wtedy zapamiętane wartości, więc czas na 5 km,
--      „z tempa”, ranking i dyplom zostają. Decyzja organizatora o weryfikacji też zostaje (akcja_bieg_weryfikacja_od_nowa nie kasuje jej przy samym FK → NULL).
--      wynik_zamrozony znika sam przy nowym wyniku z treningu, zaliczeniu przez organizatora albo usunięciu wyniku (wyzwalacz akcja_bieg_zamrozony_wyczysc).
--   3. AUTOMAT po końcu działa 24 h (było 2 h) i TYLKO dla zapisów bez wyniku (wyniki ukończonych są zamrożone). Przyjmuje trening sprzed koniec_at:
--      wpisany przed końcem (i niezmieniony po końcu) albo z zegarka (source intervals) zsynchronizowany do 24 h po końcu. Wpis ręczny po końcu jak dotąd nie.
--   Organizator jak dotąd do zalicz_do: „Zalicz ręcznie”, „Popraw”, „Usuń wynik”, „Zatwierdź/Odrzuć”. Strona po końcu bez zmian (dopisywanie zamknięte fazą).
-- Bez danych i bez zmiany wersji regulaminu. Test po skutku: tools/akcja-bieg-zamrozenie-test.sh (przed wdrożeniem AKCJA_BIEG_ZAMROZENIE_Z_MIGRACJA=1).
-- Wycofanie: 20261219_WYCOFANIE_akcja_bieg_zamrozenie_po_koncu.sql.
begin;

alter table public.akcja_bieg_uczestnicy add column wynik_zamrozony jsonb;
comment on column public.akcja_bieg_uczestnicy.wynik_zamrozony is 'Po końcu biegu (20261219): dystans i źródło treningu wyniku usuniętego po końcu {km, zegarek} — wynik zostaje. Czyści wyzwalacz akcja_bieg_zamrozony_wyczysc przy nowym wyniku, zaliczeniu albo usunięciu wyniku. Nie wychodzi publicznie.';

create table public.akcja_bieg_treningi_po_koncu (
  log_id       uuid not null references public.training_logs(id) on delete cascade,
  bieg_id      uuid not null references public.akcja_biegi(id) on delete cascade,
  zmieniono_at timestamptz not null default now(),
  primary key (log_id, bieg_id)
);
alter table public.akcja_bieg_treningi_po_koncu enable row level security;
revoke all on table public.akcja_bieg_treningi_po_koncu from public, anon, authenticated;
comment on table public.akcja_bieg_treningi_po_koncu is 'Treningi zmienione przez osobę po końcu biegu (zawodnik albo trener; nie synchronizacja zegarka): nie liczą się do wyniku tego biegu (20261219). Pisze wyzwalacz akcja_bieg_trening_zmieniony. Zero dostępu z przeglądarki.';

create function public.akcja_bieg_po_koncu(p_bieg uuid)
 returns boolean
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce((select public.akcja_bieg_faza(b) = 'zakonczony' from public.akcja_biegi b where b.id = p_bieg), false);
$function$;

create function public.akcja_bieg_zamrozony_wyczysc()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if (new.wynik_log_id is not null and new.wynik_log_id is distinct from old.wynik_log_id) or new.zaliczony_przez is not null or new.ukonczony_at is null then
    new.wynik_zamrozony := null;
  end if;
  return new;
end $function$;
create trigger akcja_bieg_zamrozony_wyczysc before update on public.akcja_bieg_uczestnicy
  for each row when (old.wynik_zamrozony is not null) execute function public.akcja_bieg_zamrozony_wyczysc();

revoke all on function public.akcja_bieg_po_koncu(uuid) from public, anon, authenticated;
revoke all on function public.akcja_bieg_zamrozony_wyczysc() from public, anon, authenticated;

do $migracja$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      (1, 'public.akcja_bieg_trening_zmieniony()',
       $k$where u.wynik_log_id = new.id and u.rodzaj = 'ja' and u.wycofany_at is null loop$k$,
       $k$where u.wynik_log_id = new.id and u.rodzaj = 'ja' and u.wycofany_at is null and not public.akcja_bieg_po_koncu(u.bieg_id) loop$k$),
      (2, 'public.akcja_bieg_trening_zmieniony()',
       $k$return null;$k$,
       $k$insert into public.akcja_bieg_treningi_po_koncu (log_id, bieg_id) select new.id, u.bieg_id from public.akcja_bieg_uczestnicy u join public.akcja_biegi b on b.id = u.bieg_id where auth.uid() is not null and u.konto_id = new.athlete_id and u.rodzaj = 'ja' and u.wycofany_at is null and public.akcja_bieg_faza(b) = 'zakonczony' and (now() at time zone 'Europe/Warsaw')::date <= coalesce(b.zalicz_do, b.wynik_do + 7) on conflict do nothing; return null;$k$),
      (3, 'public.akcja_bieg_trening_usuniety()',
       $k$where u.wynik_log_id = old.id and u.rodzaj = 'ja' loop$k$,
       $k$where u.wynik_log_id = old.id and u.rodzaj = 'ja' and not public.akcja_bieg_po_koncu(u.bieg_id) loop$k$),
      (4, 'public.akcja_bieg_trening_usuniety()',
       $k$return old;$k$,
       $k$update public.akcja_bieg_uczestnicy u set wynik_zamrozony = jsonb_build_object('km', old.distance_km, 'zegarek', coalesce(old.source = 'intervals' or (u.wynik_wskazany and old.external_source = 'intervals'), false)) where u.wynik_log_id = old.id and u.rodzaj = 'ja' and u.ukonczony_at is not null and u.zaliczony_przez is null and public.akcja_bieg_po_koncu(u.bieg_id); return old;$k$),
      (5, 'public.akcja_bieg_weryfikacja_od_nowa()',
       $k$new.weryfikacja := null; new.weryfikacja_at := null; new.weryfikacja_przez := null;$k$,
       $k$if new.wynik_log_id is null and old.wynik_log_id is not null and new.wynik_zamrozony is not null and new.wynik_s is not distinct from old.wynik_s and new.wynik_dystans_km is not distinct from old.wynik_dystans_km and new.zaliczony_przez is not distinct from old.zaliczony_przez then return new; end if; new.weryfikacja := null; new.weryfikacja_at := null; new.weryfikacja_przez := null;$k$),
      (6, 'public.akcja_bieg_km_wyniku(public.akcja_bieg_uczestnicy)',
       $k$u.wynik_dystans_km::numeric);$k$,
       $k$(u.wynik_zamrozony ->> 'km')::numeric, u.wynik_dystans_km::numeric);$k$),
      (7, 'public.akcja_bieg_wynik_z_zegarka(public.akcja_bieg_uczestnicy)',
       $k$select u.rodzaj = 'ja' and u.wynik_log_id is not null and u.zaliczony_przez is null$k$,
       $k$select (u.rodzaj = 'ja' and u.zaliczony_przez is null and u.wynik_log_id is null and coalesce((u.wynik_zamrozony ->> 'zegarek')::boolean, false)) or u.rodzaj = 'ja' and u.wynik_log_id is not null and u.zaliczony_przez is null$k$),
      (8, 'public.akcja_bieg_moi(text)',
       $k$'wynik_trening_km', (select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id)$k$,
       $k$'wynik_trening_km', coalesce((select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id), (u.wynik_zamrozony ->> 'km')::numeric)$k$),
      (9, 'public.akcja_bieg_automat()',
       $k$now() < b.koniec_at + interval '2 hours'))$k$,
       $k$now() < b.koniec_at + interval '24 hours' and u.ukonczony_at is null))$k$),
      (10, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$(now() < b.koniec_at or x.created_at < b.koniec_at or x.source is not distinct from 'intervals')$k$,
       $k$(now() < b.koniec_at or ((x.created_at < b.koniec_at or (x.source is not distinct from 'intervals' and x.created_at < b.koniec_at + interval '24 hours')) and not exists (select 1 from public.akcja_bieg_treningi_po_koncu e where e.log_id = x.id and e.bieg_id = b.id)))$k$),
      (11, 'public.akcja_bieg_wiszace_wyczysc()',
       $k$and u.wynik_usuniety_at is null loop$k$,
       $k$and u.wynik_usuniety_at is null and u.wynik_zamrozony is null loop$k$)
    ) as t(nr, funkcja, kotwica, nowe) order by nr
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, r.kotwica, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
  if exists (select 1 from unnest(array['public.akcja_bieg_po_koncu(uuid)', 'public.akcja_bieg_zamrozony_wyczysc()', 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)', 'public.akcja_bieg_automat()',
                                        'public.akcja_bieg_ukonczyli(text, integer, integer, integer)']) f
              where has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute'))
     or has_table_privilege('anon', 'public.akcja_bieg_treningi_po_koncu', 'select') or has_table_privilege('authenticated', 'public.akcja_bieg_treningi_po_koncu', 'select')
     or has_column_privilege('authenticated', 'public.akcja_bieg_uczestnicy', 'wynik_zamrozony', 'select')
     or has_function_privilege('anon', 'public.akcja_bieg_moi(text)', 'execute') or not has_function_privilege('authenticated', 'public.akcja_bieg_moi(text)', 'execute') then
    raise exception 'akcja_bieg (20261219): uprawnienia inne niż zamierzone, nic nie zmieniam';
  end if;
end $migracja$;

commit;
notify pgrst, 'reload schema';
