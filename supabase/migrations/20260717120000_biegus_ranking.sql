-- 20260717120000_biegus_ranking.sql
-- RANKING Biegusia: top 20 po PRAWDZIWYCH kilometrach (laczneKm z save).
-- SECURITY DEFINER czyta cudze wiersze biegus_most — dlatego:
--   * eksponuje TYLKO 4 pola (imie/km/gwiazdki/etapy), nigdy calego zapisu
--   * LIMIT 20, execute TYLKO authenticated, search_path przypiety
create or replace function public.biegus_ranking()
returns table(imie text, km numeric, gwiazdki int, etapy int)
language sql
security definer
set search_path = public
as $$
  select
    left(coalesce(nullif(zapis->>'imie',''),'Bieguś'),24)              as imie,
    coalesce((zapis->>'laczneKm')::numeric,0)                          as km,
    coalesce((select count(*)::int
              from jsonb_object_keys(coalesce(zapis->'gwiazdki','{}'::jsonb))),0) as gwiazdki,
    coalesce(jsonb_array_length(coalesce(zapis->'ukonczone','[]'::jsonb)),0)      as etapy
  from public.biegus_most
  where zapis is not null
  order by km desc, gwiazdki desc
  limit 20;
$$;

revoke all on function public.biegus_ranking() from public;
revoke all on function public.biegus_ranking() from anon;
grant execute on function public.biegus_ranking() to authenticated;

notify pgrst, 'reload schema';

-- WERYFIKACJA (cc, po wykonaniu):
-- 1) zalogowany REST: POST /rest/v1/rpc/biegus_ranking (Bearer user)  -> 200, JSON tablica
-- 2) anon (sam apikey, bez Bearer):                                   -> 401/403
-- 3) select * from biegus_ranking() w SQL (rola postgres)             -> wiersze bez bledu
--    (uwaga: laczneKm z ulamkami — ::numeric lyka; gwiazdki={} i brak
--     ukonczone w starych save'ach -> coalesce chroni)
