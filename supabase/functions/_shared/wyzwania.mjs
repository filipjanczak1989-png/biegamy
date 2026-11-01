// WYZWANIA dla funkcji Edge (Deno) — KOPIA bloku `window.WYZWANIA` z sb.js (przeglądarka, zwykły skrypt bez modułów).
// sb.js jest źródłem; tę kopię pilnuje tests/blizna-64-okienko-narzedzia.test.js (te same losowe logi → ten sam postęp
// w obu kopiach). Zmiana w sb.js bez zmiany tutaj = czerwony test. Wzorzec jak reguly-treningow.mjs (bramka-reguly).
// Wygenerowane 1.11.2026 z sb.js; jedyna różnica: isRunType z _shared/reguly-treningow.mjs zamiast window.isRunType.
import { isRunType } from "./reguly-treningow.mjs";

    const WEEKLY = [

      {id:'tydzien_mocy',   badge:'tydzien_mocy',   title:'Tydzień mocy',       desc:'3 treningi w tym tygodniu',   target:3,  unit:'treningi', kind:'sessions',color:'#e8a040'},

      {id:'5_dni_ruchu',    badge:'5_dni_ruchu',     title:'5 dni ruchu',        desc:'5 treningów w tym tygodniu',  target:5,  unit:'treningi', kind:'sessions',color:'#5090e0'},

      {id:'weekend_runner', badge:'weekend_runner',  title:'Weekend runner',     desc:'2 treningi w weekend',        target:2,  unit:'sesje',    kind:'weekend', color:'#9a6fe8'},

      {id:'20km_tydzien',   badge:'20km_tydzien',    title:'20 km / tydzień',    desc:'20 km od poniedziałku',       target:20, unit:'km',       kind:'km',      color:'#3db870'},

      {id:'40km_tydzien',   badge:'40km_tydzien',    title:'40 km / tydzień',    desc:'40 km od poniedziałku',       target:40, unit:'km',       kind:'km',      color:'#e8b840'},

      {id:'60km_tydzien',   badge:'60km_tydzien',    title:'60 km / tydzień',    desc:'60 km od poniedziałku',       target:60, unit:'km',       kind:'km',      color:'#FC4C02'},

      {id:'80km_tydzien',   badge:'80km_tydzien',    title:'80+ km / tydzień',   desc:'80 km od poniedziałku',       target:80, unit:'km',       kind:'km',      color:'#ff4444'},

      {id:'szybki_tydzien', badge:'szybki_tydzien',  title:'Dwa akcenty',       desc:'2× tempo lub interwały',      target:2,  unit:'akcenty',  kind:'jakosc',   color:'#FC4C02'},

      {id:'3_dni_pod_rzad', badge:'3_dni_pod_rzad',  title:'3 dni pod rząd',     desc:'3 kolejne dni treningów',     target:3,  unit:'dni',      kind:'streak',  color:'#e8b840'},

      {id:'forma_rosnie',   badge:'forma_rosnie',    title:'Forma rośnie',       desc:'4 treningi w tym tygodniu',   target:4,  unit:'treningi', kind:'sessions',color:'#3db870'},

      {id:'bez_skipa',      badge:'bez_skipa',       title:'Bez skipa',          desc:'4 dni, żadnej przerwy >2 dni', target:4,  unit:'dni',      kind:'altdays', color:'#aac8ff'},

      {id:'mieszany_ogien', badge:'mieszany_ogien',  title:'Mieszany ogień',     desc:'Easy + Tempo + Interwały',    target:3,  unit:'typy',     kind:'mix',     color:'#FC4C02'},

    ];



    // Wyzwania miesięczne — powiązane z odznakami

    const MONTHLY = [

      {id:'50km_miesiaca',  badge:'50km_miesiaca',  title:'50 km miesiąca',    desc:'50 km w tym miesiącu',       target:50,  unit:'km',       kind:'mkm',     color:'#3db870'},

      {id:'100km_miesiaca', badge:'100km_miesiaca', title:'100 km miesiąca',   desc:'100 km w tym miesiącu',      target:100, unit:'km',       kind:'mkm',     color:'#e8b840'},

      {id:'200km_miesiaca', badge:'200km_miesiaca', title:'200 km miesiąca',   desc:'200 km w tym miesiącu',      target:200, unit:'km',       kind:'mkm',     color:'#FC4C02'},

      {id:'15_treningow',   badge:'15_treningow',   title:'15 treningów',      desc:'15 treningów w miesiącu',    target:15,  unit:'treningi', kind:'msess',   color:'#5090e0'},

      {id:'20_treningow',   badge:'20_treningow',   title:'20 treningów',      desc:'20 treningów w miesiącu',    target:20,  unit:'treningi', kind:'msess',   color:'#9a6fe8'},

      {id:'maraton_m',      badge:'maraton_m',      title:'Maraton miesiąca',  desc:'42 km łącznie w miesiącu',   target:42,  unit:'km',       kind:'mkm',     color:'#e8a040'},

    ];
  function okres(teraz){
    var now = teraz || new Date();
    var dow = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0=pn
    var wS = new Date(now); wS.setDate(now.getDate() - dow); wS.setHours(0,0,0,0);
    var mS = new Date(now.getFullYear(), now.getMonth(), 1);
    var weekNum = Math.floor((wS - new Date(wS.getFullYear(),0,1)) / 604800000);
    return { wS: wS, mS: mS, weekNum: weekNum };
  }
  // 3 tygodniowe (rotacja) + 2 miesięczne (rotacja)
  function aktywne(teraz){
    var o = okres(teraz), weekNum = o.weekNum;
    return { wS: o.wS, mS: o.mS,
      tydzien: [WEEKLY[weekNum % WEEKLY.length], WEEKLY[(weekNum + 3) % WEEKLY.length], WEEKLY[(weekNum + 7) % WEEKLY.length]],
      miesiac: [MONTHLY[Math.floor(weekNum/4) % MONTHLY.length], MONTHLY[(Math.floor(weekNum/4)+1) % MONTHLY.length]] };
  }
  function postep(all, teraz){
    all = all || [];
    var wS = okres(teraz).wS;
    var wl = all.filter(function(l){ return new Date(l.logged_at) >= wS; });
    /* ⚠️ KM JAK W PRZYZNAWANIU (checkBadges, zawodnik.html): tydzień liczy TYLKO biegi (isRunType), miesiąc — wszystko.
       Do 31.10 dwie kopie liczyły inaczej: zawodnik.html obie sumy z biegów, wyzwania.html obie ze wszystkiego — pasek
       rozjeżdżał się z odznaką (rower dobijał tydzień do 100 %, a odznaka nie przychodziła). Asymetria tydzień/miesiąc
       to stan PRZYZNAWANIA, zgłoszony Filipowi jako zaległość — pasek ma mówić to, co zrobi odznaka. */
    var bieg = function(l){ return isRunType(l.training_type); };
    var wkm = wl.reduce(function(s,l){ return s+(bieg(l) ? (parseFloat(l.distance_km)||0) : 0); }, 0);
    var mkm = all.reduce(function(s,l){ return s+(parseFloat(l.distance_km)||0); }, 0);
    var wsess = wl.length, msess = all.length;
    var wknd = wl.filter(function(l){ var d = new Date(l.logged_at).getDay(); return d===6||d===0; }).length;
    /* „Dwa akcenty" liczy JEDNOSTKI JAKOSCIOWE, nie same tempowe: generator planu daje JEDEN akcent na tydzien
       i na przemian Tempo/Interwaly, wiec wyzwanie wymagajace dwoch TEMPOWYCH przeczylo planowi. */
    var wJakosc = wl.filter(function(l){ return l.training_type==='Tempo' || l.training_type==='Interwały'; }).length;
    var wDays = Array.from(new Set(wl.map(function(l){ return l.logged_at.slice(0,10); }))).sort();
    /* Najwieksza przerwa miedzy dniami z treningiem — „bez_skipa" mierzy REGULARNOSC, nie sume dni. */
    var wLuka = 0;
    for (var i = 1; i < wDays.length; i++) {
      var l2 = Math.round((new Date(wDays[i]) - new Date(wDays[i-1])) / 86400000);
      if (l2 > wLuka) wLuka = l2;
    }
    var streak = 0, prev = null;
    wDays.forEach(function(d){
      if (!prev) { streak = 1; }
      else { streak = Math.round((new Date(d)-new Date(prev))/86400000)===1 ? streak+1 : 1; }
      prev = d;
    });
    function wProg(ch){
      if (ch.kind==='km')       return wkm;
      if (ch.kind==='sessions') return wsess;
      if (ch.kind==='weekend')  return wknd;
      if (ch.kind==='streak')   return streak;
      if (ch.kind==='jakosc')   return wJakosc;   /* tempo LUB interwaly */
      /* ⚠️ POSTEP POKAZUJE DNI, ale prog zalicza sie TYLKO przy zachowanej regularnosci — przerwa dluzsza
         niz 2 dni trzyma postep pod progiem. */
      if (ch.kind==='altdays')  return wLuka <= 2 ? wDays.length : Math.min(wDays.length, ch.target - 1);
      if (ch.kind==='mix') {
        var types = new Set(wl.map(function(l){ return l.training_type; }));
        return [types.has('Spokojny'),types.has('Tempo'),types.has('Interwały')].filter(Boolean).length;
      }
      return 0;
    }
    var progMap = {};
    WEEKLY.forEach(function(ch){ progMap[ch.id] = wProg(ch); });
    MONTHLY.forEach(function(ch){ progMap['m_'+ch.id] = ch.kind==='mkm' ? mkm : msess; });
    return progMap;
  }
  function pct(ch, prog){ return Math.min(100, Math.round((prog||0) / ch.target * 100)); }
  /* Kafel: % NAJBLIŻSZEGO ukończenia (< 100) spośród aktywnych. Wszystkie ukończone albo brak logów → null
     (kafel bez sygnału — nie „0 %", LEKCJA „nie wiem ≠ nic"). */
  function najblizsze(all, teraz){
    var A = aktywne(teraz), p = postep(all, teraz), best = null;
    A.tydzien.forEach(function(ch){ var v = pct(ch, p[ch.id]); if (v > 0 && v < 100 && (best === null || v > best)) best = v; });
    A.miesiac.forEach(function(ch){ var v = pct(ch, p['m_'+ch.id]); if (v > 0 && v < 100 && (best === null || v > best)) best = v; });
    return best;
  }
export const WYZWANIA = { WEEKLY, MONTHLY, okres, aktywne, postep, pct, najblizsze };
