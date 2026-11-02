-- WYCOFANIE 20261102_akcja_deklaracje.sql — zdejmuje RPC deklaracji. Deklaracje (akcja_sponsorzy) i przyznane odznaki
-- akcja-sponsor ZOSTAJĄ. Najpierw wyłączyć formularz w kliencie (BM_AKCJA DEKLARACJE_GOTOWE = false), inaczej przycisk
-- „Zapisz" dostanie błąd.
begin;
drop function if exists public.akcja_wycofaj_deklaracje(text);
drop function if exists public.akcja_deklaruj(text, integer);
notify pgrst, 'reload schema';
commit;
