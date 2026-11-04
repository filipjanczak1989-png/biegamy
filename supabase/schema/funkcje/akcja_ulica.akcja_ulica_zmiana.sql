CREATE TRIGGER akcja_ulica_zmiana BEFORE UPDATE ON public.akcja_ulica FOR EACH ROW EXECUTE FUNCTION akcja_ulica_zmiana()
