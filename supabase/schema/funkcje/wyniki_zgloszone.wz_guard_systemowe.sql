CREATE TRIGGER wz_guard_systemowe BEFORE INSERT OR UPDATE ON public.wyniki_zgloszone FOR EACH ROW EXECUTE FUNCTION wz_guard_systemowe()
