// share-card — generator kart do udostępniania (1080×1350, 4:5)
// Satori (HTML→SVG) + resvg-wasm (SVG→PNG). verify_jwt=false, autoryzacja w ciele.
// Karta dla danego training_log.id jest NIEZMIENNA: gdy plik już jest, zwracamy URL bez renderu.
import { createClient } from "jsr:@supabase/supabase-js@2";
import satori from "https://esm.sh/satori@0.10.13";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const ASSETS = `${SB_URL}/storage/v1/object/public/share-assets`;
const CARDS_BUCKET = "share-cards";

const COLS = {
  akcent: "#e8561e",
  tekst: "#ffffff",
  wtorny: "#a8a5a0",
  wygaszony: "#8a8781",
  linia: "rgba(255,255,255,0.16)",
  stopka: "rgba(232,86,30,0.12)",
  avatarTlo: "#1a1a1f",
};

// Siatka kolumn — równy podział 936 px między marginesami 72 a 1008.
const SIATKA: Record<number, { x: number[]; dividery: number[] }> = {
  4: { x: [72, 306, 540, 774], dividery: [288, 522, 756] },
  3: { x: [72, 384, 696], dividery: [366, 678] },
  2: { x: [72, 540], dividery: [522] },
  1: { x: [72], dividery: [] },
};

// ── TREŚĆ KART ────────────────────────────────────────────────────
// Jedno miejsce na wszystko, co da się rozjechać między formatami: nazwy, progi,
// formatowanie liczb. Karta Story (canvas w js/silnik-anim.js) układa te same
// wartości inaczej — wspólny jest sens, nie układ. Gdy `tydzien` dojdzie jako drugi
// dubel, tu zapada decyzja o wyniesieniu tego bloku do wspólnego pliku.
const PB_NAZWY: Record<string, string> = {
  "5k": "5 KILOMETRÓW", "10k": "10 KILOMETRÓW", half: "PÓŁMARATON", marathon: "MARATON",
};
// Dystanse KANONICZNE — wyłącznie do tempa na karcie `pb`: podpis mówi „PÓŁMARATON",
// więc tempo ma opisywać półmaraton, a nie faktyczne 20,8 km. PB klasyfikuje z tolerancją.
// Bohater karty „pierwszy raz" bierze dystans RZECZYWISTY z evidence — to jego liczba.
const PB_KM: Record<string, number> = { "5k": 5, "10k": 10, half: 21.0975, marathon: 42.195 };

// Nazwy progów. Zmierzone w Bebasie 44 px z letterSpacing 4 przy polu 934 px:
// najdłuższa („DWIEŚCIE PIĘĆDZIESIĄT GODZIN") ma 520 px, czyli 414 px zapasu.
// Skracanie „na wszelki wypadek" byłoby zgadywaniem — nazwy zostają pełne.
const KAMIEN_NAZWY: Record<string, Record<string, string>> = {
  km:       { "500": "PIERWSZE PIĘĆSET", "1000": "PIERWSZY TYSIĄC", "2000": "DWA TYSIĄCE", "5000": "PIĘĆ TYSIĘCY" },
  godziny:  { "100": "STO GODZIN", "250": "DWIEŚCIE PIĘĆDZIESIĄT GODZIN", "500": "PIĘĆSET GODZIN", "1000": "TYSIĄC GODZIN" },
  pierwszy: { half: "PIERWSZY PÓŁMARATON", marathon: "PIERWSZY MARATON" },
};

// Biblioteka teł. Stałe tablice, NIE listing Storage: listing przy każdym cold starcie
// to zbędny koszt i dodatkowy punkt awarii na ścieżce generowania.
// m = biegacz solo, k = biegaczka solo, n = para mieszana (płeć nieczytelna).
const TLA: Record<string, string[]> = {
  m: [
    "bg-deszcz-gory-4x5.jpg", "bg-deszcz-las-4x5.jpg", "bg-las-4x5.jpg", "bg-noc-miasto-4x5.jpg",
    "bg-zachod-jezioro-4x5.jpg", "bg-zachod-pola-4x5.jpg", "bg-zima-4x5.jpg", "bg-zima-swit-4x5.jpg",
  ],
  // bg-stadion wypadło: reflektory stadionowe stoją dokładnie na wysokości imienia,
  // więc nawet po wstędze pas tekstu miał 44,1/255 przy 31,6 u następnego w kolejce.
  // Odstępstwo o 40% od reszty biblioteki = wyjątek, nie powód do mocniejszej warstwy.
  k: [
    "bg-deszcz-gory-4x5.jpg", "bg-gory-dolina-4x5.jpg", "bg-gory-grzbiet-4x5.jpg", "bg-mgla-swit-4x5.jpg",
    "bg-plaza-4x5.jpg", "bg-zachod-pola-4x5.jpg", "bg-zima-las-4x5.jpg",
  ],
  // bg-para-gory i bg-para-swit-pola wypadły: kadry poziome ze słońcem po lewej,
  // przyciemnienie dobierane automatycznie wyszło za słabe (strefa logo 64/255 przy
  // medianie biblioteki 14,5). Wyjątek, nie reguła — stąd wymiana pliku, nie kolejna wstęga.
  n: [
    "bg-para-deszcz-4x5.jpg", "bg-para-las-4x5.jpg", "bg-para-noc-bulwar-4x5.jpg",
    "bg-para-noc-most-4x5.jpg", "bg-para-promenada-4x5.jpg",
    "bg-para-zachod-4x5.jpg", "bg-para-zima-4x5.jpg",
  ],
};

// Własne tło zawodnika. Whitelist hosta jak przy avatarUri — obcy host to nie
// błąd, tylko powrót do biblioteki: karta ma powstać zawsze.
// Ścieżkę też zawężamy, żeby URL nie mógł wskazać czegoś innego w naszym Storage.
function dozwoloneTlo(url: string | null): string | null {
  if (!url || !url.trim()) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    if (u.host !== new URL(SB_URL).host) return null;
    if (!u.pathname.startsWith("/storage/v1/object/public/card-bg/")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

// hash8 wchodzi do klucza karty. URL niesie ?t=timestamp, więc podmiana zdjęcia
// daje nowy hash → nową kartę, a stare linki nadal żyją (zasada o nieusuwaniu
// kart, do których ktoś ma świeży link).
async function hash8(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 8);
}

async function pobierzUrl(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`tło → HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

// Sezonowość. Klasyfikacja z OBEJRZENIA kadrów, nie z nazw plików: „zimowe" to
// śnieg plus czapka i rękawice, „letnie" to krótki rękaw i spodenki. Reszta
// biblioteki (kurtki, długi rękaw) jest całoroczna i nigdy nie wypada.
// Klucz zawiera zestaw, bo nazwy powtarzają się między m/ i k/ (inne zdjęcia).
const ZIMOWE = new Set(["m/bg-zima-4x5.jpg", "m/bg-zima-swit-4x5.jpg", "k/bg-zima-las-4x5.jpg", "n/bg-para-zima-4x5.jpg"]);
const LETNIE = new Set(["m/bg-las-4x5.jpg", "m/bg-zachod-pola-4x5.jpg", "k/bg-zachod-pola-4x5.jpg", "n/bg-para-las-4x5.jpg"]);

// Miesiąc liczony w Europe/Warsaw. DATA jest wiarygodna — w odróżnieniu od
// godziny, która przy wpisach ręcznych i OCR jest sztuczna (12:00 / 10:00).
function miesiac(iso: string): number {
  return parseInt(
    new Intl.DateTimeFormat("pl-PL", { month: "numeric", timeZone: "Europe/Warsaw" }).format(new Date(iso)),
    10,
  );
}

// Wybór tła: zestaw z płci, sezonowy filtr, potem konkretny plik DETERMINISTYCZNIE
// z log_id. Nie Math.random() — ten sam trening ma dawać to samo tło także po
// przegenerowaniu karty.
// Filtr działa PRZED wyliczeniem indeksu: liczenie modulo z pełnej listy, a potem
// odrzucanie wyniku, rozjechałoby determinizm i dawałoby nierówny rozkład.
// ziarno — dowolny stabilny łańcuch identyfikujący kartę (log_id dla treningu, nazwa
// pliku dla kart momentowych). Ta sama karta ma dostać to samo tło także po skasowaniu
// i przegenerowaniu, stąd hash zamiast Math.random().
function wybierzTlo(gender: string | null, ziarno: string, loggedAt: string | null): string {
  const zestaw = gender === "M" ? "m" : gender === "K" ? "k" : "n";
  let lista = TLA[zestaw];
  if (loggedAt) {
    const m = miesiac(loggedAt);
    if (m >= 5 && m <= 9) lista = lista.filter((f) => !ZIMOWE.has(`${zestaw}/${f}`));
    else if (m === 12 || m <= 2) lista = lista.filter((f) => !LETNIE.has(`${zestaw}/${f}`));
  }
  // Gdyby filtr kiedyś wyciął wszystko (mała biblioteka) — wracamy do pełnej listy.
  if (!lista.length) lista = TLA[zestaw];
  const suma = [...ziarno].reduce((a, c) => a + c.charCodeAt(0), 0);
  return `bg/${zestaw}/${lista[suma % lista.length]}`;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── COLD START: fonty, tło, logo i wasm pobierane RAZ ─────────────
let bootPromise: Promise<Boot> | null = null;
// Tła NIE ma w module scope: biblioteka rośnie, a cold start ładowałby ją całą.
// Pobierane per request, tylko wybrany plik.
type Boot = {
  fonts: { name: string; data: ArrayBuffer; weight: 400 | 500; style: "normal" }[];
  logoUri: string;
};

function b64(bytes: Uint8Array): string {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode(...bytes.subarray(i, i + CH));
  }
  return btoa(s);
}

async function pobierz(sciezka: string): Promise<Uint8Array> {
  const r = await fetch(`${ASSETS}/${sciezka}`);
  if (!r.ok) throw new Error(`asset ${sciezka} → HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function boot(): Promise<Boot> {
  const [bebas, dm400, dm500, logo, wasm] = await Promise.all([
    pobierz("fonts/BebasNeue-Regular.ttf"),
    pobierz("fonts/DMSans-Regular.ttf"),
    pobierz("fonts/DMSans-Medium.ttf"),
    // Wariant z białymi literami: w oryginale „Biega" i „.run" są niemal czarne
    // i giną na ciemnym tle karty. „My." i podkreślenie zostają pomarańczowe.
    pobierz("logo/logo-lockup-white.png"),
    pobierz("wasm/resvg_index_bg.wasm"),
  ]);
  // initWasm tylko raz na izolat — powtórne wywołanie rzuca.
  await initWasm(wasm.buffer as ArrayBuffer);
  return {
    fonts: [
      { name: "Bebas", data: bebas.buffer as ArrayBuffer, weight: 400, style: "normal" },
      { name: "DMSans", data: dm400.buffer as ArrayBuffer, weight: 400, style: "normal" },
      { name: "DMSans", data: dm500.buffer as ArrayBuffer, weight: 500, style: "normal" },
    ],
    logoUri: `data:image/png;base64,${b64(logo)}`,
  };
}
function ensureBoot(): Promise<Boot> {
  if (!bootPromise) bootPromise = boot();
  return bootPromise;
}

// ── Ikony (inline SVG, barwa akcentu) ─────────────────────────────
function ikona(d: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${COLS.akcent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}
const IKONY = {
  czas: ikona('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>'),
  tetno: ikona('<path d="M20.4 5.6a5 5 0 0 0-7.1 0L12 6.9l-1.3-1.3a5 5 0 1 0-7.1 7.1L12 21l8.4-8.3a5 5 0 0 0 0-7.1z"/>'),
  przewyzszenie: ikona('<polyline points="2 20 9 8 13 14 16 10 22 20"/>'),
  kalorie: ikona('<path d="M12 22c4 0 7-2.7 7-6.5 0-4.5-4.5-6-4.5-9.5 0 0-2.5 1.5-2.5 4.5C10 8 9 6 9 6c-1.3 1.7-4 3.6-4 9.5C5 19.3 8 22 12 22z"/>'),
  kalendarz: ikona('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  aktywnosci: ikona('<path d="M4 12h3l2-5 3 10 2.5-7 1.5 2h4"/>'),
};

// ── Pomocnik elementów (bez JSX) ──────────────────────────────────
type El = { type: string; props: Record<string, unknown> };
function h(type: string, style: Record<string, unknown>, children?: unknown): El {
  return { type, props: { style, ...(children !== undefined ? { children } : {}) } };
}
function txt(style: Record<string, unknown>, tekst: string): El {
  return h("div", style, tekst);
}

// ── Formatowanie ──────────────────────────────────────────────────
function fmtDystans(km: number): string {
  const s = km >= 100 ? km.toFixed(1) : km.toFixed(2);
  return s.replace(".", ",");
}
// Kamień milowy dostaje JEDNO miejsce po przecinku. Dwa mają sens przy karcie treningu
// („10,02" to realna precyzja pomiaru), ale „21,40" na karcie o pierwszym półmaratonie
// czyta się jak odczyt z przyrządu, a nie jak osiągnięcie.
function fmtDystans1(km: number): string {
  return km.toFixed(1).replace(".", ",");
}
function fmtData(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw",
  }).format(new Date(iso));
}
// Krótka data do kolumny „OD" — w 66 px Bebasa pełna nazwa miesiąca nie zmieściłaby się
// w skoku kolumny przy trzech kolumnach (312 px).
function fmtDataKrotka(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Warsaw",
  }).format(new Date(iso)).replace(/\s?r\.?$/, "");
}
function fmtCzas(sek: number): string {
  const s = Math.round(sek), g = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const dw = (n: number) => String(n).padStart(2, "0");
  return g > 0 ? `${g}:${dw(m)}:${dw(r)}` : `${m}:${dw(r)}`;
}
function fmtTempo(sekNaKm: number): string {
  const s = Math.round(sekNaKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
// Sekundy z kolumny duration (TEXT „1:49:40" albo „49:40"). Zły format → 0, nie wyjątek:
// karta ma powstać nawet gdy część logów ma śmieci w czasie trwania.
function duracjaNaSek(d: string | null): number {
  const p = String(d || "").split(":").map(Number);
  if (!p.length || p.some(isNaN)) return 0;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return p[0] * 60;
}
function fmtGodzina(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw",
  }).format(new Date(iso));
}
// Ten sam filtr co w public-view (profil.html): widok nie sanityzuje full_name.
function fmtImie(n: string | null): string {
  return n && !n.includes("@") && n.trim().length >= 3 ? n.trim() : "Zawodnik BiegaMy";
}
function inicjaly(n: string): string {
  return n.split(" ").map((x) => x && x[0]).filter(Boolean).join("").toUpperCase().slice(0, 2);
}

// Awatar wciągamy sami i osadzamy jako data-URI — satori nie pobiera zdalnych zasobów,
// a przy okazji zamykamy SSRF: dopuszczamy wyłącznie własny Storage.
async function avatarUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const u = new URL(url);
    const wlasny = new URL(SB_URL).host;
    if (u.protocol !== "https:" || (u.host !== wlasny && u.host !== "biegamy.run")) return null;
    const r = await fetch(u.toString());
    if (!r.ok) return null;
    const mime = r.headers.get("content-type") || "image/jpeg";
    if (!mime.startsWith("image/")) return null;
    return `data:${mime};base64,${b64(new Uint8Array(await r.arrayBuffer()))}`;
  } catch {
    return null;
  }
}

// ── Układ karty ───────────────────────────────────────────────────
type Stat = { ikona: string; etykieta: string; wartosc: string; jednostka: string };

function zbudujKarte(o: {
  boot: Boot; bgUri: string; imie: string; av: string | null; meta: string; miasto: string | null;
  bohater: string; jednostka: string | null; podpis: string; staty: Stat[];
}): El {
  const g = SIATKA[Math.max(1, Math.min(4, o.staty.length))];
  // Przy 4 kolumnach na etykietę zostaje 190 px (skok 234 − ikona 34 − odstęp 10),
  // a „PRZEWYŻSZENIE" ma w 22 px aż 191,5 px i wchodzi na ikonę sąsiada.
  // 18 px daje 155,5 px, czyli ~34 px oddechu. Przy ≤3 kolumnach skok to 312 px — 22 px mieści się.
  const etykietaPx = g.x.length >= 4 ? 18 : 22;
  const dzieci: El[] = [];

  // Tło
  dzieci.push(h("img", { position: "absolute", left: 0, top: 0, width: 1080, height: 1350 }) as El);
  (dzieci[0].props as Record<string, unknown>).src = o.bgUri;

  // Jeden CIĄGŁY scrim na całej wysokości, bez powrotów do zera. Poprzednio były dwie
  // wstęgi (290–500 i 850–1130) — na fotografii z fakturą wtapiały się, ale na gładkim
  // tle ich krawędzie czytały się jako doklejone prostokąty. Gradient bez krawędzi czyta
  // się jak winietowanie fotograficzne.
  // Stopy dobrane pod strefy tekstu: mocno u góry (logo, tożsamość), najsłabiej w okolicy
  // dystansu, który jest białym Bebasem 210 px i zniesie najwięcej, potem znów mocniej
  // ku dołowi (statystyki i stopka).
  //   y=0 → 0.76 | y=700 → 0.40 | y=900 → 0.48 | y=1350 → 0.72
  // Wartości z SWEEPU na 22 tłach, nie z oka: przy 0.34/0.44 trzy strefy przekraczały
  // próg 38 (k/gory-dolina tożsamość i dystans, n/promenada tożsamość).
  dzieci.push(h("div", {
    position: "absolute", left: 0, top: 0, width: 1080, height: 1350,
    backgroundImage:
      "linear-gradient(to bottom, rgba(7,7,10,0.76) 0%, rgba(7,7,10,0.40) 51.85%, " +
      "rgba(7,7,10,0.48) 66.67%, rgba(7,7,10,0.72) 100%)",
  }));

  // Nagłówek: logotyp (zawiera już słowo BIEGAMY) + tagline
  const logo = h("img", { position: "absolute", left: 72, top: 105, width: 320, height: 76 });
  (logo.props as Record<string, unknown>).src = o.boot.logoUri;
  dzieci.push(logo);
  dzieci.push(txt({
    position: "absolute", left: 74, top: 194, fontFamily: "DMSans", fontWeight: 500,
    fontSize: 24, color: COLS.akcent, letterSpacing: 3,
  }, "JESTEŚMY OBOK."));

  // Awatar
  const kolo: Record<string, unknown> = {
    position: "absolute", left: 72, top: 322, width: 120, height: 120,
    borderRadius: 60, border: `3px solid ${COLS.akcent}`, display: "flex",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
    backgroundColor: COLS.avatarTlo,
  };
  if (o.av) {
    const im = h("img", { width: 120, height: 120, borderRadius: 60 });
    (im.props as Record<string, unknown>).src = o.av;
    dzieci.push(h("div", kolo, [im]));
  } else {
    dzieci.push(h("div", kolo, [
      txt({ fontFamily: "DMSans", fontWeight: 500, fontSize: 44, color: COLS.akcent }, inicjaly(o.imie)),
    ]));
  }

  // Tożsamość
  dzieci.push(txt({
    position: "absolute", left: 214, top: 348, fontFamily: "DMSans", fontWeight: 500,
    fontSize: 38, color: COLS.tekst,
  }, o.imie));
  // Meta w DWÓCH liniach: miasto osobno, żeby cały tekst mieścił się w lewej strefie
  // przyciemnienia. Jedna długa linia wychodziła na jasne niebo i traciła kontrast —
  // a przy bibliotece teł każde zdjęcie ma jasne miejsce gdzie indziej.
  dzieci.push(txt({
    position: "absolute", left: 214, top: 402, fontFamily: "DMSans", fontWeight: 400,
    fontSize: 24, color: COLS.wtorny,
  }, o.meta));
  if (o.miasto) {
    dzieci.push(txt({
      position: "absolute", left: 214, top: 440, fontFamily: "DMSans", fontWeight: 400,
      fontSize: 22, color: COLS.wygaszony,
    }, o.miasto));
  }

  // Bohater: liczba albo czas, z opcjonalną jednostką (wyrównane dołem).
  // Zejście do 168 px przy 7+ znakach: czas „1:29:44" w 210 px ma ~640 px i przy dłuższym
  // wyniku wychodziłby poza lewą strefę przyciemnienia. Dystanse mają max 5 znaków („10,02"),
  // więc dla kart treningu i kamienia nic się nie zmienia.
  const heroPx = o.bohater.length >= 7 ? 168 : 210;
  dzieci.push(h("div", {
    position: "absolute", left: 70, top: 500, display: "flex", alignItems: "flex-end",
  }, [
    txt({ fontFamily: "Bebas", fontSize: heroPx, color: COLS.tekst, letterSpacing: -4, lineHeight: 1 }, o.bohater),
    ...(o.jednostka
      ? [txt({ fontFamily: "Bebas", fontSize: 78, color: COLS.akcent, marginLeft: 24, lineHeight: 1.25 }, o.jednostka)]
      : []),
  ]));
  dzieci.push(txt({
    position: "absolute", left: 74, top: 770, fontFamily: "Bebas", fontSize: 44,
    color: COLS.wygaszony, letterSpacing: 4,
  }, o.podpis.toUpperCase()));

  // Dividery paska statystyk
  for (const x of g.dividery) {
    dzieci.push(h("div", {
      position: "absolute", left: x, top: 900, width: 1, height: 190, backgroundColor: COLS.linia,
    }));
  }

  // Kolumny statystyk
  o.staty.forEach((s, i) => {
    const x = g.x[i];
    const ik = h("img", { width: 34, height: 34 });
    (ik.props as Record<string, unknown>).src = s.ikona;
    dzieci.push(h("div", {
      position: "absolute", left: x, top: 898, display: "flex", alignItems: "center",
    }, [
      ik,
      txt({
        fontFamily: "DMSans", fontWeight: 500, fontSize: etykietaPx, color: COLS.wtorny,
        letterSpacing: 1.5, marginLeft: 10, whiteSpace: "nowrap",
      }, s.etykieta),
    ]));
    dzieci.push(txt({
      position: "absolute", left: x, top: 962, fontFamily: "Bebas", fontSize: 66, color: COLS.tekst,
    }, s.wartosc));
    dzieci.push(txt({
      position: "absolute", left: x, top: 1030, fontFamily: "DMSans", fontWeight: 400,
      fontSize: 24, color: COLS.wygaszony,
    }, s.jednostka));
  });

  // Stopka
  dzieci.push(h("div", {
    position: "absolute", left: 0, top: 1145, width: 1080, height: 205, backgroundColor: COLS.stopka,
  }));
  const logoStopka = h("img", { position: "absolute", left: 72, top: 1188, width: 200, height: 47 });
  (logoStopka.props as Record<string, unknown>).src = o.boot.logoUri;
  dzieci.push(logoStopka);
  dzieci.push(txt({
    position: "absolute", left: 74, top: 1248, fontFamily: "DMSans", fontWeight: 400,
    fontSize: 24, color: COLS.wtorny,
  }, "Trenuj. Rywalizuj. Bądź lepszy."));
  dzieci.push(txt({
    position: "absolute", right: 72, top: 1195, fontFamily: "DMSans", fontWeight: 500,
    fontSize: 32, color: COLS.akcent, textAlign: "right",
  }, "#biegamyrazem"));
  dzieci.push(txt({
    position: "absolute", right: 72, top: 1248, fontFamily: "DMSans", fontWeight: 400,
    fontSize: 26, color: COLS.wtorny, textAlign: "right",
  }, "biegamy.run"));

  return h("div", {
    position: "relative", display: "flex", width: 1080, height: 1350, backgroundColor: "#0b0b0d",
  }, dzieci);
}

// ── Handler ───────────────────────────────────────────────────────
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type Zawodnik = { full_name: string | null; avatar_url: string | null; city: string | null; gender: string | null };

// Klient service_role przez fabrykę, nie przez `ReturnType<typeof createClient>`:
// gołe createClient w pozycji typu gubi parametry schematu i każdy odczytany wiersz
// wychodzi jako `never`, przez co `mom.created_at` nie kompiluje się.
function adminClient() {
  return createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
type Admin = ReturnType<typeof adminClient>;

// Wspólny ogon wszystkich rodzajów kart: tło → satori → PNG → Storage. Różnica między
// rodzajami kończy się na trójce bohater/podpis/statystyki — jeśli kiedyś trzeba będzie
// tknąć coś poniżej, to znak, że projekt jest zły, a nie że potrzebny jest wyjątek.
async function wyrenderuj(admin: Admin, o: {
  plik: string; publicUrl: string; ziarno: string; dataDoSezonu: string | null; ath: Zawodnik;
  meta: string; bohater: string; jednostka: string | null; podpis: string; staty: Stat[];
  wlasneTlo?: string | null;
}): Promise<Response> {
  const boot = await ensureBoot();

  // Własne tło ma pierwszeństwo. Jest już przyciemnione po stronie klienta tym samym
  // algorytmem, więc EF nie dokłada gradientu bazowego. Gdy pobranie padnie, wracamy do
  // biblioteki: brak karty byłby gorszy niż karta z innym tłem.
  let bgBajty: Uint8Array | null = null;
  if (o.wlasneTlo) {
    try {
      bgBajty = await pobierzUrl(o.wlasneTlo);
    } catch (e) {
      console.error("share-card: własne tło nieosiągalne, biblioteka:", o.plik, e);
    }
  }
  if (!bgBajty) bgBajty = await pobierz(wybierzTlo(o.ath.gender, o.ziarno, o.dataDoSezonu));

  const el = zbudujKarte({
    boot, bgUri: `data:image/jpeg;base64,${b64(bgBajty)}`,
    imie: fmtImie(o.ath.full_name), av: await avatarUri(o.ath.avatar_url),
    meta: o.meta, miasto: (o.ath.city || "").trim() || null,
    bohater: o.bohater, jednostka: o.jednostka, podpis: o.podpis, staty: o.staty.slice(0, 4),
  });

  const svg = await satori(el as unknown as Parameters<typeof satori>[0], {
    width: 1080, height: 1350, fonts: boot.fonts,
  });
  const png = new Resvg(svg).render().asPng();

  const { error: upErr } = await admin.storage.from(CARDS_BUCKET)
    .upload(o.plik, png, { contentType: "image/png", cacheControl: "31536000", upsert: false });
  // Wyścig dwóch równoległych żądań: drugie dostaje Duplicate i po prostu oddaje URL.
  if (upErr && !String(upErr.message || "").toLowerCase().includes("exists")) {
    console.error("share-card upload:", o.plik, upErr);
    return json({ error: "zapis karty padł" }, 500);
  }
  return json({ url: o.publicUrl, cached: false });
}

// Karta momentu: kamien | pb (tydzien i miesiac dochodzą w K4).
// Wszystkie liczby pochodzą z wiersza zapisanego przez silnik z service_role — klient
// podaje wyłącznie identyfikator, więc nie ma czego zmyślić. Przy kształcie
// {typ, próg} dowolny zawodnik wyprodukowałby sobie kartę „5000 KM" z naszym logo.
async function kartaMomentu(
  admin: Admin, userId: string, momentId: string,
): Promise<Response> {
  const { data: mom } = await admin.from("delivered_moments")
    .select("id,athlete_id,type,evidence,status,created_at").eq("id", momentId).maybeSingle();
  if (!mom) return json({ error: "nie ma takiego momentu" }, 404);

  const { data: ath } = await admin.from("athletes")
    .select("id,full_name,avatar_url,city,user_id,coach_id,gender").eq("id", mom.athlete_id).maybeSingle();
  if (!ath) return json({ error: "nie ma zawodnika" }, 404);

  const wlasciciel = ath.user_id === userId;
  const trener = ath.coach_id === userId;
  if (!wlasciciel && !trener) return json({ error: "nie twój moment" }, 403);
  // ŻELAZNA ZASADA: EF chodzi po service_role, czyli OMIJA RLS. Bez tego warunku zawodnik
  // wyrenderowałby kartę z momentu, którego trener jeszcze nie zatwierdził — czyli obszedłby
  // bramkę. Trener widzi każdy status, bo to jego podgląd przed zatwierdzeniem.
  if (!trener && mom.status !== "approved") return json({ error: "moment niezatwierdzony" }, 403);

  const ev = (mom.evidence || {}) as Record<string, unknown>;
  let plik = "", bohater = "", podpis = "";
  let jednostka: string | null = null;
  const staty: Stat[] = [];

  if (mom.type === "pb") {
    const dystans = String(ev.dystans || "");
    const nowy = Number(ev.nowy_czas), stary = Number(ev.stary_czas), delta = Number(ev.delta);
    if (!PB_KM[dystans] || !(nowy > 0) || !(stary > 0)) return json({ error: "moment bez danych" }, 422);
    plik = `pb-${ath.id}-${dystans}-${Math.round(nowy)}.png`;
    bohater = fmtCzas(nowy);
    podpis = PB_NAZWY[dystans] || dystans;
    staty.push({ ikona: IKONY.czas, etykieta: "POPRZEDNI", wartosc: fmtCzas(stary), jednostka: "" });
    // ZYSK, nie „POPRAWA −0:42": karta jest o osiągnięciu, więc język ma mówić o zysku.
    // Minus przy życiówce czyta się jak strata. Słowo „szybciej" schodzi do wiersza jednostki
    // — ta sama struktura co „3:26" + „/km”, i JEDYNA, która się mieści: w kolumnie zostaje
    // 294 px (do dividera), a „12:07 SZYBCIEJ" w Bebasie 66 px ma 308 px i weszłoby na kreskę.
    //
    // Jednostka brzmi „szybciej" w OBU wariantach, a nie „sekund/minut szybciej", bo przy
    // wartości mm:ss słowo „minut" byłoby nieprawdą: 2:14 to dwie minuty i czternaście sekund.
    // Polszczyzna dopisałaby jeszcze odmianę przez liczebnik („2 minuty", ale „12 minut"),
    // której sformatowany czas nie niesie. Stąd jednostkę w sekundach niesie sama wartość
    // („42 SEK" — Bebas jest fontem wersalikowym), dokładnie jak „KM" przy bohaterze.
    const zysk = delta < 60 ? `${Math.round(delta)} sek` : fmtCzas(delta);
    staty.push({ ikona: IKONY.aktywnosci, etykieta: "ZYSK", wartosc: zysk, jednostka: "szybciej" });
    staty.push({ ikona: IKONY.przewyzszenie, etykieta: "TEMPO", wartosc: fmtTempo(nowy / PB_KM[dystans]), jednostka: "/km" });

  } else if (mom.type === "kamien") {
    const kat = String(ev.kategoria || ""), prog = String(ev.prog || "");
    const nazwa = KAMIEN_NAZWY[kat]?.[prog];
    if (!nazwa) return json({ error: "nieznany kamień" }, 422);
    podpis = nazwa;
    plik = `kamien-${ath.id}-${kat}-${prog}.png`;
    if (kat === "pierwszy") {
      // Dystans RZECZYWISTY tego biegu, nie kanoniczny: pierwszy półmaraton na 21,4 km
      // to jego liczba. Detektor (K2) MUSI wpisać `dystans_km` do evidence.
      const km = Number(ev.dystans_km);
      if (!(km > 0)) return json({ error: "moment bez dystansu" }, 422);
      bohater = fmtDystans1(km);
      jednostka = "KM";
    } else {
      bohater = prog;
      jednostka = kat === "godziny" ? "H" : "KM";
    }

    // Kontekst drogi zamiast metryk jednego biegu. Świadomie WSZYSTKIE aktywności —
    // stąd etykieta „AKTYWNOŚCI", nie „TRENINGÓW": przy progu liczonym z samych biegów
    // para „1000 KM / 87 TRENINGÓW" dawałaby 11,5 km na trening, czyli liczbę, która
    // się nie zgadza, gdy część aktywności to rower. Próg sprawdza silnik, nie ta funkcja.
    const { data: logi } = await admin.from("training_logs")
      .select("logged_at,duration,training_type").eq("athlete_id", ath.id)
      .order("logged_at", { ascending: true });
    const czyste = (logi || []).filter((l) => l.logged_at && !String(l.training_type || "").startsWith("__badge__"));
    const sekundy = czyste.reduce((s, l) => s + duracjaNaSek(l.duration), 0);
    if (czyste.length) {
      staty.push({ ikona: IKONY.kalendarz, etykieta: "OD", wartosc: fmtDataKrotka(czyste[0].logged_at), jednostka: "" });
      staty.push({ ikona: IKONY.aktywnosci, etykieta: "AKTYWNOŚCI", wartosc: String(czyste.length), jednostka: "" });
    }
    if (sekundy > 0) {
      staty.push({ ikona: IKONY.czas, etykieta: "W RUCHU", wartosc: String(Math.round(sekundy / 3600)), jednostka: "h" });
    }

  } else {
    return json({ error: "ten rodzaj karty jeszcze nie istnieje" }, 422);
  }

  const publicUrl = `${SB_URL}/storage/v1/object/public/${CARDS_BUCKET}/${plik}`;
  const { data: juz } = await admin.storage.from(CARDS_BUCKET).list("", { search: plik, limit: 1 });
  if (juz && juz.length) return json({ url: publicUrl, cached: true });

  // NIEZMIENNOŚĆ JEST DECYZJĄ, NIE PRZEOCZENIEM: tysiąc kilometrów osiąga się raz, sierpień
  // 2026 też. Log dodany wstecz nie przerysuje wydanej karty — karta to zdjęcie momentu,
  // a nie żywy raport. Gdyby kiedyś miało być inaczej, do klucza wchodzi hash treści.
  return await wyrenderuj(admin, {
    plik, publicUrl, ziarno: plik, dataDoSezonu: mom.created_at, ath: ath as Zawodnik,
    meta: fmtData(mom.created_at), bohater, jednostka, podpis, staty,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "brak autoryzacji" }, 401);

    const { log_id, moment_id } = await req.json().catch(() => ({}));
    if (!log_id && !moment_id) return json({ error: "brak log_id albo moment_id" }, 400);
    if (log_id && typeof log_id !== "string") return json({ error: "złe log_id" }, 400);
    if (moment_id && typeof moment_id !== "string") return json({ error: "złe moment_id" }, 400);

    const admin = adminClient();
    const { data: { user } } = await createClient(SB_URL, Deno.env.get("SUPABASE_ANON_KEY")!)
      .auth.getUser(jwt);
    if (!user) return json({ error: "zły token" }, 401);

    if (moment_id) return await kartaMomentu(admin, user.id, moment_id);

    const { data: log } = await admin.from("training_logs")
      .select("id,athlete_id,distance_km,duration,pace,heart_rate,elevation_gain,calories,training_type,logged_at,external_source,card_bg_url")
      .eq("id", log_id).maybeSingle();
    if (!log) return json({ error: "nie ma takiego treningu" }, 404);
    // Odznaki (training_type '__badge__%') to nie treningi. Filtr w kodzie, NIE w PostgREST:
    // .not(...,'like',...) odrzuciłoby też wiersze z training_type = NULL (NOT LIKE NULL → NULL).
    if ((log.training_type || "").startsWith("__badge__")) return json({ error: "to nie trening" }, 404);
    if (log.distance_km == null) return json({ error: "trening bez dystansu" }, 422);

    const { data: ath } = await admin.from("athletes")
      .select("id,full_name,avatar_url,hr_public,city,user_id,coach_id,gender")
      .eq("id", log.athlete_id).maybeSingle();
    if (!ath) return json({ error: "nie ma zawodnika" }, 404);
    // Wzorzec domowy: właściciel ALBO trener TEGO zawodnika. Cudzych nie generujemy.
    if (ath.user_id !== user.id && ath.coach_id !== user.id) return json({ error: "nie twój trening" }, 403);

    // Klucz karty zależy od tła, więc sprawdzenie cache musi być PO odczycie logu.
    // Efekt uboczny na plus: wcześniej cache sprawdzał się przed autoryzacją, czyli
    // dowolny zalogowany mógł sprawdzić, czy karta dla danego log_id istnieje.
    const wlasneTlo = dozwoloneTlo(log.card_bg_url);
    const plik = wlasneTlo ? `${log_id}-${await hash8(wlasneTlo)}.png` : `${log_id}.png`;
    const publicUrl = `${SB_URL}/storage/v1/object/public/${CARDS_BUCKET}/${plik}`;

    // Karta niezmienna — jeśli jest, oddajemy bez renderu.
    const { data: juz } = await admin.storage.from(CARDS_BUCKET)
      .list("", { search: plik, limit: 1 });
    if (juz && juz.length) return json({ url: publicUrl, cached: true });

    // Godzina TYLKO dla logów z zegarka: przy wpisach ręcznych/OCR logged_at to
    // sztuczna 12:00/10:00 (57% wpisów) — pokazywanie jej byłoby fałszywym sygnałem.
    const zZegarka = log.external_source === "intervals";
    const meta = [fmtData(log.logged_at), zZegarka ? fmtGodzina(log.logged_at) : null]
      .filter(Boolean).join(" · ");

    const staty: Stat[] = [];
    if (log.duration) {
      staty.push({ ikona: IKONY.czas, etykieta: "CZAS", wartosc: log.duration, jednostka: log.pace ? `${log.pace} /km` : "" });
    }
    if (ath.hr_public && log.heart_rate != null) {
      staty.push({ ikona: IKONY.tetno, etykieta: "ŚR. TĘTNO", wartosc: String(log.heart_rate), jednostka: "bpm" });
    }
    if (log.elevation_gain != null) {
      staty.push({ ikona: IKONY.przewyzszenie, etykieta: "PRZEWYŻSZENIE", wartosc: String(log.elevation_gain), jednostka: "m" });
    }
    if (log.calories != null) {
      staty.push({ ikona: IKONY.kalorie, etykieta: "KALORIE", wartosc: String(log.calories), jednostka: "kcal" });
    }

    // gender służy WYŁĄCZNIE do wyboru pliku z biblioteki: nie trafia do odpowiedzi,
    // nie pojawia się na karcie i nie idzie do żadnego logu.
    return await wyrenderuj(admin, {
      plik, publicUrl, ziarno: log_id, dataDoSezonu: log.logged_at, ath: ath as Zawodnik,
      meta, bohater: fmtDystans(Number(log.distance_km)), jednostka: "KM",
      podpis: log.training_type || "Bieg", staty, wlasneTlo,
    });
  } catch (e) {
    // Szczegóły TYLKO do logów EF — odpowiedź nie wystawia wnętrza na zewnątrz.
    console.error("share-card:", e);
    return json({ error: "błąd generowania" }, 500);
  }
});
