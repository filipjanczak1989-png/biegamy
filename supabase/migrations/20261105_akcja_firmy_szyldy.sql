-- 20261105_akcja_firmy_szyldy.sql — rodzaj budynku firmy, progi z panelu, ukrywanie bez kasowania (Filip 4.11).
--   akcje.prog_domku_zl, prog_wiezowca_zl — od ilu złotych domek i wieżowiec z logo. Poniżej progu firma jest nazwą na cegiełce w murze. Zmienia Filip.
--   akcje.firmy_zgloszenia                — przełącznik formularza zgłoszeń firm, domyślnie wyłączony.
--   akcje.kontakt_firmy                   — adres do zgłoszeń, tylko w bazie: repo jest publiczne. Wychodzi przez licznik po starcie.
--   akcja_firmy.rodzaj                    — domek, wieżowiec albo cegiełka.
--   akcja_firmy.ukryta                    — zdejmuje firmę z Ulicy i listy bez kasowania wpisu, jednym poleceniem z telefonu.
--   akcja_firmy.wsparcie                  — wpłata na zbiórkę albo sponsor rzeczowy („Partner akcji”). Próg i potwierdzenie wpłaty dotyczą tylko wpłaty.
--   UPDATE dla trenera                    — lista firm z edycją w panelu: nazwa, link, logo, budynek, typ wsparcia, ukrycie. Kwota i zgoda na kwotę bez zmian: tylko przy dodaniu.
--   Dopisane do AKTUALNEJ definicji licznika. WDRAŻAĆ PO 20261104_akcja_firmy.sql.
-- Test: blok niżej. Wycofanie: 20261105_WYCOFANIE_akcja_firmy_szyldy.sql.
begin;

alter table public.akcje add column prog_domku_zl integer not null default 100 check (prog_domku_zl > 0);
alter table public.akcje add column prog_wiezowca_zl integer not null default 1000 check (prog_wiezowca_zl > 0);
alter table public.akcje add column firmy_zgloszenia boolean not null default false;
alter table public.akcje add column kontakt_firmy text check (kontakt_firmy is null or (char_length(kontakt_firmy) <= 120 and kontakt_firmy ~ '^[^@[:space:]<>"]+@[^@[:space:]<>"]+\.[^@[:space:]<>"]+$'));
comment on column public.akcje.prog_domku_zl is 'Od ilu zł firma dostaje domek z logo. Zmienia Filip.';
comment on column public.akcje.prog_wiezowca_zl is 'Od ilu zł firma dostaje wieżowiec z logo. Zmienia Filip.';
comment on column public.akcje.firmy_zgloszenia is 'Formularz zgłoszeń firm na stronie akcji. Domyślnie wyłączony, włącza Filip po teście.';
comment on column public.akcje.kontakt_firmy is 'Adres do zgłoszeń firm. Tylko w bazie, nie w repo. Publicznie przez akcja_licznik po starcie.';

alter table public.akcja_firmy add column rodzaj text not null default 'domek' check (rodzaj in ('domek', 'wiezowiec', 'cegielka'));
alter table public.akcja_firmy add column ukryta boolean not null default false;
comment on column public.akcja_firmy.rodzaj is 'Budynek na Ulicy: domek, wieżowiec albo cegiełka w murze (poniżej progu).';
comment on column public.akcja_firmy.ukryta is 'Zdjęta z Ulicy i listy bez kasowania wpisu.';
alter table public.akcja_firmy add column wsparcie text not null default 'wplata' check (wsparcie in ('wplata', 'rzeczowe'));
comment on column public.akcja_firmy.wsparcie is 'wplata: wpłata na zbiórkę, obowiązują progi i potwierdzenie. rzeczowe: Partner akcji, bez progu kwoty.';
alter table public.akcja_firmy drop constraint akcja_firmy_potwierdzenie_widziane_check;
alter table public.akcja_firmy add constraint akcja_firmy_potwierdzenie_widziane_check check (potwierdzenie_widziane = true or wsparcie = 'rzeczowe');
comment on column public.akcja_firmy.potwierdzenie_widziane is 'Trener widział potwierdzenie wpłaty. Obowiązkowe przy wpłacie, Partner akcji nic nie wpłaca. Nie wychodzi publicznie.';
grant insert (rodzaj, wsparcie) on public.akcja_firmy to authenticated;
grant update (nazwa, link, logo_url, rodzaj, wsparcie, potwierdzenie_widziane, ukryta) on public.akcja_firmy to authenticated;
create policy akcja_firmy_trener_zmienia on public.akcja_firmy for update to authenticated using (public.auth_is_coach()) with check (public.auth_is_coach());

do $$
declare
  v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  v_wzor text := $r$'testowa',\s+a\.testowa\)$r$;
  j_przed jsonb; j_po jsonb; v_nowa text;
begin
  if position('v_firmy' in v_def) = 0 then raise exception 'akcja_firmy_szyldy: najpierw 20261104_akcja_firmy.sql'; end if;
  if (select count(*) from regexp_matches(v_def, v_wzor, 'g')) <> 1 then raise exception 'akcja_firmy_szyldy: definicja licznika inna, niż oczekiwana'; end if;
  if (select count(*) from regexp_matches(v_def, $r$'logo_url', f\.logo_url,$r$, 'g')) <> 1 or (select count(*) from regexp_matches(v_def, $r$where f\.akcja_slug = a\.slug;$r$, 'g')) <> 1 then
    raise exception 'akcja_firmy_szyldy: lista firm w liczniku inna, niż oczekiwana';
  end if;

  j_przed := public.akcja_licznik('dla-fabianka');
  v_nowa := regexp_replace(v_def, $r$'logo_url', f\.logo_url,$r$, $n$'logo_url', f.logo_url, 'rodzaj', f.rodzaj, 'wsparcie', f.wsparcie,$n$);
  v_nowa := regexp_replace(v_nowa, $r$where f\.akcja_slug = a\.slug;$r$, $n$where f.akcja_slug = a.slug and not f.ukryta;$n$);
  v_nowa := regexp_replace(v_nowa, '(' || v_wzor || ')', $n$'prog_domku_zl', a.prog_domku_zl, 'prog_wiezowca_zl', a.prog_wiezowca_zl, 'firmy_zgloszenia', a.firmy_zgloszenia, 'kontakt_firmy', a.kontakt_firmy, \1$n$);
  execute v_nowa;
  j_po := public.akcja_licznik('dla-fabianka');

  if (j_po - 'prog_domku_zl' - 'prog_wiezowca_zl' - 'firmy_zgloszenia' - 'kontakt_firmy') is distinct from j_przed then raise exception 'akcja_firmy_szyldy: odpowiedź licznika zmieniła się poza nowymi polami'; end if;
  if not (j_po->>'wystartowala')::boolean and (j_po ? 'kontakt_firmy' or j_po ? 'prog_domku_zl') then raise exception 'akcja_firmy_szyldy: przed startem licznik zdradza akcję'; end if;
  if exists (select 1 from public.akcje where firmy_zgloszenia) then raise exception 'akcja_firmy_szyldy: zgłoszenia mają być domyślnie wyłączone'; end if;
  if has_column_privilege('anon', 'public.akcje', 'kontakt_firmy', 'SELECT') or has_column_privilege('authenticated', 'public.akcje', 'kontakt_firmy', 'SELECT') or has_column_privilege('authenticated', 'public.akcje', 'firmy_zgloszenia', 'UPDATE') then
    raise exception 'akcja_firmy_szyldy: klient ma dostęp do kolumn akcji';
  end if;
  if has_column_privilege('anon', 'public.akcja_firmy', 'rodzaj', 'INSERT') or has_any_column_privilege('anon', 'public.akcja_firmy', 'UPDATE') then raise exception 'akcja_firmy_szyldy: anon ma dostęp do firm'; end if;
  if not has_column_privilege('authenticated', 'public.akcja_firmy', 'ukryta', 'UPDATE') or not has_column_privilege('authenticated', 'public.akcja_firmy', 'logo_url', 'UPDATE') then raise exception 'akcja_firmy_szyldy: trener nie może edytować firmy'; end if;
  if has_column_privilege('authenticated', 'public.akcja_firmy', 'kwota_gr', 'UPDATE') or has_column_privilege('authenticated', 'public.akcja_firmy', 'zgoda_na_kwote', 'UPDATE') or has_column_privilege('authenticated', 'public.akcja_firmy', 'dodal', 'UPDATE') or has_column_privilege('authenticated', 'public.akcja_firmy', 'akcja_slug', 'UPDATE') then
    raise exception 'akcja_firmy_szyldy: edycja sięga poza dozwolone kolumny';
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
