CREATE TRIGGER achievements_okno BEFORE INSERT ON public.achievements FOR EACH ROW EXECUTE FUNCTION achievements_okno()
