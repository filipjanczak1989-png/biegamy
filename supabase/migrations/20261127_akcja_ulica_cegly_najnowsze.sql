-- 20261127_akcja_ulica_cegly_najnowsze.sql — MUR CEGIEŁEK: licznik oddaje cegły w kolejności DODANIA (najnowsze pierwsze), bez przesuwania złotych na początek (decyzja 12.11).
--   Dotąd akcja_ulica_publiczna sortowała `zlota desc, dodano desc`, więc „5 najnowszych” w murze cegiełek na Dziś (js/akcja.mjs murCegielekHtml) pokazywało najpierw złote.
--   Pasek murku w pełnej scenie Ulicy sam ustawia złote na początku (js/ulica.mjs ceglyMurku → concat), więc tam nic się nie zmienia; złota cegła zostaje złota (pole `z`).
--   Poprawka na ŻYWEJ definicji (produkcja bywa nowsza od repo), tylko gdy obie kotwice występują dokładnie raz. Bez zmian uprawnień.
-- Test: tools/akcja-ulica-cegly-test.sh (przed wdrożeniem CEGLY_Z_MIGRACJA=1, jedna transakcja zawsze wycofana). Wycofanie: 20261127_WYCOFANIE_akcja_ulica_cegly_najnowsze.sql.
begin;
do $$
declare v_def text; v_k1 text := $k$order by x.zlota desc, x.dodano desc, x.id desc$k$; v_k2 text := $k$order by c.zlota desc, c.dodano desc, c.id desc limit 500$k$; n1 integer; n2 integer;
begin
  v_def := pg_get_functiondef('public.akcja_ulica_publiczna(text)'::regprocedure);
  n1 := (char_length(v_def) - char_length(replace(v_def, v_k1, ''))) / char_length(v_k1);
  n2 := (char_length(v_def) - char_length(replace(v_def, v_k2, ''))) / char_length(v_k2);
  if n1 = 0 and n2 = 0 and position('order by x.dodano desc, x.id desc' in v_def) > 0 then return; end if;   -- już po poprawce
  if n1 <> 1 or n2 <> 1 then raise exception 'akcja_ulica_publiczna: kotwice % i % razy zamiast 1 — popraw ręcznie', n1, n2; end if;
  execute replace(replace(v_def, v_k1, $k$order by x.dodano desc, x.id desc$k$), v_k2, $k$order by c.dodano desc, c.id desc limit 500$k$);
end $$;
notify pgrst, 'reload schema';
commit;
