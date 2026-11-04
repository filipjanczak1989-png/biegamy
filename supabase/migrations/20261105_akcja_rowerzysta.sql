-- 20261105_akcja_rowerzysta.sql — osoba jadąca z wyprawą rowerem (Filip 4.11): ikona na mapie, przejazd na Ulicy i w grze. Domyślnie WYŁĄCZONE, włącza Filip po jej zgodzie na piśmie.
--   rowerzysta_wlaczony — przełącznik. Wyłączony: EF akcja-wyprawa-slad nie oddaje postaci, gra_ranking mówi false, a strony nie proszą nawet o plik.
--   rowerzysta_opis     — podpis na mapie. Imię i nazwa roweru tylko tutaj, w bazie, po zgodzie: repo jest publiczne.
--   Postać stoi przy końcu widocznego śladu grupy, po tych samych strefach prywatności. Bez GPS tej osoby i bez kilometrów: rower NIE liczy się do licznika ani do dystansu wyprawy, akcja_licznik nie zna tych kolumn.
-- Test: blizna-156 i blok niżej. Wycofanie: 20261105_WYCOFANIE_akcja_rowerzysta.sql.
begin;

alter table public.akcje add column rowerzysta_wlaczony boolean not null default false;
alter table public.akcje add column rowerzysta_opis text check (rowerzysta_opis is null or (char_length(rowerzysta_opis) <= 80 and rowerzysta_opis !~ '[<>&"`[:cntrl:]]'));
comment on column public.akcje.rowerzysta_wlaczony is 'Rowerzysta na mapie, Ulicy i w grze. Domyślnie false, włącza Filip po zgodzie tej osoby. Nie wpływa na kilometry.';
comment on column public.akcje.rowerzysta_opis is 'Podpis postaci na mapie. Wychodzi tylko przez EF akcja-wyprawa-slad i gra_ranking (nazwa grywalnej postaci), tylko przy włączonym przełączniku.';

do $$
begin
  if exists (select 1 from public.akcje where rowerzysta_wlaczony) then raise exception 'akcja_rowerzysta: przełącznik ma być domyślnie wyłączony'; end if;
  if position('rowerzysta' in pg_get_functiondef('public.akcja_licznik(text)'::regprocedure)) > 0 then raise exception 'akcja_rowerzysta: licznik nie może znać rowerzysty'; end if;
  if has_column_privilege('anon', 'public.akcje', 'rowerzysta_opis', 'SELECT') or has_column_privilege('authenticated', 'public.akcje', 'rowerzysta_opis', 'SELECT')
     or has_column_privilege('authenticated', 'public.akcje', 'rowerzysta_wlaczony', 'UPDATE') then
    raise exception 'akcja_rowerzysta: klient ma dostęp do kolumn';
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
