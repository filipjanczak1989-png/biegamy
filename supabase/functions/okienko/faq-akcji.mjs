// FAQ AKCJI (Filip 4.11): stałe zdania, 0 tokenów, bez modelu i sieci. Przed startem te same pytania dostają zagadkę, bo akcja jest tajna (router.mjs). Wyjątek: `zawsze`, zdania bez akcji w treści.
// Pytania o licznik i cel wyprawy zostają w routerze (rodzaj km i wyprawa): licznik jest żywy, a cel wyprawy tajny do mety.
// Wzorce działają na tekście po T.normalizuj (małe litery, bez polskich znaków).
export const KONTAKT_MEDIA = "biegamy.run@gmail.com";   // Filip poda kontakt dla mediów; do tego czasu adres z polityki prywatności

export const FAQ = [
  { nr: 1, p: "Jak dołączyć do akcji?", o: "Załóż konto w BiegaMy i zapisuj treningi. Każdy kilometr biegu i spaceru od 7.11 liczy się sam, nic nie trzeba włączać.", w: [/^jak (sie )?(moge |mozna )?dolacz\w*( do (akcji|was|wami|biegu))?$/, /^jak wziac udzial( w akcji)?$/] },
  { nr: 2, p: "Czy muszę się gdzieś zapisać albo coś kliknąć?", o: "Nie. Wystarczy konto w BiegaMy i zapisany trening: kilometry wchodzą do wspólnej puli same.", w: [/czy (musze|trzeba) (sie )?(gdzies )?(zapisac|kliknac)/] },
  { nr: 3, p: "Czy akcja coś kosztuje?", o: "Udział w akcji nic nie kosztuje: wystarczy konto w BiegaMy i zapisany trening. Wpłata na zbiórkę jest dobrowolna i idzie bezpośrednio na oficjalną stronę zbiórki.", w: [/czy akcja (cos )?kosztuje/, /ile kosztuje (udzial|akcja)/] },
  { nr: 4, p: "Co się liczy do akcji?", o: "Liczy się bieg i spacer. Rower nie. Bieg w każdej odmianie: także bieżnia, bieg wirtualny, trail, a spacer to też marsz, nordic walking i wędrówka. Pływanie i siłownia się nie liczą.", w: [/^co sie liczy( do akcji)?$/, /co sie liczy do (akcji|licznika)/] },
  { nr: 5, p: "Czy rower się liczy?", o: "Nie. Liczy się bieg i spacer. Rower nie, także ten stacjonarny.", w: [/\brower\w* sie licz/, /licz\w* sie rower/, /czy rower\w* (tez )?licz/] },
  { nr: 6, p: "Czy spacer się liczy?", o: "Tak. Każdy zapisany kilometr spaceru liczy się tak samo jak kilometr biegu.", w: [/\bspacer\w* sie licz/, /czy spacer\w* (tez )?licz/] },
  { nr: 7, p: "Czy bieżnia się liczy?", o: "Tak. Bieżnia to bieg, więc jej kilometry wchodzą do puli.", w: [/\bbiezni\w* sie licz/, /czy biezni\w* (tez )?licz/] },
  { nr: 8, p: "Czy pływanie albo siłownia się liczą?", o: "Nie. Do akcji liczą się tylko bieg i spacer.", w: [/\b(plywani\w*|silowni\w*)( albo (plywani\w*|silowni\w*))? sie licz/] },
  { nr: 9, p: "Od kiedy liczą się kilometry?", o: "Od 7 listopada. Liczy się cały ten dzień. Kilometry sprzed startu nie wchodzą do puli.", w: [/od kiedy (licza sie|sie licza) (kilometry|km)/] },
  { nr: 10, p: "Dokąd trzeba dobiec, jaki jest cel?", o: "Razem robimy 12 500 km. Akcja kończy się w dniu, w którym osiągniemy ten cel.", w: [/dokad trzeba dobiec/, /jaki jest cel akcji/] },
  { nr: 11, zywe: true, p: "Ile kilometrów już mamy?", o: "Aktualny licznik jest na Dziś i na stronie akcji.", w: [] },
  { nr: 12, p: "Czemu licznik się nie zmienił po moim treningu?", o: "Licznik odświeża się z opóźnieniem do około 2 minut. Jeśli po tym czasie nie widzisz zmiany, sprawdź, czy trening jest zapisany jako bieg albo spacer.", w: [/(czemu|dlaczego) licznik (sie )?nie (zmienil|urosl|drgnal)/] },
  { nr: 13, p: "Czy jest limit kilometrów dziennie?", o: "Tak. Jednej osobie liczymy do 100 km na dobę, licząc czas polski.", w: [/limit (kilometrow|km)( w akcji)?( dziennie| na dobe| dzienny)?/, /ile (km|kilometrow) (dziennie|na dobe) (sie )?licz/] },
  { nr: 14, p: "Mam zegarek, czy muszę też wpisywać trening ręcznie?", o: "Nie. Jeden trening zapisz raz: albo z zegarka, albo ręcznie. Gdy masz oba wpisy, usuń jeden, bo liczą się osobno.", w: [/mam zegarek .*(wpisywac|recznie)/, /czy musze (tez )?wpisywac trening recznie/] },
  { nr: 15, p: "Nie mam zegarka. Czy mogę wziąć udział?", o: "Tak. Wpisz trening ręcznie w aplikacji, a kilometry też się policzą.", w: [/nie mam zegarka .*(udzial|akcj|moge)/, /bez zegarka .*(udzial|akcj|licz)/] },
  { nr: 16, p: "Trening z zegarka nie dotarł. Co zrobić?", o: "Sprawdź połączenie z zegarkiem w Profilu. Jeśli trening dalej nie dotarł, wpisz go ręcznie, żeby kilometry weszły do puli.", w: [/trening z zegarka nie dotarl/] },
  { nr: 17, p: "Usunąłem trening. Co z kilometrami?", o: "Znikają z puli razem z treningiem. Licznik to suma zapisanych treningów.", w: [/usun\w* trening .*kilometr/, /co z kilometrami/] },
  { nr: 18, p: "Czy biegnąc za granicą też się liczy?", o: "Tak. Liczy się zapisany kilometr, niezależnie od miejsca.", w: [/za granica (tez )?sie licz/, /biegnac za granica/] },
  { nr: 19, p: "Czy widać, ile przebiegłem?", o: "Twój wkład widzisz tylko Ty, publiczna jest suma. Kilometry nie mają rankingu. Ranking ma tylko gra Cegiełki, pod pseudonimem.", w: [/czy widac ile przebieg\w*/] },
  { nr: 20, p: "Jak dostać odznakę?", o: "Odznaki akcji przyznajemy same: za pierwszy kilometr, za 100, 200 i 500 km w akcji, za 7 dni z rzędu i za zostanie sponsorem kilometrów. Zdobyta odznaka zostaje na zawsze.", w: [/^jak dostac odznake( akcji)?$/] },
  { nr: 21, p: "Jak działa odznaka 7 dni z rzędu?", o: "Przez 7 kolejnych dni, licząc czas polski, zapisz co najmniej jeden bieg albo spacer dziennie. Przerwa zeruje serię, ale możesz zacząć nową.", w: [/odznak\w* 7 dni z rzedu/] },
  { nr: 22, p: "Gdzie zobaczę swoje odznaki?", o: "Na ekranie odznak w aplikacji. Odznaki akcji są tam widoczne od startu.", w: [/gdzie zobacze (swoje )?odznaki/] },
  { nr: 23, p: "Jak wpłacić pieniądze?", o: "Bezpośrednio na oficjalnej zbiórce. Link „Oficjalna zbiórka” jest na stronie akcji. Aplikacja nie pośredniczy w pieniądzach.", w: [/^jak wplacic( pieniadze)?$/, /^gdzie wplacic( pieniadze)?$/] },
  { nr: 24, p: "Czy BiegaMy zbiera pieniądze?", o: "Nie. BiegaMy tylko liczy kilometry, a wpłaty idą bezpośrednio na oficjalną zbiórkę.", w: [/czy biegamy zbiera/] },
  { nr: 25, p: "Ile dokłada Filip?", o: "Filip dokłada 10 groszy za każdy kilometr, razem do 1250 zł przy 12 500 km.", w: [/ile (doklada|daje|wplaca) filip/] },
  { nr: 26, p: "Co to jest sponsor kilometrów?", o: "Deklarujesz, ile groszy dołożysz do każdego kilometru. Po zakończeniu akcji wpłacasz tę kwotę sam na oficjalną zbiórkę. Aplikacja tylko liczy.", w: [/co to (jest )?sponsor\w* kilometrow/, /czym jest sponsor\w* kilometrow/] },
  { nr: 27, p: "Jak zostać sponsorem kilometrów?", o: "Na stronie akcji wybierz „Zostań sponsorem kilometrów” i wpisz stawkę. Formularz znajdziesz też na Dziś.", w: [/jak zostac sponsorem/] },
  { nr: 28, p: "Czy mogę wycofać deklarację sponsora?", o: "Tak, w tym samym miejscu na Dziś. Odznaka Sponsor kilometrów zostaje także po wycofaniu.", w: [/wycofac deklaracj\w*/] },
  { nr: 29, p: "Gdzie jest ulica?", o: "Na stronie akcji, w sekcji Ulica. Rośnie razem z kilometrami, a skrót do niej jest też na Dziś.", w: [/^gdzie (jest )?(ta )?ulica$/] },
  { nr: 30, p: "Jak działa ulica?", o: "Każde 100 km to jeden odcinek drogi, a cała ulica ma 125 odcinków. Maszyny i budowniczy stoją na końcu i idą dalej razem z licznikiem.", w: [/jak dziala ulica/] },
  { nr: 31, p: "Co oznaczają latarnie, plac zabaw i park na ulicy?", o: "Pojawiają się wraz z kwotą na zbiórce: latarnie przy 25 % celu zbiórki, plac zabaw przy 50 %, park przy 100 %.", w: [/co oznaczaj\w* (latarnie|plac zabaw|park)/, /(latarnie|plac zabaw|park) na ulicy/] },
  { nr: 32, p: "Skąd te domki na ulicy?", o: "To firmy, które wsparły zbiórkę wpłatą albo rzeczowo. Wymienienie firmy to podziękowanie, nie reklama.", w: [/skad (te )?(domki|budynki|wiezowce)/] },
  { nr: 33, p: "Jak moja firma może mieć domek?", o: "Firma wpłaca bezpośrednio na zbiórkę, a potem wypełnia formularz „Twoja firma na Ulicy” na stronie akcji: logo, link, potwierdzenie wpłaty i zgoda. Domek i wieżowiec mają progi wpłaty podane w formularzu. Budynek pojawia się po sprawdzeniu. Kwotę pokazujemy tylko wtedy, gdy firma się na to zgodzi.", w: [/jak (moja )?firma moze miec (domek|wiezowiec)/, /jak (dodac|zglosic) firme/, /firma na ulicy/, /domek dla (mojej )?firmy/] },
  { nr: 34, p: "Co to są cegiełki?", o: "Cegiełki to gra w aplikacji: cegły i złote cegły to waluta w grze, nie wpłaty. Osoby wpłacające na zbiórkę mają swój wpis w murze przy ulicy, a imię pokazujemy tylko za zgodą.", w: [/co to (sa )?(za )?cegiel\w*/, /czym sa cegiel\w*/] },
  { nr: 35, p: "Jak trafić na mur przy ulicy?", o: "Wpłać na oficjalną zbiórkę i pokaż nam potwierdzenie. Wpis dopisuje trener, a imię tylko wtedy, gdy się na to zgodzisz. Zdobyć cegły możesz tylko w grze, i to zupełnie osobna sprawa.", w: [/jak trafic na mur/, /jak dostac (sie na mur|wpis)/, /jak dostac cegiel\w*/] },
  { nr: 36, p: "Gdzie jest gra?", o: "Gra Cegiełki działa w przeglądarce: link „Zagraj w Cegiełki” jest na stronie akcji i na Dziś. Cegły to waluta w grze, nie pieniądze.", w: [/^gdzie (jest )?(ta )?gra$/, /gdzie (zagrac|jest gra) w? ?cegiel\w*/, /jak zagrac w cegiel\w*/] },
  { nr: 37, p: "Czy gra liczy się do kilometrów?", o: "Nie. Gra nigdy nie zmienia licznika akcji ani Twoich statystyk.", w: [/czy gra (sie )?licz\w*/, /gra .*(do )?(kilometrow|licznika|statystyk)/] },
  { nr: 38, p: "Kim jest Fabianek?", o: "To dziecko, dla którego biegniemy. O jego zdrowiu nie piszemy tutaj. Informacje podaje oficjalna strona zbiórki.", w: [/kim jest fabian\w*/] },
  { nr: 39, zywe: true, p: "Dokąd biegną Filip i Kasia?", o: "Cel wyprawy zdradzimy na mecie. Postęp widać na Dziś.", w: [] },
  { nr: 40, p: "Jak mogę pomóc, jeśli nie biegam?", o: "Możesz chodzić, bo spacer też się liczy. Możesz wpłacić na oficjalną zbiórkę, zostać sponsorem kilometrów albo udostępnić ulicę znajomym.", w: [/jak (moge|mozna) pomoc( jesli nie biegam)?$/] },
  // Gra i sprawy obok (luka 7). Cegiełki to tylko gra.
  { nr: 41, rodzaj: "gra", p: "Co to za gra?", o: "Cegiełki to gra w aplikacji: biegniesz, zbierasz cegły i dokładasz je do wspólnego muru graczy. Cegły i złote cegły to wyłącznie waluta w grze.", w: [/co to za gra/, /(co to|czym) (jest )?gra cegiel\w*/, /^gra cegiel\w*$/] },
  { nr: 42, rodzaj: "wplata", p: "Czy cegiełki to pieniądze?", o: "Nie. Cegieł ani złotych cegieł nie da się kupić ani wypłacić i nie są wpłatami. Pomóc pieniędzmi można tylko przez oficjalną zbiórkę.", w: [/ceg(iel|l)\w* .*(pieniadz\w*|wplat\w*|kupi\w*|wyplac\w*|prawdziw\w*|platn\w*)/, /(pieniadz\w*|wplat\w*|kupi\w*|wyplac\w*|prawdziw\w*) .*ceg(iel|l)\w*/, /co to (sa )?zlot\w* cegl\w*/] },
  { nr: 43, rodzaj: "kilometry", p: "Czy cegły z gry dodają kilometry?", o: "Nie. Gra nie zmienia licznika akcji ani statystyk treningów, a kilometry biorą się tylko z zapisanych biegów i spacerów.", w: [/ceg(iel|l)\w* .*(kilometr\w*|km|licznik\w*)/] },
  { nr: 44, rodzaj: "rower", p: "Czy rowerem w grze nabijam kilometry?", o: "Nie. Rower w grze to postać do odblokowania. Do licznika akcji rower się nie liczy.", w: [/rower\w* w grze/, /w grze rower\w*/] },
  { nr: 45, rodzaj: "ranking", p: "Jak działa ranking w grze?", o: "Ranking gry pokazuje wyniki pod pseudonimem: najlepsze rundy dnia, tygodnia i wszech czasów oraz kto najwięcej dołożył do wspólnego muru. Kilometry w akcji rankingu nie mają.", w: [/ranking\w* .*\b(gr(a|y|e|ze)|cegiel\w*)\b/, /\b(gr(a|y|e|ze)|cegiel\w*)\b .*ranking\w*/, /jak dziala ranking/] },
  { nr: 46, rodzaj: "pseudonim", p: "Jak zmienić pseudonim w grze?", o: "Pseudonim wybierasz po rundzie, gdy jesteś zalogowany, i sprawdza go filtr. Sam go nie zmienisz: napisz na " + KONTAKT_MEDIA + ". Tam też zgłoś obraźliwy pseudonim.", w: [/pseudonim\w*/] },
  { nr: 47, rodzaj: "poziomy", p: "Jak działają poziomy w grze?", o: "Poziomy rosną z sumy cegieł ze wszystkich rund. Nowe postacie odblokowujesz poziomem, a dodatki wymieniasz w sklepiku za złote cegły.", w: [/poziom\w* .*\b(gr(a|y|e|ze)|cegiel\w*)\b/, /\bgr(a|y|e|ze)\b .*poziom\w*/, /jak odblokowac (postac|slawka|rower\w*|koparke)/] },
  { nr: 48, rodzaj: "media", zawsze: true, p: "Kontakt dla mediów", o: "Dla mediów: napisz na " + KONTAKT_MEDIA + ". Odpowiemy tego samego dnia.", w: [/dla (mediow|prasy)/, /kontakt (dla )?(mediow|prasy|dziennikarz\w*)/, /jestem dziennikarz\w*/, /rzecznik\w* (prasow\w*)?/] },
  { nr: 49, rodzaj: "dane", zawsze: true, p: "Co z moimi danymi?", o: "Co zbieramy, po co i jak długo, opisuje polityka prywatności: biegamy.run/privacy.html. Swoje konto usuniesz w Profilu.", w: [/polityk\w* prywatnosci/, /jakie dane (zbiera\w*|o mnie)/, /co (robicie |sie dzieje )?z (moimi )?danymi/] },
];

/** tekst po normalizacji → wpis FAQ albo null. Bez stanu akcji: o tym, czy wolno odpowiedzieć, decyduje router. */
export function dopasujFaq(t) {
  if (!t) return null;
  for (const f of FAQ) { if (f.w.some((r) => r.test(t))) return f; }
  return null;
}
