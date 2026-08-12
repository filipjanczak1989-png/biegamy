-- ── #100kmDlaKasi — suma wspólna + wkład własny ──────────────────────────────
-- ⚠️ DATY SĄ TU NA SZTYWNO i nie sięgną do JS. To jedyna nieusuwalna kopia
--    stałych wyzwania; pilnuje jej tools/sprawdz-spol-stale.py (kod wyjścia 1
--    przy rozjeździe). Zmiana okna TUTAJ wymaga zmiany w index.html
--    i zawodnik.html — i odwrotnie.

create table if not exists community_stats (
  klucz        text primary key,
  wartosc      numeric     not null,
  obliczone_at timestamptz not null default now()
);
alter table community_stats enable row level security;
-- ZERO polityk INSERT/UPDATE — zapisuje wyłącznie funkcja SECURITY DEFINER.
-- ZERO polityki SELECT — anon nie czyta tabeli, tylko woła funkcję.

-- ⚠️ DROP przed CREATE: CREATE OR REPLACE nie zmieni typu zwracanego, a ta
--    wersja dokłada kolumnę `wklad`. Bez DROP-a migracja kończy się błędem
--    "cannot change return type of existing function" i zostaje STARA funkcja.
drop function if exists community_km();

create function community_km()
returns table (km numeric, wklad numeric, obliczone_at timestamptz)
language plpgsql security definer set search_path = public as $fn$
declare v_km numeric; v_at timestamptz; v_wklad numeric;
begin
  -- ── SUMA WSPÓLNA — cache dobowy, identyczna dla wszystkich ──
  select cs.wartosc, cs.obliczone_at into v_km, v_at
    from community_stats cs where cs.klucz = 'km_od_2026_09_01';

  if v_at is null or v_at < date_trunc('day', now()) then
    select coalesce(sum(l.distance_km), 0) into v_km
      from training_logs l
     where l.distance_km is not null
       and l.logged_at >= '2026-09-01' and l.logged_at < '2026-09-21'
       and lower(trim(l.training_type)) in
         ('spokojny','bieg spokojny','wybieganie','długi','tempo',
          'progresja','interwały','start','wyścig','regeneracja');

    insert into community_stats(klucz, wartosc, obliczone_at)
      values ('km_od_2026_09_01', v_km, now())
      on conflict (klucz) do update
        set wartosc = excluded.wartosc, obliczone_at = excluded.obliczone_at;
    v_at := now();
  end if;

  -- ── WKŁAD WŁASNY — NA ŻYWO, bez cache ──
  -- Przy wspólnej sumie rozjazd kilku km wobec 6000 nie ma znaczenia. Przy
  -- własnym wkładzie MA: człowiek zapisuje 12 km, widzi starą liczbę i uznaje,
  -- że nie zadziałało.
  --
  -- ⚠️ WYŁĄCZNIE po auth.uid(). Funkcja jest SECURITY DEFINER i wywoływalna
  -- przez anon, więc NIE MOŻE przyjmować athlete_id jako parametru — inaczej
  -- każdy pytałby o cudzy wkład. Dla anon auth.uid() jest NULL → wklad = 0.
  select coalesce(sum(l.distance_km), 0) into v_wklad
    from training_logs l
    join athletes a on a.id = l.athlete_id
   where a.user_id = auth.uid()
     and l.distance_km is not null
     and l.logged_at >= '2026-09-01' and l.logged_at < '2026-09-21'
     and lower(trim(l.training_type)) in
       ('spokojny','bieg spokojny','wybieganie','długi','tempo',
        'progresja','interwały','start','wyścig','regeneracja');

  return query select v_km, v_wklad, v_at;
end $fn$;

revoke all on function community_km() from public;
grant execute on function community_km() to anon, authenticated;

-- ── ŹRÓDŁA LOGÓW: dlaczego NIE MA tu wykluczenia po `source` ─────────────────
-- Sprawdzone 12.08.2026: w training_logs istnieją cztery źródła —
--   intervals 989 · manual 829 · ocr 176 · circuit 2 · strava 0
-- Strava nie występuje ANI RAZ; integracja jest nieosiągalna (brak ścieżki
-- strava.com/oauth w repo od miesięcy). Wykluczanie jej byłoby ostrożnością
-- wobec czegoś, czego nie ma.
--
-- ⚠️ JEŚLI INTEGRACJA WRÓCI: sprawdzić, czy log ze Stravy nie duplikuje tego
-- samego biegu z intervals. Wtedy wykluczenie może być potrzebne — ale PO
-- POMIARZE, nie z ostrożności.
--
-- ⚠️ DUPLIKATY JUŻ ISTNIEJĄ, w innej parze — zmierzone 12.08.2026:
--   intervals × (manual|ocr), ten sam dzień, dystans ±0,5 km
--   → 60 par u 2 zawodników, 599 km liczonych DWA RAZY
--   przykłady: 02.08 intervals 16,19/1:34:23 vs ocr 16,19/1:34:40
--              05.07 intervals 20,01/1:49:27 vs manual 20,00/1:49:20
-- Ludzie wpisują bieg ręcznie albo skanują zrzut, a potem synchronizują ten sam
-- bieg z zegarka. Funkcja NIE odszumia tego świadomie: reguła „ten sam dzień,
-- podobny dystans" odrzuciłaby prawdziwy drugi bieg komuś, kto biega dwa razy
-- dziennie. Decyzja produktowa, nie techniczna — do rozstrzygnięcia osobno.
