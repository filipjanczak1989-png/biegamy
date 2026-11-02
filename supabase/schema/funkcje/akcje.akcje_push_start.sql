CREATE TRIGGER akcje_push_start AFTER UPDATE OF wystartowala_at ON public.akcje FOR EACH ROW EXECUTE FUNCTION akcje_push_start()
