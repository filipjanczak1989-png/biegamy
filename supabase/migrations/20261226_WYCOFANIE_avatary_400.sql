-- WYCOFANIE 20261226_avatary_400.sql. Konta, których avatar_url wskazuje kopię avatars/<id>.jfif, a duży oryginał
-- avatars/<id>.jpg|jpeg (>= 2 MB) dalej leży w kubełku → ścieżka z powrotem na oryginał, ?t= bez zmian (dokładnie jak przed).
-- Konto, które po przepięciu wgrało nowy avatar, wskazuje już własny nowy plik (nie .jfif) i zostaje nietknięte.
-- Na bazie bez przepiętych kont (projekt testowy, odtwarzanie od zera) nic nie zmienia. Komunikat wraca jako wiersz wyniku.
-- Pliki: kopie .jfif zostają; zdejmuje je osobno avatary-wgraj.cjs --wycofaj, tylko gdy nikt ich już nie wskazuje.
begin;
create temp table if not exists _avatary_400_wynik (komunikat text) on commit drop;
truncate _avatary_400_wynik;
do $$
declare v_par int; v_kont int; v_zmian int;
begin
  create temp table if not exists _avatary_400_w (id uuid, nowa text, stara text) on commit drop;
  truncate _avatary_400_w;
  insert into _avatary_400_w
  select a.id, m.name, d.name
  from public.athletes a
  join storage.objects m on m.bucket_id = 'biegamy-assets'
   and m.name = 'avatars/' || a.id::text || '.jfif'
   and strpos(a.avatar_url, '/storage/v1/object/public/biegamy-assets/' || m.name || '?') > 0
  join storage.objects d on d.bucket_id = 'biegamy-assets'
   and d.name in ('avatars/' || a.id::text || '.jpg', 'avatars/' || a.id::text || '.jpeg')
   and (d.metadata->>'size')::bigint >= 2000000;
  select count(*), count(distinct id) into v_par, v_kont from _avatary_400_w;
  if v_par <> v_kont then
    raise exception 'wycofanie avatary 400: konto z dwoma oryginałami (.jpg i .jpeg >= 2 MB) – nie zgaduję, nic nie zmieniono';
  end if;
  if v_kont > 5 then
    raise exception 'wycofanie avatary 400: % kont zamiast najwyżej 5 – nic nie zmieniono', v_kont;
  end if;
  update public.athletes a
     set avatar_url = replace(a.avatar_url, '/biegamy-assets/' || p.nowa || '?', '/biegamy-assets/' || p.stara || '?')
    from _avatary_400_w p
   where p.id = a.id;
  get diagnostics v_zmian = row_count;
  insert into _avatary_400_wynik values ('wycofanie avatary 400: przywrócono ' || v_zmian || ' kont na oryginały (5 = wszystkie; 0 = nie było czego wycofać; inna liczba = ktoś w międzyczasie zmienił avatar)');
end $$;
select komunikat from _avatary_400_wynik;
commit;
