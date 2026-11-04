-- 20261105_akcja_koparka.sql — koparka z postacią z rysunku zaakceptowanego przez rodzica (Filip 4.11). Do startu rysunek jest tajemnicą, repo jest publiczne, więc pliku nie ma w repo ani w assets.
--   akcja-wizerunek           — kubełek PRYWATNY, bez polityk na storage.objects. Wgrywa Filip w panelu. Plakat leży inaczej (publiczny share-assets), to nie jest ten sam wzór.
--   akcje.koparka_url         — adres podpisany (object/sign) z tego kubełka. Klient nie ma dostępu do kolumny, wychodzi wyłącznie przez akcja_licznik.
--   akcje.koparka_postac      — wartość 'fabianek' włącza wariant; NULL = zwykła koparka. Ustawia Filip razem z adresem.
--   akcja_licznik             — oba pola TYLKO po starcie (gałąź „przed startem” zwraca wcześniej), TYLKO przy wizerunek_zgoda i NIGDY dla akcji testowej: EF odmawia próbie (404), ale akcja_licznik('proba') może wywołać każde zalogowane konto,
--                               a próbę guzika można uruchomić przed prawdziwym startem, więc rysunek na próbie wyszedłby przed startem. Na próbie front rysuje zwykłą koparkę.
--   Dopisane do AKTUALNEJ definicji licznika (jak pole ulica), więc działa z Ulicą i bez niej. WDRAŻAĆ PO 20261104_akcja_firmy.sql: jej blokada odcisku odmówiłaby po tej zmianie.
-- Test: KOP_Z_MIGRACJA=1 bash tools/akcja-koparka-test.sh. Wycofanie: 20261105_WYCOFANIE_akcja_koparka.sql. Strażnik: tests/blizna-155-rysunek-tajny-do-startu.test.js.
begin;

alter table public.akcje add column koparka_postac text check (koparka_postac in ('fabianek'));
alter table public.akcje add column koparka_url text check (koparka_url is null or koparka_url ~ '^https://afqojgkaveykxbltxzwm\.supabase\.co/storage/v1/object/sign/akcja-wizerunek/[A-Za-z0-9._-]+\.webp\?token=[A-Za-z0-9._-]+$');
comment on column public.akcje.koparka_postac is 'Wariant koparki z postacią. NULL = zwykła koparka. Publicznie przez akcja_licznik tylko po starcie, przy zgodzie, nigdy dla akcji testowej.';
comment on column public.akcje.koparka_url is 'Adres podpisany z prywatnego kubełka akcja-wizerunek. Tajny do startu: bez dostępu klienta, publicznie tylko przez akcja_licznik po starcie i przy zgodzie.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('akcja-wizerunek', 'akcja-wizerunek', false, 2097152, array['image/webp'])
on conflict (id) do nothing;

do $$
declare
  v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  v_wzor text := $r$'testowa',\s+a\.testowa\)$r$;
  j_przed jsonb; j_po jsonb; j_proba_przed jsonb; j_proba_po jsonb;
begin
  if position('v_firmy' in v_def) = 0 then raise exception 'akcja_koparka: najpierw 20261104_akcja_firmy.sql (jej blokada odcisku odmówiłaby po tej zmianie)'; end if;
  if position('koparka_url' in v_def) > 0 then raise exception 'akcja_koparka: licznik już oddaje koparka_url'; end if;
  if (select count(*) from regexp_matches(v_def, v_wzor, 'g')) <> 1 then raise exception 'akcja_koparka: definicja licznika inna, niż ta, pod którą robiono tę zmianę'; end if;

  j_przed := public.akcja_licznik('dla-fabianka');
  j_proba_przed := public.akcja_licznik('proba');
  execute regexp_replace(v_def, '(' || v_wzor || ')',
    $r$'koparka_postac', case when a.wizerunek_zgoda and not a.testowa and a.koparka_url is not null then a.koparka_postac end, 'koparka_url', case when a.wizerunek_zgoda and not a.testowa and a.koparka_postac is not null then a.koparka_url end, \1$r$);
  j_po := public.akcja_licznik('dla-fabianka');
  j_proba_po := public.akcja_licznik('proba');

  if (j_po - 'koparka_postac' - 'koparka_url') is distinct from j_przed or (j_proba_po - 'koparka_postac' - 'koparka_url') is distinct from j_proba_przed then
    raise exception 'akcja_koparka: odpowiedź licznika zmieniła się poza nowymi polami';
  end if;
  if (not (j_po->>'wystartowala')::boolean and (j_po ? 'koparka_url' or j_po ? 'koparka_postac'))
     or (not (j_proba_po->>'wystartowala')::boolean and (j_proba_po ? 'koparka_url' or j_proba_po ? 'koparka_postac')) then
    raise exception 'akcja_koparka: przed startem licznik nie może znać rysunku';
  end if;

  if (select public from storage.buckets where id = 'akcja-wizerunek') is distinct from false then raise exception 'akcja-wizerunek: kubełek ma być prywatny'; end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') || coalesce(with_check, '')) like '%akcja-wizerunek%') then
    raise exception 'akcja-wizerunek: żadnych polityk, plik wgrywa panel, a odczyt idzie adresem podpisanym';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT', 'ALL') and coalesce(qual, '') not like '%bucket_id%') then
    raise exception 'akcja-wizerunek: polityka SELECT na storage.objects bez warunku na kubełek odsłoniłaby plik';
  end if;
  if has_column_privilege('anon', 'public.akcje', 'koparka_url', 'SELECT') or has_column_privilege('authenticated', 'public.akcje', 'koparka_url', 'SELECT')
     or has_column_privilege('anon', 'public.akcje', 'koparka_postac', 'SELECT') or has_column_privilege('authenticated', 'public.akcje', 'koparka_postac', 'SELECT')
     or has_column_privilege('authenticated', 'public.akcje', 'koparka_url', 'UPDATE') then
    raise exception 'akcja_koparka: klient ma dostęp do kolumn rysunku';
  end if;
  if has_function_privilege('anon', 'public.akcja_licznik(text)', 'execute') then raise exception 'akcja_koparka: anon ma EXECUTE na liczniku'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
