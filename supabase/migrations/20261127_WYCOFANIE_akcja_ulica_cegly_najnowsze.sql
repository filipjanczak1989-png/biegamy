-- Wycofanie 20261127_akcja_ulica_cegly_najnowsze.sql: cegły w liczniku wracają do kolejności „najpierw złote, potem najnowsze”.
begin;
do $$
declare v_def text; v_k1 text := $k$order by x.dodano desc, x.id desc$k$; v_k2 text := $k$order by c.dodano desc, c.id desc limit 500$k$;
begin
  v_def := pg_get_functiondef('public.akcja_ulica_publiczna(text)'::regprocedure);
  if position(v_k1 in v_def) = 0 and position(v_k2 in v_def) = 0 then return; end if;
  execute replace(replace(v_def, v_k1, $k$order by x.zlota desc, x.dodano desc, x.id desc$k$), v_k2, $k$order by c.zlota desc, c.dodano desc, c.id desc limit 500$k$);
end $$;
notify pgrst, 'reload schema';
commit;
