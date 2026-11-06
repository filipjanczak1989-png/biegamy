-- Wycofanie 20261107_akcja_muzyka.sql: licznik bez muzyki, kolumna skasowana, kubełek znów z listą image/webp i video/mp4. Limit rozmiaru bez zmian.
-- Pliki .mp3 w kubełku usuwa Filip w panelu. Adresy znikają razem z kolumną, a licznik nie oddaje ich wcześniej niż po starcie.
begin;
do $$
declare
  v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  v_nowe constant text := $s$'muzyka', case when a.wizerunek_zgoda and not a.testowa then a.muzyka - (case when a.rowerzysta_wlaczony then array[]::text[] else array['rower'] end) end, $s$;
begin
  if (length(v_def) - length(replace(v_def, v_nowe, ''))) <> length(v_nowe) then raise exception 'wycofanie akcja_muzyka: definicja licznika inna, niż oczekiwana'; end if;
  execute replace(v_def, v_nowe, '');
  if position($s$'muzyka'$s$ in pg_get_functiondef('public.akcja_licznik(text)'::regprocedure)) > 0 then raise exception 'wycofanie akcja_muzyka: licznik wciąż oddaje muzykę'; end if;
end $$;
update storage.buckets set allowed_mime_types = array['image/webp', 'video/mp4'] where id = 'akcja-wizerunek';
alter table public.akcje drop column if exists muzyka;
notify pgrst, 'reload schema';
commit;
