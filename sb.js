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
//   window.safeUrlAttr(url) — escape URL dla atrybutu src/href (whitelist hostów, https-only)
//   window.safeExternalHref(url) — escape URL dla <a href> do linków zewnętrznych (https/http-only, bez whitelisty hostów)
//   window.LOG — production-silent console (debug/log/info/warn → no-op na prod)
//   window.showToast(msg, type) — toast UI zamiast alert()
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
    return `<span style="display:inline-flex;align-items:center;gap:${gap};background:linear-gradient(90deg,#1a1a1a,#0d0d0d);border:1px solid ${m.color}88;border-radius:${radius};padding:${padX};box-shadow:0 0 8px ${m.color}26;color:#fff;font-family:'DM Mono',monospace;">
      <span style="width:${iconBoxSize};height:${iconBoxSize};border-radius:5px;background:${m.color}2e;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="${m.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${m.icon}</svg>
      </span>
      <span style="font-size:${fontSize};letter-spacing:0.12em;text-transform:uppercase;font-weight:500;">${(window.escapeHtml||String)(type)}</span>
    </span>`;
  }
  window.renderTypePill = renderTypePill;

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
})();
