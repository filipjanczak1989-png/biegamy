// „O NAS” — plik wiedzy o BiegaMy dla Okienka (Filip 3.11 15:25 pkt 2). Pytania „kim jest Filip/Kasia/twórca”, „co to BiegaMy”, „kto stoi
// za aplikacją”, „jak zostać podopiecznym” → odpowiedź STĄD: 0 tokenów, PRZED bramką osób i przed siecią (nigdy do Google).
// Treść zatwierdzona przez Filipa 3.11 (poprawka: Filip = członek SZTABU SZKOLENIOWEGO kadry Polski na MŚ IAU 100 km, NIE zawodnik/reprezentant —
// blizna-122 pilnuje, że słowo „reprezentant” tu nie wróci). Tylko fakty z jego słów i z kodu aplikacji. Zmiana treści = tylko tu.
// Wczytywany jako moduł (EF okienko-v2, testy); bez Deno, bez bazy. Nazwisko dziecka z akcji NIGDY tu nie trafia (blizna „sekrety akcji”).
export const O_NAS = {
  filip: [
    "Filip Jańczak — założyciel BiegaMy i trener biegania.",
    "Członek sztabu szkoleniowego kadry Polski na mistrzostwa świata IAU w biegu na 100 km.",
    "W BiegaMy układa plany, prowadzi zawodników i odpowiada w czacie.",
  ],
  kasia: [
    "Kasia — współtrenerka w BiegaMy i biegaczka ultra.",
    "Razem z Filipem prowadzi zawodników.",
  ],
  zespol: [
    "Za BiegaMy stoją Filip Jańczak (założyciel, trener, członek sztabu szkoleniowego kadry Polski na MŚ IAU w biegu na 100 km) i Kasia (współtrenerka, ultraska).",
    "To projekt prowadzony przez nich samych.",
  ],
  biegamy: [
    "BiegaMy to aplikacja do biegania z trenerem: plan na każdy dzień, treningi z zegarka, forma, rekordy, starty, społeczność i Radio BiegaMy.",
    "Tworzą ją Filip Jańczak (trener) i Kasia (współtrenerka).",
  ],
  funkcje: [
    "Dziś — plan na dzisiaj, ostatni bieg i forma (ekran główny).",
    "Plan i Ostatnie treningi — zakładki u góry; trening zapisujesz w „Zapisz trening” albo łączysz zegarek w Profilu.",
    "Starty — kalendarz zawodów i Twoje cele; Jedzenie — dziennik posiłków i przepisy; Społeczność — znajomi i posty; Radio, Odznaki i Wyzwania — osobne ekrany w menu.",
  ],
  radio: [
    "Radio BiegaMy to muzyka do biegania tworzona przez Filipa — ekran Radio w menu.",
  ],
  liczba: [],   // liczona w potoku z bazy (Filip 3.11: „ponad X biegaczy”, X w dół do dziesiątek) — tu pusto, plik zostaje bez bazy
  profil_kasi: ["Kasia — współtrenerka w BiegaMy. Jej profil:"],
  profil_filipa: ["Filip Jańczak — założyciel BiegaMy i trener. Jego profil:"],
  podopieczny: [
    "Żeby trenować z Filipem albo Kasią, załóż konto w BiegaMy i napisz do nas przez czat w aplikacji.",
    "Bez trenera też skorzystasz: generator planu, dziennik treningów, forma i społeczność działają od razu po rejestracji.",
  ],
};

/* profile osób projektu (oba publiczne, sprawdzone 3.11) — karta „osoba” bez przycisku znajomości (bez_znajomosci: nie znamy relacji pytającego) */
export const PROFILE = { profil_kasi: { id: "2dd9206b-d2f0-4bdc-a1ef-4d7765e446b8", nazwa: "Kasia — współtrenerka" },
  profil_filipa: { id: "56092926-2cf1-44b6-952f-38614497fdc2", nazwa: "Filip Jańczak — trener" } };

const fold = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").toLowerCase().replace(/[?!.,;:"'„”()]+/g, " ").replace(/\s+/g, " ").trim();

const KTO = "(?:kim jest|kto to jest|kto to|kto jest|co wiesz o|opowiedz mi o|opowiedz o|przedstaw|kto to taki|kto to taka)";
const WZORCE = [
  ["liczba", /\b((ile|jak duzo|jak wiele|ilu) (jest )?(osob|ludzi|biegaczy|uzytkownikow|zawodnikow|was|nas|kont)\b.*\b(korzyst\w*|uzyw\w*|ma konto|maja konto|jest w|jestescie|trenuje w|zarejestr\w*|w biegamy|z biegamy|w aplikacji|w apce)|ilu (macie|jest|ma biegamy) (uzytkownikow|biegaczy|zawodnikow|osob)|ile (macie|ma biegamy) (uzytkownikow|biegaczy|zawodnikow|kont))\b/],
  ["profil_kasi", /\b(pokaz|otworz|zobacz|daj|gdzie (jest|znajde))\b.*\bprofi\w*\b.*\b(kasi|kasia|kasie|wspoltrenerk\w*)\b|\bprofi\w* (kasi|kasia|wspoltrenerki)\b/],
  ["profil_filipa", /\b(pokaz|otworz|zobacz|daj|gdzie (jest|znajde))\b.*\bprofi\w*\b.*\b(filip\w*|trenera filipa|zalozyciela)\b|\bprofi\w* (filipa|zalozyciela)\b/],
  ["podopieczny", /\b(jak (zostac|byc|moge zostac) (podopieczn\w*|zawodnikiem|zawodniczka|twoim zawodnikiem|zawodnikiem filipa|zawodniczka filipa)|jak (miec|dostac|zdobyc|znalezc|wziac|zalatwic) trenera|czy (filip|kasia|ty) (mnie |mozesz mnie |moze mnie )?(potrenuje|potrenujesz|poprowadzi|poprowadzisz|wezmie|wezmiesz|bedzie mnie trenowa\w*)|chce (miec )?trenera|ile kosztuje (trening|trener|wspolpraca|prowadzenie|plan od trenera|plan)|jak (zaczac|rozpoczac|nawiazac) (wspolprace|treningi|trening) (z filipem|z kasia|z wami|z trenerem)|jak trenowac z (filipem|kasia|wami))\b/],
  ["zespol", /\b(kto (stoi za|prowadzi|robi|tworzy|stworzyl|zrobil|zalozyl|napisal|zaprojektowal|zbudowal) (biegamy|ta aplikacj\w*|te aplikacj\w*|tej aplikacji|aplikacj\w*|apk\w*|to wszystko|to|ten projekt|projekt)|kto wy jestescie|kim jestescie|kim wy jestescie|kto jest (tworca|autorem|wlascicielem) (biegamy|aplikacji|apki)|kto za tym stoi|czyja to aplikacja|kto was prowadzi|kto za tobo stoi|kto cie (stworzyl|zrobil|napisal))\b/],
  ["filip", new RegExp("\\b" + KTO + " (filip\\w*|tworc\\w*|zalozyciel\\w*|autor\\w* (aplikacji|biegamy)|trener(a|em|ze)? filip\\w*)\\b(?!\\s+(?!janczak)[a-z]{3,})|\\bfilip jancz\\w*\\b")],   // samo „filip” = jedno słowo, nie pytanie o osobę (ławka: chipy/katalog)
  ["kasia", new RegExp("\\b" + KTO + " (kasia|kasi|kasie|katarzyn\\w*|wspoltrener\\w*)\\b(?!\\s+[a-z]{3,})")],
  ["biegamy", /\b(co to( jest)?( za)? biegamy|czym jest biegamy|co to za (aplikacja|apka|strona|serwis|program)|do czego (sluzy|jest|sluzysz) (biegamy|ta aplikacja|aplikacja|apka|ta apka)|o czym jest biegamy|co robi biegamy|co oferuje biegamy|co daje biegamy|opowiedz o biegamy|po co (jest )?biegamy|co to biegamy)\b/],
  ["radio", /\b(co to( jest)?|czym jest|o co chodzi z|jak dziala) (radio biegamy|radio|radia|radiem)\b/],   // „gdzie jest radio” = ekran → katalog
  ["funkcje", /\b(co (umie|potrafi|oferuje|daje|ma) (biegamy|ta aplikacja|aplikacja|apka|ta apka)|co moge (tu |tutaj )?(robic|zrobic) w (biegamy|aplikacji|apce)|co mozna (tu |tutaj )?(robic|zrobic) w (biegamy|aplikacji|apce)|jakie (sa|masz|ma|macie) funkcje|jakie funkcje (ma|sa w) (biegamy|aplikacj\w*|apk\w*)|co jest w (tej )?aplikacji|gdzie (sa|znajde) (funkcje|wszystkie funkcje))\b/],
];

/** @returns {null | {temat:string, zdania:string[], akcja:{nawiguj:string}|null}} */
export function oNas(tekst) {
  const t = fold(tekst);
  if (!t) return null;
  for (const [temat, re] of WZORCE) {
    if (re.test(t)) {
      const p = PROFILE[temat];
      return { temat, zdania: O_NAS[temat].slice(), akcja: temat === "radio" ? { nawiguj: "radio.html" } : null,
        karty: p ? [{ typ: "osoba", dane: { id: p.id, nazwa: p.nazwa, prywatny: false, bez_znajomosci: true } }] : [] };
    }
  }
  return null;
}
