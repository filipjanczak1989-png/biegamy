CREATE TRIGGER intervals_conn_update_ts BEFORE UPDATE ON public.intervals_connections FOR EACH ROW EXECUTE FUNCTION update_intervals_conn_timestamp()
