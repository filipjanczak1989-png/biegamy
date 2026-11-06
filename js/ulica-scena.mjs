// ULICA, pełna scena 2D (Filip 4.11): tylko strona akcji (dla-fabianka.html). Plik BEZ import/export (globalThis.BM_ULICA_SCENA), ładowany przez BM_ULICA.naStronie.
// Warstwy z paralaksą: niebo wg godziny w Polsce, wzgórza, drzewa i latarnie, ulica z maszynami, liście na pierwszym planie. Dotyk, dźwięki z WebAudio (domyślnie wyciszone), świętowanie wzrostu w trakcie oglądania.
// Wydajność: animacje tylko transform i opacity, jeden requestAnimationFrame na całą scenę, cząstki z puli na jednym canvasie, pauza poza ekranem i przy ukrytej karcie, przy reduced-motion nieruchomy kadr.
// Przed startem: plac z tablicą, niebo i liście; bez liczb, licznika, świętowania, dźwięku i udostępniania. Tekst z bazy (firma, imię) tylko przez textContent. Liczby tylko z suma_km licznika.
(function (g) {
  "use strict";
  var WYS = 340, ODC = 30.25, START_X = 70, DROGA_Y = 240, DROGA_H = 72, KAFEL_DROGI = 242, KONIEC_SWIATA = 300, OKRES_SRODKA = 1400, KAFEL_DALEKO = 700, KAFEL_PRZOD = 380;
  var CEL_PX = 125 * ODC, SWIAT = START_X + CEL_PX + KONIEC_SWIATA, PARALAKSA = { daleko: 0.18, srodek: 0.55, przod: 1.25 };
  var LOGO_SZER = 0.8, LOGO_WYS = 40, ZA_DROGA = 20, POZIOM_DOMKU = 258, POZIOM_MASZYN = 286, POZIOM_DZWIGU = 262, POZIOM_BUDOWNICZEGO = 304, POZIOM_SRODKA = 238;
  var ROZMIAR = { koparka: [124, 85.5], walec: [104, 83.5], dzwig: [130, 90.5], budowniczy: [39, 74] };
  /* Koła walca (zgłoszenie 6.11, „jajowate”): opony na assets/ulica/walec.webp są owalne (ok. 23 × 29 px pliku, środki 25 i 71,5 na 135,5). Wycinek owalny w tym miejscu,
     a obrót z kompensacją owalu (ściśnij do koła, obróć, rozciągnij z powrotem): bieżnik się kręci, kształt opony zostaje jak na rysunku. Wartości w px pudełka (plik × 0,5). */
  var KOLA_WALCA = { srodki: [[12.5, 67.75], [35.75, 67.75]], rx: 11.1, ry: 14.2 };   // owal odrobinę w opony: bez błotnika w obrocie
  /* Maszyny to jedna grafika: ruchoma część to ta sama grafika z innym przycięciem. Oba przycięcia dzielą granicę, ruchoma wchodzi lekko na korpus, żeby nie było szczeliny. */
  var KLIPY = {
    koparka: [["korpus", "polygon(0 0,56% 0,56% 8%,50% 30%,50% 64%,56% 62%,66% 72%,66% 100%,0 100%)"], ["ramie", "polygon(56% 0,100% 0,100% 100%,66% 100%,66% 72%,56% 62%,49% 64%,49% 30%,55% 8%)"]],
    dzwig: [["korpus", "polygon(0 0,100% 0,100% 16%,82% 16%,82% 45%,69% 58%,69% 100%,0 100%)"], ["hak", "polygon(82% 15%,100% 15%,100% 100%,69% 100%,69% 58%,82% 45%)"]],
    budowniczy: [["korpus", "polygon(28% 0,100% 0,100% 100%,0 100%,0 22%,20% 34%,34% 34%,34% 25%,30% 14%)"], ["reka", "polygon(0 0,29% 0,31% 14%,35% 25%,35% 36%,20% 36%,0 23%)"]],
  };
  var MAX_CZASTEK = 110;

  function svgUrl(svg) { return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'; }
  var LISC = "M0-9 2-4 7-6 5-1 9 1 4 3 5 8 0 5-5 8-4 3-9 1-5-1-7-6-2-4Z";
  var SVG_DALEKO = "<svg xmlns='http://www.w3.org/2000/svg' width='900' height='130'>" +
    "<path d='M0 78C90 40 190 34 300 70S520 96 620 60 820 40 900 78V130H0Z' fill='#8fb27a'/>" +
    "<path d='M0 100C120 66 250 70 380 96S660 116 770 88 860 84 900 100V130H0Z' fill='#a4bd62'/>" +
    "<path d='M140 98 230 82 282 90 200 112Z' fill='#c9b458'/><path d='M430 102 520 94 590 106 500 120Z' fill='#d6a04a'/><path d='M700 100 770 90 820 96 760 114Z' fill='#b9c46a'/>" +
    "<path d='M172 92 262 86M186 100 276 92M452 104 560 102M470 112 566 108' stroke='#a8933f' stroke-width='1.5' fill='none'/>" +
    [[60, 84, "#d9822b"], [78, 80, "#b5651d"], [330, 80, "#c8553d"], [348, 84, "#d9822b"], [640, 70, "#b5651d"], [656, 74, "#e0a030"], [840, 76, "#c8553d"], [858, 82, "#d9822b"], [500, 84, "#7f9a4a"]].map(function (d) {
      return "<rect x='" + (d[0] - 1.5) + "' y='" + d[1] + "' width='3' height='8' fill='#6b4a2b'/><circle cx='" + d[0] + "' cy='" + (d[1] - 3) + "' r='7' fill='" + d[2] + "'/>";
    }).join("") + "</svg>";
  var SVG_PLOT = "<svg xmlns='http://www.w3.org/2000/svg' width='70' height='26'><path d='M0 9H70M0 18H70' stroke='#7a5230' stroke-width='3'/><path d='M12 1V26M47 1V26' stroke='#6b4526' stroke-width='5' stroke-linecap='round'/></svg>";
  function lisc(x, y, sk, kol, ob) { return "<path transform='translate(" + x + " " + y + ") rotate(" + ob + ") scale(" + sk + ")' d='" + LISC + "' fill='" + kol + "' stroke='#3a1d0a' stroke-width='.9'/>"; }
  var SVG_PRZOD = "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='46'>" +
    "<path d='M0 46V30C40 22 70 34 110 28S190 22 240 30 340 36 400 26 520 22 570 30 620 34 640 30V46Z' fill='#4f7a33'/>" +
    [[24, 30], [130, 26], [262, 30], [372, 28], [486, 25], [604, 31]].map(function (t) { return "<path d='M" + t[0] + " " + (t[1] + 8) + "l-5-16 6 9 3-14 3 14 6-9-5 16z' fill='#6f9e3e' stroke='#35561f' stroke-width='.8'/>"; }).join("") +
    lisc(60, 36, 1.5, "#e8892b", 20) + lisc(176, 34, 1.15, "#f2b32a", -35) + lisc(220, 40, 1.6, "#d9482b", 70) + lisc(318, 37, 1.3, "#e8892b", -10) + lisc(438, 38, 1.7, "#f2b32a", 40) + lisc(540, 35, 1.2, "#d9482b", -50) + lisc(586, 40, 1.45, "#e8892b", 15) + "</svg>";
  var SVG_CHMURA = "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='46'><path d='M18 44C4 44 0 30 12 26 10 14 28 8 36 16 42 2 66 0 74 14 88 8 102 16 100 26 116 26 120 44 104 44Z' fill='#fff' stroke='#c9d8e4' stroke-width='1.5'/></svg>";
  var GWIAZDY1 = "radial-gradient(1.4px 1.4px at 20px 18px,#fff,transparent),radial-gradient(1px 1px at 70px 44px,#fff,transparent),radial-gradient(1.6px 1.6px at 128px 12px,#fff,transparent),radial-gradient(1px 1px at 176px 60px,#fff,transparent),radial-gradient(1.2px 1.2px at 232px 30px,#fff,transparent),radial-gradient(1px 1px at 290px 72px,#fff,transparent)";
  var GWIAZDY2 = "radial-gradient(1px 1px at 44px 66px,#fff,transparent),radial-gradient(1.5px 1.5px at 100px 30px,#fff,transparent),radial-gradient(1px 1px at 156px 84px,#fff,transparent),radial-gradient(1.3px 1.3px at 208px 8px,#fff,transparent),radial-gradient(1px 1px at 262px 54px,#fff,transparent),radial-gradient(1.5px 1.5px at 312px 24px,#fff,transparent)";

  var CSS = ".us{position:relative;margin:14px -16px;font-family:Inter,system-ui,sans-serif;color:var(--fg,#f0ede8)}" +
    ".us-podglad{margin:10px 0;border-radius:12px;overflow:hidden;pointer-events:none}.us-podglad .us-mur{top:28px}.us-cegla--nowa{outline:2px solid #ffe07a;outline-offset:1px;z-index:1}" +
    ".us-tytul{padding:0 16px 8px;font:400 24px/1.1 'Bebas Neue',Inter,sans-serif;letter-spacing:.04em}" +
    ".us-proba{display:inline-block;margin-left:8px;padding:2px 6px;border-radius:6px;background:#e8561e;color:#fff;font:600 10px/1.3 Inter,sans-serif;letter-spacing:.1em;vertical-align:middle}" +
    ".us-okno{position:relative;height:" + WYS + "px;overflow:hidden;touch-action:pan-y;user-select:none;-webkit-user-select:none;contain:layout paint;isolation:isolate;cursor:grab;outline-offset:-3px}" +
    ".us-okno *{-webkit-tap-highlight-color:transparent}" +
    ".us-tlo,.us-warstwa,.us-tint,.us-czastki,.us-ui,.us-gwiazdy{position:absolute;left:0;top:0}" +
    ".us-tlo{right:0;bottom:0}.us-warstwa{height:" + WYS + "px;will-change:transform;pointer-events:none}.us-warstwa>*{pointer-events:auto}" +
    ".us-tint{right:0;bottom:0;pointer-events:none}.us-czastki{width:100%;height:100%;pointer-events:none}.us-ui{right:0;bottom:0;pointer-events:none}.us-ui>*{pointer-events:auto}" +
    ".us--dzien .us-tint,.us--dzien .us-swiatla-sr{display:none}.us--swit .us-tint{background:rgba(255,150,120,.1)}.us--swit .us-tint-p{background:rgba(255,150,120,.06)}.us--zmierzch .us-tint{background:rgba(70,40,110,.24)}.us--zmierzch .us-tint-p{background:rgba(70,40,110,.14)}.us--noc .us-tint{background:rgba(10,18,50,.46)}.us--noc .us-tint-p{background:rgba(10,18,50,.26)}" +
    ".us-gwiazdy{right:0;height:110px;background-size:340px 96px;display:none;pointer-events:none}.us--noc .us-gwiazdy{display:block}.us--zmierzch .us-g1{display:block;opacity:.35}" +
    ".us--gra.us--noc .us-g2{animation:us-migot 3.4s ease-in-out infinite alternate}@keyframes us-migot{from{opacity:.35}to{opacity:1}}" +
    ".us-slonce{position:absolute;width:76px;height:76px;background:url(assets/gra/slonce.webp) center/contain no-repeat;pointer-events:none}" +
    ".us--dzien .us-slonce{left:68%;top:20px}.us--swit .us-slonce{left:14%;top:112px}.us--zmierzch .us-slonce{left:74%;top:118px}.us--noc .us-slonce{display:none}" +
    ".us-ksiezyc{position:absolute;left:76%;top:24px;width:34px;height:34px;border-radius:50%;box-shadow:inset -9px -2px 0 0 #f5efd6;display:none;pointer-events:none}.us--noc .us-ksiezyc{display:block}" +
    ".us-chmura{position:absolute;left:0;background-repeat:no-repeat;background-size:contain;pointer-events:none;opacity:.92}.us--noc .us-chmura{opacity:.2}.us--zmierzch .us-chmura{opacity:.6}" +
    ".us--gra .us-chmura{will-change:transform;animation:us-chmura linear infinite}@keyframes us-chmura{from{transform:translate3d(-150px,0,0)}to{transform:translate3d(640px,0,0)}}" +
    ".us-laka{position:absolute;left:0;right:0;top:206px;bottom:0;background:linear-gradient(#86ad55,#6d9a47 28%,#5f8a3a 62%,#4f7a33);pointer-events:none}" +
    ".us-sprite{position:absolute;display:block;pointer-events:none;object-fit:contain;object-position:50% 100%}" +
    ".us-ksztalt{display:block;width:100%;height:100%}" +
    ".us-grunt,.us-droga{position:absolute;top:" + DROGA_Y + "px;height:" + DROGA_H + "px;pointer-events:none}" +
    ".us-grunt{left:" + START_X + "px;width:" + CEL_PX + "px;background:linear-gradient(#6d8f3f 0 12%,#8c6d3f 12% 72%,#7a5d33 76%,#5f8a3a 78%)}" +
    ".us-droga{left:" + START_X + "px;background-color:#3a3d44;background-repeat:repeat-x;background-size:" + KAFEL_DROGI + "px " + DROGA_H + "px}" +
    ".us-slupek{position:absolute;top:" + (DROGA_Y - 76) + "px;width:52px;height:85px;display:flex;align-items:center;justify-content:center;padding-top:9px;box-sizing:border-box;background:url(assets/ulica/slupek.webp) center/contain no-repeat;color:#23252b;font:800 10px/1 Inter,system-ui,sans-serif;letter-spacing:-.3px;white-space:nowrap;transform:translateX(-50%);pointer-events:none}" +
    ".us-tablica{position:absolute;padding:8px 14px 24px;background:url(assets/ulica/tablica-start.webp) center/100% 100% no-repeat;color:#23252b;font:800 12px/1.2 Inter,system-ui,sans-serif;white-space:nowrap;pointer-events:none}" +
    ".us-meta{background-image:url(assets/ulica/tablica-meta.webp);color:#fff}" +
    ".us-btn{position:absolute;display:block;margin:0;padding:0;border:0;background:none;cursor:pointer;touch-action:pan-y;color:inherit;font:inherit;min-width:44px;min-height:44px}" +
    ".us-btn:focus-visible{outline:3px solid #fff;outline-offset:2px;border-radius:8px}" +
    ".us-cz{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;object-position:50% 100%;pointer-events:none}" +
    ".us-maszyny{position:absolute;left:0;top:0;width:0;height:0;transition:transform 1.4s cubic-bezier(.3,.7,.3,1);will-change:transform}" +
    ".us-cz-ramie{transform-origin:52% 60%}.us-cz-hak{transform-origin:87% 15%}.us-cz-reka{transform-origin:31% 31%}" +
    ".us--gra .us-cz-ramie{will-change:transform;animation:us-ramie 2.4s ease-in-out infinite}@keyframes us-ramie{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(5deg)}}" +
    ".us--gra .us-mocno .us-cz-ramie{animation:us-ramie-m .55s ease-in-out 3}@keyframes us-ramie-m{0%,100%{transform:rotate(-15deg)}50%{transform:rotate(9deg)}}" +
    ".us--gra .us-mocno{animation:us-trzes .11s linear 14}@keyframes us-trzes{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(1.5px,-1px,0)}}" +
    ".us--gra .us-cz-hak{will-change:transform;animation:us-hak 2.2s ease-in-out infinite alternate}@keyframes us-hak{from{transform:rotate(-5deg)}to{transform:rotate(5deg)}}" +
    ".us--gra .us-klade .us-cz-hak{animation:us-klad 1.7s ease-in-out}@keyframes us-klad{0%{transform:translate3d(0,0,0)}45%,60%{transform:translate3d(0,22px,0)}100%{transform:translate3d(0,0,0)}}" +
    ".us-lina{position:absolute;left:86.4%;top:15%;width:1.6px;height:30%;background:#23252b;opacity:0;pointer-events:none}.us-klade .us-lina{opacity:1}" +
    ".us--gra .us-walec{will-change:transform;animation:us-jazda 3s ease-in-out infinite alternate}@keyframes us-jazda{from{transform:translate3d(-8px,0,0)}to{transform:translate3d(8px,0,0)}}" +
    ".us--gra .us-walec.us-jedzie{animation:us-przejazd 1.9s ease-in-out}@keyframes us-przejazd{0%,100%{transform:translate3d(0,0,0)}45%,55%{transform:translate3d(46px,0,0)}}" +
    ".us-kolo{transform-origin:var(--ox) var(--oy)}.us--gra .us-kolo{will-change:transform;animation:us-kolo 1.5s linear infinite}.us--gra .us-jedzie .us-kolo{animation-duration:.5s}@keyframes us-kolo{from{transform:scaleY(var(--sy,1)) rotate(0deg) scaleY(var(--sy1,1))}to{transform:scaleY(var(--sy,1)) rotate(360deg) scaleY(var(--sy1,1))}}" +
    ".us-beben{position:absolute;left:53%;top:51%;width:41%;height:17%;overflow:hidden;pointer-events:none;clip-path:ellipse(50% 100% at 50% 100%)}" +
    ".us-beben i{position:absolute;left:0;right:0;top:-10px;height:200%;background:repeating-linear-gradient(180deg,rgba(255,255,255,.28) 0 2px,transparent 2px 10px)}" +
    ".us--gra .us-beben i{will-change:transform;animation:us-beben .6s linear infinite}@keyframes us-beben{to{transform:translate3d(0,10px,0)}}" +
    ".us--gra .us-cz-reka{will-change:transform;animation:us-reka .8s ease-in-out infinite alternate}@keyframes us-reka{from{transform:rotate(-14deg)}to{transform:rotate(12deg)}}" +
    ".us--gra .us-skok{animation:us-skok .95s ease-out}@keyframes us-skok{0%,100%{transform:translate3d(0,0,0)}25%{transform:translate3d(0,-28px,0)}50%{transform:translate3d(0,0,0)}70%{transform:translate3d(0,-13px,0)}}" +
    ".us--gra .us-skok .us-cz-reka{animation-duration:.22s}" +
    ".us-stos{position:absolute;pointer-events:none}.us-stos i{position:absolute;width:15px;height:7px;border-radius:1.5px;background:#ef7a2a;border:1.2px solid #4a2408}" +
    ".us-czolo[hidden]{display:none}.us-czolo{position:absolute;right:10px;bottom:10px;padding:7px 12px;border:0;border-radius:999px;background:rgba(20,16,28,.72);color:#fff;font:700 12px/1.2 Inter,system-ui,sans-serif;cursor:pointer}.us-zjazd{translate:900px 0;transition:translate 5.5s ease-in}.us-dymek img{display:block;max-width:150px;max-height:52px;object-fit:contain;background:#fbf3df;border-radius:6px;padding:4px;margin-bottom:5px}.us-dymek i{display:block;font-style:normal;font-size:11px;font-weight:800;color:#ffb35c;margin-bottom:3px}" +
    ".us-szyld--ciemny{background:#2b2230}.us-szyld--logo{background:#fbf3df;border:2px solid #7a4a1c;border-radius:6px;box-shadow:0 2px 4px rgba(40,20,0,.35);padding:3px;box-sizing:border-box}.us-szyld--logo.us-szyld--ciemny{background:#2b2230}.us-logo{display:block;width:100%;height:100%;object-fit:contain}.us-partner{position:absolute;left:50%;transform:translateX(-50%);padding:1px 6px;border-radius:6px;background:#3a2410;color:#fff;font:800 9px/1.35 Inter,system-ui,sans-serif;white-space:nowrap;pointer-events:none}" +
    ".us-szyld{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;color:#4a2408;font-family:Inter,system-ui,sans-serif;font-weight:700;line-height:1.08;text-align:center;pointer-events:none}.us-szyld span{display:block;white-space:nowrap}" +
    ".us-lustro{transform:scaleX(-1)}" +
    "@media (max-width:480px){.us-mur-graczy{max-width:190px}}" +
    ".us-plakat{position:absolute;object-fit:contain;background:#fffdf7;pointer-events:none}" +
    ".us-mur{position:absolute;top:" + (POZIOM_DOMKU - 62) + "px;height:62px;background-repeat:repeat-x;background-size:auto 62px;background-color:#d9694e;pointer-events:none}" +
    ".us-cegla{position:absolute;display:block;margin:0;padding:0 2px;height:17px;width:54px;box-sizing:border-box;border-radius:3px;border:1.2px solid #4a2408;background:#ef7a2a;color:#fff;font:700 9px/15px Inter,system-ui,sans-serif;text-align:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;cursor:pointer;pointer-events:auto;touch-action:pan-y}" +
    ".us-cegla::after{content:'';position:absolute;left:-2px;right:-2px;top:-14px;bottom:-14px}.us-cegla--pusta{background:#d9694e;cursor:default;pointer-events:none}" +
    ".us-swiatlo{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(255,236,160,1) 0 16%,rgba(255,214,100,.55) 38%,transparent 70%);pointer-events:none}.us--dzien .us-swiatlo{display:none}" +
    ".us-licznik{position:absolute;left:12px;top:10px;padding:5px 11px;border-radius:12px;background:rgba(10,12,22,.68);color:#fff;font-family:Inter,system-ui,sans-serif;pointer-events:none}" +
    ".us-licznik b{font:400 28px/1 'Bebas Neue',Inter,sans-serif;letter-spacing:.03em}.us-licznik span{margin-left:6px;font-size:11px;opacity:.82}" +
    ".us-rysunek{position:absolute;left:-2%;bottom:-2%;width:92%;height:auto;pointer-events:none;transform-origin:50% 100%}.us--gra .us-rysunek{animation:us-rysunek 1.5s ease-in-out infinite}@keyframes us-rysunek{0%,100%{transform:rotate(-.8deg)}50%{transform:rotate(1deg) translateY(-1.5%)}}" +
    ".us--gra .us-wjazd{animation:us-wjazd 2.4s cubic-bezier(.2,.75,.3,1) both}@keyframes us-wjazd{from{transform:translateX(-340px)}to{transform:translateX(0)}}" +
    ".us-rowerzysta{position:absolute;left:0;bottom:6px;height:88px;width:auto;opacity:0;pointer-events:none}.us--gra .us-rowerzysta{opacity:1;will-change:transform;animation:us-rower 30s linear infinite}@keyframes us-rower{0%{transform:translateX(-110px)}34%,100%{transform:translateX(var(--koniec,600px))}}" +
    ".us-mur-pasek{display:block;height:7px;border-radius:4px;background:rgba(0,0,0,.45);overflow:hidden}.us-mur-pasek i{display:block;height:100%;border-radius:4px;background:#ffd23d}.us-zdanie a{margin-left:6px;color:#ff8a3d;font-weight:700;white-space:nowrap}" +
    ".us-mur-graczy{position:absolute;left:12px;top:58px;display:flex;flex-direction:column;justify-content:center;gap:4px;min-height:44px;padding:4px 12px;border-radius:8px;border:2px solid rgba(255,255,255,.8);color:#fff;font:700 13px/1.2 Inter,system-ui,sans-serif;text-decoration:none;text-shadow:0 1px 2px rgba(0,0,0,.85);background-color:#a6492c;background-image:linear-gradient(rgba(60,24,12,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(60,24,12,.5) 1px,transparent 1px);background-size:24px 11px,24px 22px}" +
    ".us-glosnik{position:absolute;right:10px;top:10px;width:44px;height:44px;padding:0;border:0;border-radius:50%;background:rgba(10,12,22,.68);color:#fff;cursor:pointer}.us-glosnik svg{display:block;width:22px;height:22px;margin:auto}" +
    ".us-podpowiedz{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);padding:4px 10px;border-radius:10px;background:rgba(10,12,22,.62);color:#fff;font-size:11px;white-space:nowrap;pointer-events:none}.us--gra .us-podpowiedz{animation:us-gasnij 6s forwards}@keyframes us-gasnij{0%,80%{opacity:1}100%{opacity:0}}" +
    ".us-baner{position:absolute;left:50%;top:84px;padding:8px 16px;border-radius:14px;background:#e8561e;color:#fff;font:400 30px/1.1 'Bebas Neue',Inter,sans-serif;letter-spacing:.03em;white-space:nowrap;pointer-events:none;transform:translateX(-50%);animation:us-baner 3.2s ease-out forwards}" +
    "@keyframes us-baner{0%{opacity:0;transform:translateX(-50%) scale(.6)}12%{opacity:1;transform:translateX(-50%) scale(1.08)}20%,82%{opacity:1;transform:translateX(-50%) scale(1)}100%{opacity:0;transform:translateX(-50%) scale(1)}}" +
    ".us-dymek{position:absolute;width:180px;box-sizing:border-box;padding:9px 11px;border-radius:12px;background:#fff;color:#23252b;font-size:13px;line-height:1.3;box-shadow:0 4px 14px rgba(0,0,0,.35);overflow-wrap:anywhere}" +
    ".us-dymek b{display:block;font-weight:700}.us-dymek a{display:inline-block;margin-top:5px;padding:6px 0;color:#c2410c;font-weight:600}" +
    ".us-opis{margin:8px 0 0;padding:0 16px;font-size:12px;line-height:1.45;color:var(--fg2,rgba(240,237,232,.72))}" +
    ".us-udostepnij{display:block;margin:10px 16px 0;min-height:44px;width:calc(100% - 32px);border-radius:12px;border:1px solid rgba(232,86,30,.55);background:transparent;color:#ff8a3d;font:600 14px Inter,system-ui,sans-serif;cursor:pointer}" +
    "@media (prefers-reduced-motion:reduce){.us *{animation:none !important;transition:none !important}.us-podpowiedz{display:none}}";

  function wstrzyknijCss() {
    if (g.document.getElementById("bm-ulica-scena-css")) return;
    var st = g.document.createElement("style"); st.setAttribute("id", "bm-ulica-scena-css"); st.textContent = CSS;
    g.document.head.appendChild(st);
  }
  function el(tag, klasa, rodzic, tekst) {
    var n = g.document.createElement(tag);
    if (klasa) n.setAttribute("class", klasa);
    if (tekst != null) n.textContent = String(tekst);
    if (rodzic) rodzic.appendChild(n);
    return n;
  }
  function wyczysc(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function przesun(n, x) { n.style.transform = "translate3d(" + x + "px,0,0)"; }
  function obok(n, x, y, w, wys) { n.style.left = x + "px"; n.style.top = y + "px"; if (w != null) n.style.width = w + "px"; if (wys != null) n.style.height = wys + "px"; return n; }
  function bezRuchu() { try { return !!(g.matchMedia && g.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } }

  /* ── DŹWIĘK: generowany w kodzie (oscylatory i szum), żadnych plików. AudioContext dopiero po geście. ── */
  var KLUCZ_DZWIEKU = "bm_ulica_dzwiek";
  function czytajDzwiek() { try { return g.localStorage.getItem(KLUCZ_DZWIEKU) === "1"; } catch (e) { return false; } }
  function zapiszDzwiek(v) { try { g.localStorage.setItem(KLUCZ_DZWIEKU, v ? "1" : "0"); } catch (e) {} }
  function noweAudio() {
    var ac = null;
    function kontekst() {
      if (ac) return ac;
      var K = g.AudioContext || g.webkitAudioContext;
      if (!K) return null;
      try { ac = new K(); } catch (e) { ac = null; }
      return ac;
    }
    function ton(typ, f0, f1, t0, dl, glos) {
      var o = ac.createOscillator(), gl = ac.createGain();
      o.type = typ; o.frequency.setValueAtTime(f0, t0); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dl);
      gl.gain.setValueAtTime(0.0001, t0); gl.gain.exponentialRampToValueAtTime(glos, t0 + 0.015); gl.gain.exponentialRampToValueAtTime(0.0001, t0 + dl);
      o.connect(gl); gl.connect(ac.destination); o.start(t0); o.stop(t0 + dl + 0.02);
    }
    function szum(t0, dl, glos, f) {
      var n = Math.floor(ac.sampleRate * dl), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      var s = ac.createBufferSource(), fl = ac.createBiquadFilter(), gl = ac.createGain();
      s.buffer = b; fl.type = "lowpass"; fl.frequency.value = f;
      gl.gain.setValueAtTime(glos, t0); gl.gain.exponentialRampToValueAtTime(0.0001, t0 + dl);
      s.connect(fl); fl.connect(gl); gl.connect(ac.destination); s.start(t0);
    }
    var GRAJ = {
      silnik: function (t) { ton("sawtooth", 62, 88, t, 0.75, 0.09); ton("square", 31, 44, t, 0.75, 0.05); szum(t, 0.7, 0.05, 420); },
      stuk: function (t) { szum(t, 0.09, 0.3, 1500); ton("sine", 150, 70, t, 0.14, 0.26); },
      klakson: function (t) { ton("square", 392, 0, t, 0.3, 0.07); ton("square", 494, 0, t, 0.3, 0.06); },
      hop: function (t) { ton("sine", 320, 720, t, 0.17, 0.14); },
      fanfara: function (t) { ton("triangle", 523, 0, t, 0.18, 0.13); ton("triangle", 659, 0, t + 0.16, 0.18, 0.13); ton("triangle", 784, 0, t + 0.32, 0.32, 0.15); },
    };
    function zKodu(nazwa) {
      var a = kontekst();
      if (!a || !GRAJ[nazwa]) return;
      try { if (a.state === "suspended") a.resume(); GRAJ[nazwa](a.currentTime + 0.01); } catch (e) {}
    }
    return { graj: zKodu,
      /* Plik pobierany dopiero tu, czyli po włączeniu głośnika. Brak pliku albo błąd: ten sam dźwięk z kodu. */
      plik: function (adres, zapas) {
        var a = kontekst();
        if (!a || !g.fetch) { zKodu(zapas); return; }
        g.fetch(adres).then(function (r) { if (!r.ok) throw new Error("http"); return r.arrayBuffer(); }).then(function (b) {
          return new Promise(function (ok, nie) { a.decodeAudioData(b, ok, nie); });
        }).then(function (b) {
          if (a.state === "suspended") a.resume();
          var s = a.createBufferSource(); s.buffer = b; s.connect(a.destination); s.start();
        }).catch(function () { zKodu(zapas); });
      } };
  }

  /* ── SCENA ──────────────────────────────────────────────────────────────────────── */
  /* ── BUDYNEK FIRMY I CEGŁA W MURZE: jedna funkcja dla Ulicy i dla podglądów (formularz firmy na stronie akcji, wpis w murze w panelu trenera),
     więc podgląd wygląda tak, jak potem stoi na Ulicy (blizna-188). laduj(im, adres) decyduje, kiedy obraz dostaje adres: Ulica leniwie, podgląd od razu. ── */
  function obrazZeSpadkiem(U, nazwa, rodzic, obrazy) {
    obrazy[0].onerror = function () {
      obrazy.forEach(function (i) { if (i.parentNode) i.parentNode.removeChild(i); });
      U.ksztalt(nazwa, "us-ksztalt", rodzic);
    };
  }
  /* Szyld firmy: logo, gdy jest i się wczytało; inaczej nazwa. Deska z logo jest większa niż namalowana, żeby logo dało się odczytać na telefonie. Oddaje dół szyldu w px. */
  function szyldNazwyFirmy(U, sz, f, szer, wys) {
    var dop = U.dopasujSzyld(f.nazwa, szer - 4, wys, function (t, roz) { return U.mierzTekst(t, roz, 700); }, { maks: 13, min: 7 });
    sz.style.fontSize = dop.rozmiar + "px";
    dop.linie.forEach(function (l) { el("span", "", sz, l); });
  }
  function szyldFirmyNaBudynku(U, b, f, r, w, h0, laduj, naLogo) {
    var sz = el("div", "us-szyld", b), sw = r[2] * w, sh = r[3] * h0;
    function naDesce(lewo, gora, szer, wys) { sz.style.left = lewo + "px"; sz.style.top = gora + "px"; sz.style.width = szer + "px"; sz.style.height = wys + "px"; }
    naDesce(r[0] * w, r[1] * h0, sw, sh);
    if (!f.logo) { szyldNazwyFirmy(U, sz, f, sw, sh); return (r[1] * h0) + sh; }
    var pw = U.BUDYNKI_POPRZEDNICH[f.rodzaj] ? sw : Math.max(sw, w * LOGO_SZER), ph = Math.max(sh, LOGO_WYS * Math.min(1, w / 118)), gora = r[1] * h0 + sh / 2 - ph / 2;
    naDesce(r[0] * w + sw / 2 - pw / 2, gora, pw, ph);
    sz.className += " us-szyld--logo";
    var im = el("img", "us-logo", sz);
    im.setAttribute("crossorigin", "anonymous");   // odczyt jasności logo; magazyn publiczny oddaje CORS dla każdego
    im.onload = function () { var ciemny = U.jasneLogo(im); if (ciemny) sz.classList.add("us-szyld--ciemny"); if (naLogo) naLogo(im, ciemny); };
    im.onerror = function () {
      sz.className = "us-szyld"; naDesce(r[0] * w, r[1] * h0, sw, sh);
      if (im.parentNode) im.parentNode.removeChild(im);
      szyldNazwyFirmy(U, sz, f, sw, sh);
      if (naLogo) naLogo(null, false);
    };
    laduj(im, f.logo);
    return gora + ph;
  }
  /** Budynek firmy: obraz z kształtem na wypadek braku pliku, szyld, plakat na billboardzie, „Partner akcji”. → { el, h0, dolSzyldu } */
  function budynekFirmy(U, rodzic, f, wyb, xb, baza, w, nr, laduj, naLogo) {
    var def = U.SZYLDY[wyb.nazwa], h0 = w / def.proporcja;
    var b = el("button", "us-btn us-domek", rodzic);
    b.setAttribute("type", "button"); b.setAttribute("data-u", "domek"); b.setAttribute("data-i", String(nr)); b.setAttribute("aria-label", "Firma: " + f.nazwa + (f.partner ? ", Partner akcji" : ""));
    obok(b, xb, baza - h0, w, h0);
    var oprawa = el("div", "us-cz" + (wyb.lustro ? " us-lustro" : ""), b);
    var obrazB = el("img", "us-cz", oprawa);
    laduj(obrazB, U.sciezkaObrazu(wyb.nazwa));
    obrazZeSpadkiem(U, wyb.nazwa, oprawa, [obrazB]);
    var r = U.szyldNaDomku(def.szyld, wyb.lustro), dolSzyldu = szyldFirmyNaBudynku(U, b, f, r, w, h0, laduj, naLogo);
    /* Plakat na billboardzie przy fabryce: adres z bazy, tylko po zgodzie firmy. Awaria pliku = pusta tablica. */
    if (def.plakat && f.plakat) {
      var pk = el("img", "us-plakat", b); pk.setAttribute("alt", ""); pk.setAttribute("crossorigin", "anonymous"); pk.onerror = function () { if (pk.parentNode) pk.parentNode.removeChild(pk); };
      pk.style.left = def.plakat[0] * w + "px"; pk.style.top = def.plakat[1] * h0 + "px"; pk.style.width = def.plakat[2] * w + "px"; pk.style.height = def.plakat[3] * h0 + "px";
      pk.setAttribute("src", f.plakat);
    }
    if (f.partner) { var pod = el("div", "us-partner", b, "Partner akcji"); pod.style.top = (dolSzyldu + 2) + "px"; }
    return { el: b, h0: h0, dolSzyldu: dolSzyldu };
  }
  /** Cegła w murze: imię tylko przy zgodzie (baza), przycisk tylko dla imiennej. */
  function ceglaMuru(mur, imie, i, kol) {
    var c = el(imie ? "button" : "div", "us-cegla" + (imie ? "" : " us-cegla--pusta"), mur, imie || null);
    c.style.left = (4 + (i % kol) * 56 + (Math.floor(i / kol) % 2 ? 0 : 1)) + "px";
    c.style.top = (6 + Math.floor(i / kol) * 18.5) + "px";
    if (imie) {
      c.setAttribute("type", "button"); c.setAttribute("data-u", "cegla"); c.setAttribute("data-i", String(i));
      c.setAttribute("aria-label", "Wpis w murze: " + imie);
    }
    return c;
  }
  function odRazu(im, adres) { im.setAttribute("alt", ""); im.setAttribute("decoding", "async"); im.setAttribute("draggable", "false"); im.setAttribute("src", adres); return im; }
  /* Podgląd w kadrze Ulicy: niebo w dzień, łąka i droga, pierwszy rząd w tej samej skali. */
  function kadrPodgladu(kontener, U, wys) {
    wstrzyknijCss(); wyczysc(kontener);
    var korzen = el("div", "us us--dzien us-podglad", kontener), okno = el("div", "us-okno", korzen);
    okno.setAttribute("aria-hidden", "true"); okno.style.height = wys + "px"; okno.style.cursor = "default";
    el("div", "us-tlo", okno).style.background = U.tloNieba("dzien");
    el("div", "us-laka", okno);
    var ulica = el("div", "us-warstwa", okno); ulica.style.width = "100%"; ulica.style.height = wys + "px";
    return { korzen: korzen, okno: okno, ulica: ulica };
  }
  /** Podgląd budynku firmy przed wysłaniem formularza. f = { nazwa, logo (adres w przeglądarce), rodzaj }. naLogo(im, ciemnySzyld) po wczytaniu logo. */
  function podgladFirmy(kontener, f, naLogo) {
    var U = g.BM_ULICA;
    if (!U || !kontener) return null;
    var k = kadrPodgladu(kontener, U, 286), szer = kontener.clientWidth || 340, wiez = f.rodzaj === "wiezowiec", w = wiez ? 118 : 160;
    var droga = el("div", "us-droga", k.ulica); droga.style.left = "0"; droga.style.width = "100%"; droga.style.backgroundImage = "url(" + U.sciezkaObrazu("droga") + ")";
    var xb = Math.round(szer / 2 - w / 2 + 30);
    budynekFirmy(U, k.ulica, { nazwa: "BiegaMy", rodzaj: "domek" }, U.domekNaMiejscu(2, "BiegaMy"), xb - 172, POZIOM_DOMKU, 160, -1, odRazu);   // sąsiad
    var b = budynekFirmy(U, k.ulica, f, wiez ? { nazwa: "wiezowiec", lustro: false } : U.domekNaMiejscu(0, f.nazwa || ""), xb, wiez ? POZIOM_DOMKU - ZA_DROGA : POZIOM_DOMKU, w, 0, odRazu, naLogo);
    b.el.setAttribute("tabindex", "-1");
    return b;
  }
  /** Podgląd wpisu w murze: kawałek muru z Ulicy, nowa cegła tak, jak stanie (zgoda: z imieniem, bez zgody: bez imienia). */
  function podgladCegly(kontener, imie, zgoda) {
    var U = g.BM_ULICA;
    if (!U || !kontener) return null;
    var k = kadrPodgladu(kontener, U, 116), kol = 5, mur = el("div", "us-mur", k.ulica);
    obok(mur, 12, 28, kol * 56 + 8); mur.style.backgroundImage = "url(" + U.sciezkaObrazu("mur") + ")";
    var nowa = null;
    for (var i = 0; i < kol * 3; i++) { var c = ceglaMuru(mur, i === 7 && zgoda && imie ? imie : "", i, kol); if (i === 7) nowa = c; }
    nowa.classList.add("us-cegla--nowa");
    return nowa;
  }

  function zamontuj(kontener, licznik, opcje) {
    var U = g.BM_ULICA;
    if (!U || !kontener) return null;
    var stan = U.stanUlicy(licznik);
    if (stan.faza === "brak") return null;
    wstrzyknijCss();
    var o = opcje || {}, ruch = !bezRuchu(), zniszczona = false, przed = stan.faza === "przed";
    var dane = przed ? { imie: "", nazwa: "", cel_km: 0, firmy: [] } : U.daneScenyZLicznika(licznik);
    var dod = przed ? U.dodatkiBezpieczne(null) : U.zFirmamiNaMurze(U.dodatkiBezpieczne(licznik.ulica), dane);
    var pora = U.poraDnia(new Date());
    var d0 = przed ? null : licznik;
    var dzwiek = noweAudio(), glosno = !o.kafel && czytajDzwiek();   // kafel na Dziś zawsze cichy
    var kam = { x: 0, cel: null, v: 0, ruszona: 0, maks: 0, brudna: true };
    var szerOkna = 390, raf = 0, ostatni = 0, naEkranie = true, kartaWidoczna = true, obs = null;
    var czasy = { lisc: 0, dym: 0, ziemia: 0, dzwig: 5 }, zegary = [];
    var domki = [], czastki = [], ctx = null, dpr = 1, listki = [], cw = 0, ch = 0, bylyCzastki = false;
    var licz = { wart: przed ? 0 : stan.km, cel: przed ? 0 : stan.km, el: null, t: 0 };
    var KLUCZ_UKLADU = "";

    /* szkielet: kolejność warstw od nieba do interfejsu */
    var korzen = el("div", "us us--" + pora);
    var tytulTekst = przed ? "" : (U.tytulUlicy(dane.imie) || "Ulica w budowie");
    var naglowek = null;
    if (!o.kafel && (tytulTekst || o.proba)) {
      naglowek = el("div", "us-tytul", korzen, tytulTekst);
      if (o.proba) el("span", "us-proba", naglowek, "PRÓBA");
    }
    var okno = el("div", "us-okno", korzen);
    okno.setAttribute("role", "group"); okno.setAttribute("tabindex", "0");
    okno.setAttribute("aria-label", U.opisDlaCzytnika(stan, dane, dod) + (przed ? "" : " Przesuwaj w lewo i w prawo, żeby obejrzeć całą ulicę."));
    /* Kafel na Dziś: tło bez gestów, dotknięcie należy do linku nad sceną, licznik i przyciski rysuje karta. */
    if (o.kafel) { okno.removeAttribute("role"); okno.removeAttribute("tabindex"); okno.removeAttribute("aria-label"); okno.setAttribute("aria-hidden", "true"); okno.style.pointerEvents = "none"; }
    /* Kamera przesuwa warstwy, okno stoi. Przewinięcie okna (fokus na budynku, skrypt) wyciągało warstwy nieba i pory dnia poza kadr: ciemny pas na części sceny. */
    okno.addEventListener("scroll", function () { okno.scrollLeft = 0; okno.scrollTop = 0; });
    /* Warstwa ma kształt z kodu, a plik wchodzi dopiero po wczytaniu: brak pliku nic nie psuje. */
    function zPliku(n, adres, rozmiar) { var im = new g.Image(); im.onload = function () { n.style.backgroundImage = "url(" + adres + ")"; n.style.backgroundSize = rozmiar; }; im.src = adres; }
    var niebo = el("div", "us-tlo", okno), slonce = el("div", "us-slonce", okno);
    niebo.setAttribute("aria-hidden", "true"); slonce.setAttribute("aria-hidden", "true");
    [[18, 74, 1, 96, -20], [58, 120, 0.8, 130, -80], [34, 96, 0.62, 170, -40]].forEach(function (c, nrCh) {
      var ch1 = el("div", "us-chmura", okno);
      ch1.setAttribute("aria-hidden", "true");
      ch1.style.backgroundImage = svgUrl(SVG_CHMURA); zPliku(ch1, "assets/gra/chmura" + (nrCh + 1) + ".webp", "contain");
      ch1.style.top = c[0] + "px"; ch1.style.width = c[1] * c[2] + "px"; ch1.style.height = c[1] * c[2] * 0.56 + "px";
      ch1.style.animationDuration = c[3] + "s"; ch1.style.animationDelay = c[4] + "s";
      if (!ruch) przesun(ch1, 40 + c[3]);
    });
    var daleko = el("div", "us-warstwa", okno);
    daleko.style.top = "100px"; daleko.style.height = "120px"; daleko.style.width = "calc(100% + " + KAFEL_DALEKO + "px)";
    daleko.style.backgroundImage = svgUrl(SVG_DALEKO); daleko.style.backgroundRepeat = "repeat-x"; daleko.style.backgroundPosition = "0 100%"; daleko.style.backgroundSize = KAFEL_DALEKO + "px 120px";
    zPliku(daleko, "assets/ulica/wzgorza.webp", KAFEL_DALEKO + "px 120px");
    el("div", "us-laka", okno);
    var srodek = el("div", "us-warstwa", okno);
    srodek.style.width = "calc(100% + " + OKRES_SRODKA + "px)";
    /* Półmrok dwa razy: tył ciemniejszy niż ulica, a światła latarni w tle stoją między nimi, więc nie świecą przez domki i maszyny. */
    var tintTyl = el("div", "us-tint", okno);
    var swiatlaSrodek = el("div", "us-warstwa us-swiatla-sr", okno);
    swiatlaSrodek.style.width = "calc(100% + " + OKRES_SRODKA + "px)";
    var ulica = el("div", "us-warstwa", okno);
    ulica.style.width = (przed ? 1200 : SWIAT) + "px";
    var przod = el("div", "us-warstwa", okno);
    przod.style.top = (WYS - 54) + "px"; przod.style.height = "54px"; przod.style.width = "calc(100% + " + KAFEL_PRZOD + "px)";
    przod.style.backgroundImage = svgUrl(SVG_PRZOD); przod.style.backgroundRepeat = "repeat-x"; przod.style.backgroundSize = KAFEL_PRZOD + "px 54px";
    zPliku(przod, "assets/ulica/pierwszy-plan.webp", KAFEL_PRZOD + "px 54px");
    var tint = el("div", "us-tint us-tint-p", okno);
    var g1 = el("div", "us-gwiazdy us-g1", okno), g2 = el("div", "us-gwiazdy us-g2", okno), ksiezyc = el("div", "us-ksiezyc", okno);
    [g1, g2, ksiezyc].forEach(function (n) { okno.insertBefore(n, okno.firstChild.nextSibling); });   // niebo: za budynkami, a wysoki budynek sięga pod księżyc
    g1.style.backgroundImage = GWIAZDY1; g2.style.backgroundImage = GWIAZDY2;
    [przod, tint, tintTyl, g1, g2, ksiezyc, daleko, srodek, swiatlaSrodek].forEach(function (n) { n.setAttribute("aria-hidden", "true"); });
    var canvas = el("canvas", "us-czastki", okno);
    canvas.setAttribute("aria-hidden", "true");
    var ui = el("div", "us-ui", okno);
    var opis = null, przyciskUdost = null, elGlosnik = null, dymekEl = null, podpowiedz = null, elCzolo = null;

    function ustawPore(p) {
      pora = p;
      korzen.setAttribute("class", "us us--" + p + (ruch && aktywna() ? " us--gra" : ""));
      niebo.style.background = U.tloNieba(p);
    }
    function aktywna() { return ruch && naEkranie && kartaWidoczna && !zniszczona; }

    /* obraz z kształtem na wypadek braku pliku */
    function sprite(nazwa, rodzic, klasa) {
      var im = el("img", klasa || "us-cz", rodzic);
      im.setAttribute("alt", ""); im.setAttribute("decoding", "async"); im.setAttribute("draggable", "false");
      im.setAttribute("src", U.sciezkaObrazu(nazwa));
      return im;
    }
    /* Budynki firm: obrazki dopiero, gdy kamera się zbliża, a dalekie budynki poza renderowaniem. Przy 60 domkach telefon rysuje tylko to, co widać. */
    var budynki = [], ostatnieWidoczne = -99999;
    function leniwy(im, adres, rekord) { im.setAttribute("alt", ""); im.setAttribute("decoding", "async"); im.setAttribute("draggable", "false"); rekord.obrazy.push([im, adres]); return im; }
    function odswiezWidoczne(wymus) {
      if (!wymus && Math.abs(kam.x - ostatnieWidoczne) < 90) return;
      ostatnieWidoczne = kam.x;
      var L0 = kam.x - 700, P0 = kam.x + szerOkna + 700;
      budynki.forEach(function (b) {
        var blisko = b.prawo > L0 && b.lewo < P0, teraz = blisko ? "" : "hidden";
        if (b.widok !== teraz) { b.widok = teraz; b.el.style.visibility = teraz; b.swiatla.forEach(function (s) { s.style.visibility = teraz; }); }
        if (blisko && !b.zaladowane) { b.zaladowane = true; b.obrazy.forEach(function (o) { o[0].setAttribute("src", o[1]); }); }
      });
    }
    /* Park z grafiki; brak pliku = pięć drzew, jak dotąd. */
    function rysujPark(xp) {
      var pk = el("div", "us-sprite", ulica), im = sprite("park", pk);
      obok(pk, xp, POZIOM_DOMKU - 139, 370, 139);
      im.onerror = function () {
        if (pk.parentNode) pk.parentNode.removeChild(pk);
        [[0, 0.82], [62, 1], [130, 0.74], [186, 0.92], [250, 0.8]].forEach(function (d) {
          var w = 130 * d[1], bk = el("div", "us-sprite", ulica);
          obok(bk, xp + d[0], POZIOM_DOMKU - w, w * 0.94, w);
          zeSpadkiem("drzewo", bk, [sprite("drzewo", bk)]);
        });
      };
    }
    function zeSpadkiem(nazwa, rodzic, obrazy) { obrazZeSpadkiem(U, nazwa, rodzic, obrazy); }
    /* warstwa środkowa: wzór powtarzany co OKRES_SRODKA, więc warstwa jest krótka, a przewijanie bez końca */
    (function budujSrodek() {
      var plot = el("div", "us-sprite", srodek);
      plot.style.left = "0"; plot.style.right = "0"; plot.style.top = (POZIOM_SRODKA - 34) + "px"; plot.style.height = "26px";
      plot.style.backgroundImage = svgUrl(SVG_PLOT); plot.style.backgroundRepeat = "repeat-x";
      plot.style.height = "34px"; plot.style.top = (POZIOM_SRODKA - 42) + "px"; zPliku(plot, "assets/ulica/plot.webp", "111px 34px");
      var wzor = [["drzewo", 40, 0.92], ["drzewo", 262, 0.72], ["latarnia", 430, 0.8], ["drzewo", 640, 1], ["latarnia", 870, 0.8], ["drzewo", 1012, 0.78], ["drzewo", 1236, 0.96]].filter(function (w) { return !(przed && w[0] === "latarnia"); });
      wzor.concat(wzor.filter(function (w) { return w[1] < 700; }).map(function (w) { return [w[0], w[1] + OKRES_SRODKA, w[2]]; })).forEach(function (w) {
        var wys = (w[0] === "drzewo" ? 130 : 92) * w[2], szer = wys * (w[0] === "drzewo" ? 0.94 : 0.288);
        var bok = el("div", "us-sprite", srodek);
        obok(bok, w[1], POZIOM_SRODKA - wys, szer, wys);
        var im = sprite(w[0], bok);
        zeSpadkiem(w[0], bok, [im]);
        if (w[0] === "latarnia") {
          var bl = el("div", "us-swiatlo", swiatlaSrodek);
          obok(bl, w[1] + szer / 2 - 34, POZIOM_SRODKA - wys + wys * 0.2 - 34, 68, 68);
        }
      });
    })();

    function linkujDanymi() { return JSON.stringify([stan.faza, dane, dod]); }
    /* ulica: droga, domki, mur, elementy z progów, maszyny. Odbudowa tylko przy zmianie układu, sam wzrost km przesuwa koniec drogi. */
    var zjazdByl = false, droga = null, maszyny = null, elKoparka = null, elDzwig = null, elWalec = null, elBudowniczy = null, stos = null, ileCegiel = 0;
    function maszyna(nazwa, opisTapu, x, poziom) {
      var r = ROZMIAR[nazwa], b = el("button", "us-btn us-" + nazwa, maszyny);
      b.setAttribute("type", "button"); b.setAttribute("data-u", nazwa); b.setAttribute("aria-label", opisTapu);
      obok(b, x, poziom - r[1], r[0], r[1]);
      function zwykle() {
        var obrazy = [];
        if (KLIPY[nazwa]) KLIPY[nazwa].forEach(function (cz) {
          var im = sprite(nazwa, b, "us-cz us-cz-" + cz[0]);
          im.style.clipPath = cz[1]; im.style.webkitClipPath = cz[1];
          obrazy.push(im);
        }); else obrazy.push(sprite(nazwa, b));
        zeSpadkiem(nazwa, b, obrazy);
      }
      /* Koparka z rysunkiem z licznika; gdy plik się nie wczyta, wraca zwykła koparka, a nie dziura. */
      var rysunek = nazwa === "koparka" && !przed ? U.rysunekKoparki(licznik) : "";
      if (rysunek) {
        var ry = el("img", "us-rysunek", b);
        ry.setAttribute("alt", ""); ry.setAttribute("draggable", "false");
        ry.onerror = function () { if (ry.parentNode) ry.parentNode.removeChild(ry); zwykle(); };
        ry.setAttribute("src", rysunek);
      } else zwykle();
      return b;
    }
    /* Wjazd raz na wizytę: koparka z rysunkiem wjeżdża na plac, staje i zaczyna kopać. */
    function wjazdKoparki() {
      if (o.kafel || przed || !elKoparka || !U.rysunekKoparki(licznik)) return;   // wjazd zostaje na pełną Ulicę
      var klucz = "bm_ulica_wjazd", bylo = false;
      try { bylo = g.sessionStorage.getItem(klucz) === "1"; g.sessionStorage.setItem(klucz, "1"); } catch (e) {}
      if (bylo || !ruch) return;
      zKlasa(elKoparka, "us-wjazd", 2400);
      zegary.push(g.setTimeout(function () { if (zniszczona) return; zKlasa(elKoparka, "us-mocno", 1650); graj("silnik"); ziemia(14, 2); }, 2450));
    }
    function polozenieMaszyn(n) { return Math.max(START_X + n * ODC, 124); }
    function budujMaszyny(n) {
      maszyny = el("div", "us-maszyny", ulica);
      przesun(maszyny, polozenieMaszyn(n));
      /* Plac budowy na czole, za maszynami: jedzie dalej razem z licznikiem. */
      var defPl = U.SZYLDY["plac-budowy"], wPl = 300, hPl = wPl / defPl.proporcja, pl = el("div", "us-sprite", maszyny);
      obok(pl, 262, 312 - hPl, wPl, hPl);
      zeSpadkiem("plac-budowy", pl, [sprite("plac-budowy", pl, "us-cz")]);
      var rPl = defPl.szyld, szPl = el("div", "us-szyld", pl);
      szPl.style.left = (rPl[0] * 100) + "%"; szPl.style.top = (rPl[1] * 100) + "%"; szPl.style.width = (rPl[2] * 100) + "%"; szPl.style.height = (rPl[3] * 100) + "%";
      var dopPl = U.dopasujSzyld("Budujemy", rPl[2] * wPl - 10, rPl[3] * hPl - 4, function (t, roz) { return U.mierzTekst(t, roz, 700); }, { maks: 17, min: 10 });
      szPl.style.fontSize = dopPl.rozmiar + "px"; dopPl.linie.forEach(function (l) { el("span", "", szPl, l); });
      elDzwig = maszyna("dzwig", "Dźwig: połóż cegłę", 96, POZIOM_DZWIGU);
      el("div", "us-lina", elDzwig);
      stos = el("div", "us-stos", maszyny);
      obok(stos, 200, POZIOM_DZWIGU - 8, 50, 8);
      elKoparka = maszyna("koparka", "Koparka: kop mocniej", 4, POZIOM_MASZYN);
      elWalec = maszyna("walec", "Walec: przejedź kawałek", -96, POZIOM_MASZYN + 2);
      var beben = el("div", "us-beben", elWalec); el("i", "", beben);
      KOLA_WALCA.srodki.forEach(function (k) {
        var im = sprite("walec", elWalec, "us-cz us-kolo");
        im.style.clipPath = "ellipse(" + KOLA_WALCA.rx + "px " + KOLA_WALCA.ry + "px at " + k[0] + "px " + k[1] + "px)"; im.style.webkitClipPath = im.style.clipPath;
        im.style.setProperty("--ox", k[0] + "px"); im.style.setProperty("--oy", k[1] + "px");
        im.style.setProperty("--sy", String(KOLA_WALCA.ry / KOLA_WALCA.rx)); im.style.setProperty("--sy1", String(KOLA_WALCA.rx / KOLA_WALCA.ry));
        im.onerror = function () {
          if (im.parentNode) im.parentNode.removeChild(im);
          if (beben.parentNode) beben.parentNode.removeChild(beben);
        };
      });
      elBudowniczy = maszyna("budowniczy", "Budowniczy: pomachaj", 122, POZIOM_BUDOWNICZEGO);
    }
    function ustawKoniec(n) {
      if (droga) droga.style.width = (n * ODC) + "px";
      if (maszyny && stan.faza !== "pelna") przesun(maszyny, polozenieMaszyn(n));
    }
    function budujUlice() {
      wyczysc(ulica); domki = []; budynki = []; ostatnieWidoczne = -99999;
      maszyny = elKoparka = elDzwig = elWalec = elBudowniczy = droga = null;
      KLUCZ_UKLADU = linkujDanymi();
      if (przed) { budujPlac(); return; }
      el("div", "us-grunt", ulica);
      droga = el("div", "us-droga", ulica);
      droga.style.backgroundImage = "url(" + U.sciezkaObrazu("droga") + ")";
      if (stan.odcinki >= 6) obok(el("div", "us-tablica", ulica, "START"), START_X - 66, DROGA_Y - 40);   // wcześniej stoją tu maszyny
      for (var t = 1; t <= 12; t++) {
        var sl = el("div", "us-slupek", ulica, U.formatKm(t * 1000));
        sl.style.left = (START_X + t * 10 * ODC) + "px";
      }
      var meta = el("div", "us-tablica us-meta", ulica, (U.formatKm(dane.cel_km || 12500)) + " km");
      obok(meta, START_X + CEL_PX + 110, DROGA_Y - 40);
      var x = START_X + 14;
      /* mur z cegiełek: imię tylko przy zgodzie (baza), przycisk tylko dla imiennej */
      var razem = dod.imiona.length + dod.bez_imienia;
      if (razem > 0) {
        var pokaz = Math.min(razem, 60), kol = Math.max(3, Math.ceil(pokaz / 3)), szer = kol * 56 + 8;
        var mur = el("div", "us-mur", ulica);
        obok(mur, x, POZIOM_DOMKU - 62, szer);
        mur.style.backgroundImage = "url(" + U.sciezkaObrazu("mur") + ")";
        for (var i = 0; i < pokaz; i++) ceglaMuru(mur, i < dod.imiona.length ? dod.imiona[i] : "", i, kol);
        x += szer + 24;
      }
      if (dod.odblokowane.indexOf("plac_zabaw") >= 0) {
        var pz = el("div", "us-sprite", ulica);
        obok(pz, x, POZIOM_DOMKU - 112, 230, 112);
        zeSpadkiem("plac-zabaw", pz, [sprite("plac-zabaw", pz)]);
        x += 250;
      }
      if (dod.odblokowane.indexOf("park") >= 0 && stan.faza !== "pelna") { rysujPark(x); x += 370; }
      /* Pierwszy budynek za tabliczkami licznika i muru: kamera nie cofnie się przed początek ulicy, więc inaczej zasłaniałyby szyld i podpis „Partner akcji”. */
      /* Budynki firm: rzędami, front najpierw. Domki rotują, szyld poza odbitym obrazem, więc nigdy lustrzany. Wieżowiec stoi głębiej, za drogą, z logo na górze. Dalsze rzędy mniejsze i za pierwszym, żeby 60 firm zmieściło się przy tej samej drodze. Nazwy poniżej progu są w murze. */
      var KRAWEDZ = START_X + CEL_PX - 30, ZA_TABLICZKA = 190, rzedy = [{ baza: POZIOM_DOMKU, sk: 1, x: x + ZA_TABLICZKA }, { baza: POZIOM_DOMKU - 24, sk: 0.82, x: x + 40 }, { baza: POZIOM_DOMKU - 46, sk: 0.68, x: x + 16 }];
      var miejsca = [], nrRz = 0, nrDomku = 0, wRzedzie = 0;
      dane.firmy.forEach(function (f, nr) {
        if (f.rodzaj === "cegielka") return;
        var wiez = f.rodzaj === "wiezowiec", poprz = U.BUDYNKI_POPRZEDNICH[f.rodzaj], wBaz = poprz || (wiez ? 118 : 160);
        while (nrRz < rzedy.length - 1 && rzedy[nrRz].x + wBaz * rzedy[nrRz].sk > KRAWEDZ) { nrRz++; wRzedzie = 0; }
        var rz = rzedy[nrRz], w = wBaz * rz.sk;
        var wyb = wiez ? { nazwa: "wiezowiec", lustro: false } : poprz ? { nazwa: f.rodzaj, lustro: false } : U.domekNaMiejscu(nrDomku++, f.nazwa);
        miejsca.push({ f: f, nr: nr, wiez: wiez, wyb: wyb, w: w, x: rz.x, baza: wiez ? rz.baza - ZA_DROGA : rz.baza, nrRz: nrRz });
        rz.x += w + 12 * rz.sk;
        /* drzewo co trzeci budynek w pierwszym rzędzie, latarnia po progu */
        wRzedzie++;
        if (nrRz === 0 && wRzedzie % 3 === 0) { miejsca.push({ drzewo: true, x: rz.x, latarnia: dod.odblokowane.indexOf("latarnie") >= 0 }); rz.x += 74; }
      });
      /* Od tyłu do przodu: bliższy rząd przykrywa dalszy. */
      miejsca.slice().sort(function (a, b) { return (b.nrRz || 0) - (a.nrRz || 0); }).forEach(function (m) {
        if (m.drzewo) {
          var dz = el("div", "us-sprite", ulica), wysDz = 104;
          obok(dz, m.x, POZIOM_DOMKU - wysDz, wysDz * 0.62, wysDz);
          zeSpadkiem("drzewo", dz, [sprite("drzewo", dz)]);
          if (m.latarnia) {
            var lt = el("div", "us-sprite", ulica);
            obok(lt, m.x + 48, POZIOM_DOMKU - 94, 26.5, 92);
            zeSpadkiem("latarnia", lt, [sprite("latarnia", lt)]);
            obok(el("div", "us-swiatlo", ulica), m.x + 61 - 40, POZIOM_DOMKU - 94 + 18 - 40, 80, 80);
          }
          return;
        }
        var f = m.f, w = m.w, xb = m.x, rekord = { lewo: xb, prawo: xb + w, el: null, swiatla: [], obrazy: [], zaladowane: false, widok: "" };
        var bud = budynekFirmy(U, ulica, f, m.wyb, xb, m.baza, w, m.nr, function (im, adres) { return leniwy(im, adres, rekord); }), b = bud.el, h0 = bud.h0;
        rekord.el = b;
        if (!m.wiez && m.nrRz === 0) {
          [0.25, 0.75].forEach(function (fx) {
            var sw = el("div", "us-swiatlo", ulica);
            obok(sw, xb + w * fx - 19, m.baza - h0 + h0 * 0.64 - 19, 38, 38);
            rekord.swiatla.push(sw);
          });
          domki.push({ x: xb + w * (m.wyb.lustro ? 0.26 : 0.74), y: m.baza - h0 + h0 * 0.03, dane: f });
        }
        budynki.push(rekord);
      });
      odswiezWidoczne(true);
      /* latarnie z progu: wzdłuż zbudowanej drogi, po tylnej stronie chodnika */
      if (dod.odblokowane.indexOf("latarnie") >= 0) {
        for (var lx = START_X + 90; lx < START_X + Math.max(stan.odcinki, 1) * ODC; lx += 210) {
          var ln = el("div", "us-sprite", ulica);
          obok(ln, lx, POZIOM_DOMKU - 2 - 92, 26.5, 92);
          zeSpadkiem("latarnia", ln, [sprite("latarnia", ln)]);
          obok(el("div", "us-swiatlo", ulica), lx + 13 - 40, POZIOM_DOMKU - 94 + 18 - 40, 80, 80);
        }
      }
      if (stan.faza === "pelna") {
        var tab = el("div", "us-tablica us-meta", ulica, (U.tytulUlicy(dane.imie) || "Ulica") + " zbudowana");
        tab.style.fontSize = "15px"; tab.style.padding = "14px 22px 44px";
        obok(tab, START_X + CEL_PX - 150, 170);
        /* Koniec akcji: park przy napisie, tam gdzie kończy się droga. */
        rysujPark(START_X + CEL_PX - 530);
        /* Maszyny zjeżdżają raz, gdy ulica właśnie stanęła. Potem zostaje sam budowniczy. */
        if (ruch && !zjazdByl) {
          zjazdByl = true;
          budujMaszyny(124);
          var zjezdzaja = maszyny;
          elKoparka = elDzwig = elWalec = null;
          zegary.push(g.setTimeout(function () { if (!zniszczona) zjezdzaja.classList.add("us-zjazd"); }, 80));
          zegary.push(g.setTimeout(function () { if (zjezdzaja.parentNode) zjezdzaja.parentNode.removeChild(zjezdzaja); }, 6000));
        }
        maszyny = el("div", "us-maszyny", ulica);
        przesun(maszyny, START_X + CEL_PX - 60);
        elBudowniczy = maszyna("budowniczy", "Budowniczy: pomachaj", -30, POZIOM_BUDOWNICZEGO);
      } else {
        budujMaszyny(stan.odcinki);
      }
      ustawKoniec(stan.odcinki);
    }
    function budujPlac() {
      var def = U.SZYLDY["plac-budowy"], w = 360, h0 = w / def.proporcja, x = 420;
      var pl = el("div", "us-sprite", ulica);
      obok(pl, x, 312 - h0, w, h0);
      zeSpadkiem("plac-budowy", pl, [sprite("plac-budowy", pl, "us-cz")]);
      var r = def.szyld, sz = el("div", "us-szyld", pl);
      sz.style.left = (r[0] * 100) + "%"; sz.style.top = (r[1] * 100) + "%"; sz.style.width = (r[2] * 100) + "%"; sz.style.height = (r[3] * 100) + "%";
      var dop = U.dopasujSzyld("Wkrótce budowa", r[2] * w - 10, r[3] * h0 - 4, function (t, roz) { return U.mierzTekst(t, roz, 700); }, { maks: 19, min: 11 });
      sz.style.fontSize = dop.rozmiar + "px";
      dop.linie.forEach(function (l) { el("span", "", sz, l); });
    }

    /* interfejs */
    function budujUi() {
      if (o.kafel) return;
      if (!przed) {
        var l = el("div", "us-licznik", ui);
        licz.el = el("b", "", l, U.formatKm(licz.cel));
        el("span", "", l, "z " + U.formatKm(dane.cel_km || 12500) + " km");
        elGlosnik = el("button", "us-glosnik", ui);
        elGlosnik.setAttribute("type", "button"); elGlosnik.setAttribute("data-u", "glosnik");
        rysujGlosnik();
      }
      if (!przed) {
        podpowiedz = el("div", "us-podpowiedz", ui, "‹ przesuń palcem po ulicy ›");
        elCzolo = el("button", "us-czolo", ui, "Do czoła budowy");
        elCzolo.setAttribute("type", "button"); elCzolo.setAttribute("data-u", "czolo"); elCzolo.hidden = true;
        opis = el("p", "us-opis", korzen, U.tekstPostepu(stan));
        przyciskUdost = el("button", "us-udostepnij", korzen, "Udostępnij ulicę");
        przyciskUdost.setAttribute("type", "button");
        przyciskUdost.setAttribute("aria-label", "Udostępnij obrazek ulicy z licznikiem");
        przyciskUdost.addEventListener("click", udostepnij);
      }
    }
    function rysujGlosnik() {
      wyczysc(elGlosnik);
      elGlosnik.setAttribute("aria-label", glosno ? "Wyłącz dźwięk" : "Włącz dźwięk");
      elGlosnik.setAttribute("aria-pressed", glosno ? "true" : "false");
      var ikona = el("img", "", elGlosnik); ikona.setAttribute("alt", ""); ikona.setAttribute("src", "assets/gra/" + (glosno ? "glosnik_wl" : "glosnik_wyl") + ".webp"); ikona.style.cssText = "width:24px;height:24px;object-fit:contain;display:block;pointer-events:none";
      ikona.onerror = function () { if (ikona.parentNode) ikona.parentNode.removeChild(ikona); elGlosnik.appendChild(svg); };
      var NS = "http://www.w3.org/2000/svg", svg = g.document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
      var p = g.document.createElementNS(NS, "path");
      p.setAttribute("d", "M4 9v6h4l5 4V5L8 9z"); p.setAttribute("fill", "currentColor"); svg.appendChild(p);
      var q = g.document.createElementNS(NS, "path");
      q.setAttribute("d", glosno ? "M16 8a5 5 0 0 1 0 8M18.5 5.5a9 9 0 0 1 0 13" : "M16 9l5 6M21 9l-5 6");
      q.setAttribute("fill", "none"); q.setAttribute("stroke", "currentColor"); q.setAttribute("stroke-width", "2"); q.setAttribute("stroke-linecap", "round"); svg.appendChild(q);
    }
    function graj(n) { if (glosno) dzwiek.graj(n); }

    /* kamera */
    function zmierz() {
      szerOkna = okno.clientWidth || szerOkna;
      kam.maks = Math.max(0, (przed ? 1200 : SWIAT) - szerOkna);
      kam.x = Math.max(0, Math.min(kam.maks, kam.x));
      kam.brudna = true;
      if (canvas.getContext && (cw !== szerOkna)) {
        dpr = Math.min(1.5, g.devicePixelRatio || 1); cw = szerOkna; ch = WYS;
        canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
        if (!ctx) { ctx = canvas.getContext("2d"); if (ctx) przygotujListki(); }
      }
    }
    function kadr() {
      kam.brudna = false;
      var x = kam.x;
      przesun(daleko, -((x * PARALAKSA.daleko) % KAFEL_DALEKO));
      var s = -((x * PARALAKSA.srodek) % OKRES_SRODKA);
      przesun(srodek, s); przesun(swiatlaSrodek, s);
      przesun(ulica, -x);
      odswiezWidoczne(false);
      if (elCzolo) elCzolo.hidden = Math.abs(x - celKamery()) < 160;
      przesun(przod, -((x * PARALAKSA.przod) % KAFEL_PRZOD));
    }
    function celKamery() {
      if (przed) return Math.max(0, 600 - szerOkna / 2);
      var xm = stan.faza === "pelna" ? START_X + CEL_PX - 90 : polozenieMaszyn(stan.odcinki) + 44;
      return Math.max(0, Math.min(kam.maks, xm - szerOkna / 2));
    }

    /* cząstki: jedna pula, jeden canvas */
    function przygotujListki() {
      ["#e8892b", "#f2b32a", "#d9482b", "#b5651d"].forEach(function (kol) {
        var c = g.document.createElement("canvas"); c.width = 24; c.height = 24;
        var x = c.getContext("2d");
        if (!x) return;
        x.translate(12, 12); x.scale(1.25, 1.25);
        var p = new g.Path2D(LISC);
        x.fillStyle = kol; x.fill(p); x.strokeStyle = "rgba(58,29,10,.7)"; x.lineWidth = 0.9; x.stroke(p);
        listki.push(c);
      });
      for (var i = 0; i < MAX_CZASTEK; i++) czastki.push({ a: false, typ: 0, x: 0, y: 0, vx: 0, vy: 0, gr: 0, zycie: 0, wiek: 0, r: 0, vr: 0, rozm: 0, kol: "", swiat: false, faza: 0 });
    }
    var _wolna = 0;
    function dodaj(typ, x, y, vx, vy, gr, zycie, rozm, kol, swiat) {
      for (var n = 0; n < MAX_CZASTEK; n++) {
        var c = czastki[(_wolna + n) % MAX_CZASTEK];
        if (c && !c.a) {
          _wolna = (_wolna + n + 1) % MAX_CZASTEK;
          c.a = true; c.typ = typ; c.x = x; c.y = y; c.vx = vx; c.vy = vy; c.gr = gr; c.zycie = zycie; c.wiek = 0; c.r = Math.random() * 6.28; c.vr = (Math.random() - 0.5) * 3; c.rozm = rozm; c.kol = kol; c.swiat = !!swiat; c.faza = Math.random() * 6.28;
          return c;
        }
      }
      return null;
    }
    var LISC_T = 0, DYM_T = 1, ISKRA_T = 2, ZIEMIA_T = 3;
    function liscOgolny() { dodaj(LISC_T, Math.random() * (cw + 80) - 20, -14, -8 - Math.random() * 16, 26 + Math.random() * 22, 0, 12, 11 + Math.random() * 7, listki.length ? Math.floor(Math.random() * listki.length) : 0, false); }
    function konfetti(xs, ys, ile) {
      for (var i = 0; i < ile; i++) {
        var a = -1.57 + (Math.random() - 0.5) * 1.9, v = 130 + Math.random() * 210;
        dodaj(LISC_T, xs, ys, Math.cos(a) * v, Math.sin(a) * v, 240, 2.6, 10 + Math.random() * 8, Math.floor(Math.random() * Math.max(1, listki.length)), false);
      }
    }
    function fajerwerk(xs, ys) {
      var kol = ["#ffd400", "#ff8a3d", "#ff5d73", "#7fd1ff", "#b8ff8c"][Math.floor(Math.random() * 5)];
      for (var i = 0; i < 26; i++) {
        var a = i / 26 * 6.283, v = 70 + Math.random() * 90;
        dodaj(ISKRA_T, xs, ys, Math.cos(a) * v, Math.sin(a) * v, 90, 1.25, 1.6 + Math.random() * 1.2, kol, false);
      }
    }
    function ziemia(ile, sila) {
      if (!elKoparka) return;
      var xs = polozenieMaszyn(stan.odcinki) + 4 + 124 * 0.84, ys = POZIOM_MASZYN - 16;
      for (var i = 0; i < ile; i++) dodaj(ZIEMIA_T, xs + Math.random() * 12 - 6, ys, (Math.random() - 0.5) * 42 * sila, -24 - Math.random() * 50 * sila, 300, 0.9, 1.5 + Math.random() * 2, "#6e4a24", true);
    }
    function klatkaCzastek(dt) {
      if (!ctx) return;
      if (bylyCzastki) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
      var bylo = false;
      for (var i = 0; i < czastki.length; i++) {
        var c = czastki[i];
        if (!c.a) continue;
        c.wiek += dt;
        if (c.wiek >= c.zycie) { c.a = false; continue; }
        c.vy += c.gr * dt; c.x += c.vx * dt; c.y += c.vy * dt;
        var sx = c.swiat ? c.x - kam.x : c.x;
        if (c.y > ch + 20 || sx < -40 || sx > cw + 40) { c.a = false; continue; }
        bylo = true;
        if (c.typ === LISC_T) {
          c.r += c.vr * dt; var kolys = Math.sin(c.wiek * 2 + c.faza) * 10;
          var co = Math.cos(c.r) * dpr, si = Math.sin(c.r) * dpr, sp = listki[c.kol];
          if (!sp) continue;
          ctx.globalAlpha = c.zycie - c.wiek < 0.6 ? (c.zycie - c.wiek) / 0.6 : 1;
          ctx.setTransform(co, si, -si, co, (sx + kolys) * dpr, c.y * dpr);
          ctx.drawImage(sp, -c.rozm / 2, -c.rozm / 2, c.rozm, c.rozm);
        } else {
          var alfa = c.typ === DYM_T ? 0.42 * (1 - c.wiek / c.zycie) : 1 - c.wiek / c.zycie, roz = c.typ === DYM_T ? c.rozm + c.wiek * 5 : c.rozm;
          ctx.globalAlpha = alfa; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = c.kol;
          ctx.beginPath(); ctx.arc(sx, c.y, roz, 0, 6.283); ctx.fill();
        }
      }
      bylyCzastki = bylo;
      ctx.globalAlpha = 1;
    }

    /* jedna pętla na całą scenę */
    function popchnij() { if (!raf && !zniszczona) { ostatni = 0; raf = g.requestAnimationFrame(klatka); } }
    function klatka(t) {
      raf = 0;
      if (zniszczona) return;
      var dt = ostatni ? Math.min(0.05, (t - ostatni) / 1000) : 0.016; ostatni = t;
      var dalej = false;
      if (!kam.trzyma && Math.abs(kam.v) > 5) {
        kam.x = Math.max(0, Math.min(kam.maks, kam.x + kam.v * dt));
        kam.v *= Math.pow(0.04, dt);
        kam.brudna = true; dalej = true;
      } else if (!kam.trzyma && kam.cel != null) {
        var roz = kam.cel - kam.x;
        if (Math.abs(roz) < 0.5) { kam.x = kam.cel; kam.cel = null; } else { kam.x += roz * Math.min(1, dt * 2.6); dalej = true; }
        kam.brudna = true;
      }
      if (kam.brudna) kadr();
      if (licz.wart !== licz.cel && licz.el) {
        licz.wart += (licz.cel - licz.wart) * Math.min(1, dt * 3.5);
        if (Math.abs(licz.cel - licz.wart) < 0.5) licz.wart = licz.cel;
        if (t - licz.t > 60 || licz.wart === licz.cel) { licz.t = t; licz.el.textContent = U.formatKm(Math.round(licz.wart)); }
        dalej = true;
      }
      if (aktywna()) {
        dalej = true;
        czasy.lisc -= dt; if (czasy.lisc <= 0) { czasy.lisc = 0.85; liscOgolny(); }
        czasy.dym -= dt;
        if (czasy.dym <= 0) {
          czasy.dym = 0.55;
          for (var i = 0; i < domki.length; i++) {
            var dm = domki[i];
            if (dm.x > kam.x - 20 && dm.x < kam.x + szerOkna + 20) dodaj(DYM_T, dm.x + Math.random() * 3, dm.y, 3 + Math.random() * 5, -15 - Math.random() * 7, 0, 2.7, 2.6 + Math.random() * 1.4, "#ece8df", true);
          }
        }
        if (elKoparka) { czasy.ziemia -= dt; if (czasy.ziemia <= 0) { czasy.ziemia = 2.4; ziemia(4, 1); } }
        if (elDzwig) { czasy.dzwig -= dt; if (czasy.dzwig <= 0) { czasy.dzwig = 8; kladzCegle(false); } }
        klatkaCzastek(dt);
      }
      if (dalej) raf = g.requestAnimationFrame(klatka);
    }
    function przelaczGre() {
      var a = aktywna();
      korzen.classList.toggle("us--gra", a);
      if (a) popchnij();
    }

    /* dotyk */
    function zKlasa(n, klasa, ms) {
      if (!n) return;
      n.classList.remove(klasa); void n.offsetWidth; n.classList.add(klasa);
      zegary.push(g.setTimeout(function () { n.classList.remove(klasa); }, ms));
    }
    function kladzCegle(zDotyku) {
      if (!elDzwig || elDzwig.classList.contains("us-klade")) return;
      zKlasa(elDzwig, "us-klade", 1700);
      zegary.push(g.setTimeout(function () {
        if (zniszczona || !stos) return;
        if (ileCegiel >= 8) { wyczysc(stos); ileCegiel = 0; }
        var c = el("i", "", stos);
        c.style.left = (ileCegiel % 4) * 12 + "px"; c.style.top = (-Math.floor(ileCegiel / 4) * 7) + "px";
        ileCegiel++;
        if (zDotyku) graj("stuk");
        var xs = polozenieMaszyn(stan.odcinki) + 200 + (ileCegiel % 4) * 12;
        for (var i = 0; i < 5; i++) dodaj(ZIEMIA_T, xs + Math.random() * 14, POZIOM_DZWIGU - 2, (Math.random() - 0.5) * 34, -16 - Math.random() * 24, 170, 0.5, 1.2, "#c9a56b", true);
      }, 800));
    }
    function zamknijDymek() { if (dymekEl && dymekEl.parentNode) dymekEl.parentNode.removeChild(dymekEl); dymekEl = null; }
    function dymek(nad, tytul, link, karta) {
      zamknijDymek();
      var b = el("div", "us-dymek", ui);
      b.setAttribute("role", "status");
      if (karta && karta.logo) { var lg = el("img", "", b); lg.setAttribute("alt", ""); lg.setAttribute("crossorigin", "anonymous"); lg.onload = function () { if (U.jasneLogo(lg)) lg.style.background = "#2b2230"; }; lg.onerror = function () { if (lg.parentNode) lg.parentNode.removeChild(lg); }; lg.setAttribute("src", karta.logo); }
      if (karta && karta.partner) el("i", "", b, "Partner akcji");
      if (karta && karta.poprzedni) el("i", "", b, "Partner poprzednich wyzwań");
      el("b", "", b, tytul);
      if (karta && karta.plakatTekst) el("span", "", b, karta.plakatTekst);
      if (link) {
        var a = el("a", "", b, "Strona firmy ›");
        a.setAttribute("href", link); a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer nofollow");
      }
      var r = nad.getBoundingClientRect(), ro = okno.getBoundingClientRect();
      b.style.left = Math.max(8, Math.min(ro.width - 188, r.left - ro.left + r.width / 2 - 90)) + "px";
      b.style.top = Math.max(58, Math.min(WYS - 90, r.top - ro.top + 6)) + "px";
      dymekEl = b;
    }
    function reakcja(b) {
      var co = b.getAttribute("data-u");
      if (co === "glosnik") {
        glosno = !glosno; zapiszDzwiek(glosno); rysujGlosnik();
        if (glosno) dzwiek.graj("hop");
        return;
      }
      if (co === "czolo") { kam.cel = celKamery(); kam.ruszona = 0; kam.v = 0; popchnij(); return; }
      if (co === "koparka") { zKlasa(elKoparka, "us-mocno", 1650); graj("silnik"); if (ruch) { ziemia(14, 2); zegary.push(g.setTimeout(function () { ziemia(10, 1.6); }, 550)); } popchnij(); return; }
      if (co === "dzwig") { kladzCegle(true); return; }
      if (co === "walec") { zKlasa(elWalec, "us-jedzie", 1900); graj("klakson"); zegary.push(g.setTimeout(function () { graj("silnik"); }, 250)); return; }
      if (co === "budowniczy") { zKlasa(elBudowniczy, "us-skok", 950); graj("hop"); return; }
      if (co === "domek") {
        var f = dane.firmy[Number(b.getAttribute("data-i"))];
        if (f) dymek(b, f.nazwa, U.linkFirmy(f.link), f);
        return;
      }
      if (co === "cegla") {
        var imie = dod.imiona[Number(b.getAttribute("data-i"))];
        if (imie) dymek(b, imie, "");
      }
    }
    var dotyk = null, blokujKlik = false;
    function naDol(e) {
      if (e.button != null && e.button !== 0) return;
      dotyk = { id: e.pointerId, x0: e.clientX, y0: e.clientY, k0: kam.x, ruszony: false, tx: e.clientX, tt: e.timeStamp, v: 0 };
      kam.v = 0;
    }
    function naRuch(e) {
      if (!dotyk || e.pointerId !== dotyk.id) return;
      var dx = e.clientX - dotyk.x0;
      if (!dotyk.ruszony) {
        if (Math.abs(dx) < 8) return;
        dotyk.ruszony = true; kam.trzyma = true; kam.cel = null; kam.ruszona = Date.now();
        zamknijDymek();
        if (podpowiedz && podpowiedz.parentNode) { podpowiedz.parentNode.removeChild(podpowiedz); podpowiedz = null; }
        try { okno.setPointerCapture(e.pointerId); } catch (e2) {}
      }
      kam.x = Math.max(0, Math.min(kam.maks, dotyk.k0 - dx));
      var dtz = e.timeStamp - dotyk.tt;
      if (dtz > 0) { dotyk.v = -(e.clientX - dotyk.tx) / dtz * 1000; dotyk.tx = e.clientX; dotyk.tt = e.timeStamp; }
      kam.brudna = true;
      popchnij();
    }
    function naGore(e) {
      if (!dotyk || e.pointerId !== dotyk.id) return;
      if (dotyk.ruszony) {
        blokujKlik = true;
        zegary.push(g.setTimeout(function () { blokujKlik = false; }, 60));
        kam.trzyma = false;
        if (ruch && e.type === "pointerup") kam.v = Math.max(-1800, Math.min(1800, dotyk.v));
        popchnij();
      }
      dotyk = null;
    }
    function naKlik(e) {
      if (blokujKlik) { blokujKlik = false; e.preventDefault(); e.stopPropagation(); return; }
      var cel = e.target && e.target.closest ? e.target : null;
      if (cel && cel.closest(".us-dymek, .us-mur-graczy")) return;
      var b = cel ? cel.closest("[data-u]") : null;
      if (!b) { zamknijDymek(); return; }
      reakcja(b);
    }
    function naKlawisz(e) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (e.target !== okno) return;
        e.preventDefault();
        kam.cel = Math.max(0, Math.min(kam.maks, (kam.cel == null ? kam.x : kam.cel) + (e.key === "ArrowLeft" ? -180 : 180)));
        kam.ruszona = Date.now(); popchnij();
      } else if (e.key === "Escape") zamknijDymek();
    }

    /* świętowanie: tylko wzrost w trakcie oglądania, nigdy zaległości po wejściu */
    function baner(tekst) {
      var stary = ui.querySelector ? ui.querySelector(".us-baner") : null;
      if (stary && stary.parentNode) stary.parentNode.removeChild(stary);
      var b = el("div", "us-baner", ui, tekst);
      b.setAttribute("role", "status");
      zegary.push(g.setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 3300));
    }
    function swietuj(rodzaj, km) {
      if (rodzaj === "nic" || !ruch) return;
      var xs = Math.max(30, Math.min(cw - 30, (stan.faza === "pelna" ? START_X + CEL_PX - 60 : polozenieMaszyn(stan.odcinki)) - kam.x));
      if (rodzaj === "tysiac") {
        baner(Math.min(12500, km >= 12500 ? 12500 : Math.floor(km / 1000) * 1000) + " km razem!");
        zKlasa(elBudowniczy, "us-skok", 950);
        konfetti(xs, 240, 28);
        [[0.3, 90, 0], [0.7, 60, 420], [0.5, 110, 860]].forEach(function (f) { zegary.push(g.setTimeout(function () { if (!zniszczona) fajerwerk(cw * f[0], f[1]); }, f[2])); });
        if (stan.faza === "pelna" && glosno) dzwiek.plik("assets/gra/dzwieki/ul_fanfara.mp3", "fanfara");
        else graj("fanfara");
      } else {
        konfetti(xs, 240, 22);
        graj("hop");
      }
      popchnij();
    }
    /* nowy licznik z odświeżania strony */
    function aktualizuj(d) {
      var nowy = U.stanUlicy(d);
      if (nowy.faza === "brak" || nowy.faza === "przed" || przed) return;
      var stare = stan, noweDane = U.daneScenyZLicznika(d), noweDod = U.zFirmamiNaMurze(U.dodatkiBezpieczne(d.ulica), noweDane);
      var rodzaj = U.coSwietowac(stare.km, nowy.km);
      if (nowy.faza === "pelna" && stare.faza !== "pelna") rodzaj = "tysiac";
      stan = nowy; dane = noweDane; dod = noweDod; d0 = d;
      if (linkujDanymi() !== KLUCZ_UKLADU) budujUlice();
      else ustawKoniec(nowy.odcinki);
      licz.cel = nowy.km;
      if (!ruch && licz.el) { licz.wart = licz.cel; licz.el.textContent = U.formatKm(Math.round(licz.cel)); }
      if (opis) opis.textContent = U.tekstPostepu(nowy);
      if (!o.kafel) okno.setAttribute("aria-label", U.opisDlaCzytnika(nowy, dane, dod) + " Przesuwaj w lewo i w prawo, żeby obejrzeć całą ulicę.");
      if (nowy.odcinki !== stare.odcinki && !dotyk && Date.now() - kam.ruszona > 12000) kam.cel = celKamery();
      swietuj(rodzaj, nowy.km);
      popchnij();
    }

    /* udostępnianie: canvas tylko z grafik z tego samego źródła */
    function wczytaj(n) {
      return new Promise(function (ok) {
        var im = new g.Image();
        im.onload = function () { ok(im); }; im.onerror = function () { ok(null); };
        im.src = U.sciezkaObrazu(n);
      });
    }
    async function obrazek() {
      var S = 1080, c = g.document.createElement("canvas");
      c.width = S; c.height = S;
      var x = c.getContext("2d"), kol = U.KOLORY_NIEBA[pora] || U.KOLORY_NIEBA.dzien;
      var gr = x.createLinearGradient(0, 0, 0, 660);
      gr.addColorStop(0, kol[0]); gr.addColorStop(0.55, kol[1]); gr.addColorStop(1, kol[2]);
      x.fillStyle = gr; x.fillRect(0, 0, S, S);
      if (pora === "noc") { x.fillStyle = "#fff"; for (var i = 0; i < 70; i++) { x.globalAlpha = 0.4 + ((i * 37) % 60) / 100; x.fillRect((i * 151) % S, (i * 83) % 460, 3, 3); } x.globalAlpha = 1; }
      x.fillStyle = "#8fb27a"; x.beginPath(); x.moveTo(0, 620); x.bezierCurveTo(240, 470, 480, 500, 720, 590); x.bezierCurveTo(860, 620, 980, 560, S, 600); x.lineTo(S, 780); x.lineTo(0, 780); x.fill();
      x.fillStyle = "#a4bd62"; x.beginPath(); x.moveTo(0, 690); x.bezierCurveTo(300, 600, 620, 640, S, 680); x.lineTo(S, 800); x.lineTo(0, 800); x.fill();
      x.fillStyle = "#6d9a47"; x.fillRect(0, 700, S, 380);
      var sk = 2.7, yD = 780, koniec = stan.faza === "pelna" ? S : S * 0.46;
      var nazwy = ["droga", "koparka", "walec", "dzwig", "budowniczy", "drzewo"], obr = {}, wyn = await Promise.all(nazwy.map(wczytaj));
      nazwy.forEach(function (n, i) { obr[n] = wyn[i]; });
      if (obr.drzewo) { x.drawImage(obr.drzewo, 40, yD - 300, 280, 298); x.drawImage(obr.drzewo, S - 280, yD - 250, 234, 250); }
      x.fillStyle = "#8c6d3f"; x.fillRect(0, yD + 20, S, DROGA_H * sk - 50);
      x.save(); x.beginPath(); x.rect(0, yD, koniec, DROGA_H * sk); x.clip();
      if (obr.droga) for (var xx = 0; xx < S; xx += KAFEL_DROGI * sk) x.drawImage(obr.droga, xx, yD, KAFEL_DROGI * sk, DROGA_H * sk);
      else { x.fillStyle = "#3a3d44"; x.fillRect(0, yD, S, DROGA_H * sk); }
      x.restore();
      function pos(n, xl, poziom) { var r = ROZMIAR[n], w = r[0] * sk * 1.08, h = r[1] * sk * 1.08; if (obr[n]) x.drawImage(obr[n], xl, poziom - h, w, h); }
      if (stan.faza === "pelna") { pos("budowniczy", S * 0.72, yD + 190); }
      else { pos("dzwig", koniec + 110, yD + 50); pos("koparka", koniec - 10, yD + 130); pos("walec", koniec - 300, yD + 134); pos("budowniczy", koniec - 96, yD + 192); }
      x.fillStyle = "#4f7a33"; x.fillRect(0, yD + DROGA_H * sk, S, S - yD - DROGA_H * sk);
      x.textAlign = "center"; x.textBaseline = "alphabetic"; x.shadowColor = "rgba(0,0,0,.45)"; x.shadowBlur = 16;
      var fontTytul = "'Bebas Neue', Inter, system-ui, sans-serif", rt = 92, tyt = dane.nazwa || "BiegaMy";
      try { await g.document.fonts.ready; } catch (e) {}
      x.font = "400 " + rt + "px " + fontTytul;
      while (x.measureText(tyt).width > S - 100 && rt > 40) { rt -= 4; x.font = "400 " + rt + "px " + fontTytul; }
      x.fillStyle = "#fff"; x.fillText(tyt, S / 2, 130);
      x.font = "400 210px " + fontTytul; x.fillText(U.formatKm(stan.km) + " km", S / 2, 340);
      x.font = "600 40px Inter, system-ui, sans-serif"; x.fillText("z " + U.formatKm(dane.cel_km || 12500) + " km · " + U.tekstPostepu(stan).split(" · ")[0], S / 2, 410);
      x.font = "600 36px Inter, system-ui, sans-serif"; x.fillText("biegamy.run", S / 2, S - 44);
      x.shadowBlur = 0;
      return new Promise(function (ok) { c.toBlob(function (b) { ok(b); }, "image/jpeg", 0.9); });
    }
    async function udostepnij() {
      if (!przyciskUdost) return;
      var etykieta = przyciskUdost.textContent;
      przyciskUdost.disabled = true; przyciskUdost.textContent = "Przygotowuję…";
      try {
        var blob = await obrazek();
        if (!blob) throw new Error("brak obrazka");
        var nazwa = "ulica-" + Math.round(stan.km) + "-km.jpg", nav = g.navigator;
        var plik = g.File ? new g.File([blob], nazwa, { type: "image/jpeg" }) : null;
        if (plik && nav && nav.canShare && nav.canShare({ files: [plik] })) {
          try { await nav.share({ files: [plik], title: dane.nazwa || "BiegaMy" }); return; } catch (e) { if (e && e.name === "AbortError") return; }
        }
        var u = g.URL.createObjectURL(blob), a = el("a", "", g.document.body);
        a.setAttribute("href", u); a.setAttribute("download", nazwa); a.click();
        a.parentNode.removeChild(a);
        zegary.push(g.setTimeout(function () { g.URL.revokeObjectURL(u); }, 4000));
      } catch (e) {
        przyciskUdost.textContent = "Nie udało się, spróbuj jeszcze raz";
        zegary.push(g.setTimeout(function () { if (przyciskUdost) { przyciskUdost.textContent = etykieta; } }, 2500));
        return;
      } finally { przyciskUdost.disabled = false; if (przyciskUdost.textContent === "Przygotowuję…") przyciskUdost.textContent = etykieta; }
    }

    /* start */
    budujUi();
    wyczysc(kontener);
    kontener.appendChild(korzen);
    zmierz();
    budujUlice();
    ustawPore(pora);
    kam.x = celKamery();
    kadr();
    okno.addEventListener("pointerdown", naDol);
    okno.addEventListener("pointermove", naRuch);
    okno.addEventListener("pointerup", naGore);
    okno.addEventListener("pointercancel", naGore);
    okno.addEventListener("click", naKlik, true);
    okno.addEventListener("keydown", naKlawisz);
    function naWidocznosc() { kartaWidoczna = !g.document.hidden; ostatni = 0; przelaczGre(); }
    function naRozmiar() { zmierz(); popchnij(); }
    g.document.addEventListener("visibilitychange", naWidocznosc);
    g.addEventListener("resize", naRozmiar);
    if (g.IntersectionObserver) {
      obs = new g.IntersectionObserver(function (w) {
        naEkranie = !!(w[w.length - 1] && w[w.length - 1].isIntersecting);
        /* Kafel mógł wstać na ukrytej sekcji Dziś: kadr na czoło budowy dopiero przy prawdziwej szerokości. */
        if (o.kafel && naEkranie && okno.clientWidth && okno.clientWidth !== szerOkna) { zmierz(); kam.x = celKamery(); kadr(); }
        przelaczGre();
      }, { threshold: 0.02 });
      obs.observe(okno);
    }
    var zegarPory = g.setInterval(function () { var p = U.poraDnia(new Date()); if (p !== pora) ustawPore(p); }, 60000);
    wjazdKoparki();

    /* Mur graczy z gry Cegiełki: tylko przy włączonej grze i po starcie akcji. Osobno od kilometrów, awaria = brak tabliczki, scena działa dalej. */
    if (!przed && !o.kafel && g.SB_URL && g.fetch) {
      g.fetch(g.SB_URL + "/functions/v1/gra-ranking", { headers: { Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (zniszczona || !d) return;
          /* Rowerzysta: za przełącznikiem, bez ruchu nie jeździ, bez pliku go nie ma. Rower nie liczy się do licznika. */
          if (d.rowerzysta === true && ruch) {
            var rw = el("img", "us-rowerzysta", ui);
            rw.setAttribute("alt", ""); rw.setAttribute("draggable", "false"); rw.style.setProperty("--koniec", (cw + 30) + "px");
            rw.onerror = function () { if (rw.parentNode) rw.parentNode.removeChild(rw); };
            rw.setAttribute("src", "assets/akcja/rowerzysta.webp");
          }
          if (d.aktywna !== true) return;
          var t = U.tekstMuru(d.mur, d.mur_cel);
          if (!t) return;
          var m = el("a", "us-mur-graczy", ui);
          el("span", "", m, t);
          if (d.pierwsze_cegly != null) el("span", "", m, "Pierwsze cegły: Szef");
          if (Number(d.mur_cel) > 0) { var pm = el("span", "us-mur-pasek", m), im = el("i", "", pm); im.style.width = U.procentMuru(d.mur, d.mur_cel) + "%"; }
          m.setAttribute("href", "gra-cegielki.html"); m.setAttribute("aria-label", t + ". Zagraj w Cegiełki.");
          /* Zdanie o zbiórce zaraz pod sceną: cegły z gry nie są pieniędzmi. Link tylko przez sito z js/akcja.mjs. */
          var zd = el("p", "us-opis us-zdanie", korzen, U.zdanieOZbiorce(licznik));
          var lz = g.BM_AKCJA && g.BM_AKCJA.linkZbiorki ? g.BM_AKCJA.linkZbiorki(licznik) : "";
          if (lz) { var az = el("a", "", zd, "Zbiórka ›"); az.setAttribute("href", lz); az.setAttribute("target", "_blank"); az.setAttribute("rel", "noopener noreferrer"); }
          if (przyciskUdost && przyciskUdost.parentNode === korzen) korzen.insertBefore(zd, przyciskUdost);
        }).catch(function () {});
    }

    /* Licznik co 5 min z rozrzutem, tylko przy widocznej karcie. Było co 30 s przy cache 60 s, czyli połowa zapytań na nic: 2000 oglądających dawało 240 tys. wywołań funkcji na godzinę, a plan Free ma 500 tys. na miesiąc. */
    var zegarLicznika = przed || !o.pokaz ? 0 : g.setInterval(function () {
      if (g.document.hidden || !g.BM_AKCJA || !g.BM_AKCJA.pobierzPubliczny) return;
      g.BM_AKCJA.pobierzPubliczny("dla-fabianka", { wymus: true }).then(function (d) { if (d && !zniszczona) o.pokaz(d); }).catch(function () {});
    }, 300000 + Math.random() * 60000);
    przelaczGre();
    popchnij();

    function zniszcz() {
      zniszczona = true;
      if (raf) g.cancelAnimationFrame(raf);
      raf = 0;
      if (obs) obs.disconnect();
      g.clearInterval(zegarPory); if (zegarLicznika) g.clearInterval(zegarLicznika);
      zegary.forEach(function (z) { g.clearTimeout(z); });
      g.document.removeEventListener("visibilitychange", naWidocznosc);
      g.removeEventListener("resize", naRozmiar);
      if (korzen.parentNode) korzen.parentNode.removeChild(korzen);
    }
    return { aktualizuj: aktualizuj, zniszcz: zniszcz, obrazek: obrazek, stan: function () { return stan; }, kamera: function () { return kam.x; }, pora: function () { return pora; }, swietuj: swietuj };
  }

  g.BM_ULICA_SCENA = { budynekFirmy: budynekFirmy, ceglaMuru: ceglaMuru, podgladFirmy: podgladFirmy, podgladCegly: podgladCegly, zamontuj: zamontuj, MAX_CZASTEK: MAX_CZASTEK, PARALAKSA: PARALAKSA, ODC: ODC };
})(typeof globalThis !== "undefined" ? globalThis : this);
