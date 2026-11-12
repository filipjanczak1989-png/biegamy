-- Wycofanie 20261113_akcja_firmy_usuniecie.sql. Wiersze już usunięte miękko mają wyczyszczone dane (nie da się ich odtworzyć) — bez kolumny usunieta_at wróciłyby
-- do panelu jako „[usunięta]”, więc wracają do starej postaci: twardo skasowane. Wraca DELETE z przeglądarki, stara polityka UPDATE i stare definicje funkcji.
begin;
delete from public.akcja_firmy where usunieta_at is not null;
update public.akcja_firmy set link = 'https://biegamy.run/' where link is null;
alter table public.akcja_firmy alter column link set not null;
-- zgłoszenia usuniętych firm: link wraca jako adres BiegaMy (CHECK z 20261107 wymaga linku poza cegiełką), potem stara definicja CHECK
update public.akcja_firmy_zgloszenia set link = 'https://biegamy.run/' where link is null and rodzaj <> 'cegielka';
alter table public.akcja_firmy_zgloszenia
  drop constraint akcja_firmy_zgloszenia_link_check,
  add constraint akcja_firmy_zgloszenia_link_check check (case when rodzaj = 'cegielka' then link is null
    else link is not null and char_length(link) <= 500 and link ~ '^https://[^[:space:]/?#<>"''@\\]+\.[^[:space:]/?#<>"''@\\]+([/?#][^[:space:]<>"'']*)?$' end);

do $$
declare v_def text; v_nowa text;
begin
  v_def := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  v_nowa := replace(v_def, $n$where f.akcja_slug = a.slug and not f.ukryta and f.usunieta_at is null;$n$, $n$where f.akcja_slug = a.slug and not f.ukryta;$n$);
  execute v_nowa;
  v_def := pg_get_functiondef('public.akcja_sciezka_stan()'::regprocedure);
  v_nowa := replace(v_def, $n$ and f.usunieta_at is null)$n$, $n$)$n$);
  execute v_nowa;
  v_def := pg_get_functiondef('public.akcja_proba_firmy(boolean)'::regprocedure);
  v_nowa := regexp_replace(v_def, $r$v_logo := '[^']*';\s*-- plik zastępczy[^\n]*$r$, $n$select f.logo_url into v_logo from public.akcja_firmy f where f.logo_url is not null order by f.dodano limit 1;$n$);
  execute v_nowa;
  v_def := pg_get_functiondef('public.akcja_firmy_zgloszenia_lista()'::regprocedure);
  v_nowa := replace(v_def, $n$, 'firma_id', z.firma_id, 'firma_usunieta', exists (select 1 from public.akcja_firmy f where f.id = z.firma_id and f.usunieta_at is not null))$n$, $n$)$n$);
  execute v_nowa;
  if pg_get_functiondef('public.akcja_licznik(text)'::regprocedure) ~ 'usunieta_at' or pg_get_functiondef('public.akcja_sciezka_stan()'::regprocedure) ~ 'usunieta_at'
     or pg_get_functiondef('public.akcja_proba_firmy(boolean)'::regprocedure) ~ 'v_logo := ' or pg_get_functiondef('public.akcja_firmy_zgloszenia_lista()'::regprocedure) ~ 'firma_usunieta' then
    raise exception 'wycofanie akcja_firmy_usuniecie: funkcje wciąż znają usunięcie';
  end if;
end $$;

drop function if exists public.akcja_firmy_usun(uuid);
drop policy if exists akcja_firmy_trener_zmienia on public.akcja_firmy;
create policy akcja_firmy_trener_zmienia on public.akcja_firmy for update to authenticated using (public.auth_is_coach()) with check (public.auth_is_coach());
create policy akcja_firmy_trener_kasuje on public.akcja_firmy for delete to authenticated using (public.auth_is_coach());
grant delete on public.akcja_firmy to authenticated;
drop index if exists public.akcja_firmy_zywe;
alter table public.akcja_firmy drop column if exists usunal;
alter table public.akcja_firmy drop column if exists usunieta_at;
notify pgrst, 'reload schema';
commit;
