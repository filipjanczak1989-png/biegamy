// bieg-przypomnienie — BIEG WIRTUALNY, ETAP 2: jeden e-mail przed biegiem do kont ze zgodą (akcja_bieg_zgody: także rodzic, który zapisał same dzieci).
// JEDEN E-MAIL 3 DNI PRZED KOŃCEM BIEGU (decyzja 17.11, bieg przez cały okres): od 8:00 czasu polskiego, zaległe następnego dnia (akcja_bieg_do_przypomnienia po 20261207),
// najwyżej 90 wiadomości na dobę (Resend: 100 na dobę na całe konto). Treść: „zostały 3 dni, jeszcze możesz pobiec”.
// Okna i limit liczy baza (akcja_bieg_do_przypomnienia z logu wysyłek); cron (20261128) woła o 7:00/7:20/7:40 i 17:00/17:20/17:40 UTC, z nagłówkiem x-push-secret = PUSH_HOOK_SECRET.
// Klucz serwisowy WYŁĄCZNIE do trzech RPC: akcja_bieg_do_przypomnienia (odbiorcy, adres z auth.users, token rezygnacji), akcja_bieg_mail_rezerwuj (PRZED wysyłką)
// i akcja_bieg_mail_wynik (po wysyłce): migracja 20261201. Odrzucony e-mail wraca po 15 min (najwyżej 3 próby), niepewny (5xx, zerwane połączenie) nie wraca nigdy.
// Wysyłka przez Resend (RESEND_API_KEY, RESEND_FROM_EMAIL jak w firma-panel) z Idempotency-Key, pojedynczo, ≤ 2/s; logika w _shared/bieg-wysylka.mjs (blizna-243).
// 90 wiadomości to ~55 s, budżet wywołania ~110 s (+ najwyżej 34 s ostatniego odbiorcy); cron woła z pg_net timeout 150 s.
// Link rezygnacji: bieg.html?rezygnacja=<token> (strona woła EF bieg-rezygnacja) i nagłówek List-Unsubscribe jednym kliknięciem (POST na bieg-rezygnacja).
// ?test=1 = tylko liczby (ile odbiorców, które biegi), BEZ wysyłki i BEZ wpisu do logu; adresów w odpowiedzi nie ma nigdy. Treść bez nazwisk; nazwa biegu i imiona z bazy.
// 20.11 (blizna-314, regulamin v7): treść mówi, że trening dopisany na Dziś musi mieć czas („dopisz trening na Dziś z czasem (np. 45:00)”) — w HTML i w wersji tekstowej.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { rozeslij, wyslijJeden } from '../_shared/bieg-wysylka.mjs';

const RESEND = Deno.env.get('RESEND_API_KEY') || '', NADAWCA = Deno.env.get('RESEND_FROM_EMAIL') || 'BiegaMy <noreply@biegamy.run>', STRONA = 'https://biegamy.run';
const HOOK = Deno.env.get('PUSH_HOOK_SECRET') || '';   // pusty = odmowa, nigdy „otwarte”
const BUDZET_MS = 110_000, PRZERWA_MS = 600;
const h = { 'content-type': 'application/json' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const dataPl = (iso: string) => { const [y, m, d] = String(iso).split('-').map(Number); return `${d}.${m}.${y}`; };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Uczestnik = { imie: string; numer: number; rodzaj: string; dystans_km: number | null };
type Odbiorca = { bieg_id: string; konto_id: string; slug: string; nazwa: string; dzien_od: string; dzien_do: string; wynik_do: string; dni_do_biegu: number; dni_do_konca?: number; koniec_godz?: string | null; email: string; token: string; uczestnicy: Uczestnik[] };

/* Jeden e-mail przed końcem biegu (decyzja 17.11): dni_do_konca = dzien_do - dziś liczy baza w czasie polskim (3 w dniu wysyłki, 2 dla zaległych). */
const DZIEN = ['niedzielę', 'poniedziałek', 'wtorek', 'środę', 'czwartek', 'piątek', 'sobotę'];
/* 18.11 (migracja 20261209): koniec_godz = godzina końca biegu i wyników w czasie polskim („20:00”) albo brak (koniec dniem, jak dotąd). */
export function godzKonca(g: unknown) { return /^\d{2}:\d{2}$/.test(String(g ?? '')) ? String(g) : ''; }
export function kiedy(dniDoKonca: number, dzienDo: string, koniecGodz?: string | null) {
  const [y, m, d] = String(dzienDo).split('-').map(Number), dt = DZIEN[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] || '', n = Math.max(0, Math.round(Number(dniDoKonca) || 0)), g = godzKonca(koniecGodz);
  const ile = n === 1 ? 'Został 1 dzień' : n >= 2 && n <= 4 ? `Zostały ${n} dni` : `Zostało ${n} dni`;
  if (n < 1) return { temat: 'Ostatni dzień biegu', zdanie: `Dziś ostatni dzień biegu${g ? ` (do godz. ${g})` : ''}. Jeszcze możesz pobiec albo przejść swój dystans` };
  return { temat: `${ile} biegu`, zdanie: `${ile} do końca biegu${dt ? ` (do ${g ? `godz. ${g}` : 'końca dnia'} w ${dt})` : ''}. Jeszcze możesz pobiec albo przejść swój dystans` };
}

export function tresc(o: Odbiorca) {
  const tylkoDzieci = o.uczestnicy.every((u) => u.rodzaj === 'dziecko'), k = kiedy(Number(o.dni_do_konca ?? 3), o.dzien_do, o.koniec_godz), g = godzKonca(o.koniec_godz), doGodz = g ? `, godz. ${g}` : '';
  const lista = o.uczestnicy.map((u) => `<li><b>${esc(u.imie)}</b> · numer ${Number(u.numer)} · ${u.rodzaj === 'dziecko' ? 'swój dystans' : `${Number(u.dystans_km)} km`}</li>`).join('');
  const strona = `${STRONA}/bieg.html`, rezygnacja = UUID.test(o.token) ? `${strona}?rezygnacja=${o.token}` : strona;
  return {
    temat: `${k.temat}: ${o.nazwa}`,
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
<h2 style="margin:0 0 8px">${esc(o.nazwa)}</h2>
<p>${k.zdanie}, kiedy chcesz i gdzie chcesz. Bieg trwa ${dataPl(o.dzien_od)}–${dataPl(o.dzien_do)}.</p>
<p>${tylkoDzieci ? 'Numery startowe Twoich dzieci:' : 'Twoje numery startowe:'}</p><ul>${lista}</ul>
<p>Wynik wchodzi z zegarka jak każdy trening w BiegaMy. Bez zegarka dopisz trening na Dziś z czasem (np. 45:00), bo trening bez czasu nie zalicza biegu. Dystans dziecka wpisujesz na stronie biegu. Czas masz do ${dataPl(o.wynik_do)}${doGodz}. Potem dyplom i odznaka czekają na stronie biegu: <a href="${strona}">${strona}</a></p>
<p>Jeśli chcesz, wesprzyj zbiórkę bezpośrednio u organizacji, która ją prowadzi (link na stronie biegu). BiegaMy nic nie przyjmuje.</p>
<p style="color:#666;font-size:12px">To jedyny e-mail o tym biegu, wysłany, bo zaznaczono zgodę przy zapisie. <a href="${rezygnacja}" style="color:#666">Nie chcę e-maili o tym biegu</a>.</p>
</div>`,
    tekst: `${o.nazwa}\n\n${k.zdanie}, kiedy chcesz i gdzie chcesz. Bieg trwa ${dataPl(o.dzien_od)}–${dataPl(o.dzien_do)}.\n${tylkoDzieci ? 'Numery dzieci' : 'Twoje numery'}: ${o.uczestnicy.map((u) => `${u.imie} ${u.numer}`).join(', ')}.\nBez zegarka dopisz trening na Dziś z czasem (np. 45:00), bo trening bez czasu nie zalicza biegu.\nWynik do ${dataPl(o.wynik_do)}${doGodz}. Strona biegu: ${strona}\nWsparcie zbiórki tylko u organizacji.\n\nRezygnacja z e-maili o tym biegu: ${rezygnacja}`,
    naglowki: UUID.test(o.token) ? { 'List-Unsubscribe': `<${Deno.env.get('SUPABASE_URL')}/functions/v1/bieg-rezygnacja?token=${o.token}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {},
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('{"error":"POST"}', { status: 405, headers: h });
  if (!HOOK || req.headers.get('x-push-secret') !== HOOK) return new Response('{"error":"brak sekretu"}', { status: 401, headers: h });
  const test = new URL(req.url).searchParams.get('test') === '1', start = Date.now();
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc('akcja_bieg_do_przypomnienia');
  if (error) { console.error('bieg-przypomnienie:', error.message); return new Response(JSON.stringify({ error: 'rpc' }), { status: 500, headers: h }); }
  const odbiorcy: Odbiorca[] = Array.isArray(data) ? data : [];
  if (test) return new Response(JSON.stringify({ test: true, ile: odbiorcy.length, biegi: [...new Set(odbiorcy.map((o) => o.slug))], same_dzieci: odbiorcy.filter((o) => o.uczestnicy.every((u) => u.rodzaj === 'dziecko')).length }), { headers: h });
  if (!RESEND) return new Response('{"error":"brak RESEND_API_KEY"}', { status: 500, headers: h });
  const czekaj = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
  const wynik = await rozeslij({ odbiorcy, sb, tresc, nadawca: NADAWCA, start, budzetMs: BUDZET_MS, przerwaMs: PRZERWA_MS, czekaj,
    wyslij: (klucz: string, cialo: string) => wyslijJeden({ f: fetch, resend: RESEND, klucz, cialo, czekaj }) });
  if (wynik.blad_rezerwacji) console.error('bieg-przypomnienie: rezerwacja (akcja_bieg_mail_rezerwuj) nie odpowiedziała, wysyłka zatrzymana');
  return new Response(JSON.stringify(wynik), { status: wynik.blad_rezerwacji ? 500 : 200, headers: h });
});
