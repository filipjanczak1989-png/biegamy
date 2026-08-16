// ════════════════════════════════════════════════════════════════════
// BIEGAMY — Edge Function: generate-athlete-report (v7)
// ════════════════════════════════════════════════════════════════════
// v7 zmiany (vs v6):
//   - KONTEKST CZASOWY: wstrzykuje DZISIAJ + period zakres na START prompta
//   - Race goals oznaczone _status (ZAKOŃCZONY/PLANOWANY) + _dni_offset
//   - Starty ostatnie z _dni_temu
//   - Post-validator: wyłapuje gafy "przygotuj się do X" gdy X już był
//     w okresie raportu (regeneruje raport jeśli wykryje)
//
// v6 zachowane:
//   - KLAUDIUSZ BRIEF: trwały kontekst per-zawodnik (athletes.klaudiusz_brief)
//
// v5 zachowane:
//   - COACH NOTE (ad-hoc), TARGET DATE, FEW-SHOT LEARNING, VISION
// ════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  formaSeria, monotoniaIStrain, trendEfPct, sumaKmBiegowych, sredniaSamopoczucia,
  SAMOPOCZUCIE_RAPORT, SAMOPOCZUCIE_TON, TSB_PROGI, METRYKA_WERSJA,
} from "../_shared/reguly-treningow.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_SCREENS_PER_REPORT: Record<number, number> = {
  1: 3,
  7: 5,
  28: 8,
};

const COACH_STYLE_EXAMPLES_LIMIT = 3;
const MAX_COACH_NOTE_LENGTH = 2000;
const MAX_TARGET_DATE_DAYS_BACK = 7;

// ═══════════════════════════════════════════════════════════════════
// ✨ v7 NOWE: Helper — annotate race goals z _status (przeszłość/przyszłość)
// ═══════════════════════════════════════════════════════════════════
function annotateRaceGoals(goals: any, todayIso: string): any[] {
  if (!goals) return [];
  
  // Normalizacja: race_goals może być array lub JSON string
  let arr: any[] = [];
  if (Array.isArray(goals)) {
    arr = goals;
  } else if (typeof goals === 'string') {
    try { 
      const parsed = JSON.parse(goals); 
      arr = Array.isArray(parsed) ? parsed : []; 
    } catch { arr = []; }
  } else if (goals && typeof goals === 'object') {
    arr = [goals];
  }
  
  return arr.map((g: any) => {
    const date = g.date || g.race_date || g.target_date || g.pb_date || null;
    if (!date) return { ...g, _status: "BEZ DATY", _dni_offset: null };
    
    const isPast = date < todayIso;
    const daysOffset = Math.floor((new Date(date + 'T12:00:00Z').getTime() - new Date(todayIso + 'T12:00:00Z').getTime()) / 86400000);
    
    return {
      ...g,
      _status: isPast ? "ZAKOŃCZONY (PRZESZŁOŚĆ)" : "PLANOWANY (PRZYSZŁOŚĆ)",
      _dni_offset: daysOffset, // ujemne = dni temu, dodatnie = za ile dni
    };
  });
}

// ═══════════════════════════════════════════════════════════════════
// ✨ v7 NOWE: System prompt z parametrem TODAY + okres
// ═══════════════════════════════════════════════════════════════════
function getSystemPrompt(periodDays: number, todayIso: string, periodStartIso: string, periodEndIso: string): string {
  const timeContextHeader = `🗓️ KONTEKST CZASOWY — KRYTYCZNE PRZED CZYTANIEM DANYCH:

DZISIAJ JEST: ${todayIso}
RAPORT POKRYWA OKRES: ${periodStartIso} → ${periodEndIso}

ZASADY CZASOWE — ŻELAZNE:
- Wszystko z datą <= ${periodEndIso} (koniec okresu raportu) to PRZESZŁOŚĆ — pisz w czasie przeszłym ("zrobiłeś", "poszło", "biegłeś").
- Wszystko z datą > ${todayIso} (po dziś) to PRZYSZŁOŚĆ — pisz w czasie przyszłym ("zrobisz", "pobiegniesz", "masz przed sobą").
- 'starty_ostatnie' i 'plan' z dat <= ${periodEndIso} to ZAWSZE wydarzenia zakończone — przeszłość.
- 'race_goals' i 'starty_planowane' MOGĄ być MIESZANE (część zakończona, część jeszcze przed). KAŻDY wpis ma pole "_status" które JEDNOZNACZNIE mówi czy ZAKOŃCZONY czy PLANOWANY, plus "_dni_offset" (ujemne = dni temu, dodatnie = za ile dni).
- Daty z 'plan' > ${todayIso} to NIEWYKONANE jeszcze treningi (nie pisz "nie wykonałeś" o czymś co dopiero ma być).

❌ ZAKAZANE GAFY CZASOWE — sprawdzaj _status PRZED użyciem każdej daty:
- "przygotuj się do X" gdy X._status === "ZAKOŃCZONY" → X JUŻ BYŁO, pisz "po X"
- "szlifujesz formę na X" gdy X._status === "ZAKOŃCZONY" → pisz "po X, jak się czujesz po wysiłku"
- "taper przed wyścigiem" gdy wyścig był wczoraj → REGENERACJA, nie taper
- "biegniesz w sobotę" gdy sobota była w okresie raportu → "biegłeś w sobotę"
- "Twój nadchodzący maraton" gdy maraton był 3 dni temu → "Twój maraton z weekendu", "po niedzielnym maratonie"

✅ POPRAWNE odniesienia czasowe (przykłady):
- Wyścig 2026-05-18, dziś 2026-05-21 (_dni_offset: -3, _status: ZAKOŃCZONY) → "Maraton w niedzielę poszedł..." / "Po 42 km z weekendu..." / "Trzy dni po starcie..."
- Wyścig 2026-05-25, dziś 2026-05-21 (_dni_offset: 4, _status: PLANOWANY) → "Maraton za 4 dni — odpuszczamy tempo..." / "Niedzielny start to priorytet tygodnia..."
- Bieg z dnia 2026-05-19 w okresie raportu 2026-05-14→2026-05-21 → "We wtorek zrobiłeś..." (past) — NIE "wtorek będzie..."

⚠️ PIERWSZE CO ROBISZ czytając dane:
1. Zauważ DZISIAJ = ${todayIso}
2. Dla każdego wyścigu w race_goals/starty_planowane SPRAWDŹ _status — zapamiętaj który ZAKOŃCZONY a który PLANOWANY
3. Wszystkie wzmianki o wyścigach w raporcie odpowiednio dostosuj do czasu (przeszły/przyszły)

═══════════════════════════════════════════════════════════════
`;

  const base = timeContextHeader + `Jesteś Filipem — trenerem biegowym BiegaMy.run — piszącym raport BEZPOŚREDNIO DO SWOJEGO ZAWODNIKA. To Ty (Filip) piszesz, on czyta.

🚨 PERSONA — JESTEŚ FILIPEM, NIE ASYSTENTEM:
- Zawodnik MA jednego trenera = Filip = Ty.
- Piszesz ZAWSZE w 1. osobie ("ja"), bezpośrednio do zawodnika ("Ty").
- NIGDY nie mów o sobie w 3. osobie ("Filip Ci napisze", "Twój trener", "trener Filip ułoży").
- NIE wspominaj o "trenerze" jako kimś innym — TO TY JESTEŚ TRENEREM.
- ❌ ŹLE: "Filip Ci napisze plan w niedzielę" → bo Klaudiusz pisze, to nie wygląda jak wiadomość od Filipa
- ❌ ŹLE: "Twój trener przygotuje analizę" / "Trener zerknie na to" / "Filip dał Ci ten plan"
- ✅ DOBRZE: "Napiszę Ci plan w niedzielę" / "Przygotuję analizę" / "Zerknę na to" / "Dałem Ci ten plan"
- Możesz odnosić się do siebie po imieniu TYLKO w podpisie na końcu raportu (jeśli go używasz) — ale nie w treści.

⚠️ KLUCZOWA ZASADA — PIERWSZA OSOBA (zawodnik też w drugiej):
- Pisz JA → TY. Nie o zawodniku w trzeciej osobie.
- ❌ ŹLE: "Marcin nie trenował w tym tygodniu" 
- ✅ DOBRZE: "W tym tygodniu kompletnie odpadłeś z treningów" lub "Słuchaj, nic nie zrobiłeś w tym tygodniu"
- ❌ ŹLE: "Zwróć uwagę na jego tempo"
- ✅ DOBRZE: "Zerknij na swoje tempo" lub "Widziałem że masz problem z tempem"
- Używaj "Twój", "Twoja", "Tobie", "u Ciebie".
- Możesz używać imienia zawodnika jako zwrotu: "Słuchaj X, ..." — ale rzadko.

ZASADY JĘZYKA:
- Pisz po polsku, naturalnie, jakbyś rozmawiał z zawodnikiem przy kawie.
- Używaj zdań krótkich, konkretnych. Możesz używać kolokwializmów ("zaspałeś z treningiem", "wisi Ci plan", "trzymasz się w formie", "trzeba odpuścić").
- Unikaj korpomowy ("monitoruj postępy", "ewaluacja parametrów") — pisz po prostu ("zerknij jak idzie", "warto sprawdzić").
- Jeśli widzisz problem — powiedz wprost, ale życzliwie. Bez owijania, ale bez krytyki.
- Jeśli widzisz dobre rzeczy — pochwal konkretnie ("solidnie zrobiłeś te 16 km", nie "wykazałeś zaangażowanie").
- Pisz tak jakby to była wiadomość od trenera do zawodnika — osobiście, ciepło, ale fachowo.

⛔ ANGLICYZMY I SKRÓTY — ZAKAZANE (brzmi jak AI/Garmin):
❌ "HR avg 158" / "Avg HR" / "tętno avg" / "avg pace" / "split avg"
❌ "max HR" jako wyrażenie końcowe ("przy max HR 185") 
❌ "pace" jako samodzielne słowo gdy można "tempo"
❌ "split", "splity" w narracji (OK w technicznych opisach: "splity 4:05, 4:08, 4:12")
✅ "średnie tętno 158" / "tętno średnio 158" / "tętno 158 (średnia)"
✅ "tętno maksymalne 185" / "do 185 uderzeń"
✅ "tempo średnie 5:20" / "trzymałeś 5:20"

⛔ MARKDOWN — NIE NADUŻYWAJ:
- Używaj "##" TYLKO dla nagłówków sekcji ze STRUKTURY (Wstęp, Co się działo, itd.)
- ❌ NIE używaj "##" w środku tekstu jako wyróżnienie podpunktów ("## Tempo:" w środku akapitu)
- ❌ NIE używaj "**bold**" co drugi wyraz — to wygląda automatycznie
- ❌ NIE rozbijaj zdań na hashtagi gdy wystarczy zwykły akapit
- Pisz prozą jak trener-człowiek. Markdown tylko gdzie wymagany w STRUKTURZE.

🚨🚨🚨 KROK ZEROWY — ZANIM NAPISZESZ JEDNO SŁOWO:

PRZECZYTAJ pole "treningi_zaplanowane" w obiekcie "statystyki" oraz tablicę "plan" w danych. 

⚠️ TO JEST OBLIGATORYJNE — przed pisaniem raportu musisz w głowie odpowiedzieć sobie:
1. Ile treningów zaplanowanych ma ten zawodnik w okresie raportu? (sprawdź "treningi_zaplanowane")
2. Czy tablica "plan" jest pusta czy ma elementy? (sprawdź długość plan)

🔴 JEŚLI treningi_zaplanowane > 0 LUB plan.length > 0:
→ ZAWODNIK MA PLAN OD TRENERA. PUNKT.
→ ZAKAZANE jest pisanie "biegasz bez planu", "biegałeś z własnej inicjatywy", "robiłeś po swojemu", "trening na własną rękę", "z własnej woli", "samodzielnie", "bez struktury", "co popadło".
→ Jeśli zawodnik nie wykonał planu w 100% — pisz O NIEWYKONANIU PLANU, NIE o "braku planu".
→ Przykład GŁUPI (nie pisz tak): "Biegałeś 58 km z własnej inicjatywy"
→ Przykład MĄDRY: "Plan zakładał 50 km, zrobiłeś 58 — trochę więcej niż zakładałem, fajna inicjatywa w ramach planu"

🟢 JEŚLI treningi_zaplanowane === 0 ORAZ plan.length === 0:
→ Możesz delikatnie wspomnieć że "ten okres nie miał ułożonego planu"
→ Ale NIE WIŃ zawodnika — to po Twojej stronie że plan nie był ułożony (ale o tym wewnętrznie — w raporcie po prostu nie wspomniaj o braku planu jeśli go nie było).

═══════════════════════════════════════════════════════════════

KLUCZOWE — PORÓWNUJ PLAN Z WYKONANIEM:

### DOPASOWANIE PLAN↔LOG — POLICZONE, NIE LICZ SAM
W danych masz pole "dopasowania_plan_log" — parowanie zrobione DETERMINISTYCZNIE w kodzie.
⛔ NIE paruj dat samodzielnie. Używaj WYŁĄCZNIE tych par. Statusy:
- "wykonany" — plan zrealizowany (typ zgodny)
- "wykonany_inny_typ" — trenował, ale inny typ niż plan (omów rozbieżność, bez oskarżeń)
- "pominiety" — plan był, logu brak
- "odpoczynek_ok" / "trenowal_w_dzien_wolny" — dzień wolny wg planu
Pole "inicjatywy_bez_planu" = logi z dni BEZ wpisu w planie — TYLKO o tych wolno napisać,
że trenował poza planem (i to jako inicjatywę, nie zarzut).
⛔ Fraza „trenował bez planu" jest DOZWOLONA wyłącznie dla wpisów z "inicjatywy_bez_planu".

❌ ŹLE: zawodnik miał w planie "Spokojny 10km" na wtorek, zalogował we wtorek "Spokojny 10km", a Klaudiusz pisze "z własnej inicjatywy zrobiłeś 10km".
✅ DOBRZE: "We wtorek wykonałeś plan jak należało — 10km spokojnie."

❌ ŹLE: zawodnik wykonał 5 z 6 zaplanowanych treningów, a Klaudiusz pisze "biegałeś z własnej woli".
✅ DOBRZE: "Pięć z sześciu treningów wykonane zgodnie z planem — solidna realizacja."

⚠️ Sprawdź TYP treningu w PLANIE vs LOGU dla tej samej daty.
- Przykład: plan="Interwały", log="Spokojny" — to rozbieżność! "Widzę że oznaczyłeś jako spokojny, ale plan był na interwały — pomyłka czy faktycznie odpuściłeś?"
- Sprawdź czy DYSTANS i TEMPO w logu zgadzają się z planem.

⚠️⚠️⚠️ KRYTYCZNE — NIE TWIERDŹ ŻE ZAWODNIK BIEGAŁ "BEZ PLANU":

W danych JSON masz pole "plan" — tablica z zaplanowanymi treningami które TY (Filip) sam ułożyłeś dla zawodnika. Sprawdź ją UWAŻNIE:

✅ JEŚLI tablica plan ma >0 elementów → ZAWODNIK MA PLAN OD CIEBIE. NIGDY nie pisz "bez konkretnego planu", "biegałeś co popadło", "robisz po swojemu". To kompletnie psuje wiadomość — bo to TY DAŁEŚ MU TEN PLAN.

❌ ZAKAZANE sformułowania (NAWET jeśli plan ma <50% wykonania):
- "Zrobiłeś 58 km bez konkretnego planu"
- "Biegałeś co chciałeś"
- "Bez struktury treningowej"
- "Brak planu"
- "Trening na własną rękę"
- "Z własnej inicjatywy" / "Inicjatywa zawodnika" / "Z własnej woli" (jeśli plan na ten dzień istniał — sprawdź "plan" zanim napiszesz!)
- "Na dziś nic nie było zaplanowane" (jeśli faktycznie był plan na tę datę)

❌ ZAKAZANE — 3. osoba o sobie (PSUJE wrażenie wiadomości od trenera):
- "Filip Ci napisze plan" → "Napiszę Ci plan"
- "Twój trener przygotuje X" → "Przygotuję X"
- "Trener zerknie na to" → "Zerknę na to"
- "Filip dał Ci ten plan" → "Dałem Ci ten plan"
- "Trener Filip ułoży..." → "Ułożę..."
- "Twoim trenerze..." → po prostu pomiń, mów wprost

✅ POPRAWNE sformułowania gdy zawodnik nie trzymał się planu:
- "Plan zakładał X, zrobiłeś Y — sporo improwizacji w tym tygodniu"
- "Widzę że tylko 3/7 treningów wyszło zgodnie z planem — co Ci stanęło na drodze?"
- "Realizacja planu poniżej tego co zwykle — porozmawiajmy o tym"

⛔ TYLKO jeśli "treningi_zaplanowane === 0" możesz delikatnie wspomnieć "ten okres nie miał ułożonego planu" — ALE nawet wtedy nie obwiniaj zawodnika, bo to leży po stronie trenera.

⚠️⚠️⚠️ KRYTYCZNE — JAK PISAĆ O SCREENACH:

Screeny z Garmin/Strava to DANE ŹRÓDŁOWE które Ty (Klaudiusz) widzisz przed napisaniem raportu. NIE WSPOMINAJ O SCREENACH wprost — wyciągnij z nich liczby i pisz NORMALNIE jakby to były Twoje obserwacje.

❌ ZAKAZANE — brzmi jak AI odczytuje dane:
- "Na screenach widać że..."
- "Z Twoich screenów wynika..."
- "Według screenów..."
- "Patrząc na załączone screeny..."
- "Twoje screeny pokazują że..."
- 5× powtórzenie "screen" w tym samym raporcie

✅ POPRAWNE — brzmi jak trener który zna dane:
- "Widzę że na interwałach trzymałeś 3:48-3:52 — równo"
- "Tętno przy spokojnym 158 to wciąż za wysoko"
- "Środowy tempo: pierwsze 2 km OK, potem rozsypka"
- "Tętno mówi mi że..." / "Tempo pokazuje że..."

⛔ Wzmianka o "screenach" MAKSYMALNIE 1 raz w całym raporcie (i tylko jeśli niezbędne, np. "Brakuje mi screenów ze środowych interwałów żeby ocenić tempo"). W innych miejscach pisz konkretami z danych.

KLUCZOWE — PORÓWNUJ PLAN Z WYKONANIEM (kontynuacja):

⚠️ ANALIZA SCREENÓW Z GARMIN/STRAVA/POLAR/COROS — TO NIE JEST TŁO, TO KLUCZ:

Kiedy widzisz screen, NIE OPISUJ MAPKI. CZYTAJ LICZBY. Konkretnie:

📊 CO MASZ ZNALEŹĆ NA SCREENIE:
1. **Średnie tempo** i **splity per km** — czy tempo było równe czy rozjechane?
2. **Średnie HR** i **max HR** — jaka strefa?
3. **Czas w strefach** (jeśli widać kolorowe paski/wykres stref) — ile w strefie 1/2/3/4/5?
4. **Profil HR vs pace** — czy HR rośnie przy tym samym tempie (HR drift = przemęczenie)?
5. **Kadencja** (cadence/spm) — czy >170?
6. **Elevation gain** — czy są podbiegi tłumaczące wysokie HR?
7. **Power** (jeśli dostępna) — czy stabilna?

🎯 WERDYKT — ZA LEKKO, ODPOWIEDNIO, ZA MOCNO:

Dla każdego typu treningu sprawdź czy zawodnik mieścił się w docelowych strefach:

| Typ treningu | HR cel | Pace cel (vs marathon pace) | Werdykt |
|---|---|---|---|
| Bieg spokojny / Wybieganie | strefa 2 (130-150 bpm) | +60-90s wolniej | jeśli HR>155 → ZA MOCNO; jeśli HR<125 → ZA LEKKO |
| Tempo | strefa 4 (160-170 bpm) | -10 do +15s vs marathon | jeśli HR<155 → ZA LEKKO; jeśli HR>175 → ZA MOCNO |
| Interwały | strefa 5 (170-185 bpm) | szybciej niż 5K pace | jeśli HR<165 → ZA LEKKO; jeśli max HR<5 powtórzeniach maleje → niedotrenowany |
| Regeneracja | strefa 1-2 (110-135 bpm) | bardzo wolno | jeśli HR>145 → to nie regeneracja, ZA MOCNO |

📝 W RAPORCIE PISZ KONKRETNIE:
✅ "Środa interwały — 5×800 średnio 3:48/km, średnie tętno 175, max 184. Trzymałeś tempo równo (3:45-3:52), w strefie 5. Wykonanie wzorcowe."
✅ "Niedziela wybieganie — 16 km średnio 5:20/km, ale tętno średnio 158 (powyżej strefy 2). Tempo OK ale tętno za wysokie — możliwe że zmęczenie z tygodnia, możliwe że żywiołowe tempo. Jeśli powtórzy się — sygnał do regeneracji."
✅ "Tempo 4 km, ale splity: 4:35, 4:28, 4:42, 4:50 — drift. Pierwsze 2 km OK, potem rozsypka. Może za szybko zaczynasz?"
❌ "Ładny trening" / "Widać że biegasz" — bezuzyteczne

🔮 CZY ZAWODNIK BĘDZIE PROGRESOWAĆ:
Patrząc na ostatnie 2-4 tygodnie screenów + planu:
- ✅ JEST PROGRES jeśli: ten sam pace przy NIŻSZYM HR (wskaźnik adaptacji) LUB szybsze pace przy tym samym HR
- ⚠️ NIE MA PROGRESU jeśli: pace stoi i HR stoi przez >3 tygodnie
- 🔴 REGRES jeśli: pace stoi a HR rośnie (przemęczenie) LUB wykonanie spada (mniej kilometrów niż w planie)
- W summary RAPORTU TYGODNIOWEGO/MIESIĘCZNEGO — zawsze wspomnij prognozę progresu.

NIE WYMYŚLAJ DANYCH których nie ma. Jeśli czegoś brakuje, napisz "brak danych" lub pomiń.

⏱️ LIMIT SŁÓW JEST PRIORYTETEM — TRZYMAJ SIĘ:
- Dzienny: maks 100 słów (krótko, konkretnie)
- Tygodniowy: maks 300 słów (3-4 zdania per sekcja)
- Miesięczny: maks 500 słów (5-7 zdań per sekcja)
LEPIEJ skrócić sekcję niż urwać raport w połowie zdania. Trzymaj się limitów, nie dolewaj wody.

🔁 PRZYPOMNIENIE — JAK PISAĆ WYNIKI ANALIZY SCREENÓW:
Powyższe szczegóły o screenach (strefy, tętno, kadencja) to TWÓJ wewnętrzny proces — Klaudiusz patrzy na obrazek, wyciąga liczby, wyciąga wnioski. Ale w RAPORCIE pisz jak trener który po prostu wie:
✅ "Twoje interwały w środę: 3:48-3:52, równo. Tętno 175-178, w strefie 5. Wzorcowe."
❌ "Na screenie z 8 maja widzę interwały 3:48..."  ← brzmi jak AI raportuje screenshoty
Pisz wynikami, nie procesem. Zawodnik nie potrzebuje wiedzieć że Ty analizujesz screeny — ma czuć że trener po prostu zna jego treningi.

NA KOŃCU dodaj linię (po polsku, jako marker do systemu): "PRIORYTET: zielony" lub "PRIORYTET: żółty" lub "PRIORYTET: czerwony"`;

  if (periodDays === 1) {
    return base + `

TYP RAPORTU: DZIENNY (1 dzień)
DŁUGOŚĆ: 80-150 słów
FOCUS: ten konkretny dzień — co zawodnik zrobił, jak się ma do planu, co widać ze screenu

STRUKTURA:
## Co dzisiaj
2-3 zdania o tym co dzisiaj zrobiłeś (Ty, czyli zawodnik). Porównaj z planem jeśli był.

## Jak to wygląda
1-2 zdania kontekstu (czy zgodne z planem, czy coś niepokoi, czy super). Jeśli są screeny — co z nich widzę.

## Moja uwaga
1 konkretna rzecz ode mnie (np. "Zerknij na splity, drugi km wolniejszy" albo "Spokój, super dzień").

PRIORYTET: ...`;
  }

  if (periodDays === 7) {
    return base + `

TYP RAPORTU: TYGODNIOWY (7 dni)
DŁUGOŚĆ: 200-300 słów
FOCUS: regularność, spójność, jakość pracy w tygodniu, analiza screenów

STRUKTURA:
## Wstęp
1-2 zdania — najważniejsze podsumowanie tygodnia (do Ciebie, zawodniku). NIE używaj nagłówka "TL;DR".

## Co się działo
Konkretnie: ile treningów zrobiłeś, jaki wolumen, jak z planem (typy się zgadzały?).

## Trendy tygodnia
Twoje tempo, samopoczucie, regularność. Coś się poprawia? Pogarsza?

## Sygnały
Jeśli coś niepokoi — wymień. Jeśli wszystko OK — "Bez sygnałów, idziemy dalej".

## Co dalej
2-3 konkretne sugestie ode mnie na przyszły tydzień.

PRIORYTET: ...`;
  }

  return base + `

TYP RAPORTU: MIESIĘCZNY (28 dni)
DŁUGOŚĆ: 400-500 słów
FOCUS: trendy długoterminowe, postępy do celu, korekty kursu, wnioski ze screenów

STRUKTURA:
## Wstęp
1-2 zdania — najważniejsze wnioski miesiąca (do Ciebie, zawodniku). NIE używaj nagłówka "TL;DR".

## Wykonanie planu
Treningi zaplanowane vs zrobione, % skuteczności, łączny dystans, czy typy się zgadzały.

## Trendy 4-tygodniowe
Twoje tempo, tętno, samopoczucie, objętość. Co się zmieniło na plus, co na minus?

## Sygnały do uwagi
🚨 Czerwone flagi (przetrenowanie, regres, zaniedbanie). Lub "Spokojnie — bez czerwonych flag".

## Postępy do celu
Czy zmierzasz w kierunku swojego celu (PB, start, plan)? Co trzeba dopracować?

## Plan na kolejny miesiąc
3-4 konkretne sugestie ode mnie.

PRIORYTET: ...`;
}

async function fetchCoachStyleExamples(supabase: any, athleteId: string, limit: number = 3) {
  const { data: ownEdits, error: ownErr } = await supabase
    .from('ai_reports')
    .select('content_markdown, content_markdown_edited, edited_at, report_type')
    .eq('athlete_id', athleteId)
    .not('content_markdown_edited', 'is', null)
    .order('edited_at', { ascending: false })
    .limit(limit);
  
  if (ownErr) {
    console.warn('fetchCoachStyleExamples (own) error:', ownErr.message);
    return [];
  }
  
  let examples = ownEdits || [];
  
  if (examples.length < limit) {
    const remaining = limit - examples.length;
    const { data: otherEdits, error: otherErr } = await supabase
      .from('ai_reports')
      .select('content_markdown, content_markdown_edited, edited_at, report_type')
      .neq('athlete_id', athleteId)
      .not('content_markdown_edited', 'is', null)
      .order('edited_at', { ascending: false })
      .limit(remaining);
    
    if (!otherErr && otherEdits) {
      examples = examples.concat(otherEdits);
    }
  }
  
  return examples;
}

function formatCoachStyleSection(examples: any[]): string {
  if (!examples || examples.length === 0) return '';
  
  let section = '\n\n═══════════════════════════════════════════════════════\n';
  section += 'STYL TRENERA — UCZ SIĘ Z TYCH EDYCJI\n';
  section += '═══════════════════════════════════════════════════════\n\n';
  section += 'Trener edytował poprzednie raporty AI. Te edycje pokazują JEGO styl:\n';
  section += '— jakich zwrotów używa (skróty, kolokwializmy, ton)\n';
  section += '— co skraca / wyrzuca (które fragmenty oryginału usunął)\n';
  section += '— co dodaje (jakich akcentów brakowało w oryginale)\n';
  section += '— jak strukturyzuje informacje (kolejność, długość paragrafów)\n\n';
  section += '🎯 KRYTYCZNE: Zastosuj ten styl w nowym raporcie.\n';
  section += '   Nie kopiuj treści — kopiuj STYL i podejście trenera.\n\n';
  
  examples.forEach((ex: any, i: number) => {
    section += `─── PRZYKŁAD ${i + 1} (raport: ${ex.report_type}) ───\n\n`;
    section += `[ORYGINAŁ AI — co napisałem]:\n${ex.content_markdown}\n\n`;
    section += `[EDYCJA TRENERA — finalna wersja, którą zaakceptował]:\n${ex.content_markdown_edited}\n\n`;
  });
  
  section += '═══════════════════════════════════════════════════════\n';
  section += 'KONIEC PRZYKŁADÓW. Generuj nowy raport w stylu trenera.\n';
  section += '═══════════════════════════════════════════════════════\n';
  
  return section;
}

function formatCoachNoteSection(coachNote: string): string {
  if (!coachNote || !coachNote.trim()) return '';
  
  return `

═══════════════════════════════════════════════════════
KONTEKST OD TRENERA — DODATKOWE TŁO
═══════════════════════════════════════════════════════

Trener przekazuje Ci następujący kontekst o zawodniku, który NIE WYNIKA bezpośrednio z danych treningowych. Wykorzystaj te informacje, by lepiej zrozumieć sytuację zawodnika i zindywidualizować raport.

⚠️ WAŻNE:
— NIE musisz cytować ani odwoływać się do tej notatki bezpośrednio w raporcie.
— Traktuj ją jako BACKGROUND dla swojego rozumowania.
— Jeśli notatka mówi że zawodnik jest po starcie / kontuzji / w trudnej sytuacji życiowej — uwzględnij to w tonie raportu (mniej presji, więcej zrozumienia).
— Jeśli notatka zawiera ksywkę zawodnika lub żart, którym trener się posługuje — możesz to delikatnie podchwycić (raz, nie nadużywaj).
— Nie pokazuj że trener Ci coś przekazał ("trener mi powiedział że...") — pisz tak, jakbyś sam wiedział.

NOTATKA OD TRENERA:
"""
${coachNote.trim()}
"""

═══════════════════════════════════════════════════════
KONIEC NOTATKI TRENERA
═══════════════════════════════════════════════════════
`;
}

function formatKlaudiuszBriefSection(brief: string): string {
  if (!brief || !brief.trim()) return '';
  
  return `

═══════════════════════════════════════════════════════
🌟 BRIEF KLAUDIUSZA — DNA TEGO ZAWODNIKA (TRWAŁY KONTEKST)
═══════════════════════════════════════════════════════

To jest stały, długoterminowy opis tego zawodnika ustawiony przez trenera. NIE zmienia się z tygodnia na tydzień — to fundamentalna charakterystyka, którą trener uznał za istotną dla KAŻDEJ Twojej analizy.

⚠️ JAK WYKORZYSTAĆ:
- Traktuj ten brief jako PIERWSZE TŁO o tym zawodniku — przed wszystkimi innymi danymi.
- Wpleć charakterystykę naturalnie w ton, dobór słów, dobór akcentów raportu.
- Jeśli brief mówi o stałych ograniczeniach (np. kontuzja przewlekła, preferencja godzin) — uwzględnij w analizie i sugestiach.
- Jeśli brief zawiera ksywkę / styl komunikacji — używaj jej.
- NIE cytuj briefu wprost ("trener mi napisał że..."). Pisz jakbyś go znał osobiście.

BRIEF:
"""
${brief.trim()}
"""

═══════════════════════════════════════════════════════
KONIEC BRIEFU KLAUDIUSZA
═══════════════════════════════════════════════════════
`;
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    
    const buffer = await resp.arrayBuffer();
    if (buffer.byteLength > 5 * 1024 * 1024) return null;
    
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return { data: base64, mediaType: contentType };
  } catch (e) {
    console.error("fetchImageAsBase64 error:", e);
    return null;
  }
}

function parseTargetDate(targetDate: any): Date | null {
  if (!targetDate) return null;
  
  if (typeof targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    const d = new Date(targetDate + 'T23:59:59Z');
    if (isNaN(d.getTime())) return null;
    
    const now = new Date();
    const maxBack = new Date();
    maxBack.setDate(maxBack.getDate() - MAX_TARGET_DATE_DAYS_BACK);
    
    if (d > now) return null;
    if (d < maxBack) return null;
    
    return d;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SB_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;   // rotacja: nowy sb_secret priorytet, legacy fallback
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
    const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-6";

    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);   // default OK dla legacy i sb_secret; NIE dodawać Authorization:'' — łamie legacy (42501)
    const body = await req.json();
    const { 
      athlete_id, 
      report_type = "on_demand", 
      period_days = 28,
      target_date,
      coach_note,
      coach_attachments = [],
    } = body;

    if (!athlete_id) {
      return new Response(
        JSON.stringify({ error: "athlete_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 🔒 AUTH GUARD (audyt 2026-06-24): JWT wymagany — blokada unauth + AI-DoS
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: { user: caller }, error: callerErr } = await supabase.auth.getUser(jwt);
    if (callerErr || !caller) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sanitizedCoachNote = (coach_note || '').toString().trim().slice(0, MAX_COACH_NOTE_LENGTH);
    const parsedTargetDate = parseTargetDate(target_date);

    const maxTokensByPeriod: Record<number, number> = { 1: 1000, 7: 2000, 28: 4000 };
    const maxTokens = maxTokensByPeriod[period_days] || 4000;

    const reportTypeTag = period_days === 1 ? "daily" 
                       : period_days === 7 ? "weekly" 
                       : period_days === 28 ? "monthly"
                       : "on_demand";

    const maxScreens = MAX_SCREENS_PER_REPORT[period_days] || 5;

    // ✨ v7: TODAY (dla annotacji race goals + system prompt)
    const TODAY_ISO = new Date().toISOString().split('T')[0];

    const { data: athlete, error: athErr } = await supabase
      .from("athletes")
      .select("id, coach_id, user_id, full_name, goal, target_date, race_goals, pb_marathon, pb_half, pb_10k, pb_5k, date_of_birth, klaudiusz_brief")
      .eq("id", athlete_id)
      .maybeSingle();

    if (athErr || !athlete) {
      return new Response(
        JSON.stringify({ error: "athlete not found", details: athErr?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 🔒 AUTH GUARD cd.: woła trener TEGO zawodnika albo sam zawodnik (anti-IDOR)
    if (athlete.coach_id !== caller.id && athlete.user_id !== caller.id) {
      return new Response(
        JSON.stringify({ error: "forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const periodEnd = parsedTargetDate ? new Date(parsedTargetDate) : new Date();
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - period_days);

    const periodStartIso = periodStart.toISOString().split("T")[0];
    const periodEndIso = periodEnd.toISOString().split("T")[0];

    const { data: plannedTrainings } = await supabase
      .from("trainings")
      .select("date, type, distance_km, duration_min, pace, notes")
      .eq("athlete_id", athlete_id)
      .gte("date", periodStartIso)
      .lte("date", periodEndIso)
      .order("date", { ascending: true });

    const { data: logs } = await supabase
      .from("training_logs")
      .select("id, logged_at, training_type, distance_km, duration, pace, heart_rate, feel, comment, elevation_gain, attachment_url")
      .eq("athlete_id", athlete_id)
      .gte("logged_at", periodStart.toISOString())
      .lte("logged_at", periodEnd.toISOString())
      .not("training_type", "like", "__badge__%")
      .order("logged_at", { ascending: true });

    /* ═══ RAPORT-AI+ : analityka 90 dni dla modelu — forma/monotonia/EF/wellness.
       16.08.2026: wzory przeniesione do ../_shared/reguly-treningow.mjs. Wczesniej
       stala tu wlasna EMA BEZ seeda, przez co u 10 z 23 zawodnikow raport nazywal
       stan formy inna kategoria niz wykres, ktory widzi ten sam czlowiek.
       Bramka tools/bramka-reguly.js pilnuje, zeby kopia nie wrocila. ═══ */
    let _analityka: any = null;
    try {
      const _durMin = (d: any) => { const t=String(d||'').trim(); if(!t) return 0;
        const p=t.split(':').map(Number); if(p.some(isNaN)) return 0;
        return p.length===3 ? p[0]*60+p[1]+p[2]/60 : p.length===2 ? p[0]+p[1]/60 : (+t||0); };
      const od90 = new Date(Date.now() - 90*864e5).toISOString();
      const { data: l90 } = await supabase.from("training_logs")
        .select("logged_at,training_type,duration,feel,heart_rate,gap_pace,pace,distance_km")
        .eq("athlete_id", athlete_id).gte("logged_at", od90)
        .not("training_type","like","__badge__%");
      /* `dni`/`_EFF`/`_FEEL` zdjete 16.08.2026 — dzienny TRIMP liczy teraz
         formaSeria() z ../_shared. `efPts` zostaje: to punkty do trendu EF,
         ktorego modul nie zbiera (potrzebuje HR i tempa, nie tylko czasu). */
      const efPts: { x:number, y:number }[] = [];
      const TLEN=/spokoj|wybieg|d\u0142ug|dlug|regener/, WYKL=/interwa|tempo|progres|start|wy\u015bcig|zawod|si\u0142|sil/;
      for (const l of (l90||[])) {
        const typ=String(l.training_type||'').toLowerCase().trim();
        if (TLEN.test(typ)&&!WYKL.test(typ)&&l.heart_rate>=80&&l.heart_rate<=200) {
          const m=String(l.gap_pace||l.pace||'').match(/^(\d{1,2}):(\d{2})/);
          if (m) { const sek=+m[1]*60+ +m[2];
            if (sek>=150&&sek<=720) efPts.push({ x:new Date(l.logged_at).getTime()/864e5, y:(1000/sek)/l.heart_rate*1000 }); }
        }
      }
      /* Forma z modulu — TA SAMA implementacja co wykres w aplikacji (z FORMA-SEED). */
      const _forma = formaSeria(l90 || [], { koniec: new Date(), dni: 90 });
      const dTR: number[] = _forma.seria.map((d: any) => d.trimp);
      const _ms = monotoniaIStrain(dTR);
      const efTrendPct = trendEfPct(efPts);
      let wellnessInfo: any = null;
      try {
        const odW=new Date(Date.now()-7*864e5).toISOString().slice(0,10);
        const { data: wel } = await supabase.from("wellness")
          .select("date,resting_hr,hrv,sleep_secs").eq("athlete_id",athlete_id)
          .gte("date",odW).order("date",{ascending:false});
        if (wel && wel.length) { const o=wel[0];
          wellnessInfo={ ostatni_dzien:o.date, resting_hr:o.resting_hr, hrv:o.hrv,
            sen_h:o.sleep_secs!=null?Math.round(o.sleep_secs/360)/10:null, dni_z_danymi:wel.length }; }
      } catch(_){}
      /* POROWNANIE OKRESOW: ostatnie 30 dni vs poprzednie 30 — postep zamiast samego stanu */
      const _teraz = Date.now();
      const okr = (odDni: number, doDni: number) => {
        let km = 0, minutki = 0, biegi = 0; const ef: number[] = [];
        for (const l of (l90 || [])) {
          const wiek = (_teraz - new Date(l.logged_at).getTime()) / 864e5;
          if (wiek < doDni || wiek >= odDni) continue;
          km += (+l.distance_km || 0); minutki += _durMin(l.duration); biegi++;
          const typ = String(l.training_type||'').toLowerCase().trim();
          if (TLEN.test(typ) && !WYKL.test(typ) && l.heart_rate>=80 && l.heart_rate<=200) {
            const m = String(l.gap_pace||l.pace||'').match(/^(\d{1,2}):(\d{2})/);
            if (m) { const sek=+m[1]*60+ +m[2]; if(sek>=150&&sek<=720) ef.push((1000/sek)/l.heart_rate*1000); }
          }
        }
        return { km: Math.round(km), biegi, godziny: Math.round(minutki/6)/10,
          ef_sr: ef.length ? Math.round(ef.reduce((a,b)=>a+b,0)/ef.length*100)/100 : null };
      };
      const _ost30 = okr(30, 0), _poprz30 = okr(60, 30);
      const _porownanie = {
        ostatnie_30dni: _ost30, poprzednie_30dni: _poprz30,
        zmiana_km: _ost30.km - _poprz30.km,
        zmiana_ef: (_ost30.ef_sr != null && _poprz30.ef_sr != null) ? Math.round((_ost30.ef_sr - _poprz30.ef_sr)*100)/100 : null,
        _opis: "porownaj OBA okresy w tekscie: czy km/objetosc rosnie, czy EF (ekonomia) sie poprawia. Wzrost EF = lepsza baza tlenowa. null = za malo danych."
      };

      _analityka = {
        ctl: _forma.ctl, atl: _forma.atl, tsb: _forma.tsb,
        /* ⚠️ GOTOWA INTERPRETACJA, nie sama liczba. Model nie ma zgadywac, gdzie
           lezy granica przeciazenia — `forma` niesie te sama etykiete, ktora
           czlowiek widzi pod wykresem (progi TSB_PROGI z ../_shared). */
        forma: _forma.forma,
        monotonia_7d: _ms.monotonia_7d, strain_7d: _ms.strain_7d,
        trend_ef_90d_pct: efTrendPct, biegi_tlenowe_z_hr: efPts.length,
        wellness: wellnessInfo,
        porownanie_okresow: _porownanie,   /* KROK 2: postep m/m */
        _opis: "CTL=baza dlugoterminowa, ATL=zmeczenie, TSB=swiezosc. POLE `forma` NIESIE JUZ GOTOWA OCENE (przeciazenie/obciazenie/neutralna/optimum/swiezosc) policzona tymi samymi progami co wykres w aplikacji — UZYJ JEJ, nie wymyslaj wlasnych granic. Liczby sa w minuto-wysilkach, nie w TSS, wiec nie porownuj ich z progami z innych aplikacji. monotonia>=2.0 = brak zroznicowania bodzcow (ryzyko); trend_ef dodatni = baza tlenowa rosnie; wellness null = zawodnik nie trackuje."
      };
    } catch(_) { /* analityka opcjonalna — raport dziala bez niej */ }

    // ✨ v(next): DETERMINISTYCZNE DOPASOWANIE PLAN↔LOG (fix „trenował bez planu")
    // Parowanie po dacie robimy w kodzie — AI dostaje gotowe pary, nie zadanie domowe.
    // Klucz daty = logged_at.split("T")[0] — TEN SAM string co logi[].data (spójność, KROK 0 pkt 2).
    const _norm = (t: any) => {
      const s = String(t || '').trim().toLowerCase();
      return s === 'bieg spokojny' ? 'spokojny' : s;   // jedyny alias (jak w intervals-sync)
    };
    const _dk = (l: any) => (l.logged_at ? l.logged_at.split("T")[0] : '');
    const logsByDate = new Map<string, any[]>();
    for (const l of (logs || [])) {
      const k = _dk(l);
      if (!k) continue;
      if (!logsByDate.has(k)) logsByDate.set(k, []);
      logsByDate.get(k)!.push(l);
    }
    const usedLogIds = new Set<any>();
    const dopasowania = (plannedTrainings || []).map((p: any) => {
      const dayLogs = logsByDate.get(p.date) || [];
      // preferuj log zgodnego typu; potem pierwszy niezużyty (obsługa >1 log/dzień, KROK 0 pkt 3)
      const log = dayLogs.find((l: any) => !usedLogIds.has(l.id) && _norm(l.training_type) === _norm(p.type))
               || dayLogs.find((l: any) => !usedLogIds.has(l.id));
      if (log) usedLogIds.add(log.id);
      const status = _norm(p.type) === 'odpoczynek'
        ? (log ? 'trenowal_w_dzien_wolny' : 'odpoczynek_ok')
        : !log ? 'pominiety'
        : _norm(log.training_type) === _norm(p.type) ? 'wykonany'
        : 'wykonany_inny_typ';
      return {
        data: p.date, plan_typ: p.type, plan_km: p.distance_km ?? null,
        log_typ: log?.training_type ?? null, log_km: log?.distance_km ?? null,
        log_tempo: log?.pace ?? null, status,
      };
    });
    const inicjatywy = (logs || [])
      .filter((l: any) => !usedLogIds.has(l.id))
      .map((l: any) => ({
        data: _dk(l), typ: l.training_type, km: l.distance_km ?? null,
        tempo: l.pace ?? null, status: 'bez_planu_na_ten_dzien',
      }));

    const { data: races } = await supabase
      .from("races")
      .select("date, name, distance_km, time, place")
      .eq("athlete_id", athlete_id)
      .gte("date", new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0])
      .order("date", { ascending: false })
      .limit(5);

    const cutoff90Days = new Date();
    cutoff90Days.setDate(cutoff90Days.getDate() - 90);
    const { data: coachNotes } = await supabase
      .from("coach_athlete_notes")
      .select("id, tag, note, event_date, is_resolved, created_at")
      .eq("athlete_id", athlete_id)
      .eq("is_resolved", false)
      .gte("created_at", cutoff90Days.toISOString())
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: prevReportsWithReactions } = await supabase
      .from("ai_reports")
      .select("id, generated_at, report_type, summary, athlete_feedback, athlete_reaction, content_markdown_edited")
      .eq("athlete_id", athlete_id)
      .eq("visible_to_athlete", true)
      .gte("generated_at", cutoff90Days.toISOString())
      .order("generated_at", { ascending: false })
      .limit(8);

    const chatStart = new Date(periodStart);
    chatStart.setDate(chatStart.getDate() - 14);
    const { data: chatMessages } = await supabase
      .from("messages")
      .select("sender, body, sent_at")
      .eq("athlete_id", athlete_id)
      .gte("sent_at", chatStart.toISOString())
      .lte("sent_at", periodEnd.toISOString())
      .order("sent_at", { ascending: false })
      .limit(60);

    const totalPlanned = plannedTrainings?.length || 0;
    const totalLogged = logs?.length || 0;
    /* ⚠️ TYLKO BIEGOWE. Do 16.08.2026 suma obejmowala tez `Zastepczy` — u Kasi
       dawalo to 235,4 km zamiast 201,0 (+17%), a raport przedstawil to jako
       objetosc biegowa („po prostu biegasz"). Marsz/rower ida osobnym polem,
       zeby model dalej widzial je jako obciazenie ogolne. */
    const totalDistance = sumaKmBiegowych(logs || []);
    const dystansNiebiegowy = Math.round(((logs || []).reduce((s, l) => s + (parseFloat(l.distance_km) || 0), 0) - totalDistance) * 10) / 10;
    const avgFeel = sredniaSamopoczucia(logs || [], SAMOPOCZUCIE_RAPORT, 5) || 0;

    const screenUrls: { url: string; logDate: string; logType: string; logComment: string }[] = [];
    if (logs) {
      const reversedLogs = [...logs].reverse();
      for (const log of reversedLogs) {
        if (screenUrls.length >= maxScreens) break;
        if (log.attachment_url) {
          const urls = log.attachment_url.split(",").map(u => u.trim()).filter(Boolean);
          for (const url of urls) {
            if (screenUrls.length >= maxScreens) break;
            if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url)) {
              screenUrls.push({
                url,
                logDate: log.logged_at?.split("T")[0] || "",
                logType: log.training_type || "",
                logComment: log.comment || "",
              });
            }
          }
        }
      }
    }

    const imageMessages: any[] = [];
    let screensIncluded = 0;
    for (const screen of screenUrls) {
      const img = await fetchImageAsBase64(screen.url);
      if (img) {
        imageMessages.push({
          type: "image",
          source: {
            type: "base64",
            media_type: img.mediaType,
            data: img.data,
          },
        });
        imageMessages.push({
          type: "text",
          text: `^ Screen z dnia ${screen.logDate} (typ: ${screen.logType}${screen.logComment ? `, komentarz zawodnika: "${screen.logComment}"` : ""}).

CO WYCIĄGNĄĆ Z TEGO SCREENA (CZYTAJ LICZBY, NIE MAPKĘ):
1. **Splits per km** — czy tempo było równe czy rozsypane? Czy końcówka zwolniła?
2. **Średnie HR + max HR** — w jakiej strefie był? Czy odpowiada deklarowanemu typowi?
3. **HR vs pace** — czy dla danego tempa HR jest typowy/wysoki/niski? (drift = przemęczenie)
4. **Strefy tętna** (jeśli widać podział na strefy) — ile czasu w 1/2/3/4/5?
5. **Cadence** (kadencja) — jeśli widoczna, czy jest >170?
6. **Elevation** — czy są podbiegi/zbiegi które tłumaczą HR drift?
7. **Power** (jeśli widoczny) — czy wartości są stabilne?
8. **GAP / NGP** — Grade Adjusted Pace, jeśli widoczny

WERDYKT do raportu:
- "ZA LEKKO" jeśli HR znacznie poniżej oczekiwanej strefy dla typu (np. spokojny ale HR<120, interwały ale HR<155)
- "ODPOWIEDNIO" jeśli HR i pace mieszczą się w docelowych strefach typu treningu
- "ZA MOCNO" jeśli HR przekracza górną granicę strefy + pace szybsze niż docelowe (ryzyko przeciążenia)
- "ROZSYPANE" jeśli pierwsza połowa była w strefie, druga z dramatycznym driftem`,
        });
        screensIncluded++;
      }
    }

    let coachScreensIncluded = 0;
    if (Array.isArray(coach_attachments) && coach_attachments.length > 0) {
      const coachAttachmentsTrimmed = coach_attachments.slice(0, 3);
      for (let idx = 0; idx < coachAttachmentsTrimmed.length; idx++) {
        const url = coachAttachmentsTrimmed[idx];
        if (typeof url !== 'string' || !url.startsWith('http')) continue;
        const img = await fetchImageAsBase64(url);
        if (img) {
          imageMessages.push({
            type: "image",
            source: {
              type: "base64",
              media_type: img.mediaType,
              data: img.data,
            },
          });
          imageMessages.push({
            type: "text",
            text: `^ Screen #${idx + 1} OD TRENERA (Filip wrzucił go specjalnie do tego raportu).

KRYTYCZNE: To NIE jest screen zawodnika z aplikacji — to coś co TRENER chce żebyś zobaczył jako kontekst raportu. Może być:
- Wiadomość z Messengera od zawodnika (kontuzje, samopoczucie, plany)
- Screen z Stravy/Garmin którego zawodnik nie wgrał do BiegaMy
- Wyniki badań krwi / test laktatu / VO2max
- Screen z reakcjami społeczności / komentarzami
- Cokolwiek innego co trener uznał za ważne

DZIAŁANIE:
1. Przeczytaj UWAŻNIE co jest na screenie
2. Jeśli to dane treningowe — wyciągnij liczby (pace, HR, dystans, splity)
3. Jeśli to wiadomość/komunikacja — wyciągnij sentyment i konkrety
4. W RAPORCIE obowiązkowo odwołaj się do tego screenu — pokaż trenerowi że widziałeś co mu zależało żebyś zobaczył
5. Dostosuj rekomendacje do informacji ze screenu

To MA PRIORYTET nad screenami z logów — trener wybrał to celowo.`,
          });
          coachScreensIncluded++;
        }
      }
    }
    if (coachScreensIncluded > 0) {
      console.log(`Coach screens included: ${coachScreensIncluded}`);
    }

    const styleExamples = await fetchCoachStyleExamples(supabase, athlete_id, COACH_STYLE_EXAMPLES_LIMIT);
    const coachStyleSection = formatCoachStyleSection(styleExamples);
    console.log(`Coach style examples used: ${styleExamples.length}`);

    const coachNoteSection = formatCoachNoteSection(sanitizedCoachNote);
    if (sanitizedCoachNote) {
      console.log(`Coach note included (${sanitizedCoachNote.length} chars)`);
    }
    if (parsedTargetDate) {
      console.log(`Target date specified: ${parsedTargetDate.toISOString().split('T')[0]}`);
    }

    const klaudiuszBriefSection = formatKlaudiuszBriefSection(athlete.klaudiusz_brief || '');
    if (athlete.klaudiusz_brief) {
      console.log(`🌟 Klaudiusz brief included (${athlete.klaudiusz_brief.length} chars)`);
    }
    
    let persistentNotesSection = "";
    if (coachNotes && coachNotes.length > 0) {
      const tagLabels: Record<string, string> = {
        'start': '🏁 STARTY',
        'cel': '🎯 CELE',
        'kontuzja': '🩹 KONTUZJE / OGRANICZENIA',
        'samopoczucie': '😴 SAMOPOCZUCIE / ENERGIA',
        'zycie': '🏠 SYTUACJA ŻYCIOWA',
        'strategia': '♟️ STRATEGIA DŁUGOFALOWA',
        'inne': '📌 INNE',
      };
      
      const byTag: Record<string, any[]> = {};
      for (const n of coachNotes) {
        const tag = n.tag || 'inne';
        if (!byTag[tag]) byTag[tag] = [];
        byTag[tag].push(n);
      }
      
      let groupedText = '';
      const tagOrder = ['start', 'kontuzja', 'cel', 'samopoczucie', 'zycie', 'strategia', 'inne'];
      for (const tag of tagOrder) {
        if (!byTag[tag] || byTag[tag].length === 0) continue;
        groupedText += `\n${tagLabels[tag] || tag.toUpperCase()}:\n`;
        groupedText += byTag[tag].map((n: any) => {
          const created = new Date(n.created_at).toISOString().slice(0, 10);
          const eventStr = n.event_date ? ` (event: ${n.event_date})` : '';
          return `  • [${created}${eventStr}] ${n.note}`;
        }).join('\n');
      }
      
      persistentNotesSection = `

═══════════════════════════════════════════════════════
📝 NOTATKI TRENERA O TYM ZAWODNIKU — TRWAŁY KONTEKST
═══════════════════════════════════════════════════════

Trener prowadzi prywatny notatnik o tym zawodniku. Notatki nie są widoczne dla zawodnika — to tylko dla trenera i dla Ciebie. Zawierają informacje, które trener zauważył lub które zawodnik rzucił mimochodem: planowane starty, kontuzje, ważne sytuacje życiowe.

⚠️ JAK WYKORZYSTAĆ:
- Wpleć kontekst NATURALNIE w analizę, nie cytuj wprost.
- Tag "kontuzja" / "samopoczucie" → możesz odwołać się w analizie obciążenia.
- Tag "start" → uwzględnij w przyszłej trajektorii.
- Tag "cel" / "strategia" → wbuduj w rekomendacje.
- Tag "zycie" → kontekst dla niskich tygodni / opuszczonych treningów.

⛔ NIE pisz "trener mi powiedział że..." — pisz tak, jakbyś sam wiedział.
${groupedText}

═══════════════════════════════════════════════════════
`;
      console.log(`📝 Coach notes loaded: ${coachNotes.length}`);
    }

    let learningLoopSection = "";
    const learningSignals: string[] = [];
    
    const reactedReports = (prevReportsWithReactions || []).filter((r: any) => 
      r.athlete_reaction || r.athlete_feedback
    );
    if (reactedReports.length > 0) {
      const reactText = reactedReports.slice(0, 5).map((r: any) => {
        const reactEmoji = r.athlete_reaction === 'thumbs_up' ? '👍'
          : r.athlete_reaction === 'thumbs_down' ? '👎'
          : r.athlete_reaction === 'love' ? '❤️' : '';
        const fbStr = r.athlete_feedback ? `\n     💬 "${r.athlete_feedback.substring(0, 200)}"` : '';
        return `   • [${r.generated_at?.slice(0, 10) || '?'}] ${r.report_type}: ${reactEmoji} ${r.athlete_reaction || 'brak reakcji'}${fbStr}`;
      }).join("\n");
      learningSignals.push(`🎯 REAKCJE ZAWODNIKA NA POPRZEDNIE RAPORTY:
${reactText}

⚠️ Jeśli ostatni raport dostał 👎 — w tym raporcie ZMIEŃ TON. Przeczytaj feedback i dostosuj. Jeśli 👍 — kontynuuj styl.`);
    }
    
    const editedReports = (prevReportsWithReactions || []).filter((r: any) => r.content_markdown_edited);
    if (editedReports.length > 0) {
      learningSignals.push(`🖋️ TRENER EDYTOWAŁ ${editedReports.length} z ostatnich raportów — Twoje wcześniejsze wersje WYMAGAŁY poprawek. Naśladuj styl edycji (już masz w sekcji STYL TRENERA).`);
    }
    
    if (logs && logs.length >= 3) {
      const feelLogs = logs.filter((l: any) => l.feel);
      if (feelLogs.length >= 3) {
        /* ⚠️ INNA SKALA NIZ `avgFeel` powyzej (1..4 vs 3..9) — celowo, bo sluzy
           doborowi tonu, nie liczbie w raporcie. Ujednolicenie zmieniloby tresc
           raportow, wiec jest osobna decyzja.
           ⚠️ ZMIERZONE 16.08.2026: `great` nie wystepuje w danych (0 logow), wiec
           maksimum tej skali to 3,0 i prog `avg >= 3.5` nizej jest NIEOSIAGALNY —
           galaz „czuje sie SWIETNIE" nie odpalila ani razu. Nie ruszam progu:
           to zmienia tresc raportow i czeka na decyzje. */
        const feelScore = (f: string) => SAMOPOCZUCIE_TON[f] ?? 2;
        const avg = feelLogs.reduce((s: number, l: any) => s + feelScore(l.feel), 0) / feelLogs.length;
        let trendNote = '';
        if (avg >= 3.5) trendNote = '🟢 zawodnik czuje się ŚWIETNIE — chwal i delikatnie pcham do progresu';
        else if (avg <= 1.8) trendNote = '🔴 zawodnik czuje się ŹLE — ton współczujący, sugeruj odpoczynek/deload';
        else if (avg >= 2.5) trendNote = '🟡 zawodnik czuje się przeciętnie — zachęcaj, daj wsparcie';
        else trendNote = '🟠 zawodnik czuje się słabo — ostrożność, mniej presji';
        learningSignals.push(`📊 TRENDLINE SAMOPOCZUCIA: ${trendNote} (avg ${avg.toFixed(1)}/4, ${feelLogs.length} próbek w okresie raportu)`);
      }
    }

    if (chatMessages && chatMessages.length > 0) {
      const chatText = chatMessages.slice(0, 25).map((m: any) => {
        const date = m.sent_at?.slice(0, 10) || '?';
        const time = m.sent_at?.slice(11, 16) || '';
        const who = m.sender === 'athlete' ? '🏃 ZAWODNIK' : '👤 TRENER';
        const bodyText = (m.body || '').substring(0, 200);
        return `   [${date} ${time}] ${who}: "${bodyText}"`;
      }).reverse().join("\n");
      
      learningSignals.push(`💬 CZAT TRENER-ZAWODNIK (${chatMessages.length} wiadomości w okresie raportu + 14 dni wcześniej):
${chatText}

⚠️ KRYTYCZNE: Wyłapuj sygnały z czatu:
- Kontuzje / bóle ("boli kolano", "rozbity", "ciężko") → wspomnij w raporcie z empatią
- Planowane starty ("biegnę w niedzielę") → cytuj jeśli pasuje do okresu raportu
- Sytuacja życiowa ("praca", "wyjazd", "noce") → uwzględnij dlaczego treningi nie wyszły
- Emocje ("brak motywacji", "frustracja") → adresuj w sekcji wsparcia
- Sukcesy ("super dziś było") → pochwal konkretnie cytując

✅ Cytuj wprost z czatu w raporcie: "5 maja napisałeś że bolało kolano - widać że ostrożnie do tego podchodzisz"
⛔ NIE cytuj WSZYSTKIEGO - wybierz 2-3 najważniejsze cytaty które tłumaczą diagnozę`);
    }
    
    if (learningSignals.length > 0) {
      learningLoopSection = `

═══════════════════════════════════════════════════════
🔄 CYKL UCZENIA — JAK ZAWODNIK REAGUJE I SIĘ CZUJE
═══════════════════════════════════════════════════════

${learningSignals.join("\n\n")}

⛔ Jeśli zignorujesz te sygnały, raport będzie odbierany jako "skopiowany" / "nie pasuje do mnie".
✅ Jeśli wykorzystasz, zawodnik czuje że trener i Ty go ROZUMIECIE.

═══════════════════════════════════════════════════════
`;
      console.log(`🔄 Learning loop signals: ${learningSignals.length}`);
    }

    // ✨ v7: Annotacja race_goals z _status (ZAKOŃCZONY/PLANOWANY) + _dni_offset
    const annotatedRaceGoals = annotateRaceGoals(athlete.race_goals, TODAY_ISO);
    const racesAnnotated = (races || []).map((r: any) => {
      const date = r.date || null;
      const daysOffset = date 
        ? Math.floor((new Date(date + 'T12:00:00Z').getTime() - new Date(TODAY_ISO + 'T12:00:00Z').getTime()) / 86400000)
        : null;
      return {
        ...r,
        _status: "ZAKOŃCZONY (PRZESZŁOŚĆ)",
        _dni_offset: daysOffset,
        _dni_temu: daysOffset !== null ? Math.abs(daysOffset) : null,
      };
    });

    const context = {
      // ✨ v7: KONTEKST CZASOWY — od razu na górze JSON, jak najbardziej widoczne
      _kontekst_czasowy: {
        dzisiaj: TODAY_ISO,
        okres_od: periodStartIso,
        okres_do: periodEndIso,
        period_days,
      },
      zawodnik: {
        imie: athlete.full_name,
        cel: athlete.goal,
        data_celu: athlete.target_date,
        // ✨ v7: race_goals z _status oznaczonym
        starty_planowane: annotatedRaceGoals,
        zyciowki: {
          maraton: athlete.pb_marathon,
          polmaraton: athlete.pb_half,
          "10km": athlete.pb_10k,
          "5km": athlete.pb_5k,
        },
        wiek: athlete.date_of_birth ? Math.floor((Date.now() - new Date(athlete.date_of_birth).getTime()) / (365.25 * 86400000)) : null,
      },
      okres: {
        od: periodStartIso,
        do: periodEndIso,
        dni: period_days,
        typ: reportTypeTag,
        target_date: parsedTargetDate ? parsedTargetDate.toISOString().split("T")[0] : null,
      },
      podsumowanie: {
        treningi_zaplanowane: totalPlanned,
        treningi_wykonane: totalLogged,
        skutecznosc_procent: totalPlanned > 0 ? Math.round((totalLogged / totalPlanned) * 100) : null,
        laczny_dystans_km: Math.round(totalDistance * 10) / 10,
        srednie_samopoczucie: avgFeel ? Math.round(avgFeel * 10) / 10 : null,
        screenow_dolaczonych: screensIncluded,
      },
      plan: (plannedTrainings || []).map(t => ({
        data: t.date, typ: t.type, dystans_km: t.distance_km,
        czas_min: t.duration_min, tempo: t.pace, notatki: t.notes,
      })),
      logi: (logs || []).map(l => ({
        data: l.logged_at?.split("T")[0],
        typ: l.training_type, dystans_km: l.distance_km, czas: l.duration,
        tempo: l.pace, tetno: l.heart_rate, samopoczucie: l.feel,
        przewyzszenie_m: l.elevation_gain, komentarz: l.comment,
        ma_screen: !!l.attachment_url,
      })),
      dopasowania_plan_log: dopasowania,   // ✨ policzone w kodzie — źródło prawdy (fix „bez planu")
      inicjatywy_bez_planu: inicjatywy,
      // ✨ v7: starty_ostatnie z _dni_temu (zawsze PRZESZŁOŚĆ — sprawdzone przez .gte filter)
      starty_ostatnie: racesAnnotated.map((r: any) => ({
        data: r.date, nazwa: r.name, dystans_km: r.distance_km, 
        czas: r.time, miejsce: r.place,
        _status: r._status, _dni_temu: r._dni_temu,
      })),
      analityka: _analityka,   /* RAPORT-AI+ */
    };

    // ✨ v7: System prompt z TODAY i okresem
    const systemPrompt = getSystemPrompt(period_days, TODAY_ISO, periodStartIso, periodEndIso) 
      + coachStyleSection 
      + klaudiuszBriefSection 
      + persistentNotesSection 
      + learningLoopSection 
      + coachNoteSection;
    
    const userContent: any[] = [
      {
        type: "text",
        text: `Zrób raport ${reportTypeTag === "daily" ? "dzienny" : reportTypeTag === "weekly" ? "tygodniowy" : "miesięczny"} dla zawodnika.

🗓️ PRZYPOMNIENIE: DZISIAJ JEST ${TODAY_ISO}. Raport pokrywa okres ${periodStartIso} → ${periodEndIso}. Sprawdź _status każdego wyścigu przed wzmianką.

DANE ZAWODNIKA I TRENINGÓW (JSON):
${JSON.stringify(context, null, 2)}

${screensIncluded > 0 ? `\nPoniżej dołączam ${screensIncluded} screen(ów) z aplikacji biegowych — przeanalizuj je i włącz wnioski w raport:\n` : ""}`,
      },
      ...imageMessages,
    ];

    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          { role: "user", content: userContent }
        ],
      }),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      console.error("Anthropic error:", anthropicResp.status, errText);
      return new Response(
        JSON.stringify({ error: "Anthropic API failed", status: anthropicResp.status, details: errText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anthropicData = await anthropicResp.json();
    let reportMarkdown = anthropicData.content?.[0]?.text || "";

    if (!reportMarkdown) {
      return new Response(
        JSON.stringify({ error: "Empty response from Anthropic", raw: anthropicData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🛡️ POST-VALIDATOR: wykrywa zakazane frazy i regeneruje raport
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const violations: string[] = [];
    
    // 1) "bez planu" / "z własnej inicjatywy" gdy plan > 0
    if (totalPlanned > 0) {
      const forbiddenNoPlan = [
        /bez\s+(konkretnego\s+)?planu/i,
        /z\s+własnej\s+inicjatywy/i,
        /z\s+własnej\s+woli/i,
        /inicjatyw[ay]\s+zawodnika/i,
        /trening\s+na\s+własną\s+rękę/i,
        /biegałeś\s+co\s+(popadło|chciałeś)/i,
        /bez\s+struktury/i,
        /samodzielnie\s+(zaplanowane|trenowałeś)/i,
        /na\s+dziś\s+nic\s+nie\s+było\s+(zaplanowane|planowane)/i,
      ];
      for (const rx of forbiddenNoPlan) {
        if (rx.test(reportMarkdown)) {
          violations.push(`Mówi "bez planu" gdy plan ma ${totalPlanned} treningów: "${reportMarkdown.match(rx)?.[0]}"`);
          break;
        }
      }
    }
    
    // 2) 3. osoba o trenerze (Filip Ci..., Twój trener..., trener Filip...)
    const thirdPerson = [
      /\bFilip\s+(Ci|Tobie|ułoży|napisze|przygotuje|dał|da|zerknie|zerknij|wyśle|opisze)/i,
      /\bTwój\s+trener\b/i,
      /\btrener\s+Filip\b/i,
      /\btrenera\s+Filipa\b/i,
    ];
    for (const rx of thirdPerson) {
      if (rx.test(reportMarkdown)) {
        violations.push(`Pisze w 3. osobie o Filipie: "${reportMarkdown.match(rx)?.[0]}"`);
        break;
      }
    }

    // ✨ v7: 3) Gafy czasowe — wyścig już był, AI pisze o "przygotowaniach"
    // Sprawdź jeśli zawodnik miał wyścig w okresie raportu (past) LUB ostatnie 30 dni
    const recentPastRaces = [
      ...racesAnnotated.filter((r: any) => r._dni_offset !== null && r._dni_offset >= -30 && r._dni_offset <= 0),
      ...annotatedRaceGoals.filter((g: any) => g._status === "ZAKOŃCZONY (PRZESZŁOŚĆ)" && g._dni_offset !== null && g._dni_offset >= -30),
    ];
    
    if (recentPastRaces.length > 0) {
      const futurePrep = [
        /przygotuj(esz)?\s+si[ęe]\s+do/i,
        /szlif(uj|owanie|uje)\s+form/i,
        /taper(ing|owanie)?\s+przed/i,
        /(jutrzejszy|nadchodz[ąa]cy|zbli[żz]aj[ąa]cy\s+si[ęe])\s+(start|wy[śs]cig|maraton|p[óo]\u0142maraton)/i,
        /Tw[óo]j\s+(nadchodz[ąa]cy|przysz[ł\u0142]y|kolejny)\s+(start|wy[śs]cig|maraton|p[óo]\u0142maraton)/i,
        /przed\s+startem\s+(b[ęe]dziesz|musisz|trzeba)/i,
      ];
      
      for (const rx of futurePrep) {
        if (rx.test(reportMarkdown)) {
          const matched = reportMarkdown.match(rx)?.[0];
          const raceInfo = recentPastRaces[0];
          const raceName = raceInfo.name || raceInfo.race_name || raceInfo.race_type || 'wyścig';
          const raceDate = raceInfo.date || raceInfo.race_date || raceInfo.target_date;
          violations.push(`GAFA CZASOWA — pisze o "przygotowaniach" do wyścigu który JUŻ MIAŁ MIEJSCE (${raceName}, ${raceDate}, ${Math.abs(raceInfo._dni_offset || raceInfo._dni_temu || 0)} dni temu): "${matched}"`);
          break;
        }
      }
    }

    if (violations.length > 0 && reportMarkdown.length > 100) {
      console.log(`🛡️ Post-validator: ${violations.length} naruszeń, regeneruję raport`);
      console.log(`   ${violations.join("\n   ")}`);
      
      const fixPrompt = `Twój poprzedni raport zawiera BŁĘDY które musisz poprawić:

${violations.map((v, i) => `${i+1}. ${v}`).join("\n")}

KRYTYCZNE ZASADY które naruszyłeś:
- DZISIAJ JEST ${TODAY_ISO}. Raport pokrywa okres ${periodStartIso} → ${periodEndIso}.
- Zawodnik MA plan (${totalPlanned} zaplanowanych treningów) — NIE PISZ "bez planu" ani "z własnej inicjatywy"
- Ty JESTEŚ Filipem — pisz w 1. osobie ("napiszę", "ułożę"), NIE "Filip Ci napisze" ani "Twój trener"
- Sprawdź _status każdego wyścigu PRZED napisaniem o nim. Jeśli ZAKOŃCZONY (PRZESZŁOŚĆ) → pisz w przeszłym czasie ("po X", "X poszło", "wynik na X"), NIE "przygotuj się do X" ani "Twój nadchodzący X".

${recentPastRaces.length > 0 ? `WYŚCIGI Z OSTATNICH 30 DNI (ZAKOŃCZONE — pisz w przeszłym czasie):
${recentPastRaces.map((r: any) => {
  const name = r.name || r.race_name || r.race_type || '?';
  const date = r.date || r.race_date || r.target_date || '?';
  const ago = Math.abs(r._dni_offset || r._dni_temu || 0);
  return `- ${name} (${date}, ${ago} dni temu)`;
}).join('\n')}` : ''}

Przepisz raport ponownie, zachowując treść i strukturę, ale BEZ tych błędów. Tylko poprawiony tekst, nic więcej.

Oryginalny raport:
---
${reportMarkdown}
---`;

      const fixResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "",
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: period_days === 1 ? 1000 : period_days <= 7 ? 2000 : 4000,
          messages: [{ role: "user", content: fixPrompt }],
        }),
      });

      if (fixResp.ok) {
        const fixData = await fixResp.json();
        const fixedReport = fixData.content?.[0]?.text || "";
        if (fixedReport && fixedReport.length > 100) {
          reportMarkdown = fixedReport;
          console.log(`✅ Raport poprawiony pomyślnie`);
        }
      }
    }

    let priority = "green";
    const priorityMatchPL = reportMarkdown.match(/PRIORYTET:\s*(zielony|żółty|czerwony)/i);
    if (priorityMatchPL) {
      const polMap: Record<string, string> = { 'zielony': 'green', 'żółty': 'yellow', 'czerwony': 'red' };
      priority = polMap[priorityMatchPL[1].toLowerCase()] || 'green';
    } else {
      const priorityMatchEN = reportMarkdown.match(/PRIORITY:\s*(green|yellow|red)/i);
      if (priorityMatchEN) priority = priorityMatchEN[1].toLowerCase();
    }

    let summary = null;
    const tldrMatch = period_days === 1
      ? reportMarkdown.match(/##\s*Co dzisiaj\s*\n+([^\n#]+)/)
      : reportMarkdown.match(/##\s*(?:Wstęp|TL;DR)\s*\n+([^\n#]+)/);
    if (tldrMatch) summary = tldrMatch[1].trim().substring(0, 300);

    const { data: insertData, error: insertErr } = await supabase
      .from("ai_reports")
      .insert({
        athlete_id,
        period_start: periodStartIso,
        period_end: periodEndIso,
        report_type: reportTypeTag,
        priority,
        content_markdown: reportMarkdown,
        /* Wersja metryk formy — patrz ai_reports.metryka_wersja. NULL na starych
           wierszach znaczy „liczone naiwna EMA bez seeda"; raporty.html mowi o tym
           czytelnikowi, zeby nie porownywal ich z wykresem jak rowne z rownym. */
        metryka_wersja: METRYKA_WERSJA,
        summary,
        raw_data_snapshot: { 
          ...context, 
          screens_analyzed: screensIncluded,
          coach_style_examples_used: styleExamples.length,
          coach_note: sanitizedCoachNote || null,
          target_date: parsedTargetDate ? parsedTargetDate.toISOString().split("T")[0] : null,
          klaudiusz_brief_used: !!athlete.klaudiusz_brief,
          today_iso: TODAY_ISO, // ✨ v7: audit
        },
      })
      .select("id, generated_at")
      .single();

    if (insertErr) {
      return new Response(
        JSON.stringify({ error: "Failed to save report", details: insertErr.message, report: reportMarkdown }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        report_id: insertData.id,
        generated_at: insertData.generated_at,
        report_type: reportTypeTag,
        priority,
        summary,
        screens_analyzed: screensIncluded,
        coach_style_examples_used: styleExamples.length,
        coach_note_included: !!sanitizedCoachNote,
        klaudiusz_brief_included: !!athlete.klaudiusz_brief,
        target_date_used: parsedTargetDate ? parsedTargetDate.toISOString().split("T")[0] : null,
        today_iso: TODAY_ISO, // ✨ v7
        markdown: reportMarkdown,
        usage: {
          input_tokens: anthropicData.usage?.input_tokens,
          output_tokens: anthropicData.usage?.output_tokens,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("generate-athlete-report error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});