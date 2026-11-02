-- OKNA ODZNAK (projekt F dzień 4) — twarda kontrola w bazie: odznaka z oknem wchodzi do achievements WYŁĄCZNIE, gdy dziś
-- (Europe/Warsaw) jest w jej oknie. Front (zawodnik.html _odznakaWOknie) pilnuje tego samego, ale insert idzie wprost
-- z przeglądarki (authenticated INSERT na achievements), więc bez wyzwalacza „nigdy poza oknem" byłoby obietnicą.
--
-- odznaki_okna: wiersz = okno jednej odznaki. Dwa rodzaje:
--   * okno z akcji (akcja_id): od dnia startu do dnia zamknięcia włącznie, tylko po starcie (wystartowala_at);
--     akcja testowa ('proba') otwiera okno WYŁĄCZNIE swoim kontom testowym — nikt inny nie dostanie odznaki z próby;
--   * okno stałe (od/do): #100kmDlaKasi 15.08–20.09.2026 — zamknięte, przyznane zostają, nikt nie dostaje wstecz
--     (do 2.11 front przyznawał je za wpis wsteczny z datą w oknie — pętla WYZWANIA sprawdzała datę WPISU).
-- Odznaka bez wiersza w odznaki_okna: bez zmian (wyzwalacz przepuszcza).
-- Spoza okna: RETURN NULL — wiersz po cichu pominięty, BEZ błędu. Front wysyła odznaki paczką (upsert); wyjątek wywróciłby
-- całą paczkę razem z odznakami bez okna. Front i tak pokazuje pop-up tylko za to, co FAKTYCZNIE weszło (.select()).
-- Brak obejścia dla ról serwisowych: przywrócenie odznaki poza oknem = świadome `alter table … disable trigger` w transakcji.
begin;

create table public.odznaki_okna (
  id        bigserial primary key,
  badge_id  text not null,
  akcja_id  uuid references public.akcje(id) on delete cascade,
  od        date,
  "do"      date,
  constraint odznaki_okna_rodzaj check ((akcja_id is not null) <> (od is not null)),
  constraint odznaki_okna_kolejnosc check (od is null or "do" is null or od <= "do"),
  unique (badge_id, akcja_id)
);
alter table public.odznaki_okna enable row level security;
revoke all on public.odznaki_okna from public, anon, authenticated;
revoke all on sequence public.odznaki_okna_id_seq from public, anon, authenticated;

create function public.achievements_okno()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare v_dzis date := (now() at time zone 'Europe/Warsaw')::date;
begin
  if not exists (select 1 from public.odznaki_okna where badge_id = new.badge_id) then return new; end if;
  if exists (
    select 1 from public.odznaki_okna o left join public.akcje a on a.id = o.akcja_id
     where o.badge_id = new.badge_id
       and ( (o.akcja_id is null and v_dzis >= o.od and v_dzis <= coalesce(o."do", v_dzis))
          or (o.akcja_id is not null and a.wystartowala_at is not null and v_dzis >= a.start
              and (a.koniec is null or v_dzis <= a.koniec)
              and (not a.testowa or new.athlete_id = any(coalesce(a.konta_testowe, '{}'::uuid[])))) )
  ) then return new; end if;
  return null;   -- poza oknem: pominięte po cichu (patrz nagłówek)
end $fn$;
revoke all on function public.achievements_okno() from public, anon, authenticated;

create trigger achievements_okno before insert on public.achievements
  for each row execute function public.achievements_okno();

-- okna: 6 odznak akcji (finał zasad Filipa 2.11 15:16) × (dla-fabianka, proba) + #100kmDlaKasi
insert into public.odznaki_okna (badge_id, akcja_id)
select b, a.id from unnest(array['akcja-1km','akcja-100','akcja-200','akcja-500','akcja-co-tydzien','akcja-sponsor']) b
 cross join public.akcje a where a.slug in ('dla-fabianka', 'proba');
insert into public.odznaki_okna (badge_id, od, "do") values
  ('100km_wrzesien_2026', date '2026-08-15', date '2026-09-20'),
  ('razem_wrzesien_2026', date '2026-08-15', date '2026-09-20');

do $$
begin
  if (select count(*) from public.odznaki_okna) <> 14 then raise exception 'odznaki_okna: liczba okien'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'achievements_okno' and tgrelid = 'public.achievements'::regclass and not tgisinternal) then
    raise exception 'odznaki_okna: brak wyzwalacza'; end if;
  if has_table_privilege('anon', 'public.odznaki_okna', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.odznaki_okna', 'select,insert,update,delete') then
    raise exception 'odznaki_okna: tabela dostępna z przeglądarki'; end if;
  if exists (select 1 from public.odznaki_okna where badge_id ~* 'fabian') then raise exception 'odznaki_okna: imię w slugu'; end if;
end $$;

commit;
