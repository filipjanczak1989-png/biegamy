-- 20261208_WYCOFANIE_bieg_plakaty_kubelek.sql — usuwa kubełek bieg-plakaty (po biegu albo na prośbę rodzica).
-- NAJPIERW pliki przez Storage API (bez tego plik odmawia):
--   supabase storage rm ss:///bieg-plakaty/bieg-mikolajki-plakat.webp ss:///bieg-plakaty/bieg-mikolajki-plakat.pdf --experimental --linked --workdir ~/.cache/sb-audit
-- Strona bez plików chowa sekcję plakatu sama (obrazek się nie wczyta). Stałą PLAKATY w js/bieg.mjs zdjąć w następnym pushu.
-- Gdy baza odrzuci DELETE na storage.buckets (ochrona Storage przed kasowaniem z SQL): usuń pusty kubełek w panelu Supabase → Storage.

begin;

do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'bieg-plakaty') then
    raise exception 'bieg-plakaty ma pliki: najpierw supabase storage rm (komenda w nagłówku). Nic nie zmieniam.';
  end if;
end $$;

delete from storage.buckets where id = 'bieg-plakaty';

select count(*) as kubelkow_bieg_plakaty from storage.buckets where id = 'bieg-plakaty';

commit;
-- Oczekiwane: 0.
