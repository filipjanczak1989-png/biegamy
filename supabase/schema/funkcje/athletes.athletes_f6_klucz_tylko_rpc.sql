CREATE TRIGGER athletes_f6_klucz_tylko_rpc BEFORE INSERT OR UPDATE OF f6_runner_key ON public.athletes FOR EACH ROW EXECUTE FUNCTION athletes_f6_klucz_tylko_rpc()
