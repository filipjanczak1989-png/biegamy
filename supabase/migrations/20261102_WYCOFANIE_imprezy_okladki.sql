-- WYCOFANIE 20261102_imprezy_okladki.sql — zdejmuje tabelę (pliki impreza-*.jpg w race-covers zostają; usunąć przez Storage API).
-- ⛔ KOLEJNOŚĆ: najpierw front bez odczytu imprezy_okladki (races.html _okladkiImprez) — inaczej select dostanie 42P01.
begin;
drop policy if exists imprezy_okladki_read on public.imprezy_okladki;
drop table if exists public.imprezy_okladki;
notify pgrst, 'reload schema';
commit;
