-- 20261105_akcja_firmy_zgloszenia.sql — SAMOOBSŁUGA FIRM (Filip 4.11). Formularz bez logowania, decyzja trenera, nic publicznie bez zatwierdzenia. Za przełącznikiem akcje.firmy_zgloszenia, domyślnie wyłączone.
--   akcja_firmy_zgloszenia — zgłoszenie: rodzaj, nazwa, link, e-mail, ścieżki plików, status. Klient nie ma dostępu do niczego: pisze i czyta wyłącznie klucz serwisowy przez funkcje niżej.
--   akcja_firmy_proby      — skrót adresu IP do limitu 3 zgłoszeń na godzinę, kasowany po dobie.
--   firmy-zgloszenia       — kubełek PRYWATNY na logo i zrzut wpłaty, bez polityk. Podgląd w panelu przez krótko ważny adres podpisany.
--   Próba                  — formularz działa też na akcji proba (własny przełącznik), żeby przejść całą drogę przed startem. Firma z próby trafia tylko na ulicę próby.
--   Zatwierdzenie          — logo trafia do publicznego akcja-firmy-logo (EF firma-panel), wpis do akcja_firmy, zrzut wpłaty znika. Odrzucenie — zrzut i logo znikają.
--   Terminy                — zrzut najpóźniej po 14 dniach, e-mail 30 dni po zakończeniu akcji (akcje.koniec). Sprzątanie raz na dobę: cron woła EF firma-panel, bo pliki kasuje się przez Storage API.
-- WDRAŻAĆ PO 20261105_akcja_firmy_szyldy.sql. Test: tools/akcja-firmy-zgloszenia-test.sh. Wycofanie: 20261105_WYCOFANIE_akcja_firmy_zgloszenia.sql.
begin;

create table public.akcja_firmy_zgloszenia (
  id                   uuid primary key default gen_random_uuid(),
  akcja_slug           text not null default 'dla-fabianka' references public.akcje(slug) on delete cascade,
  rodzaj               text not null check (rodzaj in ('domek', 'wiezowiec')),
  nazwa                text not null check (char_length(btrim(nazwa)) between 2 and 120 and nazwa !~ '[[:cntrl:]]'),
  link                 text not null check (char_length(link) <= 500 and link ~ '^https://[^[:space:]/?#<>"''@\\]+\.[^[:space:]/?#<>"''@\\]+([/?#][^[:space:]<>"'']*)?$'),
  email                text check (email is null or (char_length(email) <= 120 and email ~ '^[^@[:space:]<>"]+@[^@[:space:]<>"]+\.[^@[:space:]<>"]+$')),
  logo_sciezka         text check (logo_sciezka is null or logo_sciezka ~ '^[0-9a-f-]{36}/logo\.(png|jpg|webp)$'),
  zrzut_sciezka        text check (zrzut_sciezka is null or zrzut_sciezka ~ '^[0-9a-f-]{36}/zrzut\.(png|jpg|webp)$'),
  zgoda_na_wymienienie boolean not null check (zgoda_na_wymienienie = true),
  kwota_gr             integer check (kwota_gr is null or kwota_gr between 1 and 1000000000),
  zgoda_na_kwote       boolean not null default false,
  status               text not null default 'nowe' check (status in ('nowe', 'zatwierdzone', 'odrzucone')),
  powod                text check (powod is null or char_length(powod) <= 300),
  utworzono            timestamptz not null default now(),
  decyzja_at           timestamptz,
  decyzja_kto          uuid references auth.users(id) on delete set null,
  firma_id             uuid references public.akcja_firmy(id) on delete set null,
  constraint akcja_firmy_zgloszenia_zgoda_wymaga_kwoty check (not zgoda_na_kwote or kwota_gr is not null)
);
comment on column public.akcja_firmy_zgloszenia.kwota_gr is 'Kwota wpisana w formularzu, grosze. Widzi ją trener. Publicznie tylko przy zgoda_na_kwote, po zatwierdzeniu.';
comment on table public.akcja_firmy_zgloszenia is 'Zgłoszenia firm z formularza. Bez dostępu klienta. Nic nie jest publiczne przed zatwierdzeniem przez trenera. Zrzut wpłaty znika po decyzji i najpóźniej po 14 dniach, e-mail 30 dni po zakończeniu akcji.';
create index akcja_firmy_zgloszenia_kolejka on public.akcja_firmy_zgloszenia (status, utworzono);

create table public.akcja_firmy_proby (
  ip_skrot text not null,
  kiedy    timestamptz not null default now()
);
comment on table public.akcja_firmy_proby is 'Limit zgłoszeń na IP. Tylko skrót adresu, kasowany po dobie.';
create index akcja_firmy_proby_ip on public.akcja_firmy_proby (ip_skrot, kiedy);

alter table public.akcja_firmy_zgloszenia enable row level security;
alter table public.akcja_firmy_proby enable row level security;
revoke all on public.akcja_firmy_zgloszenia, public.akcja_firmy_proby from public;
revoke all on public.akcja_firmy_zgloszenia, public.akcja_firmy_proby from anon;
revoke all on public.akcja_firmy_zgloszenia, public.akcja_firmy_proby from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('firmy-zgloszenia', 'firmy-zgloszenia', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Limit i przełącznik sprawdzane, zanim EF cokolwiek wgra. Każda próba się liczy, także odrzucona później przez walidację.
create function public.akcja_firmy_wpusc(p_ip text, p_slug text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  LIMIT_NA_GODZINE constant integer := 3;
  v_ile integer; ak public.akcje;
begin
  if p_slug not in ('dla-fabianka', 'proba') or not coalesce((select a.firmy_zgloszenia and a.wystartowala_at is not null from public.akcje a where a.slug = p_slug), false) then
    return jsonb_build_object('ok', false, 'powod', 'wylaczone');
  end if;
  delete from public.akcja_firmy_proby where kiedy < now() - interval '1 day';
  select count(*) into v_ile from public.akcja_firmy_proby where ip_skrot = p_ip and kiedy > now() - interval '1 hour';
  if v_ile >= LIMIT_NA_GODZINE then return jsonb_build_object('ok', false, 'powod', 'limit'); end if;
  insert into public.akcja_firmy_proby (ip_skrot) values (p_ip);
  select * into ak from public.akcje where slug = p_slug;
  return jsonb_build_object('ok', true, 'prog_domku_zl', ak.prog_domku_zl, 'prog_wiezowca_zl', ak.prog_wiezowca_zl);
end $$;

create function public.akcja_firmy_zgloszenie_dodaj(p_id uuid, p_slug text, p_rodzaj text, p_nazwa text, p_link text, p_email text, p_logo text, p_zrzut text, p_kwota_gr integer default null, p_zgoda_kwota boolean default false)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
begin
  insert into public.akcja_firmy_zgloszenia (id, akcja_slug, rodzaj, nazwa, link, email, logo_sciezka, zrzut_sciezka, zgoda_na_wymienienie, kwota_gr, zgoda_na_kwote)
  values (p_id, p_slug, p_rodzaj, p_nazwa, p_link, p_email, p_logo, p_zrzut, true, p_kwota_gr, coalesce(p_zgoda_kwota, false));
  return jsonb_build_object('ok', true);
end $$;

create function public.akcja_firmy_zgloszenia_lista()
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'zgloszenia', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'proba', z.akcja_slug = 'proba', 'rodzaj', z.rodzaj, 'nazwa', z.nazwa, 'link', z.link, 'email', z.email, 'kwota_gr', z.kwota_gr, 'zgoda_na_kwote', z.zgoda_na_kwote, 'logo', z.logo_sciezka, 'zrzut', z.zrzut_sciezka,
                                     'status', z.status, 'powod', z.powod, 'utworzono', z.utworzono, 'decyzja_at', z.decyzja_at) order by (z.status = 'nowe') desc, z.utworzono desc)
                           from (select * from public.akcja_firmy_zgloszenia order by (status = 'nowe') desc, utworzono desc limit 50) z), '[]'::jsonb),
    'prog_domku_zl', (select a.prog_domku_zl from public.akcje a where a.slug = 'dla-fabianka'),
    'prog_wiezowca_zl', (select a.prog_wiezowca_zl from public.akcje a where a.slug = 'dla-fabianka'),
    'firmy_zgloszenia', (select a.firmy_zgloszenia from public.akcje a where a.slug = 'dla-fabianka'))
$$;

-- Zatwierdzenie: tylko zgłoszenie „nowe”. Oddaje ścieżki do skasowania: zrzut wpłaty i prywatna kopia logo nie mogą zostać po decyzji.
create function public.akcja_firmy_zatwierdz(p_id uuid, p_logo_url text, p_kto uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare z public.akcja_firmy_zgloszenia; v_firma uuid;
begin
  select * into z from public.akcja_firmy_zgloszenia where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  if z.status <> 'nowe' then return jsonb_build_object('ok', false, 'powod', 'juz_decyzja'); end if;
  insert into public.akcja_firmy (akcja_slug, nazwa, link, logo_url, rodzaj, kwota_gr, zgoda_na_kwote, potwierdzenie_widziane, zgoda_na_wymienienie, dodal)
  values (z.akcja_slug, z.nazwa, z.link, p_logo_url, z.rodzaj, z.kwota_gr, z.zgoda_na_kwote, true, true, p_kto) returning id into v_firma;
  update public.akcja_firmy_zgloszenia set status = 'zatwierdzone', decyzja_at = now(), decyzja_kto = p_kto, firma_id = v_firma, zrzut_sciezka = null, logo_sciezka = null where id = p_id;
  return jsonb_build_object('ok', true, 'firma', v_firma, 'email', z.email, 'pliki', to_jsonb(array_remove(array[z.zrzut_sciezka, z.logo_sciezka], null)));
end $$;

create function public.akcja_firmy_odrzuc(p_id uuid, p_powod text, p_kto uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare z public.akcja_firmy_zgloszenia;
begin
  select * into z from public.akcja_firmy_zgloszenia where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  if z.status <> 'nowe' then return jsonb_build_object('ok', false, 'powod', 'juz_decyzja'); end if;
  update public.akcja_firmy_zgloszenia set status = 'odrzucone', powod = left(p_powod, 300), decyzja_at = now(), decyzja_kto = p_kto, zrzut_sciezka = null, logo_sciezka = null where id = p_id;
  return jsonb_build_object('ok', true, 'pliki', to_jsonb(array_remove(array[z.zrzut_sciezka, z.logo_sciezka], null)));
end $$;

-- Raz na dobę: zrzuty starsze niż 14 dni bez decyzji, e-maile 30 dni po zakończeniu akcji, stare próby. Oddaje ścieżki plików do skasowania w Storage API.
create function public.akcja_firmy_sprzatanie()
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_pliki text[]; v_maile integer;
begin
  select coalesce(array_agg(zrzut_sciezka), '{}') into v_pliki from public.akcja_firmy_zgloszenia where zrzut_sciezka is not null and utworzono < now() - interval '14 days';
  update public.akcja_firmy_zgloszenia set zrzut_sciezka = null where zrzut_sciezka is not null and utworzono < now() - interval '14 days';
  update public.akcja_firmy_zgloszenia z set email = null from public.akcje a
   where a.slug = z.akcja_slug and z.email is not null and a.koniec is not null and a.koniec + 30 < (now() at time zone 'Europe/Warsaw')::date;
  get diagnostics v_maile = row_count;
  delete from public.akcja_firmy_proby where kiedy < now() - interval '1 day';
  return jsonb_build_object('pliki', to_jsonb(v_pliki), 'maile', v_maile);
end $$;

-- Licznik „Firmy do sprawdzenia” na Dziś: tylko liczba i tylko dla trenera, reszta dostaje null.
create function public.akcja_firmy_do_sprawdzenia()
 returns integer language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select case when public.auth_is_coach() then (select count(*)::integer from public.akcja_firmy_zgloszenia where status = 'nowe') end
$$;
revoke all on function public.akcja_firmy_do_sprawdzenia() from public, anon;
grant execute on function public.akcja_firmy_do_sprawdzenia() to authenticated;
comment on function public.akcja_firmy_do_sprawdzenia() is 'Liczba zgłoszeń firm czekających na decyzję. Trener: liczba, inni: null.';

create function public.akcja_firmy_progi(p_domek integer, p_wiezowiec integer, p_zgloszenia boolean)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
begin
  if p_domek is null or p_wiezowiec is null or p_domek < 1 or p_wiezowiec <= p_domek then return jsonb_build_object('ok', false, 'powod', 'progi'); end if;
  update public.akcje set prog_domku_zl = p_domek, prog_wiezowca_zl = p_wiezowiec, firmy_zgloszenia = coalesce(p_zgloszenia, firmy_zgloszenia) where slug = 'dla-fabianka';
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.akcja_firmy_wpusc(text, text) from public, anon, authenticated;
revoke all on function public.akcja_firmy_zgloszenie_dodaj(uuid, text, text, text, text, text, text, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.akcja_firmy_zgloszenia_lista() from public, anon, authenticated;
revoke all on function public.akcja_firmy_zatwierdz(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.akcja_firmy_odrzuc(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.akcja_firmy_sprzatanie() from public, anon, authenticated;
revoke all on function public.akcja_firmy_progi(integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.akcja_firmy_wpusc(text, text) to service_role;
grant execute on function public.akcja_firmy_zgloszenie_dodaj(uuid, text, text, text, text, text, text, text, integer, boolean) to service_role;
grant execute on function public.akcja_firmy_zgloszenia_lista() to service_role;
grant execute on function public.akcja_firmy_zatwierdz(uuid, text, uuid) to service_role;
grant execute on function public.akcja_firmy_odrzuc(uuid, text, uuid) to service_role;
grant execute on function public.akcja_firmy_sprzatanie() to service_role;
grant execute on function public.akcja_firmy_progi(integer, integer, boolean) to service_role;
comment on function public.akcja_firmy_wpusc(text, text) is 'Przełącznik i limit 3 zgłoszenia na godzinę z jednego IP. Tylko EF firma-zgloszenie.';
comment on function public.akcja_firmy_zgloszenie_dodaj(uuid, text, text, text, text, text, text, text, integer, boolean) is 'Zapis zgłoszenia po walidacji w EF. Tylko klucz serwisowy.';
comment on function public.akcja_firmy_zgloszenia_lista() is 'Lista dla panelu trenera przez EF firma-panel. Tylko klucz serwisowy.';
comment on function public.akcja_firmy_zatwierdz(uuid, text, uuid) is 'Zgłoszenie staje się firmą na Ulicy, oddaje pliki do skasowania. Tylko klucz serwisowy.';
comment on function public.akcja_firmy_odrzuc(uuid, text, uuid) is 'Odrzucenie z powodem, oddaje pliki do skasowania. Tylko klucz serwisowy.';
comment on function public.akcja_firmy_sprzatanie() is 'Terminy: zrzut 14 dni, e-mail 30 dni po końcu akcji. Tylko klucz serwisowy.';
comment on function public.akcja_firmy_progi(integer, integer, boolean) is 'Progi domku i wieżowca oraz przełącznik formularza z panelu trenera. Tylko klucz serwisowy.';

select cron.schedule('akcja-firmy-sprzatanie', '17 3 * * *', $job$
  select net.http_post(
    url     := 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/firma-panel',
    headers := jsonb_build_object('Content-Type','application/json',
               'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_hook_secret')),
    body    := '{"rodzaj":"sprzatanie"}'::jsonb);
$job$);

do $$
declare t text; f text;
begin
  foreach t in array array['akcja_firmy_zgloszenia', 'akcja_firmy_proby'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then raise exception 'firmy_zgloszenia: RLS wyłączone na %', t; end if;
    if has_table_privilege('anon', 'public.' || t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') or has_any_column_privilege('anon', 'public.' || t, 'SELECT, INSERT, UPDATE, REFERENCES')
       or has_table_privilege('authenticated', 'public.' || t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') or has_any_column_privilege('authenticated', 'public.' || t, 'SELECT, INSERT, UPDATE, REFERENCES') then
      raise exception 'firmy_zgloszenia: klient ma dostęp do %', t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then raise exception 'firmy_zgloszenia: polityka na % otwiera tabelę', t; end if;
  end loop;
  foreach f in array array['public.akcja_firmy_wpusc(text, text)', 'public.akcja_firmy_zgloszenie_dodaj(uuid, text, text, text, text, text, text, text, integer, boolean)', 'public.akcja_firmy_zgloszenia_lista()', 'public.akcja_firmy_zatwierdz(uuid, text, uuid)', 'public.akcja_firmy_odrzuc(uuid, text, uuid)', 'public.akcja_firmy_sprzatanie()', 'public.akcja_firmy_progi(integer, integer, boolean)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then raise exception 'firmy_zgloszenia: klient woła %', f; end if;
  end loop;
  if (select public from storage.buckets where id = 'firmy-zgloszenia') is distinct from false then raise exception 'firmy-zgloszenia: kubełek ma być prywatny'; end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') || coalesce(with_check, '')) like '%firmy-zgloszenia%') then raise exception 'firmy-zgloszenia: żadnych polityk na kubełku'; end if;
  if exists (select 1 from public.akcje where firmy_zgloszenia) then raise exception 'firmy_zgloszenia: przełącznik ma być wyłączony'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
