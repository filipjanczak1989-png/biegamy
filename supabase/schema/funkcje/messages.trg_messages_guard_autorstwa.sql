CREATE TRIGGER trg_messages_guard_autorstwa BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION messages_guard_autorstwa()
