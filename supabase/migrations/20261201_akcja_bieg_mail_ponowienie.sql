-- 20261201_akcja_bieg_mail_ponowienie.sql — BIEG: e-mail przed biegiem ponawiany po błędzie, bez ryzyka podwójnej wysyłki (decyzja 14.11, dotyczy kroku 6a: EF bieg-przypomnienie).
--   Było (20261126): każdy wpis w logu akcja_bieg_maile, także błąd, wykluczał konto na zawsze (chwilowy 429 z Resend = brak przypomnienia),
--   a EF zapisywała log PO wysyłce (awaria między wysyłką a zapisem = ten sam e-mail w następnym wywołaniu crona).
--   Jest: rezerwacja PRZED wysyłką (stan 'wysylam', numer próby), wynik po wysyłce:
--     'wyslany' — Resend przyjął;
--     'blad'    — Resend na pewno odrzucił (każda próba w wywołaniu dostała 400/401/403/404/405/422/429): ponowienie najwcześniej po 15 min, najwyżej 3 próby;
--     'niepewny'— 5xx, 409, zerwane połączenie albo przekroczony czas: nie wiadomo, czy poszło, więc bez ponowienia (do ręcznego sprawdzenia).
--   Rezerwacja bez wyniku (EF przerwana) zostaje 'wysylam' i działa jak 'niepewny'. Limit doby liczy wszystko poza 'blad' (odrzucone nie zużywają limitu Resend).
--   EF wysyła z nagłówkiem Idempotency-Key = bieg/konto/numer próby: ponowienie w tym samym wywołaniu idzie tym samym kluczem i tą samą treścią,
--   więc Resend nie wyśle drugi raz (24 h). Nowa próba po 'blad' = nowy klucz (poprzednia na pewno nie poszła).
--   Kolejność: test po skutku tools/akcja-bieg-mail-test.sh (AKCJA_BIEG_MAIL_Z_MIGRACJA=1) → ten plik → test bez flagi → deploy EF bieg-przypomnienie.
--   Wycofanie: 20261201_WYCOFANIE_akcja_bieg_mail_ponowienie.sql.
begin;

alter table public.akcja_bieg_maile
  add column stan text not null default 'wyslany' check (stan in ('wysylam', 'wyslany', 'blad', 'niepewny')),
  add column proby integer not null default 1 check (proby between 1 and 3),
  add column zmieniono_at timestamptz not null default now();
update public.akcja_bieg_maile set stan = 'niepewny', zmieniono_at = wyslano_at where blad is not null;
comment on table public.akcja_bieg_maile is 'Log e-maila przed biegiem: rezerwacja przed wysyłką i wynik. Bez adresów. wyslano_at = ostatnia próba, proby = numer próby (klucz Idempotency-Key). Sprzątany razem z uczestnikami 90 dni po wynik_do.';

-- odbiorcy jak w 20261126; zmienione tylko dwa miejsca: limit doby bez odrzuconych i powrót konta po odrzuceniu (najwyżej 3 próby, co najmniej 15 min po poprzedniej)
create or replace function public.akcja_bieg_do_przypomnienia(p_teraz timestamptz default now(), p_limit integer default 90)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_dzis date := (p_teraz at time zone 'Europe/Warsaw')::date; v_godz time := (p_teraz at time zone 'Europe/Warsaw')::time; v_wolne integer;
begin
  v_wolne := greatest(0, least(coalesce(p_limit, 90), 90)
                         - (select count(*)::integer from public.akcja_bieg_maile m where m.stan <> 'blad' and (m.wyslano_at at time zone 'Europe/Warsaw')::date = v_dzis));
  if v_wolne = 0 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(r.o order by r.kolejnosc) from (
    select row_number() over (order by b.dzien_od, z.zmieniono_at, z.konto_id) as kolejnosc,
           jsonb_build_object('bieg_id', b.id, 'slug', b.slug, 'nazwa', b.nazwa, 'dzien_od', b.dzien_od, 'dzien_do', b.dzien_do, 'wynik_do', b.wynik_do, 'dni_do_biegu', b.dzien_od - v_dzis,
                              'konto_id', z.konto_id, 'email', au.email, 'token', z.token, 'uczestnicy', x.lista) as o
    from public.akcja_biegi b
    join public.akcja_bieg_zgody z on z.bieg_id = b.id and z.zgoda_email
    join lateral (select jsonb_agg(jsonb_build_object('imie', u.imie, 'numer', u.numer, 'rodzaj', u.rodzaj, 'dystans_km', u.dystans_km) order by u.numer) as lista
                    from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.konto_id = z.konto_id and u.wycofany_at is null) x on x.lista is not null
    join public.athletes a on a.id = z.konto_id
    join auth.users au on au.id = a.user_id
   where b.status = 'otwarty' and au.email is not null
     and ((b.dzien_od = v_dzis + 2 and v_godz >= time '18:00') or (b.dzien_od = v_dzis + 1 and v_godz >= time '08:00'))
     and not exists (select 1 from public.akcja_bieg_maile m where m.bieg_id = b.id and m.konto_id = z.konto_id and m.rodzaj = 'przypomnienie'
                       and not (m.stan = 'blad' and m.proby < 3 and m.zmieniono_at <= p_teraz - interval '15 minutes'))
   order by b.dzien_od, z.zmieniono_at, z.konto_id
   limit v_wolne) r), '[]'::jsonb);
end $function$;

-- rezerwacja przed wysyłką: numer próby albo null (ktoś już wysyła, wysłane, niepewne, odrzucone za świeżo, 3 próby wyczerpane, zgoda cofnięta)
create function public.akcja_bieg_mail_rezerwuj(p_bieg_id uuid, p_konto_id uuid, p_teraz timestamptz default now())
 returns integer
 language sql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  insert into public.akcja_bieg_maile as m (bieg_id, konto_id, stan, proby, wyslano_at, zmieniono_at)
  select p_bieg_id, p_konto_id, 'wysylam', 1, p_teraz, p_teraz
   where exists (select 1 from public.akcja_bieg_zgody z where z.bieg_id = p_bieg_id and z.konto_id = p_konto_id and z.zgoda_email)
  on conflict (bieg_id, konto_id, rodzaj) do update set stan = 'wysylam', proby = m.proby + 1, wyslano_at = p_teraz, zmieniono_at = p_teraz
   where m.stan = 'blad' and m.proby < 3 and m.zmieniono_at <= p_teraz - interval '15 minutes'
  returning m.proby;
$function$;
revoke all on function public.akcja_bieg_mail_rezerwuj(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.akcja_bieg_mail_rezerwuj(uuid, uuid, timestamptz) to service_role;

-- wynik po wysyłce: tylko dla rezerwacji tej samej próby, która wciąż czeka; true = zapisane
create function public.akcja_bieg_mail_wynik(p_bieg_id uuid, p_konto_id uuid, p_proba integer, p_stan text, p_blad text default null, p_teraz timestamptz default now())
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_stan is null or p_stan not in ('wyslany', 'blad', 'niepewny') then raise exception 'akcja_bieg_mail_wynik: nieznany stan %', p_stan using errcode = '22023'; end if;
  update public.akcja_bieg_maile
     set stan = p_stan, blad = case when p_stan = 'wyslany' then null else left(coalesce(p_blad, p_stan), 300) end, zmieniono_at = p_teraz
   where bieg_id = p_bieg_id and konto_id = p_konto_id and rodzaj = 'przypomnienie' and stan = 'wysylam' and proby = p_proba;
  return found;
end $function$;
revoke all on function public.akcja_bieg_mail_wynik(uuid, uuid, integer, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.akcja_bieg_mail_wynik(uuid, uuid, integer, text, text, timestamptz) to service_role;

-- stara droga (EF sprzed 14.11, zapis po wysyłce): błąd nie wiadomo jaki, więc 'niepewny' (bez ponowienia); sukces = 'wyslany'
create or replace function public.akcja_bieg_mail_zapisz(p_bieg_id uuid, p_konto_id uuid, p_blad text default null)
 returns void
 language sql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  insert into public.akcja_bieg_maile (bieg_id, konto_id, blad, stan) values (p_bieg_id, p_konto_id, left(p_blad, 300), case when p_blad is null then 'wyslany' else 'niepewny' end)
    on conflict (bieg_id, konto_id, rodzaj) do update set wyslano_at = now(), zmieniono_at = now(), blad = excluded.blad, stan = excluded.stan;
$function$;

notify pgrst, 'reload schema';
commit;
