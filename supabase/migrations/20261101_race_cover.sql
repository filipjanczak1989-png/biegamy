-- 20261101_race_cover.sql — okładka zawodów (races.cover_url) + bucket race-covers pod EF race-image.
--
-- cover_url — publiczny URL obiektu w race-covers Z ?v=<znacznik>. Znacznik jest konieczny, nie ozdobny:
--   sw.js obsługuje /storage/v1/object/public/ strategią cache-first (isStorageAsset, sw.js:242), a
--   cache.match porównuje pełny URL. Nadpisana okładka pod tą samą ścieżką BEZ zmiany ?v= zostałaby
--   u ludzi na zawsze w poprzedniej wersji.
--
-- GRANT kolumnowy ŚWIADOMIE POMINIĘTY: authenticated ma SELECT na całej tabeli (migawka
--   schema/rls/races.txt), więc GRANT SELECT (cover_url) niczego by nie dodał, a migawka pokazywałaby
--   uprawnienie, które o niczym nie decyduje. ALTER TABLE ADD COLUMN nie nadaje grantów (inaczej niż
--   create table — LEKCJE community_stats), więc anon dalej nie ma nic. Asercja niżej to sprawdza.
--   Zapis cover_url przez front: tylko trener (races_coach_all); EF pisze service_role.
--
-- race-covers — publiczny odczyt, ZERO polityk zapisu na storage.objects: pisze wyłącznie EF przez
--   service_role, który omija RLS (ten sam wzorzec co share-cards, 20260801100000_share_card_buckets.sql).
--
-- Wycofanie: 20261101_WYCOFANIE_race_cover.sql.

begin;

alter table public.races add column if not exists cover_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('race-covers', 'race-covers', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

do $$
begin
  if has_table_privilege('anon', 'public.races', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'race_cover: anon ma grant na public.races — nie wdrażamy';
  end if;
  if has_column_privilege('anon', 'public.races', 'cover_url', 'SELECT, INSERT, UPDATE') then
    raise exception 'race_cover: anon ma grant na races.cover_url — nie wdrażamy';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%race-covers%'
  ) then
    raise exception 'race_cover: istnieje polityka zapisu storage.objects dla race-covers — pisze tylko service_role';
  end if;
end $$;

commit;
