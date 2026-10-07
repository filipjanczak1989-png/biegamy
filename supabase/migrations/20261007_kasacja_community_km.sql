-- KASACJA community_km() — FAZA 2 (BAZA). Paka 4 / A, decyzja Filipa 7.10.2026.
--
-- PO CO: funkcja liczyła licznik wyzwania #100kmDlaKasi (okno 15.08–20.09.2026) dla landingu
-- (anon) i paska w „Dziś". Okno zamknięte; po fazie 1 (ten sam dzień) NIKT jej nie woła:
-- index.html i zawodnik.html bez wywołań, zmierzone 7.10 na prod: 0 funkcji z community_km
-- w ciele (pg_proc.prosrc), 0 widoków, 0 triggerów, 0 zadań cron. delete_my_account jej nie
-- dotyka. Jedyna sygnatura: community_km() bez argumentów (pg_proc 7.10), SECURITY DEFINER,
-- EXECUTE: postgres, anon, authenticated, service_role.
--
-- KOLEJNOŚĆ: faza 1 (front) NA PROD → ten plik. Stary klient z cache (SW) woła RPC → 404 PGRST202,
-- łapane w `catch`/`if (error) return` — pasek i tak był ukryty poza oknem.
--
-- IDEMPOTENTNA (if exists). WYCOFANIE: 20261007_WYCOFANIE_kasacja_community_km.sql (z migawki prod).

begin;

drop function if exists public.community_km();

notify pgrst, 'reload schema';

commit;

-- KONTROLA PO WYKONANIU (READ-ONLY):
--   select count(*) from pg_proc where proname = 'community_km';   -- 0
--   -- REST anon: POST /rest/v1/rpc/community_km → 404 PGRST202 (dziś: 200 [{km,wklad}])
--   -- potem: node tools/funkcje-bazy.js --zrzut (community_km.sql znika z migawki)
