-- PROŚBA O TRENERA (K2, krok M1 z trzech; decyzja Filipa 20.11: wariant A). Kolejność: M1 tabela i funkcje → front (onboarding, „Zmień trenera”, profil,
-- panel trenera) → M2 zamek na athletes.coach_id. Po samym M1 obecne drogi działają jak dotąd; dochodzi droga z akceptacją trenera:
--   popros_o_trenera(p_coach_id)       zawodnik (zalogowany, własny wiersz athletes): prośba do trenera z tabeli coaches. Zastępuje swoją oczekującą
--                                      prośbę (stara → wycofana); ta sama prośba drugi raz oddaje tę samą; obecny trener → null, a oczekująca
--                                      prośba o zmianę zostaje wycofana („zostaję przy obecnym”).
--   wycofaj_prosbe_o_trenera()         zawodnik: swoja oczekująca prośba → wycofana (np. „bez trenera”). Oddaje liczbę wycofanych (0 albo 1).
--   prosby_do_mnie()                   trener: oczekujące prośby do niego z imieniem zawodnika (athletes_read_by_coach nie pokazuje jeszcze
--                                      niepodpiętych, więc imię idzie przez funkcję, tylko dla adresata; coach_id ma FK do coaches, więc
--                                      adresat zawsze jest trenerem).
--   rozpatrz_prosbe(p_id, p_przyjmij)  trener (wiersz w coaches i adresat prośby): przyjęcie ustawia athletes.coach_id, odrzucenie nie rusza zawodnika.
-- Tabela prosby_trenera: przeglądarka tylko czyta (zawodnik swoje, trener adresowane do siebie); zapis wyłącznie przez funkcje (security definer).
-- Jedna oczekująca prośba na zawodnika (indeks częściowy). Bez danych. Obecne przypisania (athletes.coach_id) bez zmian.
-- Test po skutku: tools/prosby-trenera-test.sh (przed wdrożeniem PROSBY_TRENERA_Z_MIGRACJA=1). Wycofanie: 20261221_WYCOFANIE_prosby_trenera.sql.
begin;

do $straz$
begin
  if to_regclass('public.prosby_trenera') is not null then raise exception 'prosby_trenera już jest: migracja 20261221 weszła wcześniej'; end if;
end $straz$;

create table public.prosby_trenera (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.athletes(id) on delete cascade,
  coach_id    uuid not null references public.coaches(id) on delete cascade,
  status      text not null default 'oczekuje' check (status in ('oczekuje', 'przyjeta', 'odrzucona', 'wycofana')),
  utworzono   timestamptz not null default now(),
  rozpatrzono timestamptz,
  constraint prosby_trenera_rozpatrzono_ck check ((status = 'oczekuje') = (rozpatrzono is null))
);
create unique index prosby_trenera_jedna_oczekujaca on public.prosby_trenera (athlete_id) where status = 'oczekuje';
create index prosby_trenera_do_trenera on public.prosby_trenera (coach_id, utworzono) where status = 'oczekuje';
alter table public.prosby_trenera enable row level security;
revoke all on table public.prosby_trenera from public, anon, authenticated;
grant select on table public.prosby_trenera to authenticated;
create policy prosby_trenera_zawodnik on public.prosby_trenera for select to authenticated
  using (athlete_id in (select a.id from public.athletes a where a.user_id = auth.uid()));
create policy prosby_trenera_trener on public.prosby_trenera for select to authenticated
  using (coach_id = auth.uid());
comment on table public.prosby_trenera is 'Prośby zawodnika o trenera (20261221, K2 M1): zapis tylko przez popros_o_trenera / wycofaj_prosbe_o_trenera / rozpatrz_prosbe; przeglądarka czyta swoje.';

create function public.popros_o_trenera(p_coach_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_ath uuid; v_obecny uuid; v_id uuid; v_do uuid;
begin
  if auth.uid() is null then raise exception 'Zaloguj się, żeby poprosić o trenera' using errcode = '42501'; end if;
  select a.id, a.coach_id into v_ath, v_obecny from public.athletes a where a.user_id = auth.uid() for update;
  if v_ath is null then raise exception 'Najpierw dokończ profil zawodnika' using errcode = 'P0002'; end if;
  if p_coach_id is null or not exists (select 1 from public.coaches c where c.id = p_coach_id) then raise exception 'Nie ma takiego trenera' using errcode = 'P0002'; end if;
  if v_obecny is not distinct from p_coach_id then
    update public.prosby_trenera set status = 'wycofana', rozpatrzono = now() where athlete_id = v_ath and status = 'oczekuje';
    return null;
  end if;
  select p.id, p.coach_id into v_id, v_do from public.prosby_trenera p where p.athlete_id = v_ath and p.status = 'oczekuje';
  if v_id is not null and v_do = p_coach_id then return v_id; end if;
  update public.prosby_trenera set status = 'wycofana', rozpatrzono = now() where athlete_id = v_ath and status = 'oczekuje';
  insert into public.prosby_trenera (athlete_id, coach_id) values (v_ath, p_coach_id) returning id into v_id;
  return v_id;
end $function$;

create function public.wycofaj_prosbe_o_trenera()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare n integer;
begin
  if auth.uid() is null then raise exception 'Zaloguj się' using errcode = '42501'; end if;
  update public.prosby_trenera p set status = 'wycofana', rozpatrzono = now()
   where p.status = 'oczekuje' and p.athlete_id = (select a.id from public.athletes a where a.user_id = auth.uid());
  get diagnostics n = row_count;
  return n;
end $function$;

create function public.prosby_do_mnie()
 returns table(id uuid, athlete_id uuid, imie text, utworzono timestamptz)
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select p.id, p.athlete_id, a.full_name, p.utworzono
    from public.prosby_trenera p join public.athletes a on a.id = p.athlete_id
   where p.status = 'oczekuje' and p.coach_id = auth.uid()
   order by p.utworzono, p.id
$function$;

create function public.rozpatrz_prosbe(p_id uuid, p_przyjmij boolean)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare r public.prosby_trenera;
begin
  if auth.uid() is null or not exists (select 1 from public.coaches c where c.id = auth.uid()) then raise exception 'Prośby rozpatruje tylko trener' using errcode = '42501'; end if;
  if p_przyjmij is null then raise exception 'Brak decyzji (przyjmij albo odrzuć)' using errcode = '22004'; end if;
  select * into r from public.prosby_trenera p where p.id = p_id for update;
  if not found or r.coach_id is distinct from auth.uid() then raise exception 'Nie ma takiej prośby' using errcode = 'P0002'; end if;
  if r.status <> 'oczekuje' then raise exception 'Prośba jest już rozpatrzona (%)', r.status using errcode = '55000'; end if;
  if p_przyjmij then
    update public.athletes set coach_id = r.coach_id where id = r.athlete_id;
    update public.prosby_trenera set status = 'przyjeta', rozpatrzono = now() where id = r.id;
    return 'przyjeta';
  end if;
  update public.prosby_trenera set status = 'odrzucona', rozpatrzono = now() where id = r.id;
  return 'odrzucona';
end $function$;

revoke all on function public.popros_o_trenera(uuid) from public, anon, authenticated;
revoke all on function public.wycofaj_prosbe_o_trenera() from public, anon, authenticated;
revoke all on function public.prosby_do_mnie() from public, anon, authenticated;
revoke all on function public.rozpatrz_prosbe(uuid, boolean) from public, anon, authenticated;
grant execute on function public.popros_o_trenera(uuid) to authenticated;
grant execute on function public.wycofaj_prosbe_o_trenera() to authenticated;
grant execute on function public.prosby_do_mnie() to authenticated;
grant execute on function public.rozpatrz_prosbe(uuid, boolean) to authenticated;
comment on function public.popros_o_trenera(uuid) is 'Zawodnik prosi trenera o przyjęcie (20261221). Zastępuje swoją oczekującą prośbę; obecny trener → null.';
comment on function public.rozpatrz_prosbe(uuid, boolean) is 'Trener-adresat przyjmuje (ustawia athletes.coach_id) albo odrzuca prośbę (20261221).';

commit;
notify pgrst, 'reload schema';
