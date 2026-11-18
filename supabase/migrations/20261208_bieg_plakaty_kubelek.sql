-- 20261208_bieg_plakaty_kubelek.sql — publiczny kubełek bieg-plakaty: plakat biegu wirtualnego (WebP do strony, PDF A4 do pobrania).
--
-- Odczyt publiczny (public = true), ZERO polityk zapisu na storage.objects: pliki wgrywa Filip przez CLI
--   (supabase storage cp … --linked), service_role omija RLS. Wzorzec race-covers (20261101_race_cover.sql).
-- Plakat ma zdjęcie dziecka: pliki NIGDY w repo. Osobny kubełek, żeby po biegu usunąć go w całości (wycofanie).
-- Adresy w js/bieg.mjs (PLAKATY) z ?v=: sw.js trzyma /storage/v1/object/public/ cache-first (isStorageAsset),
--   nowa wersja pliku pod tą samą ścieżką = nowe ?v= w kodzie.
-- Tylko WebP i PDF, do 10 MB na plik.
--
-- Wycofanie: 20261208_WYCOFANIE_bieg_plakaty_kubelek.sql (najpierw usunąć pliki, komenda w jego nagłówku).

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bieg-plakaty', 'bieg-plakaty', true, 10485760, array['image/webp', 'application/pdf'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'bieg-plakaty' and public and file_size_limit = 10485760
                   and allowed_mime_types = array['image/webp', 'application/pdf']) then
    raise exception 'bieg-plakaty: kubełek istnieje z innymi ustawieniami — nie wdrażamy';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%bieg-plakaty%'
  ) then
    raise exception 'bieg-plakaty: istnieje reguła zapisu na storage.objects — nie wdrażamy';
  end if;
end $$;

select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'bieg-plakaty';

commit;
-- Oczekiwane: bieg-plakaty · true · 10485760 · {image/webp,application/pdf}. Drugie uruchomienie: to samo (on conflict do nothing).
