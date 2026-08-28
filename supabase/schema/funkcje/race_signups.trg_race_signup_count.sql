CREATE TRIGGER trg_race_signup_count AFTER INSERT OR DELETE ON public.race_signups FOR EACH ROW EXECUTE FUNCTION update_race_signup_count()
