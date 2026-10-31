// Osie wariantów kadrów (31.10.2026, Grafiki v4 / G1) — JEDNO źródło dla generatora i testu blizna-57.
//
// Kadry v3 były dobre, ale do siebie podobne: jeden szkielet, jeden podmiot (biegacz od tyłu), jedna ogniskowa.
// Od v4 każdy numer n dostaje deterministycznie pięć osi (indeks z numeru, żeby ponowne wygenerowanie dawało ten
// sam opis, a numer pozostał jedynym kluczem):
//   kompozycja (n·7) % 4 · podmiot (n·3) % 5 · pora dnia (n·5) % 4 · pogoda (n·11) % 4 · ogniskowa (n·13) % 3
// Reguły nadrzędne: wyjątek sceny z podpisu wygrywa z osiami; noc WYŁĄCZNIE z n % 12 = 0; tag p: (pogoda kadru)
// wygrywa z osią pogody; zima + „po deszczu" = mokry śnieg / błoto pośniegowe; detal nigdy z twarzą ani dłońmi;
// „dwójka" = dwie osoby obok siebie od tyłu, nie grupa; pula „pejzaz" (21:9) nie ma biegacza z bliska (0/1 → 3/4);
// detal + 24 mm → 85 mm (zbliżenie nie znosi „szerokiego planu"); mgła tylko o świcie/rano — mgła (z osi albo
// tagu p:mgla) z porą „południe"/„zmierzch" → świt (decyzje Filipa 31.10). Wyjątek może podać własny indeks ogniskowej.
// Moduł jest czysty (bez plików i sieci) — sezon i tagi podaje wołający.

export const KOMPOZYCJE = [
  { nazwa: "w osi drogi", biegacz: "widziane od tyłu z dystansu, w osi drogi, droga zbiega się w głębi", kamera: "w osi drogi, droga zbiega się w głębi" },
  { nazwa: "z boku", biegacz: "widziane z boku, z dystansu, przy lewej albo prawej krawędzi kadru, przed nimi dużo pustej przestrzeni", kamera: "z boku trasy, linia drogi biegnie w poprzek kadru" },
  { nazwa: "z góry", biegacz: "widziane z góry (most, nasyp albo wzgórze), mała sylwetka na szerokim planie trasy", kamera: "z góry (most, nasyp albo wzgórze), szeroki plan trasy" },
  { nazwa: "nisko przy ziemi", biegacz: "widziane nisko przy ziemi, oddalające się w głąb kadru, pierwszy plan nawierzchni rozmyty i spokojny", kamera: "nisko przy ziemi, pierwszy plan nawierzchni rozmyty i spokojny" },
];
export const PODMIOTY = ["jeden biegacz od tyłu", "dwójka", "bez człowieka — detal", "bez człowieka — pejzaż", "biegacz mały w dużym pejzażu"];
export const DETALE = ["para butów do biegania", "zegarek sportowy", "bidon", "numer startowy z agrafkami", "rękawiczki biegowe"];
export const PORY_DNIA = ["świt", "rano", "południe", "zmierzch"];
export const POGODA = ["czyste niebo", "zachmurzenie", "mgła", "po deszczu, mokra nawierzchnia"];
export const OGNISKOWE = [
  "obiektyw 24 mm, szeroki plan, dużo tła",
  "obiektyw 50 mm, naturalna perspektywa",
  "obiektyw 85 mm, kompresja planów, płytka głębia ostrości",
];

export const indeksy = (n) => ({ kompozycja: (n * 7) % 4, podmiot: (n * 3) % 5, poraDnia: (n * 5) % 4, pogoda: (n * 11) % 4, ogniskowa: (n * 13) % 3 });

/** Osie numeru n po regułach nadrzędnych.
 *  opts: { pula: "dzis"|"pejzaz", sezon: "wiosna"|"lato"|"jesien"|"zima", tagP, tagT, wyjatek } */
export function osie(n, opts = {}) {
  const pula = opts.pula || "dzis";
  const i = indeksy(n);
  let podmiot = i.podmiot;
  if (pula === "pejzaz" && podmiot <= 1) podmiot += 3;                 // 21:9 źle znosi biegacza z bliska
  const silownia = opts.tagT === "silownia";
  const noc = n % 12 === 0;
  const wyj = opts.wyjatek || null;

  let pogoda = POGODA[i.pogoda];
  if (opts.tagP || silownia) pogoda = null;                           // pogodę niesie scena tagu / wnętrze
  else if (opts.sezon === "zima" && i.pogoda === 3) pogoda = "po odwilży, mokry śnieg i błoto pośniegowe";

  let poraDnia = noc ? "noc, czołówka, latarnie" : PORY_DNIA[i.poraDnia];
  const mgla = opts.tagP === "mgla" || (!opts.tagP && !silownia && i.pogoda === 2);
  if (mgla && !noc && (poraDnia === "południe" || poraDnia === "zmierzch")) poraDnia = "świt";
  if (wyj && wyj.poraDnia && !noc) poraDnia = wyj.poraDnia;
  let ogniskowa = i.ogniskowa;
  if (podmiot === 2 && !silownia && ogniskowa === 0) ogniskowa = 2;
  if (wyj && Number.isInteger(wyj.ogniskowa)) ogniskowa = wyj.ogniskowa;

  return {
    indeksy: i, pula, noc, silownia, wyjatek: !!wyj,
    podmiot: silownia ? "osoba w rozciąganiu (siłownia)" : PODMIOTY[podmiot], podmiotNr: silownia ? null : podmiot,
    detal: podmiot === 2 ? DETALE[n % DETALE.length] : null,
    kompozycja: KOMPOZYCJE[i.kompozycja], poraDnia, pogoda, ogniskowa: OGNISKOWE[ogniskowa], ogniskowaNr: ogniskowa,
  };
}

/** Zdania promptu wynikające z osi (scena, pora roku i nagłówek dokłada generator). */
export function zdaniaOsi(o, wyj) {
  if (wyj && wyj.kadr) return { kadr: wyj.kadr, kompozycja: wyj.kompozycja, styl: wyj.styl || `Styl dokumentalny: ${o.ogniskowa}, niedoskonałe, nieustawiane światło.` };
  const styl = `Styl dokumentalny: ${o.ogniskowa}, niedoskonałe, nieustawiane światło.`;
  const tlum = "Żadnego tłumu, żadnej grupy.";
  if (o.silownia) return {
    kadr: `Kadr: bez biegania — jedna osoba w rozciąganiu, widziana od tyłu, z dystansu. ${tlum}`,
    kompozycja: "Kompozycja: osoba w górnej lub środkowej części kadru, dolna część spokojna — pusta podłoga, bez ważnych szczegółów.", styl };
  if (wyj) return {                                                    // wyjątek sceny bez własnego kadru: podmiot niesie scena, z osi kamera i ogniskowa
    kadr: `Kadr: widok ${o.kompozycja.kamera}. ${tlum}`,
    kompozycja: "Kompozycja: główny motyw w górnej lub środkowej części kadru, dolna część spokojna — pusta nawierzchnia, cień, bez ważnych szczegółów.", styl };
  switch (o.podmiotNr) {
    case 0: return { kadr: `Kadr: jeden biegacz ${o.kompozycja.biegacz}. ${tlum}`,
      kompozycja: "Kompozycja: biegacz w górnej lub środkowej części kadru, dolna część spokojna — pusta nawierzchnia, cień, bez ważnych szczegółów.", styl };
    case 1: return { kadr: `Kadr: dwie osoby biegnące obok siebie, ${o.kompozycja.biegacz} — dwójka, nie grupa. ${tlum}`,
      kompozycja: "Kompozycja: dwójka w górnej lub środkowej części kadru, dolna część spokojna — pusta nawierzchnia, cień, bez ważnych szczegółów.", styl };
    case 2: return { kadr: `Kadr: zbliżenie — ${o.detal}, bez człowieka: żadnej twarzy, żadnych dłoni ani części ciała w kadrze.`,
      kompozycja: "Kompozycja: przedmiot w środkowej części kadru, tło miękko rozmyte, dolna część spokojna, bez ważnych szczegółów.", styl };
    case 3: return { kadr: `Kadr: bez człowieka — pusta trasa, widok ${o.kompozycja.kamera}. Żadnych ludzi.`,
      kompozycja: "Kompozycja: linia trasy prowadzi wzrok w głąb, dolna część spokojna — pusta nawierzchnia, bez ważnych szczegółów.", styl };
    default: return { kadr: `Kadr: jeden biegacz, mały w dużym pejzażu, daleko, ${o.kompozycja.kamera}. ${tlum}`,
      kompozycja: "Kompozycja: pejzaż wypełnia kadr, sylwetka zajmuje niewielką część, dolna część spokojna, bez ważnych szczegółów.", styl };
  }
}
