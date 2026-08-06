// ════════════════════════════════════════════════════════════════════
// BiegaMy — Supabase client + Push helpers (single source of truth)
// ════════════════════════════════════════════════════════════════════
// Załączany w <head> KAŻDEJ strony PO supabase-js CDN:
//
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   <script src="sb.js" defer></script>
//
// Eksponuje globalnie:
//   window.SB_URL, SB_KEY, SB_FN_URL — config
//   window.sb — klient Supabase
//   window.assetUrl(path) — URL do publicznego pliku w biegamy-assets
//   window.VAPID_PUBLIC_KEY — public key (NIE secret, OK w przeglądarce)
//   window.isPushSupported() / getPushPermission() / isPushSubscribed()
//   window.subscribeToPush(athleteId) / window.unsubscribeFromPush()
//   window.escapeHtml(s) — anti-XSS escape
//   window.renderMessageBody(rawBody) — bezpieczny render wiadomości czatu
//   window.renderAIReportCard(r, opts) — pigułka raportu AI (panel/modal)
//   window.safeUrlAttr(url) — escape URL dla atrybutu src/href (whitelist hostów, https-only)
//   window.safeExternalHref(url) — escape URL dla <a href> do linków zewnętrznych (https/http-only, bez whitelisty hostów)
//   window.LOG — production-silent console (debug/log/info/warn → no-op na prod)
//   window.showToast(msg, type) — toast UI zamiast alert()
//   window.QUOTES_LIBRARY — biblioteka cytatów (64, {text, author}) — single source of truth (zawodnik/raporty/kalendarz)
//   window.getDailyQuote(offsetDays=0) — 1 cytat per dzień (deterministyczny seed YYYYMMDD)
//   window.getDailyQuoteSet(count=5) — N deterministycznie zshuffle'owanych cytatów (Mulberry32)
// ════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  window.SB_URL = 'https://afqojgkaveykxbltxzwm.supabase.co';
  window.SB_KEY = 'sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY';
  window.SB_FN_URL = window.SB_URL + '/functions/v1';

  // ─── ASSET URL HELPER ───────────────────────────────────────────────
  // Buduje URL do repo GH Pages filipjanczak1989-png/biegamy-assets.
  // UWAGA: to NIE jest bucket Supabase o tej samej nazwie — to dwa różne byty pod jedną nazwą.
  // W buckecie Supabase klient pisze WYŁĄCZNIE pod avatars/{athletes.id}.{ext}; wszystko inne
  // (banery, karty, ikony, portrety) czytamy stąd, z GH Pages. Grep po „biegamy-assets" łapie oba.
  // Użycie: assetUrl('banner1.webp') → https://filipjanczak1989-png.github.io/biegamy-assets/banner1.webp
  window.assetUrl = function(path) {
    if (!path) return '';
    const clean = String(path).replace(/^\/+/, '');
    return 'https://filipjanczak1989-png.github.io/biegamy-assets/' + clean;
  };

  // ─── Ukryj przełączniki karuzel globalnie (strzałki ‹ › + kropki) ──────────
  // Auto-rotacja zostaje — chowamy tylko manualny switcher.
  // Obejmuje: hero (Dziś), p-hero (profil), quote (nutrition), banner (raporty).
  (function hideCarouselSwitchers(){
    try {
      const css = '[onclick*="_heroPrev"],[onclick*="_heroNext"],#hero-dots,'
        + '[onclick*="_pHeroPrev"],[onclick*="_pHeroNext"],#p-hero-dots,'
        + '#quote-dots,#banner-dots{display:none !important;}';
      const s = document.createElement('style');
      s.id = 'hide-carousel-switchers';
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    } catch(e){}
  })();

  // ─── IKONY 3D — helper + auto-resolver data-ic ──────────────────────
  // icHtml('act-save', 16, 'margin-right:6px;') → <img ...> (do JS-innerHTML)
  // Statyczny HTML: <img data-ic="icon-act-save.webp"> → resolver ustawia src na load.
  window.icHtml = window.icHtml || function(slug, size, extra) {
    if (!window.assetUrl) return '';
    size = size || 16;
    return '<img src="' + window.assetUrl('icon-' + slug + '.webp') + '" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;vertical-align:middle;flex-shrink:0;' + (extra || '') + '" alt="">';
  };
  (function resolveDataIc(){
    function run(){ try { document.querySelectorAll('img[data-ic]').forEach(function(el){ if(el.dataset.ic) el.src = window.assetUrl(el.dataset.ic); }); } catch(e){} }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  })();

  // ⚠️ VAPID PUBLIC KEY
  // To NIE jest secret — może być publicznie widoczne.
  window.VAPID_PUBLIC_KEY = 'BATC1Y7rglazNCcKQXV1bqaNA_SnxC3003c5_eSKDBaUykhbZSUevTQDL-KMyVDs55oNBJogJkx4g_5irwUObTk';

  // Klient Supabase (tylko jeśli SDK jest załadowane)
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    window.sb = window.supabase.createClient(window.SB_URL, window.SB_KEY);
  }

  // ─── PUSH NOTIFICATIONS HELPERS ─────────────────────────────────────

  // Konwersja base64url → Uint8Array (wymagane przez PushManager.subscribe)
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Czy przeglądarka wspiera push?
  window.isPushSupported = function() {
    return 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window;
  };

  // Aktualny status uprawnień (default | granted | denied | unsupported)
  window.getPushPermission = function() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  };

  // Czy aktualnie mamy aktywną subskrypcję?
  window.isPushSubscribed = async function() {
    if (!window.isPushSupported()) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch (e) { return false; }
  };

  // SUBSCRIBE — pyta o pozwolenie i zapisuje endpoint do bazy
  window.subscribeToPush = async function(athleteId) {
    if (!window.isPushSupported()) {
      return { ok: false, error: 'Twoja przeglądarka nie wspiera powiadomień' };
    }
    if (!athleteId) {
      return { ok: false, error: 'Brak athlete_id' };
    }
    if (!window.VAPID_PUBLIC_KEY || window.VAPID_PUBLIC_KEY === 'TUTAJ_WKLEJ_VAPID_PUBLIC_KEY') {
      return { ok: false, error: 'VAPID_PUBLIC_KEY nie skonfigurowany w sb.js' };
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { ok: false, error: 'Pozwolenie odrzucone przez użytkownika' };
      }

      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();

      let sub;
      if (existing) {
        sub = existing;
      } else {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY),
        });
      }

      const subJson = sub.toJSON();
      const { error } = await window.sb.from('push_subscriptions').upsert({
        athlete_id: athleteId,
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
        user_agent: navigator.userAgent.slice(0, 200),
      }, { onConflict: 'endpoint' });

      if (error) {
        console.warn('[push] save failed:', error.message);
        return { ok: false, error: 'Nie udało się zapisać: ' + error.message };
      }

      return { ok: true };
    } catch (e) {
      console.error('[push] subscribe error:', e);
      return { ok: false, error: e.message || 'Błąd subskrypcji' };
    }
  };

  // UNSUBSCRIBE — usuwa subskrypcję z przeglądarki i bazy
  window.unsubscribeFromPush = async function() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await window.sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  // ─── PUSH AUTO-HEAL (W3, 2026-05-26): reconcile DB vs aktualna subskrypcja ──
  // Wołane po initAuth (gdy znamy athleteId) + po SW 'push-resubscribed'.
  // Tylko gdy permission=granted (NIGDY nie promptuje). Upsert-only (nie kasuje
  // innych endpointów → ochrona multi-device; stale czyści send-push EF na 410).
  window.reconcilePushSubscription = async function(athleteId) {
    if (!athleteId || !window.isPushSupported()) return;
    if (Notification.permission !== 'granted') { console.log('[push reconcile] skipped (permission denied/not subscribed)'); return; }
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        // przeglądarka zgubiła subskrypcję — re-subscribe (permission już granted → brak promptu)
        try {
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY) });
        } catch (e) { console.warn('[push reconcile] re-subscribe failed', e); return; }
      }
      const subJson = sub.toJSON();
      const { data: rows } = await window.sb.from('push_subscriptions').select('endpoint').eq('athlete_id', athleteId);
      const eps = (rows || []).map(r => r.endpoint);
      if (eps.includes(subJson.endpoint)) {
        await window.sb.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('athlete_id', athleteId).eq('endpoint', subJson.endpoint);
        console.log('[push reconcile] match');
      } else {
        const { error } = await window.sb.from('push_subscriptions').upsert({
          athlete_id: athleteId,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
          user_agent: navigator.userAgent.slice(0, 200),
          last_used_at: new Date().toISOString(),
        }, { onConflict: 'endpoint' });
        if (error) console.warn('[push reconcile] upsert failed:', error.message);
        else console.log(eps.length ? '[push reconcile] upserted (endpoint changed)' : '[push reconcile] upserted (new)');
      }
    } catch (e) { console.warn('[push reconcile] error', e); }
  };

  // SW → main thread: po pushsubscriptionchange SW prosi o authenticated persist.
  // Strony ustawiają window._pushAthleteId (initAuth) — tu używamy go do reconcile.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'push-resubscribed' && window._pushAthleteId) {
        console.log('[push reconcile] SW push-resubscribed → reconcile');
        window.reconcilePushSubscription(window._pushAthleteId);
      }
    });
  }

  // ─── SECURITY: HTML escape (anti-XSS) ───────────────────────────────
  // Używaj WSZĘDZIE gdzie wstawiasz user-content do innerHTML
  // np. ${escapeHtml(m.body)}, ${escapeHtml(g.name)}
  window.escapeHtml = function(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // ─── PACE — format + normalizacja (SSOT; był fork kalendarz/zawodnik/wtpl) ───
  // normalizePaceInput MUSI być zdef. PRZED normalizePlanPace (druga woła pierwszą).
  // Normalizacja pace przy ZAPISIE (LOG, strict M:SS). "6:60"->"7:00" (carry),
  // "7:0"->"7:00" (pad), "7,34"/"7.34"->"7:34" (separator), "530"->"5:30", śmieci->null.
  window.normalizePaceInput = function(raw){
    if(raw==null) return null;
    let s=String(raw).trim();
    if(!s) return null;
    s=s.replace(/[.,]/g,':').replace(/\s+/g,'');   // , . -> :  (ujednolić separator, wyciąć spacje)
    let min, sec;
    if(s.includes(':')){
      const p=s.split(':');
      if(p.length!==2 || !/^\d{1,2}$/.test(p[0]) || !/^\d{0,2}$/.test(p[1])) return null;
      min=parseInt(p[0],10); sec=p[1]===''?0:parseInt(p[1],10);
    } else if(/^\d{1,2}$/.test(s)){        // same minuty
      min=parseInt(s,10); sec=0;
    } else if(/^\d{3,4}$/.test(s)){        // bez separatora: ostatnie 2 = sekundy
      sec=parseInt(s.slice(-2),10); min=parseInt(s.slice(0,-2),10);
    } else return null;                    // bezsens -> null (nie zgadujemy)
    if(isNaN(min)||isNaN(sec)) return null;
    if(sec>=60){ min+=Math.floor(sec/60); sec=sec%60; }   // carry sekund >=60
    if(min<0||min>99) return null;
    return min+':'+String(sec).padStart(2,'0');
  };
  // Wersja dla PLANU/SZABLONU (trainings.pace / target_pace): plan LEGALNIE trzyma
  // zakresy/free-text AI ("6:00-6:15/km", "tempo startowe") — TYCH nie ruszamy.
  // Normalizujemy TYLKO goły pojedynczy token; śmieci->null.
  window.normalizePlanPace = function(s){
    if(s==null) return null;
    const t=String(s).trim();
    if(!t) return null;
    if(/[-/a-zA-Z\s]/.test(t)) return t;   // zakres/opis/jednostka -> przepuść bez zmian
    return normalizePaceInput(t);          // goły token -> normalizuj (window.normalizePaceInput, global)
  };
  // Live oninput format M:SS — tempo /km. ':' przed ostatnimi 2 cyframi (sekundy) ->
  // dziala dla 2-cyfr. minut (1030->10:30, nie 1:03); cap 4 cyfry.
  window.autoColonPace = function(el){let v=el.value.replace(/[^0-9]/g,"").slice(0,4);if(v.length>=3)v=v.slice(0,-2)+":"+v.slice(-2);el.value=v;};
  // Live oninput format MM:SS — czasy PB 5k/10k (2-cyfr. minuty): ':' PO 2 cyfrach, cap 5
  // -> "4530"->"45:30", "2200"->"22:00". (Byl fork: autoColonResult zawodnik + autoColonShort trener.)
  window.autoColonResult = function(el){let v=el.value.replace(/[^0-9]/g,"");if(v.length>=3)v=v.slice(0,2)+":"+v.slice(2);el.value=v.slice(0,5);};
  // Live oninput format H:MM:SS — czasy biegu/PB. Model "od prawej" (ostatnie 2=sek), cap 6 cyfr:
  // >=5 cyfr -> H:MM:SS/HH:MM:SS; >=3 -> M:SS/MM:SS. "530"->"5:30", "104500"->"10:45:00".
  // (Byl fork rozjechany: autoColonTime zawodnik/narzedzia + kalAutoColonTime kalendarz + autoColon trener.)
  window.autoColonTime = function(el){let v=el.value.replace(/[^0-9]/g,"").slice(0,6);if(v.length>=5)v=v.slice(0,-4)+":"+v.slice(-4,-2)+":"+v.slice(-2);else if(v.length>=3)v=v.slice(0,-2)+":"+v.slice(-2);el.value=v;};
  // OUTPUT-formatter (secs->string DISPLAY; odwrotnosc autocolon-input). h>0 ? H:MM:SS : M:SS.
  // Render pace/splitow/VDOT/stref (narzedzia+zawodnik). (Byl fork bajt-identyczny x2.)
  window._secsToTime = function(secs){secs=Math.round(secs);const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60),s=secs%60;return h>0?h+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0"):m+":"+String(s).padStart(2,"0");};

  // ── UI helper: type pill renderer (anti-XSS) ──────────────────────
  // Renderuje pigułkę z typem treningu (kolor + ikonka SVG + tekst).
  // Używana w karcie loga, modal-u treningu, week-strip i kalendarzu.
  // Type escape'owany defensywnie — bo to user-input z athletes.training_type.
  function renderTypePill(type, opts) {
    if (!type) return '';
    opts = opts || {};
    const size = opts.size || 'md';
    const map = {
      'Spokojny':       {color:'#5090e0', icon:'<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9.5" x2="9.01" y2="9.5"/><line x1="15" y1="9.5" x2="15.01" y2="9.5"/>'},
      'Bieg spokojny':  {color:'#5090e0', icon:'<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9.5" x2="9.01" y2="9.5"/><line x1="15" y1="9.5" x2="15.01" y2="9.5"/>'},
      'Interwały':      {color:'#e8b840', icon:'<polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'},
      'Tempo':          {color:'#f06030', icon:'<circle cx="12" cy="13" r="8"/><polyline points="12 9 12 13 15 15"/><line x1="9" y1="3" x2="15" y2="3"/>'},
      'Wybieganie':     {color:'#3db870', icon:'<path d="M3 18 C 6 14, 9 10, 12 10 C 15 10, 18 14, 21 18"/><path d="M9 14 L 9 14.5"/><path d="M15 14 L 15 14.5"/>'},
      'Regeneracja':    {color:'#9a6fe8', icon:'<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'},
      'Wzmacniający':   {color:'#f0a830', icon:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'},
      'Spacer':         {color:'#7fa8d0', icon:'<circle cx="13" cy="4" r="2"/><path d="M13 7v5l-2 3v6"/><path d="M13 12l3 2v5"/><path d="M9 21l2-6"/>'},
      'Rower':          {color:'#5bbf8a', icon:'<circle cx="6" cy="17" r="4"/><circle cx="18" cy="17" r="4"/><path d="M6 17L10 8h5l3 9"/><path d="M10 8L8 5h3"/>'},
      'Pływanie':       {color:'#4aa8d8', icon:'<path d="M2 16c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0"/><path d="M2 20c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0"/><circle cx="16" cy="8" r="2"/><path d="M6 12l6-4 3 2"/>'},
      'Siłownia':       {color:'#d08a5b', icon:'<path d="M6.5 6.5v11"/><path d="M17.5 6.5v11"/><path d="M3 9v6"/><path d="M21 9v6"/><path d="M6.5 12h11"/>'},
      'Zastępczy':      {color:'#888888', icon:'<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'},
      'Start':          {color:'#3db870', icon:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>'},
      'Odpoczynek':     {color:'#888888', icon:'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'},
    };
    const m = map[type] || {color:'#888888', icon:'<circle cx="12" cy="12" r="9"/>'};
    const padX = size==='sm' ? '5px 9px 5px 5px' : '6px 12px 6px 6px';
    const iconBoxSize = size==='sm' ? '18px' : '24px';
    const iconSize = size==='sm' ? '12' : '14';
    const fontSize = size==='sm' ? '9px' : '10px';
    const gap = size==='sm' ? '6px' : '8px';
    const radius = size==='sm' ? '6px' : '8px';
    return `<span style="display:inline-flex;align-items:center;gap:${gap};background:linear-gradient(90deg,#1a1a1a,#0d0d0d);border:1px solid ${m.color}88;border-radius:${radius};padding:${padX};box-shadow:0 0 8px ${m.color}26;color:#fff;font-family:'DM Mono',monospace;flex-shrink:0;">
      <span style="width:${iconBoxSize};height:${iconBoxSize};border-radius:5px;background:${m.color}2e;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="${m.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${m.icon}</svg>
      </span>
      <span style="font-size:${fontSize};letter-spacing:0.12em;text-transform:uppercase;font-weight:500;">${(window.escapeHtml||String)(type)}</span>
    </span>`;
  }
  window.renderTypePill = renderTypePill;

  // ── UI helper: AI report card renderer ────────────────────────────
  // Renderuje kartę raportu AI (klikalną → openAIReportModal).
  // opts.mode: 'verbose' (panel trenera — typ-meta, badge wysłany/opinia)
  //          | 'compact' (modal zawodnika — minimal) — default 'compact'.
  // opts.cardBg: override tła (default zależy od mode).
  // Wymaga: window.escapeHtml, openAIReportModal (handler w callerze).
  function renderAIReportCard(r, opts) {
    opts = opts || {};
    const isVerbose = opts.mode === 'verbose';
    const cardBg = opts.cardBg || (isVerbose ? 'rgba(255,255,255,0.03)' : 'var(--card2)');

    const date = new Date(r.generated_at).toLocaleDateString('pl-PL', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});

    const priorityColors = {
      red:    { bg: 'rgba(224,80,80,0.15)', fg: '#e05050' },
      yellow: { bg: 'rgba(232,172,30,0.15)', fg: '#e8ac1e' },
      green:  { bg: 'rgba(61,184,112,0.15)', fg: '#3db870' }
    };
    const priorityText = isVerbose
      ? { red: '🚨 PILNE', yellow: '⚠ UWAGA', green: '✓ OK' }
      : { red: 'PILNE', yellow: 'UWAGA', green: 'OK' };
    const pc = priorityColors[r.priority] || priorityColors.green;
    const pt = priorityText[r.priority] || priorityText.green;
    const isUnread = !r.read_by_coach;

    let typeMeta = '', sentBadge = '', feedbackBadge = '';
    if (isVerbose) {
      const typeIcon  = r.report_type === 'daily' ? '📅' : r.report_type === 'weekly' ? '📊' : r.report_type === 'monthly' ? '📈' : '📄';
      const typeLabel = r.report_type === 'daily' ? 'Dzienny' : r.report_type === 'weekly' ? 'Tygodniowy' : r.report_type === 'monthly' ? 'Miesięczny' : 'Raport';
      typeMeta = '<span style="font-size:14px;">' + typeIcon + '</span>'
               + '<span style="font-size:10px;color:var(--muted);font-family:DM Mono,monospace;letter-spacing:0.05em;">' + typeLabel + '</span>';
      sentBadge = (r.visible_to_athlete && r.sent_at)
        ? '<span style="font-size:9px;padding:3px 8px;border-radius:6px;font-family:DM Mono,monospace;background:rgba(139,92,246,0.15);color:#a78bfa;letter-spacing:0.06em;">📤 WYSŁANY</span>'
        : '';
      feedbackBadge = (r.athlete_feedback || r.athlete_reaction)
        ? '<span style="font-size:9px;padding:3px 8px;border-radius:6px;font-family:DM Mono,monospace;background:rgba(232,86,30,0.15);color:#e8561e;letter-spacing:0.06em;font-weight:600;">💬 OPINIA</span>'
        : '';
    }

    const headerFlexWrap = isVerbose ? 'flex-wrap:wrap;' : '';

    return '<div onclick="openAIReportModal(\'' + r.id + '\')" style="background:' + cardBg + ';border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;cursor:pointer;transition:border-color 0.15s;" onmouseover="this.style.borderColor=\'rgba(139,92,246,0.4)\'" onmouseout="this.style.borderColor=\'var(--border)\'">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;' + headerFlexWrap + '">'
        + typeMeta
        + '<span style="background:' + pc.bg + ';color:' + pc.fg + ';font-size:9px;padding:3px 8px;border-radius:6px;font-family:DM Mono,monospace;font-weight:600;letter-spacing:0.08em;">' + pt + '</span>'
        + sentBadge
        + feedbackBadge
        + (isUnread ? '<span style="width:6px;height:6px;border-radius:50%;background:var(--accent);"></span>' : '')
        + '<span style="font-size:10px;color:var(--muted);font-family:DM Mono,monospace;margin-left:auto;">' + date + '</span>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--fg);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + window.escapeHtml(r.summary || 'Raport AI') + '</div>'
    + '</div>';
  }
  window.renderAIReportCard = renderAIReportCard;

  // ─── MESSAGE RENDERING (czat: tekst + obrazki + voice + GIF) ────────
  // Bezpiecznie renderuje treść wiadomości z czata.
  // Obsługuje: obrazki (stary i nowy format), voice messages, cofnięte wiadomości.
  // Pozostały tekst escapowany (anti-XSS).
  // Whitelist hostów media: Supabase, GitHub Pages, Tenor (media*.tenor.com), Giphy (media*.giphy.com).
  function _isSafeMediaUrl(url) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:') return false;
      const h = u.hostname;
      return /^media\d*\.tenor\.com$/.test(h)
          || /^media\d*\.giphy\.com$/.test(h)
          || h === 'afqojgkaveykxbltxzwm.supabase.co'
          || h === 'filipjanczak1989-png.github.io';
    } catch {
      return false;
    }
  }
  function _renderImgTag(url) {
    const safe = window.escapeHtml(url);
    return '<img src="' + safe + '" style="max-width:100%;border-radius:8px;margin:2px 0;display:block;cursor:pointer;" onclick="window.open(\'' + safe + '\',\'_blank\')" />';
  }
  window.renderMessageBody = function(rawBody) {
    if (!rawBody) return '';
    const body = String(rawBody);

    // 1. Wiadomość cofnięta — NIE ufamy zapisanemu HTML. Recall nie ma żadnych
    //    zmiennych danych, więc zwracamy STAŁY bezpieczny HTML i ignorujemy
    //    cokolwiek było w body (defense: nawet '<span class="msg-recall"><img
    //    onerror=…></span>' renderuje się jako zwykłe "cofnięta"). [stored XSS fix #1]
    if (body.startsWith('<span class="msg-recall">') && body.endsWith('</span>')) {
      return '<span class="msg-recall">Wiadomość cofnięta</span>';
    }
    // 2. Voice message — NIE ufamy zapisanej strukturze. Parsujemy ŚCISŁYM regexem
    //    tylko PATH głosu + długość (int), walidujemy path przez _chatVoicePathValid
    //    i ODBUDOWUJEMY tag od zera z zahardkodowanym onclick + zwalidowanymi danymi.
    //    Wszystko inne w body (np. <img onerror=…>) jest odrzucane — naprawia też
    //    ewentualne już-zapisane payloady. [stored XSS fix #1]
    if (body.startsWith('<div class="voice-msg">')) {
      var _vm = body.match(/onclick="playVoice(?:Msg)?\(this,'([^']+)'\)"/);
      var _vpath = _vm && _vm[1];
      if (_vpath && window._chatVoicePathValid && window._chatVoicePathValid(_vpath)) {
        var _vd = body.match(/class="voice-duration">(\d{1,5})s</);
        var _dur = _vd ? _vd[1] : '';
        // _chatVoicePathValid gwarantuje brak ' " < > ( ) → _vpath bezpieczny w atrybucie i JS-stringu.
        // Dwa warianty stylu odbudowane 1:1 (coach=biały pasek, athlete=accent) — wygląd identyczny.
        if (body.indexOf('rgba(255,255,255') !== -1) {
          return '<div class="voice-msg"><button class="voice-play" onclick="playVoiceMsg(this,\'' + _vpath + '\')">▶️</button><div style="flex:1;height:3px;background:rgba(255,255,255,0.2);border-radius:2px;"><div style="height:3px;background:rgba(255,255,255,0.7);width:100%;border-radius:2px;"></div></div><span class="voice-duration">' + _dur + 's</span></div>';
        }
        return '<div class="voice-msg"><button class="voice-play" onclick="playVoice(this,\'' + _vpath + '\')">▶️</button><div style="flex:1;height:3px;background:var(--border);border-radius:2px;"><div style="height:3px;background:var(--accent);width:100%;border-radius:2px;"></div></div><span class="voice-duration">' + _dur + 's</span></div>';
      }
      // path nie przechodzi walidacji → potencjalnie spreparowane body → bezpieczny tekst
      return window.escapeHtml(body);
    }
    // 3. Stary format: [zdjęcie] <a href="URL">tekst</a>
    const oldImg = body.match(/\[zdjęcie\]\s*<a href="([^"]+)"[^>]*>[^<]*<\/a>/);
    if (oldImg) {
      const url = oldImg[1];
      const before = window.escapeHtml(body.slice(0, oldImg.index));
      const after = window.escapeHtml(body.slice(oldImg.index + oldImg[0].length));
      return before + (_isSafeMediaUrl(url) ? _renderImgTag(url) : '[zdjęcie: ' + window.escapeHtml(url) + ']') + after;
    }
    // 4. Nowy format: JEDEN LUB WIĘCEJ <img src="URL|PATH"> — DUAL MODE (W2 Step 2b).
    //    Walka po wszystkich <img> (fix: wcześniej tylko pierwszy). Tekst między/wokół escapowany.
    //    legacy https (whitelist) → render; PATH → data-sp placeholder (Step 2a observer hydratuje
    //    przez createSignedUrl); nieufny → tekst [zdjęcie: …].
    if (/<img\s+src="[^"]+"[^>]*\/?>/.test(body)) {
      const re = /<img\s+src="([^"]+)"[^>]*\/?>/g;
      let out = '', last = 0, m;
      while ((m = re.exec(body)) !== null) {
        out += window.escapeHtml(body.slice(last, m.index));
        const u = m[1];
        const attrs = window._spImgSrc(u); // https-safe → src="…"; PATH → data-sp+placeholder; nieufny → ''
        out += attrs
          ? '<img ' + attrs + ' style="max-width:100%;border-radius:8px;margin:2px 0;display:block;cursor:pointer;" onclick="window.open(this.src,\'_blank\')" />'
          : '[zdjęcie: ' + window.escapeHtml(u) + ']';
        last = m.index + m[0].length;
      }
      out += window.escapeHtml(body.slice(last));
      return out;
    }
    // 5. Zwykły tekst — wszystko escapujemy (anti-XSS)
    return window.escapeHtml(body);
  };

  // ─── SAFE URL FOR ATTRIBUTES (anti-XSS dla src/href) ────────────────
  // Zwraca URL gotowy do wstawienia jako wartość atrybutu src/href w HTML.
  // - Tylko HTTPS + tylko hosty z whitelist _isSafeMediaUrl
  //   (Supabase storage, GH Pages, media*.tenor.com, media*.giphy.com)
  // - Niezaufany/nieprawidłowy URL → '' (atrybut zostaje pusty, nie ładuje nic)
  // - Wynik jest escape'owany HTML — bezpiecznie wstawić jako `src="${safeUrlAttr(url)}"`
  //
  // Użycie:
  //   const safe = safeUrlAttr(l.attachment_url);
  //   safe ? '<img src="'+safe+'">' : '<span>nieufny URL</span>'
  //
  // UWAGA: dla URL-i wstawianych do JS w atrybucie (np. onclick="open('${url}',…)")
  // sam HTML-escape nie wystarczy — przeglądarka dekoduje encje przed parsowaniem JS.
  // Bezpieczny wzorzec to przekazanie URL przez data-attribute:
  //   `<button data-url="${safeUrlAttr(url)}" onclick="window.open(this.dataset.url,'_blank')">`
  window.safeUrlAttr = function(url) {
    if (!url || typeof url !== 'string') return '';
    if (!url.startsWith('https://')) return '';
    if (!_isSafeMediaUrl(url)) return '';
    return window.escapeHtml(url);
  };

  // ─── SAFE EXTERNAL HREF (anti-XSS dla <a href> do linków zewnętrznych) ──
  // Zwraca URL gotowy do wstawienia jako wartość atrybutu href w <a>.
  // - Inny threat model niż safeUrlAttr: <a href> nie ładuje zasobu automatycznie,
  //   więc whitelist hostów NIE jest potrzebna (link do dowolnego HTTPS to normalne).
  // - Jedyny XSS-vector: protokoły executable (javascript:, data:, vbscript:) → odrzucone.
  // - Akceptuje https:// i http:// (każdy host); wynik escape'owany HTML.
  // - Niezaufany/malformed URL → '' (link będzie martwy zamiast wykonywać kod).
  //
  // Użycie:
  //   <a href="${safeExternalHref(l.strava_link)}" target="_blank" rel="noopener">↗ Strava</a>
  window.safeExternalHref = function(url) {
    if (!url || typeof url !== 'string') return '';
    let s = url.trim();
    // Zawodnicy wklejają cały tekst "udostępnij" (np. z Garmina: "Sprawdź moją aktywność... https://connect.garmin.com/...").
    // Wyłuskaj prawdziwy URL z tekstu; gdy brak protokołu, a wygląda na domenę → dodaj https://.
    const m = s.match(/https?:\/\/\S+/i);
    if (m) {
      s = m[0].replace(/[.,;:)\]]+$/, ''); // utnij końcową interpunkcję sklejoną z URL
    } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !s.startsWith('//')) {
      s = 'https://' + s;
    }
    try {
      const u = new URL(s);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
      return window.escapeHtml(s);
    } catch { return ''; }
  };

  // ─── LOGGING: production silence ────────────────────────────────────
  // Na localhost/dev działa normalnie. Na produkcji log/warn/info/debug = no-op.
  // Error zostaje (chcesz widzieć błędy). Użycie: LOG.log(...) zamiast console.log
  const _isLocal = location.hostname === 'localhost'
                || location.hostname.startsWith('192.168.')
                || location.hostname.startsWith('127.')
                || location.hostname === '';
  window.LOG = _isLocal
    ? console
    : { log: function(){}, warn: function(){}, info: function(){}, debug: function(){}, error: console.error.bind(console) };

  // ─── UX: toast zamiast alert() ──────────────────────────────────────
  // Użycie: showToast('Zapisano') | showToast('Błąd!', 'error') | showToast('Uwaga', 'warn')
  // Typy: 'info' (default), 'success', 'error', 'warn'
  if (!document.getElementById('_biegamy_toast_styles')) {
    const _style = document.createElement('style');
    _style.id = '_biegamy_toast_styles';
    _style.textContent = '@keyframes _toastIn{from{opacity:0;transform:translateX(-50%) translateY(20px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}@keyframes _toastOut{to{opacity:0;transform:translateX(-50%) translateY(20px);}}';
    if (document.head) document.head.appendChild(_style);
    else document.addEventListener('DOMContentLoaded', function(){ document.head.appendChild(_style); });
  }

  window.showToast = function(msg, type) {
    type = type || 'info';
    const colors = {
      success: 'rgba(61,184,112,0.95)',
      error:   'rgba(232,86,30,0.95)',
      info:    'rgba(91,140,255,0.95)',
      warn:    'rgba(232,184,64,0.95)'
    };
    const t = document.createElement('div');
    t.style.cssText =
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:' + (colors[type] || colors.info) + ';color:#fff;' +
      'padding:12px 20px;border-radius:12px;font-family:\'DM Sans\',sans-serif;' +
      'font-size:14px;font-weight:500;z-index:99999;' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.3);' +
      'animation:_toastIn 0.3s ease-out;max-width:90vw;text-align:center;' +
      'pointer-events:none;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() {
      t.style.animation = '_toastOut 0.3s ease-in forwards';
      setTimeout(function() { try { t.remove(); } catch(e){} }, 300);
    }, 2500);
  };

  // ═══════════════════════════════════════════════════════════════
  // 🎨 MOTYWY — przełączanie tokenów (theme.css html[data-theme])
  // ═══════════════════════════════════════════════════════════════
  window.setTheme = function(name){
    try {
      if (name && name !== 'default') { document.documentElement.setAttribute('data-theme', name); localStorage.setItem('bm_theme', name); }
      else { document.documentElement.removeAttribute('data-theme'); localStorage.removeItem('bm_theme'); }
    } catch(e){}
  };
  window.getTheme = function(){ try { return localStorage.getItem('bm_theme') || 'default'; } catch(e){ return 'default'; } };
  (function(){ try { var t = localStorage.getItem('bm_theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch(e){} })();

  // ═══════════════════════════════════════════════════════════════
  // 📜 CYTATY MOTYWACYJNE — single source of truth
  // ═══════════════════════════════════════════════════════════════
  window.QUOTES_LIBRARY = [
    // Polscy raperzy
    { text: "Każdy dzień to nowa walka, każdy oddech nowa szansa.", author: "Quebonafide" },
    { text: "Dyscyplina przebije talent kiedy talent nie ma dyscypliny.", author: "Taco Hemingway" },
    { text: "Zostaw wszystko na trasie, nie zostawiaj nic na potem.", author: "O.S.T.R." },
    { text: "Nie ma drogi na skróty do żadnego miejsca wartego dotarcia.", author: "Mata" },
    { text: "Robisz wynik wtedy gdy nikt nie patrzy.", author: "Pezet" },
    { text: "Jeden krok dalej niż wczoraj, to już jest progres.", author: "Białas" },
    { text: "Sercem się biegnie, nie nogami.", author: "Kortez" },
    { text: "Wstajesz, ścierasz krew z brwi i znowu w ring.", author: "Sokół" },
    { text: "Czasem trzeba przegrać żeby zrozumieć po co się walczy.", author: "Eldo" },

    // Polscy biegacze i trenerzy
    { text: "Bieg to medytacja w ruchu. Każdy krok to myśl uwolniona od ciężaru.", author: "Marcin Świerc" },
    { text: "Nie chodzi o to żeby być najszybszym, chodzi o to żeby się nie poddawać.", author: "Robert Korzeniowski" },
    { text: "Biegnij dla siebie, nie dla innych. To Twoja droga.", author: "Iwona Lewandowska" },
    { text: "Każdy maraton zaczyna się w głowie, nie w nogach.", author: "Henryk Szost" },
    { text: "Ból na treningu to inwestycja w sukces na zawodach.", author: "Adam Kszczot" },
    { text: "Pasja bez dyscypliny to tylko marzenie.", author: "Anita Włodarczyk" },

    // Międzynarodowe legendy biegania
    { text: "No human is limited.", author: "Eliud Kipchoge" },
    { text: "Tylko dyscyplinowany umysł wygrywa w życiu.", author: "Eliud Kipchoge" },
    { text: "Bieganie to życie. Wszystko jest biegiem.", author: "Haile Gebrselassie" },
    { text: "Możesz biec dalej niż myślisz. Granice są w głowie.", author: "Mo Farah" },
    { text: "Powinieneś biec dla siebie, nie żeby kogoś pokonać.", author: "Steve Prefontaine" },
    { text: "Zrezygnowanie jest na zawsze. Ból jest tymczasowy.", author: "Lance Armstrong" },
    { text: "Góra to nie cel, góra to świątynia.", author: "Kilian Jornet" },
    { text: "Najgłębsza ciemność jest tuż przed świtem.", author: "Courtney Dauwalter" },
    { text: "Trzeba wierzyć w siebie kiedy nikt inny nie wierzy.", author: "Usain Bolt" },
    { text: "Marzenia bez pracy to halucynacje.", author: "Jakob Ingebrigtsen" },

    // Sportowe legendy
    { text: "Nigdy nie pozwól żeby strach przed porażką cię paraliżował.", author: "Michael Jordan" },
    { text: "Marzenia nie działają, jeśli ty nie pracujesz.", author: "Kobe Bryant" },
    { text: "Bądź sobą — wszyscy inni są zajęci.", author: "Oscar Wilde" },
    { text: "Niemożliwe to tylko duże słowo używane przez słabych.", author: "Muhammad Ali" },
    { text: "Każdy mistrz był kiedyś początkującym.", author: "Muhammad Ali" },
    { text: "Sukces to nie szczęście. To wstawanie o 5 rano gdy nikt nie patrzy.", author: "Cristiano Ronaldo" },
    { text: "Talent wygrywa mecze, ale praca zespołowa i inteligencja wygrywają mistrzostwa.", author: "Michael Jordan" },
    { text: "Jeśli się zatrzymasz, to skończysz. Jeśli pójdziesz dalej, jest szansa.", author: "Roger Federer" },

    // Filozofia stoicka i Wschód
    { text: "Nie chodzi o to ile długo żyjesz, ale jak.", author: "Seneka" },
    { text: "Przeszkoda jest drogą.", author: "Marek Aureliusz" },
    { text: "Masz władzę nad swoim umysłem, nie nad zewnętrznymi zdarzeniami. Zrozum to, a znajdziesz siłę.", author: "Marek Aureliusz" },
    { text: "Nie żądaj żeby rzeczy działy się tak jak chcesz. Chciej żeby się działy tak jak są.", author: "Epiktet" },
    { text: "Jutrzejszy dzień jest najmniej pewną rzeczą w życiu.", author: "Marek Aureliusz" },
    { text: "Najlepszą zemstą jest nie być podobnym do tego, kto cię skrzywdził.", author: "Marek Aureliusz" },
    { text: "Lepiej zwyciężyć siebie samego niż wygrać tysiąc bitw.", author: "Budda" },
    { text: "Tysiącletnia podróż zaczyna się od jednego kroku.", author: "Lao Tzu" },
    { text: "Walcz tylko z przeciwnikiem którego można pokonać.", author: "Sun Tzu" },

    // Trenerzy i myśliciele sportowi
    { text: "Wszystko jest treningiem.", author: "Bill Bowerman" },
    { text: "Mile run nie ma magii. Bieg ma magię.", author: "Arthur Lydiard" },
    { text: "Bądź jak woda.", author: "Bruce Lee" },
    { text: "Nie modlę się o lekkie życie, modlę się o siłę by znieść trudne.", author: "Bruce Lee" },
    { text: "Im więcej się pocisz na treningu, tym mniej krwawisz w walce.", author: "Stare przysłowie wojskowe" },
    { text: "Najwięksi nigdy nie idą sami. Mają wokół siebie ludzi którzy wiedzą jak ciężko jest.", author: "Vince Lombardi" },

    // Polskie klasyki
    { text: "Marzenia są jak dzieci — nawet gdy nas zmęczą, ich nie porzucisz.", author: "Stachura" },
    { text: "Człowiek jest kowalem swojego losu.", author: "Stare przysłowie" },
    { text: "Nie cofaj się. Idź. Tylko tym sposobem znajdziesz drogę.", author: "Wojaczek" },

    // Krótkie kopniaki
    { text: "Płacz w treningu, śmiej się na mecie.", author: "Anonim" },
    { text: "Słabsza wersja Ciebie z wczoraj — to ona jest Twoim przeciwnikiem.", author: "Stara mądrość" },
    { text: "Wytrwałość bije talent w 9 przypadkach na 10.", author: "Stara mądrość" },
    { text: "Robisz to dla siebie. Nikt inny nie zrobi tego za Ciebie.", author: "Anonim" },
    { text: "Jutro będziesz wdzięczny za to co zrobiłeś dziś.", author: "Anonim" },
    { text: "Ciało robi to, do czego głowa go zmusi.", author: "Stara mądrość" },
    { text: "Najtrudniej jest wyjść z domu. Reszta to formalność.", author: "Anonim" },
    { text: "Każdy bieg to nowy rozdział. Stare zostaw za sobą.", author: "Anonim" },
    { text: "Nie liczy się szybkość. Liczy się że biegniesz.", author: "Anonim" },
    { text: "Wstałeś — już wygrałeś z większością.", author: "Anonim" },
    { text: "Pierwsze 3 km kłamią. Prawdziwy bieg zaczyna się od 4-ego.", author: "Stara mądrość" },
    { text: "Trudno bo trudne. Łatwo by każdy mógł.", author: "Anonim" },
    { text: "Gorzej już nie będzie. Może być tylko lepiej.", author: "Anonim" }
  ];

  // Helper: 1 cytat per dzień (deterministyczny, seed = YYYYMMDD)
  window.getDailyQuote = function(offsetDays = 0) {
    const today = new Date();
    today.setDate(today.getDate() + offsetDays);
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    return window.QUOTES_LIBRARY[seed % window.QUOTES_LIBRARY.length];
  };

  // Helper: N deterministycznie zshuffle'owanych cytatów dnia (Mulberry32)
  window.getDailyQuoteSet = function(count = 5) {
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    let s = seed;
    const rand = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const arr = [...window.QUOTES_LIBRARY];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, count);
  };


  // ═══════════════════════════════════════════════════════════════
  // 🏃 RUN TYPES — allowlist do SUM KM (single source)
  // Nie-bieg (zastępczy/wzmacniający/odpoczynek/nieznane) → wykluczone z km biegowych.
  // NIE dotyczy TRIMP/TSB — te liczą z czasu (formaTRIMP), zastępczy ma własny effort.
  // ⚠️ Nowy pill biegowy w przyszłości → dopisz tutaj, inaczej jego km znikną z sum.
  // ═══════════════════════════════════════════════════════════════
  window.RUN_TYPES = new Set([
    'spokojny', 'bieg spokojny', 'wybieganie', 'długi', 'tempo',
    'progresja', 'interwały', 'start', 'wyścig', 'regeneracja'
  ]);
  window.isRunType = function(t) {
    return window.RUN_TYPES.has((t || '').toLowerCase().trim());
  };

  // Cel kcal = TDEE (maintenance, liczony triggerem DB calc_bmr_tdee) + korekta celu. Single source dla ±300.
  window.GOAL_KCAL_ADJUST = { deficit: -300, surplus: 300, maintain: 0 };
  window.computeTargetKcal = function(tdee, goal) {
    if (!tdee) return null;                                 // brak tdee → null (callsite decyduje fallback)
    return tdee + (window.GOAL_KCAL_ADJUST[goal] || 0);     // nieznany goal → 0
  };

  // Losowe tło oddechowe (20 grafik breath-bg-1..20.webp w biegamy-assets) + ciemny veil dla czytelności
  // białego tekstu na jasnych grafikach. Zwraca string do element.style.backgroundImage (veil NA WIERZCHU, foto pod).
  window.randomBreathBg = function(alphaTop, alphaBot) {
    const n = 1 + Math.floor(Math.random() * 20);
    return 'linear-gradient(180deg, rgba(7,5,12,' + alphaTop + '), rgba(7,5,12,' + alphaBot + ')), ' +
           'url(https://filipjanczak1989-png.github.io/biegamy-assets/breath-bg-' + n + '.webp)';
  };

  // Heurystyka „to trening wzmacniający" — typ == Wzmacniający LUB słowa-klucze w opisie.
  // Drille trenera (sil*) mają type='Regeneracja' + opis siłowy → dlatego też skan opisu.
  // Używane do deep-linku planu → sekcja ĆWICZENIA (zawodnik.html?tab=cwiczenia).
  window.looksLikeStrength = function(type, desc) {
    if ((type || '').toLowerCase().trim() === 'wzmacniający') return true;
    return /przysiad|wykrok|plank|deska|mostek|glute|dead.?bug|martw|brzuszk|\bcore\b|wzmacniaj|jaskół|łydk|pompk|bird.?dog|side.?plank|stabiliz/.test((desc || '').toLowerCase());
  };

  // Smart-match opisu planu → id programu ĆWICZENIA (lub null = brak pewnego dopasowania → lista).
  // Kolejność = priorytet (specyficzne przed ogólnymi). Ids: rozgrzewka/core/nogi/stabilizacja/pelny.
  window.matchProgram = function(desc) {
    const d = (desc || '').toLowerCase();
    if (/rozgrzew|przed startem|przed biegiem|aktywac/.test(d)) return 'rozgrzewka';
    if (/\bcore\b|brzuch|plank|deska|dead.?bug|martw/.test(d)) return 'core';
    if (/stabiliz|równowag|rownowag|jaskół|jaskol|balans|bird.?dog/.test(d)) return 'stabilizacja';
    if (/nóg|\bnog|łydk|lydk|przysiad|wykrok|calf|wspięci|wspieci/.test(d)) return 'nogi';
    return null;
  };

  // Detekcja treningu oddechowego (desc-only — brak typu „Oddechowy"; drille trenera odd* = Regeneracja+opis).
  window.looksLikeBreath = function(type, desc) {
    return /oddech|4-7-8|478|box breathing|wim hof|przeponow|hiperwentyl|breathing|kwadrat.*oddech|wstrzym.*oddech/.test((desc || '').toLowerCase());
  };
  // Smart-match opisu → technika oddechowa (lub null = ogólny oddech → lista 3 technik). Klucze: 478/box/wim.
  window.matchBreath = function(desc) {
    const d = (desc || '').toLowerCase();
    if (/4-7-8|478|4 7 8/.test(d)) return '478';
    if (/\bbox\b|box breathing|kwadrat/.test(d)) return 'box';
    if (/wim hof|wim|retencj|hiperwentyl|lodow/.test(d)) return 'wim';
    return null;
  };
  // Parse jawnego ref-u z planu (trainings.exercise_ref) → {kind:'prog'|'breath', key} lub null.
  // Format namespaced: 'prog:core' / 'breath:478'. Ma PIERWSZEŃSTWO nad smart-matchem opisu.
  window.parseExerciseRef = function(ref) {
    if (!ref || typeof ref !== 'string' || ref.indexOf(':') < 0) return null;
    const i = ref.indexOf(':'), kind = ref.slice(0, i), key = ref.slice(i + 1);
    if ((kind === 'prog' || kind === 'breath') && key) return { kind: kind, key: key };
    return null;
  };

  // RADIO BiegaMy — buildery URL. media z bucketu radio-audio (URL = slug + '.' + media_ext),
  // cover z bucketu radio-audio (cover_slug = pełna nazwa pliku bez .webp, np. 'cover-park-wolnosci').
  window.RADIO = {
    MEDIA_BASE: window.SB_URL + '/storage/v1/object/public/radio-audio/',
    COVER_BASE: window.SB_URL + '/storage/v1/object/public/radio-audio/',
    mediaUrl: function(t){ return (t && t.slug) ? (this.MEDIA_BASE + t.slug + '.' + (t.media_ext || 'mp4')) : ''; },
    coverUrl: function(t){ return (t && t.cover_slug) ? (this.COVER_BASE + t.cover_slug + '.webp') : ''; },
    // Hit tygodnia — #N utworów z najwięcej odtworzeń w ostatnich 7 dniach (widok radio_top_weekly, security_invoker=false)
    weeklyTop: async function(limit){
      try {
        const { data, error } = await window.sb.from('radio_top_weekly').select('*').limit(limit || 1);
        if (error) return [];
        return data || [];
      } catch(e){ return []; }
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // window.TERMS — Brama Regulaminu (FAZA 2). Modal akceptacji dla kont BEZ
  // realnej zgody: terms_accepted_at IS NULL  LUB  == created_at (artefakt dawnego
  // DEFAULT now(), nie klik). check() woła się po inicie sesji (zawodnik.html initAuth).
  // Zapis przez RPC accept_terms() — SECURITY DEFINER, rusza TYLKO terms_accepted_at
  // dla auth.uid(); NIE polegamy na szerokiej policy athletes_update_own.
  // Modal blokujący: z-index 300 (próg swipe-guard, nad content/nav ≤210, pod toastami
  // 99999); brak wyjścia przez Esc/klik-tła; jeden przycisk „Akceptuję".
  // ═══════════════════════════════════════════════════════════════════
  window.TERMS = {
    // Artefakt dawnego DEFAULT now(): terms == created_at co do SEKUNDY. Realna zgoda
    // (RPC bierze now()) jest DUŻO późniejsza od created_at → nigdy false-positive.
    _toArtefakt: function(terms, created){
      if (!terms || !created) return false;
      var a = Date.parse(terms), b = Date.parse(created);
      if (isNaN(a) || isNaN(b)) return false;
      return Math.floor(a/1000) === Math.floor(b/1000);
    },

    // SELECT własnego wiersza; NULL lub artefakt → showModal(). Fire-and-forget,
    // self-swallow: błąd/brak wiersza NIE blokuje wejścia (brak wiersza = trener/nowy,
    // łapany przez inne ścieżki; nie chcemy fałszywie więzić usera na błędzie sieci).
    check: async function(){
      try {
        var sess = (await window.sb.auth.getSession()).data.session;
        var u = sess && sess.user;
        if (!u) return;
        var res = await window.sb.from('athletes')
          .select('terms_accepted_at, created_at').eq('user_id', u.id).maybeSingle();
        if (res.error || !res.data) return;
        if (!res.data.terms_accepted_at || this._toArtefakt(res.data.terms_accepted_at, res.data.created_at)) {
          this.showModal();
        }
      } catch(e){}
    },

    // Blokujący overlay. Idempotentny. Zero danych usera → tekst statyczny, bez escape.
    showModal: function(){
      if (document.getElementById('terms-gate')) return;
      var ov = document.createElement('div');
      ov.id = 'terms-gate';
      ov.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(0,0,0,0.82);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:22px;';
      ov.innerHTML =
        '<div role="dialog" aria-modal="true" aria-labelledby="terms-gate-title" style="max-width:420px;width:100%;background:var(--card2,#13131b);border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:26px 24px;box-shadow:0 20px 60px rgba(0,0,0,0.55);font-family:\'DM Sans\',sans-serif;">'
        +   '<div id="terms-gate-title" style="font-size:18px;font-weight:700;color:var(--fg,#f0ede8);margin-bottom:12px;">Zaktualizowaliśmy zasady</div>'
        +   '<div style="font-size:14px;line-height:1.55;color:var(--fg2,rgba(240,237,232,0.65));margin-bottom:20px;">Zaktualizowaliśmy zasady korzystania z BiegaMy. Aby kontynuować, zaakceptuj <a href="terms.html" target="_blank" rel="noopener" style="color:var(--accent,#e8561e);text-decoration:none;border-bottom:1px solid rgba(var(--accent-rgb,232,86,30),0.4);">regulamin</a> i <a href="privacy.html" target="_blank" rel="noopener" style="color:var(--accent,#e8561e);text-decoration:none;border-bottom:1px solid rgba(var(--accent-rgb,232,86,30),0.4);">politykę prywatności</a>.</div>'
        +   '<button id="terms-gate-ok" style="width:100%;background:linear-gradient(135deg,var(--accent,#e8561e),var(--accent2,#ff7040));color:#fff;border:none;border-radius:14px;padding:14px;font-family:\'DM Sans\',sans-serif;font-size:15px;font-weight:600;cursor:pointer;">Akceptuję</button>'
        + '</div>';
      document.body.appendChild(ov);

      // Esc nie zamyka; przechwyć w fazie capture, dopóki modal żyje.
      var keyGuard = function(e){ if (e.key === 'Escape' && document.getElementById('terms-gate')) { e.stopPropagation(); e.preventDefault(); } };
      document.addEventListener('keydown', keyGuard, true);

      var btn = ov.querySelector('#terms-gate-ok');
      btn.addEventListener('click', async function(){
        btn.disabled = true; btn.textContent = 'Zapisuję...';
        try {
          var r = await window.sb.rpc('accept_terms');
          if (r.error) { btn.disabled = false; btn.textContent = 'Akceptuję'; if (window.showToast) showToast('Nie udało się zapisać — spróbuj ponownie', 'warn'); return; }
          document.removeEventListener('keydown', keyGuard, true);
          ov.remove();
        } catch(e){ btn.disabled = false; btn.textContent = 'Akceptuję'; if (window.showToast) showToast('Nie udało się zapisać — spróbuj ponownie', 'warn'); }
      });
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // window.WATCH — SSOT podłączenia zegarka (intervals.icu OAuth)
  // Reużywa flow z profil.html (authorizeIntervals) — jedna ścieżka, nie kopia.
  // Stan czytany z athletes.intervals_athlete_id (intervals_credentials ma RLS
  // BEZ SELECT dla klienta — tylko DELETE-own; EF service_role zapisuje oba).
  // ═══════════════════════════════════════════════════════════════════
  window.WATCH = {

    // 1) ODPAL OAUTH — jedyna definicja flow (profil.html ją woła)
    odpalOAuth: function(returnTo) {
      // Google Translate (*.translate.goog) zmienia origin → sessionStorage state niedostępny po powrocie = false CSRF.
      // NIE startuj OAuth pod tłumaczeniem; poproś o wyłączenie. (state/flow/bezpieczeństwo BEZ zmian — to tylko wczesne ostrzeżenie.)
      if (location.hostname.indexOf('translate.goog') !== -1) {
        var _mt = 'Tłumaczenie przeglądarki przerywa bezpieczne łączenie z zegarkiem. Otwórz BiegaMy bez tłumaczenia Google i spróbuj ponownie.';
        if (window.showToast) showToast(_mt, 'warn'); else alert(_mt);
        return;
      }
      const nonce = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : (Date.now() + '.' + Math.random().toString(36).slice(2));
      sessionStorage.setItem('icu_oauth_state', nonce);            // CSRF — sprawdzany w intervals-callback.html
      if (returnTo) sessionStorage.setItem('icu_oauth_return', returnTo);  // powrót do onboardingu (dopięcie callbacku osobno)
      const redirect = 'https://biegamy.run/intervals-callback.html';     // = redirect_uri client_id 533
      location.href = 'https://intervals.icu/oauth/authorize'
        + '?client_id=533'
        + '&redirect_uri=' + encodeURIComponent(redirect)
        + '&scope=ACTIVITY:READ,CALENDAR:WRITE,WELLNESS:READ'   /* E3-K1: HRV/RHR/sen/waga */
        + '&state=' + encodeURIComponent(nonce)
        + '&response_type=code';
    },

    // 2) STAN — JEDNO źródło prawdy. Zwraca {polaczony, od_kiedy}
    czyPolaczony: async function(athleteId) {
      if (!athleteId) return { polaczony: false, od_kiedy: null };
      const { data } = await window.sb.from('athletes')
        .select('intervals_athlete_id, intervals_connected_at, intervals_can_write, intervals_token_dead_at')
        .eq('id', athleteId).maybeSingle();
      return { polaczony: !!(data && data.intervals_athlete_id),
               od_kiedy: (data && data.intervals_connected_at) || null,
               moze_wysylac: !!(data && data.intervals_can_write),
               tokenMartwy: !!(data && data.intervals_athlete_id && data.intervals_token_dead_at) };   // E4: połączony ALE token martwy (401)
    },

    // 3) RENDER — jedna funkcja, 4 wagi. Async, bo pyta czyPolaczony o stan.
    //    opts = { athleteId, returnTo?, onSkip? (nazwa globalnej fn jako string) }
    render: async function(waga, opts) {
      opts = opts || {};
      this._injectCss();
      const st = await this.czyPolaczony(opts.athleteId);
      const ic = this.iconSvg();
      const rt = opts.returnTo ? ("'" + opts.returnTo + "'") : '';
      const skip = opts.onSkip || 'WATCH._noop';

      // Instrukcja "Jak podłączyć zegarek?" — współdzielona (full + status). Statyczny tekst (bez danych usera → bez escape).
      const helpHtml = function(open) {
        return '<details class="wc-help"' + (open ? ' open' : '') + '><summary>Jak podłączyć zegarek?</summary>'
        + '<div class="wc-help-body">'
        + '<p class="wc-help-intro">Treningi z zegarka wpadną tu automatycznie — przez intervals.icu (darmowy pośrednik, który pobiera je z Garmina).</p>'
        + '<ol class="wc-help-steps">'
        + '<li><b>Załóż darmowe konto na intervals.icu</b><br>Wejdź na intervals.icu i zarejestruj się (email, hasło, nazwa, waga — wymagana; resztę pomiń). Maila nie musisz potwierdzać.<img class="wc-help-img" src="' + window.assetUrl('krok1-rejestracja.webp') + '" alt="Krok 1 — rejestracja na intervals.icu" loading="lazy"></li>'
        + '<li><b>Ustawienia → Połączenia</b><br>Kliknij zębatkę ⚙️ w lewej kolumnie, wejdź w zakładkę Połączenia i znajdź kartę Garmin Connect.<img class="wc-help-img" src="' + window.assetUrl('krok2-polaczenia.webp') + '" alt="Krok 2 — Ustawienia → Połączenia" loading="lazy"></li>'
        + '<li><b>Podłącz Garmina</b><br>Zaznacz trzy pola (Pobieranie aktywności, Pobierz dane kondycji, Prześlij zaplanowane treningi). Po trzecim przeniesie Cię na stronę Garmina — zaloguj się. Po wpisaniu hasła zegarek jest połączony.<img class="wc-help-img" src="' + window.assetUrl('krok3-garmin.webp') + '" alt="Krok 3 — podłącz Garmin Connect" loading="lazy"></li>'
        + '<li><b>Wróć do BiegaMy</b><br>Kliknij „Autoryzuj przez intervals.icu”, na ekranie zgody zaznacz Aktywności — Czytać ✓ i OK.<img class="wc-help-img" src="' + window.assetUrl('krok4-autoryzacja.webp') + '" alt="Krok 4 — autoryzacja w BiegaMy" loading="lazy"></li>'
        + '</ol>'
        + '<p class="wc-help-done">✅ Gotowe! Od teraz każdy trening wpada sam.</p>'
        + '<p class="wc-help-support">🤝 Problem? Napisz do trenera na czacie albo na biegamy.run@gmail.com — podłączymy razem.</p>'
        + '</div></details>';
      };

      // połączony (poza 'status') → kompaktowe potwierdzenie
      if (st.polaczony && waga !== 'status' && waga !== 'badge') {
        return '<div class="wc-ok">' + ic + '<span>Zegarek połączony ✓</span></div>';
      }

      if (waga === 'full') {
        return '<div class="wc wc-full">'
          + '<div class="wc-ic-lg">' + ic + '</div>'
          + '<div class="wc-h1">Treningi wpadną same<br>— bez wpisywania</div>'
          + '<div class="wc-sub">Przez intervals.icu połączysz Garmin / Polar / Suunto. '
          + 'Każdy trening z zegarka trafi tu i do trenera automatycznie.</div>'
          + '<button class="wc-btn" onclick="WATCH.odpalOAuth(' + rt + ')">Połącz z zegarkiem</button>'
          + '<button class="wc-ghost" onclick="' + skip + '()">Pomiń, zrobię później</button>'
          + helpHtml(false)
          + '</div>';
      }
      if (waga === 'medium') {
        return '<div class="wc wc-medium">' + ic
          + '<div class="wc-txt"><b>Połącz zegarek</b><span>Garmin/Polar/Suunto — trening sam wpadnie</span></div>'
          + '<button class="wc-btn-sm" onclick="WATCH.odpalOAuth(' + rt + ')">Połącz →</button></div>';
      }
      if (waga === 'light') {
        return '<button class="wc wc-light" onclick="WATCH.odpalOAuth(' + rt + ')">'
          + '<span class="watch-pulse">' + ic + '</span>'
          + '<span class="wc-light-txt">Masz zegarek? Połącz — nie wpisuj ręcznie</span></button>';
      }
      if (waga === 'status') {
        if (st.polaczony) {
          const d = st.od_kiedy ? new Date(st.od_kiedy).toLocaleDateString('pl-PL',{day:'numeric',month:'short',year:'numeric'}) : '';
          const dead = st.tokenMartwy ?   // E4: token martwy → banner + "Połącz ponownie" (odpalOAuth bezstanowy); NIE chowamy Rozłącz
            '<div class="wc-dead" style="margin-top:8px;padding:10px;border:1px solid var(--yellow,#e8b840);border-radius:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
            + '<span>⚠ Połączenie z zegarkiem wygasło — treningi nie wpadają.</span>'
            + '<button class="wc-btn-sm" onclick="WATCH.odpalOAuth(' + rt + ')">Połącz ponownie</button></div>' : '';
          const unlock = st.moze_wysylac ? '' :
            '<div class="wc-unlock" style="margin-top:8px;padding:10px;border:1px solid var(--accent);border-radius:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
            + '<span>🔓 Odblokuj wysyłanie treningów na zegarek</span>'
            + '<button class="wc-btn-sm" onclick="WATCH.odpalOAuth(' + rt + ')">Autoryzuj ponownie</button></div>';
          return '<div class="wc-ok">' + ic + '<span>Połączono ✓' + (d ? ' · od ' + d : '') + '</span>'
            + '<button class="wc-disc" onclick="disconnectIntervals()">Rozłącz</button></div>' + dead + unlock;
        }
        return '<div class="wc-status-connect">'
          + '<button class="wc-btn" onclick="WATCH.odpalOAuth(' + rt + ')">Autoryzuj przez intervals.icu</button>'
          + helpHtml(false)
          + '</div>';
      }
      if (waga === 'badge') {
        // Mała ikona-wskaźnik w topbarze (jak Garmin) — zawsze widoczna, dwa stany.
        if (st.polaczony && st.tokenMartwy) {   // E4: token martwy → żółty ⚠, klik→profil (re-connect); bez ↺ (sync i tak da 401)
          return '<button class="wc-badge wc-badge-warn" title="Zegarek: połączenie wygasło — połącz ponownie" '
            + 'onclick="location.href=\'profil.html?open=icu\'">' + ic
            + '<span class="wc-badge-warn-dot">⚠</span></button>';
        }
        if (st.polaczony) {
          return '<button class="wc-badge wc-badge-ok" title="Zegarek połączony — status/rozłącz" '
            + 'onclick="location.href=\'profil.html?open=icu\'">' + ic
            + '<span class="wc-badge-check">✓</span>'
            + '<span class="wc-refresh" title="Synchronizuj z zegarkiem" onclick="event.stopPropagation(); WATCH._badgeSync(\'' + opts.athleteId + '\', this)">↺</span></button>';
        }
        return '<button class="wc-badge wc-badge-off" title="Połącz zegarek" '
          + 'onclick="location.href=\'profil.html?open=icu\'">' + ic
          + '<span class="wc-badge-dot">!</span></button>';
      }
      return '';
    },

    // 4) IKONA — prosty smartwatch, theme-aware (var(--accent)), animowalny CSS-em
    iconSvg: function() {
      return '<svg class="wc-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"'
        + ' stroke="var(--accent)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'
        + '<rect x="7" y="7" width="10" height="10" rx="2.5"/>'
        + '<path d="M9 7 L9.4 3.6 A1 1 0 0 1 10.4 2.7 L13.6 2.7 A1 1 0 0 1 14.6 3.6 L15 7"/>'
        + '<path d="M9 17 L9.4 20.4 A1 1 0 0 0 10.4 21.3 L13.6 21.3 A1 1 0 0 0 14.6 20.4 L15 17"/>'
        + '<path d="M12 9.8 L12 12 L13.5 13"/></svg>';
    },

    _noop: function() {},

    // 5) SYNC — SSOT importu z zegarka (reużywa EF intervals-sync); profil-button i badge-↺ wołają to samo
    sync: async function(athleteId, onDone, full) {
      if (!athleteId) return { ok:false, error:'no_athlete' };
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) throw new Error('brak sesji');
        const r = await fetch(window.SB_FN_URL + '/intervals-sync', {
          method: 'POST',
          headers: { 'Content-Type':'application/json', Authorization: 'Bearer ' + session.access_token },
          body: JSON.stringify({ athlete_id: athleteId, full: full === true })
        });
        const data = await r.json();
        if (!data.ok) throw new Error(data.error || 'sync failed');
        if (window.showToast) showToast('Zsynchronizowano ' + (data.synced ?? 0) + ' treningów ✓');
        if (typeof onDone === 'function') onDone(data);
        return data;
      } catch (e) {
        if (window.showToast) showToast('Błąd synchronizacji: ' + (e.message || e));
        return { ok:false, error: String(e.message || e) };
      }
    },

    // badge-↺: spin podczas sync + odświeżenie widoku przez globalny hook _onWatchSynced
    _badgeSync: function(athleteId, el) {
      const badge = el.closest('.wc-badge');
      if (badge && badge.classList.contains('syncing')) return;   // anti-double-click
      if (badge) badge.classList.add('syncing');
      this.sync(athleteId, function(){ if (window._onWatchSynced) window._onWatchSynced(); })
          .finally(function(){ if (badge) badge.classList.remove('syncing'); });
    },

    _injectCss: function() {
      if (document.getElementById('wc-css')) return;
      const s = document.createElement('style'); s.id = 'wc-css';
      s.textContent =
        '.wc-icon{transition:transform .2s}'
        + '@keyframes wc-pulse{0%,100%{opacity:1}50%{opacity:.5}}'
        + '.watch-pulse .wc-icon{animation:wc-pulse 2.4s ease-in-out infinite}'
        + '.wc-full{text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px}'
        + '.wc-ic-lg .wc-icon{width:40px;height:40px}'
        + '.wc-full .wc-h1{font-size:20px;font-weight:600;color:var(--fg);line-height:1.15}'
        + '.wc-full .wc-sub{font-size:13px;color:var(--muted);line-height:1.55;max-width:300px}'
        + '.wc-btn{width:100%;background:var(--accent);color:#fff;border:none;border-radius:12px;padding:14px;font-family:DM Mono,monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}'
        + '.wc-ghost{background:none;border:none;color:var(--muted);font-family:DM Mono,monospace;font-size:12px;cursor:pointer;padding:6px}'
        + '.wc-help{font-size:11px;color:var(--muted);font-family:DM Mono,monospace;width:100%;box-sizing:border-box;border:1px solid rgba(var(--accent-rgb),.28);border-radius:12px;padding:12px 14px;background:rgba(var(--accent-rgb),.05)}'
        + '.wc-help>summary{cursor:pointer;color:var(--accent);font-weight:600;font-size:12px;letter-spacing:.02em;list-style:none;display:flex;align-items:center;gap:8px}'
        + '.wc-help>summary::-webkit-details-marker{display:none}'
        + '.wc-help>summary::before{content:"▸";display:inline-block;transition:transform .2s;color:var(--accent)}'
        + '.wc-help[open]>summary::before{transform:rotate(90deg)}'
        + '.wc-adv{margin-top:12px;border:1px solid var(--border);border-radius:12px;padding:10px 14px}'
        + '.wc-adv>summary{cursor:pointer;color:var(--muted);font-family:DM Mono,monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;list-style:none;display:flex;align-items:center;gap:8px}'
        + '.wc-adv>summary::-webkit-details-marker{display:none}'
        + '.wc-adv>summary::before{content:"▸";display:inline-block;transition:transform .2s}'
        + '.wc-adv[open]>summary::before{transform:rotate(90deg)}'
        + '.wc-adv-body{margin-top:12px}'
        + '.wc-status-connect{display:flex;flex-direction:column;gap:10px}'
        + '.wc-help-body{margin-top:8px;line-height:1.55;color:var(--muted);text-align:left;font-family:inherit;font-size:12px}'
        + '.wc-help-intro{margin:0 0 8px}'
        + '.wc-help-steps{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:9px}'
        + '.wc-help-steps li{padding-left:2px}'
        + '.wc-help-steps b{color:var(--fg)}'
        + '.wc-help-done{margin:10px 0 4px;color:var(--accent);font-weight:600}'
        + '.wc-help-support{margin:0}'
        + '.wc-help-img{display:block;width:100%;max-width:280px;margin:10px auto 4px;border-radius:10px;border:1px solid var(--border)}'
        + '.wc-medium{display:flex;align-items:center;gap:12px}'
        + '.wc-medium .wc-txt{flex:1;display:flex;flex-direction:column}'
        + '.wc-medium .wc-txt b{font-size:13px;color:var(--fg)}.wc-medium .wc-txt span{font-size:11px;color:var(--muted)}'
        + '.wc-btn-sm{background:var(--accent);color:#fff;border:none;border-radius:10px;padding:9px 14px;font-family:DM Mono,monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}'
        + '.wc-light{display:flex;align-items:center;gap:8px;width:100%;background:rgba(var(--accent-rgb),.08);border:1px solid rgba(var(--accent-rgb),.25);border-radius:10px;padding:10px 12px;cursor:pointer}'
        + '.wc-light-txt{font-size:12px;color:var(--accent);font-weight:500}'
        + '.wc-ok{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--fg)}'
        + '.wc-disc{margin-left:auto;font-size:10px;font-family:DM Mono,monospace;color:var(--muted);background:none;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:6px 10px;cursor:pointer}';
      s.textContent +=
        '.wc-badge{position:relative;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;border:1px solid var(--border);background:linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.02));transition:all .25s ease}'
        + '.wc-badge:hover{border-color:rgba(var(--accent-rgb),.5);background:linear-gradient(135deg,rgba(var(--accent-rgb),.10),rgba(var(--accent-rgb),.03));box-shadow:0 0 18px rgba(var(--accent-rgb),.18);transform:scale(1.04)}'
        + '.wc-badge:hover .wc-icon{stroke:var(--accent)}'
        + '.wc-badge .wc-icon{width:18px;height:18px}'
        + '.wc-badge-off{border-color:rgba(var(--accent-rgb),.45);background:linear-gradient(135deg,rgba(var(--accent-rgb),.10),rgba(var(--accent-rgb),.03))}'
        + '.wc-badge-off .wc-icon{animation:wc-pulse 2.4s ease-in-out infinite}'
        + '.wc-badge-ok{opacity:.55}'
        + '.wc-badge-ok:hover{opacity:1}'
        + '.wc-badge-ok .wc-icon{stroke:var(--muted)}'
        + '.wc-badge-dot{position:absolute;top:-3px;right:-3px;min-width:14px;height:14px;background:var(--accent);border:2px solid var(--bg);border-radius:7px;font-size:8px;font-weight:700;color:#fff;display:flex;align-items:center;justify-content:center;font-family:DM Mono,monospace;line-height:1;padding:0 2px}'
        + '.wc-badge-check{position:absolute;bottom:-2px;right:-2px;width:13px;height:13px;background:var(--green,#3db870);border:2px solid var(--bg);border-radius:50%;font-size:8px;font-weight:700;color:#fff;display:flex;align-items:center;justify-content:center;line-height:1}'
        + '.wc-badge-warn{border-color:rgba(232,184,64,.6);background:linear-gradient(135deg,rgba(232,184,64,.16),rgba(232,184,64,.04))}'
        + '.wc-badge-warn .wc-icon{stroke:var(--yellow,#e8b840);animation:wc-pulse 2.4s ease-in-out infinite}'
        + '.wc-badge-warn-dot{position:absolute;top:-3px;right:-3px;min-width:14px;height:14px;background:var(--yellow,#e8b840);border:2px solid var(--bg);border-radius:7px;font-size:9px;font-weight:700;color:#1a1a24;display:flex;align-items:center;justify-content:center;line-height:1;padding:0 1px}';
      s.textContent +=
        '.wc-refresh{display:inline-flex;align-items:center;justify-content:center;margin-left:3px;font-size:13px;line-height:1;color:var(--muted);cursor:pointer;opacity:.75;transition:opacity .2s}'
        + '.wc-refresh:hover{opacity:1;color:var(--accent)}'
        + '.wc-badge.syncing .wc-refresh{animation:wc-spin .8s linear infinite}'
        + '@keyframes wc-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // window.NAV — SSOT dolnej nawigacji (wzorem WATCH). CSS w theme.css
  // (.bottom-nav/.nav-it/.nav-lbl — kanon Fork A z nutrition). N0: skeleton,
  // jeszcze NIEWPIĘTY w ekrany (czysty dodatek, no-op na prodzie — lokalne
  // reguły nav per plik wygrywają w kaskadzie do czasu migracji).
  // render(activeId, {role,athleteId,onLog}) → HTML <nav>.
  // ═══════════════════════════════════════════════════════════════════
  window.NAV = {
    _ic: {
      home:'<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
      plan:'<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
      food:'<path d="M19 11 c 0 6 -3 10 -7 10 c -4 0 -7 -4 -7 -10 c 0 -3 2 -5 5 -5 c 1 0 2 1 2 1 c 0 0 1 -1 2 -1 c 3 0 5 2 5 5 z"/><path d="M12 2 C 14 4, 14 6, 12 7 C 10 6, 10 4, 12 2"/>',
      forma:'<path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/>',
      social:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      profil:'<circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/>',
      analytics:'<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
      msgs:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
      roster:'<circle cx="8" cy="8" r="3.2"/><path d="M2.5 20v-1.2a4.2 4.2 0 0 1 4.2-4.2h2.6a4.2 4.2 0 0 1 4.2 4.2V20"/><line x1="16" y1="9" x2="21.5" y2="9"/><line x1="16" y1="14" x2="21.5" y2="14"/>',
      settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
    },
    _svg: function(k){ return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">' + (this._ic[k] || '') + '</svg>'; },
    _here: function(){ try { return (location.pathname.split('/').pop() || '') + location.search; } catch(e){ return ''; } },
    _item: function(o){
      var cls = 'nav-it' + (o.active ? ' active' : '');
      var attr;
      if (o.onLocal) attr = 'href="#" onclick="' + o.onLocal + ';return false;"';    // pozycja in-page (opts.local) — nie opuszcza ekranu
      else if (o.onLog) attr = 'href="#" onclick="' + o.onLog + '();return false;"';
      else if (o.target === this._here()) attr = 'href="' + o.target + '" onclick="return false;"'; // ta sama strona → nie przeładowuj
      else attr = 'href="' + o.target + '"';
      var icon = o.logo
        ? '<div style="width:48px;height:48px;border-radius:50%;overflow:hidden;margin-top:-18px;box-shadow:0 0 20px rgba(var(--accent-rgb),0.6);"><img src="' + (window.assetUrl ? window.assetUrl('bm-nav.webp') : '') + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.background=\'var(--accent)\';this.style.display=\'none\'"></div>'
        : this._svg(o.icon);
      return '<a class="' + cls + '" data-navid="' + o.id + '" ' + attr + (o.title ? ' title="' + o.title + '"' : '') + '>' + icon + '<div class="nav-lbl"' + (o.logo ? ' style="margin-top:2px;"' : '') + '>' + o.label + '</div></a>';
    },
    // JEDNO źródło kolejności pozycji per rola (używa render ORAZ window.SWIPE — bez dwóch prawd).
    items: function(role, opts){
      opts = opts || {};
      if (role === 'coach') {
        // Kanon coach = 5 sekcji trenera (in-page na trener.html przez opts.local; href-fallback na profil/kalendarz)
        return [
          {id:'home', label:'Zawodnicy', target:'trener.html', icon:'roster'},
          {id:'plan', label:'Plan', target:'kalendarz.html?role=coach', icon:'plan'},
          {id:'analytics', label:'Analityka', target:'trener.html?tab=analytics', icon:'analytics'},
          {id:'msgs', label:'Czat', target:'trener.html?tab=msgs', icon:'msgs'},
          {id:'social', label:'Społeczność', target:'trener.html?tab=social', icon:'social'},
          {id:'settings', label:'Ustawienia', target:'trener.html?tab=settings', icon:'settings'}
        ];
      }
      // Podgląd trenera: gdy bieżący URL ma ?from=trener (lub przekazano opts.from) — propaguj go do WSZYSTKICH
      // targetów athlety, żeby swipe/nav między ekranami nie gubił kontekstu podglądu (trener nie wypadał z widoku zawodnika).
      var from = (opts.from !== undefined) ? opts.from
                 : (function(){ try { return new URLSearchParams(location.search).get('from') === 'trener' ? 'trener' : null; } catch(e){ return null; } })();
      function wf(t){ return (from && t) ? (t + (t.indexOf('?') >= 0 ? '&' : '?') + 'from=' + from) : t; }
      var prof = opts.athleteId ? ('profil.html?id=' + opts.athleteId) : 'profil.html';
      return [
        {id:'home', label:'Dziś', target:wf('zawodnik.html'), icon:'home'},
        {id:'plan', label:'Plan', target:wf('kalendarz.html?role=athlete'), icon:'plan'},
        {id:'food', label:'Jedzenie', target:wf('nutrition.html'), icon:'food', title:'Odżywianie'},
        {id:'log', label:'Log', logo:true, target:wf('zawodnik.html?log=1'), onLog:(opts.onLog || null)},
        {id:'forma', label:'Forma', target:wf('zawodnik.html?tab=forma'), icon:'forma'},
        {id:'social', label:'Społeczność', target:wf('zawodnik.html?tab=social'), icon:'social'},
        {id:'profil', label:'Profil', target:wf(prof), icon:'profil'}
      ];
    },
    render: function(activeId, opts){
      opts = opts || {};
      var items = this.items(opts.role, opts);
      var self = this;
      return '<nav class="bottom-nav">' + items.map(function(it){ it.active = (it.id === activeId); it.onLocal = (opts.local && opts.local[it.id]) || null; return self._item(it); }).join('') + '</nav>';
    },
    // Zarządzanie active z zewnątrz (in-page sekcje) — class-based, kolory z theme.css, zero dotykania atrybutów svg.
    setActive: function(id){
      try {
        var nav = document.querySelector('.bottom-nav');
        if (!nav) return;
        var els = nav.querySelectorAll('[data-navid]');
        for (var i = 0; i < els.length; i++){ els[i].classList.toggle('active', els[i].getAttribute('data-navid') === id); }
      } catch(e){}
    }
  };

  // ═══ SWIPE — gest lewo/prawo między pozycjami nav (S0 szkielet; ZERO wpięć = no-op) ═══
  //   Kolejność bierze z NAV.items(role) (jedno źródło). Strona woła SWIPE.attach() w S1.
  //   attach({ items, activeId, onLocal, local }):
  //     items    = NAV.items(role, opts)  — kolejność
  //     activeId = string | function()    — bieżąca pozycja (null → gest nieaktywny)
  //     onLocal(id) = callback dla pozycji in-page (SWIPE nie zna showSection)
  //     local    = mapa {id:...} jak w NAV.render — które pozycje są in-page (reszta = href)
  window.SWIPE = {
    _enabled: function(){
      try { return localStorage.getItem('bm_swipe') !== 'off' && ('ontouchstart' in window); }
      catch(e){ return false; }
    },
    // ── DEBUG MODE (za flagą localStorage.bm_swipe_debug==='1'; włącz z telefonu przez ?swipedebug=1) ──
    _dbgOn: function(){ try { return localStorage.getItem('bm_swipe_debug') === '1'; } catch(e){ return false; } },
    _sel: function(el){
      if (!el || !el.tagName) return '?';
      var s = el.tagName.toLowerCase();
      if (el.id) s += '#' + el.id;
      if (el.className && typeof el.className === 'string') { var c = el.className.trim().split(/\s+/).slice(0,2).join('.'); if (c) s += '.' + c; }
      return s;
    },
    _dbg: function(msg){
      if (!this._dbgOn()) return;
      try {
        var o = document.getElementById('_swipe_dbg');
        if (!o) {
          o = document.createElement('div'); o.id = '_swipe_dbg';
          o.style.cssText = 'position:fixed;left:8px;right:8px;bottom:96px;z-index:2147483647;background:rgba(0,0,0,0.92);color:#4ade80;font:600 11px/1.45 monospace;padding:9px 11px;border-radius:8px;border:1px solid #4ade80;white-space:pre-wrap;word-break:break-word;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
          document.body.appendChild(o);
        }
        o.textContent = '🖐 ' + msg;
        o.style.opacity = '1';
        clearTimeout(this._dbgT);
        this._dbgT = setTimeout(function(){ if (o) o.style.opacity = '0'; }, 2000);
      } catch(e){}
    },
    _scrollableX: function(el){
      try {
        var ox = getComputedStyle(el).overflowX;
        // Blokuj tylko REALNY poziomy scroller: overflow-x auto/scroll ORAZ treść szersza niż kontener.
        // (Sam scrollWidth>clientWidth daje false-positive na overflow:hidden — np. karty Ustawień trenera → blokowały swipe.)
        if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 4) return true;
      } catch(e){}
      return false;
    },
    // Kierunek gestu wg WSPÓLNYCH progów (attach + attachEl — zero zdublowanych 60/600).
    //   1 = swipe w lewo (następny), -1 = swipe w prawo (poprzedni), 0 = brak.
    _dir: function(dx, dy, dt){
      if (Math.abs(dx) < 60 || Math.abs(dx) <= 2 * Math.abs(dy) || dt >= 600) return 0;
      return dx < 0 ? 1 : -1;
    },
    // Guard po ścieżce target→góra: (a) poziomy scroller, (b) canvas, (c) input/textarea/select/contenteditable.
    //   checkModalZ=true → dodatkowo blokuj wewnątrz fixed z-index>=300 (tylko document-level attach).
    _blockedEl: function(target, checkModalZ){
      var el = target;
      while (el && el !== document.body) {
        var tag = (el.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') { this._blockReason = 'input(' + this._sel(el) + ')'; return true; } // (c) — canvas ZDJĘTY
        if (el.isContentEditable) { this._blockReason = 'contenteditable(' + this._sel(el) + ')'; return true; }   // (c)
        if (this._scrollableX(el)) { this._blockReason = 'scrollableX(' + this._sel(el) + ')'; return true; }      // (a) poziomy scroller
        if (checkModalZ) {                                                 // (d) wysoki modal fixed z-index>=300
          try { var cs = getComputedStyle(el); if (cs.position === 'fixed' && parseInt(cs.zIndex, 10) >= 300) { this._blockReason = 'modalZ(' + this._sel(el) + ')'; return true; } } catch(e){}
        }
        el = el.parentElement;
      }
      return false;
    },
    // Pełny guard dla document-level attach (nav-swipe): wyłączony / otwarty modal + _blockedEl z modal-z.
    _blocked: function(target){
      if (!this._enabled()) { this._blockReason = 'disabled'; return true; }                     // (e) wyłączony / brak touch
      if (document.querySelector('.add-overlay.open')) { this._blockReason = 'add-overlay.open'; return true; }  // (d) bottom-sheet
      var gm = document.getElementById('goal-modal');
      if (gm) { try { if (getComputedStyle(gm).display !== 'none') { this._blockReason = 'goal-modal'; return true; } } catch(e){} }  // (d) modal celu
      return this._blockedEl(target, true);
    },
    attach: function(opts){
      opts = opts || {};
      var self = this;
      if (!self._enabled()) return;                                        // no-op gdy wyłączony/desktop
      var items = (opts.items || []).filter(function(it){ return it.id !== 'log'; }); // log slot pomijany
      var getActive = (typeof opts.activeId === 'function') ? opts.activeId : function(){ return opts.activeId; };
      var onLocal = (typeof opts.onLocal === 'function') ? opts.onLocal : function(){};
      var localMap = opts.local || {};
      var blockWhen = (typeof opts.blockWhen === 'function') ? opts.blockWhen : null;  // opcjonalny twardy gate (np. otwarty arkusz dnia); brak = wstecznie zgodne
      var sx = 0, sy = 0, st = 0, tracking = false, blocked = false;

      document.addEventListener('touchstart', function(e){
        tracking = false; blocked = false;
        if (!e.touches || e.touches.length !== 1) { blocked = true; self._blockReason = 'multitouch'; return; }
        if (blockWhen && blockWhen()) { blocked = true; self._blockReason = 'blockWhen'; return; }  // (f) strona-specyficzny gate (S3: arkusz dnia)
        if (self._blocked(e.target)) { blocked = true; return; }            // _blocked ustawia _blockReason
        var t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); tracking = true;
      }, { passive: true });

      document.addEventListener('touchend', function(e){
        if (blocked) { self._dbg('BLOCKED: ' + (self._blockReason || '?')); return; }  // _dbg no-op bez flagi = zero zmian zachowania
        if (!tracking) return;
        tracking = false;
        var t = e.changedTouches && e.changedTouches[0]; if (!t) return;
        var dx = t.clientX - sx, dy = t.clientY - sy, dt = Date.now() - st;
        var dir = self._dir(dx, dy, dt);
        if (!dir) { self._dbg('IGNORED: dx=' + Math.round(dx) + ' dy=' + Math.round(dy) + ' t=' + dt + 'ms'); return; }
        var active = getActive();
        if (active == null) { self._dbg('GESTURE dir=' + dir + ' ale activeId=null (martwy)'); return; }
        var idx = -1;
        for (var i = 0; i < items.length; i++) { if (items[i].id === active) { idx = i; break; } }
        if (idx < 0) { self._dbg('GESTURE dir=' + dir + ' active=' + active + ' — brak w items'); return; }
        var ni = (idx + dir + items.length) % items.length;               // ZAWIJANIE (karuzela): ostatnia↔pierwsza; tylko nav-swipe (attach), day-swipe (attachEl) bez zawijania
        var it = items[ni];
        self._dbg('GESTURE: ' + active + ' dir=' + dir + ' → ' + it.id + ' (' + (localMap[it.id] ? 'local' : ('href ' + it.target)) + ')');
        if (localMap[it.id]) onLocal(it.id);                               // in-page → callback
        else if (it.target) {
          try { sessionStorage.setItem('bm_vt_dir', dir === 1 ? 'fwd' : 'back'); } catch(e){}  // ETAP2: kierunek VT-slide dla nowej strony (odczyt w pagereveal); dir tu W ZASIĘGU
          if (self._dbgOn()) { var _t = it.target; setTimeout(function(){ location.href = _t; }, 1600); }  // debug: pokaż toast przed nawigacją
          else location.href = it.target;                                  // normalnie: natychmiast
        }
      }, { passive: true });
    },
    // Gest lewo/prawo NA ELEMENCIE (np. arkusz dnia). Współdzieli progi (_dir) i guardy (_blockedEl)
    //   z attach — WYJĄTEK: bez modal-z (el sam JEST w overlayu). stopPropagation po rozpoznaniu.
    //   opts: { onLeft, onRight, blockSelector }  (onLeft = swipe w lewo, np. następny dzień)
    attachEl: function(el, opts){
      opts = opts || {};
      var self = this;
      if (!el || !self._enabled()) return;
      var onLeft = (typeof opts.onLeft === 'function') ? opts.onLeft : function(){};
      var onRight = (typeof opts.onRight === 'function') ? opts.onRight : function(){};
      var blockSel = opts.blockSelector || null;
      var sx = 0, sy = 0, st = 0, tracking = false, blocked = false;

      el.addEventListener('touchstart', function(e){
        tracking = false; blocked = false;
        if (!e.touches || e.touches.length !== 1) { blocked = true; return; }
        if (!self._enabled()) { blocked = true; return; }
        if (blockSel && e.target.closest && e.target.closest(blockSel)) { blocked = true; return; }  // jawne wyłączenie (np. galeria)
        if (self._blockedEl(e.target, false)) { blocked = true; return; }  // bez modal-z (el JEST w overlayu)
        var t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); tracking = true;
        e.stopPropagation();   // zabierz gest document-level nav-swipe od startu (pas do blockWhen z części B)
      }, { passive: true });

      el.addEventListener('touchend', function(e){
        if (!tracking || blocked) return;
        tracking = false;
        var t = e.changedTouches && e.changedTouches[0]; if (!t) return;
        var dir = self._dir(t.clientX - sx, t.clientY - sy, Date.now() - st);
        if (!dir) return;
        e.stopPropagation();                                               // nie oddawaj gestu document-level nav-swipe
        if (dir === 1) onLeft(); else onRight();
      }, { passive: true });
    }
  };

  // ── ETAP2: kierunkowy VT slide — ODCZYT kierunku na NOWEJ stronie ──────────
  //   pagereveal odpala PRZED pierwszym renderem/animacją cross-doc VT → atrybut
  //   na :root zdąży, zanim VT policzy keyframes. sb.js to KLASYCZNY parser-blocking
  //   <script src> w <body> (bez defer/async) → wykonuje się w trakcie parsowania,
  //   PRZED pierwszą okazją renderu → ten listener rejestruje się ZANIM pagereveal
  //   poleci. Failure-safe: gdyby (kiedyś) się spóźnił / brak dir → atrybut nie
  //   wchodzi → zostaje cross-fade z ETAPU 1. NIGDY zły kierunek.
  window.addEventListener('pagereveal', function(e){
    if (!e || !e.viewTransition) return;                    // brak aktywnej cross-doc VT (fallback / same-doc)
    var d = null;
    try { d = sessionStorage.getItem('bm_vt_dir'); sessionStorage.removeItem('bm_vt_dir'); } catch(_){}
    if (d !== 'fwd' && d !== 'back') return;                // nawigacja nie-swipe → cross-fade (E1)
    document.documentElement.setAttribute('data-vt-dir', d);
    try { e.viewTransition.finished.finally(function(){ document.documentElement.removeAttribute('data-vt-dir'); }); }
    catch(_){ document.documentElement.removeAttribute('data-vt-dir'); }
  });

  // Włącznik debug z URL (telefon bez konsoli): ?swipedebug=1 → flaga on (persist w localStorage), ?swipedebug=0 → off.
  (function(){ try { var d = new URLSearchParams(location.search).get('swipedebug'); if (d === '1') localStorage.setItem('bm_swipe_debug','1'); else if (d === '0') localStorage.removeItem('bm_swipe_debug'); } catch(e){} })();

  // ─── IKONY POGODY 3D — weather_code/cloud_pct → slug (home + kalendarz) ───
  // Chmury = wariant dark (wygrał A/B 2026-06-17). Opady/burza/śnieg/mgła z code; clear-spectrum (0-3) z cloud_pct.
  window.wxIcon = function(code, cloudPct){
    code = Number(code);
    if (code >= 95) return 'wx-storm';                                  // burza
    if ([71,73,75,77,85,86].indexOf(code) !== -1) return 'wx-snow';     // śnieg
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'wx-rain'; // mżawka/deszcz/przelotne
    if (code === 45 || code === 48) return 'wx-fog';                    // mgła
    // clear-spectrum (0-3): preferuj cloud_pct; gdy brak (np. stary cache sprzed EF v3) → fallback z weather_code
    if (cloudPct == null) {
      if (code === 0) return 'wx-sun';
      if (code === 1) return 'wx-mostly-sun';
      if (code === 2) return 'wx-partly';
      return 'wx-cloud';                                                // code 3 + nieznane
    }
    const c = Number(cloudPct);                                        // clear-spectrum wg zachmurzenia
    if (c < 25) return 'wx-sun';
    if (c < 55) return 'wx-mostly-sun';
    if (c < 80) return 'wx-partly';
    return 'wx-cloud';
  };
  // Zwraca <img> ikony pogody; przy 404/braku helpera → emoji fallback (data-fb, bez JS-in-attr footguna).
  window.wxImg = function(code, cloudPct, emojiFallback, sizePx){
    if (!window.wxIcon || !window.assetUrl) return emojiFallback || '';
    const sz = sizePx || 32;
    const fb = (emojiFallback || '').replace(/"/g, '');
    return '<img src="' + window.assetUrl('icon-' + window.wxIcon(code, cloudPct) + '.webp') +
      '" alt="" data-fb="' + fb + '" style="width:' + sz + 'px;height:' + sz +
      'px;object-fit:contain;vertical-align:middle;" onerror="this.replaceWith(document.createTextNode(this.dataset.fb||\'\'))">';
  };

  // Wykrywanie ukrytego roweru: bieg ≥15km & pace <3:20/km = niemożliwe dla człowieka (zero false-positive).
  // NIE auto-filtr (pole pace brudne) — tylko soft-warning przy logowaniu.
  window.looksLikeBike = function(type, distKm, paceStr) {
    if (!window.isRunType(type)) return false;          // nie-bieg → już Zastępczy/itd.
    const d = parseFloat(distKm);
    if (!(d >= 15)) return false;                        // krótkie → możliwy sprint/interwał
    const m = /^(\d{1,2}):(\d{2})/.exec((paceStr || '').trim());
    if (!m) return false;                                // brak/zły pace → nie oceniamy
    const sec = (+m[1]) * 60 + (+m[2]);
    return sec > 0 && sec < 200;                         // < 3:20/km
  };

  // ── validateWorkoutSteps — walidacja trainings.steps wg BiegaMy_workout_steps_schema.md ──
  // Zwraca { ok:boolean, errors:string[], stepCount:number }. stepCount = kroki po rozwinięciu repeatów (limit Garmina ≤50).
  window.validateWorkoutSteps = (function () {
    var STEP_KINDS = ['warmup', 'run', 'recovery', 'rest', 'cooldown'];
    var DUR_TYPES = ['distance', 'time', 'open'];
    var TGT_TYPES = ['none', 'pace', 'hr', 'hr_zone'];
    var MAX_STEPS = 50;
    function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
    function isPosInt(n) { return isInt(n) && n > 0; }
    function validateDuration(d, path, errs) {
      if (!d || typeof d !== 'object') { errs.push(path + '.duration: brak/zły typ'); return; }
      if (DUR_TYPES.indexOf(d.type) === -1) { errs.push(path + '.duration.type nieprawidłowy: ' + d.type); return; }
      if (d.type === 'distance') { if (!isPosInt(d.m)) errs.push(path + '.duration.m musi być dodatnią liczbą całkowitą (metry)'); }
      else if (d.type === 'time') { if (!isPosInt(d.s)) errs.push(path + '.duration.s musi być dodatnią liczbą całkowitą (sekundy)'); }
    }
    function validateTarget(t, path, errs) {
      if (!t || typeof t !== 'object') { errs.push(path + '.target: brak/zły typ'); return; }
      if (TGT_TYPES.indexOf(t.type) === -1) { errs.push(path + '.target.type nieprawidłowy: ' + t.type); return; }
      if (t.type === 'pace') {
        if (!isPosInt(t.min_s_per_km) || !isPosInt(t.max_s_per_km)) { errs.push(path + '.target pace: min/max_s_per_km muszą być dodatnimi int'); return; }
        if (t.min_s_per_km > t.max_s_per_km) errs.push(path + '.target pace: min_s_per_km (szybsza) musi być ≤ max_s_per_km (wolniejsza)');
      } else if (t.type === 'hr') {
        if (!isPosInt(t.min_bpm) || !isPosInt(t.max_bpm)) { errs.push(path + '.target hr: min/max_bpm muszą być dodatnimi int'); return; }
        if (t.min_bpm > t.max_bpm) errs.push(path + '.target hr: min_bpm ≤ max_bpm');
      } else if (t.type === 'hr_zone') {
        if (!isInt(t.zone) || t.zone < 1 || t.zone > 5) errs.push(path + '.target hr_zone: zone musi być 1–5');
      }
    }
    function validateStep(s, path, errs) {
      if (!s || typeof s !== 'object') { errs.push(path + ': nie jest obiektem'); return; }
      if (STEP_KINDS.indexOf(s.kind) === -1) { errs.push(path + '.kind nieprawidłowy: ' + s.kind); return; }
      validateDuration(s.duration, path, errs);
      validateTarget(s.target, path, errs);
      if (s.note != null && typeof s.note !== 'string') errs.push(path + '.note musi być stringiem');
    }
    return function validateWorkoutSteps(steps) {
      var errs = [], count = 0;
      if (!Array.isArray(steps)) return { ok: false, errors: ['steps musi być tablicą'], stepCount: 0 };
      if (steps.length === 0) return { ok: false, errors: ['steps nie może być pusta'], stepCount: 0 };
      steps.forEach(function (el, i) {
        var path = 'steps[' + i + ']';
        if (el && el.kind === 'repeat') {
          if (!isPosInt(el.count)) errs.push(path + '.count musi być dodatnią liczbą całkowitą');
          if (!Array.isArray(el.steps) || el.steps.length === 0) { errs.push(path + '.steps (repeat) musi być niepustą tablicą'); return; }
          el.steps.forEach(function (cs, j) {
            var cpath = path + '.steps[' + j + ']';
            if (cs && cs.kind === 'repeat') { errs.push(cpath + ': zagnieżdżony repeat niedozwolony (v1)'); return; }
            validateStep(cs, cpath, errs);
          });
          count += (isPosInt(el.count) ? el.count : 0) * el.steps.length;
        } else { validateStep(el, path, errs); count += 1; }
      });
      if (count > MAX_STEPS) errs.push('Za dużo kroków po rozwinięciu repeatów: ' + count + ' > ' + MAX_STEPS + ' (limit Garmina)');
      return { ok: errs.length === 0, errors: errs, stepCount: count };
    };
  })();

  // ── renderWorkoutSteps — trainings.steps → czytelny opis PL (podgląd planu/push/auto-opis) ──
  // Zwraca { lines:string[], text:string }. text = lines.join(' → ').
  window.renderWorkoutSteps = (function () {
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function fmtDist(m) {
      if (m % 1000 === 0) return (m / 1000) + ' km';
      if (m >= 1000) return (m / 1000).toFixed(1).replace(/\.0$/, '') + ' km';
      return m + ' m';
    }
    function fmtTime(s) {
      if (s % 60 === 0) return (s / 60) + ' min';
      return Math.floor(s / 60) + ':' + pad(s % 60);
    }
    var KIND_PL = { warmup: 'Rozgrzewka', run: 'Bieg', recovery: 'Przerwa (trucht)', rest: 'Przerwa (stój)', cooldown: 'Schłodzenie' };
    function dur(d) {
      if (!d) return '';
      if (d.type === 'distance') return fmtDist(d.m);
      if (d.type === 'time') return fmtTime(d.s);
      if (d.type === 'open') return 'do wciśnięcia lap';
      return '';
    }
    function tgt(t) {
      if (!t || t.type === 'none') return '';
      if (t.type === 'pace') return '@ ' + Math.floor(t.min_s_per_km/60)+':'+pad(t.min_s_per_km%60) + '–' + Math.floor(t.max_s_per_km/60)+':'+pad(t.max_s_per_km%60) + '/km';
      if (t.type === 'hr') return '@ ' + t.min_bpm + '–' + t.max_bpm + ' bpm';
      if (t.type === 'hr_zone') return '@ strefa ' + t.zone;
      return '';
    }
    function stepLine(s) {
      var parts = [KIND_PL[s.kind] || s.kind, dur(s.duration), tgt(s.target)].filter(Boolean);
      var line = parts.join(' ');
      if (s.note) line += ' (' + s.note + ')';
      return line;
    }
    /* PLANER-2 P5: ludzka etykieta serii — po co ten trening (nad techniczna rozpiska) */
    function sensSerii(steps) {
      var maRepeat = steps.some(function (e) { return e && e.kind === 'repeat'; });
      var maTempo = steps.some(function (e) {
        var t = (e && e.target) || ((e.steps || [])[0] || {}).target;
        return t && t.type === 'pace';
      });
      if (maRepeat && maTempo) return 'Akcent \u2014 najmocniejsza część dnia. Rozgrzej się spokojnie, na powtórzeniach trzymaj równe tempo.';
      if (maRepeat) return 'Powtórzenia z przerwami \u2014 równe, kontrolowane, nie zrywaj się od pierwszego.';
      if (maTempo) return 'Równy wysiłek w zadanym tempie \u2014 rytm, nie zryw.';
      return '';
    }
    /* PLANER-2 P6: KROTKI zapis — jak trener na kartce: "rozgrzewka 2km · 5×1km @ 3:50 (przerwa 400m) · schłodzenie 2km" */
    function krotkiEl(el) {
      if (el && el.kind === 'repeat') {
        var biegi = (el.steps || []).filter(function (c) { return c.kind === 'run'; });
        var przerwy = (el.steps || []).filter(function (c) { return c.kind === 'recovery' || c.kind === 'rest'; });
        var glowny = biegi[0] || (el.steps || [])[0] || {};
        var txt = el.count + '×' + (glowny.duration ? dur(glowny.duration) : '');
        var t = tgt(glowny.target); if (t) txt += ' ' + t;
        if (przerwy.length && przerwy[0].duration) txt += ' (przerwa ' + dur(przerwy[0].duration) + ')';
        return txt;
      }
      var nazwa = { warmup: 'rozgrzewka', cooldown: 'schłodzenie' }[el.kind] || (KIND_PL[el.kind] || el.kind).toLowerCase();
      var d = dur(el.duration), tg = tgt(el.target);
      return (nazwa + ' ' + d + (tg ? ' ' + tg : '')).trim();
    }
    function krotki(steps) {
      return steps.map(krotkiEl).filter(Boolean).join(' · ');
    }
    return function renderWorkoutSteps(steps) {
      if (!Array.isArray(steps) || steps.length === 0) return { lines: [], text: '', short: '', sens: '' };
      var lines = steps.map(function (el) {
        if (el && el.kind === 'repeat') {
          var inner = (el.steps || []).map(stepLine).join(' + ');
          return el.count + '× [' + inner + ']';
        }
        return stepLine(el);
      });
      return { lines: lines, text: lines.join(' → '), short: krotki(steps), sens: sensSerii(steps) };
    };
  })();

  // ═══ intervals.icu drill-down (SSOT — przeniesione z kalendarz.html; kalendarz+trener konsumują) ═══
// ── intervals.icu drill-down: wykres tempo/HR + splity per km (reużywalne, pod L3 wejście z Formy) ──
let _icuChart = null, _icuHasHr = false, _icuMetricIdx = {};
const _ICU_AXIS = { pace:'yPace', hr:'yHr', resp:'yResp', cad:'yCad', alt:'yAlt', temp:'yTemp' };
const _ICU_BTN  = { pace:'ds-icu-tab-pace', hr:'ds-icu-tab-hr', resp:'ds-icu-tab-resp', cad:'ds-icu-tab-cad', alt:'ds-icu-tab-alt', temp:'ds-icu-tab-temp' };
window._icuFmtPace = function (s){ if (s==null) return '—'; const m=Math.floor(s/60), ss=s%60; return m+':'+String(ss).padStart(2,'0'); }
window._icuTabStyle = function (active){
  return "font-family:'DM Mono',monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;padding:5px 12px;border-radius:8px;cursor:pointer;transition:all 0.15s;"
    + (active ? "border:1px solid var(--accent);background:var(--accent);color:#fff;" : "border:1px solid rgba(255,255,255,0.12);background:transparent;color:var(--muted);");
}
// przełącznik metryki — jeden na raz (nigdy dwie naraz; oś Y przełącza się z metryką)
window._icuSetMetric = function (m){
  if (!_icuChart) return;
  if (!(m in _icuMetricIdx)) m = 'pace';
  Object.keys(_icuMetricIdx).forEach(k => _icuChart.setDatasetVisibility(_icuMetricIdx[k], k===m));   // pokaż tylko wybraną
  Object.values(_ICU_AXIS).forEach(ax => { const s=_icuChart.options.scales[ax]; if (s) s.display = (ax===_ICU_AXIS[m]); });
  _icuChart.update();
  Object.keys(_ICU_BTN).forEach(k => { const b=document.getElementById(_ICU_BTN[k]); if (!b) return; b.style.cssText = _icuTabStyle(k===m); if (!(k in _icuMetricIdx)) b.style.display='none'; });   // display PO cssText (cssText je zmazuje) — przycisk bez danych ukryty przy KAŻDYM przełączeniu, nie tylko po 1. renderze
}

window._renderIcuDetail = async function (logs) {
  const card = document.getElementById('ds-icu-card');
  if (!card) return;
  const loading = document.getElementById('ds-icu-loading');
  const chartWrap = document.getElementById('ds-icu-chart-wrap');
  const splitsEl = document.getElementById('ds-icu-splits');
  const msgEl = document.getElementById('ds-icu-msg');
  const multiEl = document.getElementById('ds-icu-multi');
  const statsEl = document.getElementById('ds-icu-stats');
  const zonesEl = document.getElementById('ds-icu-hrzones');
  if (_icuChart) { try { _icuChart.destroy(); } catch(e){} _icuChart = null; }
  loading.style.display='none'; chartWrap.style.display='none'; splitsEl.style.display='none'; msgEl.style.display='none'; multiEl.style.display='none'; if (statsEl) statsEl.style.display='none'; if (zonesEl) zonesEl.style.display='none';
  { const t=document.getElementById('ds-icu-tabs'); if (t) t.style.display='none'; }

  const icuLogs = (logs || []).filter(l => l.source === 'intervals' && l.external_id);
  if (!icuLogs.length) { card.style.display = 'none'; return; }   // brak intervals w dniu → karta ukryta
  card.style.display = 'block';
  loading.style.display = 'block';
  if (icuLogs.length > 1) { multiEl.textContent = 'trening 1 z ' + icuLogs.length; multiEl.style.display = 'block'; }  // nie gubimy drugiego
  const icuLog = icuLogs[0];

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('no_session');
    const fnUrl = (window.SB_FN_URL || 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1') + '/intervals-activity-detail';
    const res = await fetch(fnUrl, { method:'POST',
      headers:{ 'Authorization':'Bearer '+session.access_token, 'Content-Type':'application/json' },
      body: JSON.stringify({ athlete_id: icuLog.athlete_id, activity_id: icuLog.external_id }) });
    loading.style.display = 'none';
    if (res.status === 403) {   // nie-właściciel (np. trener ogląda cudzy dzień) — łagodnie, bez surowego błędu
      msgEl.textContent = 'Szczegóły dostępne dla zawodnika.'; msgEl.style.display = 'block'; return;
    }
    const d = await res.json().catch(()=>null);
    if (!d || !d.ok) { msgEl.textContent = 'Nie udało się wczytać szczegółów treningu.'; msgEl.style.display = 'block'; return; }

    if (typeof Chart === 'undefined') {   // Chart.js lazy-load (kalendarz go nie ma) — wzorzec sb.js:1431
      await new Promise((resolve, reject) => { const s=document.createElement('script');
        s.src='https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'; s.onload=resolve; s.onerror=reject; document.head.appendChild(s); });
    }
    chartWrap.style.display = 'block';   // canvas MUSI mieć wymiary PRZED new Chart (inaczej 0×0 → pusty wykres)
    splitsEl.style.display = 'block';
    _icuRenderChart(d);
    _icuRenderSplits(d, splitsEl);
    _icuRenderStats(d);
    _icuRenderHrZones(d);
    // przełącznik metryk (jeden na raz); widoczność przycisków ogarnia _icuSetMetric (ukrywa bez danych, trwale)
    const tabs = document.getElementById('ds-icu-tabs');
    if (tabs) tabs.style.display = 'flex';
    _icuSetMetric('pace');   // domyślnie TEMPO — ustawia styl + widoczność przycisków
  } catch(e) {
    loading.style.display = 'none';
    msgEl.textContent = 'Nie udało się wczytać szczegółów treningu.'; msgEl.style.display = 'block';
  }
}

window._icuRenderChart = function (d) {
  // świeży <canvas> co render — omija leftover-state Chart.js przy reużyciu ("Canvas is already in use" / pusty canvas przy 2. otwarciu)
  const oldC = document.getElementById('ds-icu-chart');
  if (oldC && oldC.parentNode) { const f = document.createElement('canvas'); f.id = 'ds-icu-chart'; oldC.parentNode.replaceChild(f, oldC); }
  const S = d.series || {};
  const xy = (arr)=>(arr||[]).map((v,i)=>({x:S.dist_km[i], y:v}));
  const has = (arr)=> !!(arr && arr.some(x=>x!=null));
  _icuHasHr = has(S.hr);   // źródło prawdy = DANE (≥1 realna próbka), NIE flaga d.has_hr (krucha: "false" truthy / [null,null] przeszłoby → martwy przycisk); ten sam has() co cad/alt
  const dsets = []; _icuMetricIdx = {};
  _icuMetricIdx.pace = dsets.length;
  dsets.push({ label:'Tempo', yAxisID:'yPace', borderColor:'#e8561e', backgroundColor:'rgba(232,86,30,0.08)', borderWidth:2, pointRadius:0, tension:0.3, fill:true, spanGaps:true, data:xy(S.pace_s) });
  if (_icuHasHr)      { _icuMetricIdx.hr  = dsets.length; dsets.push({ label:'Tętno',    yAxisID:'yHr',  borderColor:'#ff5b5b', borderWidth:1.5, pointRadius:0, tension:0.3, spanGaps:true, data:xy(S.hr) }); }
  if (has(S.cad))     { _icuMetricIdx.cad = dsets.length; dsets.push({ label:'Kadencja', yAxisID:'yCad', borderColor:'#5b8cff', borderWidth:1.5, pointRadius:0, tension:0.3, spanGaps:true, data:xy(S.cad.map(v=>v==null?v:v*2)) }); }   // ×2: per-noga→total spm (apka biegowa; rower=RPM byłby ×1)
  if (has(S.alt_m))   { _icuMetricIdx.alt = dsets.length; dsets.push({ label:'Wysokość', yAxisID:'yAlt', borderColor:'#3db870', backgroundColor:'rgba(61,184,112,0.08)', borderWidth:1.5, pointRadius:0, tension:0.3, fill:true, spanGaps:true, data:xy(S.alt_m) }); }
  if (has(S.resp))    { _icuMetricIdx.resp = dsets.length; dsets.push({ label:'Oddech',      yAxisID:'yResp', borderColor:'#2dd4bf', borderWidth:1.5, pointRadius:0, tension:0.3, spanGaps:true, data:xy(S.resp) }); }   // gated has() — bez HR brak streamu → null
  if (has(S.temp))    { _icuMetricIdx.temp = dsets.length; dsets.push({ label:'Temperatura', yAxisID:'yTemp', borderColor:'#f2b134', borderWidth:1.5, pointRadius:0, tension:0.3, spanGaps:true, data:xy(S.temp) }); }   // uniwersalna
  const mono = "'DM Mono',monospace";
  _icuChart = new Chart(document.getElementById('ds-icu-chart').getContext('2d'), {
    type:'line', data:{ datasets:dsets },
    options:{ maintainAspectRatio:false, animation:false, interaction:{mode:'index',intersect:false},
      scales:{
        x:{ type:'linear', ticks:{ color:'rgba(240,237,232,0.4)', font:{family:mono,size:9}, callback:(v)=>v+' km' }, grid:{color:'rgba(255,255,255,0.05)'} },
        yPace:{ position:'left', reverse:true, ticks:{ color:'#e8561e', font:{family:mono,size:9}, callback:(v)=>_icuFmtPace(v) }, grid:{color:'rgba(255,255,255,0.05)'} },
        yHr:{ position:'right', display:_icuHasHr, ticks:{ color:'#ff5b5b', font:{family:mono,size:9} }, grid:{display:false} },
        yCad:{ position:'right', display:false, ticks:{ color:'#5b8cff', font:{family:mono,size:9}, callback:(v)=>v+' spm' }, grid:{display:false} },
        yAlt:{ position:'right', display:false, ticks:{ color:'#3db870', font:{family:mono,size:9}, callback:(v)=>v+' m' }, grid:{display:false} },
        yResp:{ position:'right', display:false, ticks:{ color:'#2dd4bf', font:{family:mono,size:9}, callback:(v)=>v+' /min' }, grid:{display:false} },
        yTemp:{ position:'right', display:false, ticks:{ color:'#f2b134', font:{family:mono,size:9}, callback:(v)=>v+'°C' }, grid:{display:false} }
      },
      plugins:{ legend:{ display:false },
        tooltip:{ callbacks:{ title:(it)=>it[0].parsed.x.toFixed(2)+' km',
          label:(it)=>{ const a=it.dataset.yAxisID, y=it.parsed.y;
            return a==='yPace' ? ('Tempo '+_icuFmtPace(y)+'/km') : a==='yHr' ? ('HR '+y+' bpm') : a==='yResp' ? ('Oddech '+y+' /min') : a==='yCad' ? ('Kadencja '+y+' spm') : a==='yAlt' ? ('Wysokość '+Math.round(y)+' m') : a==='yTemp' ? ('Temp '+Math.round(y)+'°C') : (''+y); } } } }
    }
  });
}

window._icuRenderHrZones = function (d) {
  const el = document.getElementById('ds-icu-hrzones');
  if (!el) return;
  const z = d.hr_zones;
  if (!d.has_hr || !z || !Array.isArray(z.time_s) || !Array.isArray(z.labels) || !z.time_s.some(t=>t>0) || !window.renderHrZoneBars) {
    el.style.display='none'; el.innerHTML=''; return;   // graceful: bez HR / bez stref / brak helpera → sekcja znika
  }
  const labels = z.labels, times = z.time_s;
  let domI=0; for (let i=1;i<Math.min(labels.length,times.length);i++) if ((times[i]||0)>(times[domI]||0)) domI=i;   // argmax czasu
  const domPL = (window.HR_ZONE_PL||{})[labels[domI]];
  const domCap = 'trening głównie w ' + labels[domI] + (domPL ? ' ('+domPL+')' : '');
  // paski = wspólny helper sb.js (single source; A przepięte z page-local na renderHrZoneBars)
  el.innerHTML = `<div class="ds-label" style="margin:14px 0 3px;">Strefy tętna</div>
    <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.04em;color:rgba(240,237,232,0.5);margin-bottom:10px;">${domCap}</div>${window.renderHrZoneBars(z)}`;
  el.style.display='block';
}

window._icuRenderStats = function (d) {
  const el = document.getElementById('ds-icu-stats');
  if (!el) return;
  const st = d.stats;
  if (!st) { el.style.display='none'; el.innerHTML=''; return; }   // stare rowy przed self-heal (v<3)
  const cell = (label, val, unit, sub) => (val==null || val==='') ? '' :
    `<div class="ds-stat-cell">
       <div class="ds-stat-label">${label}</div>
       <div style="display:flex;align-items:baseline;gap:3px;"><span class="ds-stat-val">${val}</span>${unit?`<span class="ds-stat-unit">${unit}</span>`:''}</div>
       ${sub?`<div style="font-size:8px;font-family:'DM Mono',monospace;color:rgba(240,237,232,0.32);letter-spacing:0.1em;text-transform:uppercase;margin-top:4px;">${sub}</div>`:''}
     </div>`;
  const grp = (title, cells) => { const c = cells.filter(Boolean); return c.length ?
    `<div class="ds-label" style="margin:14px 0 8px;">${title}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">${c.join('')}</div>` : ''; };

  const cad = st.avg_cadence!=null ? Math.round(st.avg_cadence*2) : null;   // ×2: per-noga→total spm
  const groups = [
    grp('Tempo', [ cell('GAP', st.gap_pace_s!=null?_icuFmtPace(st.gap_pace_s):null, '/km', 'tempo wg terenu') ]),
    grp('Teren', [
      cell('Spadek', st.elev_loss_m!=null?('−'+Math.round(st.elev_loss_m)):null, 'm'),
      cell('Min wys.', st.min_alt_m!=null?Math.round(st.min_alt_m):null, 'm'),
      cell('Max wys.', st.max_alt_m!=null?Math.round(st.max_alt_m):null, 'm'),
    ]),
    grp('Ciało', [
      cell('Kadencja', cad, 'spm'),
      cell('Długość kroku', st.avg_stride_m!=null?st.avg_stride_m.toFixed(2):null, 'm'),
      cell('Temp śr', st.avg_temp_c!=null?Math.round(st.avg_temp_c):null, '°C'),
      cell('Temp max', st.max_temp_c!=null?Math.round(st.max_temp_c):null, '°C'),
    ]),
    d.has_hr ? grp('Obciążenie', [   // graceful: cała grupa znika bez HR
      cell('Max HR', st.max_hr, 'bpm'),
      cell('TSS', st.load!=null?Math.round(st.load):null, ''),
      cell('Intensywność', st.intensity!=null?Math.round(st.intensity):null, '%'),
    ]) : '',
  ].filter(Boolean);

  if (!groups.length) { el.style.display='none'; el.innerHTML=''; return; }
  el.innerHTML = groups.join('');
  el.style.display = 'block';
}

window._icuRenderSplits = function (d, el) {
  const sp = d.splits || [];
  if (!sp.length) { el.innerHTML=''; return; }
  const full = sp.filter(s=>s.pace_s!=null && !s.partial).map(s=>s.pace_s);
  const fastest = full.length? Math.min(...full):null, slowest = full.length? Math.max(...full):null;
  const spread = full.length>1 && slowest>fastest;   // ekstrema oznaczaj TYLKO gdy jest realna różnica (wszystkie równe → brak ▲/▼)
  el.innerHTML = sp.map(s=>{
    const w = (s.pace_s!=null && slowest>fastest) ? Math.round(100*(slowest - s.pace_s)/(slowest-fastest)) : 50;  // szybszy km = dłuższy pasek
    const mark = (!s.partial && spread && s.pace_s===fastest) ? '<span style="color:#3db870;" title="najszybszy">▲</span>'
               : (!s.partial && spread && s.pace_s===slowest) ? '<span style="color:#ff5b5b;" title="najwolniejszy">▼</span>' : '';
    return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-family:'DM Mono',monospace;font-size:11px;color:rgba(240,237,232,0.85);">
      <span style="width:36px;color:var(--muted);flex-shrink:0;">${s.partial? s.km.toFixed(2):(s.km+' km')}</span>
      <span style="flex:1;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;"><span style="display:block;height:100%;width:${Math.max(4,w)}%;background:var(--accent);"></span></span>
      <span style="width:60px;text-align:right;flex-shrink:0;">${_icuFmtPace(s.pace_s)}/km ${mark}</span>
      ${d.splits.some(x=>x.hr_avg!=null) ? `<span style="width:44px;text-align:right;flex-shrink:0;color:#ff9b9b;">${s.hr_avg!=null?('♥'+s.hr_avg):''}</span>` : ''}
      <span style="width:38px;text-align:right;flex-shrink:0;color:var(--muted);">${s.elev_gain_m?('+'+s.elev_gain_m+'m'):''}</span>
    </div>`;
  }).join('');
}



  // Soft confirm 2-przyciskowy (promise). Klik w tło / "To bieg" = 'run'; "To rower" = 'bike'.
  window.askBikeOrRun = function(distKm, paceStr) {
    return new Promise((resolve) => {
      document.getElementById('_bikeAsk')?.remove();
      const m = document.createElement('div');
      m.id = '_bikeAsk';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.78);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);';
      const done = (v) => { m.remove(); resolve(v); };
      const detail = (distKm ? Math.round(distKm) + ' km' : '') + (paceStr ? ' po ' + paceStr + '/km' : '');
      m.innerHTML = '<div style="max-width:380px;width:100%;background:linear-gradient(140deg,#1a1422,#13101a);border:1px solid rgba(232,86,30,0.3);border-radius:16px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,0.6);text-align:center;">'
        + '<div style="font-size:40px;line-height:1;margin-bottom:10px;">🚴</div>'
        + '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:22px;color:#fff;letter-spacing:0.03em;margin-bottom:8px;">To wygląda na rower</div>'
        + '<div style="font-family:\'Inter\',sans-serif;font-size:13px;color:rgba(255,255,255,0.7);line-height:1.5;margin-bottom:18px;">' + detail + ' — to tempo jest niemożliwe dla biegu. Zapisać jako trening zastępczy?</div>'
        + '<div style="display:flex;gap:10px;">'
        + '<button id="_baRun" style="flex:1;background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:10px;padding:12px;font-family:\'DM Mono\',monospace;font-size:12px;cursor:pointer;">To bieg</button>'
        + '<button id="_baBike" style="flex:1;background:linear-gradient(135deg,#e8561e,#ff8a4c);color:#fff;border:none;border-radius:10px;padding:12px;font-family:\'DM Mono\',monospace;font-size:12px;font-weight:700;cursor:pointer;">To rower 🚴</button>'
        + '</div></div>';
      m.addEventListener('click', (e) => { if (e.target === m) done('run'); });  // klik w tło = soft "zostaw bieg"
      document.body.appendChild(m);
      document.getElementById('_baRun').onclick = () => done('run');
      document.getElementById('_baBike').onclick = () => done('bike');
    });
  };

  // ═══════════════════════════════════════════════════════════════
  // 📈 FORMA HELPERS — TRIMP calculation (CTL/ATL/TSB feature)
  // ═══════════════════════════════════════════════════════════════
  window.FORMA_EFFORT_FACTORS = {
    'odpoczynek': 0,
    'regeneracja': 1.0,
    'spacer': 0.5,
    'rower': 1.0,
    'pływanie': 1.0,
    'siłownia': 1.2,
    'joga': 0.6,
    'narty': 1.3,
    'ergometr': 1.2,
    'orbitrek': 1.0,
    'spokojny': 1.5,
    'bieg spokojny': 1.5,
    'wybieganie': 2.0,
    'długi': 2.5,
    'wzmacniający': 1.5,
    'zastępczy': 1.5,
    'tempo': 3.5,
    'progresja': 3.0,
    'interwały': 4.5,
    'start': 5.0,
    'wyścig': 5.0,
  };
  window.FORMA_FEEL_MODIFIERS = { 'good': 1.0, 'mid': 1.1, 'bad': 1.3 };

  window.formaDurationToMin = function(s) {
    if (!s || typeof s !== 'string') return 0;
    const t = s.trim(); if (!t) return 0;
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    const p = t.split(':').map(x => parseInt(x, 10) || 0);
    if (p.length === 2) return p[0] + p[1] / 60;
    if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 60;
    return 0;
  };

  window.formaTRIMP = function(log) {
    const dur = window.formaDurationToMin(log.duration);
    const key = (log.training_type || '').toLowerCase().trim();
    const effort = (window.FORMA_EFFORT_FACTORS[key] !== undefined) ? window.FORMA_EFFORT_FACTORS[key] : 1.5;
    const feelMod = window.FORMA_FEEL_MODIFIERS[log.feel] || 1.0;
    return Math.round(dur * effort * feelMod);
  };

  // MET factors — kalkulacja kalorii spalonych per trening (formula: MET × kg × hours)
  window.FORMA_MET_FACTORS = {
    'odpoczynek': 0,
    'regeneracja': 6,
    'spacer': 3.5,
    'rower': 7.5,
    'pływanie': 8,
    'siłownia': 5,
    'joga': 3,
    'narty': 9,
    'ergometr': 7,
    'orbitrek': 6.5,
    'spokojny': 8.5,
    'bieg spokojny': 8.5,
    'wybieganie': 9,
    'długi': 9.5,
    'wzmacniający': 5,
    'zastępczy': 6,
    'tempo': 11,
    'progresja': 11,
    'interwały': 13,
    'start': 14,
    'wyścig': 14,
  };

  window.formaCalories = function(log, weightKg) {
    // Priority: stored value (manual input lub OCR) > MET compute z weight
    if (log && log.calories && log.calories > 0) return log.calories;
    if (!weightKg || weightKg <= 0) return 0;
    const dur = window.formaDurationToMin(log.duration);
    const key = (log.training_type || '').toLowerCase().trim();
    const met = (window.FORMA_MET_FACTORS[key] !== undefined) ? window.FORMA_MET_FACTORS[key] : 8;
    return Math.round(met * weightKg * (dur / 60));
  };

  // Compute forma summary stats — używane przez compare athletes feature (CTL/ATL/TSB + weekly metrics)
  window.computeFormaStats = function(logs, weightKg) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(today); start.setDate(start.getDate() - 90);

    // Daily TRIMP map
    const dailyTRIMP = {};
    (logs || []).forEach(log => {
      const dateStr = (log.logged_at || '').split('T')[0];
      if (!dateStr) return;
      dailyTRIMP[dateStr] = (dailyTRIMP[dateStr] || 0) + window.formaTRIMP(log);
    });

    // EMA loop (CTL 42d, ATL 7d) from start to today
    /* FORMA-SEED v2: seed od OSTATNIEGO ciaglego bloku (dziura >21 dni resetuje punkt startu), jak renderForma */
    let _seedS = 0, _blkS = null;
    { const _sk = Object.keys(dailyTRIMP).sort();
      if (_sk.length) {
        let _bs = _sk[0];
        for (let _i = 1; _i < _sk.length; _i++) { if ((new Date(_sk[_i]) - new Date(_sk[_i-1])) / 864e5 > 21) _bs = _sk[_i]; }
        /* FORMA-SEED v4: pomin wiodace zerowe dni (odpoczynki, TRIMP=0) na starcie bloku — seed od pierwszego REALNEGO treningu (edge A: Malgorzata CTL27, Filip seed=0) */
        for (let _i = 0; _i < _sk.length; _i++) { if (_sk[_i] >= _bs && dailyTRIMP[_sk[_i]] > 0) { _bs = _sk[_i]; break; } }
        _blkS = _bs;
        const _f = new Date(_bs + 'T12:00:00'); _f.setDate(_f.getDate() + 14);
        const _cut = _f.toISOString().slice(0, 10); let _ss = 0;
        let _mx2 = 0; _sk.forEach(function(k){ if (k >= _bs && k < _cut) { _ss += dailyTRIMP[k]; if (dailyTRIMP[k] > _mx2) _mx2 = dailyTRIMP[k]; } }); _seedS = Math.min(_ss / 14, (_ss - _mx2) / 13 * 2.5 + 20); } }   /* FORMA-SEED v3: clamp outliera (pojedynczy ultra w oknie seeda, np. 289->95) */
    let ctl = 0, atl = 0;
    if (_blkS && _blkS <= start.toISOString().slice(0, 10)) { ctl = _seedS; atl = _seedS; }
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      if (_blkS && dateStr === _blkS) { ctl = _seedS; atl = _seedS; }   /* reset na starcie bloku */
      const trimp = dailyTRIMP[dateStr] || 0;
      ctl = ctl + (trimp - ctl) / 42;
      atl = atl + (trimp - atl) / 7;
    }

    // Weekly metrics (last 7 days)
    const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
    const weekLogs = (logs || []).filter(l => new Date(l.logged_at) >= weekAgo);
    const weekKm = weekLogs.reduce((s, l) => s + (parseFloat(l.distance_km) || 0), 0);
    const weekTrimp = weekLogs.reduce((s, l) => s + window.formaTRIMP(l), 0);
    const weekKcal = (weightKg && weightKg > 0) ? weekLogs.reduce((s, l) => s + window.formaCalories(l, weightKg), 0) : 0;

    return {
      ctl: Math.round(ctl),
      atl: Math.round(atl),
      tsb: Math.round(ctl - atl),
      weekKm: Math.round(weekKm * 10) / 10,
      weekTrimp,
      weekKcal,
      weekTrainings: weekLogs.length,
      totalLogs: (logs || []).length
    };
  };

  // ────────────────────────────────────────────────────────────────────────
  // computeFormaSeries — time-series CTL/ATL/TSB/TRIMP per day
  // Reusable dla compare.html, future AI reports, future viz
  // Input: logs array (sorted by logged_at asc), days window (default 90)
  // Output: { labels, ctlData, atlData, tsbData, trimpData } — same length arrays
  // ────────────────────────────────────────────────────────────────────────
  window.computeFormaSeries = function(logs, daysWindow) {
    daysWindow = daysWindow || 90;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - daysWindow + 1);

    // Bucketize logs per ISO date (YYYY-MM-DD)
    const dailyTrimp = {};
    for (const log of (logs || [])) {
      if (!log.logged_at) continue;
      if ((log.training_type || '').startsWith('__badge__')) continue;
      const d = new Date(log.logged_at);
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      const trimp = (typeof window.formaTRIMP === 'function') ? window.formaTRIMP(log) : 0;
      dailyTrimp[key] = (dailyTrimp[key] || 0) + trimp;
    }

    const labels = [], ctlData = [], atlData = [], tsbData = [], trimpData = [];
    const CTL_TAU = 42, ATL_TAU = 7;
    const ctlAlpha = 1 - Math.exp(-1 / CTL_TAU);
    const atlAlpha = 1 - Math.exp(-1 / ATL_TAU);
    let ctl = 0, atl = 0;

    for (let i = 0; i < daysWindow; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      const trimp = dailyTrimp[key] || 0;
      ctl = ctl + ctlAlpha * (trimp - ctl);
      atl = atl + atlAlpha * (trimp - atl);
      labels.push(key);
      ctlData.push(Math.round(ctl * 10) / 10);
      atlData.push(Math.round(atl * 10) / 10);
      tsbData.push(Math.round((ctl - atl) * 10) / 10);
      trimpData.push(Math.round(trimp));
    }

    return { labels, ctlData, atlData, tsbData, trimpData };
  };

  // ────────────────────────────────────────────────────────────────────────
  // computeFormaProjection — N dni do przodu CTL/ATL/TSB przy ZAŁOŻENIU braku treningów
  // Strava-style "what if I rest from today" — dashed line w przyszłość
  // EMA: CTL_t = CTL_t-1 + (TRIMP - CTL_t-1) * (1/42), ATL analog z 1/7
  // ────────────────────────────────────────────────────────────────────────
  window.computeFormaProjection = function(currentCTL, currentATL, daysForward) {
    const days = daysForward || 14;
    const projection = { labels: [], ctlData: [], atlData: [], tsbData: [] };
    let ctl = currentCTL;
    let atl = currentATL;
    const today = new Date();
    for (let i = 1; i <= days; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const lbl = (d.getMonth()+1) + '-' + String(d.getDate()).padStart(2,'0');
      // Założenie TRIMP = 0 (brak treningu)
      ctl = ctl + (0 - ctl) * (1/42);
      atl = atl + (0 - atl) * (1/7);
      projection.labels.push(lbl);
      projection.ctlData.push(Math.round(ctl * 10) / 10);
      projection.atlData.push(Math.round(atl * 10) / 10);
      projection.tsbData.push(Math.round((ctl - atl) * 10) / 10);
    }
    return projection;
  };

  // ────────────────────────────────────────────────────────────────────────
  // computeNextRace — z race_goals JSON wyciągnij najbliższy upcoming start
  // Input: raceGoals (array of {name, date, ...} lub stringified JSON)
  // Output: { name, date, daysLeft } | null
  // ────────────────────────────────────────────────────────────────────────
  window.computeNextRace = function(raceGoals) {
    let goals = raceGoals;
    if (typeof goals === 'string') {
      try { goals = JSON.parse(goals); } catch(e) { return null; }
    }
    if (!Array.isArray(goals) || goals.length === 0) return null;
    const now = new Date();
    const upcoming = goals
      .filter(g => g.date && new Date(g.date) >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!upcoming.length) return null;
    const nearest = upcoming[0];
    const daysLeft = Math.ceil((new Date(nearest.date) - now) / 86400000);
    return {
      name: nearest.name || 'Start',
      date: nearest.date,
      daysLeft: daysLeft
    };
  };

  // ─────────────────────────────────────────────────────────────────────
  // METRIC_TOOLTIPS — content store dla v2 "jak dla debida"
  // Używane przez showMetricTooltip() w zawodnik.html + compare.html
  // Każda metryka ma 3 sekcje: "Co to jest" / "Jak czytać" / "Co robić"
  // ─────────────────────────────────────────────────────────────────────
  window.METRIC_TOOLTIPS = {
    tsb: {
      title: 'TSB · Forma świeża',
      sections: [
        { heading: 'Co to jest', body: 'TSB to <b>wskaźnik świeżości</b> Twojej formy. Pokazuje różnicę między długoterminowym treningiem (CTL, ostatnie 6 tygodni) a krótkoterminowym zmęczeniem (ATL, ostatnie 7 dni).<br><br>Jeśli ostatnio sporo trenowałeś = ATL wysoki = TSB spada. Jeśli odpoczywałeś po build-upie = ATL niski + CTL trzyma = TSB rośnie.' },
        { heading: 'Jak czytać', body: '<b>Linia w górę = jesteś świeższy.</b> (Tak, brzmi nieintuicyjnie — bo zmęczenie "rośnie" gdy linia idzie w dół. To bilans świeżości, nie obciążenia. Wyższy = lepszy.)<br><br>Wartości referencyjne:<br>🟡 <b>TSB &gt; +25</b> — Over-rested, możesz tracić formę<br>🟢 <b>TSB +5 do +15</b> — Optimum, gotowość startowa<br>⚪ <b>TSB -10 do +5</b> — Neutralna, normalny rytm<br>🟠 <b>TSB -10 do -30</b> — Obciążenie, celowy build-up<br>🔴 <b>TSB &lt; -30</b> — Przeciążenie, ryzyko kontuzji' },
        { heading: 'Co robić', body: '• <b>Przed startem</b> (10-14 dni): celuj w TSB +5 do +15 dzień przed<br>• <b>W okresie budowania</b>: TSB -10 do -20 to idealny stres treningowy<br>• <b>Czujesz wypalenie + TSB &lt; -25</b>: dorzucisz 2-3 dni regeneracji<br>• <b>TSB &gt; +20 bez startu w planie</b>: dorzuć intensywność, tracisz formę' }
      ]
    },
    ctl: {
      title: 'CTL · Forma długa',
      sections: [
        { heading: 'Co to jest', body: 'CTL to Twoja <b>forma długoterminowa</b> — średnie obciążenie treningowe z ostatnich ~6 tygodni, ważone w stronę świeższych treningów.<br><br>Im więcej i regularniej trenujesz, tym wyższe CTL. To <b>pojemność</b>, którą organizm wytrzymuje w trybie ciągłym.' },
        { heading: 'Jak czytać', body: 'Wartość rośnie wolno (tygodniami systematyczności) i spada wolno (też tygodniami przerwy). Brak jednoznacznych "stref" — każdy zawodnik ma własną bazę.<br><br>Punkty odniesienia hobbysta-amator:<br>• <b>CTL 30-50</b> — biegacz rekreacyjny, 3-4 treningi/tydz<br>• <b>CTL 50-80</b> — średnio-zaawansowany, 5-6 treningów/tydz<br>• <b>CTL 80-110</b> — zaawansowany, sezonowy peak<br>• <b>CTL &gt; 110</b> — poziom (sub)elity, ryzyko bez monitoringu' },
        { heading: 'Co robić', body: '• <b>Patrz na trend</b>, nie wartość. Rosnące CTL = budujesz formę. Stałe = utrzymujesz. Spadające &gt; 2 tygodnie = tracisz bazę.<br>• <b>Nie podnoś CTL &gt; 5-7 punktów/tydz</b> — próg ryzyka kontuzji (zasada 7% Coggan)<br>• <b>Po starcie</b> CTL spada o 5-15 punktów przez taper — to OK, wróci' }
      ]
    },
    atl: {
      title: 'ATL · Zmęczenie',
      sections: [
        { heading: 'Co to jest', body: 'ATL to <b>zmęczenie krótkoterminowe</b> — średnie obciążenie z ostatnich ~7 dni. Reaguje szybko na to co właśnie zrobiłeś.<br><br>Po ciężkim tygodniu ATL skoczy w górę. Po 2-3 dniach regeneracji szybko spadnie.' },
        { heading: 'Jak czytać', body: 'Wartość zmienna z dnia na dzień. <b>Wysokie ATL</b> = jesteś w okresie obciążenia. <b>Niskie ATL</b> = świeży, zregenerowany.<br><br>ATL sam w sobie nie mówi czy to "dobrze" — kontekst daje porównanie z CTL (czyli wskaźnik TSB).' },
        { heading: 'Co robić', body: '• <b>ATL znacznie wyższe niż CTL</b> (np. ATL 70 / CTL 50) = jesteś przemęczony względem swojej bazy. TSB ujemne = patrz tam.<br>• <b>ATL niskie + CTL wysokie</b> = świeży na peak formy. Dobry moment na start.<br>• <b>ATL śledzi tygodniowy trening</b> — jeśli nie spada mimo "lekkiego tygodnia", sprawdź czy faktycznie odpoczywasz.' }
      ]
    },
    trimp: {
      title: 'TRIMP · Jednostka obciążenia',
      sections: [
        { heading: 'Co to jest', body: 'TRIMP (Training Impulse) to <b>jednostka obciążenia</b> pojedynczego treningu. Łączy w jednej liczbie: długość treningu × intensywność × samopoczucie.<br><br>60 minut spokojnego = ~50 TRIMP. 60 minut interwałów = ~120 TRIMP. 3h długi bieg = ~150 TRIMP.' },
        { heading: 'Jak czytać', body: 'Im wyższy TRIMP, tym ciężej organizm pracował. To <b>waluta</b> której organizm "zapłaci" obciążeniem (ATL) i regeneracją.<br><br>Każdy TRIMP dnia wpływa na: TSB (jak czujesz się jutro), CTL (jak forma rośnie), heatmap (intensywność dnia).' },
        { heading: 'Co robić', body: '• <b>Tygodniowy TRIMP</b> = suma wszystkich dni. Trzymaj progres ~5-10% tygodniowo.<br>• <b>Pojedynczy trening &gt; 200 TRIMP</b> = bardzo ciężki, wymaga 24-48h regeneracji<br>• <b>Dzień z 0 TRIMP</b> = pełna regeneracja, OK 1-2× tygodniowo' }
      ]
    },
    weekly_km: {
      title: 'Kilometraż tygodniowy',
      sections: [
        { heading: 'Co to jest', body: 'Suma <b>kilometrów przebiegniętych</b> w każdym z ostatnich 8 tygodni. Najprostszy wskaźnik objętości treningu.' },
        { heading: 'Jak czytać', body: 'Wysokość słupka = km tygodnia. Porównuj tygodnie obok siebie — szukasz trendu, nie pojedynczego rekordu.<br><br>Idealny pattern: 3 tygodnie progresji (~10% wzrost) + 1 tydzień regeneracyjny (~20% niżej). Cykl 4-tygodniowy.' },
        { heading: 'Co robić', body: '• <b>Skok &gt; 15% tydzień-do-tygodnia</b> = ryzyko kontuzji. Cofnij się do progresji 5-10%.<br>• <b>Plateau przez 4+ tygodnie</b> = czas na progresję lub zmianę bodźca (więcej intensywności).<br>• <b>Drop &gt; 30%</b> = sprawdź czy intencjonalny (taper, regeneracja), czy "wypadek" (choroba, kontuzja, motywacja).<br>• <b>Long run</b> to zwykle 25-35% tygodniowego kilometrażu — sprawdź czy się mieścisz.' }
      ]
    },
    kalorie: {
      title: 'Kalorie spalone',
      sections: [
        { heading: 'Co to jest', body: 'Sumaryczny <b>wydatek energetyczny</b> treningów. Liczone z OCR screenów (gdy dostępne) lub szacowane wzorem MET × waga × czas (gdy brak danych z zegarka).' },
        { heading: 'Jak czytać', body: 'Tygodniowe słupki — porównuj objętość energetyczną tygodni. Wartości zależne od wagi: 70kg biegacz spala ~60% mniej niż 90kg na tej samej trasie.<br><br>Punkty odniesienia (przy biegu spokojnym):<br>• 30 min biegu = ~300-450 kcal<br>• 1h biegu = ~600-900 kcal<br>• Long run 2h = ~1200-1800 kcal' },
        { heading: 'Co robić', body: '• <b>Łącz z nutrition tracker</b> — jeśli widzisz tydzień 4000+ kcal spalonego treningu, sprawdź czy jesz wystarczająco. Deficyt &gt; 500 kcal/dzień długoterminowo = ryzyko spadku formy.<br>• <b>Po dużym wydatku</b> (long run, race) zwiększ białko i węglowodany przez 24-48h.<br>• <b>Wzór MET</b> to szacunek — z OCR dane z zegarka są dokładniejsze (uwzględniają HR, elevation).' }
      ]
    },
    heatmap: {
      title: 'Heatmap · 13 tygodni',
      sections: [
        { heading: 'Co to jest', body: 'Heatmap to <b>GitHub-style mapa cieplna</b> — 13 tygodni × 7 dni. Każda komórka = jeden dzień, kolor pokazuje intensywność treningu (TRIMP).' },
        { heading: 'Jak czytać', body: '5 poziomów intensywności:<br><br>⬜ <b>0</b> — brak treningu (regeneracja lub odpoczynek)<br>🟩 <b>1-30 TRIMP</b> — lekki (spokojny bieg, krótka aktywność)<br>🟢 <b>31-60 TRIMP</b> — średni (typowy trening 60min)<br>🟠 <b>61-100 TRIMP</b> — wysoki (tempo, długi, interwały)<br>🔴 <b>&gt; 100 TRIMP</b> — bardzo wysoki (long, ciężki interwałowy, race)<br><br>Hover na komórkę = data, TRIMP, kcal.' },
        { heading: 'Co robić', body: '• <b>Patrz na pattern, nie pojedyncze dni</b> — szukasz mieszanki kolorów. Same zielone = brak intensywności. Same czerwone = brak regeneracji.<br>• <b>Białe dni 2× w tygodniu</b> = zdrowa regeneracja. 0 białych dni &gt; 2 tygodnie = ryzyko przemęczenia.<br>• <b>Dwa czerwone z rzędu</b> = sprawdź czy następny jest biały/zielony. Twardy-twardy-twardy = receptura na kontuzję.' }
      ]
    },
    types_pie: {
      title: 'Typy treningów · 7 dni',
      sections: [
        { heading: 'Co to jest', body: 'Wykres kołowy pokazujący <b>podział kilometrażu wg typu treningu</b> w ostatnich 7 dniach. Spokojny, tempo, interwały, długi, regeneracja itd.' },
        { heading: 'Jak czytać', body: 'Większa wycinka = więcej km tego typu. Kolory zgodne z resztą aplikacji (każdy typ ma swoją barwę).<br><br>Zdrowy podział hobbysty (orientacyjnie):<br>• <b>70-80%</b> spokojny / wybieganie / regeneracja<br>• <b>15-20%</b> tempo / progresja<br>• <b>5-10%</b> interwały / wyścig<br>• <b>+</b> długi 1× tygodniowo (osobno, ~25-30% tygodniowego km)' },
        { heading: 'Co robić', body: '• <b>100% spokojny</b> &gt; 2 tygodnie = brak intensywności = forma się "płaszczy". Dorzuć 1× tempo lub interwał.<br>• <b>&gt; 30% intensywny</b> (tempo+interwały) = duże ryzyko przemęczenia/kontuzji. Łatwiej, łatwiej, łatwiej.<br>• <b>Brak długiego</b> &gt; 2 tygodnie (jeśli plan ma) = zawęża się baza wytrzymałości.' }
      ]
    },
    race_countdown: {
      title: 'Odliczanie do startu',
      sections: [
        { heading: 'Co to jest', body: 'Odliczanie do <b>najbliższego startu</b> zapisanego w Twoich celach startowych. Pokazuje nazwę startu + liczbę dni do daty.' },
        { heading: 'Jak czytać', body: 'Pojawia się tylko gdy masz upcoming start w profil → cele. Aktualizuje się codziennie.<br><br>Strefy taperu (orientacyjnie):<br>• <b>&gt; 28 dni</b> — build phase, normalna progresja<br>• <b>14-28 dni</b> — peak phase, ostatnie ciężkie tygodnie<br>• <b>7-14 dni</b> — taper start, redukcja objętości o 20-40%<br>• <b>0-7 dni</b> — final taper, lekkie treningi, race readiness check<br>• <b>DZIŚ!</b> — race day, powodzenia 🏁' },
        { heading: 'Co robić', body: '• <b>Dodaj kolejny start</b> w profil → cele żeby countdown szedł dalej po wyścigu.<br>• <b>W taperze</b> patrz na TSB — celuj w +5 do +15 dzień przed startem.<br>• <b>48h przed</b> zero ciężkich treningów. Krótkie wybieganie + pasta party.<br>• <b>Race day</b> — śpisz, jesz znanymi rzeczami, nie testujesz nowości.' }
      ]
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // showMetricTooltip(key) — uniwersalny modal "jak dla debida"
  // Wstrzykuje modal do body, zamyka klik backdrop / ESC / × button
  // ─────────────────────────────────────────────────────────────────────
  window.showMetricTooltip = function(key) {
    const data = window.METRIC_TOOLTIPS && window.METRIC_TOOLTIPS[key];
    if (!data) { console.warn('[tooltip] brak content dla key:', key); return; }

    // Remove existing modal jeśli był
    document.getElementById('metric-tooltip-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'metric-tooltip-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.78);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);animation:tipFadeIn 0.2s ease;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const sectionsHtml = data.sections.map(s =>
      '<div style="margin-bottom:16px;">' +
        '<div style="font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#e8561e;font-weight:700;margin-bottom:6px;">' + s.heading + '</div>' +
        '<div style="font-family:\'Inter\',sans-serif;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.88);">' + s.body + '</div>' +
      '</div>'
    ).join('');

    modal.innerHTML = '<div style="max-width:520px;width:100%;max-height:85vh;overflow-y:auto;background:linear-gradient(140deg,#1a1422,#13101a);border:1px solid rgba(232,86,30,0.3);border-radius:16px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.6);">' +
      '<div style="display:flex;align-items:start;justify-content:space-between;gap:12px;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.08);">' +
        '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:20px;letter-spacing:0.04em;color:#fff;">' + data.title + '</div>' +
        '<button onclick="document.getElementById(\'metric-tooltip-modal\')?.remove()" style="background:rgba(255,255,255,0.08);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px;flex-shrink:0;">×</button>' +
      '</div>' +
      sectionsHtml +
    '</div>';

    document.body.appendChild(modal);

    // ESC close
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  };

  // Helper do generowania (i) icon HTML — używany inline w templates
  window.tooltipIconHtml = function(key, style) {
    style = style || '';
    return '<button onclick="event.stopPropagation();window.showMetricTooltip(\'' + key + '\')" title="Co to znaczy?" style="background:rgba(232,86,30,0.15);border:1px solid rgba(232,86,30,0.35);color:#e8561e;width:18px;height:18px;border-radius:50%;cursor:pointer;font-size:10px;font-family:\'DM Mono\',monospace;font-weight:700;padding:0;display:inline-flex;align-items:center;justify-content:center;line-height:1;flex-shrink:0;' + style + '">i</button>';
  };

  // Inject CSS animacja fadeIn raz (jeśli sb.js loaded multiple times — guard)
  if (typeof document !== 'undefined' && !document.getElementById('tip-anim-style')) {
    const s = document.createElement('style');
    s.id = 'tip-anim-style';
    s.textContent = '@keyframes tipFadeIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}';
    document.head.appendChild(s);
  }

  // Single source of truth dla training_type colors (używane w _renderFormaTypes, statystyki.html, future heatmap)
  window.TRAINING_TYPE_COLORS = {
    'Spokojny':'#3db870','Bieg spokojny':'#3db870','Tempo':'#e8b840','Interwały':'#e05050','Długi':'#5b8cff','Wybieganie':'#5b8cff',
    'Regeneracja':'#9b6dff','Wzmacniający':'#ff7a45','Zastępczy':'#66c0ff','Odpoczynek':'#888','Progresja':'#e8b840','Start':'#dc2626','Wyścig':'#dc2626','Trening':'#e8561e'
  };

  // Ikony 3D typów treningu (SSOT) — nazwa pliku bez 'icon-' i '.webp'
  window.TRAINING_TYPE_ICONS = {
    'Spokojny':'type-spokojny','Interwały':'type-interwaly','Tempo':'type-tempo','Wybieganie':'type-wybieganie',
    'Regeneracja':'type-regeneracja','Wzmacniający':'type-wzmacniajacy','Start':'type-start','Zastępczy':'type-zastepczy','Odpoczynek':'type-odpoczynek'
  };
  // Zwraca <img> ikony typu (lub '' gdy brak). size w px.
  window.trainingTypeIconHtml = function(type, size) {
    const n = (window.TRAINING_TYPE_ICONS || {})[type];
    if (!n || !window.assetUrl) return '';
    size = size || 18;
    return '<img src="' + window.assetUrl('icon-' + n + '.webp') + '" style="width:' + size + 'px;height:' + size + 'px;vertical-align:-3px;flex-shrink:0;" alt="">';
  };

  // Mapa typ→banner (szerokie okładki). Klucze = te same nazwy typów co TRAINING_TYPE_ICONS.
  // Odpoczynek świadomie pominięty — brak banner-odpoczynek.webp (dzień wolny bez okładki).
  window.TRAINING_TYPE_BANNERS = {
    'Spokojny':'banner-spokojny', 'Bieg spokojny':'banner-spokojny', 'Interwały':'banner-interwaly',
    'Tempo':'banner-tempo', 'Wybieganie':'banner-wybieganie', 'Regeneracja':'banner-regeneracja',
    'Wzmacniający':'banner-wzmacniajacy', 'Start':'banner-start', 'Zastępczy':'banner-zastepczy'
  };
  // Zwraca URL bannera typu (lub '' gdy brak mapowania/assetUrl).
  window.trainingTypeBannerUrl = function(type) {
    const f = (window.TRAINING_TYPE_BANNERS || {})[type];
    return (f && window.assetUrl) ? window.assetUrl(f + '.webp') : '';
  };

  // Intensity helpers — używane przez heatmap aktywności (GitHub-style)
  // thresholds opcjonalne — default statyczne progi (zachowanie zawodnik.html)
  window.formaIntensityLevel = function(trimp, thresholds) {
    if (!trimp || trimp === 0) return 0;
    const t = thresholds || { l1: 30, l2: 60, l3: 100 };
    if (trimp <= t.l1) return 1;
    if (trimp <= t.l2) return 2;
    if (trimp <= t.l3) return 3;
    return 4;
  };

  // Helper — wylicz percentile thresholds z logów athlete'a (dni > 0 TRIMP)
  // null gdy < 5 dni danych — fallback do statycznych progów
  window.formaComputePercentileThresholds = function(logs) {
    const dailyTRIMP = {};
    for (const log of (logs || [])) {
      if (!log.logged_at) continue;
      if ((log.training_type || '').startsWith('__badge__')) continue;
      const d = new Date(log.logged_at);
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      const t = window.formaTRIMP(log);
      dailyTRIMP[key] = (dailyTRIMP[key] || 0) + t;
    }
    const values = Object.values(dailyTRIMP).filter(v => v > 0).sort((a, b) => a - b);
    if (values.length < 5) return null;
    const pct = (p) => values[Math.floor(values.length * p)];
    return { l1: pct(0.25), l2: pct(0.50), l3: pct(0.80) };
  };
  window.formaIntensityColor = function(level) {
    const colors = [
      'rgba(255,255,255,0.04)',  // 0 — brak treningu
      'rgba(74,222,128,0.25)',   // 1 — lekki (1-30 TRIMP)
      'rgba(74,222,128,0.55)',   // 2 — średni (31-60)
      'rgba(232,86,30,0.65)',    // 3 — wysoki (61-100)
      'rgba(248,113,113,0.75)',  // 4 — bardzo wysoki (100+)
    ];
    return colors[level] || colors[0];
  };

  // Zone label + color helpers — używane przez hero TSB tile + chart marker
  window.formaZoneLabel = function(tsb) {
    if (tsb < -30) return 'PRZECIĄŻENIE';
    if (tsb < -10) return 'OBCIĄŻENIE';
    if (tsb < 5) return 'NEUTRALNA';
    if (tsb <= 15) return 'OPTIMUM';
    return 'WYPOCZĘTY';
  };
  window.formaZoneColor = function(tsb) {
    if (tsb < -30) return '#f87171';  // red
    if (tsb < -10) return '#fb923c';  // orange
    if (tsb < 5) return '#60a5fa';    // blue (neutral)
    if (tsb <= 15) return '#4ade80';  // green
    return '#fbbf24';                  // yellow
  };

  // ═══════════════════════════════════════════════════════════════
  // 📖 STORYTELLING — coach voice + data voice + recommendation
  // ═══════════════════════════════════════════════════════════════
  window.formaStory = function(logs, raceMarkers, lastCtl, lastAtl, lastTsb, ctl30dAgo) {
    const logsCount = (logs || []).length;

    // Edge: za mało danych
    if (logsCount < 5) {
      return {
        icon: '📝',
        headline: 'BUDUJ HISTORIĘ',
        subline: 'Loguj więcej treningów, by zobaczyć formę i otrzymywać wskazówki.',
        recommendation: null,
        color: 'rgba(255,255,255,0.7)'
      };
    }

    const today = new Date();
    const upcomingRace = (raceMarkers && raceMarkers[0]) ? raceMarkers[0] : null;
    const daysToRace = upcomingRace ? Math.round((upcomingRace.ms - today.getTime()) / 86400000) : null;
    const ctlTrend = ctl30dAgo > 0 ? Math.round((lastCtl - ctl30dAgo) / ctl30dAgo * 100) : 0;
    const trendStr = ctlTrend > 0 ? '↗ +' + ctlTrend + '%' : ctlTrend < 0 ? '↘ ' + ctlTrend + '%' : '→ stabilna';

    // Rule 1: Race w 0-7 dni — taper time
    if (daysToRace !== null && daysToRace >= 0 && daysToRace <= 7) {
      return {
        icon: '🏁',
        headline: upcomingRace.name.toUpperCase() + ' ZA ' + daysToRace + (daysToRace === 1 ? ' DZIEŃ' : ' DNI'),
        subline: 'Czas na taper. Lekkie treningi, krótkie tempa, sporo snu. TSB powinien rosnąć w stronę +10.',
        recommendation: lastTsb < 5
          ? '⚠ TSB jest niski (' + Math.round(lastTsb) + ') — odpocznij, nie forsuj w tym tygodniu.'
          : '✓ Forma rośnie świetnie, jesteś na dobrej drodze.',
        color: '#e8561e'
      };
    }

    // Rule 2: Race w 8-14 dni — ostatni mocny tydzień
    if (daysToRace !== null && daysToRace > 7 && daysToRace <= 14) {
      return {
        icon: '🎯',
        headline: upcomingRace.name.toUpperCase() + ' ZA ' + daysToRace + ' DNI',
        subline: 'Ostatni mocny tydzień przed taperem. 1-2 quality sesje, potem zacznij obniżać objętość.',
        recommendation: '✓ Wykonaj zaplanowane mocne sesje, w przyszłym tygodniu zacznij taper.',
        color: '#fb923c'
      };
    }

    // Rule 3: Heavy fatigue (TSB < -25)
    if (lastTsb < -25) {
      return {
        icon: '🚨',
        headline: 'WYSOKIE OBCIĄŻENIE',
        subline: 'TSB ' + Math.round(lastTsb) + ' · Twój organizm potrzebuje regeneracji. Ryzyko kontuzji rośnie.',
        recommendation: '⚠ Dorzuć 1-2 dni regeneracji. Zmęczenie (ATL ' + Math.round(lastAtl) + ') znacznie przekracza bazę (CTL ' + Math.round(lastCtl) + ').',
        color: '#f87171'
      };
    }

    // Rule 4: Fresh & ready (TSB +5 to +15)
    if (lastTsb >= 5 && lastTsb <= 15) {
      return {
        icon: '⚡',
        headline: 'ŚWIEŻY · GOTOWY DO STARTU',
        subline: 'TSB +' + Math.round(lastTsb) + ' · idealne okno na mocną sesję, start lub PB attempt. CTL ' + trendStr + ' vs 30 dni.',
        recommendation: ctlTrend > 5
          ? '✓ Baza rośnie — wykorzystaj formę na quality trening.'
          : ctlTrend < -5
            ? '⚠ Baza spada — quality trening OK, ale zwiększ objętość.'
            : '✓ Forma świetna — dobry czas na intensywność.',
        color: '#4ade80'
      };
    }

    // Rule 5: Over-rested (TSB > +15)
    if (lastTsb > 15) {
      return {
        icon: '🌿',
        headline: 'BARDZO WYPOCZĘTY',
        subline: 'TSB +' + Math.round(lastTsb) + ' · możesz tracić formę bez treningu. Wróć do regularnej aktywności.',
        recommendation: '✓ Zacznij od spokojnych treningów, stopniowo dorzucaj intensywność.',
        color: '#fbbf24'
      };
    }

    // Rule 6: Steady state (TSB -10 to +5)
    if (lastTsb >= -10) {
      return {
        icon: '📈',
        headline: 'W TRENINGU · ' + trendStr,
        subline: 'Trenujesz w normalnym rytmie. CTL ' + Math.round(lastCtl) + ' · forma ' + (lastTsb >= 0 ? '+' : '') + Math.round(lastTsb) + ' · zmęczenie ' + Math.round(lastAtl) + '.',
        recommendation: ctlTrend > 10
          ? '✓ Świetny progress — baza buduje się solidnie.'
          : ctlTrend < -5
            ? '⚠ Baza spada — zwiększ objętość lub regularność.'
            : '✓ Kontynuuj plan, stabilna forma.',
        color: '#60a5fa'
      };
    }

    // Rule 7: Moderate fatigue (TSB -10 to -25) — fallback
    return {
      icon: '⚠',
      headline: 'OBCIĄŻENIE',
      subline: 'TSB ' + Math.round(lastTsb) + ' · uważaj na regenerację. Pilnuj snu i jedzenia.',
      recommendation: '⚠ Rozważ łatwiejszy tydzień, jeśli nie czujesz świeżości w nogach.',
      color: '#fb923c'
    };
  };

  // Count-up kafelków Formy — znak-aware (TSB +/-), guard NaN, reduced-motion
  window.formaCountUp = function(el, target, withSign) {
    if (!el) return;
    if (!Number.isFinite(target)) { el.textContent = '—'; return; }
    const fmt = (n) => (withSign && n >= 0 ? '+' : '') + Math.round(n);
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { el.textContent = fmt(target); return; }
    const start = parseInt((el.textContent || '').replace(/[^\d-]/g, ''), 10) || 0;
    if (start === target) { el.textContent = fmt(target); return; }
    const range = target - start, t0 = performance.now(), dur = 700;
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(start + range * eased);
      if (p < 1) requestAnimationFrame(step);
    })(performance.now());
  };

  // ── Strefy tętna: palety + wizual słupków (single source; A=kalendarz przepniemy potem) ──
  window.HR_ZONE_COLORS = { Z1:'#8a94a6', Z2:'#4a90d9', Z3:'#3db870', Z4:'#f2b134', Z5:'#e03e3e', Z5a:'#ef7d3a', Z5b:'#e03e3e', Z5c:'#a02525' };
  window.HR_ZONE_PL     = { Z1:'regeneracja', Z2:'tlenowy', Z3:'tempo', Z4:'próg', Z5:'VO2max', Z5a:'VO2max', Z5b:'beztlenowy', Z5c:'maksymalny' };
  // zwraca HTML słupków (sortowanie malejąco wg czasu, rampa, nazwy PL odporne, bpm-range, czas h:mm/m:ss + %)
  window.renderHrZoneBars = function(z) {
    const labels = z.labels || [], times = z.time_s || [], bounds = Array.isArray(z.bounds) ? z.bounds : [];
    const n = Math.min(labels.length, times.length);
    if (!n) return '';
    const total = times.slice(0,n).reduce((s,t)=>s+(t||0),0) || 1;
    const maxT  = Math.max(...times.slice(0,n).map(t=>t||0)) || 1;
    const fmt = (s)=>{ const h=Math.floor(s/3600), m=Math.floor((s%3600)/60);
      // jednoznaczny zapis z jednostka (unika mylenia 3:18=3h z 33:40=33min)
      if (h) return h + 'h ' + (m ? m + 'm' : '');
      if (m) return m + 'm';
      return Math.round(s) + 's'; };
    const bpmRange = (i)=>{ const hi=bounds[i]; if (hi==null) return ''; const lo=i>0?bounds[i-1]:null;
      return lo!=null ? (lo+'–'+hi) : ('<'+hi); };
    const idx = Array.from({length:n},(_,i)=>i);
    return idx.slice().sort((a,b)=>(times[b]||0)-(times[a]||0)).map(i=>{
      const t=times[i]||0, pct=Math.round(100*t/total), w=Math.max(2, Math.round(100*t/maxT));
      const col=(window.HR_ZONE_COLORS||{})[labels[i]] || '#8a94a6', pl=(window.HR_ZONE_PL||{})[labels[i]], rng=bpmRange(i);
      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-family:'DM Mono',monospace;font-size:11px;">
        <div style="width:88px;flex-shrink:0;line-height:1.25;">
          <div style="color:rgba(240,237,232,0.9);">${labels[i]}</div>
          ${pl?`<div style="font-size:8px;color:rgba(240,237,232,0.5);text-transform:uppercase;letter-spacing:0.05em;">${pl}</div>`:''}
          ${rng?`<div style="font-size:8px;color:rgba(240,237,232,0.35);">${rng}</div>`:''}
        </div>
        <div style="flex:1;height:8px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${w}%;background:${col};border-radius:4px;"></div>
        </div>
        <div style="width:64px;text-align:right;flex-shrink:0;color:rgba(240,237,232,0.85);">${fmt(t)} <span style="color:rgba(240,237,232,0.4);">${pct}%</span></div>
      </div>`;
    }).join('');
  };

  // Agregat stref HR w Formie (90d z EF intervals-hr-aggregate; cache klient sessionStorage 6h; authz owner+coach = server-side)
  window.renderFormaHrZones = async function(athleteId, idPrefix, opts) {
    const px = idPrefix || 'forma';
    const el = document.getElementById(px + '-hrzones');
    if (!el || !athleteId) return;
    const hide = ()=>{ el.style.display='none'; el.innerHTML=''; };
    try {
      const days = 90, cacheKey = 'hragg_'+athleteId+'_'+days, now = Date.now();
      let d = null;
      try { const c = JSON.parse(sessionStorage.getItem(cacheKey)||'null');
        if (c && c.ts && (now - c.ts) < 6*3600*1000) d = c.data; } catch(e){}   // hit TTL 6h
      if (!d) {
        const { data:{ session } } = await sb.auth.getSession();
        if (!session) return hide();
        const fnUrl = (window.SB_FN_URL || 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1') + '/intervals-hr-aggregate';
        const res = await fetch(fnUrl, { method:'POST',
          headers:{ 'Authorization':'Bearer '+session.access_token, 'Content-Type':'application/json' },   // ZERO apikey (CORS preflight)
          body: JSON.stringify({ athlete_id: athleteId, days }) });
        d = await res.json().catch(()=>null);
        if (d && d.ok) { try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts:now, data:d })); } catch(e){} }
      }
      if (!d || !d.ok || !d.n_hr || !(d.time_s||[]).some(t=>t>0)) return hide();   // graceful: brak biegów z tętnem
      const labels=d.labels||[], times=d.time_s||[];
      let domI=0; for (let i=1;i<times.length;i++) if ((times[i]||0)>(times[domI]||0)) domI=i;   // dominująca
      const domPL=(window.HR_ZONE_PL||{})[labels[domI]];
      const dom = labels[domI] + (domPL?(' ('+domPL+')'):'');
      const cap = 'ostatnie '+d.days+' dni · '+d.n_hr+' z '+d.n_runs+' biegów z tętnem · głównie '+dom
        + (d.bounds_varied ? ' · progi zmieniły się w oknie' : '');
      el.innerHTML =
        `<div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#fff;font-family:'DM Mono',monospace;font-weight:700;margin-bottom:6px;">❤️ Strefy tętna</div>
         <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.03em;color:rgba(240,237,232,0.5);margin-bottom:10px;">${cap}</div>
         ${window.renderHrZoneBars(d)}`;
      el.style.display='block';
    } catch(e){ hide(); }
  };

  // Core forma renderer — parametryzowany athleteId + idPrefix dla reuse w zawodnik.html + trener.html
  /* ═══ E2-K4 TREND EF: baza tlenowa = szybkosc/HR na biegach TLENOWYCH (interwaly/tempo
     falszuja -> wlasny filtr, NIE isRunType). gap_pace preferowane, fallback pace.
     UWAGA kadencja: zapis surowy RPM intervals (jedna noga) — w UI zawsze x2 na spm! ═══ */
  /* ═══ E3-K4+K5 GOTOWOSC DNIA: wellness (RHR/HRV/sen) vs baseline 7 dni; jezyk trenera,
     zero diagnoz. Stany: brak intervals=ukryty · token bez flagi=CTA re-auth (K4) ·
     flaga bez danych=czekamy na Garmina · dane=werdykt. Wspolny renderer -> trener gratis. ═══ */
  window._renderFormaWellness = async function(athleteId, px) {
    try {
      const kotw = document.getElementById(px + '-mono-line') || document.getElementById(px + '-weekly-bars');
      if (!kotw) return;
      let el = document.getElementById(px + '-gotowosc');
      if (!el) {
        el = document.createElement('div');
        el.id = px + '-gotowosc';
        el.style.cssText = 'margin-top:12px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;';
        kotw.insertAdjacentElement('afterend', el);
      }
      const nag = '<div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-bottom:8px;">\ud83d\udecc Gotowo\u015b\u0107 dnia \u00b7 HRV / t\u0119tno / sen</div>';
      const { data: ath } = await sb.from('athletes')
        .select('intervals_connected_at,intervals_can_wellness').eq('id', athleteId).maybeSingle();
      if (!ath || !ath.intervals_connected_at) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      if (ath.intervals_can_wellness !== true) {   /* K4: CTA re-auth */
        el.innerHTML = nag + '<div style="font-size:11.5px;color:rgba(255,255,255,0.6);line-height:1.55;margin-bottom:8px;">Odblokuj HRV, t\u0119tno spoczynkowe i sen z Twojego zegarka \u2014 wystarczy po\u0142\u0105czy\u0107 ponownie (15 s).</div>'
          + '<button onclick="window.WATCH&&WATCH.odpalOAuth()" style="background:var(--accent);color:#fff;border:none;border-radius:10px;padding:9px 16px;font-size:12px;font-weight:600;font-family:DM Sans,sans-serif;cursor:pointer;">Po\u0142\u0105cz ponownie</button>';
        return;
      }
      const od = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const { data: w } = await sb.from('wellness')
        .select('date,resting_hr,hrv,sleep_secs,readiness').eq('athlete_id', athleteId)   /* +readiness (WELLNESS-2) */
        .gte('date', od).order('date', { ascending: false }).limit(30);
      const dni = w || [];
      if (!dni.length) {
        el.innerHTML = nag + '<div style="font-size:11px;color:rgba(255,255,255,0.45);font-family:DM Mono,monospace;line-height:1.5;">Po\u0142\u0105czenie aktywne \u2014 Garmin jeszcze nie podes\u0142a\u0142 danych. Wr\u00f3\u0107 jutro.</div>';
        return;
      }
      const ost = dni[0], baza = dni.slice(1, 8);
      const sr = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
      const bR = sr(baza.map(d => d.resting_hr).filter(v => v != null));
      const bH = sr(baza.map(d => d.hrv).filter(v => v != null));
      let alarmy = 0, wiersze = '';
      const row = (naz, val, dop, kolor) => '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;"><span style="color:rgba(255,255,255,0.6);">' + naz + '</span><span style="font-family:DM Mono,monospace;color:' + (kolor || 'rgba(255,255,255,0.85)') + ';">' + val + (dop ? ' <span style="color:rgba(255,255,255,0.4);font-size:10px;">' + dop + '</span>' : '') + '</span></div>';
      if (ost.resting_hr != null) {
        const zle = bR != null && (ost.resting_hr - bR) > 5;
        if (zle) alarmy++;
        wiersze += row('T\u0119tno spocz.', ost.resting_hr + ' bpm', bR != null ? '(baza ' + Math.round(bR) + ')' : '', zle ? '#fb923c' : null);
      }
      if (ost.hrv != null) {
        const zle = bH != null && bH > 0 && (bH - ost.hrv) / bH > 0.15;
        if (zle) alarmy++;
        wiersze += row('HRV', ost.hrv + ' ms', bH != null ? '(baza ' + Math.round(bH) + ')' : '', zle ? '#fb923c' : null);
      }
      if (ost.sleep_secs != null) {
        const h = Math.floor(ost.sleep_secs / 3600), m = Math.round(ost.sleep_secs % 3600 / 60);
        const malo = ost.sleep_secs < 6 * 3600;
        wiersze += row('Sen', h + ':' + String(m).padStart(2, '0') + ' h', '', malo ? 'rgba(255,255,255,0.5)' : null);
        if (malo) alarmy += 0.5;
      }
      if (ost.readiness != null) {   /* WELLNESS-2: syntetyczny werdykt Garmina 0-100 */
        const r = +ost.readiness;
        const zle = r < 40; if (zle) alarmy++;
        wiersze += row('Gotowo\u015b\u0107 (Garmin)', r + '/100', '', r >= 70 ? '#4ade80' : zle ? '#fb923c' : '#eab308');
      }
      if (!wiersze) {
        el.innerHTML = nag + '<div style="font-size:11px;color:rgba(255,255,255,0.45);font-family:DM Mono,monospace;">Garmin jeszcze nie podes\u0142a\u0142 danych. Wr\u00f3\u0107 jutro.</div>';
        return;
      }
      const wer = alarmy >= 2 ? ['#fb923c', 'Dzi\u015b lepiej spokojnie \u2014 organizm pracuje'] : alarmy >= 1 ? ['#eab308', 'Trenuj, ale s\u0142uchaj organizmu'] : ['#4ade80', 'Organizm gotowy na mocny akcent'];
      /* GOTOWOSC-TREND: mini-sparkline RHR/HRV z ~21 dni — czy organizm sie poprawia */
      var trendHtml = '';
      try {
        var ser = (w || []).slice().reverse();   /* chronologicznie */
        function spark(pole, nazwa, dobryKierunek) {
          var pts = ser.filter(function (d) { return d[pole] != null; }).map(function (d) { return d[pole]; });
          if (pts.length < 5) return '';
          var mn = Math.min.apply(null, pts), mx = Math.max.apply(null, pts), zak = (mx - mn) || 1;
          var W = 60, H = 16;
          var path = pts.map(function (v, i) { return (i === 0 ? 'M' : 'L') + (i / (pts.length - 1) * W).toFixed(1) + ',' + (H - (v - mn) / zak * H).toFixed(1); }).join(' ');
          var pierwsza = pts.slice(0, Math.ceil(pts.length / 3)).reduce(function (a, b) { return a + b; }, 0) / Math.ceil(pts.length / 3);
          var ostatnia = pts.slice(-Math.ceil(pts.length / 3)).reduce(function (a, b) { return a + b; }, 0) / Math.ceil(pts.length / 3);
          var delta = ostatnia - pierwsza;
          var poprawa = dobryKierunek === 'dol' ? delta < -0.5 : delta > 0.5;
          var pogorsz = dobryKierunek === 'dol' ? delta > 0.5 : delta < -0.5;
          var kolor = poprawa ? '#4ade80' : pogorsz ? '#fb923c' : 'rgba(255,255,255,0.5)';
          var strzalka = poprawa ? '\u2197' : pogorsz ? '\u2198' : '\u2192';
          return '<div style="display:flex;align-items:center;gap:6px;">'
            + '<span style="font-size:9px;color:rgba(255,255,255,0.45);width:34px;">' + nazwa + '</span>'
            + '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:' + W + 'px;height:' + H + 'px;"><path d="' + path + '" fill="none" stroke="' + kolor + '" stroke-width="1.5"/></svg>'
            + '<span style="font-size:11px;color:' + kolor + ';">' + strzalka + '</span></div>';
        }
        var sRHR = spark('resting_hr', 'RHR', 'dol');    /* nizsze RHR = lepiej */
        var sHRV = spark('hrv', 'HRV', 'gora');           /* wyzsze HRV = lepiej */
        if (sRHR || sHRV) {
          trendHtml = '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);">'
            + '<div style="font-size:9px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:5px;">Trend 3 tygodnie</div>'
            + '<div style="display:flex;flex-direction:column;gap:4px;">' + sRHR + sHRV + '</div></div>';
        }
      } catch (_) {}
      el.innerHTML = nag + wiersze + trendHtml + '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);font-size:11.5px;font-family:DM Mono,monospace;color:' + wer[0] + ';">' + wer[1] + '</div>';
    } catch (e) {}
  };

  window._renderFormaEfTrend = function(logs, px) {
    try {
      var TLEN = /spokoj|wybieg|d\u0142ug|dlug|regener|trucht|\u0142atwy|latwy/;
      var WYKL = /interwa|tempo|progres|start|wy\u015bcig|wyscig|zawod|sprawdzian|si\u0142|sil/;
      var pts = [];
      (logs || []).forEach(function (l) {
        var t = String(l.training_type || '').toLowerCase();
        if (!TLEN.test(t) || WYKL.test(t)) return;
        var hr = +l.heart_rate; if (!hr || hr < 80 || hr > 200) return;
        var p = l.gap_pace || l.pace; if (!p) return;
        var m = String(p).match(/^(\d{1,2}):(\d{2})/); if (!m) return;
        var sek = (+m[1]) * 60 + (+m[2]); if (sek < 150 || sek > 720) return;
        pts.push({ x: new Date(l.logged_at).getTime() / 86400000, y: (1000 / sek) / hr * 1000 });
      });
      var kotw = document.getElementById(px + '-mono-line') || document.getElementById(px + '-weekly-bars');
      if (!kotw) return;
      var el = document.getElementById(px + '-ef-trend');
      if (!el) {
        el = document.createElement('div');
        el.id = px + '-ef-trend';
        el.style.cssText = 'margin-top:12px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;';
        kotw.insertAdjacentElement('afterend', el);
      }
      var naglowek = '<div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-bottom:8px;">\ud83e\udec1 Baza tlenowa \u00b7 trend EF 90 dni</div>';
      if (pts.length < 5) {
        el.innerHTML = naglowek + '<div style="font-size:11px;color:rgba(255,255,255,0.45);font-family:DM Mono,monospace;line-height:1.5;">Wymaga min. 5 tlenowych bieg\u00f3w z zapisem t\u0119tna (masz: ' + pts.length + '). Za\u0142\u00f3\u017c pasek HR \u2014 wykres uro\u015bnie sam.</div>';
        return;
      }
      var n = pts.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
      pts.forEach(function (p) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; });
      var slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
      var srY = sy / n;
      var pct = Math.round(slope * 90 / (srY || 1) * 1000) / 10;
      var oc = pct >= 2 ? ['#4ade80', 'baza tlenowa ro\u015bnie'] : pct <= -2 ? ['#fb923c', 'spada \u2014 sprawd\u017a regeneracj\u0119'] : ['#e5e7eb', 'stabilnie'];
      var tygodnie = {};
      pts.forEach(function (p) { var w = Math.floor(p.x / 7); (tygodnie[w] = tygodnie[w] || []).push(p.y); });
      var klucze = Object.keys(tygodnie).sort(function (a, b) { return a - b; }).slice(-12);
      var srW = klucze.map(function (k) { var a = tygodnie[k]; return a.reduce(function (x, y) { return x + y; }, 0) / a.length; });
      var mn = Math.min.apply(null, srW), mx = Math.max.apply(null, srW), zak = (mx - mn) || 1;
      var slupki = srW.map(function (v) {
        var h = 6 + Math.round((v - mn) / zak * 26);
        return '<div style="flex:1;height:' + h + 'px;background:rgba(232,86,30,0.55);border-radius:2px;"></div>';
      }).join('');
      el.innerHTML = naglowek
        + '<div style="display:flex;align-items:flex-end;gap:3px;height:34px;margin-bottom:8px;">' + slupki + '</div>'
        + '<div style="font-size:12px;font-family:DM Mono,monospace;"><strong style="color:' + oc[0] + ';">' + (pct > 0 ? '+' : '') + pct + '% / 90 dni</strong> <span style="color:rgba(255,255,255,0.5);">\u00b7 ' + oc[1] + ' \u00b7 ' + n + ' bieg\u00f3w tlenowych z HR</span></div>';
    } catch (e) {}
  };

  window.renderFormaForAthlete = async function(athleteId, idPrefix, options) {
    if (!athleteId) return;
    const px = idPrefix || 'forma';
    // v4: visibleMetrics — domyślnie wszystkie ON (backward-compat dla starych wywołań)
    const vm = (options && options.visibleMetrics) ? options.visibleMetrics : { tsb: true, ctl: true, atl: true };

    // Lazy-load Chart.js
    if (typeof Chart === 'undefined') {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    // Lazy-load annotation plugin
    if (typeof Chart !== 'undefined' && !Chart.registry?.plugins?.get('annotation')) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3.0.1/dist/chartjs-plugin-annotation.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    // Fetch 90 dni training_logs
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 90);

    const { data: logs, error } = await sb.from('training_logs')
      .select('logged_at,duration,training_type,feel,distance_km,pace,heart_rate,gap_pace,cadence,icu_load,elevation_gain,calories,source,external_id')
      .eq('athlete_id', athleteId)
      .not('training_type', 'like', '__badge__%')
      .gte('logged_at', start.toISOString())
      .order('logged_at', { ascending: true });

    if (error) { console.error('[forma] fetch err', error); return; }
    /* CACHE-LOGS: udostepnij pobrane logi (90d, pelne kolumny) dla _renderOdprawa — unika 2. round-tripu */
    try { window._formaLogsCache = { athleteId: athleteId, at: Date.now(), logs: logs || [] }; } catch(_) {}

    // Fetch race_goals
    const { data: ath } = await sb.from('athletes').select('race_goals').eq('id', athleteId).maybeSingle();
    let raceMarkers = [];
    try {
      const rg = ath?.race_goals ? JSON.parse(ath.race_goals) : [];
      const todayMs = today.getTime();
      const sixtyDaysLater = todayMs + 60 * 24 * 60 * 60 * 1000;
      raceMarkers = (Array.isArray(rg) ? rg : [])
        .filter(r => r && r.date && r.name)
        .map(r => ({ date: r.date, name: r.name, ms: new Date(r.date).getTime() }))
        .filter(r => r.ms >= todayMs && r.ms <= sixtyDaysLater)
        .sort((a, b) => a.ms - b.ms);
    } catch(e) { console.warn('[forma] race_goals parse err', e); }

    // Fetch weight_kg dla calorie calc (heatmap tooltip) — soft fail jeśli brak nutrition_profiles
    let weightKg = 0;
    try {
      const { data: nutProfile } = await sb.from('nutrition_profiles').select('weight_kg').eq('athlete_id', athleteId).maybeSingle();
      weightKg = nutProfile?.weight_kg || 0;
    } catch(e) { console.warn('[forma] nutrition_profiles fetch err', e); }

    // FORMA-DATA-FIX: lokalna data YYYY-MM-DD (nie UTC) — zgodna z logged_at.split('T')[0]
    const _localYMD = (dt) => dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
    // Build daily TRIMP map
    const dailyTRIMP = {};
    (logs || []).forEach(log => {
      const dateStr = log.logged_at.split('T')[0];
      dailyTRIMP[dateStr] = (dailyTRIMP[dateStr] || 0) + window.formaTRIMP(log);
    });

    // Compute endDate dynamic
    const maxRaceFutureDays = raceMarkers.length
      ? Math.ceil((raceMarkers[raceMarkers.length - 1].ms - today.getTime()) / 86400000) + 5
      : 30;
    const cappedMaxFuture = Math.min(maxRaceFutureDays, 90);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + cappedMaxFuture);

    const todayDateStr = _localYMD(today);   /* FORMA-DATA-FIX */

    /* ═ E1a PROGNOZA (23.07): przyszly TRIMP z ZAPLANOWANYCH treningow (bylo: 0 = czysty rozpad).
       Ten sam wzor co historia: duration_min x FORMA_EFFORT_FACTORS[type] (feel=1.0). Runalyze
       ekstrapoluje — my znamy plan od trenera. Fallback przy braku planu = 0 (stare zachowanie). ═ */
    const planTRIMP = {};
    try {
      const endDateStr = endDate.toISOString().slice(0, 10);
      const { data: plan } = await sb.from('trainings')
        .select('date,type,duration_min,distance_km')
        .eq('athlete_id', athleteId)
        .gt('date', todayDateStr)
        .lte('date', endDateStr);
      (plan || []).forEach(t => {
        const key = String(t.type || '').toLowerCase().trim();
        const eff = (window.FORMA_EFFORT_FACTORS && window.FORMA_EFFORT_FACTORS[key] !== undefined)
          ? window.FORMA_EFFORT_FACTORS[key] : 1.0;
        const min = (t.duration_min != null) ? +t.duration_min
          : (t.distance_km ? Math.round(t.distance_km * 6.5) : 0);   /* fallback: ~6:30/km */
        if (min > 0 && eff > 0) planTRIMP[t.date] = (planTRIMP[t.date] || 0) + Math.round(min * eff);
      });
    } catch (e) { /* prognoza opcjonalna — blad = stare zachowanie */ }

    // Compute series CTL/ATL/TSB (EMA)
    const labels = [];
    const ctlData = [];
    const atlData = [];
    const tsbData = [];
    const trimpData = [];
    /* FORMA-SEED v2: seed od OSTATNIEGO ciaglego bloku danych (dziura >21 dni = izolowane stare
       wpisy nie moga byc baza; np. Kasia: 1 ultra 20.04 + 8 tyg pustki + dane od 15.06 — seed z
       kwietnia rozpuszczal sie przez dziure do zera). EMA resetuje sie do seeda w dniu startu bloku. */
    let _seedVal = 0, _seedBlockStart = null;
    {
      const _sk = Object.keys(dailyTRIMP).sort();
      if (_sk.length) {
        let _bs = _sk[0];
        for (let _i = 1; _i < _sk.length; _i++) {
          if ((new Date(_sk[_i]) - new Date(_sk[_i-1])) / 864e5 > 21) _bs = _sk[_i];
        }
        /* FORMA-SEED v4: pomin wiodace zerowe dni (odpoczynki, TRIMP=0) na starcie bloku — seed od pierwszego REALNEGO treningu (edge A: Malgorzata CTL27, Filip seed=0) */
        for (let _i = 0; _i < _sk.length; _i++) { if (_sk[_i] >= _bs && dailyTRIMP[_sk[_i]] > 0) { _bs = _sk[_i]; break; } }
        _seedBlockStart = _bs;
        const _f = new Date(_bs + 'T12:00:00'); _f.setDate(_f.getDate() + 14);
        const _cut = _f.toISOString().slice(0, 10);
        let _ss = 0;
        let _mx = 0;
        _sk.forEach(function(k){ if (k >= _bs && k < _cut) { _ss += dailyTRIMP[k]; if (dailyTRIMP[k] > _mx) _mx = dailyTRIMP[k]; } });
        _seedVal = Math.min(_ss / 14, (_ss - _mx) / 13 * 2.5 + 20);   /* FORMA-SEED v3: clamp outliera (pojedynczy ultra w oknie seeda, np. 289->95) */
      }
    }
    let ctl = 0, atl = 0;
    /* blok zaczal sie PRZED oknem 90 dni -> seed od razu na starcie */
    if (_seedBlockStart && _seedBlockStart <= _localYMD(start)) { ctl = _seedVal; atl = _seedVal; }
    const CTL_DAYS = 42, ATL_DAYS = 7;

    for (let d = new Date(start); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = _localYMD(d);   /* FORMA-DATA-FIX: lokalna nie UTC */
      if (_seedBlockStart && dateStr === _seedBlockStart) { ctl = _seedVal; atl = _seedVal; }   /* FORMA-SEED v2: reset EMA na starcie bloku */
      const isFuture = dateStr > todayDateStr;

      if (isFuture) {
        const trimp = planTRIMP[dateStr] || 0;   /* E1a PROGNOZA */
        ctl = ctl + (trimp - ctl) / CTL_DAYS;
        atl = atl + (trimp - atl) / ATL_DAYS;
      } else {
        const trimp = dailyTRIMP[dateStr] || 0;
        ctl = ctl + (trimp - ctl) / CTL_DAYS;
        atl = atl + (trimp - atl) / ATL_DAYS;
        trimpData.push(trimp);
      }

      labels.push(dateStr.slice(5));
      ctlData.push(Math.round(ctl * 10) / 10);
      atlData.push(Math.round(atl * 10) / 10);
      tsbData.push(Math.round((ctl - atl) * 10) / 10);

      if (isFuture) {
        trimpData.push(null);
      }
    }

    /* ═ E1a: prognoza TSB na dzien najblizszego startu (element opcjonalny per widok) ═ */
    try {
      const tsbStartEl = document.getElementById(idPrefix + '-tsb-start');
      if (tsbStartEl) {
        const przyszle = (raceMarkers || []).filter(r => r.ms > today.getTime()).sort((a,b) => a.ms - b.ms);
        if (przyszle.length) {
          const r0 = przyszle[0];
          const rDate = new Date(r0.ms).toISOString().slice(0, 10);
          const idx = labels.indexOf(rDate.slice(5));
          const tsbR = (idx >= 0) ? tsbData[idx] : null;
          if (tsbR != null) {
            const ocena = tsbR > 25 ? ['#eab308','over-rested — możesz tracić formę']
              : tsbR >= 5 ? ['#4ade80','optimum — gotowość startowa']
              : tsbR >= -10 ? ['#e5e7eb','neutralnie — dołóż tapering']
              : ['#f87171','obciążenie — plan przewiduje ciężki blok'];
            const dd = rDate.slice(8,10) + '.' + rDate.slice(5,7);
            tsbStartEl.innerHTML = '🎯 <span style="color:rgba(255,255,255,0.85);">Prognoza na start (' + dd + '):</span> '
              + '<strong style="color:' + ocena[0] + ';">TSB ' + (tsbR > 0 ? '+' : '') + tsbR + '</strong>'
              + ' <span style="color:rgba(255,255,255,0.55);">· ' + ocena[1] + '</span>'
              + '<span style="display:block;font-size:9px;color:rgba(255,255,255,0.4);margin-top:2px;">wg zaplanowanych treningów w kalendarzu</span>';
            tsbStartEl.style.display = 'block';
          }
        }
      }
    } catch (e) {}

    // ── Update 3 kafelki premium (TSB + CTL + ATL) ──
    /* FORMA-DIAL-TODAY-FIX: petla siega +30 dni w przyszlosc (prognoza), wiec last element = przyszlosc
       (trimp=0 -> TSB sztucznie wysoki, dial zamrozony). Bierzemy indeks DZIS, nie ostatni. */
    let _todayIdx = labels.indexOf(todayDateStr.slice(5));
    if (_todayIdx < 0) _todayIdx = ctlData.length - 1;   /* fallback: gdyby nie znaleziono */
    const lastCtl = ctlData[_todayIdx] || 0;
    const lastAtl = atlData[_todayIdx] || 0;
    const lastTsb = tsbData[_todayIdx] || 0;
    window._formaLast = { ctl: lastCtl, atl: lastAtl, tsb: lastTsb };   /* E1c: most dla predyktora czasow */
    /* FORMA-PREMIUM-DIAL: orb gotowosci = TSB przeskalowany na 0-100 (clamp(TSB+50)) */
    try {
      const _dialVal = Math.max(0, Math.min(100, Math.round(lastTsb + 50)));
      const _numEl = document.getElementById(px + '-dial-num');
      const _arcEl = document.getElementById(px + '-dial-arc');
      const _haloEl = document.getElementById(px + '-dial-halo');
      const _badgeEl = document.getElementById(px + '-dial-badge');
      const _titleEl = document.getElementById(px + '-dial-title');
      const _subEl = document.getElementById(px + '-dial-sub');
      if (_numEl) _numEl.textContent = _dialVal;
      /* FORMA-BANER-LIVE: zasil zywy wynik w banerze hero (tylko px=forma) */
      if (px === 'forma') { var _bn = document.getElementById('forma-baner-num'); if (_bn) _bn.textContent = _dialVal; }
      let _col, _badge, _title, _sub;
      if (lastTsb >= 15) { _col = '#a074ec'; _badge = 'Wypoczety'; _title = 'Naladowany po brzegi.'; _sub = 'Cialo gotowe na wysilek - zaufaj planowi i sluchaj nog.'; }
      else if (lastTsb >= 5) { _col = '#3ad884'; _badge = 'Swiezy'; _title = 'Forma swieza.'; _sub = 'Dobry moment na mocniejszy akcent albo start.'; }
      else if (lastTsb >= -10) { _col = '#63a6f4'; _badge = 'Neutralnie'; _title = 'Trening idzie rowno.'; _sub = 'Obciazenie pod kontrola - kontynuuj plan.'; }
      else if (lastTsb >= -25) { _col = '#f4c04a'; _badge = 'Obciazenie'; _title = 'Nogi troche ciezkie.'; _sub = 'Wyrazne zmeczenie - pilnuj regeneracji.'; }
      else { _col = '#ff7a45'; _badge = 'Przeciazenie'; _title = 'Zmeczenie siedzi w nogach.'; _sub = 'Dzis nic mocnego - organizm potrzebuje odpoczynku.'; }
      if (_arcEl) { _arcEl.setAttribute('stroke', _col); _arcEl.style.strokeDashoffset = String(Math.round(339 * (1 - _dialVal / 100))); }
      if (_haloEl) _haloEl.style.background = 'radial-gradient(circle,' + _col + '55,transparent 64%)';
      if (_badgeEl) { _badgeEl.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:' + _col + ';box-shadow:0 0 8px ' + _col + ';display:inline-block;"></span>' + _badge; _badgeEl.style.color = _col; }
      if (_titleEl) _titleEl.textContent = _title;
      if (_subEl) _subEl.textContent = _sub;
    } catch(_e) { console.warn('[forma-dial]', _e); }
    const animTiles = !!(options && options.animate);

    // TSB: status color + label + scale position
    const tsbValEl = document.getElementById(px + '-tsb-val');
    const tsbDotEl = document.getElementById(px + '-tsb-dot');
    const tsbLabelEl = document.getElementById(px + '-tsb-label');
    const tsbIndicatorEl = document.getElementById(px + '-tsb-indicator');
    if (tsbValEl) { if (animTiles) window.formaCountUp(tsbValEl, Math.round(lastTsb), true); else tsbValEl.textContent = (lastTsb >= 0 ? '+' : '') + Math.round(lastTsb); }

    let tsbColor, tsbLabelText;
    if (lastTsb >= 5 && lastTsb <= 15) { tsbColor = '#4ade80'; tsbLabelText = 'optimum'; }
    else if (lastTsb > 15) { tsbColor = '#fbbf24'; tsbLabelText = 'wypoczęty'; }
    else if (lastTsb >= -10) { tsbColor = '#60a5fa'; tsbLabelText = 'trening'; }
    else if (lastTsb >= -30) { tsbColor = '#fb923c'; tsbLabelText = 'obciążenie'; }
    else { tsbColor = '#f87171'; tsbLabelText = 'przeciążenie'; }

    if (tsbDotEl) { tsbDotEl.style.background = tsbColor; tsbDotEl.style.color = tsbColor; }
    if (tsbLabelEl) tsbLabelEl.textContent = tsbLabelText;
    if (tsbValEl) tsbValEl.style.color = tsbColor;

    // TSB position on scale -30 (0%) to +20 (100%), clamp
    const tsbPct = Math.max(0, Math.min(100, ((lastTsb + 30) / 50) * 100));
    if (tsbIndicatorEl) {
      tsbIndicatorEl.style.left = tsbPct + '%';
      tsbIndicatorEl.style.borderColor = tsbColor;
      tsbIndicatorEl.style.boxShadow = '0 0 6px ' + tsbColor + 'AA';
    }

    // Compute CTL/ATL trend vs 30d ago
    const todayIdx = ctlData.length - 1 - cappedMaxFuture;
    const idx30 = Math.max(0, todayIdx - 30);
    const ctl30dAgo = ctlData[idx30] || 0;
    const atl30dAgo = atlData[idx30] || 0;
    const ctlTrend = ctl30dAgo > 0 ? Math.round((lastCtl - ctl30dAgo) / ctl30dAgo * 100) : 0;
    const atlTrend = atl30dAgo > 0 ? Math.round((lastAtl - atl30dAgo) / atl30dAgo * 100) : 0;

    // CTL tile
    const ctlValEl = document.getElementById(px + '-ctl-val');
    const ctlArrowEl = document.getElementById(px + '-ctl-arrow');
    const ctlLabelEl = document.getElementById(px + '-ctl-label');
    const ctlFillEl = document.getElementById(px + '-ctl-fill');
    const ctlTrendEl = document.getElementById(px + '-ctl-trend');
    if (ctlValEl) { if (animTiles) window.formaCountUp(ctlValEl, Math.round(lastCtl), false); else ctlValEl.textContent = Math.round(lastCtl); }
    if (ctlArrowEl) {
      ctlArrowEl.textContent = ctlTrend > 2 ? '↗' : ctlTrend < -2 ? '↘' : '→';
      ctlArrowEl.style.color = ctlTrend > 2 ? '#4ade80' : ctlTrend < -2 ? '#f87171' : '#60a5fa';
    }
    if (ctlLabelEl) ctlLabelEl.textContent = ctlTrend > 5 ? 'rośnie' : ctlTrend < -5 ? 'spada' : 'stabilna';
    if (ctlFillEl) {
      const ctlFillPct = 50 + Math.max(-50, Math.min(50, ctlTrend));
      ctlFillEl.style.width = ctlFillPct + '%';
    }
    if (ctlTrendEl) {
      // TREND-CZYTELNY: ekstremalne % myli (np. -99% = po prostu swiezy), wiec opis stanu zamiast liczby
      let ctlTxt;
      if (Math.abs(ctlTrend) > 55) ctlTxt = ctlTrend > 0 ? 'baza mocno rosnie' : 'nizsza baza niz miesiac temu';
      else if (Math.abs(ctlTrend) <= 3) ctlTxt = 'stabilna baza';
      else ctlTxt = (ctlTrend > 0 ? '+' : '') + ctlTrend + '% do miesiaca temu';
      ctlTrendEl.textContent = ctlTxt;
    }

    // ATL tile
    const atlValEl = document.getElementById(px + '-atl-val');
    const atlArrowEl = document.getElementById(px + '-atl-arrow');
    const atlLabelEl = document.getElementById(px + '-atl-label');
    const atlFillEl = document.getElementById(px + '-atl-fill');
    const atlTrendEl = document.getElementById(px + '-atl-trend');
    if (atlValEl) { if (animTiles) window.formaCountUp(atlValEl, Math.round(lastAtl), false); else atlValEl.textContent = Math.round(lastAtl); }
    if (atlArrowEl) {
      atlArrowEl.textContent = atlTrend > 2 ? '↗' : atlTrend < -2 ? '↘' : '→';
      atlArrowEl.style.color = atlTrend > 2 ? '#f87171' : atlTrend < -2 ? '#4ade80' : '#60a5fa';
    }
    if (atlLabelEl) {
      atlLabelEl.textContent = lastAtl > lastCtl * 1.2 ? 'zmęczony' : lastAtl < lastCtl * 0.7 ? 'wypoczęty' : 'normalny';
    }
    if (atlFillEl) {
      const ratio = lastCtl > 0 ? Math.min(100, (lastAtl / lastCtl) * 70) : 50;
      atlFillEl.style.width = ratio + '%';
    }
    if (atlTrendEl) {
      // TREND-CZYTELNY: ATL -99% NIE znaczy problem, znaczy "swiezy". Opis zamiast strasznej liczby.
      let atlTxt;
      if (Math.abs(atlTrend) > 55) atlTxt = atlTrend > 0 ? 'duzo wieksze obciazenie' : 'duzo swiezszy niz miesiac temu';
      else if (Math.abs(atlTrend) <= 3) atlTxt = 'obciazenie bez zmian';
      else atlTxt = (atlTrend > 0 ? '+' : '') + atlTrend + '% do miesiaca temu';
      atlTrendEl.textContent = atlTxt;
    }

    // Strefa interpretacji
    const zoneEl = document.getElementById(px + '-zone');
    if (zoneEl) {
      let zoneText, zoneColor;
      if ((logs || []).length < 5) {
        zoneText = 'ℹ️ Za mało danych — loguj więcej treningów, by zobaczyć formę';
        zoneColor = 'rgba(255,255,255,0.7)';
      } else if (lastTsb >= 15) { zoneText = '⚠️ Bardzo wypoczęty — możliwy spadek formy bez treningu'; zoneColor = '#fbbf24'; }
      else if (lastTsb >= 5) { zoneText = '🟢 Forma świeża — gotowy do startów lub mocnych treningów'; zoneColor = '#4ade80'; }
      else if (lastTsb >= -10) { zoneText = '🔵 Trening neutralny — kontynuuj plan'; zoneColor = '#60a5fa'; }
      else if (lastTsb >= -30) { zoneText = '🟠 Wyraźne obciążenie — uważaj na regenerację'; zoneColor = '#fb923c'; }
      else { zoneText = '🔴 Przeciążenie — ryzyko kontuzji, odpocznij'; zoneColor = '#f87171'; }
      zoneEl.textContent = zoneText;
      zoneEl.style.color = zoneColor;
      zoneEl.style.background = zoneColor.startsWith('rgba') ? 'rgba(255,255,255,0.04)' : `${zoneColor}14`;
      zoneEl.style.borderColor = zoneColor.startsWith('rgba') ? 'rgba(255,255,255,0.1)' : `${zoneColor}40`;
    }

    // ── Storytelling header ──
    // ctl30dAgo + todayIdx + idx30 obliczone wcześniej w 3-tile block (CTL trend)
    if (typeof window.formaStory === 'function') {
      const story = window.formaStory(logs || [], raceMarkers, lastCtl, lastAtl, lastTsb, ctl30dAgo);
      const storyContainer = document.getElementById(px + '-story');
      const iconEl = document.getElementById(px + '-story-icon');
      const headlineEl = document.getElementById(px + '-story-headline');
      const sublineEl = document.getElementById(px + '-story-subline');
      const recWrapEl = document.getElementById(px + '-story-rec-wrap');
      const recEl = document.getElementById(px + '-story-rec');
      const bgEl = document.getElementById(px + '-story-bg');

      // Helper: hex → rgb csv dla dynamic radial gradient
      const hexToRgb = (hex) => {
        const h = (hex || '').replace('#', '');
        if (h.length !== 6) return '232,86,30';
        return parseInt(h.substr(0,2), 16) + ',' + parseInt(h.substr(2,2), 16) + ',' + parseInt(h.substr(4,2), 16);
      };

      if (iconEl) iconEl.textContent = story.icon || '📊';
      if (headlineEl) {
        headlineEl.textContent = story.headline;
        headlineEl.style.color = '#fff';  // premium: headline zawsze biały, kolor poprzez ikonę i bg
      }
      if (sublineEl) sublineEl.textContent = story.subline;

      if (recWrapEl && recEl) {
        if (story.recommendation) {
          recEl.textContent = story.recommendation;
          recWrapEl.style.display = 'block';
          recWrapEl.style.borderLeftColor = story.color || '#e8561e';
          const recLabel = recWrapEl.querySelector('div:first-child');
          if (recLabel) recLabel.style.color = story.color || '#e8561e';
        } else {
          recWrapEl.style.display = 'none';
        }
      }

      // Dynamic radial gradient bg (2 punkty emanujące kolorem rule)
      if (bgEl && story.color) {
        const c = story.color.startsWith('rgba') ? '232,86,30' : hexToRgb(story.color);
        bgEl.style.background =
          'radial-gradient(circle at 30% 20%, rgba(' + c + ',0.18) 0%, transparent 50%), ' +
          'radial-gradient(circle at 70% 80%, rgba(' + c + ',0.12) 0%, transparent 50%)';
      }

      // Fade animation na re-render
      if (storyContainer) {
        storyContainer.classList.remove('story-update');
        void storyContainer.offsetWidth; // force reflow
        storyContainer.classList.add('story-update');
      }
    }

    // Build annotations: Dziś + "Tu jesteś" (Strava-pure — race markers w osobnym DIV pod chartem)
    const annotations = {
      // Linia "Dziś"
      today: {
        type: 'line',
        xMin: todayDateStr.slice(5),
        xMax: todayDateStr.slice(5),
        borderColor: 'rgba(255,255,255,0.4)',
        borderWidth: 1.5,
        borderDash: [2, 3],
        label: {
          display: true,
          content: 'Dziś',
          position: 'end',
          backgroundColor: 'rgba(255,255,255,0.15)',
          color: 'rgba(255,255,255,0.85)',
          font: { size: 9, family: 'DM Mono' },
          padding: { top: 3, bottom: 3, left: 6, right: 6 },
          borderRadius: 4,
          yAdjust: -8,
        }
      },
      // MARKER "Tu jesteś" — duża kropka na końcu TSB linii z kolorem per strefa
      you_are_here: {
        type: 'point',
        xValue: todayDateStr.slice(5),
        yValue: lastTsb,
        backgroundColor: lastTsb >= 5 && lastTsb <= 15 ? '#4ade80' : lastTsb > 15 ? '#fbbf24' : lastTsb >= -10 ? '#60a5fa' : lastTsb >= -30 ? '#fb923c' : '#f87171',
        borderColor: '#fff',
        borderWidth: 3,
        radius: 8,
        drawTime: 'afterDatasetsDraw',
        label: {
          display: true,
          content: 'Tu jesteś',
          position: 'top',
          backgroundColor: 'rgba(20,15,30,0.9)',
          color: '#fff',
          font: { size: 9, family: 'DM Mono', weight: 'bold' },
          padding: { top: 3, bottom: 3, left: 7, right: 7 },
          borderRadius: 5,
          yAdjust: -20,
        }
      },
    };

    // v5 Strava-style: 14-day projection (dashed line) — "co jutro jeśli odpoczynę"
    // Liczone tu (poza chart block) bo race markers + TRIMP bars muszą się alignować z chart canvas
    const lastCTL = ctlData[ctlData.length - 1] || 0;
    const lastATL = atlData[atlData.length - 1] || 0;
    const projection = (typeof window.computeFormaProjection === 'function')
      ? window.computeFormaProjection(lastCTL, lastATL, 14)
      : null;
    const extendedLabels = projection ? labels.concat(projection.labels) : labels;
    const padNullsToProj = (arr) => projection ? arr.concat(new Array(projection.labels.length).fill(null)) : arr;
    const padNullsFromHist = (projArr) => projection ? new Array(labels.length).fill(null).concat(projArr) : [];

    // Render race markers POD chartem w osobnym DIV (Strava-style) — szuka #PREFIX-races
    const racesContainerEl = document.getElementById(px + '-races');
    if (racesContainerEl) {
      if (!raceMarkers || raceMarkers.length === 0) {
        racesContainerEl.innerHTML = '';
        racesContainerEl.style.display = 'none';
      } else {
        const escHtml = window.escapeHtml || (s => String(s).replace(/[<>"&]/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;','&':'&amp;'})[c]));
        const labelToIdx = {};
        labels.forEach((lbl, i) => { labelToIdx[lbl] = i; });

        const markers = raceMarkers.map(race => {
          const raceLabelDate = race.date.slice(5);
          const idx = labelToIdx[raceLabelDate];
          if (idx === undefined) return null;
          const pctX = (idx / (extendedLabels.length - 1)) * 100;
          return {
            pctX: pctX,
            name: race.name,
            date: race.date,
            daysFromNow: Math.round((new Date(race.date).getTime() - Date.now()) / 86400000)
          };
        }).filter(m => m !== null);

        if (markers.length === 0) {
          racesContainerEl.innerHTML = '';
          racesContainerEl.style.display = 'none';
        } else {
          racesContainerEl.style.display = 'block';
          racesContainerEl.innerHTML = '<div style="position:relative;height:28px;margin-top:4px;">' +
            markers.map(m => {
              const safeName = escHtml(m.name);
              const daysLabel = m.daysFromNow >= 0 ? ('za ' + m.daysFromNow + ' dni') : (Math.abs(m.daysFromNow) + ' dni temu');
              return '<div style="position:absolute;left:' + m.pctX.toFixed(2) + '%;top:0;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:2px;">' +
                '<div style="font-size:14px;line-height:1;">🏁</div>' +
                '<div title="' + safeName + ' (' + daysLabel + ')" style="font-size:8px;font-family:DM Mono,monospace;color:#e8561e;letter-spacing:0.05em;white-space:nowrap;background:rgba(232,86,30,0.12);padding:1px 5px;border-radius:3px;border:1px solid rgba(232,86,30,0.3);max-width:80px;overflow:hidden;text-overflow:ellipsis;">' + safeName + '</div>' +
              '</div>';
            }).join('') +
          '</div>';
        }
      }
    }

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // v4: TRIMP bars w osobnym mini-chart canvasie POD głównym chartem — szuka #PREFIX-trimp-bars
    const trimpBarsEl = document.getElementById(px + '-trimp-bars');
    if (trimpBarsEl && typeof Chart !== 'undefined') {
      const trimpCtx = trimpBarsEl.getContext('2d');
      const trimpChartKey = '_formaTrimpChart_' + px;
      if (window[trimpChartKey]) window[trimpChartKey].destroy();
      window[trimpChartKey] = new Chart(trimpCtx, {
        type: 'bar',
        data: {
          labels: extendedLabels,
          datasets: [{
            label: 'TRIMP',
            data: padNullsToProj(trimpData),
            backgroundColor: 'rgba(255,255,255,0.15)',
            borderColor: 'rgba(255,255,255,0.25)',
            borderWidth: 0,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: reduce ? false : { duration: 800, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(20,15,30,0.95)',
              borderColor: 'rgba(255,255,255,0.1)',
              borderWidth: 1,
              padding: 8,
              titleFont: { family: 'DM Mono', size: 10 },
              bodyFont: { family: 'DM Sans', size: 11 }
            }
          },
          scales: {
            x: { display: false, grid: { display: false } },
            y: {
              position: 'left',
              ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10, weight: '500' }, maxTicksLimit: 3 },
              grid: { color: 'rgba(255,255,255,0.03)' },
              beginAtZero: true
            }
          }
        }
      });
    }

    // Render Chart — per-prefix instance żeby zawodnik i trener panel mogły coexist
    const chartEl = document.getElementById(px + '-chart');
    if (chartEl) {
      const ctx = chartEl.getContext('2d');
      const chartKey = '_formaChart_' + px;
      if (window[chartKey]) window[chartKey].destroy();
      window[chartKey] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: extendedLabels,
          datasets: [
            // CTL — GŁÓWNA linia (forma długa = progres sezonu): gruba (3px), wypełniona = ciężar wizualny.
            // order:3 → rysowana ZA liniami pomocniczymi, niebieski fill NIE przemywa TSB/ATL; dominuje grubością.
            vm.ctl && { label: 'CTL (forma długa)', data: padNullsToProj(ctlData), borderColor: '#63a6f4', backgroundColor: 'transparent', tension: 0.35, pointRadius: 0, borderWidth: 2, fill: false, yAxisID: 'y', order: 3 }  /* WYKRES-PROTOTYP: CTL tlo cienkie */,
            // TSB — pomocnicza (cienka), krystaliczna na wierzchu (order:0). Fill tylko w trybie TSB-solo (graceful fallback dawnego widoku).
            vm.tsb && { label: 'TSB (forma świeża)', data: padNullsToProj(tsbData), borderColor: '#f4c04a', backgroundColor: 'rgba(244,192,74,0.14)', tension: 0.35, pointRadius: 0, borderWidth: 2.6, fill: true, yAxisID: 'y', order: 0 }  /* WYKRES-PROTOTYP: TSB zolty bohater + fill */,
            // ATL — pomocnicza (cienka)
            vm.atl && { label: 'ATL (zmęczenie)', data: padNullsToProj(atlData), borderColor: '#ff5a1f', backgroundColor: 'transparent', tension: 0.35, pointRadius: 0, borderWidth: 2, yAxisID: 'y', order: 1 }  /* WYKRES-PROTOTYP: ATL pomaranczowy tlo */,
            // Projection (dashed) — hidden z legend filter
            vm.ctl && projection && { label: 'CTL projection', data: padNullsFromHist(projection.ctlData), borderColor: 'rgba(96,165,250,0.5)', backgroundColor: 'transparent', tension: 0.3, pointRadius: 0, borderWidth: 1.5, borderDash: [5,5], yAxisID: 'y', order: 5 },
            vm.atl && projection && { label: 'ATL projection', data: padNullsFromHist(projection.atlData), borderColor: 'rgba(248,113,113,0.5)', backgroundColor: 'transparent', tension: 0.3, pointRadius: 0, borderWidth: 1.5, borderDash: [5,5], yAxisID: 'y', order: 5 },
            vm.tsb && projection && { label: 'TSB projection', data: padNullsFromHist(projection.tsbData), borderColor: 'rgba(74,222,128,0.5)', backgroundColor: 'transparent', tension: 0.3, pointRadius: 0, borderWidth: 1.5, borderDash: [5,5], yAxisID: 'y', order: 5 },
          ].filter(Boolean)
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: reduce ? false : { duration: 1200, easing: 'easeOutQuart' },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            zoom: {
              pan: { enabled: false },   // S3-fix: wyłączony poziomy drag-pan → nie koliduje z nav-swipe (pinch-zoom niżej zostaje)
              zoom: {
                wheel: { enabled: true, speed: 0.1 },
                pinch: { enabled: true },
                mode: 'x'
              },
              limits: { x: { minRange: 7 } }
            },
            legend: {
              labels: {
                color: 'rgba(255,255,255,0.7)',
                font: { size: 10, family: 'DM Mono' },
                boxWidth: 10,
                padding: 12,
                filter: (item) => !item.text.includes('projection')
              },
              position: 'bottom',
            },
            tooltip: { backgroundColor: 'rgba(20,15,30,0.95)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 10, titleFont: { family: 'DM Mono', size: 11 }, bodyFont: { family: 'DM Sans', size: 12 } },
            annotation: { annotations: annotations }
          },
          scales: {
            x: {
              ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10 }, maxRotation: 0, autoSkipPadding: 20 },
              grid: { display: false }
            },
            y: {
              position: 'left',
              ticks: { color: 'rgba(255,255,255,0.75)', font: { size: 12, weight: '500' } },
              grid: { color: 'rgba(255,255,255,0.04)' }
            }
          }
        }
      });

      // v5.2: Reset zoom button (Strava-style) — pojawia się gdy user zoomował
      let resetBtnEl = document.getElementById(px + '-reset-zoom');
      if (!resetBtnEl) {
        const chartParent = chartEl.parentElement;
        if (chartParent) {
          chartParent.style.position = 'relative';
          const btn = document.createElement('button');
          btn.id = px + '-reset-zoom';
          btn.textContent = '⟲ Reset';
          btn.style.cssText = 'position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:4px 10px;font-family:DM Mono,monospace;font-size:9px;letter-spacing:0.1em;border-radius:6px;cursor:pointer;opacity:0;transition:opacity 0.2s;pointer-events:none;z-index:5;';
          btn.onclick = function() {
            if (window[chartKey] && typeof window[chartKey].resetZoom === 'function') {
              window[chartKey].resetZoom();
              btn.style.opacity = '0';
              btn.style.pointerEvents = 'none';
            }
          };
          chartParent.appendChild(btn);
          resetBtnEl = btn;
        }
      }
      // Re-attach onZoom/onPan callbacks na każdy render (poprzedni chart instance był destroyed)
      if (resetBtnEl && window[chartKey] && window[chartKey].options && window[chartKey].options.plugins && window[chartKey].options.plugins.zoom) {
        const showBtn = function() { resetBtnEl.style.opacity = '1'; resetBtnEl.style.pointerEvents = 'auto'; };
        window[chartKey].options.plugins.zoom.zoom.onZoom = showBtn;
        window[chartKey].options.plugins.zoom.pan.onPan = showBtn;
      }
    }

    // 2 dodatkowe sekcje — pass prefix
    window._renderFormaWeekly(logs || [], px, undefined, !!(options && options.animate));
    window._renderFormaTypes(logs || [], px, !!(options && options.animate));
    window._renderFormaHeatmap(logs || [], px, weightKg, undefined, !!(options && options.animate), athleteId);
    window._renderFormaKcalWeekly(logs || [], px, weightKg, undefined, !!(options && options.animate));
    if (window.renderFormaHrZones) window.renderFormaHrZones(athleteId, px, { isCoach: px === 'pfo' });   // agregat stref HR (async, non-blocking; authz owner+coach server-side)
    if (window._renderFormaWatchActs) window._renderFormaWatchActs(logs || [], px, athleteId);
    if (window._renderFormaEfTrend) window._renderFormaEfTrend(logs || [], px);   /* E2-K4 */
    if (window._renderFormaWellness) window._renderFormaWellness(athleteId, px);   /* E3-K5 (async, fire&forget) */   // ⌚ lista treningów z zegarka → drill-down dnia
  };

  // ⌚ Ostatnie treningi z zegarka — lista → drill-down dnia (wykresy per-activity).
  // Wzorzec prefiksów jak reszta Formy: 'forma' (zawodnik) / 'pfo' (trener).
  window._renderFormaWatchActs = function(logs, idPrefix, athleteId) {
    const px = idPrefix || 'forma';
    const el = document.getElementById(px + '-watch-acts');
    if (!el) return;
    const acts = (logs || [])
      .filter(l => l && l.source === 'intervals' && l.external_id && l.logged_at)
      .sort((a, b) => String(b.logged_at).localeCompare(String(a.logged_at)))
      .slice(0, 5);
    if (!acts.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
    const esc = window.escapeHtml || (s => String(s));
    const rows = acts.map(l => {
      const dateStr = String(l.logged_at).split('T')[0];
      const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);   // bez walidacji: wiersz bez kliku (XSS-dyscyplina)
      const d = new Date(l.logged_at);
      const label = isNaN(d.getTime()) ? esc(dateStr) : d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
      const bits = [
        l.training_type ? esc(l.training_type) : null,
        l.distance_km ? parseFloat(l.distance_km).toFixed(1) + ' km' : null,
        l.pace ? esc(String(l.pace)) + '/km' : null,
        l.heart_rate ? '♥ ' + esc(String(l.heart_rate)) : null
      ].filter(Boolean).join(' · ');
      const navUrl = (px === 'pfo' && athleteId)
        ? 'kalendarz.html?role=coach&athlete=' + athleteId + '&openDay=' + dateStr
        : 'kalendarz.html?openDay=' + dateStr;
      const clickAttr = dateOk ? ' onclick="location.href=\'' + navUrl + '\'" style="cursor:pointer;' : ' style="cursor:default;';
      return '<div' + clickAttr + 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 2px;border-bottom:1px solid rgba(255,255,255,0.05);">'
        + '<div style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:#fff;">' + bits + '</div>'
        + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;"><span style="font-size:9px;color:rgba(255,255,255,0.45);font-family:\'DM Mono\',monospace;">' + label + '</span><span style="color:var(--accent);font-size:12px;">→</span></div>'
        + '</div>';
    }).join('');
    el.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#fff;font-family:\'DM Mono\',monospace;font-weight:700;margin-bottom:6px;">⌚ Treningi z zegarka</div>'
      + rows
      + '<div style="text-align:center;margin-top:8px;font-size:9px;color:rgba(255,255,255,0.4);font-family:\'DM Mono\',monospace;letter-spacing:0.03em;">dotknij, żeby zobaczyć wykresy</div>';
    el.style.display = 'block';
  };

  // Weekly bars renderer — parametryzowany prefix
  window._renderFormaWeekly = function(logs, idPrefix, globalMax, animate) {
    const px = idPrefix || 'forma';
    const el = document.getElementById(px + '-weekly-bars');
    if (!el) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doAnim = !!animate && !reduce;
    const esc = window.escapeHtml || (s => String(s));
    const MON = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];

    const buckets = [];
    const today = new Date();
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(today);
      const dow = today.getDay();
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      weekStart.setDate(today.getDate() + mondayOffset - i * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const weekLogs = logs.filter(l => {
        const d = new Date(l.logged_at);
        return d >= weekStart && d < weekEnd;
      });

      const trimp = Math.round(weekLogs.reduce((sum, log) => sum + window.formaTRIMP(log), 0));
      /* E1b MONOTONIA+STRAIN (Foster): mono = srednia dzienna / odch.std (7 dni, dni wolne = 0);
         strain = TRIMP tygodnia x mono. Wysoka mono = ta sama harowka codziennie = ryzyko. */
      const dzienne = new Array(7).fill(0);
      weekLogs.forEach(log => {
        const di = Math.floor((new Date(log.logged_at) - weekStart) / 86400000);
        if (di >= 0 && di < 7) dzienne[di] += window.formaTRIMP(log);
      });
      const srD = dzienne.reduce((a, b) => a + b, 0) / 7;
      const sdD = Math.sqrt(dzienne.reduce((a, b) => a + (b - srD) * (b - srD), 0) / 7);
      const mono = (srD <= 0) ? 0 : (sdD > 0 ? Math.min(srD / sdD, 4) : 4);
      const strain = Math.round(trimp * mono);
      const lbl = (weekStart.getMonth() + 1) + '/' + weekStart.getDate();
      const endDt = new Date(weekEnd); endDt.setDate(endDt.getDate() - 1);
      const m1 = MON[weekStart.getMonth()], m2 = MON[endDt.getMonth()];
      const range = (m1 === m2) ? (weekStart.getDate() + '-' + endDt.getDate() + ' ' + m1)
                                : (weekStart.getDate() + ' ' + m1 + '–' + endDt.getDate() + ' ' + m2);
      buckets.push({ trimp, lbl, range, count: weekLogs.length, mono, strain });
    }

    const localMax = Math.max(...buckets.map(b => b.trimp), 1);
    const max = (globalMax && globalMax > 0) ? globalMax : localMax;
    const peakIdx = buckets.reduce((mi, b, i, a) => b.trimp > a[mi].trimp ? i : mi, 0);
    const curIdx = buckets.length - 1;

    el.style.position = 'relative';  // kontener dla absolutnego tooltipa
    el.innerHTML = buckets.map((b, i) => {
      const h = Math.max((b.trimp / max) * 100, 2);
      const isPeak = b.trimp > 0 && i === peakIdx;
      const isCur = i === curIdx;
      const grad = isPeak ? 'linear-gradient(180deg,#ff7a3d,#ffb27a)' : 'linear-gradient(180deg,#e8561e,#ff7a3d)';
      const glow = isPeak ? 'box-shadow:0 0 10px rgba(255,122,61,0.45);' : '';
      const barTrans = doAnim ? 'transition:height 0.55s cubic-bezier(0.215,0.61,0.355,1);transition-delay:' + (i * 45) + 'ms;' : '';
      const valTrans = doAnim ? 'transition:opacity 0.3s ease;transition-delay:' + (i * 45 + 480) + 'ms;' : '';
      return '<div class="fwb-bar-wrap" data-week="' + esc(b.range) + '" data-trimp="' + b.trimp + '" data-count="' + b.count + '" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;cursor:pointer;">'
        + '<div class="fwb-val" style="font-size:9px;color:rgba(255,255,255,0.6);font-family:DM Mono,monospace;opacity:' + (doAnim ? 0 : 1) + ';' + valTrans + '">' + (b.trimp || '') + '</div>'
        + '<div class="fwb-bar" style="width:100%;background:' + grad + ';border-radius:4px 4px 0 0;height:' + (doAnim ? 0 : h) + '%;min-height:2px;' + glow + barTrans + '"></div>'
        + '<div style="font-size:9px;color:rgba(255,255,255,' + (isCur ? '0.85' : '0.4') + ');font-family:DM Mono,monospace;display:flex;align-items:center;gap:3px;">' + b.lbl + (isCur ? '<span style="width:4px;height:4px;border-radius:50%;background:#4ade80;display:inline-block;"></span>' : '') + '</div>'
        + '</div>';
    }).join('')
    + '<div class="fwb-tip" style="position:absolute;bottom:calc(100% + 8px);left:0;transform:translateX(-50%);pointer-events:none;opacity:0;transition:opacity 0.15s ease;background:rgba(20,15,30,0.96);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:7px 10px;font-family:\'DM Mono\',monospace;font-size:10px;color:#fff;white-space:nowrap;z-index:5;box-shadow:0 6px 20px rgba(0,0,0,0.45);"></div>';

    // Draw-on-load: flip do docelowych wysokości po 1 klatce (CSS transition + stagger robią resztę)
    if (doAnim) requestAnimationFrame(() => {
      const bars = el.querySelectorAll('.fwb-bar'), vals = el.querySelectorAll('.fwb-val');
      buckets.forEach((b, i) => {
        if (bars[i]) bars[i].style.height = Math.max((b.trimp / max) * 100, 2) + '%';
        if (vals[i]) vals[i].style.opacity = '1';
      });
    });

    /* ═ E1b: linia Monotonia+Strain biezacego tygodnia (Foster) — doklejka pod barami ═ */
    try {
      const cur = buckets[buckets.length - 1];
      const poprz = buckets.slice(-5, -1).filter(b => b.strain > 0);
      const srStrain = poprz.length ? poprz.reduce((a, b) => a + b.strain, 0) / poprz.length : 0;
      let mHtml = '';
      if (cur && cur.trimp > 0) {
        const mo = Math.round(cur.mono * 10) / 10;
        const oc = mo >= 2.5 ? ['#f87171','bardzo monotonnie — zróżnicuj bodźce']
          : mo >= 2.0 ? ['#fb923c','monotonnie — dorzuć lżejszy dzień']
          : ['#4ade80','dobra zmienność bodźców'];
        const sAlert = (srStrain > 0 && cur.strain > srStrain * 1.5)
          ? ' · <span style="color:#fb923c;">strain +' + Math.round((cur.strain / srStrain - 1) * 100) + '% vs 4 tyg.</span>' : '';
        mHtml = 'Monotonia <strong style="color:' + oc[0] + ';">' + mo + '</strong>'
          + ' <span style="color:rgba(255,255,255,0.5);">· ' + oc[1] + '</span>'
          + ' · Strain <strong style="color:rgba(255,255,255,0.85);">' + cur.strain + '</strong>' + sAlert;
      }
      let mEl = document.getElementById(px + '-mono-line');
      if (!mEl) {
        mEl = document.createElement('div');
        mEl.id = px + '-mono-line';
        mEl.style.cssText = 'margin-top:8px;font-size:10px;font-family:DM Mono,monospace;letter-spacing:0.3px;color:rgba(255,255,255,0.6);line-height:1.5;';
        el.insertAdjacentElement('afterend', mEl);
      }
      mEl.innerHTML = mHtml;
      mEl.style.display = mHtml ? 'block' : 'none';
    } catch (e) {}

    // Tooltip per słupek (hover desktop + tap mobile) — bind RAZ na kontener (przeżywa re-render innerHTML)
    if (!el._fwbBound) {
      el._fwbBound = true;
      const showTip = (wrap) => {
        const tip = el.querySelector('.fwb-tip'); if (!tip || !wrap) return;
        const cn = +wrap.dataset.count;
        const word = cn === 1 ? 'trening' : (cn >= 2 && cn <= 4 ? 'treningi' : 'treningów');
        tip.innerHTML = esc(wrap.dataset.week) + ' · <b>' + wrap.dataset.trimp + ' TRIMP</b> · ' + cn + ' ' + word;
        const r = wrap.getBoundingClientRect(), er = el.getBoundingClientRect();
        let left = r.left - er.left + r.width / 2;
        const half = tip.offsetWidth / 2, contW = el.clientWidth;
        if (tip.offsetWidth < contW) left = Math.max(half, Math.min(left, contW - half));  // clamp w obrębie kontenera
        tip.style.left = left + 'px';
        tip.style.opacity = '1';
      };
      const hideTip = () => { const tip = el.querySelector('.fwb-tip'); if (tip) tip.style.opacity = '0'; };
      el.addEventListener('pointerover', e => { const w = e.target.closest('.fwb-bar-wrap'); if (w) showTip(w); });
      el.addEventListener('pointerout', e => { if (!e.relatedTarget || !el.contains(e.relatedTarget)) hideTip(); });
      el.addEventListener('pointerdown', e => { const w = e.target.closest('.fwb-bar-wrap'); if (w) showTip(w); });
      document.addEventListener('pointerdown', e => { if (!e.target.closest('#' + px + '-weekly-bars')) hideTip(); });
    }
  };

  // Types pie renderer — parametryzowany prefix
  window._renderFormaTypes = function(logs, idPrefix, animate) {
    const px = idPrefix || 'forma';
    const el = document.getElementById(px + '-types-content');
    if (!el) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doAnim = !!animate && !reduce;
    const esc = window.escapeHtml || (s => String(s));

    const today = new Date();
    const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);

    const TYPE_COLORS = window.TRAINING_TYPE_COLORS || {};

    const counts = {};
    logs.forEach(l => {
      const d = new Date(l.logged_at);
      if (d < weekAgo) return;
      const t = l.training_type || 'Trening';
      const km = parseFloat(l.distance_km) || 0;
      counts[t] = (counts[t] || 0) + km;
    });

    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    if (total === 0) {
      el.innerHTML = '<div style="font-size:12px;color:rgba(255,255,255,0.5);text-align:center;padding:20px;">Brak treningów w ostatnich 7 dniach</div>';
      return;
    }

    const cx = 60, cy = 60, r = 50;
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    let startAngle = -Math.PI / 2;
    let paths = '';
    let legend = '';
    entries.forEach(([type, km], si) => {
      const pct = km / total;
      const tip = type + ' · ' + km.toFixed(1) + ' km · ' + Math.round(pct * 100) + '%';
      const isTop = si === 0;
      const stroke = isTop ? ' stroke="rgba(255,255,255,0.45)" stroke-width="1.5"' : '';
      const endAngle = startAngle + pct * 2 * Math.PI;
      const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
      const largeArc = pct > 0.5 ? 1 : 0;
      const color = TYPE_COLORS[type] || '#e8561e';
      if (pct >= 0.999) {
        paths += '<circle class="fpie-slice" data-tip="' + esc(tip) + '" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + color + '"' + stroke + ' style="cursor:pointer;"/>';
      } else {
        paths += '<path class="fpie-slice" data-tip="' + esc(tip) + '" d="M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2 + ' Z" fill="' + color + '"' + stroke + ' style="cursor:pointer;"/>';
      }
      startAngle = endAngle;

      legend += '<div class="fpie-legrow" data-tip="' + esc(tip) + '" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11px;cursor:pointer;' + (isTop ? 'font-weight:600;' : '') + '">'
        + '<div style="width:10px;height:10px;background:' + color + ';border-radius:2px;flex-shrink:0;"></div>'
        + '<div style="flex:1;color:rgba(255,255,255,0.85);">' + esc(type) + '</div>'
        + '<div style="color:rgba(255,255,255,0.6);font-family:DM Mono,monospace;">' + km.toFixed(1) + ' km</div>'
        + '</div>';
    });

    const gStyle = doAnim ? 'opacity:0;transform:scale(0.7) rotate(-12deg);transform-box:view-box;transform-origin:60px 60px;transition:opacity 0.5s ease,transform 0.5s cubic-bezier(0.215,0.61,0.355,1);' : '';
    const tipHtml = '<div class="fwb-tip" style="position:absolute;left:0;top:0;transform:translateX(-50%);pointer-events:none;opacity:0;transition:opacity 0.15s ease;background:rgba(20,15,30,0.96);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:6px 9px;font-family:\'DM Mono\',monospace;font-size:10px;color:#fff;white-space:nowrap;z-index:5;box-shadow:0 6px 20px rgba(0,0,0,0.45);"></div>';
    el.style.position = 'relative';
    el.innerHTML = '<div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">'
      + '<svg width="120" height="120" viewBox="0 0 120 120" style="flex-shrink:0;overflow:visible;"><g class="fpie-g" style="' + gStyle + '">' + paths + '</g></svg>'
      + '<div style="flex:1;min-width:120px;">' + legend + '</div>'
      + '</div>' + tipHtml;

    // Draw-on-load: pop+settle całego pie po 1 klatce
    if (doAnim) requestAnimationFrame(() => {
      const g = el.querySelector('.fpie-g');
      if (g) { g.style.opacity = '1'; g.style.transform = 'scale(1) rotate(0deg)'; }
    });

    // Tooltip per slice + wiersz legendy (hover + tap) — bind RAZ na kontener
    if (!el._fpieBound) {
      el._fpieBound = true;
      const showTip = (node) => {
        const tip = el.querySelector('.fwb-tip'); if (!tip || !node) return;
        tip.textContent = node.dataset.tip || '';
        const er = el.getBoundingClientRect(), nr = node.getBoundingClientRect();
        const half = tip.offsetWidth / 2;
        let left = nr.left - er.left + nr.width / 2;
        left = Math.max(half, Math.min(left, el.clientWidth - half));  // clamp X
        let top = nr.top - er.top - tip.offsetHeight - 6;
        if (top < 0) top = nr.top - er.top + nr.height + 6;  // flip
        tip.style.left = left + 'px'; tip.style.top = top + 'px'; tip.style.opacity = '1';
      };
      const hideTip = () => { const t = el.querySelector('.fwb-tip'); if (t) t.style.opacity = '0'; };
      el.addEventListener('pointerover', e => { const n = e.target.closest('[data-tip]'); if (n) showTip(n); });
      el.addEventListener('pointerout', e => { if (!e.relatedTarget || !el.contains(e.relatedTarget)) hideTip(); });
      el.addEventListener('pointerdown', e => { const n = e.target.closest('[data-tip]'); if (n) showTip(n); });
      document.addEventListener('pointerdown', e => { if (!e.target.closest('#' + px + '-types-content')) hideTip(); });
    }
  };

  // Heatmap aktywności — 13 tygodni × 7 dni grid (GitHub-style)
  window._renderFormaHeatmap = function(logs, idPrefix, weightKg, useGlobalPercentile, animate, athleteId) {
    const px = idPrefix || 'forma';
    const el = document.getElementById(px + '-heatmap');
    if (!el) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doAnim = !!animate && !reduce;
    const esc = window.escapeHtml || (s => String(s));

    // Percentile thresholds liczone raz dla całych logów (per athlete) — opcjonalnie
    const thresholds = useGlobalPercentile ? window.formaComputePercentileThresholds(logs) : null;

    // Recompute dailyTRIMP + dailyKcal map (kcal display jeśli weightKg > 0)
    const dailyTRIMP = {};
    const dailyKcal = {};
    const hasKcal = weightKg && weightKg > 0;
    (logs || []).forEach(log => {
      const dateStr = (log.logged_at || '').split('T')[0];
      if (!dateStr) return;
      dailyTRIMP[dateStr] = (dailyTRIMP[dateStr] || 0) + window.formaTRIMP(log);
      if (hasKcal) {
        dailyKcal[dateStr] = (dailyKcal[dateStr] || 0) + window.formaCalories(log, weightKg);
      }
    });

    // Anchor: Monday of current week (Polish convention, Mon=1, Sun=0)
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dow = today.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const currentMonday = new Date(today);
    currentMonday.setDate(today.getDate() + mondayOffset);

    // Start grid: 12 weeks ago Monday → 13 columns total
    const startMonday = new Date(currentMonday);
    startMonday.setDate(currentMonday.getDate() - 12 * 7);

    // Cell sizing per prefix
    const cellSize = px === 'pfo' ? 9 : 11;
    const gap = px === 'pfo' ? 2 : 3;

    // Day labels (Polish)
    const dayLabels = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

    // Build grid HTML
    let cells = '';
    let anyClickable = false;   // L3: czy jest choć jeden klikalny dzień (do mikro-podpisu)
    let monthLabels = '';
    let lastMonth = -1;
    for (let w = 0; w < 13; w++) {
      // Month label dla pierwszej kolumny każdego nowego miesiąca
      const weekStart = new Date(startMonday);
      weekStart.setDate(startMonday.getDate() + w * 7);
      const monthIdx = weekStart.getMonth();
      if (monthIdx !== lastMonth) {
        const monthName = weekStart.toLocaleDateString('pl-PL', { month: 'short' });
        monthLabels += '<div style="position:absolute;left:' + (w * (cellSize + gap)) + 'px;top:0;font-size:8px;color:rgba(255,255,255,0.4);font-family:DM Mono,monospace;">' + monthName + '</div>';
        lastMonth = monthIdx;
      }
      for (let d = 0; d < 7; d++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + d);
        const dateStr = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');   // LOKALNA data (spójne z _calLogs=logged_at.split, kaflami mobile 4680/4708, i labelem toLocaleDateString); NIE toISOString — UTC cofa o dzień w +tz → off-by-one (heatmapa + L3 openDay)
        const trimp = dailyTRIMP[dateStr] || 0;
        const kcal = hasKcal ? (dailyKcal[dateStr] || 0) : 0;
        const level = window.formaIntensityLevel(trimp, thresholds);
        const color = window.formaIntensityColor(level);
        const isFuture = date.getTime() > today.getTime();
        const dayDateLabel = date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
        const titleAttr = isFuture
          ? dayDateLabel + ' — przyszłość'
          : trimp > 0
            ? dayDateLabel + ' · TRIMP ' + trimp + (kcal > 0 ? ' · ' + kcal + ' kcal' : '')
            : dayDateLabel + ' · brak treningu';
        const opacity = isFuture ? 0.25 : 1;
        const isToday = !isFuture && date.getTime() === today.getTime();
        const ring = isToday ? 'outline:1.5px solid #4ade80;outline-offset:1px;' : '';
        const animStyle = doAnim
          ? 'opacity:0;transform:scale(0.6);transition:opacity 0.3s ease,transform 0.3s cubic-bezier(0.215,0.61,0.355,1);transition-delay:' + (w * 40) + 'ms;'
          : 'opacity:' + opacity + ';transition:transform 0.15s;';
        // L3: klik → drill-down dnia (aktywny dzień; nie-przyszłość). Zawodnik → ?openDay; trener(pfo) → ?role=coach&athlete=<id>&openDay (drill-down zawodnika; wymaga athleteId — coach-auth EF przepuszcza trenera-tego-zawodnika). dateStr generowany → inline onclick bezpieczny
        const clickable = !isFuture && trimp > 0 && (px !== 'pfo' || !!athleteId);
        if (clickable) anyClickable = true;
        const tipFull = clickable ? (titleAttr + ' · otwórz') : titleAttr;
        const navUrl = (px === 'pfo')
          ? 'kalendarz.html?role=coach&athlete=' + athleteId + '&openDay=' + dateStr
          : 'kalendarz.html?openDay=' + dateStr;
        const clickAttr = clickable ? ' onclick="location.href=\'' + navUrl + '\'"' : '';
        cells += '<div class="fhm-cell" data-tip="' + esc(tipFull) + '" data-date="' + dateStr + '" data-future="' + (isFuture ? 1 : 0) + '" style="width:' + cellSize + 'px;height:' + cellSize + 'px;background:' + color + ';border-radius:2px;grid-column:' + (w + 2) + ';grid-row:' + (d + 1) + ';' + (clickable ? 'cursor:pointer;' : 'cursor:default;') + ring + animStyle + '"' + clickAttr + ' onmouseover="this.style.transform=\'scale(1.4)\'" onmouseout="this.style.transform=\'scale(1)\'"></div>';
      }
    }

    // Day labels column (1)
    let labels = '';
    for (let d = 0; d < 7; d++) {
      labels += '<div style="font-size:8px;color:rgba(255,255,255,0.4);font-family:DM Mono,monospace;line-height:' + cellSize + 'px;grid-column:1;grid-row:' + (d + 1) + ';padding-right:4px;">' + (d % 2 === 0 ? dayLabels[d] : '') + '</div>';
    }

    // Legend
    let legend = '<div style="display:flex;align-items:center;justify-content:flex-end;gap:5px;margin-top:10px;font-size:9px;color:rgba(255,255,255,0.5);font-family:DM Mono,monospace;">';
    legend += '<span>Mniej</span>';
    for (let l = 0; l < 5; l++) {
      legend += '<div style="width:' + cellSize + 'px;height:' + cellSize + 'px;background:' + window.formaIntensityColor(l) + ';border-radius:2px;"></div>';
    }
    legend += '<span>Więcej</span>';
    legend += '</div>';

    const tipHtml = '<div class="fwb-tip" style="position:absolute;left:0;top:0;transform:translateX(-50%);pointer-events:none;opacity:0;transition:opacity 0.15s ease;background:rgba(20,15,30,0.96);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:6px 9px;font-family:\'DM Mono\',monospace;font-size:10px;color:#fff;white-space:nowrap;z-index:5;box-shadow:0 6px 20px rgba(0,0,0,0.45);"></div>';
    const gridHtml = '<div class="fhm-grid" style="position:relative;display:grid;grid-template-columns:18px repeat(13,' + cellSize + 'px);grid-template-rows:repeat(7,' + cellSize + 'px);gap:' + gap + 'px;padding-top:12px;">' + monthLabels + labels + cells + tipHtml + '</div>';
    // L3: mikro-podpis odkrywalności (mobile-friendly, brak hover) — gdy są klikalne dni (zawodnik i trener); ZERO ramek na komórkach (kolor=intensywność zostaje czysty)
    const hint = anyClickable
      ? '<div style="text-align:center;margin-top:8px;font-size:9px;color:rgba(255,255,255,0.4);font-family:\'DM Mono\',monospace;letter-spacing:0.03em;">dotknij dnia z treningiem, żeby zobaczyć szczegóły</div>'
      : '';
    el.innerHTML = gridHtml + legend + hint;

    // Draw-on-load: column-sweep reveal po 1 klatce
    if (doAnim) requestAnimationFrame(() => {
      el.querySelectorAll('.fhm-cell').forEach(c => {
        c.style.opacity = c.dataset.future === '1' ? '0.25' : '1';
        c.style.transform = 'scale(1)';
      });
    });

    // Tooltip per komórka (hover + tap) — bind RAZ na kontener
    if (!el._fhmBound) {
      el._fhmBound = true;
      const showTip = (cell) => {
        const grid = el.querySelector('.fhm-grid'); const tip = grid && grid.querySelector('.fwb-tip');
        if (!tip || !cell) return;
        tip.textContent = cell.dataset.tip || '';
        const gr = grid.getBoundingClientRect(), cr = cell.getBoundingClientRect();
        const half = tip.offsetWidth / 2;
        let left = cr.left - gr.left + cr.width / 2;
        left = Math.max(half, Math.min(left, grid.clientWidth - half));  // clamp X
        let top = cr.top - gr.top - tip.offsetHeight - 6;
        if (top < 0) top = cr.top - gr.top + cr.height + 6;  // flip pod komórkę
        tip.style.left = left + 'px'; tip.style.top = top + 'px'; tip.style.opacity = '1';
      };
      const hideTip = () => { const t = el.querySelector('.fwb-tip'); if (t) t.style.opacity = '0'; };
      el.addEventListener('pointerover', e => { const c = e.target.closest('.fhm-cell'); if (c) showTip(c); });
      el.addEventListener('pointerout', e => { if (!e.relatedTarget || !el.contains(e.relatedTarget)) hideTip(); });
      el.addEventListener('pointerdown', e => { const c = e.target.closest('.fhm-cell'); if (c) showTip(c); });
      document.addEventListener('pointerdown', e => { if (!e.target.closest('#' + px + '-heatmap')) hideTip(); });
    }
  };

  // Kalorie weekly bars — 8 tygodni sum kcal (analog do _renderFormaWeekly ale dla kcal)
  window._renderFormaKcalWeekly = function(logs, idPrefix, weightKg, globalMax, animate) {
    const px = idPrefix || 'forma';
    const el = document.getElementById(px + '-kcal-weekly');
    if (!el) return;
    var _kcalCard = document.getElementById(px + '-kcal-card');   /* KALORIE-HIDE */
    if (!weightKg || weightKg <= 0) {
      if (_kcalCard) { _kcalCard.style.display = 'none'; return; }
      el.innerHTML = '<div style="font-size:11px;color:rgba(255,255,255,0.5);text-align:center;padding:14px;">🔥 Brak danych — wpisz wagę w sekcji <a href="nutrition.html" style="color:var(--accent);text-decoration:underline;">Odżywianie</a></div>';
      return;
    }
    if (_kcalCard) _kcalCard.style.display = '';   /* KALORIE-HIDE: waga jest -> pokaz */
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doAnim = !!animate && !reduce;
    const esc = window.escapeHtml || (s => String(s));
    const MON = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];

    // 8 tygodni — buckets Monday-Sunday
    const buckets = [];
    const today = new Date();
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(today);
      const dow = today.getDay();
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      weekStart.setDate(today.getDate() + mondayOffset - i * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const weekLogs = logs.filter(l => {
        const d = new Date(l.logged_at);
        return d >= weekStart && d < weekEnd;
      });

      const kcal = Math.round(weekLogs.reduce((sum, log) => sum + window.formaCalories(log, weightKg), 0));
      const lbl = (weekStart.getMonth() + 1) + '/' + weekStart.getDate();
      const endDt = new Date(weekEnd); endDt.setDate(endDt.getDate() - 1);
      const m1 = MON[weekStart.getMonth()], m2 = MON[endDt.getMonth()];
      const range = (m1 === m2) ? (weekStart.getDate() + '-' + endDt.getDate() + ' ' + m1)
                                : (weekStart.getDate() + ' ' + m1 + '–' + endDt.getDate() + ' ' + m2);
      buckets.push({ kcal, lbl, range, count: weekLogs.length });
    }

    const localMax = Math.max(...buckets.map(b => b.kcal), 1);
    const max = (globalMax && globalMax > 0) ? globalMax : localMax;
    const peakIdx = buckets.reduce((mi, b, i, a) => b.kcal > a[mi].kcal ? i : mi, 0);
    const curIdx = buckets.length - 1;

    el.style.position = 'relative';  // kontener dla absolutnego tooltipa
    el.innerHTML = buckets.map((b, i) => {
      const h = Math.max((b.kcal / max) * 100, 2);
      const isPeak = b.kcal > 0 && i === peakIdx;
      const isCur = i === curIdx;
      const grad = isPeak ? 'linear-gradient(180deg,#fcd34d,#fbbf24)' : 'linear-gradient(180deg,#fbbf24,#f59e0b)';
      const glow = isPeak ? 'box-shadow:0 0 10px rgba(251,191,36,0.45);' : '';
      const barTrans = doAnim ? 'transition:height 0.55s cubic-bezier(0.215,0.61,0.355,1);transition-delay:' + (i * 45) + 'ms;' : '';
      const valTrans = doAnim ? 'transition:opacity 0.3s ease;transition-delay:' + (i * 45 + 480) + 'ms;' : '';
      return '<div class="fwb-bar-wrap" data-week="' + esc(b.range) + '" data-kcal="' + b.kcal + '" data-count="' + b.count + '" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;cursor:pointer;">'
        + '<div class="fwb-val" style="font-size:9px;color:rgba(255,255,255,0.6);font-family:DM Mono,monospace;opacity:' + (doAnim ? 0 : 1) + ';' + valTrans + '">' + (b.kcal > 0 ? b.kcal : '') + '</div>'
        + '<div class="fwb-bar" style="width:100%;background:' + grad + ';border-radius:4px 4px 0 0;height:' + (doAnim ? 0 : h) + '%;min-height:2px;' + glow + barTrans + '"></div>'
        + '<div style="font-size:9px;color:rgba(255,255,255,' + (isCur ? '0.85' : '0.4') + ');font-family:DM Mono,monospace;display:flex;align-items:center;gap:3px;">' + b.lbl + (isCur ? '<span style="width:4px;height:4px;border-radius:50%;background:#4ade80;display:inline-block;"></span>' : '') + '</div>'
        + '</div>';
    }).join('')
    + '<div class="fwb-tip" style="position:absolute;bottom:calc(100% + 8px);left:0;transform:translateX(-50%);pointer-events:none;opacity:0;transition:opacity 0.15s ease;background:rgba(20,15,30,0.96);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:7px 10px;font-family:\'DM Mono\',monospace;font-size:10px;color:#fff;white-space:nowrap;z-index:5;box-shadow:0 6px 20px rgba(0,0,0,0.45);"></div>';

    // Draw-on-load: flip do docelowych wysokości po 1 klatce
    if (doAnim) requestAnimationFrame(() => {
      const bars = el.querySelectorAll('.fwb-bar'), vals = el.querySelectorAll('.fwb-val');
      buckets.forEach((b, i) => {
        if (bars[i]) bars[i].style.height = Math.max((b.kcal / max) * 100, 2) + '%';
        if (vals[i]) vals[i].style.opacity = '1';
      });
    });

    // Tooltip per słupek (hover desktop + tap mobile) — bind RAZ na kontener
    if (!el._fwbBound) {
      el._fwbBound = true;
      const showTip = (wrap) => {
        const tip = el.querySelector('.fwb-tip'); if (!tip || !wrap) return;
        const cn = +wrap.dataset.count;
        const word = cn === 1 ? 'trening' : (cn >= 2 && cn <= 4 ? 'treningi' : 'treningów');
        tip.innerHTML = esc(wrap.dataset.week) + ' · <b>' + wrap.dataset.kcal + ' kcal</b> · ' + cn + ' ' + word;
        const r = wrap.getBoundingClientRect(), er = el.getBoundingClientRect();
        let left = r.left - er.left + r.width / 2;
        const half = tip.offsetWidth / 2, contW = el.clientWidth;
        if (tip.offsetWidth < contW) left = Math.max(half, Math.min(left, contW - half));  // clamp w obrębie kontenera
        tip.style.left = left + 'px';
        tip.style.opacity = '1';
      };
      const hideTip = () => { const tip = el.querySelector('.fwb-tip'); if (tip) tip.style.opacity = '0'; };
      el.addEventListener('pointerover', e => { const w = e.target.closest('.fwb-bar-wrap'); if (w) showTip(w); });
      el.addEventListener('pointerout', e => { if (!e.relatedTarget || !el.contains(e.relatedTarget)) hideTip(); });
      el.addEventListener('pointerdown', e => { const w = e.target.closest('.fwb-bar-wrap'); if (w) showTip(w); });
      document.addEventListener('pointerdown', e => { if (!e.target.closest('#' + px + '-kcal-weekly')) hideTip(); });
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // 🔗 FILE METADATA — WeakMap dla "side data" przy plikach (OCR tracking)
  // Cross-browser safe (NIE mutuje native File object, iOS Safari tolerant)
  // ═══════════════════════════════════════════════════════════════
  window._fileMeta = window._fileMeta || new WeakMap();

  // Cleanup po usunięciu zoom feature — kasuje stary localStorage flag i resetuje zoom
  try {
    if (localStorage.getItem('zoomLevel')) {
      localStorage.removeItem('zoomLevel');
      if (document.body && document.body.style.zoom) {
        document.body.style.zoom = '';
      }
    }
  } catch(e) {}

  // Cleanup po usunięciu profile completion modal
  try {
    if (localStorage.getItem('profile_completion_dismissed_until')) {
      localStorage.removeItem('profile_completion_dismissed_until');
    }
  } catch(e) {}

  // ============================================================
  // v6.8: Storage helpers — signed URL generation z 1h expiry
  //
  // Po W2 Step 1: training-screenshots ma granular RLS (zawodnicy
  // uploadują do własnego folderu, trenerzy do folderów swoich atletów).
  // Po W2 Step 4 (planowane): bucket będzie private → getPublicUrl
  // przestanie działać, zostają TYLKO signed URLs.
  //
  // Migracja: zapisujemy PATH (np. "athlete_uuid/file.jpg") zamiast
  // pełnego URL w bazie. Przy renderze wywołujemy storageSignedUrl(path).
  //
  // DUAL MODE: w okresie Step 2-3 baza zawiera oba stany — stare
  // permanentne URL ("https://...supabase.co/storage/v1/object/public/...")
  // i nowe PATH. storageResolveUrl() obsługuje oba.
  // ============================================================

  window.storageSignedUrl = async function(path, bucket = 'training-screenshots', expiresIn = 3600) {
    if (!path) return null;
    const delays = [0, 1200];
    let lastErr = null;
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt] > 0) await new Promise(r => setTimeout(r, delays[attempt]));
      try {
        const { data, error } = await window.sb.storage
          .from(bucket)
          .createSignedUrl(path, expiresIn);
        if (!error) return data?.signedUrl || null;
        lastErr = error;
        const msg = (error.message || '').toLowerCase();
        // permanent — bez retry (brak pliku, brak uprawnień)
        if (msg.includes('not found') || msg.includes('not authorized') || msg.includes('permission')) {
          console.warn('[storageSignedUrl] permanent', path, error.message);
          return null;
        }
        console.warn('[storageSignedUrl] attempt ' + (attempt+1), path, error.message, '(retry)');
      } catch (e) {
        lastErr = e;
        console.warn('[storageSignedUrl] attempt ' + (attempt+1) + ' exception', path, e && e.message);
      }
    }
    console.error('[storageSignedUrl] failed all', path, lastErr && lastErr.message);
    return null;
  };

  window.storageSignedUrls = async function(paths, bucket = 'training-screenshots', expiresIn = 3600) {
    if (!Array.isArray(paths) || paths.length === 0) return [];
    const delays = [0, 1200];
    let lastErr = null;
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt] > 0) await new Promise(r => setTimeout(r, delays[attempt]));
      try {
        const { data, error } = await window.sb.storage
          .from(bucket)
          .createSignedUrls(paths, expiresIn);
        if (!error) return (data || []).map(d => d?.signedUrl || null);
        lastErr = error;
        console.warn('[storageSignedUrls] attempt ' + (attempt+1), error.message, '(retry)');
      } catch (e) {
        lastErr = e;
        console.warn('[storageSignedUrls] attempt ' + (attempt+1) + ' exception', e && e.message);
      }
    }
    console.error('[storageSignedUrls] failed all', lastErr && lastErr.message);
    return paths.map(() => null);
  };

  // DUAL MODE resolver — bierze "URL lub PATH" i zwraca świeży URL.
  // Wykrywa po prefiksie:
  //   - "https://..." → traktuje jako stary public URL (zwraca as-is)
  //   - cokolwiek innego → traktuje jako PATH, generuje signed URL
  window.storageResolveUrl = async function(urlOrPath, bucket = 'training-screenshots', expiresIn = 3600) {
    if (!urlOrPath) return null;
    if (typeof urlOrPath !== 'string') return null;
    if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
      return urlOrPath; // legacy public URL
    }
    return await window.storageSignedUrl(urlOrPath, bucket, expiresIn);
  };

  window.storageResolveUrls = async function(urlsOrPaths, bucket = 'training-screenshots', expiresIn = 3600) {
    if (!Array.isArray(urlsOrPaths) || urlsOrPaths.length === 0) return [];
    // Rozdziel na legacy URL (zostaw as-is) i PATH (batch signed URL)
    const result = new Array(urlsOrPaths.length).fill(null);
    const pathsToSign = [];
    const pathsIndices = [];
    for (let i = 0; i < urlsOrPaths.length; i++) {
      const v = urlsOrPaths[i];
      if (!v) continue;
      if (typeof v === 'string' && (v.startsWith('http://') || v.startsWith('https://'))) {
        result[i] = v; // legacy
      } else {
        pathsToSign.push(v);
        pathsIndices.push(i);
      }
    }
    if (pathsToSign.length > 0) {
      const signed = await window.storageSignedUrls(pathsToSign, bucket, expiresIn);
      for (let j = 0; j < signed.length; j++) {
        result[pathsIndices[j]] = signed[j];
      }
    }
    return result;
  };

  // ============================================================
  // v6.8: Image placeholder resolver — MutationObserver auto-hydration
  //
  // Renderery są synchroniczne i ich src musi przejść przez safeUrlAttr
  // (https + whitelist). Bare PATH zostałby odrzucony przez XSS sanitizer.
  //
  // Wzorzec: buildery emitują <img data-sp="PATH"> (lub <video data-sp>)
  // z przezroczystym placeholderem jako src. MutationObserver na document.body
  // wykrywa nowe [data-sp], batch-podpisuje przez storageSignedUrls i ustawia
  // .src. Idempotent — po hydration usuwamy data-sp (observer nie złapie 2x).
  //
  // DUAL MODE: legacy https URL renderowane jak dotychczas (przez safeUrlAttr,
  // bez data-sp). Tylko PATH (nowe uploady po W2 Step 2a) idą przez placeholder.
  //
  // Kill switch: window._spObserverEnabled = false wyłącza auto-hydration.
  // Ręczne API window._resolveStorageImgs(container) zachowane (idempotent).
  // ============================================================

  // Przezroczysty 1x1 SVG — placeholder zanim signed URL dojdzie
  var _SP_PLACEHOLDER = 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201%201%22%2F%3E';

  // Zwraca atrybuty src dla <img>/<video>: legacy https → src="<safe>",
  // PATH → data-sp + placeholder. '' = wartość nieufna/pusta (caller pomija).
  window._spImgSrc = function(urlOrPath) {
    if (!urlOrPath || typeof urlOrPath !== 'string') return '';
    if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
      var safe = window.safeUrlAttr ? window.safeUrlAttr(urlOrPath) : '';
      return safe ? 'src="' + safe + '"' : '';
    }
    return 'data-sp="' + window.escapeHtml(urlOrPath) + '" src="' + _SP_PLACEHOLDER + '"';
  };

  // ── Strategia 2b (2026-05-27): feed = thumb (display) + oryginał (klik/fallback) ──
  window.toThumbPath = function(path) {
    if (!path || typeof path !== 'string' || path.indexOf('http') === 0) return path; // legacy URL → bez thumba
    var m = path.match(/^([^/]+)\/(.+)\.[^.]+$/);
    return m ? m[1] + '/thumbs/' + m[2] + '.jpg' : path;
  };
  // Atrybuty img dla feedu: data-sp=thumb (hydracja), data-orig=oryginał (klik/onerror).
  window._spImgSrcThumb = function(origPath) {
    if (!origPath || typeof origPath !== 'string') return '';
    if (origPath.indexOf('http') === 0) {  // legacy https → render wprost, brak thumba
      var safe = window.safeUrlAttr ? window.safeUrlAttr(origPath) : '';
      return safe ? 'src="' + safe + '"' : '';
    }
    return 'data-sp="' + window.escapeHtml(window.toThumbPath(origPath)) + '" data-orig="' + window.escapeHtml(origPath) + '" src="' + _SP_PLACEHOLDER + '"';
  };
  // onerror: thumb brak (HEIF-skip/straggler) → załaduj oryginał (świeży signed URL). Guard 1×.
  window._spThumbFallback = function(img) {
    if (img._spfb) { img.onerror = null; img.style.display = 'none'; return; }
    img._spfb = true;
    var orig = img.getAttribute('data-orig');
    if (!orig) { img.onerror = null; img.style.display = 'none'; return; }
    img.onerror = function() {  // Strategia 5: oryginał padł → retry 1× po 2s (świeży signed URL), potem hide
      if (img._spRetried) { img.onerror = null; img.style.display = 'none'; return; }
      img._spRetried = true;
      setTimeout(function() {
        window.storageResolveUrl(orig).then(function(u) {
          var s = window.safeUrlAttr ? window.safeUrlAttr(u) : u;
          if (s) img.src = u; else { img.onerror = null; img.style.display = 'none'; }
        }).catch(function() { img.onerror = null; img.style.display = 'none'; });
      }, 2000);
    };
    window.storageResolveUrl(orig).then(function(u){ var s = window.safeUrlAttr ? window.safeUrlAttr(u) : u; if (s) img.src = u; else img.style.display = 'none'; }).catch(function(){ img.style.display = 'none'; });
  };
  // klik → ORYGINAŁ full-res (świeży signed URL).
  window._spOpenOrig = function(img) {
    var orig = img.getAttribute('data-orig');
    if (!orig) { if (img.src) window.open(img.src, '_blank'); return; }
    window.storageResolveUrl(orig).then(function(u){ if (u) window.open(u, '_blank'); });
  };

  // ── Upload z retry+backoff (2026-05-28): łagodzi transient throttle/breaker/network.
  // Permanent errors (RLS/too-large/mime/duplicate) → bez retry. Zwraca {data,error} jak upload().
  window.storageUploadRetry = async function(bucket, path, file, options, retries) {
    retries = retries || 3;
    var delays = [0, 1500, 4000];  // backoff: 0 / 1.5s / 4s
    var lastErr = null;
    for (var attempt = 0; attempt < retries; attempt++) {
      if (delays[attempt] > 0) await new Promise(function(r){ setTimeout(r, delays[attempt]); });
      try {
        var res = await sb.storage.from(bucket).upload(path, file, options);
        if (!res.error) return { data: res.data, error: null };
        lastErr = res.error;
        var msg = (res.error.message || '').toLowerCase();
        if (msg.includes('duplicate') || msg.includes('already exists') || msg.includes('permission') ||
            msg.includes('not authorized') || msg.includes('too large') || msg.includes('exceeded') || msg.includes('mime')) {
          return { data: null, error: res.error };  // permanent — bez retry
        }
        console.warn('[uploadRetry] ' + path + ' attempt ' + (attempt + 1) + ' failed:', res.error.message, '(retry)');
      } catch (e) {
        lastErr = { message: (e && e.message) || 'Network error' };
        console.warn('[uploadRetry] ' + path + ' attempt ' + (attempt + 1) + ' network err:', e && e.message);
      }
    }
    return { data: null, error: lastErr };
  };

  // Pełny <img> tag z DUAL MODE src. '' jeśli wartość nieufna/pusta.
  window._makeStorageImgTag = function(urlOrPath, className, extraStyles) {
    var attrs = window._spImgSrc(urlOrPath);
    if (!attrs) return '';
    return '<img ' + attrs + ' class="' + (className || '') + '" style="' + (extraStyles || '') + '">';
  };

  // v6.8 W2 Step 2b: walidacja PATH wiadomości głosowej PRZED createSignedUrl.
  // Akceptuje TYLKO "uuid/filename.<audio-ext>" — odrzuca URL-e (http/https),
  // schematy (javascript:), path traversal, obce rozszerzenia. Defense przy
  // playVoice (które dostaje wartość z onclick w trusted body).
  window._chatVoicePathValid = function(path) {
    if (!path || typeof path !== 'string') return false;
    // mp4 dodane: builder uploadVoiceMsg produkuje webm/ogg/mp4 (Safari=mp4) — regex musi je objąć
    return /^[a-f0-9-]{36}\/[\w._-]+\.(webm|mp3|ogg|m4a|mp4)$/i.test(path);
  };

  // v6.9 (2026-05-27): downscale image → JPEG blob (max maxDim px) PRZED uploadem.
  // Free-plan egress/storage opt. NIGDY nie rzuca — fallback resolve(file) gdy
  // nie-image / HEIF nie do zdekodowania (Android canvas) / już mały / brak zysku.
  window.downscaleImage = function(file, maxDim, quality) {
    maxDim = maxDim || 1600; quality = quality || 0.85;
    return new Promise(function(resolve) {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) { resolve(file); return; }
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function() {
        URL.revokeObjectURL(url);
        var scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        if (scale >= 1 && file.size < 300 * 1024) { resolve(file); return; }
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function(blob) {
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          resolve(blob);
        }, 'image/jpeg', quality);
      };
      img.onerror = function() { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  };

  // Przygotowanie pliku do uploadu — SSOT kompresji + strażnik rozmiaru.
  // Nieskompresowalny (wideo / HEIC-fail) i > maxRawBytes → {ok:false,tooBig}. Inaczej {ok,data,ext,contentType}.
  window.prepUpload = async function(file, maxDim, quality, maxRawBytes) {
    maxRawBytes = maxRawBytes || 15 * 1024 * 1024;
    var up = await window.downscaleImage(file, maxDim || 1600, quality || 0.85);
    var shrunk = up !== file;
    if (!shrunk && file.size > maxRawBytes) return { ok: false, tooBig: true };
    return { ok: true, data: up, ext: shrunk ? 'jpg' : (file.name.split('.').pop() || 'jpg'),
             contentType: shrunk ? 'image/jpeg' : file.type };
  };

  window._resolveStorageImgs = function(container, bucket = 'training-screenshots') {
    if (!container) return;
    const els = (container.querySelectorAll ? container.querySelectorAll('[data-sp]') : []); // <img> i <video>
    if (!els || els.length === 0) return;
    const paths = [];
    const elements = [];
    els.forEach(el => {
      const p = el.getAttribute('data-sp');
      if (p) { paths.push(p); elements.push(el); }
    });
    if (paths.length === 0) return;
    window.storageSignedUrls(paths, bucket, 21600).then(urls => {
      for (let i = 0; i < elements.length; i++) {
        const url = urls[i];
        const el = elements[i];
        if (!el || !el.isConnected) continue;
        el.removeAttribute('data-sp'); // idempotent — observer nie złapie 2x
        // Walidacja: signed URL = supabase host → przejdzie safeUrlAttr
        const safe = window.safeUrlAttr ? window.safeUrlAttr(url) : (url && url.startsWith('https://') ? url : '');
        if (safe) { el.src = url; }
        else if (el.getAttribute('data-orig') && window._spThumbFallback) { window._spThumbFallback(el); }
        else { el.style.display = 'none'; }
      }
    }).catch(e => { console.error('[_resolveStorageImgs] batch failed', e); });
  };

  // ── Strategia 4 (2026-05-27): LAZY hydration — signed URL dopiero gdy element
  // wjeżdża w viewport (IntersectionObserver). Feed nie ładuje wszystkich thumbów
  // naraz — tylko widoczne. Fallback: brak IO → eager _resolveStorageImgs.
  async function _spSignOne(el, bucket) {
    if (!el || !el.isConnected) return true; // znikł — przestań obserwować
    var path = el.getAttribute('data-sp');
    if (!path) return true;
    var url = await window.storageSignedUrl(path, bucket, 21600);
    if (!el.isConnected) return true;
    var safe = window.safeUrlAttr ? window.safeUrlAttr(url) : (url && url.indexOf('https://') === 0 ? url : '');
    if (safe) {
      el.removeAttribute('data-sp');  // sukces — dopiero teraz
      el.src = url;
      return true;
    }
    // sign FAIL — jeśli jest data-orig (thumb mógł nie istnieć) → fallback od razu
    if (el.getAttribute('data-orig') && window._spThumbFallback) {
      el.removeAttribute('data-sp');
      window._spThumbFallback(el);
      return true;
    }
    // brak fallbacku → NIE pal: zostaw data-sp, pozwól IO spróbować znów przy następnym przecięciu viewportu
    return false;
  }
  var _spIO = null;
  window._spLazyHydrate = function(container, bucket) {
    bucket = bucket || 'training-screenshots';
    if (!container || !container.querySelectorAll) return;
    var els = container.querySelectorAll('[data-sp]');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) { window._resolveStorageImgs(container, bucket); return; } // fallback eager
    if (!_spIO) {
      _spIO = new IntersectionObserver(function(entries){
        entries.forEach(function(e){
          if (e.isIntersecting) {
            _spSignOne(e.target, bucket).then(function(done){ if (done) _spIO.unobserve(e.target); });
          }
        });
      }, { rootMargin: '300px' });
    }
    els.forEach(function(el){ _spIO.observe(el); });
  };

  // Auto-hydration observer (debounce 50ms)
  window._spObserverEnabled = true;
  (function _initSpObserver() {
    let pending = null;
    const flush = () => { pending = null; if (window._spObserverEnabled) window._spLazyHydrate(document.body); };
    const schedule = () => { if (!pending) pending = setTimeout(flush, 50); };
    const start = () => {
      if (!document.body) { setTimeout(start, 50); return; }
      const obs = new MutationObserver((muts) => {
        if (!window._spObserverEnabled) return;
        for (const m of muts) {
          for (const node of m.addedNodes) {
            if (node.nodeType !== 1) continue;
            if ((node.matches && node.matches('[data-sp]')) || (node.querySelector && node.querySelector('[data-sp]'))) {
              schedule();
              return;
            }
          }
        }
      });
      obs.observe(document.body, { subtree: true, childList: true });
      schedule(); // initial — placeholdery obecne już przy load
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  })();

  // ── Monitoring błędów klienta → tabela client_errors (INSERT-only, RLS auth.uid()=user_id) ──
  //    Handler NIGDY nie rzuca (błąd w logowaniu przez onerror = pętla). Decyzja A: tylko zalogowani.
  (function _initClientErrorLog() {
    // 1. cache uid bez race (onAuthStateChange + prime getSession)
    try {
      sb.auth.onAuthStateChange(function(_e, s){ window._authUid = (s && s.user && s.user.id) || null; });
      sb.auth.getSession().then(function(r){
        window._authUid = (r && r.data && r.data.session && r.data.session.user && r.data.session.user.id) || null;
      }).catch(function(){});
    } catch (_) {}
    // 2. app_version best-effort z nazw cache SW (nie-PWA/stary browser → null)
    try {
      if (typeof caches !== 'undefined') {
        caches.keys().then(function(ks){
          var v = ks.find(function(k){ return k.indexOf('biegamy-') === 0; });
          window._appVersion = v ? v.replace(/-(static|runtime|storage)$/, '') : null;
        }).catch(function(){});
      }
    } catch (_) {}

    // 3. dedup + cap (w domknięciu, nie na window)
    var _seen = new Map();          // sygnatura message|source|lineno -> ts
    var _sentThisLoad = 0;
    var CAP = 10;

    // 4. insert best-effort — całość w try/catch, self-swallow, NIGDY nie rzuca
    function _logClientError(o){
      try {
        if (!window._authUid) return;                       // anon/wczesny → pomiń (decyzja A)
        if (_sentThisLoad >= CAP) return;                   // cap 10/load
        var sig = [o.message, o.source, o.lineno].join('|');
        var now = Date.now();
        if (_seen.has(sig) && (now - _seen.get(sig) < 60000)) return;   // dedup 60s
        _seen.set(sig, now);
        _sentThisLoad++;
        sb.from('client_errors').insert({
          user_id: window._authUid,
          url: (location.pathname + location.search).slice(0, 990),
          kind: o.kind,
          message: String(o.message || '').slice(0, 1900),
          source: String(o.source || '').slice(0, 990),
          lineno: (o.lineno != null ? o.lineno : null),
          colno:  (o.colno  != null ? o.colno  : null),
          stack: String(o.stack || '').slice(0, 4000),
          user_agent: String(navigator.userAgent || '').slice(0, 500),
          app_version: window._appVersion || null
        }).then(function(){}, function(){});                // self-swallow (reject handler pusty, NIE await/.catch)
      } catch (_) {}
    }

    // 5. handlery — addEventListener (addytywny, nie nadpisuje window.onerror=)
    window.addEventListener('error', function(e){
      if (!e.message && !e.error) return;                   // resource 404 (<img>/<script>) — nie JS-error, nie zaśmiecaj
      _logClientError({ kind:'error', message:e.message, source:e.filename, lineno:e.lineno, colno:e.colno, stack: e.error && e.error.stack });
    });
    window.addEventListener('unhandledrejection', function(e){
      var r = e.reason;
      _logClientError({ kind:'unhandledrejection', message:(r && r.message) || String(r), source:null, lineno:null, colno:null, stack: r && r.stack });
    });
  })();
})();

/* ===== BANERY (WIZUAL E3): rotacja tygodniowa hero-banerow ===== */
/* LUK-TYGODNIA: strony 'tydzien' = 7 scen wg dnia (pn=01..nd=07, 08rez poza rotacja). */
/* trener = rolujaca %6. img.onerror -> hero znika (deploy odporny na brak pliku).      */
/* Flota w MAIN repo assets/ui/banery (sciezka wzgledna, NIE assetUrl/biegamy-assets).  */
window.BANERY = (function(){
  var FLOTA = { login:'tydzien', index:'tydzien', races:'tydzien', wyzwania:'tydzien', statystyki:'tydzien', odznaki:'tydzien', radio:'tydzien', trener:6 };
  var d = new Date();
  var dayNum = Math.floor((d.getTime() - d.getTimezoneOffset()*60000)/86400000);
  function src(page){
    var n = FLOTA[page]; if(!n) return null;
    var idx = (n==='tydzien') ? ((d.getDay()+6)%7 + 1) : (dayNum % n + 1);
    return 'assets/ui/banery/baner-' + page + '-' + String(idx).padStart(2,'0') + '.webp';
  }
  function hero(page, tytul, podtytul){
    var s = src(page); if(!s) return null;
    if(!document.getElementById('banery-css')){
      var st = document.createElement('style'); st.id='banery-css';
      st.textContent = '.banery-hero{position:relative;height:172px;border-radius:16px;overflow:hidden;margin:8px 16px 16px;background:var(--bg2,#0d0b12)}'
        + '.banery-hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 38%}'
        + '.banery-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,11,18,.18) 0%,rgba(13,11,18,0) 38%,rgba(13,11,18,.84) 100%)}'
        + '.banery-tyt{position:absolute;left:16px;bottom:10px;z-index:2;font-family:"Bebas Neue",sans-serif;font-size:30px;letter-spacing:1.5px;color:#fff;line-height:1;text-shadow:0 2px 12px rgba(0,0,0,.55)}'
        + '.banery-pod{position:absolute;left:16px;bottom:44px;z-index:2;font-family:"DM Mono",monospace;font-size:10px;letter-spacing:.6px;color:rgba(255,255,255,.78);text-transform:uppercase}';
      document.head.appendChild(st);
    }
    var el = document.createElement('div'); el.className='banery-hero';
    var img = document.createElement('img'); img.src=s; img.alt='';
    img.onerror = function(){ el.remove(); };
    el.appendChild(img);
    if(podtytul){ var p=document.createElement('div'); p.className='banery-pod'; p.textContent=podtytul; el.appendChild(p); }
    var t = document.createElement('div'); t.className='banery-tyt'; t.textContent = tytul || ''; el.appendChild(t);
    return el;
  }
  function mount(sel, page, tytul, podtytul){
    var host = document.querySelector(sel); if(!host) return;
    var el = hero(page, tytul, podtytul); if(el) host.appendChild(el);
  }
  return { src:src, hero:hero, mount:mount, _dayNum:dayNum };
})();

/* ===== PUSTKA v1 (WIZUAL E4-P2): ilustrowane puste stany ===== */
/* dekoruj(temat, html): obraz pustki NAD oryginalnym komunikatem.  */
/* img onerror=remove -> brak pliku = stan wyglada jak dotad.       */
window.PUSTKA = (function(){
  function css(){
    if(document.getElementById('pustka-css')) return;
    var st=document.createElement('style'); st.id='pustka-css';
    st.textContent='.pustka-box{text-align:center}.pustka-box>img{width:128px;height:128px;object-fit:cover;border-radius:22px;display:block;margin:14px auto 2px;opacity:.92}';
    document.head.appendChild(st);
  }
  function dekoruj(temat, html){
    css();
    return '<div class="pustka-box"><img src="assets/ui/pustki/pustka-'+temat+'.webp" alt="" loading="lazy" onerror="this.remove()">'+(html||'')+'</div>';
  }
  return { dekoruj:dekoruj };
})();

/* ===== SOLO v1 (DOPASOWANIE): wybor kadru dnia wg treningu i pogody ===== */
/* Wymog Filipa: wszystkie kadry uzyte, ale zero konfliktow (upal->deszcz). */
/* 55% preferencji kontekstu / 45% wolny los; anty-powtorka 10; fallback = rotacja. */
window.SOLO = (function(){
  var TAGI = { 3:{p:'deszcz'},6:{p:'snieg'},11:{t:'regeneracja'},12:{p:'deszcz'},15:{p:'wiatr'},
    19:{t:'regeneracja'},20:{t:'dlugie'},28:{p:'upal'},
    31:{t:'interwaly'},32:{t:'interwaly'},33:{t:'interwaly'},34:{t:'tempo'},35:{t:'tempo'},
    36:{t:'regeneracja'},37:{t:'regeneracja'},38:{t:'regeneracja'},39:{t:'regeneracja'},40:{t:'regeneracja'},
    41:{t:'dlugie'},42:{t:'dlugie'},43:{t:'dlugie'},44:{t:'silownia'},45:{t:'silownia'},
    46:{p:'deszcz'},47:{p:'deszcz'},48:{p:'deszcz'},49:{p:'snieg'},50:{p:'snieg'},51:{p:'snieg'},
    52:{p:'upal'},53:{p:'upal'},54:{p:'upal'},55:{p:'wiatr'},56:{p:'wiatr'},57:{p:'mgla'},58:{p:'mgla'},
    59:{t:'tempo'},60:{t:'interwaly'} };
  var WYKL = { upal:['deszcz','snieg'], deszcz:['upal','snieg'], snieg:['upal','deszcz'], mgla:['upal'] };
  function pogoda(){
    try{
      for(var i=0;i<sessionStorage.length;i++){
        var k=sessionStorage.key(i); if(!k||k.indexOf('weather:')!==0) continue;
        var c=JSON.parse(sessionStorage.getItem(k)||'null');
        var d=c&&c.data&&c.data.days&&c.data.days[0]; if(!d) continue;
        var wc=+d.weather_code||0, t=+(d.temp_max!=null?d.temp_max:(d.tmax!=null?d.tmax:d.temp))||null;
        if((wc>=71&&wc<=77)||wc===85||wc===86) return 'snieg';
        if((wc>=51&&wc<=67)||(wc>=80&&wc<=82)||wc>=95||(+d.precip_pct||0)>=60) return 'deszcz';
        if(wc===45||wc===48) return 'mgla';
        if(t!=null&&t>=25) return 'upal';
        return null;
      }
    }catch(e){}
    return null;
  }
  function typ(){
    var v='';
    try{ v=(window._todayTraining&&window._todayTraining.training_type)||''; }catch(e){}
    if(!v){ try{var c=JSON.parse(localStorage.getItem('solo_typ')||'null');
      var dz=new Date(); dz=new Date(dz.getTime()-dz.getTimezoneOffset()*60000).toISOString().slice(0,10);
      if(c&&c.d===dz) v=c.t||''; }catch(e){} }
    v=String(v).toLowerCase();
    if(/interwa|powtorzen|szybk/.test(v)) return 'interwaly';
    if(/regener|spokoj|rozbieg|trucht/.test(v)) return 'regeneracja';
    if(/dlug|wybieg/.test(v)) return 'dlugie';
    if(/tempo|prog|bc2|bc3/.test(v)) return 'tempo';
    if(/sil|gym|wzmacn/.test(v)) return 'silownia';
    return null;
  }
  function rnd(seed){ seed=(seed^61)^(seed>>>16); seed=(seed+(seed<<3))|0; seed^=seed>>>4;
    seed=(seed*0x27d4eb2d)|0; seed^=seed>>>15; return ((seed>>>0)%10000)/10000; }
  function dopasuj(N, dayNum){
    var salt=0; try{ salt=+localStorage.getItem('solo_salt')||0;
      if(!salt){ salt=1+Math.floor(Math.random()*999983); localStorage.setItem('solo_salt',String(salt)); } }catch(e){}
    var hist=[]; try{ hist=JSON.parse(localStorage.getItem('solo_hist')||'[]'); }catch(e){}
    var pog=pogoda(), tt=typ();
    var pula=[], pref=[];
    for(var n=1;n<=N;n++){
      var tg=TAGI[n]||{};
      if(pog&&WYKL[pog]&&tg.p&&WYKL[pog].indexOf(tg.p)>=0) continue;   /* twarde wykluczenie */
      if(hist.indexOf(n)>=0) continue;                                  /* anty-powtorka */
      pula.push(n);
      if((tt&&tg.t===tt)||(pog&&tg.p===pog)) pref.push(n);
    }
    if(!pula.length) pula=[dayNum%N+1];
    var r1=rnd(dayNum*2654435761+salt), r2=rnd(dayNum*40503+salt*7);
    var zbior=(pref.length&&r1<0.55)?pref:pula;
    var nn=zbior[Math.floor(r2*zbior.length)%zbior.length];
    try{ hist.push(nn); while(hist.length>10) hist.shift();
      localStorage.setItem('solo_hist',JSON.stringify(hist)); }catch(e){}
    return nn;
  }
  return { dopasuj:dopasuj, _pogoda:pogoda, _typ:typ };
})();

// ════════════════════════════════════════════════════════════════════
// SHARECARD — panel karty do udostępnienia (własne tło + Udostępnij)
// ════════════════════════════════════════════════════════════════════
// Współdzielony przez zawodnik.html i kalendarz.html. Wcześniej żył w jednym
// pliku; wyniesiony tutaj, żeby poprawka kadrownika nie musiała trafiać w dwa
// miejsca — ten sam błąd co przy pace (6 kopii) i przy logice czatu.
//
//   SHARECARD.mount(slotId, log, { mozeEdytowac })
//
// log — obiekt z listy strony (musi mieć id, distance_km, card_bg_url).
//   Komponent MUTUJE log.card_bg_url po zmianie tła i przerysowuje panel.
//   To celowe: strona trzyma ten sam obiekt w swojej liście, więc zostaje
//   zsynchronizowana bez callbacku.
// mozeEdytowac — steruje WYŁĄCZNIE sekcją tła (dodaj/zmień/usuń).
//   Przycisk „Udostępnij" jest widoczny zawsze: trener ma prawo wygenerować
//   kartę podopiecznego, EF mu na to pozwala (403 dotyczy wyłącznie obcych).
//
// ZDARZENIA: wyłącznie addEventListener, ZERO inline onclick i zero funkcji
// eksportowanych na window. Pierwsza wersja używała onclick w innerHTML —
// handlery były na window i widoczne w konsoli (typeof === 'function'), przycisk
// istniał, a kliknięcie nie odpalało niczego. Inline handler zależy od
// rozwiązywania nazw w zasięgu globalnym i od tego, że nikt po drodze nie zjada
// zdarzenia; addEventListener wiąże funkcję bezpośrednio z węzłem i usuwa całą
// tę klasę awarii naraz.
window.SHARECARD = (function () {
  // Strefy tekstu na karcie — te same, na których mierzyliśmy bibliotekę teł.
  const STREFY = [
    { nazwa: 'logo',      x: 60, y: 100, w: 360, h: 130 },
    { nazwa: 'tozsamosc', x: 60, y: 340, w: 580, h: 130 },
    { nazwa: 'dystans',   x: 60, y: 490, w: 640, h: 310 },
  ];
  // Kolejne stopnie przyciemnienia: [siła lewego gradientu, jego zasięg w szerokości].
  const STOPNIE = [[0.88,0.66],[0.93,0.70],[0.96,0.74],[0.975,0.78],[0.985,0.82]];
  const PROG = 38;

  let _stan = { logId: null, momentId: null, slotId: null, log: null, mozeEdytowac: true, onZamkniecie: null };
  let _crop = null;
  let _podgladUrl = null;
  let _plik = null;
  let _url = null;

  function powiadom(msg) {
    if (typeof window.toast === 'function') window.toast(msg);
    else console.warn('[SHARECARD]', msg);
  }

  // _stan ustawiany przy KLIKNIĘCIU, nie przy mount(). Dzięki temu jedna strona może
  // mieć wiele slotów (lista pięciu logów w „Dziś") — każdy przycisk domyka się nad
  // SWOIM logiem i dopiero klik przełącza stan komponentu. Naraz i tak otwarty jest
  // jeden podgląd, więc jeden _stan wystarcza; mapa stanów byłaby przebudową dotykającą
  // kalendarza i edycji, gdzie slot jest jeden i wszystko działa.
  //
  // opts.mozeEdytowac — czy w PODGLĄDZIE pokazać „Zmień tło" i „Usuń własne tło".
  // opts.kompakt      — wariant inline (bez ramki i pełnej szerokości), do wpięcia
  //                     w rząd istniejącej karty; wygląd inny, więc osobna opcja,
  //                     w odróżnieniu od mozeEdytowac:false, które daje ten sam efekt
  //                     co ewentualne „tylkoKarta" i dlatego nie doczekało się nazwy.
  function mount(slotId, log, opts) {
    const slot = document.getElementById(slotId);
    if (!slot) return;
    // EF odbija log bez distance_km błędem 422 — gasimy panel zamiast pokazywać błąd.
    if (!log || !log.id || log.distance_km == null) { slot.innerHTML = ''; return; }
    const mozeEdytowac = !opts || opts.mozeEdytowac !== false;
    const kompakt = !!(opts && opts.kompakt);

    // Sekcja tła zniknęła z panelu: zmiana i usuwanie żyją w PODGLĄDZIE, gdzie widać
    // efekt. Jedno miejsce zamiast dwóch.
    slot.innerHTML = kompakt
      ? '<button type="button" data-sc="share" style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-family:DM Mono,monospace;color:var(--accent);background:none;letter-spacing:0.08em;border:1px solid rgba(212,80,26,0.3);padding:3px 10px;border-radius:6px;cursor:pointer;">Zobacz kartę</button>'
      : '<div style="border:1px solid var(--border);border-radius:12px;padding:12px;">'
        + '<button type="button" data-sc="share" class="btn btn-primary btn-sm" style="width:100%;">Zobacz kartę</button>'
        + '</div>';

    const bShare = slot.querySelector('[data-sc="share"]');
    if (bShare) bShare.addEventListener('click', function (e) {
      e.stopPropagation();                 // karta logu w „Dziś" ma własny onclick → editLog
      _stan = { logId: log.id, slotId: slotId, log: log, mozeEdytowac: mozeEdytowac };
      przygotujKarte(bShare);
    });
  }

  function przerysuj() {
    if (_stan.slotId && _stan.log) mount(_stan.slotId, _stan.log, { mozeEdytowac: _stan.mozeEdytowac });
  }

  // ── A. WŁASNE TŁO ───────────────────────────────────────────────
  // Input tworzony doraźnie zamiast ukrytego w panelu: dzięki temu „Zmień tło" działa
  // także z nakładki podglądu, gdzie panelu nie ma. Przy okazji znika footgun PWA —
  // świeży element nie potrzebuje resetu value, żeby drugi wybór tego samego pliku
  // odpalił change.
  function wybierzPlik(zPodgladu) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      const file = inp.files && inp.files[0];
      inp.remove();
      if (!file) return;
      const img = new Image();
      img.onload = function () { otworzKadrownik(img, !!zPodgladu); };
      img.onerror = function () { powiadom('Nie udało się otworzyć zdjęcia'); };
      img.src = URL.createObjectURL(file);
    });
    inp.click();
  }

  // Kadrownik: ramka 4:5, przesuwanie palcem, zoom szczypaniem albo suwakiem.
  function otworzKadrownik(img, zPodgladu) {
    const szer = Math.min(window.innerWidth - 40, 380);
    const wys = Math.round(szer * 1.25);
    const ov = document.createElement('div');
    ov.id = 'cb-crop';
    // 9700: NAD podglądem karty (9500), POD toastem (9999) i confetti (9998).
    // Zmierzone, nie zgadnięte — pasmo 9500–9999 jest poza tym puste w obu stronach.
    ov.style.cssText = 'position:fixed;inset:0;z-index:9700;background:rgba(0,0,0,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px;';
    ov.innerHTML =
      '<div style="font-size:12px;color:var(--muted);font-family:DM Mono,monospace;">Przesuń i przybliż — kadr 4:5</div>'
      + '<canvas data-sc="canvas" width="' + szer + '" height="' + wys + '" style="border-radius:12px;touch-action:none;background:#000;"></canvas>'
      + '<input type="range" data-sc="zoom" min="100" max="300" value="100" style="width:' + szer + 'px;">'
      + '<div style="display:flex;gap:10px;">'
      + '<button type="button" data-sc="anuluj" class="btn btn-ghost btn-sm">Anuluj</button>'
      + '<button type="button" data-sc="ok" class="btn btn-primary btn-sm">Użyj tego kadru</button>'
      + '</div>'
      + '<div data-sc="stan" style="font-size:11px;color:var(--muted);font-family:DM Mono,monospace;min-height:15px;text-align:center;line-height:1.5;"></div>';
    document.body.appendChild(ov);

    const c = ov.querySelector('[data-sc="canvas"]');
    const suwak = ov.querySelector('[data-sc="zoom"]');
    const ctx = c.getContext('2d');
    const bazowa = Math.max(szer / img.width, wys / img.height);   // cover
    const st = { skala: bazowa, x: 0, y: 0, img: img, bazowa: bazowa, szer: szer, wys: wys, ov: ov, zPodgladu: !!zPodgladu };
    _crop = st;

    function ogranicz() {
      const w = img.width * st.skala, h = img.height * st.skala;
      st.x = Math.min(0, Math.max(szer - w, st.x));
      st.y = Math.min(0, Math.max(wys - h, st.y));
    }
    function rysuj() {
      ogranicz();
      ctx.clearRect(0, 0, szer, wys);
      ctx.drawImage(img, st.x, st.y, img.width * st.skala, img.height * st.skala);
    }
    st.x = (szer - img.width * bazowa) / 2;
    st.y = (wys - img.height * bazowa) / 2;
    rysuj();

    ov.querySelector('[data-sc="anuluj"]').addEventListener('click', zamknijKadrownik);
    ov.querySelector('[data-sc="ok"]').addEventListener('click', function () { zatwierdzKadr(ov); });

    let ostatni = null, dystStart = 0, skalaStart = 0;
    function srodek(t){ return { x:(t[0].clientX+t[1].clientX)/2, y:(t[0].clientY+t[1].clientY)/2 }; }
    function dyst(t){ return Math.hypot(t[0].clientX-t[1].clientX, t[0].clientY-t[1].clientY); }
    c.addEventListener('pointerdown', function(e){ c.setPointerCapture(e.pointerId); ostatni = { x:e.clientX, y:e.clientY }; });
    c.addEventListener('pointermove', function(e){
      if (!ostatni || (e.buttons === 0 && e.pointerType === 'mouse')) return;
      st.x += e.clientX - ostatni.x; st.y += e.clientY - ostatni.y;
      ostatni = { x:e.clientX, y:e.clientY }; rysuj();
    });
    c.addEventListener('pointerup', function(){ ostatni = null; });
    c.addEventListener('touchstart', function(e){
      if (e.touches.length === 2) { ostatni = null; dystStart = dyst(e.touches); skalaStart = st.skala; }
    }, { passive:true });
    c.addEventListener('touchmove', function(e){
      if (e.touches.length !== 2 || !dystStart) return;
      e.preventDefault();
      const k = dyst(e.touches) / dystStart;
      const nowa = Math.max(bazowa, Math.min(bazowa * 3, skalaStart * k));
      const s = srodek(e.touches), r = c.getBoundingClientRect();
      const px = s.x - r.left, py = s.y - r.top;
      st.x = px - (px - st.x) * (nowa / st.skala);
      st.y = py - (py - st.y) * (nowa / st.skala);
      st.skala = nowa;
      suwak.value = Math.round(nowa / bazowa * 100);
      rysuj();
    }, { passive:false });
    suwak.addEventListener('input', function(){
      const nowa = bazowa * (parseInt(this.value, 10) / 100);
      const px = szer / 2, py = wys / 2;
      st.x = px - (px - st.x) * (nowa / st.skala);
      st.y = py - (py - st.y) * (nowa / st.skala);
      st.skala = nowa; rysuj();
    });
  }

  function zamknijKadrownik() {
    const ov = document.getElementById('cb-crop'); if (ov) ov.remove();
    _crop = null;
  }

  // Luminancja wg BT.709 — ta sama, na której mierzyliśmy bibliotekę teł.
  function jasnosc(ctx, s) {
    const d = ctx.getImageData(s.x, s.y, s.w, s.h).data;
    let suma = 0;
    for (let i = 0; i < d.length; i += 4) suma += 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
    return suma / (d.length / 4);
  }

  function gradientBazowy(ctx, W, H, sila, zasieg) {
    const g1 = ctx.createLinearGradient(0, 0, W * zasieg, 0);
    g1.addColorStop(0, 'rgba(7,7,10,' + sila + ')');
    g1.addColorStop(1, 'rgba(7,7,10,0)');
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W * zasieg, H);
    const g2 = ctx.createLinearGradient(0, 810, 0, H);
    g2.addColorStop(0, 'rgba(7,7,10,0)');
    g2.addColorStop(1, 'rgba(7,7,10,0.70)');
    ctx.fillStyle = g2; ctx.fillRect(0, 810, W, H - 810);
  }

  // Jeden CIĄGŁY scrim — IDENTYCZNY z tym, który rysuje EF, żeby podgląd nie kłamał.
  // Poprzednio były dwie wstęgi (290–500 i 850–1130): na fotografii z fakturą wtapiały
  // się, ale na gładkim tle ich krawędzie czytały się jako doklejone prostokąty.
  // Bez powrotów do zera nie ma czego zobaczyć — czyta się jak winietowanie.
  function scrim(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0,        'rgba(7,7,10,0.76)');   // logo i tożsamość
    g.addColorStop(700 / H,  'rgba(7,7,10,0.40)');   // dystans — biały Bebas 210 px zniesie najwięcej
    g.addColorStop(900 / H,  'rgba(7,7,10,0.48)');
    g.addColorStop(1,        'rgba(7,7,10,0.72)');   // statystyki i stopka
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  async function zatwierdzKadr(ov) {
    const st = _crop; if (!st) return;
    const btn = ov.querySelector('[data-sc="ok"]'), stan = ov.querySelector('[data-sc="stan"]');
    btn.disabled = true; stan.textContent = 'Przetwarzam…';
    const W = 1080, H = 1350, k = W / st.szer;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });

    // Adaptacyjne przyciemnienie: eskalujemy siłę, aż wszystkie strefy zejdą pod próg.
    let uzyty = 0;
    for (let i = 0; i < STOPNIE.length; i++) {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(st.img, st.x * k, st.y * k, st.img.width * st.skala * k, st.img.height * st.skala * k);
      gradientBazowy(ctx, W, H, STOPNIE[i][0], STOPNIE[i][1]);
      uzyty = i;
      if (STREFY.every(function(s){ return jasnosc(ctx, s) <= PROG; })) break;
    }
    // Scrim NIE jest wypalany w pliku — służy wyłącznie do POMIARU. EF dokłada go
    // przy renderze, więc wypalenie dałoby scrim dwa razy: przy kryciu 0,76 u góry
    // efektywnie ~0,94, czyli niemal czerń. Mierzymy na kopii, wgrywamy oryginał
    // z samym gradientem bazowym — i wtedy pomiar odpowiada dokładnie temu, co
    // zobaczy użytkownik na karcie.
    const pomiar = document.createElement('canvas');
    pomiar.width = W; pomiar.height = H;
    const pctx = pomiar.getContext('2d', { willReadFrequently: true });
    pctx.drawImage(c, 0, 0);
    scrim(pctx, W, H);

    // Twarda odmowa: lepiej nie wypuścić karty niż wypuścić nieczytelną z naszym logo.
    if (jasnosc(pctx, STREFY[1]) > PROG) {
      btn.disabled = false; stan.textContent = '';
      zamknijKadrownik();
      powiadom('To zdjęcie jest za jasne tam, gdzie stoi imię. Spróbuj innego kadru.');
      return;
    }

    stan.textContent = 'Wgrywam…';
    const blob = await new Promise(function(r){ c.toBlob(r, 'image/jpeg', 0.86); });
    const uid = window._authUid;
    if (!blob || !uid || !_stan.logId) { btn.disabled = false; stan.textContent = ''; powiadom('Nie udało się przygotować pliku'); return; }
    const sciezka = uid + '/' + _stan.logId + '.jpg';
    const { error: upErr } = await window.storageUploadRetry('card-bg', sciezka, blob, { upsert: true, contentType: 'image/jpeg' });
    if (upErr) { btn.disabled = false; stan.textContent = ''; powiadom('Nie udało się wgrać tła'); return; }
    const { data: urlData } = window.sb.storage.from('card-bg').getPublicUrl(sciezka);
    const url = urlData.publicUrl + '?t=' + Date.now();   // nowy hash w EF → nowa karta, stare linki żyją
    const { error: dbErr } = await window.sb.from('training_logs').update({ card_bg_url: url }).eq('id', _stan.logId);
    if (dbErr) { btn.disabled = false; stan.textContent = ''; powiadom('Nie udało się zapisać tła'); return; }

    if (_stan.log) _stan.log.card_bg_url = url;   // ten sam obiekt co w liście strony
    const zPodgladu = st.zPodgladu;
    zamknijKadrownik();
    przerysuj();
    powiadom('Tło karty ustawione ✓' + (uzyty > 0 ? ' (przyciemnione)' : ''));
    // Wejście z podglądu: nakładka ZOSTAJE otwarta i przerysowuje się nową kartą.
    // Nowy ?t= w URL-u daje nowy hash8, więc EF wyrenderuje kartę od nowa,
    // a stara zostaje pod swoim kluczem — zgodnie z zasadą o żywych linkach.
    if (zPodgladu) await odswiezPodglad();
  }

  async function usunTlo(btn, zPodgladu) {
    if (!_stan.logId || !window._authUid) return;
    btn.disabled = true;
    await window.sb.storage.from('card-bg').remove([window._authUid + '/' + _stan.logId + '.jpg']);
    const { error } = await window.sb.from('training_logs').update({ card_bg_url: null }).eq('id', _stan.logId);
    if (error) { btn.disabled = false; powiadom('Nie udało się usunąć tła'); return; }
    if (_stan.log) _stan.log.card_bg_url = null;
    przerysuj();
    powiadom('Tło usunięte — karta wróci do domyślnego');
    if (zPodgladu) await odswiezPodglad();
  }

  // ── B. ZOBACZ KARTĘ → UDOSTĘPNIJ ────────────────────────────────
  // Krok 1 robi CAŁĄ pracę (render w EF + pobranie pliku) i otwiera podgląd.
  // Krok 2 — przycisk share W NAKŁADCE — jest czystym gestem, bo plik leży już
  // w pamięci, zanim nakładka się pojawi. To zarazem rozwiązanie problemu iOS,
  // który blokuje navigator.share, gdy między gestem a wywołaniem jest await.
  function pokazPodglad(blob) {
    if (_podgladUrl) URL.revokeObjectURL(_podgladUrl);
    _podgladUrl = URL.createObjectURL(blob);
    const szer = Math.min(window.innerWidth - 48, 340);
    const ov = document.createElement('div');
    ov.id = 'sc-podglad';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:20px;';
    ov.innerHTML =
      '<img src="' + _podgladUrl + '" alt="" style="width:' + szer + 'px;max-height:72vh;object-fit:contain;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.6);">'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">'
      + '<button type="button" data-sc="zamknij" class="btn btn-ghost btn-sm">Zamknij</button>'
      + (_stan.mozeEdytowac ? '<button type="button" data-sc="zmien" class="btn btn-ghost btn-sm">Zmień tło</button>' : '')
      + '<button type="button" data-sc="udostepnij" class="btn btn-primary btn-sm">Udostępnij ↗</button>'
      + '</div>'
      + (_stan.mozeEdytowac && _stan.log && _stan.log.card_bg_url
          ? '<button type="button" data-sc="usun" style="background:none;border:none;color:var(--muted);font-size:11px;font-family:DM Mono,monospace;cursor:pointer;text-decoration:underline;">Usuń własne tło</button>'
          : '')
      + '<div data-sc="stanPodgladu" style="font-size:11px;color:var(--muted);font-family:DM Mono,monospace;min-height:15px;"></div>';
    document.body.appendChild(ov);
    ov.querySelector('[data-sc="zamknij"]').addEventListener('click', zamknijPodglad);
    ov.querySelector('[data-sc="udostepnij"]').addEventListener('click', udostepnij);
    const bZmien = ov.querySelector('[data-sc="zmien"]');
    if (bZmien) bZmien.addEventListener('click', function () { wybierzPlik(true); });
    const bUsun = ov.querySelector('[data-sc="usun"]');
    if (bUsun) bUsun.addEventListener('click', function () { usunTlo(bUsun, true); });
  }

  function zamknijPodglad() {
    const o = document.getElementById('sc-podglad'); if (o) o.remove();
    if (_podgladUrl) { URL.revokeObjectURL(_podgladUrl); _podgladUrl = null; }
    // shown_at ustawia się przy ZAMKNIĘCIU, nie przy otwarciu: dopóki karta jest na ekranie,
    // moment nie jest „zobaczony". Callback odpala się dokładnie raz — zerujemy go PRZED
    // wywołaniem, więc podwójny klik w „Zamknij" nie zrobi dwóch zapisów.
    if (_stan.onZamkniecie) {
      const cb = _stan.onZamkniecie; _stan.onZamkniecie = null;
      try { cb(); } catch (e) { console.error('[SHARECARD] onZamkniecie:', e); }
    }
  }

  // Wspólne dla pierwszego otwarcia podglądu i odświeżenia po zmianie tła.
  // Zwraca blob karty albo null; NIE dotyka UI.
  async function pobierzKarte() {
    const { data: { session } } = await window.sb.auth.getSession();
    if (!session) throw new Error('brak sesji');
    const fnUrl = (window.SB_FN_URL || (window.SB_URL + '/functions/v1')) + '/share-card';
    // Karta momentu idzie INNĄ ścieżką w EF: {moment_id} zamiast {log_id}. Autoryzacja liczy
    // się tam po wierszu momentu, nie po logu — właściciel dostaje 403 dla momentu, którego
    // trener nie zatwierdził. Klient tego nie zakłada, tylko obsługuje (patrz pokazMoment).
    const cialo = _stan.momentId ? { moment_id: _stan.momentId } : { log_id: _stan.logId };
    const res = await fetch(fnUrl, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify(cialo)
    });
    const d = await res.json().catch(function () { return null; });
    if (!res.ok || !d || !d.url) {
      const err = new Error('ef');
      err.status = res.status;          // 403 = strukturalne (nie ma po co ponawiać), reszta = przejściowe
      throw err;
    }
    _url = d.url;
    return await (await fetch(d.url)).blob();
  }

  async function przygotujKarte(btn) {
    if (!_stan.logId) { powiadom('Brak treningu do wygenerowania'); return; }
    btn.disabled = true;
    btn.textContent = 'Renderuję kartę…';
    // Pierwsza karta to cold start EF plus render — bez tej podpowiedzi wygląda
    // na zawieszenie. Kolejne wywołania dla tego samego logu idą z cache.
    // Próg 2500 ms wynika z POMIARU: ciepły render 1,74–1,82 s, zimny 3,42 s,
    // cache 0,73 s. Przy 1500 ms dopisek wyskakiwałby przy KAŻDEJ karcie i kłamał.
    const dopisek = setTimeout(function () {
      if (btn.disabled) {
        btn.innerHTML = 'Renderuję kartę…'
          + '<span style="display:block;font-size:9px;opacity:0.75;margin-top:2px;">Pierwsza karta trwa dłużej</span>';
      }
    }, 2500);
    try {
      const blob = await pobierzKarte();
      _plik = new File([blob], 'biegamy-karta.png', { type: 'image/png' });
      pokazPodglad(blob);
    } catch (e) {
      powiadom('Nie udało się przygotować karty');
    } finally {
      clearTimeout(dopisek);
      btn.disabled = false;
      btn.textContent = 'Zobacz kartę';
    }
  }

  // Po zmianie tła: nowy hash → nowa karta. Podgląd ma się PRZERYSOWAĆ, nie zamknąć —
  // użytkownik ma zobaczyć efekt swojej zmiany bez klikania od nowa.
  async function odswiezPodglad() {
    const ov = document.getElementById('sc-podglad');
    if (!ov) return;
    const img = ov.querySelector('img');
    const info = ov.querySelector('[data-sc="stanPodgladu"]');
    if (info) info.textContent = 'Renderuję nową kartę…';
    try {
      const blob = await pobierzKarte();
      _plik = new File([blob], 'biegamy-karta.png', { type: 'image/png' });
      if (_podgladUrl) URL.revokeObjectURL(_podgladUrl);
      _podgladUrl = URL.createObjectURL(blob);
      img.src = _podgladUrl;
      if (info) info.textContent = '';
    } catch (e) {
      if (info) info.textContent = '';
      powiadom('Nie udało się odświeżyć karty');
    }
  }

  function udostepnij() {
    // canShare sprawdzamy PRZED wywołaniem — brak wsparcia dla plików to nie
    // wyjątek, tylko normalny stan przeglądarki.
    if (_plik && navigator.canShare && navigator.canShare({ files: [_plik] })) {
      navigator.share({ files: [_plik] }).catch(function(e){
        if (e && e.name === 'AbortError') return;   // użytkownik anulował — to nie błąd
        powiadom('Nie udało się udostępnić');
      });
      return;
    }
    const a = document.createElement('a');
    a.href = _url; a.download = 'biegamy-karta.png';
    document.body.appendChild(a); a.click(); a.remove();
    powiadom('Karta zapisana');
  }

  // Karta MOMENTU (kamień milowy) — bez slotu i bez przycisku, wołana z banera w „Dziś".
  // Własne tło świadomie niedostępne: kamień dotyczy setek treningów, nie jednego, więc nie
  // ma naturalnego zdjęcia do podpięcia (decyzja Filipa 6/8).
  async function pokazMoment(momentId, onZamkniecie) {
    if (!momentId) return;
    _stan = { logId: null, momentId: momentId, slotId: null, log: null, mozeEdytowac: false, onZamkniecie: onZamkniecie || null };

    // Render trwa 1,8–4,6 s, więc klik musi od razu coś pokazać — inaczej wygląda na martwy
    // przycisk. Czekacz leży na tym samym z-indexie co podgląd (9500).
    const czekacz = document.createElement('div');
    czekacz.id = 'sc-czekacz';
    czekacz.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;color:#a8a5a0;font-family:DM Mono,monospace;font-size:12px;';
    czekacz.textContent = 'Przygotowuję kartę…';
    document.body.appendChild(czekacz);

    try {
      const blob = await pobierzKarte();
      _plik = new File([blob], 'biegamy-karta.png', { type: 'image/png' });
      czekacz.remove();
      pokazPodglad(blob);
    } catch (e) {
      czekacz.remove();
      // 403 = moment niezatwierdzony albo cudzy. Ponawianie nic nie da, więc DOMYKAMY —
      // inaczej baner wracałby przy każdym wejściu. Każdy inny błąd traktujemy jako
      // PRZEJŚCIOWY i nie domykamy: powrót po zerwanej sieci to druga szansa, nie pętla.
      if (e && e.status === 403) {
        powiadom('Ta karta nie jest dostępna');
        if (_stan.onZamkniecie) { const cb = _stan.onZamkniecie; _stan.onZamkniecie = null; cb(); }
      } else {
        _stan.onZamkniecie = null;
        powiadom('Nie udało się przygotować karty');
      }
    }
  }

  return { mount: mount, pokazMoment: pokazMoment };
})();
