-- WYCOFANIE 20260906_injuries_bez_anon.sql
--
-- ⚠️ CO WRACA: anon znowu dostaje PELNE DML na zgloszeniach bolu — DELETE,
--    INSERT, UPDATE, SELECT, TRUNCATE. Zamykac go bedzie wylacznie brak
--    polityki obejmujacej `anon`, czyli stan sprzed migracji: dane o zdrowiu
--    chronione przez nieobecnosc, nie przez zakaz.
-- ⚠️ Odtwarzamy DOKLADNIE to, co bylo, lacznie z TRUNCATE i REFERENCES —
--    rollback ma przywracac stan, nie wprowadzac wlasnej wersji.

grant delete, insert, references, select, trigger, truncate, update
  on public.injuries to anon;
