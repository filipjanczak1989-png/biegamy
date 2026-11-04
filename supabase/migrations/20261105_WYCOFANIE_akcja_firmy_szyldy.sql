-- Wycofanie 20261105_akcja_firmy_szyldy.sql. Firmy zostają, ukryte wrócą na listę. Partnerzy akcji dostają potwierdzenie = true, bo stara reguła nie zna wsparcia rzeczowego: przy kolejnym wdrożeniu popraw je w panelu.
begin;
do $$
declare
  v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  v_nowa text;
begin
  v_nowa := replace(v_def, $n$'logo_url', f.logo_url, 'rodzaj', f.rodzaj, 'wsparcie', f.wsparcie,$n$, $n$'logo_url', f.logo_url,$n$);
  v_nowa := replace(v_nowa, $n$where f.akcja_slug = a.slug and not f.ukryta;$n$, $n$where f.akcja_slug = a.slug;$n$);
  v_nowa := replace(v_nowa, $n$'prog_domku_zl', a.prog_domku_zl, 'prog_wiezowca_zl', a.prog_wiezowca_zl, 'firmy_zgloszenia', a.firmy_zgloszenia, 'kontakt_firmy', a.kontakt_firmy, $n$, '');
  execute v_nowa;
  if pg_get_functiondef('public.akcja_licznik(text)'::regprocedure) ~ 'kontakt_firmy|f\.rodzaj|f\.ukryta' then raise exception 'wycofanie akcja_firmy_szyldy: licznik wciąż zna nowe pola'; end if;
end $$;
drop policy if exists akcja_firmy_trener_zmienia on public.akcja_firmy;
revoke update (nazwa, link, logo_url, rodzaj, wsparcie, potwierdzenie_widziane, ukryta) on public.akcja_firmy from authenticated;
update public.akcja_firmy set potwierdzenie_widziane = true where not potwierdzenie_widziane;
alter table public.akcja_firmy drop constraint if exists akcja_firmy_potwierdzenie_widziane_check;
alter table public.akcja_firmy add constraint akcja_firmy_potwierdzenie_widziane_check check (potwierdzenie_widziane = true);
alter table public.akcja_firmy drop column if exists wsparcie;
alter table public.akcja_firmy drop column if exists ukryta;
alter table public.akcja_firmy drop column if exists rodzaj;
alter table public.akcje drop column if exists kontakt_firmy;
alter table public.akcje drop column if exists firmy_zgloszenia;
alter table public.akcje drop column if exists prog_wiezowca_zl;
alter table public.akcje drop column if exists prog_domku_zl;
notify pgrst, 'reload schema';
commit;
