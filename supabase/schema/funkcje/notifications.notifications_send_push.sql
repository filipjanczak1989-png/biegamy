CREATE TRIGGER notifications_send_push AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION trigger_send_push()
