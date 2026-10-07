-- WYCOFANIE 20261007_biegus_most_odbior_przez_rpc.sql — przywraca stan sprzed 7.10.2026
-- (migawka rls/biegus_most.txt z 7.10 00:07: authenticated ma INSERT i UPDATE TABELOWO,
-- kolumnowych grantów brak; brak RPC). Grant tabelowy obejmuje zapis/zapis_ts, więc kolumnowy
-- z migracji jest po nim zbędny — zdejmowany dla czystości migawki (LEKCJE #23: oba źródła
-- są widoczne w column_privileges, zostawiony zaciemniałby odczyt).
--
-- ⚠️ Wycofanie wraca do stanu Z DZIURĄ: zawodnik znów może cofnąć własny znacznik przez REST
-- i odebrać pióra ponownie. Uruchamiać tylko, gdy RPC coś zepsuło, i zapisać CO.
-- ⚠️ Kolejność: najpierw granty (klient w wersji sprzed 7.10 robi INSERT/PATCH), potem drop
-- funkcji; biegus.html trzeba cofnąć do wersji z PATCH-em w tym samym kroku — klient po
-- 7.10 woła RPC, która po tym pliku nie istnieje.

begin;

revoke update (zapis, zapis_ts) on public.biegus_most from authenticated;
grant insert, update on public.biegus_most to authenticated;

drop function if exists public.biegus_most_odbierz();

notify pgrst, 'reload schema';

commit;
