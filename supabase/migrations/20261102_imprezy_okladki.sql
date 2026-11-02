-- KALENDARZ L4 (2.11.2026, OK Filipa: „okładki Gemini HURTEM lokalnie/serwerowo, nie z klienta, limit 30/dobę, ta sama impreza
-- w kolejnych latach = ta sama okładka"): okładki imprez z maszyny wyników, kluczem BEZ ROKU (js/kalendarz-lista.mjs
-- kluczBezRoku = nazwa bez edycji/roku + miasto). Pisze WYŁĄCZNIE narzędzie lokalne tools/kalendarz/generuj-okladki.mjs
-- (klucz serwisowy w pamięci procesu) — zero polityk zapisu, zero dostępu dla anon; zalogowani czytają (races.html).
-- Pliki w bucketcie race-covers (publiczny odczyt, zapis tylko service_role — migracja 20261101_race_cover) jako impreza-<sha1(klucz)>.jpg.
-- Wycofanie: 20261102_WYCOFANIE_imprezy_okladki.sql.
begin;

create table public.imprezy_okladki (
  klucz            text primary key,                 -- kluczBezRoku: „biegniepodleglosci|poznan"
  url              text not null check (url ~ '^https://afqojgkaveykxbltxzwm\.supabase\.co/storage/v1/object/public/race-covers/impreza-[0-9a-f]{40}\.jpg(\?v=\d+)?$'),
  typ              text not null check (typ in ('ulica', 'ulica-noc', 'trail', 'ultra', 'przelaj', 'nordic')),
  nazwa            text not null check (length(nazwa) <= 140),   -- nazwa edycji, z której powstał prompt (do przeglądu, nie do UI)
  miasto           text check (length(miasto) <= 60),
  wygenerowano_at  timestamptz not null default now(),
  zrodlo           text not null default 'gemini-nano-banana-2.1'
);
comment on table public.imprezy_okladki is 'Okładki imprez z kalendarza maszyny wyników (klucz bez roku → url w race-covers). Zapis: tylko narzędzie lokalne z kluczem serwisowym; limit 30/dobę w narzędziu.';

alter table public.imprezy_okladki enable row level security;
revoke all on public.imprezy_okladki from public, anon, authenticated;
grant select on public.imprezy_okladki to authenticated;
create policy imprezy_okladki_read on public.imprezy_okladki for select to authenticated using (true);

do $$
begin
  if has_table_privilege('anon', 'public.imprezy_okladki', 'select') then raise exception 'imprezy_okladki: anon czyta'; end if;
  if has_table_privilege('authenticated', 'public.imprezy_okladki', 'insert') or has_table_privilege('authenticated', 'public.imprezy_okladki', 'update')
     or has_table_privilege('authenticated', 'public.imprezy_okladki', 'delete') then raise exception 'imprezy_okladki: zalogowany pisze'; end if;
  if not has_table_privilege('authenticated', 'public.imprezy_okladki', 'select') then raise exception 'imprezy_okladki: zalogowany nie czyta'; end if;
  if (select count(*) from pg_policies where tablename = 'imprezy_okladki') <> 1 then raise exception 'imprezy_okladki: polityki'; end if;
  if not (select rowsecurity from pg_tables where tablename = 'imprezy_okladki') then raise exception 'imprezy_okladki: RLS'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
