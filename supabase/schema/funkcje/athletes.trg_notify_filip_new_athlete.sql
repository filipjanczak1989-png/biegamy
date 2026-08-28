CREATE TRIGGER trg_notify_filip_new_athlete AFTER INSERT ON public.athletes FOR EACH ROW EXECUTE FUNCTION notify_filip_new_athlete()
