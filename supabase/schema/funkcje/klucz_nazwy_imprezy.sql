CREATE OR REPLACE FUNCTION public.klucz_nazwy_imprezy(p text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare w text[]; n int;
  zbedne constant text := '^([0-9]+|edycja|edycji|jubileuszowy|jubileuszowa|i|x|v|m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3}))$';
begin
  -- jak BM_KALENDARZ.kluczNazwy: bez znaków, tokeny; z OBU końców zdejmuj numerację edycji (rzymska, arabska, „edycja”, „jubileuszowy”),
  -- dopóki zostaje więcej niż jeden token; potem same litery
  w := array_remove(regexp_split_to_array(regexp_replace(lower(translate(p, 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ', 'acelnoszzacelnoszz')), '[^a-z0-9]+', ' ', 'g'), ' '), '');
  while coalesce(array_length(w, 1), 0) > 1 and (w[1] ~ zbedne and (length(w[1]) > 1 or w[1] in ('i', 'x', 'v'))) loop w := w[2:]; end loop;
  while coalesce(array_length(w, 1), 0) > 1 loop
    n := array_length(w, 1);
    exit when not (w[n] ~ zbedne and (length(w[n]) > 1 or w[n] in ('i', 'x', 'v')));
    w := w[1:n - 1];
  end loop;
  return regexp_replace(array_to_string(w, ''), '[^a-z]', '', 'g');
end $function$
