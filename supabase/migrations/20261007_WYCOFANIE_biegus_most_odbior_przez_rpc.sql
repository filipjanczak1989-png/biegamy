-- WYCOFANIE 20261007_biegus_most_odbior_przez_rpc.sql — przywraca stan sprzed 7.10.2026
-- (migawka rls/biegus_most.txt z 7.10 00:07: authenticated ma INSERT(athlete_id, ostatni_odbior)
-- i UPDATE(ostatni_odbior) kolumnowo; brak RPC).
--
-- ⚠️ Wycofanie wraca do stanu Z DZIURĄ: zawodnik znów może cofnąć własny znacznik przez REST
-- i odebrać pióra ponownie. Uruchamiać tylko, gdy RPC coś zepsuło, i zapisać CO.
-- ⚠️ Kolejność: najpierw granty (klient w wersji sprzed 7.10 robi INSERT/PATCH), potem drop
-- funkcji; biegus.html trzeba cofnąć do wersji z PATCH-em w tym samym kroku — klient po
-- 7.10 woła RPC, która po tym pliku nie istnieje.

begin;

grant insert (athlete_id, ostatni_odbior) on public.biegus_most to authenticated;
grant update (ostatni_odbior)             on public.biegus_most to authenticated;

drop function if exists public.biegus_most_odbierz();

notify pgrst, 'reload schema';

commit;
