// bieg-przypomnienie — BIEG WIRTUALNY, ETAP 2: jeden e-mail przed biegiem do kont ze zgodą (akcja_bieg_zgody: także rodzic, który zapisał same dzieci).
// W DWÓCH DOBACH (decyzja 13.11): dwa dni przed startem od 18:00 i dzień przed startem od 8:00 czasu polskiego, najwyżej 90 wiadomości na dobę (Resend: 100 na dobę na całe konto).
// Okna i limit liczy baza (akcja_bieg_do_przypomnienia z logu wysyłek); cron (20261128) woła o 7:00/7:20/7:40 i 17:00/17:20/17:40 UTC, z nagłówkiem x-push-secret = PUSH_HOOK_SECRET.
// Klucz serwisowy WYŁĄCZNIE do dwóch RPC: akcja_bieg_do_przypomnienia (odbiorcy, adres z auth.users, token rezygnacji) i akcja_bieg_mail_zapisz (log = blokada podwójnej wysyłki i licznik doby).
// Wysyłka przez Resend (RESEND_API_KEY, RESEND_FROM_EMAIL jak w firma-panel), pojedynczo, ≤ 2/s; 90 wiadomości to ~55 s, budżet wywołania ~110 s.
// Link rezygnacji: bieg.html?rezygnacja=<token> (strona woła EF bieg-rezygnacja) i nagłówek List-Unsubscribe jednym kliknięciem (POST na bieg-rezygnacja).
// ?test=1 = tylko liczby (ile odbiorców, które biegi), BEZ wysyłki i BEZ wpisu do logu; adresów w odpowiedzi nie ma nigdy. Treść bez nazwisk; nazwa biegu i imiona z bazy.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND = Deno.env.get('RESEND_API_KEY') || '', NADAWCA = Deno.env.get('RESEND_FROM_EMAIL') || 'BiegaMy <noreply@biegamy.run>', STRONA = 'https://biegamy.run';
const HOOK = Deno.env.get('PUSH_HOOK_SECRET') || '';   // pusty = odmowa, nigdy „otwarte”
const BUDZET_MS = 110_000, PRZERWA_MS = 600;
const h = { 'content-type': 'application/json' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const dataPl = (iso: string) => { const [y, m, d] = String(iso).split('-').map(Number); return `${d}.${m}.${y}`; };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Uczestnik = { imie: string; numer: number; rodzaj: string; dystans_km: number | null };
type Odbiorca = { bieg_id: string; konto_id: string; slug: string; nazwa: string; dzien_od: string; dzien_do: string; wynik_do: string; dni_do_biegu: number; email: string; token: string; uczestnicy: Uczestnik[] };

/* Wysyłka w dwóch dobach (decyzja 13.11): dwa dni przed startem wieczorem („W sobotę bieg”) i dzień przed rano („Jutro bieg”); dni_do_biegu liczy baza w czasie polskim. */
const DZIEN = ['w niedzielę', 'w poniedziałek', 'we wtorek', 'w środę', 'w czwartek', 'w piątek', 'w sobotę'];
export function kiedy(dni: number, dzienOd: string) {
  const [y, m, d] = String(dzienOd).split('-').map(Number), dt = DZIEN[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] || 'wkrótce', duza = dt.charAt(0).toUpperCase() + dt.slice(1);
  if (dni === 1) return { temat: 'Jutro bieg', zdanie: 'Jutro zaczyna się weekend biegu' };
  if (dni === 2) return { temat: `${duza} bieg`, zdanie: `${duza} (pojutrze) zaczyna się weekend biegu` };
  return { temat: `${duza} bieg`, zdanie: `${duza} zaczyna się weekend biegu` };
}

export function tresc(o: Odbiorca) {
  const tylkoDzieci = o.uczestnicy.every((u) => u.rodzaj === 'dziecko'), k = kiedy(Number(o.dni_do_biegu), o.dzien_od);
  const lista = o.uczestnicy.map((u) => `<li><b>${esc(u.imie)}</b> · numer ${Number(u.numer)} · ${u.rodzaj === 'dziecko' ? 'swój dystans' : `${Number(u.dystans_km)} km`}</li>`).join('');
  const strona = `${STRONA}/bieg.html`, rezygnacja = UUID.test(o.token) ? `${strona}?rezygnacja=${o.token}` : strona;
  return {
    temat: `${k.temat}: ${o.nazwa}`,
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
<h2 style="margin:0 0 8px">${esc(o.nazwa)}</h2>
<p>${k.zdanie} (${dataPl(o.dzien_od)}–${dataPl(o.dzien_do)}). Pobiegnij albo przejdź swój dystans tam, gdzie mieszkasz, w sobotę lub w niedzielę.</p>
<p>${tylkoDzieci ? 'Numery startowe Twoich dzieci:' : 'Twoje numery startowe:'}</p><ul>${lista}</ul>
<p>Wynik wchodzi z zegarka jak każdy trening w BiegaMy albo dopisujesz trening sam na ekranie Dziś. Dystans dziecka wpisujesz na stronie biegu. Czas masz do ${dataPl(o.wynik_do)}. Potem dyplom i odznaka czekają na stronie biegu: <a href="${strona}">${strona}</a></p>
<p>Jeśli chcesz, wesprzyj zbiórkę bezpośrednio u organizacji, która ją prowadzi (link na stronie biegu). BiegaMy nic nie przyjmuje.</p>
<p style="color:#666;font-size:12px">To jedyny e-mail o tym biegu, wysłany, bo zaznaczono zgodę przy zapisie. <a href="${rezygnacja}" style="color:#666">Nie chcę e-maili o tym biegu</a>.</p>
</div>`,
    tekst: `${o.nazwa}\n\n${k.zdanie} (${dataPl(o.dzien_od)}–${dataPl(o.dzien_do)}).\n${tylkoDzieci ? 'Numery dzieci' : 'Twoje numery'}: ${o.uczestnicy.map((u) => `${u.imie} ${u.numer}`).join(', ')}.\nWynik do ${dataPl(o.wynik_do)}. Strona biegu: ${strona}\nWsparcie zbiórki tylko u organizacji.\n\nRezygnacja z e-maili o tym biegu: ${rezygnacja}`,
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
  let wyslane = 0, bledy = 0, pominiete = 0;
  for (const o of odbiorcy) {
    if (Date.now() - start > BUDZET_MS) { pominiete = odbiorcy.length - wyslane - bledy; break; }   // reszta w kolejnym wywołaniu z crona (log blokuje podwójne)
    const t = tresc(o);
    try {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND}` },
        body: JSON.stringify({ from: NADAWCA, to: [o.email], subject: t.temat, html: t.html, text: t.tekst, headers: t.naglowki }) });
      const ok = r.ok;
      await sb.rpc('akcja_bieg_mail_zapisz', { p_bieg_id: o.bieg_id, p_konto_id: o.konto_id, p_blad: ok ? null : `resend ${r.status}` });
      if (ok) wyslane++; else bledy++;
    } catch (e) { bledy++; await sb.rpc('akcja_bieg_mail_zapisz', { p_bieg_id: o.bieg_id, p_konto_id: o.konto_id, p_blad: String((e as Error).message || e).slice(0, 200) }); }
    await new Promise((ok) => setTimeout(ok, PRZERWA_MS));   // Resend: ≤ 2/s
  }
  return new Response(JSON.stringify({ wyslane, bledy, pominiete, ile: odbiorcy.length }), { headers: h });
});
