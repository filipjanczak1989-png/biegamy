-- 20261201_WYCOFANIE_akcja_bieg_mail_ponowienie.sql — wycofanie 20261201: funkcje odbiorców i starego zapisu wracają słowo w słowo do 20261126,
--   rezerwacja i wynik zdjęte, kolumny stan/proby/zmieniono_at zdjęte. Wpisy logu zostają (każdy dalej blokuje konto jak w 20261126).
--   Przed wycofaniem: EF bieg-przypomnienie z powrotem w wersji sprzed 14.11 albo cron e-maila wyłączony, inaczej nowa EF dostanie błąd RPC i nic nie wyśle.
begin;

create or replace function public.akcja_bieg_do_przypomnienia(p_teraz timestamptz default now(), p_limit integer default 90)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_dzis date := (p_teraz at time zone 'Europe/Warsaw')::date; v_godz time := (p_teraz at time zone 'Europe/Warsaw')::time; v_wolne integer;
begin
  v_wolne := greatest(0, least(coalesce(p_limit, 90), 90)
                         - (select count(*)::integer from public.akcja_bieg_maile m where (m.wyslano_at at time zone 'Europe/Warsaw')::date = v_dzis));
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
     and not exists (select 1 from public.akcja_bieg_maile m where m.bieg_id = b.id and m.konto_id = z.konto_id and m.rodzaj = 'przypomnienie')
   order by b.dzien_od, z.zmieniono_at, z.konto_id
   limit v_wolne) r), '[]'::jsonb);
end $function$;

create or replace function public.akcja_bieg_mail_zapisz(p_bieg_id uuid, p_konto_id uuid, p_blad text default null)
 returns void
 language sql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  insert into public.akcja_bieg_maile (bieg_id, konto_id, blad) values (p_bieg_id, p_konto_id, left(p_blad, 300))
    on conflict (bieg_id, konto_id, rodzaj) do update set wyslano_at = now(), blad = excluded.blad;
$function$;

drop function if exists public.akcja_bieg_mail_wynik(uuid, uuid, integer, text, text, timestamptz);
drop function if exists public.akcja_bieg_mail_rezerwuj(uuid, uuid, timestamptz);
alter table public.akcja_bieg_maile drop column if exists zmieniono_at, drop column if exists proby, drop column if exists stan;
comment on table public.akcja_bieg_maile is 'Log wysyłek e-maila dzień przed biegiem: blokada podwójnej wysyłki. Bez adresów. Sprzątany razem z uczestnikami 90 dni po wynik_do.';

notify pgrst, 'reload schema';
commit;
