/* „Zapytaj" — UI okienka (M1 krok 4, M1-okienko-wykonanie.md pkt 6). Klasyczny skrypt po sb.js (bez modułów ES).
   - Pole #okienko-pole pod topbarem na Dziś → arkusz od dołu (.add-overlay/.add-sheet z theme.css, SSOT bottom-sheet).
   - Pytanie idzie do EF okienko (POST, token sesji tylko w nagłówku — nigdzie niezapisywany).
   - CAŁY tekst z serwera przez escapeHtml; link wyłącznie z akcja.nawiguj i tylko z listy EKRANY (ta sama lista co EF
     narzedzia.mjs — blizna-65 pilnuje zgodności); obcy adres = brak przycisku.
   - Stany: ładowanie (szkielet), pusto, 429 dzień/miesiąc (+ wyszukiwarka ekranów), 502/503, offline (tylko ekrany).
   - prefers-reduced-motion: arkusz bez animacji wjazdu (CSS niżej). Nazwa w UI: „Zapytaj" — bez słowa „AI" (v1). */
(function () {
  'use strict';

  var EKRANY = {
    dzis: 'zawodnik.html', plan: 'kalendarz.html?role=athlete', log: 'zawodnik.html?log=1', historia: 'zawodnik.html#log-list',
    forma: 'zawodnik.html?tab=forma', spolecznosc: 'zawodnik.html?tab=social', czat: 'zawodnik.html?tab=msgs',
    cialo: 'zawodnik.html?tab=cwiczenia', statystyki: 'zawodnik.html?tab=stats', profil: 'profil.html', jedzenie: 'nutrition.html',
    starty: 'races.html', wyzwania: 'wyzwania.html', odznaki: 'odznaki.html', radio: 'radio.html'
  };
  var NAZWY_EKRANOW = {
    dzis: 'Dziś', plan: 'Plan', log: 'Zapisz trening', historia: 'Ostatnie treningi', forma: 'Forma', spolecznosc: 'Społeczność',
    czat: 'Czat', cialo: 'Ćwiczenia', statystyki: 'Statystyki', profil: 'Profil', jedzenie: 'Jedzenie', starty: 'Starty',
    wyzwania: 'Wyzwania', odznaki: 'Odznaki', radio: 'Radio'
  };
  var PODPOWIEDZI = ['Kiedy mam start?', 'Ile przebiegłem w tym miesiącu?', 'Plan na jutro', 'Jakie mam odznaki?', 'Pokaż wyzwania',
    'Kto wygrał maraton w Berlinie?', 'Wyniki: imię i nazwisko'];
  var TEKSTY = {
    pusto: 'Nie mam tego w Twoich danych.',
    dzien: 'Na dziś koniec pytań — od jutra znowu. Ekrany dalej znajdę:',
    miesiac: 'Na ten miesiąc koniec pytań. Ekrany dalej znajdę:',
    blad: 'Nie dam rady teraz odpowiedzieć. Spróbuj za chwilę.',
    offline: 'Bez sieci nie odpowiem, ale ekrany znajdę:',
    niePasuje: 'Tego nie znajdę w aplikacji.',
    siecLimit: 'Na dziś koniec szukania w sieci — od jutra znowu. W aplikacji dalej znajdę:',
    siecPusto: 'Tego nie znalazłem w sieci.'
  };
  var KLUCZ_OSTATNIE = 'okienko_ostatnie', KLUCZ_PODPOWIEDZ = 'okienko_podpowiedz';

  function esc(s) { return window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function bezpiecznyCel(url) {
    if (typeof url !== 'string') return null;
    for (var k in EKRANY) if (EKRANY[k] === url) return url;
    return null;
  }
  function czytaj(k, d) { try { var v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function zapisz(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* Podpowiedź rotuje co OTWARCIE strony, nie w czasie (M1 pkt 6). */
  function podpowiedz() {
    var i = czytaj(KLUCZ_PODPOWIEDZ, -1);
    i = (typeof i === 'number' ? i + 1 : 0) % PODPOWIEDZI.length;
    zapisz(KLUCZ_PODPOWIEDZ, i);
    return PODPOWIEDZI[i];
  }

  function wyszukajEkrany(tekst) {
    var t = String(tekst || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
    var wynik = [];
    for (var k in NAZWY_EKRANOW) {
      var n = NAZWY_EKRANOW[k].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
      if (!t || n.indexOf(t) >= 0 || t.indexOf(n) >= 0) wynik.push(k);
    }
    return wynik.length ? wynik : Object.keys(NAZWY_EKRANOW);
  }
  function htmlEkranow(tekst) {
    return '<div class="okn-ekrany">' + wyszukajEkrany(tekst).map(function (k) {
      return '<button type="button" class="okn-chip" data-cel="' + esc(EKRANY[k]) + '">' + esc(NAZWY_EKRANOW[k]) + '</button>';
    }).join('') + '</div>';
  }

  /* Karty: wiersze w stylu istniejących list (trening z pigułką typu przez renderTypePill, start, wyzwanie z paskiem,
     odznaka) — tylko pola, które są; brak pola = brak elementu (LEKCJA „nie wiem ≠ nic"). */
  function kmTxt(x) { return String(Math.round(Number(x) * 10) / 10).replace('.', ','); }
  function dzienTxt(d) { var p = String(d || '').split('-'); return p.length === 3 ? Number(p[2]) + '.' + p[1] : ''; }
  function karta(k) {
    var d = (k && k.dane) || {};
    if (k.typ === 'trening') {
      var pill = (d.typ && typeof window.renderTypePill === 'function') ? window.renderTypePill(d.typ) : '<span>' + esc(d.typ || '') + '</span>';
      var bity = [];
      if (d.data) bity.push(esc(dzienTxt(d.data)));
      if (d.dystans_km != null || d.km != null) bity.push(esc(kmTxt(d.dystans_km != null ? d.dystans_km : d.km)) + ' km');
      if (d.tempo) bity.push(esc(d.tempo) + ' /km');
      if (d.czas_min) bity.push('~' + esc(d.czas_min) + ' min');
      return '<div class="okn-karta">' + pill + '<span class="okn-meta">' + bity.join(' · ') + '</span></div>';
    }
    if (k.typ === 'start') {
      var kiedy = d.dni_do === 0 ? 'dziś' : d.dni_do === 1 ? 'jutro' : (typeof d.dni_do === 'number' ? 'za ' + d.dni_do + ' dni' : '');
      return '<div class="okn-karta"><b>' + esc(d.nazwa || '') + '</b><span class="okn-meta">' + esc([dzienTxt(d.data), d.miasto, kiedy].filter(Boolean).join(' · ')) + '</span></div>';
    }
    if (k.typ === 'wyzwanie') {
      var p = Math.max(0, Math.min(100, Number(d.procent) || 0));
      return '<div class="okn-karta okn-karta--wyz"><b>' + esc(d.nazwa || '') + '</b><span class="okn-meta">' + esc(p) + '%</span>' +
        '<span class="okn-pasek"><span style="width:' + p + '%"></span></span></div>';
    }
    if (k.typ === 'odznaka') return '<div class="okn-karta"><b>' + esc(d.nazwa || 'Odznaka') + '</b><span class="okn-meta">' + esc(dzienTxt(d.data)) + '</span></div>';
    if (k.typ === 'osoba') return kartaOsoby(d);
    if (k.typ === 'wyniki') return kartaWynikow(d);
    return '';
  }

  /* M2b: karta osoby z aplikacji (tylko profile publiczne — filtr w EF). Przyciski wywołują ISTNIEJĄCE funkcje
     zawodnik.html po tapnięciu (openAthleteProfile, sendFriendFromSearch, openChatThread('peer')); id sprawdzone
     wzorcem UUID, przekazywane przez data-*, nigdy przez JS w atrybucie. */
  var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function kartaOsoby(d) {
    if (!RE_UUID.test(String(d.id || ''))) return '';
    var id = esc(d.id), nazwa = esc(d.nazwa || 'Biegacz');
    var znaj = d.znajomosc === 'znajomi' ? '<span class="okn-meta">✓ Znajomi</span>'
      : d.znajomosc === 'wyslano' ? '<span class="okn-meta">Zaproszenie wysłane</span>'
      : d.znajomosc === 'czeka' ? '<span class="okn-meta">Czeka na Twoją odpowiedź</span>'
      : '<button type="button" class="okn-chip" data-osoba="znajomy" data-id="' + id + '">Dodaj do znajomych</button>';
    return '<div class="okn-karta okn-karta--osoba"><b>' + nazwa + '</b><span class="okn-meta">profil w BiegaMy</span>' +
      '<div class="okn-ekrany"><button type="button" class="okn-chip" data-osoba="profil" data-id="' + id + '">Zobacz profil</button>' + znaj +
      '<button type="button" class="okn-chip" data-osoba="napisz" data-id="' + id + '" data-nazwa="' + nazwa + '">Napisz</button></div></div>';
  }
  function czasTxt(s) {
    s = Math.round(Number(s) || 0); if (!(s > 0)) return '';
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
  }
  function dataTxt(d) { var p = String(d || '').split('-'); return p.length === 3 ? Number(p[2]) + '.' + p[1] + '.' + p[0] : ''; }
  function startyTxt(n) {
    var d = n % 10, s = n % 100;
    return n + ' ' + (n === 1 ? 'start' : (d >= 2 && d <= 4 && (s < 12 || s > 14)) ? 'starty' : 'startów');
  }
  /* M2b: wyniki z maszyny wyników (F6) — „N startów · ostatni: … · najlepszy czas …" + 5 ostatnich + „Otwórz wyniki". */
  function kartaWynikow(d) {
    var glowa = [d.starty != null ? startyTxt(Number(d.starty)) : '',
      d.ostatni && d.ostatni.bieg ? 'ostatni: ' + d.ostatni.bieg + (d.ostatni.data ? ' (' + dataTxt(d.ostatni.data) + ')' : '') : '',
      d.najlepszy_czas && d.najlepszy_czas.czas_s ? 'najlepszy czas ' + czasTxt(d.najlepszy_czas.czas_s) + (d.najlepszy_czas.dystans_km ? ' na ' + kmTxt(d.najlepszy_czas.dystans_km) + ' km' : '') : ''].filter(Boolean);
    var lista = (Array.isArray(d.ostatnie) ? d.ostatnie.slice(0, 5) : []).map(function (r) {
      return '<li>' + esc([dataTxt(r.data), r.bieg, czasTxt(r.czas_s), r.miejsce ? 'miejsce ' + r.miejsce : ''].filter(Boolean).join(' · ')) + '</li>';
    }).join('');
    var inne = (Array.isArray(d.inne) ? d.inne : []).map(function (x) {
      return esc((x.nazwa || '') + (x.rocznik ? ' (' + x.rocznik + ')' : '') + (x.starty != null ? ', ' + startyTxt(Number(x.starty)) : ''));
    }).join(' · ');
    return '<div class="okn-karta okn-karta--wyniki"><b>' + esc((d.nazwa || '') + (d.rocznik ? ' (' + d.rocznik + ')' : '')) + '</b>' +
      '<span class="okn-meta">' + esc(glowa.join(' · ')) + '</span>' + (lista ? '<ul class="okn-wyniki">' + lista + '</ul>' : '') +
      (inne ? '<span class="okn-meta">Też w wynikach: ' + inne + '</span>' : '') +
      '<button type="button" class="okn-otworz" data-cel="' + esc(EKRANY.starty) + '">Otwórz wyniki</button></div>';
  }

  /* M2b: tryb „osoba" — zdania z sieci (gdy były: etykieta i źródła), potem karty osób i wyników. */
  function htmlOsoby(json) {
    var zdania = (Array.isArray(json.zdania) ? json.zdania : []).filter(function (z) { return typeof z === 'string' && z; }).slice(0, 4);
    var zrodla = (Array.isArray(json.zrodla) ? json.zrodla : []).map(function (z) {
      var h = (z && typeof window.safeExternalHref === 'function') ? window.safeExternalHref(z.url, { tylkoHttps: true }) : '';
      return h ? '<li><a href="' + h + '" target="_blank" rel="noopener noreferrer">' + esc(z.tytul || 'źródło') + '</a></li>' : '';
    }).filter(Boolean);
    var html = (zrodla.length ? '<p class="okn-etykieta-siec">z sieci</p>' : '') + zdania.map(function (z) { return '<p class="okn-zdanie">' + esc(z) + '</p>'; }).join('');
    if (zrodla.length) html += '<p class="okn-zrodla-tytul">Źródła:</p><ul class="okn-zrodla">' + zrodla.join('') + '</ul>';
    return html + (Array.isArray(json.karty) ? json.karty.slice(0, 5).map(karta).join('') : '');
  }

  /* Odpowiedź EF → HTML. Status HTTP i offline decydują o stanie; tekst modelu zawsze przez esc. */
  function htmlOdpowiedzi(status, json, tekst) {
    if (status === 'offline') return '<p class="okn-zdanie">' + esc(TEKSTY.offline) + '</p>' + htmlEkranow(tekst);
    if (status === 429) return '<p class="okn-zdanie">' + esc(json && json.limit === 'miesiac' ? TEKSTY.miesiac : json && json.limit === 'siec' ? TEKSTY.siecLimit : TEKSTY.dzien) + '</p>' + htmlEkranow(tekst);
    if (status !== 200 || !json) return '<p class="okn-zdanie">' + esc(TEKSTY.blad) + '</p>';
    if (json.tryb === 'siec' || json.tryb === 'siec-cache') return htmlSieci(json);
    if (json.tryb === 'osoba') return htmlOsoby(json);   // M2d: odpowiedź z pamięci wygląda jak z sieci (źródła te same)
    var cel = bezpiecznyCel(json.akcja && json.akcja.nawiguj);
    var zdania = Array.isArray(json.zdania) ? json.zdania.filter(function (z) { return typeof z === 'string' && z; }) : [];
    if (!zdania.length && !cel) zdania = [json.dopasowanie === false ? TEKSTY.niePasuje : TEKSTY.pusto];
    var html = zdania.slice(0, 2).map(function (z) { return '<p class="okn-zdanie">' + esc(z) + '</p>'; }).join('');
    html += (Array.isArray(json.karty) ? json.karty.slice(0, 5).map(karta).join('') : '');
    if (cel) html += '<button type="button" class="okn-otworz" data-cel="' + esc(cel) + '">Otwórz ›</button>';
    return html;
  }

  /* M2a: odpowiedź z sieci — etykieta „z sieci", zdania (≤ 3), „Źródła:" jako linki (tylko https przez
     safeExternalHref {tylkoHttps}, rel noopener, nowa karta). Bez kart i bez „Otwórz ›". Źródło bez https = pominięte. */
  function htmlSieci(json) {
    var zdania = (Array.isArray(json.zdania) ? json.zdania : []).filter(function (z) { return typeof z === 'string' && z; }).slice(0, 3);
    var zrodla = (Array.isArray(json.zrodla) ? json.zrodla : []).map(function (z) {
      var h = (z && typeof window.safeExternalHref === 'function') ? window.safeExternalHref(z.url, { tylkoHttps: true }) : '';
      return h ? '<li><a href="' + h + '" target="_blank" rel="noopener noreferrer">' + esc(z.tytul || 'źródło') + '</a></li>' : '';
    }).filter(Boolean);
    if (!zdania.length || !zrodla.length) return '<p class="okn-etykieta-siec">z sieci</p><p class="okn-zdanie">' + esc(TEKSTY.siecPusto) + '</p>';
    return '<p class="okn-etykieta-siec">z sieci</p>' + zdania.map(function (z) { return '<p class="okn-zdanie">' + esc(z) + '</p>'; }).join('') +
      '<p class="okn-zrodla-tytul">Źródła:</p><ul class="okn-zrodla">' + zrodla.join('') + '</ul>';
  }

  var historia = [];
  async function zapytaj(tekst) {
    tekst = String(tekst || '').trim().slice(0, 300);
    if (!tekst) return { status: 0, json: null };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'offline', json: null };
    var sesja = null;
    try { sesja = (await window.sb.auth.getSession()).data.session; } catch (e) {}
    if (!sesja) return { status: 401, json: null };
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, 20000) : null;
    try {
      var r = await fetch(window.SB_URL + '/functions/v1/okienko', {
        method: 'POST', signal: ctrl ? ctrl.signal : undefined, credentials: 'omit', cache: 'no-store',
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + sesja.access_token, 'apikey': window.SB_KEY },
        body: JSON.stringify({ tekst: tekst, ekran: 'home', historia: historia.slice(-3) })
      });
      var j = await r.json().catch(function () { return null; });
      if (r.status === 200 && j && Array.isArray(j.zdania) && j.zdania.length) historia.push({ q: tekst, a: j.zdania.join(' ').slice(0, 300) });
      return { status: r.status, json: j };
    } catch (e) {
      return { status: (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 502, json: null };
    } finally { if (t) clearTimeout(t); }
  }

  function chipy() {
    var ostatnie = czytaj(KLUCZ_OSTATNIE, []);
    var lista = PODPOWIEDZI.slice(0, 3).concat(Array.isArray(ostatnie) ? ostatnie.slice(0, 2) : []);
    var bylo = {};
    return lista.filter(function (q) { var k = String(q).toLowerCase(); if (bylo[k]) return false; bylo[k] = 1; return true; })
      .map(function (q) { return '<button type="button" class="okn-chip" data-pytanie="' + esc(q) + '">' + esc(q) + '</button>'; }).join('');
  }

  function el(id) { return document.getElementById(id); }
  async function wyslij(tekst) {
    var wynik = el('okienko-wynik'); if (!wynik) return;
    wynik.innerHTML = '<div class="okn-szkielet" aria-hidden="true"></div>';
    wynik.setAttribute('aria-busy', 'true');
    var o = await zapytaj(tekst);
    wynik.removeAttribute('aria-busy');
    wynik.innerHTML = htmlOdpowiedzi(o.status, o.json, tekst);
    var ost = czytaj(KLUCZ_OSTATNIE, []);
    if (!Array.isArray(ost)) ost = [];
    zapisz(KLUCZ_OSTATNIE, [tekst].concat(ost.filter(function (q) { return q !== tekst; })).slice(0, 5));
  }

  function otworz() {
    var ov = el('okienko-arkusz'); if (!ov) return;
    var ch = el('okienko-chipy'); if (ch) ch.innerHTML = chipy();
    ov.classList.add('open'); ov.setAttribute('aria-hidden', 'false');
    var we = el('okienko-tekst'); if (we) setTimeout(function () { try { we.focus(); } catch (e) {} }, 50);
  }
  function zamknij() { var ov = el('okienko-arkusz'); if (ov) { ov.classList.remove('open'); ov.setAttribute('aria-hidden', 'true'); } }

  /* Pole „Zapytaj" dla KAŻDEGO zalogowanego na Dziś (decyzja Filipa 1.11 13:33 — koniec trybu podglądu z parametru
     w adresie i klucza w pamięci przeglądarki). Wyjątek: podgląd trenera (?from=trener) — EF odpowiada danymi ZALOGOWANEGO, nie
     oglądanego zawodnika. dataset.wlaczone = pole podpięte (showSection w zawodnik.html odsłania tylko podpięte). */
  function podepnij() {
    var pole = el('okienko-pole'); if (!pole) return;
    if (new URLSearchParams(location.search).get('from') === 'trener') { pole.style.display = 'none'; return; }   // podgląd trenera: EF odpowiada danymi zalogowanego
    pole.dataset.wlaczone = '1';
    pole.style.display = '';
    var p = podpowiedz();
    var etk = el('okienko-podpowiedz'); if (etk) etk.textContent = p;
    var we = el('okienko-tekst'); if (we) we.setAttribute('placeholder', p);
    pole.addEventListener('click', otworz);
    var ov = el('okienko-arkusz');
    if (ov) ov.addEventListener('click', function (e) {
      if (e.target === ov) return zamknij();
      var b = e.target.closest ? e.target.closest('[data-pytanie],[data-cel],[data-osoba]') : null;
      if (!b) return;
      if (b.hasAttribute('data-osoba')) return akcjaOsoby(b);
      if (b.hasAttribute('data-pytanie')) { var q = b.getAttribute('data-pytanie'); if (we) we.value = q; wyslij(q); }
      else { var c = bezpiecznyCel(b.getAttribute('data-cel')); if (c) location.href = c; }
    });
    var f = el('okienko-form');
    if (f) f.addEventListener('submit', function (e) { e.preventDefault(); if (we && we.value.trim()) wyslij(we.value); });
    var x = el('okienko-zamknij'); if (x) x.addEventListener('click', zamknij);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') zamknij(); });
  }

  /* M2b: akcje karty osoby — istniejące funkcje zawodnik.html; brak funkcji = nic (np. na innej stronie). */
  function akcjaOsoby(b) {
    var id = b.getAttribute('data-id') || '', co = b.getAttribute('data-osoba');
    if (!RE_UUID.test(id)) return;
    if (co === 'znajomy') { if (typeof window.sendFriendFromSearch === 'function') window.sendFriendFromSearch(id, b); return; }
    zamknij();
    if (co === 'profil' && typeof window.openAthleteProfile === 'function') window.openAthleteProfile(id);
    if (co === 'napisz' && typeof window.openChatThread === 'function') {
      if (typeof window.showSection === 'function') window.showSection('msgs');
      var nazwa = b.getAttribute('data-nazwa') || null;
      setTimeout(function () { window.openChatThread('peer', id, nazwa); }, 400);
    }
  }

  window.OKIENKO = { zapytaj: zapytaj, htmlOdpowiedzi: htmlOdpowiedzi, bezpiecznyCel: bezpiecznyCel, wyszukajEkrany: wyszukajEkrany,
    podpowiedz: podpowiedz, otworz: otworz, zamknij: zamknij, EKRANY: EKRANY, TEKSTY: TEKSTY, akcjaOsoby: akcjaOsoby };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', podepnij); else podepnij();
})();
