// ŁAWKA BAZY WIEDZY (Filip 3.11, pkt 5): pary „to samo pytanie innymi słowami” muszą trafiać w ten sam wpis, a pytania podobne, lecz inne, nie mogą.
// PARY: [intencja, pytanie we wpisie, to samo innymi słowami]. Reguły synonimów stroiliśmy na nich, więc 100 % tutaj nie mówi nic o nowych pytaniach.
// PIERWSZY_POMIAR: pary napisane PRZED strojeniem i nigdy do niego nieużyte; ich wynik to uczciwa miara czułości i jest tylko wypisywany, nie wymagany.
'use strict';

const PARY = [
  ['porada', 'jak zacząć biegać', 'od czego zacząć bieganie'],
  ['porada', 'jak często biegać na początku', 'ile razy w tygodniu biegać na początku'],
  ['porada', 'jak poprawić tempo na 10 km', 'jak poprawić tempo na dychę'],
  ['porada', 'ile powinno trwać długie wybieganie przed maratonem', 'jak długi powinien być long run przed maratonem'],
  ['porada', 'jak się rozgrzać przed biegiem', 'jak zrobić rozgrzewkę przed bieganiem'],
  ['porada', 'co to są interwały', 'na czym polegają interwały'],
  ['porada', 'czy biegać codziennie', 'czy można biegać każdego dnia'],
  ['porada', 'jak biegać w upale', 'bieganie podczas upałów'],
  ['porada', 'jak oddychać podczas biegu', 'jak prawidłowo oddychać w trakcie biegania'],
  ['porada', 'ile odpoczynku po maratonie', 'ile regeneracji po maratonie'],
  ['porada', 'jak uniknąć kolki', 'co zrobić żeby nie mieć kolki'],
  ['porada', 'jak zbudować bazę tlenową', 'jak budować bazę tlenową'],
  ['porada', 'czy lepiej biegać rano czy wieczorem', 'rano czy wieczorem bieganie co lepsze'],
  ['zywienie', 'co jeść przed długim wybieganiem', 'jaki posiłek przed długim biegiem'],
  ['zywienie', 'co zjeść po treningu', 'jaki posiłek po bieganiu'],
  ['zywienie', 'ile pić w czasie maratonu', 'ile wody na maraton'],
  ['zywienie', 'ile żeli na maraton', 'ile żeli wziąć na maraton'],
  ['zywienie', 'czy biegać na czczo', 'czy można biegać bez śniadania'],
  ['zywienie', 'ile białka dziennie dla biegacza', 'ile białka na dzień dla biegacza'],
  ['zywienie', 'czy kawa przed startem', 'czy pić kawę przed zawodami'],
  ['zywienie', 'jak schudnąć bieganiem', 'jak biegać żeby schudnąć'],
  ['sprzet', 'jakie buty na asfalt', 'jakie obuwie do biegania po asfalcie'],
  ['sprzet', 'jakie buty dla początkującego', 'buty do biegania dla początkujących'],
  ['sprzet', 'co ubrać na bieganie zimą', 'w co się ubrać do biegania w zimie'],
  ['sprzet', 'jak często wymieniać buty', 'po ilu kilometrach wymienić buty'],
  ['sprzet', 'jaki zegarek do biegania', 'polecasz jakiś zegarek dla biegacza'],
  ['fakt', 'ile kilometrów ma maraton', 'jaki dystans ma maraton'],
  ['fakt', 'jaki jest rekord świata w maratonie', 'rekord świata maraton'],
  ['fakt', 'kto wygrał maraton w Berlinie', 'kto był zwycięzcą maratonu w Berlinie'],
  ['fakt', 'co to jest VO2max', 'czym jest vo2max'],
];

const PIERWSZY_POMIAR = [
  ['porada', 'jak przygotować się do pierwszego maratonu', 'pierwszy maraton jak się przygotować'],
  ['porada', 'ile kilometrów tygodniowo przed półmaratonem', 'jaki kilometraż tygodniowy przed półmaratonem'],
  ['porada', 'jak biegać pod górę', 'technika biegu pod górkę'],
  ['zywienie', 'co jeść w dniu maratonu', 'jakie śniadanie przed maratonem'],
  ['zywienie', 'ile kalorii spala bieganie', 'ile kcal spalam biegając'],
  ['sprzet', 'jakie słuchawki do biegania', 'polecane słuchawki dla biegaczy'],
  ['sprzet', 'czy warto kupić pas do biegania', 'czy pas biegowy ma sens'],
  ['fakt', 'kiedy powstał maraton', 'od kiedy biega się maratony'],
  ['porada', 'jak zwiększać kilometraż', 'jak bezpiecznie podnosić kilometraż'],
  ['porada', 'czy biegać po deszczu', 'czy można biegać kiedy pada'],
  ['zywienie', 'czy magnez pomaga biegaczom', 'czy biegacz powinien brać magnez'],
  ['porada', 'jak długo biegać na początek', 'ile minut biegać na początku'],
];

/* podobne, ale INNE: złe trafienie jest gorsze niż wyszukanie */
const INNE = [
  ['ile kcal ma banan', 'ile kcal ma jabłko'],
  ['tempo na 10 km', 'tempo na 5 km'],
  ['jak poprawić tempo na 10 km', 'jak poprawić tempo na półmaraton'],
  ['co jeść przed treningiem', 'co jeść po treningu'],
  ['czy biegać rano', 'czy biegać wieczorem'],
  ['jakie buty na asfalt', 'jakie buty do lasu'],
  ['ile żeli na maraton', 'ile żeli na półmaraton'],
  ['kto wygrał maraton w Berlinie', 'kto wygrał maraton w Poznaniu'],
  ['ile kosztują buty do biegania', 'jakie buty do biegania'],
  ['rekord świata w maratonie 2025', 'rekord świata w maratonie 2026'],
  ['jak biegać w upale', 'jak biegać zimą'],
  ['jak długo odpoczywać po maratonie', 'jak długo odpoczywać po półmaratonie'],
  ['ile białka dziennie', 'ile węglowodanów dziennie'],
  ['co to są interwały', 'jak robić interwały'],
  ['czy biegać na czczo', 'czy biegać po jedzeniu'],
];

/* ceny i terminy: nigdy „wieczna” */
const NIETRWALE = ['ile kosztują buty do biegania', 'kiedy są zapisy na maraton warszawski', 'jaki jest termin maratonu w Poznaniu', 'cena zegarka Garmin', 'wpisowe na półmaraton', 'jakie buty kupić w 2026', 'najnowsze modele butów', 'kiedy najlepiej wymienić buty'];
const TRWALE = ['jak zacząć biegać', 'co jeść przed długim wybieganiem', 'jak często biegać na początku'];

/* ŚWIEŻE: dopisane 4.11 PRZED ostatnimi poprawkami reguł i zmierzone raz; po tym pomiarze nie stroimy pod nie. PIERWSZY_POMIAR to 12 par z pierwszego pomiaru (1/12), już widzianych przy poprawkach. */
const POZA_STROJENIEM = [
  ['porada', 'jak poprawić tempo na 5 km', 'jak szybciej biegać piątkę'],
  ['porada', 'ile powinien trwać tapering przed maratonem', 'jak długi tapering przed maratonem'],
  ['porada', 'jak biegać w nocy', 'bieganie po zmroku jak się przygotować'],
  ['porada', 'ile dni przerwy po półmaratonie', 'jak długa przerwa po półmaratonie'],
  ['porada', 'czy rozciągać się przed bieganiem', 'czy trzeba się rozciągać przed biegiem'],
  ['porada', 'jak ćwiczyć siłę biegową', 'ćwiczenia siłowe dla biegaczy'],
  ['porada', 'co to jest bieg ciągły', 'na czym polega bieg ciągły'],
  ['porada', 'jak utrzymać motywację do biegania', 'skąd brać motywację do biegania'],
  ['porada', 'jak rozłożyć tempo w maratonie', 'jakie tempo na kolejne kilometry maratonu'],
  ['porada', 'czy mogę biegać dwa razy dziennie', 'czy bieganie 2 razy dziennie ma sens'],
  ['zywienie', 'co pić podczas długiego biegu', 'jakie napoje na długie wybieganie'],
  ['zywienie', 'ile węglowodanów przed maratonem', 'jak ładować węglowodany przed maratonem'],
  ['zywienie', 'czy piwo po biegu szkodzi', 'czy można wypić piwo po treningu'],
  ['zywienie', 'ile wody pić dziennie', 'jak dużo wody dziennie powinienem pić'],
  ['zywienie', 'co zjeść na śniadanie przed startem', 'jakie śniadanie w dniu zawodów'],
  ['sprzet', 'jakie buty na trail', 'obuwie do biegania w terenie'],
  ['sprzet', 'czy warto kupić zegarek z GPS', 'czy zegarek GPS ma sens'],
  ['sprzet', 'jaka czołówka do biegania nocą', 'polecana latarka czołowa dla biegacza'],
  ['sprzet', 'czy skarpety kompresyjne pomagają', 'czy warto biegać w skarpetach kompresyjnych'],
  ['fakt', 'ile metrów ma maraton', 'jaka jest długość maratonu w metrach'],
  ['fakt', 'co oznacza skrót VDOT', 'co to jest VDOT'],
  ['porada', 'jak biegać szybciej na dychę', 'jak poprawić czas na 10 km'],
];
module.exports = { PARY, PIERWSZY_POMIAR, POZA_STROJENIEM, INNE, NIETRWALE, TRWALE };
