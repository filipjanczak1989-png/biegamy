// OKIENKO M3a v2 (1.11.2026, projekt M3 v2 pkt 3) — tryb „impreza": pytanie o konkretny bieg idzie RÓWNOLEGLE do:
//   (a) kalendarza maszyny wyników — przez adapter kalendarz.mjs (od 1.11 14:58 events_search, K-API 017; bez zakresu
//       dat, więc wracają też przeszłe edycje);
//   (b) naszych startów — tabela races (tylko approved, RLS), dedup z (a) po dacie ±1 i nazwie znormalizowanej;
//   (c) sieci — DOZWOLONEJ dla imprezy (nazwa biegu to nie dane osobowe), ale nie gdy pytanie wygląda na imię
//       i nazwisko (stary szeroki detektor) bez trafienia w kalendarzu; liczy się do limitu 20/dobę; pamięć 24 h;
//       źródła zapisywane jako znaleziska ze statusem „kalendarz" (pokarm dla K-źródła na maszynie3).
// Detektor: słowo z listy (bieg, maraton, ultra, cross, trail, parkrun…) + reszta nazwy — „bieg ultrakotlina",
// „maraton warszawski kiedy"; ALBO 1–3 słowa bez słowa z listy, gdy nazwa trafia w kalendarz („ultrakotlina").
// Wynik („kto wygrał…", „wyniki…", „rekord…", „moje…") NIE jest imprezą. Odpowiedź: zdania z sieci (etykieta,
// źródła) → karty z kalendarza → karty z naszych startów; pusto → „Nie znalazłem tego biegu w kalendarzu ani w sieci."
import { normalizuj, czyOboz, maPareOsoby } from "./router.mjs";
import { tekstDlaRegul } from "./router.mjs";   // 23.11: literówki „wyniki” w kopii tekstu dla reguł
import { wygladaNaOsobe, wygladaNaNazwisko } from "./pamiec.mjs";
import { szukajImprez } from "./kalendarz.mjs";
import { BladF6, ODP_F6_ZAJETA } from "./f6.mjs";
import { f6 } from "./f6.mjs";   // 23.11 (krok 3 a): event_info — ostatnia edycja z wynikami tej samej imprezy
import { linkWynikow } from "./linki-wynikow.mjs";   // 23.11 (krok 3 b): adres wyników tylko https + serwis z listy

export const ODP_IMPREZA_PUSTO = "Nie znalazłem tego biegu w kalendarzu ani w sieci.";
export const SLOWA_IMPREZY = /\b(bieg|biegi|biegu|maraton\w*|polmaraton\w*|ultra\w*|zawody|zawodach|cross\w*|dych\w*|piatk\w*|sztafet\w*|trail\w*|parkrun\w*)\b/;
const OGOLNE = /^(bieg|biegi|biegu|zawody|zawodach)$/;   // nie niosą nazwy — wypadają z q
const PYTAJNE = /^(kiedy|gdzie|jaki|jaka|jakie|jakiego|jest|termin|terminy|data|daty|odbywa|sie|bedzie|byl|w|we|na|o|czy|ten|ta|to|tego|edycja|najblizszy|najblizsza|najblizsze|kolejny|kolejna|nastepny|nastepna|info|informacje|zapisy|start|trasa|trasy|trase|dystans\w*|mapa|mapka|opis)$/;
const NIE_IMPREZA = /\b(kto|wygral\w*|wygrala\w*|wynik\w*|rekord\w*|zyciow\w*|moj\w*|moje|mam|mial\w*|ile|jak|plan\w*|odznak\w*|wyzwan\w*|trening\w*)\b/;
const MAX_KART = 5;
/* Etap 5 (1.11): „ile kosztuje wpisowe na X", „zapisy na X", „cena biegu X" — to pytanie o KONKRETNĄ imprezę. Słowa ceny
   wypadają z q (nie są nazwą), „ile"/„jak" przestają wykluczać. Odpowiedź: karta z kalendarza + „Strona imprezy ›"
   (url z maszyny, przez safeExternalHref w UI); sieć TYLKO, gdy karty brak. */
const CENA = /\b(ile kosztuj\w*|kosztuj\w*|koszt\w*|wpisow\w*|oplat\w*|cen[aeyi]\b|cenn\w*|zapisy|zapisow|zapisac sie|zapisac na)\b/;
const SLOWA_CENY = /^(ile|kosztuje|kosztuja|kosztowac|koszt|koszty|kosztow|wpisowe|wpisowego|wpisowym|oplata|oplaty|oplate|startowa|startowe|startowego|cena|ceny|cene|cennik|zapisy|zapisow|zapisac|zapis|zapisac sie|na|do|za|jak|mnie|sie|gdzie|mozna|moge)$/;
export const ODP_CENA_LINK = "Wpisowe i zapisy podaje strona imprezy:";
export const ODP_CENA_BEZ_LINKU = "Maszyna wyników nie zna strony tej imprezy — cenę i zapisy podaje organizator.";

/** → {q, jawne} | null. jawne = jest słowo z listy (impreza nawet bez trafienia w kalendarzu). */
export function imprezaZPytania(tekst) {
  tekst = tekstDlaRegul(tekst);   // 23.11: „poznan maraton wniki” to pytanie o wyniki (NIE_IMPREZA), nie impreza z „wniki” w nazwie
  const t = normalizuj(tekst);
  if (!t || /^\d+$/.test(t) || czyOboz(tekst)) return null;   // obóz to nie impreza z kalendarza (Filip 3.11; „ile kosztuje obóz biegowy” też)
  if (CENA.test(t) && !/\b(kto|wynik\w*|rekord\w*|moj\w*|moje|mam)\b/.test(t)) {
    const slowa = String(tekst).replace(/[?!.,;:"„”()]/g, " ").split(/\s+/).filter(Boolean)
      .filter((w) => { const n = normalizuj(w); return n && !SLOWA_CENY.test(n) && !PYTAJNE.test(n) && !OGOLNE.test(n); });
    if (!slowa.length || slowa.length > 5) return null;
    return { q: slowa.join(" ").slice(0, 80), jawne: SLOWA_IMPREZY.test(t), cena: true };   // bez słowa biegu („para butów") impreza tylko po trafieniu w kalendarz
  }
  if (NIE_IMPREZA.test(t)) return null;
  if (/\bdystans\w* (ma|maja) (maraton|polmaraton|ultramaraton|dych\w*|piatk\w*)$/.test(t)) return null;   // baza wiedzy 4.11: „jaki dystans ma maraton” to wiedza ogólna, nie nazwa imprezy
  const slowa = String(tekst).replace(/[?!.,;:"„”()]/g, " ").split(/\s+/).filter(Boolean);
  const nazwa = slowa.filter((w) => { const n = normalizuj(w); return n && !PYTAJNE.test(n) && !OGOLNE.test(n); });
  if (!nazwa.length || nazwa.length > 5) return null;
  const jawne = SLOWA_IMPREZY.test(t);
  if (!jawne && nazwa.length > 3) return null;
  return { q: nazwa.join(" ").slice(0, 80), jawne };
}

const bezZnakow = (s) => normalizuj(s).replace(/\b(\d+|[ivxlc]+)\b/g, " ").replace(/\s+/g, " ").trim();   // bez numeru edycji (normalizuj = js/tekst.mjs przez router)
function dniMiedzy(a, b) { return Math.abs(Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000)); }
function dodajDni(d, n) { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

/** (b) nasze starty: races approved od wczoraj, nazwa zawiera każde słowo q (≥ 3 litery). */
export async function naszeStarty(sb, q, dzis) {
  const slowa = String(q).split(/\s+/).map((s) => s.replace(/[%_,()*\\]/g, "")).filter((s) => s.length >= 3).slice(0, 3);
  if (!slowa.length) return [];
  let z = sb.from("races").select("id,name,date,city,status").eq("status", "approved").gte("date", dodajDni(dzis, -1));
  for (const s of slowa) z = z.ilike("name", `%${s}%`);
  const { data, error } = await z.order("date", { ascending: true }).limit(MAX_KART);
  if (error) throw new Error("races");
  return (data || []).map((r) => ({ race_id: r.id, nazwa: String(r.name || "").slice(0, 120), data: r.date || null, miasto: r.city || null }));
}

/** WYNIKI IMPREZY (Filip 22.11, krok 2; 23.11): kalendarz maszyny wyników BEZ sieci → do 3 kart edycji, KTÓRE MAJĄ WYNIKI w maszynie (ma_wyniki === true),
    najnowsza pierwsza. Edycja bez wyników (także przeszła) nie daje karty: „Wyniki ›” prowadziłby donikąd (23.11, Poznań). Pusta lista = brak wyników;
    wyjątek maszyny leci dalej. W obu przypadkach EF zostawia zdanie routera „Nie znalazłem wyników tej imprezy.” z „Otwórz Wyniki ›”. */
export async function kartyWynikow(fetchFn, token, q) {
  return kartyZListy(fetchFn, token, await szukajImprez(fetchFn, token, { q }));
}
async function kartyZListy(fetchFn, token, l) {
  const zWynikami = l.filter((d) => d && d.klucz && d.ma_wyniki === true).sort((a, b) => String(b.data || "").localeCompare(String(a.data || ""))).slice(0, 3).map((d) => ({ typ: "impreza", dane: d }));
  if (zWynikami.length) return zWynikami;
  // 23.11 (krok 3 a): żadna trafiona edycja nie ma wyników (np. najbliższa jest przyszła) → ostatnia edycja Z WYNIKAMI tej samej imprezy
  const pierwsza = l.find((d) => d && d.klucz);
  const ostatnia = pierwsza ? await kartaOstatniejZWynikami(fetchFn, token, pierwsza) : null;
  return ostatnia ? [ostatnia] : [];
}

/** 24.11 (Filip, zamiast sieci po link): reguła wyników jak dotąd, ale bez kart z wynikami → { karty: [], google } — karta „Szukaj wyników w Google ›”
    pod „Otwórz Wyniki ›”. Jedno zapytanie do maszyny (to samo co kartyWynikow); awaria maszyny = brak kart i Google z tekstu pytania. Nigdy nie rzuca. */
export async function wynikiImprezy(fetchFn, token, q, dzis) {
  let l = null;
  try { l = await szukajImprez(fetchFn, token, { q }); } catch { l = null; }
  let karty = [];
  if (l) { try { karty = await kartyZListy(fetchFn, token, l); } catch { karty = []; } }
  return { karty, google: karty.length ? null : kartaGoogleWynikow(l || [], q, dzis) };
}

/** 24.11 (Filip): ZAPYTANIE dla „Szukaj wyników w Google ›” — „<nazwa> <miasto> <rok> wyniki”. Nazwa i miasto z karty kalendarza maszyny (najnowsza
    PRZESZŁA edycja; rok tylko z jej daty), a gdy przeszłej nie ma — z pierwszej karty bez roku; bez karty: tekst pytania bez „wyniki” (q z routera).
    Bez sieci i modelu. Zapytanie z parą imię–nazwisko (maPareOsoby) → null: dane osoby nie idą do wyszukiwarki. Adres (stały host) składa front. */
export function kartaGoogleWynikow(kalendarz, q, dzis) {
  const l = (Array.isArray(kalendarz) ? kalendarz : []).filter((d) => d && typeof d.nazwa === "string" && d.nazwa.trim());
  const przeszle = l.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d.data || "")) && (d.przeszla === true || String(d.data) < String(dzis || "")))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const k = przeszle[0] || l[0] || null;
  const czesci = k ? [String(k.nazwa).split(" – ")[0], k.miejscowosc || k.miasto || "", przeszle[0] ? String(k.data).slice(0, 4) : ""] : [String(q || "")];
  const tekst = [...czesci, "wyniki"].map((s) => String(s).replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
  if (tekst === "wyniki" || tekst.length > 160 || maPareOsoby(tekst)) return null;
  /* tekst PYTANIA (bez karty kalendarza): te same strażniki osoby co przed siecią w trybie imprezy — „wyniki Anny Nowak z maratonu” (imię w dopełniaczu, którego
     maPareOsoby nie zna) router puszcza jako wyniki imprezy, a do Google nie może pójść. Ostrożnie: słowo z dużej litery w krótkim pytaniu też blokuje przycisk. */
  if (!k && (wygladaNaOsobe(String(q || "")) || wygladaNaNazwisko(tekst))) return null;
  return { typ: "szukaj_google", dane: { q: tekst } };
}

/** KROK 3 a (Filip 23.11): ostatnia edycja Z WYNIKAMI tej samej imprezy według maszyny (event_info 019: reguła serii — numery edycji, sponsorzy,
    miasto; ta sama, którą liczy ekran imprezy, więc „Wyniki ›” zawsze otwiera wyniki). Karta: klucz edycji wyjściowej + data edycji z wynikami
    (ekran wybiera ten rok), ma_wyniki = true, przeszla = true, url_wyniki tylko przez strażnika. Brak wyników w serii albo błąd maszyny → null. */
export async function kartaOstatniejZWynikami(fetchFn, token, d) {
  if (!d || typeof d.klucz !== "string" || !d.klucz) return null;
  let w;
  try { w = await f6(fetchFn, token, "event_info", { p_klucz: d.klucz }); } catch { return null; }
  const zW = (Array.isArray(w) ? w : []).filter((r) => r && r.event_id && /^\d{4}-\d{2}-\d{2}$/.test(String(r.data || "")));
  if (!zW.length) return null;
  const data = zW.map((r) => String(r.data)).sort().pop();
  const teDni = zW.filter((r) => String(r.data) === data).sort((a, b) => (Number(b.ukonczonych) || 0) - (Number(a.ukonczonych) || 0));
  const g = teDni[0];
  return { typ: "impreza", dane: { klucz: d.klucz, nazwa: String(g.nazwa || d.nazwa || "").split(" – ")[0].slice(0, 120), data, dokladnosc_daty: "dzien",
    miejscowosc: g.miejscowosc ? String(g.miejscowosc).slice(0, 60) : null, dystanse: [...new Set(teDni.map((r) => Number(r.dystans_km)).filter((x) => x > 0))].slice(0, 6),
    zrodlo_domena: null, url: null, status: null, przeszla: true, ma_wyniki: true,
    url_wyniki: teDni.map((r) => linkWynikow(r.url_wyniki)).find(Boolean) || null, ostatnia_z_wynikami: true } };
}

/** deps: {sb, fetchFn, token, q, jawne, dzis, sieciDozwolona: async () => bool, siec: async (tekst) => {zdania, zrodla, tok, zapytania},
    zPamieci: async () => {zdania, zrodla} | null, doPamieci: async (zdania, zrodla) => void, znaleziska: async (wpisy) => void}
    → null (nie impreza: bez słowa z listy i bez trafień) | {zdania, karty, zrodla, tok, zapytania_sieci, f6, z_pamieci, powod} */
export async function odpowiedzImpreza(deps) {
  const { sb, fetchFn, token, q, jawne, dzis } = deps;
  const [rK, rS] = await Promise.allSettled([
    szukajImprez(fetchFn, token, { q }),   // bez zakresu: events_search zwraca też przeszłe edycje („ostatnia 9.10.2026")
    naszeStarty(sb, q, dzis),
  ]);
  const kalendarz = rK.status === "fulfilled" ? rK.value : [];
  const f6Stan = rK.status === "fulfilled" ? "ok" : (rK.reason instanceof BladF6 ? rK.reason.kod : "blad");
  const nasze = rS.status === "fulfilled" ? rS.value : [];
  if (!jawne && !kalendarz.length && !nasze.length) return null;   // „ultrakotlina" bez trafień → nie impreza, dalej
  // dedup: nasz start, który jest w kalendarzu (data ±1, ta sama nazwa bez numeru edycji) — zostaje NASZ (ma race_id)
  const kal = kalendarz.filter((k) => !nasze.some((n) => n.data && k.data && dniMiedzy(n.data, k.data) <= 1 && bezZnakow(n.nazwa) === bezZnakow(k.nazwa)));
  // sieć: dozwolona dla imprezy; NIE gdy pytanie wygląda na imię i nazwisko i kalendarz go nie zna
  let zdania = [], zrodla = [], tok = { we: 0, wy: 0 }, zapytania = 0, zPam = false;
  /* PRZED 8.11 (3/4): bez trafienia w kalendarzu ani u nas — do sieci nie idzie pytanie, które wygląda na osobę: para (wygladaNaOsobe),
     nazwisko w kontekście (wygladaNaNazwisko) ani „Nazwisko + słowo biegowe” (po odjęciu słów biegowych zostaje jedno słowo z dużej litery). */
  const slowaQ = String(q).split(/\s+/).filter(Boolean), bezBiegowych = slowaQ.filter((w) => !SLOWA_IMPREZY.test(normalizuj(w)));
  const samoNazwisko = bezBiegowych.length === 1 && bezBiegowych.length < slowaQ.length && /^[\p{Lu}][\p{Ll}'-]{2,}$/u.test(bezBiegowych[0]);
  const naOsobe = wygladaNaOsobe(q) || wygladaNaNazwisko(q + " wyniki") || samoNazwisko;
  const wolnoSiec = !(naOsobe && !kalendarz.length && !nasze.length) && !(deps.cena && (kal.length || nasze.length));   // cena: sieć tylko bez karty
  if (wolnoSiec) {
    const pam = await deps.zPamieci();
    if (pam && pam.zrodla && pam.zrodla.length) { zdania = pam.zdania; zrodla = pam.zrodla; zPam = true; }
    else if (await deps.sieciDozwolona()) {
      const nazwa = (nasze[0] && nasze[0].nazwa) || (kalendarz[0] && kalendarz[0].nazwa) || q;
      try {
        const s = await deps.siec(`${nazwa} bieg — termin, dystanse, miejsce`);
        tok = s.tok || tok; zapytania = s.zapytania || 0;
        if (s.zrodla && s.zrodla.length) {
          zdania = s.zdania; zrodla = s.zrodla;
          await deps.doPamieci(zdania, zrodla);
          const rok = (kalendarz[0] && kalendarz[0].data && Number(kalendarz[0].data.slice(0, 4))) || null;   // najbliższa albo ostatnia edycja
          await deps.znaleziska(zrodla.map((z) => ({ url: z.url, domena: String(z.tytul || "").toLowerCase().slice(0, 200),
            nazwa_biegu: nazwa.slice(0, 200), rok, pytanie: [nazwa, rok].filter(Boolean).join(" ").slice(0, 200), status: "kalendarz" })));
        }
      } catch { /* sieć padła — karty zostają */ }
    }
  }
  // 23.11 (krok 3 a): przyszła edycja bez wyników i żadnej karty z wynikami → dołóż kartę ostatniej edycji z wynikami tej samej imprezy (event_info)
  // liczy się to, co WIDAĆ (pierwsze MAX_KART): edycja z wynikami dalej na liście nie może wyłączyć karty (live 23.11: „poznan polmaraton”, wynik na 11. miejscu),
  // a nie bierzemy jej zamiast event_info, bo pasuje do rdzeni zapytania, niekoniecznie do tej samej imprezy (serię rozstrzyga maszyna)
  const widoczne = kal.slice(0, MAX_KART);
  const przyszla = deps.cena ? null : widoczne.find((k) => k && k.klucz && !k.przeszla);
  const ostatnia = przyszla && !widoczne.some((k) => k.ma_wyniki === true) ? await kartaOstatniejZWynikami(fetchFn, token, przyszla) : null;
  const karty = [...kal.slice(0, ostatnia ? MAX_KART - 1 : MAX_KART).map((d) => ({ typ: "impreza", dane: d })), ...(ostatnia ? [ostatnia] : []),
    ...nasze.slice(0, MAX_KART).map((d) => ({ typ: "start_nasz", dane: d }))];
  if (deps.cena && karty.length) zdania = [kal.some((k) => k.url) ? ODP_CENA_LINK : ODP_CENA_BEZ_LINKU];
  if (f6Stan === "limit") zdania = [...zdania, ODP_F6_ZAJETA];
  if (!karty.length && !zdania.length) zdania = [ODP_IMPREZA_PUSTO];
  return { zdania, karty, zrodla, tok, zapytania_sieci: zapytania, f6: f6Stan, z_pamieci: zPam,
    powod: [f6Stan !== "ok" ? "f6: " + f6Stan : null, rS.status === "rejected" ? "races" : null].filter(Boolean).join(" | ") || null };
}
