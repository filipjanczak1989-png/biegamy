-- WYCOFANIE 20260906_messages_guard_autorstwa.sql
--
-- ⚠️ CO WRACA: zawodnik znowu bedzie mogl podmienic tresc wiadomosci TRENERA
--    i odwrotnie — w watku zostanie zdanie, ktorego autor nigdy nie napisal.
--    Bronic tego bedzie wylacznie `if` w kliencie. 464 wiersze.
--    Trigger niczego nie zapisuje, wiec zdjecie go nie zostawia stanu
--    do naprawienia; wraca wylacznie uprawnienie.

drop trigger if exists trg_messages_guard_autorstwa on public.messages;
drop function if exists public.messages_guard_autorstwa();
