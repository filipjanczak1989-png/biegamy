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
  // Buduje URL do publicznego zasobu w bucketcie biegamy-assets (GitHub Pages).
  // Użycie: assetUrl('banner1.webp') → https://filipjanczak1989-png.github.io/biegamy-assets/banner1.webp
  window.assetUrl = function(path) {
    if (!path) return '';
    const clean = String(path).replace(/^\/+/, '');
    return 'https://filipjanczak1989-png.github.io/biegamy-assets/' + clean;
  };

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

    // 1. Wiadomość cofnięta (zaufana - zapisana przez aplikację)
    if (body.startsWith('<span class="msg-recall">') && body.endsWith('</span>')) {
      return body;
    }
    // 2. Voice message (zaufana - zapisana przez aplikację)
    if (body.startsWith('<div class="voice-msg">')) {
      return body;
    }
    // 3. Stary format: [zdjęcie] <a href="URL">tekst</a>
    const oldImg = body.match(/\[zdjęcie\]\s*<a href="([^"]+)"[^>]*>[^<]*<\/a>/);
    if (oldImg) {
      const url = oldImg[1];
      const before = window.escapeHtml(body.slice(0, oldImg.index));
      const after = window.escapeHtml(body.slice(oldImg.index + oldImg[0].length));
      return before + (_isSafeMediaUrl(url) ? _renderImgTag(url) : '[zdjęcie: ' + window.escapeHtml(url) + ']') + after;
    }
    // 4. Nowy format: <img src="URL" ...>
    const newImg = body.match(/<img\s+src="([^"]+)"[^>]*\/?>/);
    if (newImg) {
      const url = newImg[1];
      const before = window.escapeHtml(body.slice(0, newImg.index));
      const after = window.escapeHtml(body.slice(newImg.index + newImg[0].length));
      return before + (_isSafeMediaUrl(url) ? _renderImgTag(url) : '[zdjęcie: ' + window.escapeHtml(url) + ']') + after;
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
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
      return window.escapeHtml(url);
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
  // 📈 FORMA HELPERS — TRIMP calculation (CTL/ATL/TSB feature)
  // ═══════════════════════════════════════════════════════════════
  window.FORMA_EFFORT_FACTORS = {
    'odpoczynek': 0,
    'regeneracja': 1.0,
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

  // Single source of truth dla training_type colors (używane w _renderFormaTypes, statystyki.html, future heatmap)
  window.TRAINING_TYPE_COLORS = {
    'Spokojny':'#3db870','Bieg spokojny':'#3db870','Tempo':'#e8b840','Interwały':'#e05050','Długi':'#5b8cff','Wybieganie':'#5b8cff',
    'Regeneracja':'#9b6dff','Wzmacniający':'#ff7a45','Zastępczy':'#66c0ff','Odpoczynek':'#888','Progresja':'#e8b840','Start':'#dc2626','Wyścig':'#dc2626','Trening':'#e8561e'
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

  // Core forma renderer — parametryzowany athleteId + idPrefix dla reuse w zawodnik.html + trener.html
  window.renderFormaForAthlete = async function(athleteId, idPrefix) {
    if (!athleteId) return;
    const px = idPrefix || 'forma';

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
      .select('logged_at,duration,training_type,feel,distance_km,pace,heart_rate,elevation_gain')
      .eq('athlete_id', athleteId)
      .not('training_type', 'like', '__badge__%')
      .gte('logged_at', start.toISOString())
      .order('logged_at', { ascending: true });

    if (error) { console.error('[forma] fetch err', error); return; }

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

    const todayDateStr = today.toISOString().slice(0, 10);

    // Compute series CTL/ATL/TSB (EMA)
    const labels = [];
    const ctlData = [];
    const atlData = [];
    const tsbData = [];
    const trimpData = [];
    let ctl = 0, atl = 0;
    const CTL_DAYS = 42, ATL_DAYS = 7;

    for (let d = new Date(start); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const isFuture = dateStr > todayDateStr;

      if (isFuture) {
        const trimp = 0;
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

    // ── Update 3 kafelki premium (TSB + CTL + ATL) ──
    const lastCtl = ctlData[ctlData.length - 1] || 0;
    const lastAtl = atlData[atlData.length - 1] || 0;
    const lastTsb = tsbData[tsbData.length - 1] || 0;

    // TSB: status color + label + scale position
    const tsbValEl = document.getElementById(px + '-tsb-val');
    const tsbDotEl = document.getElementById(px + '-tsb-dot');
    const tsbLabelEl = document.getElementById(px + '-tsb-label');
    const tsbIndicatorEl = document.getElementById(px + '-tsb-indicator');
    if (tsbValEl) tsbValEl.textContent = (lastTsb >= 0 ? '+' : '') + Math.round(lastTsb);

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
    if (ctlValEl) ctlValEl.textContent = Math.round(lastCtl);
    if (ctlArrowEl) {
      ctlArrowEl.textContent = ctlTrend > 2 ? '↗' : ctlTrend < -2 ? '↘' : '→';
      ctlArrowEl.style.color = ctlTrend > 2 ? '#4ade80' : ctlTrend < -2 ? '#f87171' : '#60a5fa';
    }
    if (ctlLabelEl) ctlLabelEl.textContent = ctlTrend > 5 ? 'rośnie' : ctlTrend < -5 ? 'spada' : 'stabilna';
    if (ctlFillEl) {
      const ctlFillPct = 50 + Math.max(-50, Math.min(50, ctlTrend));
      ctlFillEl.style.width = ctlFillPct + '%';
    }
    if (ctlTrendEl) ctlTrendEl.textContent = (ctlTrend > 0 ? '+' : '') + ctlTrend + '% vs 30d';

    // ATL tile
    const atlValEl = document.getElementById(px + '-atl-val');
    const atlArrowEl = document.getElementById(px + '-atl-arrow');
    const atlLabelEl = document.getElementById(px + '-atl-label');
    const atlFillEl = document.getElementById(px + '-atl-fill');
    const atlTrendEl = document.getElementById(px + '-atl-trend');
    if (atlValEl) atlValEl.textContent = Math.round(lastAtl);
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
    if (atlTrendEl) atlTrendEl.textContent = (atlTrend > 0 ? '+' : '') + atlTrend + '% vs 30d';

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

    // Build annotations: strefy TSB (boxy tła) + Dziś + "Tu jesteś" + race markers
    const annotations = {
      // STREFA: przeciążenie (TSB < -30) — czerwone
      zone_critical: {
        type: 'box',
        yMin: -100,
        yMax: -30,
        backgroundColor: 'rgba(248,113,113,0.08)',
        borderWidth: 0,
        drawTime: 'beforeDatasetsDraw',
      },
      // STREFA: obciążenie (-30 do -10) — pomarańczowe
      zone_high: {
        type: 'box',
        yMin: -30,
        yMax: -10,
        backgroundColor: 'rgba(251,146,60,0.06)',
        borderWidth: 0,
        drawTime: 'beforeDatasetsDraw',
      },
      // STREFA: optimum (+5 do +15) — zielone
      zone_optimum: {
        type: 'box',
        yMin: 5,
        yMax: 15,
        backgroundColor: 'rgba(74,222,128,0.08)',
        borderWidth: 0,
        drawTime: 'beforeDatasetsDraw',
      },
      // STREFA: over-rested (> +15) — żółte
      zone_overrested: {
        type: 'box',
        yMin: 15,
        yMax: 100,
        backgroundColor: 'rgba(251,191,36,0.07)',
        borderWidth: 0,
        drawTime: 'beforeDatasetsDraw',
      },
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
    raceMarkers.forEach((race, idx) => {
      const raceLabelDate = race.date.slice(5);
      annotations['race_' + idx] = {
        type: 'line',
        xMin: raceLabelDate,
        xMax: raceLabelDate,
        borderColor: '#e8561e',
        borderWidth: 2,
        borderDash: [6, 4],
        label: {
          display: true,
          content: '🏁 ' + race.name,
          position: 'start',
          backgroundColor: 'rgba(232,86,30,0.95)',
          color: '#fff',
          font: { size: 10, family: 'DM Mono', weight: 'bold' },
          padding: { top: 4, bottom: 4, left: 8, right: 8 },
          borderRadius: 6,
          yAdjust: -5,
        }
      };
    });

    // Render Chart — per-prefix instance żeby zawodnik i trener panel mogły coexist
    const chartEl = document.getElementById(px + '-chart');
    if (chartEl) {
      const ctx = chartEl.getContext('2d');
      const chartKey = '_formaChart_' + px;
      if (window[chartKey]) window[chartKey].destroy();
      window[chartKey] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            { label: 'TRIMP (dzienny)', data: trimpData, type: 'bar', backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)', borderWidth: 0, yAxisID: 'y1', order: 3 },
            { label: 'CTL (forma długa)', data: ctlData, borderColor: '#60a5fa', backgroundColor: 'transparent', tension: 0.3, pointRadius: 0, borderWidth: 2, yAxisID: 'y', order: 2 },
            { label: 'ATL (zmęczenie)', data: atlData, borderColor: '#f87171', backgroundColor: 'transparent', tension: 0.3, pointRadius: 0, borderWidth: 2, yAxisID: 'y', order: 1 },
            { label: 'TSB (forma świeża)', data: tsbData, borderColor: '#4ade80', backgroundColor: 'rgba(74,222,128,0.1)', tension: 0.3, pointRadius: 0, borderWidth: 2.5, fill: true, yAxisID: 'y', order: 0 },
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              labels: { color: 'rgba(255,255,255,0.7)', font: { size: 10, family: 'DM Mono' }, boxWidth: 10, padding: 12 },
              position: 'bottom',
            },
            tooltip: { backgroundColor: 'rgba(20,15,30,0.95)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 10, titleFont: { family: 'DM Mono', size: 11 }, bodyFont: { family: 'DM Sans', size: 12 } },
            annotation: { annotations: annotations }
          },
          scales: {
            x: { ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 9 }, maxRotation: 0, autoSkipPadding: 20 }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { position: 'left', ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
            y1: { position: 'right', ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 9 } }, grid: { display: false }, beginAtZero: true }
          }
        }
      });
    }

    // 2 dodatkowe sekcje — pass prefix
    window._renderFormaWeekly(logs || [], px);
    window._renderFormaTypes(logs || [], px);
  };

  // Weekly bars renderer — parametryzowany prefix
  window._renderFormaWeekly = function(logs, idPrefix) {
    const px = idPrefix || 'forma';
    const el = document.getElementById(px + '-weekly-bars');
    if (!el) return;

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

      const trimp = weekLogs.reduce((sum, log) => sum + window.formaTRIMP(log), 0);
      const lbl = (weekStart.getMonth() + 1) + '/' + weekStart.getDate();
      buckets.push({ trimp, lbl });
    }

    const max = Math.max(...buckets.map(b => b.trimp), 1);
    el.innerHTML = buckets.map(b => {
      const h = Math.max((b.trimp / max) * 100, 2);
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;">'
        + '<div style="font-size:9px;color:rgba(255,255,255,0.6);font-family:DM Mono,monospace;">' + (b.trimp || '') + '</div>'
        + '<div style="width:100%;background:linear-gradient(180deg,#e8561e,#ff7a3d);border-radius:4px 4px 0 0;height:' + h + '%;min-height:2px;"></div>'
        + '<div style="font-size:9px;color:rgba(255,255,255,0.4);font-family:DM Mono,monospace;">' + b.lbl + '</div>'
        + '</div>';
    }).join('');
  };

  // Types pie renderer — parametryzowany prefix
  window._renderFormaTypes = function(logs, idPrefix) {
    const px = idPrefix || 'forma';
    const el = document.getElementById(px + '-types-content');
    if (!el) return;

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
    let startAngle = -Math.PI / 2;
    let paths = '';
    let legend = '';
    Object.entries(counts).sort((a,b) => b[1] - a[1]).forEach(([type, km]) => {
      const pct = km / total;
      const endAngle = startAngle + pct * 2 * Math.PI;
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const largeArc = pct > 0.5 ? 1 : 0;
      const color = TYPE_COLORS[type] || '#e8561e';
      if (pct >= 0.999) {
        paths += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + color + '"/>';
      } else {
        paths += '<path d="M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2 + ' Z" fill="' + color + '"/>';
      }
      startAngle = endAngle;

      legend += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11px;">'
        + '<div style="width:10px;height:10px;background:' + color + ';border-radius:2px;flex-shrink:0;"></div>'
        + '<div style="flex:1;color:rgba(255,255,255,0.85);">' + type + '</div>'
        + '<div style="color:rgba(255,255,255,0.6);font-family:DM Mono,monospace;">' + km.toFixed(1) + ' km</div>'
        + '</div>';
    });

    el.innerHTML = '<div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">'
      + '<svg width="120" height="120" viewBox="0 0 120 120" style="flex-shrink:0;">' + paths + '</svg>'
      + '<div style="flex:1;min-width:120px;">' + legend + '</div>'
      + '</div>';
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
})();
