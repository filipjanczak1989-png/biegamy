// OKIENKO 2.0 — SŁOWNIK MIAST do promienia planu startowego (Filip 3.11). Kalendarz maszyny NIE MA współrzędnych (zmierzone na m3 4.11: kalendarz_imprezy
// bez lat/lon, wojewodztwo puste w 263 z 263 nadchodzących), a athletes.lat/lon ma 17 z 91 kont. Współrzędne przybliżone (±5 km), wpisane ręcznie: promień 75 i 150 km
// tego nie odczuwa. Miejscowości spoza słownika i nazwy niejednoznaczne (Góra Kalwaria ≠ Góra, Dąbrowa, Rudniki, Janowiec…) celowo POZA nim: odległość „nieznana”,
// plan ich nie zgaduje i mówi, ile takich startów pominął. Słownik uzupełnia się przez dopisanie wiersza; nic poza tym plikiem go nie zna.
// Celowo bez miasta celu wyprawy: plan i tak nie pokazuje startów o nazwie lub w miejscu, które łapie strażnik akcji (plan-startowy.mjs, mapujKandydata).
const M = {
  "warszawa": [52.23, 21.01], "krakow": [50.06, 19.94], "lodz": [51.76, 19.46], "wroclaw": [51.11, 17.03], "poznan": [52.41, 16.93], "gdansk": [54.35, 18.65], "szczecin": [53.43, 14.55],
  "bydgoszcz": [53.12, 18.01], "lublin": [51.25, 22.57], "bialystok": [53.13, 23.16], "katowice": [50.26, 19.02], "gdynia": [54.52, 18.53], "radom": [51.40, 21.15],
  "torun": [53.01, 18.60], "sosnowiec": [50.29, 19.10], "kielce": [50.87, 20.63], "rzeszow": [50.04, 22.00], "gliwice": [50.29, 18.67], "zabrze": [50.32, 18.79], "olsztyn": [53.78, 20.49],
  "bielsko biala": [49.82, 19.04], "bytom": [50.35, 18.92], "zielona gora": [51.94, 15.51], "rybnik": [50.10, 18.54], "ruda slaska": [50.26, 18.86], "opole": [50.67, 17.93], "tychy": [50.13, 18.99],
  "gorzow wielkopolski": [52.73, 15.24], "elblag": [54.16, 19.40], "plock": [52.55, 19.71], "dabrowa gornicza": [50.32, 19.19], "walbrzych": [50.77, 16.28], "wloclawek": [52.65, 19.07], "tarnow": [50.01, 20.99],
  "chorzow": [50.30, 18.95], "koszalin": [54.19, 16.18], "kalisz": [51.76, 18.09], "legnica": [51.21, 16.16], "grudziadz": [53.48, 18.75], "jaworzno": [50.20, 19.27], "slupsk": [54.46, 17.03],
  "jastrzebie zdroj": [49.95, 18.57], "nowy sacz": [49.62, 20.69], "jelenia gora": [50.90, 15.73], "siedlce": [52.17, 22.29], "myslowice": [50.21, 19.17], "konin": [52.22, 18.25], "piotrkow trybunalski": [51.41, 19.69],
  "pila": [53.15, 16.74], "inowroclaw": [52.79, 18.26], "lubin": [51.40, 16.20], "ostrow wielkopolski": [51.65, 17.81], "gniezno": [52.54, 17.60], "suwalki": [54.10, 22.93], "glogow": [51.66, 16.08],
  "siemianowice slaskie": [50.31, 19.03], "pabianice": [51.66, 19.35], "leszno": [51.84, 16.57], "zamosc": [50.72, 23.25], "lomza": [53.18, 22.07], "zory": [50.05, 18.70], "tomaszow mazowiecki": [51.53, 20.01],
  "stalowa wola": [50.58, 22.05], "elk": [53.83, 22.36], "chelm": [51.13, 23.47], "mielec": [50.29, 21.42], "kedzierzyn kozle": [50.35, 18.21], "przemysl": [49.78, 22.77], "tczew": [54.09, 18.78], "zgierz": [51.86, 19.41],
  "piekary slaskie": [50.38, 18.94], "bielawa": [50.69, 16.62], "swidnica": [50.84, 16.49], "ostroleka": [53.08, 21.57], "legionowo": [52.40, 20.93], "pruszkow": [52.17, 20.80], "stargard": [53.34, 15.05], "nysa": [50.47, 17.33],
  "swinoujscie": [53.91, 14.25], "otwock": [52.11, 21.26], "raciborz": [50.09, 18.22], "wodzislaw slaski": [50.00, 18.46], "tarnobrzeg": [50.57, 21.68], "piaseczno": [52.08, 21.02], "zawiercie": [50.49, 19.42], "pulawy": [51.42, 21.97],
  "starachowice": [51.04, 21.07], "mikolow": [50.17, 18.90], "sanok": [49.56, 22.21], "krosno": [49.69, 21.77], "wejherowo": [54.60, 18.24], "rumia": [54.57, 18.39], "reda": [54.60, 18.35], "sopot": [54.44, 18.56], "kolobrzeg": [54.18, 15.58],
  "szczecinek": [53.71, 16.70], "walcz": [53.27, 16.47], "swidwin": [53.77, 15.78], "police": [53.55, 14.57], "goleniow": [53.56, 14.83], "gryfino": [53.25, 14.49], "gryfice": [53.92, 15.20], "koscierzyna": [54.12, 17.98], "kartuzy": [54.33, 18.20],
  "starogard gdanski": [53.96, 18.53], "malbork": [54.04, 19.03], "ilawa": [53.60, 19.57], "ostroda": [53.70, 19.97], "ketrzyn": [54.08, 21.37], "gizycko": [54.04, 21.76], "mikolajki": [53.80, 21.57], "orzysz": [53.81, 21.95], "olecko": [54.03, 22.50],
  "wydminy": [54.03, 22.03], "dobre miasto": [53.99, 20.40], "dywity": [53.84, 20.48], "dzialdowo": [53.24, 20.18], "makow mazowiecki": [52.87, 21.10], "ciechanow": [52.88, 20.62], "mlawa": [53.11, 20.38], "minsk mazowiecki": [52.18, 21.56],
  "zabki": [52.29, 21.11], "marki": [52.32, 21.10], "wolomin": [52.35, 21.24], "grodzisk mazowiecki": [52.11, 20.63], "podkowa lesna": [52.12, 20.72], "wiazowna": [52.17, 21.30], "sochaczew": [52.23, 20.24], "skierniewice": [51.96, 20.14],
  "lowicz": [52.11, 19.94], "kutno": [52.23, 19.36], "sieradz": [51.60, 18.73], "zdunska wola": [51.60, 18.94], "wielun": [51.22, 18.57], "radomsko": [51.07, 19.45], "belchatow": [51.37, 19.36], "pajeczno": [51.15, 18.99], "uniejow": [51.97, 18.79],
  "turek": [52.02, 18.50], "kolo": [52.20, 18.64], "wrzesnia": [52.33, 17.57], "sroda wielkopolska": [52.23, 17.28], "sroda wlkp": [52.23, 17.28], "kostrzyn": [52.40, 17.23], "kostrzyn wlkp": [52.40, 17.23], "kostrzyn nad odra": [52.59, 14.65], "nekla": [52.36, 17.41],
  "pobiedziska": [52.48, 17.29], "swarzedz": [52.41, 17.08], "lubon": [52.35, 16.88], "puszczykowo": [52.28, 16.85], "mosina": [52.25, 16.85], "kornik": [52.24, 17.09], "czerwonak": [52.46, 16.98], "murowana goslina": [52.58, 17.01], "oborniki": [52.65, 16.81],
  "rogozno": [52.75, 16.99], "szamotuly": [52.61, 16.58], "wronki": [52.71, 16.38], "wolsztyn": [52.12, 16.12], "grodzisk wielkopolski": [52.23, 16.37], "nowy tomysl": [52.32, 16.13], "opalenica": [52.31, 16.41], "porazyn tartak": [52.33, 16.43],
  "gostyn": [51.88, 17.01], "krobia": [51.77, 16.98], "krotoszyn": [51.70, 17.44], "jarocin": [51.97, 17.50], "pleszew": [51.89, 17.79], "kepno": [51.28, 17.99], "ostrzeszow": [51.43, 17.93], "janowiec wielkopolski": [52.76, 17.49], "wagrowiec": [52.81, 17.20],
  "chodziez": [53.00, 16.92], "naklo nad notecia": [53.14, 17.60], "zagan": [51.62, 15.32], "zary": [51.64, 15.14], "nowa sol": [51.80, 15.71], "swiebodzin": [52.25, 15.53], "miedzyrzecz": [52.45, 15.58], "sulechow": [52.08, 15.63], "slubice": [52.35, 14.56],
  "prusice": [51.37, 16.96], "trzebnica": [51.31, 17.06], "olawa": [50.95, 17.29], "jelcz laskowice": [51.03, 17.35], "brzeg": [50.86, 17.47], "olesnica": [51.21, 17.38], "milicz": [51.53, 17.28], "sobotka": [50.90, 16.74], "swierzawa": [51.02, 15.90], "jawor": [51.05, 16.19],
  "bolkow": [50.92, 16.10], "kliczkow": [51.27, 15.40], "lwowek slaski": [51.11, 15.59], "gryfow slaski": [51.03, 15.42], "boleslawiec": [51.26, 15.57], "klodzko": [50.44, 16.66], "kudowa zdroj": [50.44, 16.24], "ladek zdroj": [50.34, 16.88], "polkowice": [51.50, 16.07],
  "oborniki slaskie": [51.30, 16.91], "zawonia": [51.30, 17.21], "wilkszyn": [51.19, 16.83], "jedlina zdroj": [50.72, 16.35], "gluszyca": [50.69, 16.37], "dzierzoniow": [50.73, 16.65], "szklarska poreba": [50.83, 15.52], "karpacz": [50.78, 15.76], "przesieka": [50.84, 15.70], "sokolec": [50.62, 16.50],
  "zdzieszowice": [50.42, 18.12], "strzelce opolskie": [50.51, 18.30], "tarnow opolski": [50.58, 18.08], "komprachcice": [50.63, 17.82], "kluczbork": [50.97, 18.22], "krapkowice": [50.48, 17.97], "prudnik": [50.32, 17.58], "lubliniec": [50.67, 18.68], "koszecin": [50.64, 18.84], "boronow": [50.67, 18.91],
  "knurow": [50.22, 18.67], "pszow": [50.04, 18.40], "pszczyna": [49.98, 18.95], "czechowice dziedzice": [49.91, 19.01], "czeladz": [50.32, 19.08], "ustron": [49.72, 18.81], "cieszyn": [49.75, 18.63], "wisla": [49.65, 18.86], "zywiec": [49.69, 19.20], "andrychow": [49.85, 19.34], "oswiecim": [50.04, 19.24],
  "olkusz": [50.28, 19.57], "klucze": [50.34, 19.57], "rabsztyn": [50.30, 19.62], "niegowonice": [50.40, 19.43], "wadowice": [49.88, 19.49], "skawina": [49.98, 19.83], "niepolomice": [50.04, 20.22], "zakopane": [49.30, 19.95], "rabka zdroj": [49.61, 19.96], "szczawnica": [49.43, 20.49], "rytro": [49.49, 20.68],
  "ochotnica dolna": [49.52, 20.31], "grybow": [49.62, 20.95], "gorlice": [49.66, 21.16], "sekowa": [49.63, 21.20], "brzesko": [49.97, 20.61], "bochnia": [49.97, 20.43], "jaroslaw": [50.02, 22.68], "nowa sarzyna": [50.33, 22.33], "lancut": [50.07, 22.23], "debica": [50.05, 21.41], "ropczyce": [50.05, 21.61],
  "pinczow": [50.52, 20.53], "checiny": [50.80, 20.46], "staszow": [50.56, 21.17], "ostrowiec swietokrzyski": [50.93, 21.39], "skarzysko kamienna": [51.11, 20.87], "ryki": [51.62, 21.93], "deblin": [51.56, 21.85], "lukow": [51.93, 22.38], "biala podlaska": [52.03, 23.12], "krasnik": [50.92, 22.22], "swidnik": [51.22, 22.70],
  "wyszkow": [52.59, 21.46], "ostrow mazowiecka": [52.80, 21.89], "plonsk": [52.62, 20.38], "starozreby": [52.63, 19.99], "sierpc": [52.86, 19.67], "rypin": [53.07, 19.41], "brodnica": [53.26, 19.40], "chelmno": [53.35, 18.43], "swiecie": [53.41, 18.45], "tuchola": [53.59, 17.86], "chojnice": [53.70, 17.56], "bytow": [54.17, 17.49],
  "leba": [54.76, 17.56], "wladyslawowo": [54.79, 18.40], "hel": [54.61, 18.80], "bolszewo": [54.62, 18.18], "mikoszewo": [54.33, 18.96], "pruszcz gdanski": [54.26, 18.64], "kwidzyn": [53.73, 18.93], "augustow": [53.84, 22.98], "bielsk podlaski": [52.77, 23.19], "sokolka": [53.40, 23.50], "warcino": [54.25, 16.90],
};

const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** [lat, lon] albo null; „Skawina - Mogilany” i „Dąbrowa Górnicza - Sosnowiec” liczą się po pierwszej nazwie */
export function wspolrzedne(miasto) {
  const pierwsza = String(miasto || "").split(/\s+-\s+|\s*\/\s*/)[0];
  return M[fold(pierwsza)] || null;
}

/** odległość po kuli (km), zaokrąglona; drogą jest dalej, ale do progu 75 i 150 km wystarcza */
export function odlegloscKm(a, b) {
  if (!a || !b) return null;
  const rad = (x) => (x * Math.PI) / 180, dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)));
}

export const LICZBA_MIAST = Object.keys(M).length;
