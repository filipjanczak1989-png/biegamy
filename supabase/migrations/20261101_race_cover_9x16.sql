-- 20261101_race_cover_9x16.sql — pionowa okładka zawodów (races.cover_9x16_url) pod hero „Dziś” w dniu startu.
--
-- Nazwa kolumny po PROPORCJI: kafel today-hero ma aspect-ratio 9/16 (zmierzone 31.10 w headless Chrome
-- na 360–430 px: 0,564 szer./wys.), a EF race-image generuje wariant 9x16 do obiektu race-<id>-9x16
-- w tym samym buckecie race-covers. URL z ?v= z tego samego powodu co cover_url (sw.js cache-first).
--
-- GRANT kolumnowy ŚWIADOMIE POMINIĘTY — jak w 20261101_race_cover.sql: authenticated ma SELECT na
-- całej tabeli, ALTER TABLE ADD COLUMN nie nadaje grantów. Asercja niżej sprawdza, że anon nadal nic nie ma.
-- Bucket bez zmian (limit 5 MB i mime png/jpeg/webp obejmują wariant pionowy).
--
-- Wycofanie: 20261101_WYCOFANIE_race_cover_9x16.sql.

begin;

alter table public.races add column if not exists cover_9x16_url text;

do $$
begin
  if has_table_privilege('anon', 'public.races', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'race_cover_9x16: anon ma grant na public.races — nie wdrażamy';
  end if;
  if has_column_privilege('anon', 'public.races', 'cover_9x16_url', 'SELECT, INSERT, UPDATE') then
    raise exception 'race_cover_9x16: anon ma grant na races.cover_9x16_url — nie wdrażamy';
  end if;
end $$;

commit;
