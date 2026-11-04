CREATE TRIGGER okienko_pamiec_limit_trg BEFORE INSERT ON public.okienko_pamiec FOR EACH ROW EXECUTE FUNCTION okienko_pamiec_limit()
