// ==========================================================
// JANUSZ RUN — Game Engine v0.1.1 (MVP Faza 1)
// ==========================================================
// Pattern z BiegaMy: SB_URL / SB_KEY z sb.js, vanilla JS, async/await
// Klienta Supabase tworzymy tutaj (bo BiegaMy robi to w każdej stronie osobno)
// ==========================================================

(function() {
  'use strict';

  let SB = null; // klient Supabase, utworzony w bootstrap()

  // === Globalny namespace ===
  window.JR = window.JR || {};
  JR.player = null;
  JR.athlete = null;
  JR.events = [];
  JR.runInProgress = false;

  // ==========================================================
  // BOOTSTRAP: czekamy na SDK Supabase, tworzymy klienta, ruszamy
  // ==========================================================
  async function bootstrap() {
    // 1. Sprawdź czy mamy klucze z sb.js
    if (!window.SB_URL || !window.SB_KEY) {
      console.error('[JR] Brak SB_URL/SB_KEY z sb.js. Sprawdź czy sb.js jest wczytany.');
      showFatalError('Brak konfiguracji Supabase. Spróbuj odświeżyć stronę.');
      return;
    }

    // 2. Załaduj Supabase SDK z CDN (jeśli nie jest jeszcze dostępne)
    if (typeof window.supabase === 'undefined') {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
      } catch (err) {
        console.error('[JR] Nie udało się załadować Supabase SDK', err);
        showFatalError('Brak połączenia z bazą. Sprawdź internet i odśwież.');
        return;
      }
    }

    // 3. Stwórz klienta — taki sam jak w innych stronach BiegaMy
    try {
      SB = window.supabase.createClient(window.SB_URL, window.SB_KEY);
      // Udostępnij globalnie jako window.sb (na wypadek gdyby inne kawałki chciały korzystać)
      if (!window.sb) window.sb = SB;
    } catch (err) {
      console.error('[JR] Błąd tworzenia klienta Supabase', err);
      showFatalError('Błąd inicjalizacji bazy danych.');
      return;
    }

    // 4. Start właściwej gry
    await init();
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      // Sprawdź czy już wczytany
      const existing = Array.from(document.scripts).find(s => s.src === src);
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', resolve);
        existing.addEventListener('error', reject);
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function showFatalError(msg) {
    hideLoading();
    const overlay = document.getElementById('cold-open');
    if (overlay) {
      const content = overlay.querySelector('.cold-open-content');
      if (content) {
        content.innerHTML = `
          <div class="cold-open-meta">BŁĄD</div>
          <div class="cold-open-narration">${msg}</div>
          <button class="btn-start" onclick="location.reload()">Spróbuj ponownie ▸</button>
        `;
      }
    }
  }

  // ==========================================================
  // STAŁE GRY
  // ==========================================================
  const ENERGY_REGEN_PER_HOUR = 8; // +8 energii/godzinę offline (~12h do pełnej)
  const RUN_REAL_DURATION_MS = 8000; // 8 sekund realtime na bieg po polu (MVP, łatwo zmienić)
  const PHASE_1_GOAL_KM = 5.0; // 5 km bez przerwy → przejście do Fazy 2

  // ==========================================================
  // INIT
  // ==========================================================
  async function init() {
    try {
      // 1. Sprawdź sesję
      const { data: { session } } = await SB.auth.getSession();
      if (!session) {
        window.location.href = 'index.html';
        return;
      }

      // 2. Załaduj eventy z JSON
      try {
        const res = await fetch('js/janusz/data/events.json');
        JR.events = await res.json();
      } catch (e) {
        console.warn('[JR] Nie udało się załadować events.json, używam fallback', e);
        JR.events = getFallbackEvents();
      }

      // 3. Sprawdź czy gracz istnieje
      const { data: player, error: pErr } = await SB
        .from('jr_players')
        .select('*')
        .maybeSingle();

      if (pErr) console.warn('[JR] Player query error:', pErr);

      if (player) {
        JR.player = player;
        // Załaduj Janusza
        const { data: athlete } = await SB
          .from('jr_athletes')
          .select('*')
          .eq('player_id', player.id)
          .eq('is_main_character', true)
          .maybeSingle();

        JR.athlete = athlete;

        // Aktualizuj energię offline
        if (athlete) await regenerateEnergyOffline();

        // Decyzja: cold open czy gra
        if (player.intro_completed && athlete) {
          showGame();
        } else {
          showColdOpen();
        }
      } else {
        // Nowy gracz
        showColdOpen();
      }

      hideLoading();
    } catch (err) {
      console.error('[JR init]', err);
      hideLoading();
      toast('Błąd inicjalizacji. Spróbuj odświeżyć.', 'danger');
    }
  }

  function hideLoading() {
    const el = document.getElementById('loading');
    if (!el) return;
    el.classList.add('fade');
    setTimeout(() => el.style.display = 'none', 600);
  }

  // ==========================================================
  // COLD OPEN
  // ==========================================================
  function showColdOpen() {
    document.getElementById('cold-open').style.display = 'flex';
    document.getElementById('intro').classList.remove('active');
    document.getElementById('game').classList.remove('active');
  }

  // ==========================================================
  // INTRO DIALOG
  // ==========================================================
  const INTRO_STEPS = [
    {
      avatar: 'janusz-portrait.webp',
      name: 'JANUSZ',
      text: '<em>(myśli głośno)</em> Kurcze... Anna mówiła serio. Patrzyła w oczy i mówiła "tato, schudnij". Co ja zrobię. Obiecałem.',
      action: 'continue'
    },
    {
      avatar: 'janusz-portrait.webp',
      name: 'JANUSZ',
      text: '<em>(spogląda na pole)</em> No to... no to dawaj, Janusz. Raz wokół pola. Tylko raz. Burek, idziesz?',
      action: 'continue'
    },
    {
      avatar: 'burek-portrait.webp',
      name: 'BUREK',
      text: '<em>(śpi dalej, lekko macha ogonem)</em>',
      action: 'continue'
    },
    {
      avatar: 'janusz-portrait.webp',
      name: 'JANUSZ',
      text: 'Sam pójdę. Trudno.',
      action: 'name'
    },
    {
      avatar: 'janusz-portrait.webp',
      name: 'NARRATOR',
      text: '<em>I tak, w mglisty wtorek o świcie, na polu ziemniaków pod Hrubieszowem, zaczyna się historia, którą za 50 lat będą pisać dziennikarze CNN.</em><br><br>Ale teraz — to tylko pole. I jedno okrążenie. I Ty.',
      action: 'start_game'
    }
  ];

  JR.startIntro = function() {
    document.getElementById('cold-open').style.display = 'none';
    document.getElementById('intro').classList.add('active');
    renderIntro(0);
  };

  function renderIntro(stepIndex) {
    const container = document.getElementById('intro-content');
    container.innerHTML = '';

    // Pokaż wszystkie kroki do tego momentu (storytelling)
    for (let i = 0; i <= stepIndex; i++) {
      const step = INTRO_STEPS[i];
      const card = document.createElement('div');
      card.className = 'dialog-card';
      card.innerHTML = `
        <div class="dialog-header">
          <div class="dialog-avatar" style="background-image:url('assets/janusz/${step.avatar}')"></div>
          <div class="dialog-name">${step.name}</div>
        </div>
        <div class="dialog-text">${step.text}</div>
      `;
      container.appendChild(card);
    }

    // Akcja dla ostatniego kroku
    const currentStep = INTRO_STEPS[stepIndex];
    const lastCard = container.lastElementChild;

    if (currentStep.action === 'continue') {
      const btn = document.createElement('div');
      btn.className = 'dialog-choices';
      btn.innerHTML = `<button class="choice-btn" data-next="${stepIndex + 1}">Dalej ▸</button>`;
      lastCard.appendChild(btn);
      btn.querySelector('button').addEventListener('click', () => {
        renderIntro(stepIndex + 1);
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      });
    } else if (currentStep.action === 'name') {
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <div class="dialog-text" style="margin-top:1.5rem;">
          <strong>Jak się nazywasz, trenerze?</strong><br>
          <span style="color:var(--text-muted);font-size:0.9rem;">To imię zobaczą zawodnicy Twojego klubu.</span>
        </div>
        <input type="text" class="name-input" id="coach-name-input"
               placeholder="np. Filip, Kasia, Heniek..." maxlength="32" autocomplete="off">
        <div class="dialog-choices">
          <button class="choice-btn" id="coach-name-submit">Zostawiam swoje imię ▸</button>
        </div>
      `;
      lastCard.appendChild(wrap);

      // Auto-fill z BiegaMy jeśli możemy
      const input = document.getElementById('coach-name-input');
      const userMeta = SB.auth.user?.()?.user_metadata;
      if (userMeta?.full_name) input.value = userMeta.full_name.split(' ')[0];

      document.getElementById('coach-name-submit').addEventListener('click', async () => {
        const name = input.value.trim() || 'Trener';
        await createPlayer(name);
        renderIntro(stepIndex + 1);
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      });
      input.focus();
    } else if (currentStep.action === 'start_game') {
      const btn = document.createElement('div');
      btn.className = 'dialog-choices';
      btn.innerHTML = `<button class="choice-btn" style="background:var(--accent);border-color:var(--accent);text-align:center;font-weight:bold;">🥔 Wkraczam na pole ziemniaków ▸</button>`;
      lastCard.appendChild(btn);
      btn.querySelector('button').addEventListener('click', async () => {
        await markIntroCompleted();
        showGame();
      });
    }
  }

  // ==========================================================
  // PLAYER CREATION
  // ==========================================================
  async function createPlayer(coachName) {
    try {
      // Wywołaj helper RPC (z migracji SQL)
      const { data: playerId, error } = await SB.rpc('jr_init_player', { p_coach_name: coachName });

      if (error) {
        console.error('[JR createPlayer]', error);
        toast('Błąd tworzenia profilu', 'danger');
        return;
      }

      // Pobierz świeżo utworzonego gracza
      const { data: player } = await SB.from('jr_players')
        .select('*')
        .eq('id', playerId)
        .single();
      JR.player = player;

      const { data: athlete } = await SB.from('jr_athletes')
        .select('*')
        .eq('player_id', playerId)
        .eq('is_main_character', true)
        .single();
      JR.athlete = athlete;

      toast(`Witaj, trenerze ${coachName}! 🥔`, 'success');
    } catch (err) {
      console.error('[JR createPlayer]', err);
      toast('Coś poszło nie tak', 'danger');
    }
  }

  async function markIntroCompleted() {
    if (!JR.player) return;
    const { error } = await SB.from('jr_players')
      .update({ intro_completed: true })
      .eq('id', JR.player.id);
    if (!error) JR.player.intro_completed = true;
  }

  // ==========================================================
  // GAME MAIN UI
  // ==========================================================
  function showGame() {
    document.getElementById('cold-open').style.display = 'none';
    document.getElementById('intro').classList.remove('active');
    document.getElementById('game').classList.add('active');
    renderGame();
    // Po renderze, asynchronicznie ładuj niewykorzystane treningi
    loadAndShowUnusedWorkouts();
    // Inicjalizacja shop + achievementy
    initShopAndAchievements();
  }

  async function initShopAndAchievements() {
    if (JR.shop && JR.shop.ensureStarterShoes && JR.athlete) {
      try {
        const added = await JR.shop.ensureStarterShoes(SB, JR.athlete.id);
        if (added) console.log('[JR v0.4] Klapki Kubota założone Januszowi 👟');
      } catch (e) { console.warn('[JR shop] starter shoes', e); }
    }
    // Sprawdź achievementy które gracz mógł osiągnąć (np. po zainstalowaniu update)
    if (JR.achievements && JR.achievements.checkAll) {
      try {
        const newly = await JR.achievements.checkAll(SB);
        if (newly && newly.length > 0) {
          // Pokaż każde z osobna, z opóźnieniem
          for (let i = 0; i < newly.length; i++) {
            setTimeout(() => showAchievementUnlock(newly[i]), i * 4000);
          }
          // Update state players w razie nagród kapital
          await refreshPlayerState();
        }
      } catch (e) { console.warn('[JR ach] checkAll', e); }
    }
  }

  async function refreshPlayerState() {
    try {
      const { data: p } = await SB.from('jr_players').select('*').eq('id', JR.player.id).single();
      if (p) JR.player = p;
      const { data: a } = await SB.from('jr_athletes').select('*').eq('id', JR.athlete.id).single();
      if (a) JR.athlete = a;
    } catch (e) { console.warn('[JR] refreshPlayerState', e); }
  }

  async function loadAndShowUnusedWorkouts() {
    console.log('%c[JR v0.3] Ładuję treningi z BiegaMy...', 'color:#e8561e;font-weight:bold');

    if (!JR.workouts || !JR.workouts.fetchUnused) {
      console.warn('[JR v0.3] ❌ Moduł workouts.js niedostępny — sprawdź czy plik jest wgrany');
      showWorkoutsEmpty('Moduł workouts.js nie jest wgrany. Sprawdź czy plik jest w js/janusz/workouts.js');
      return;
    }

    try {
      const logs = await JR.workouts.fetchUnused(SB, 5);
      console.log('[JR v0.3] Znalezione treningi:', logs?.length || 0, logs);

      if (logs && logs.length > 0) {
        renderUnusedWorkouts(logs);
      } else {
        showWorkoutsEmpty('Brak nieodebranych treningów. Po Twoim następnym biegu/treningu w BiegaMy pojawi się tu nowa karta.');
      }
    } catch (err) {
      console.error('[JR v0.3] Błąd ładowania treningów:', err);
      showWorkoutsEmpty('Nie udało się załadować treningów. Sprawdź migrację SQL (jr_workout_bonuses + jr_get_unused_training_logs).');
    }
  }

  function showWorkoutsEmpty(message) {
    const slot = document.getElementById('workouts-slot');
    if (!slot) return;
    slot.innerHTML = `
      <div class="section-title">🏃 Treningi z BiegaMy</div>
      <div style="background:rgba(232,86,30,0.05);border:1px dashed rgba(232,86,30,0.3);border-radius:12px;padding:1rem;text-align:center;color:var(--text-muted);font-size:0.9rem;">
        ${message}
      </div>
    `;
  }

  function renderUnusedWorkouts(logs) {
    const slot = document.getElementById('workouts-slot');
    if (!slot) return;

    const cardsHtml = logs.map(log => {
      const preview = JR.workouts.preview(log);
      const date = new Date(log.logged_at);
      const dateStr = date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
      const timeAgo = formatTimeAgo(date);

      const distance = Number(log.distance_km).toFixed(1);
      const duration = log.duration || '—';
      const type = log.training_type || preview.type;
      const feel = log.feel || '';

      const bonusBadges = Object.entries(preview.bonus).map(([k, v]) => {
        const label = { morale: 'morale', determinacja: 'determinacja', kondycja: 'kondycja',
                        energia: 'energia', kapital: 'zł' }[k] || k;
        const sign = v > 0 ? '+' : '';
        return `<span class="workout-bonus-chip">${sign}${v} ${label}</span>`;
      }).join('');

      const coachCommentHtml = log.coach_comment
        ? `<div class="workout-coach-comment">💬 Twój komentarz: <em>"${escapeHtml(log.coach_comment).slice(0, 120)}"</em></div>`
        : '';

      const feelHtml = feel
        ? `<span class="workout-feel">${feelEmoji(feel)} ${escapeHtml(feel)}</span>`
        : '';

      return `
        <div class="workout-card" data-log-id="${log.id}">
          <div class="workout-header">
            <div class="workout-date">${dateStr} · ${timeAgo}</div>
            <div class="workout-type">${escapeHtml(type)}</div>
          </div>
          <div class="workout-stats">
            <span class="workout-stat-main">${distance} km</span>
            <span class="workout-stat-sub">${duration}</span>
            ${feelHtml}
          </div>
          ${coachCommentHtml}
          <div class="workout-bonus-preview">
            <div class="workout-bonus-label">Janusz dostanie:</div>
            <div class="workout-bonus-chips">${bonusBadges}</div>
          </div>
          <button class="workout-btn-claim" data-log-id="${log.id}">
            🥔 Przekaż Januszowi ▸
          </button>
        </div>
      `;
    }).join('');

    slot.innerHTML = `
      <div class="section-title">
        🏃 Twoje nieodebrane treningi
        <span style="color:var(--text-muted);font-weight:normal;">(${logs.length})</span>
      </div>
      <div class="workouts-list">
        ${cardsHtml}
      </div>
    `;

    // Bind buttons
    slot.querySelectorAll('.workout-btn-claim').forEach(btn => {
      btn.addEventListener('click', async () => {
        const logId = btn.dataset.logId;
        const log = logs.find(l => l.id === logId);
        if (log) await claimWorkoutBonus(log, btn);
      });
    });
  }

  async function claimWorkoutBonus(log, btn) {
    try {
      btn.disabled = true;
      btn.textContent = '⏳ Przekazuję...';

      const result = await JR.workouts.applyBonus(SB, log, JR.player, JR.athlete);
      JR.athlete = result.athlete;
      JR.player = result.player;

      // Pokaż event w modal
      const eventObj = {
        text: result.flavor,
        name: result.speaker || 'NARRATOR',
        avatar: avatarForSpeaker(result.speaker),
        effects: result.bonus
      };
      showEventModal(eventObj, true);

      // Usuń kartę treningu z UI
      const card = btn.closest('.workout-card');
      if (card) {
        card.style.transition = 'all 0.5s ease';
        card.style.opacity = '0';
        card.style.transform = 'translateX(20px)';
        setTimeout(() => card.remove(), 500);
      }

      // Sprawdź achievementy (trener_widzi etc.)
      setTimeout(async () => {
        try {
          const newly = await JR.achievements?.checkAll?.(SB);
          if (newly && newly.length > 0) {
            await refreshPlayerState();
            for (let i = 0; i < newly.length; i++) {
              setTimeout(() => showAchievementUnlock(newly[i]), i * 4500);
            }
          }
        } catch (e) { console.warn('[JR ach after workout]', e); }
      }, 1500);
    } catch (err) {
      console.error('[JR] claim error', err);
      btn.disabled = false;
      btn.textContent = '🥔 Przekaż Januszowi ▸';
      toast('Nie udało się przekazać bonusu. Spróbuj ponownie.', 'danger');
    }
  }

  function avatarForSpeaker(speaker) {
    const map = {
      'JANUSZ': 'janusz-portrait.webp',
      'BUREK': 'burek-portrait.webp',
      'MIETEK': 'mietek-portrait.webp',
      'HENIU': 'heniu-portrait.webp',
      'ANNA': 'anna-portrait.webp',
      'NARRATOR': 'janusz-portrait.webp'
    };
    return map[speaker] || 'janusz-portrait.webp';
  }

  function feelEmoji(feel) {
    const f = String(feel).toLowerCase();
    if (f.match(/super|świetnie|bomba|extra/)) return '🔥';
    if (f.match(/dobrze|ok|nieźle/)) return '👍';
    if (f.match(/ciężko|trudno|słabo|kiepsko/)) return '😤';
    if (f.match(/kontuzj|ból|boli/)) return '🤕';
    return '🏃';
  }

  function formatTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    if (diffHours < 1) return 'przed chwilą';
    if (diffHours < 24) return `${diffHours} h temu`;
    if (diffDays === 1) return 'wczoraj';
    if (diffDays < 7) return `${diffDays} dni temu`;
    return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderGame() {
    if (!JR.athlete || !JR.player) {
      console.error('[JR] Brak danych gracza w renderGame');
      return;
    }

    // Aktualizuj kapitał w headerze
    document.getElementById('kapital').textContent = `${JR.player.kapital} zł`;

    const a = JR.athlete;
    const tempoMin = Math.floor(a.tempo_seconds / 60);
    const tempoSec = String(a.tempo_seconds % 60).padStart(2, '0');

    const content = document.getElementById('game-content');
    content.innerHTML = `
      <!-- Slot na sekcję "nieodebrane treningi" — ładuje się asynchronicznie -->
      <div id="workouts-slot"></div>

      <div class="athlete-card">
        <div class="athlete-header">
          <div class="athlete-avatar" style="background-image:url('assets/janusz/janusz-portrait.webp')"></div>
          <div class="athlete-info">
            <h2>${a.name} ${a.surname}</h2>
            <div class="meta">${a.age} lat · ${a.hometown} · Faza ${a.current_phase}</div>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat">
            <div class="stat-label">Energia</div>
            <div class="stat-value">${Math.floor(a.energia)}/100</div>
            <div class="stat-bar"><div class="stat-bar-fill" style="width:${a.energia}%"></div></div>
          </div>
          <div class="stat">
            <div class="stat-label">Morale</div>
            <div class="stat-value">${a.morale}/100</div>
            <div class="stat-bar"><div class="stat-bar-fill" style="width:${a.morale}%"></div></div>
          </div>
          <div class="stat">
            <div class="stat-label">Kondycja</div>
            <div class="stat-value">${a.kondycja}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Tempo</div>
            <div class="stat-value">${tempoMin}:${tempoSec}/km</div>
          </div>
          <div class="stat">
            <div class="stat-label">Determinacja</div>
            <div class="stat-value">${a.determinacja}/10</div>
          </div>
          <div class="stat">
            <div class="stat-label">Łącznie km</div>
            <div class="stat-value">${Number(a.total_km).toFixed(1)} km</div>
          </div>
        </div>
      </div>

      <div class="section-title">Co robisz, trenerze?</div>
      <div class="actions">
        <button class="action-btn" id="btn-run-short" ${a.energia < 25 ? 'disabled' : ''}>
          <span class="action-icon">🥔</span>
          <span class="action-text">
            <strong>Wyślij Janusza na pole (200 m)</strong>
            <small>Krótki bieg · −25 energii · ~8 sekund</small>
          </span>
        </button>

        <button class="action-btn" id="btn-run-medium" ${a.energia < 45 || a.kondycja < 2 ? 'disabled' : ''}>
          <span class="action-icon">🌅</span>
          <span class="action-text">
            <strong>Dwa kółka wokół pola (400 m)</strong>
            <small>Średni bieg · −45 energii · wymaga Kondycja ≥ 2</small>
          </span>
        </button>

        <button class="action-btn" id="btn-rest">
          <span class="action-icon">🛋️</span>
          <span class="action-text">
            <strong>Odpocznij i zjedz coś</strong>
            <small>+18 energii · −8 morale (mama gada)</small>
          </span>
        </button>

        <button class="action-btn" id="btn-shop">
          <span class="action-icon">🏪</span>
          <span class="action-text">
            <strong>Sklep z butami</strong>
            <small>Kup nowe buty dla Janusza · Kapitał: ${JR.player.kapital} zł</small>
          </span>
        </button>

        <button class="action-btn" id="btn-trophies">
          <span class="action-icon">🏆</span>
          <span class="action-text">
            <strong>Trofea i osiągnięcia</strong>
            <small>Twoje sukcesy z Januszem</small>
          </span>
        </button>
      </div>

      <div style="text-align:center;margin-top:2rem;color:var(--text-muted);font-size:0.85rem;">
        Cel Fazy 1: pierwsze 5 km bez przerwy<br>
        <strong style="color:var(--accent-soft);">${Number(a.longest_run_km).toFixed(2)} / ${PHASE_1_GOAL_KM} km</strong>
      </div>
    `;

    // Eventy na przyciski
    document.getElementById('btn-run-short')?.addEventListener('click', () => startRun('short'));
    document.getElementById('btn-run-medium')?.addEventListener('click', () => startRun('medium'));
    document.getElementById('btn-rest')?.addEventListener('click', rest);
    document.getElementById('btn-shop')?.addEventListener('click', openShop);
    document.getElementById('btn-trophies')?.addEventListener('click', openTrophies);
  }

  // ==========================================================
  // SHOP — modal z butami
  // ==========================================================
  async function openShop() {
    if (!JR.shop) { toast('Sklep niedostępny', 'danger'); return; }
    const modal = document.getElementById('event-modal');
    const content = document.getElementById('event-modal-content');

    content.innerHTML = `
      <div class="dialog-header">
        <div class="dialog-name">🏪 SKLEP Z BUTAMI</div>
      </div>
      <div class="dialog-text" style="margin-bottom:1rem;">
        Kapitał: <strong style="color:var(--accent-soft);">${JR.player.kapital} zł</strong>
      </div>
      <div id="shop-list" style="display:flex;flex-direction:column;gap:0.75rem;max-height:60vh;overflow-y:auto;">
        <div style="text-align:center;color:var(--text-muted);padding:1rem;">Ładowanie...</div>
      </div>
      <div class="dialog-choices">
        <button class="choice-btn" id="shop-close">Wracam do treningu ▸</button>
      </div>
    `;
    modal.classList.add('active');
    document.getElementById('shop-close').addEventListener('click', () => {
      modal.classList.remove('active');
      renderGame();
    });

    const items = await JR.shop.fetchCatalog(SB, JR.athlete.id);
    const list = document.getElementById('shop-list');
    if (!items || items.length === 0) {
      list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:1rem;">Sklep pusty. Sprawdź czy migracja v0.4 została wykonana.</div>`;
      return;
    }

    list.innerHTML = items.map(it => {
      const tempoLabel = it.tempo_modifier_pct > 0
        ? `<span style="color:var(--success);">+${it.tempo_modifier_pct}% tempo</span>`
        : it.tempo_modifier_pct < 0
          ? `<span style="color:var(--danger);">${it.tempo_modifier_pct}% tempo</span>`
          : '<span style="color:var(--text-muted);">tempo neutralne</span>';

      const owned = it.owned_count > 0;
      const equipped = it.is_equipped;
      const canAfford = JR.player.kapital >= it.price;

      let buttonHtml;
      if (equipped) {
        buttonHtml = `<button class="workout-btn-claim" disabled style="background:var(--success);">✓ Założone</button>`;
      } else if (owned) {
        buttonHtml = `<button class="workout-btn-claim" data-action="equip" data-eq-id="${it.equipment_id}">Załóż ▸</button>`;
      } else if (it.price === 0) {
        buttonHtml = `<button class="workout-btn-claim" data-action="buy" data-key="${it.item_key}">Weź za darmo ▸</button>`;
      } else if (canAfford) {
        buttonHtml = `<button class="workout-btn-claim" data-action="buy" data-key="${it.item_key}">Kup za ${it.price} zł ▸</button>`;
      } else {
        buttonHtml = `<button class="workout-btn-claim" disabled>Brak ${it.price - JR.player.kapital} zł</button>`;
      }

      return `
        <div class="workout-card" style="${equipped ? 'border-color:var(--success);border-left-color:var(--success);' : ''}">
          <div style="display:flex;gap:1rem;align-items:flex-start;">
            <div style="width:100px;height:80px;flex-shrink:0;background:rgba(0,0,0,0.25);border-radius:8px;background-image:url('assets/janusz/${it.image_file}');background-size:contain;background-position:center;background-repeat:no-repeat;"></div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:0.4rem;">
                <strong style="color:var(--cream);">${escapeHtml(it.name)}</strong>
                <span class="workout-type">${tempoLabel}</span>
              </div>
              <div style="font-size:0.85rem;color:var(--text-muted);margin:0.3rem 0;line-height:1.4;">${escapeHtml(it.description || '')}</div>
              ${it.flavor_text ? `<div style="font-size:0.8rem;color:var(--cream-soft);font-style:italic;margin-bottom:0.4rem;">"${escapeHtml(it.flavor_text)}"</div>` : ''}
              ${owned ? `<div style="font-size:0.75rem;color:var(--text-muted);">Trwałość: ${it.best_durability}/${it.durability_max}</div>` : ''}
            </div>
          </div>
          <div style="margin-top:0.75rem;">${buttonHtml}</div>
        </div>
      `;
    }).join('');

    // Bind buttons
    list.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        btn.disabled = true;
        if (action === 'buy') {
          const key = btn.dataset.key;
          const result = await JR.shop.buyItem(SB, key, JR.athlete.id);
          if (result.ok) {
            // Załóż automatycznie
            await JR.shop.equipItem(SB, result.equipment_id);
            await refreshPlayerState();
            toast(`Kupiłeś i założyłeś nowe buty! 👟`, 'success');
            openShop(); // re-render
          } else {
            toast(`Błąd: ${result.error || 'nieznany'}`, 'danger');
            btn.disabled = false;
          }
        } else if (action === 'equip') {
          const eqId = btn.dataset.eqId;
          const result = await JR.shop.equipItem(SB, eqId);
          if (result.ok) {
            toast('Założone! 👟', 'success');
            openShop();
          } else {
            toast(`Błąd: ${result.error || 'nieznany'}`, 'danger');
            btn.disabled = false;
          }
        }
      });
    });
  }

  // ==========================================================
  // TROPHIES — modal z achievementami
  // ==========================================================
  async function openTrophies() {
    if (!JR.achievements) { toast('Trofea niedostępne', 'danger'); return; }
    const modal = document.getElementById('event-modal');
    const content = document.getElementById('event-modal-content');

    content.innerHTML = `
      <div class="dialog-header">
        <div class="dialog-name">🏆 TROFEA</div>
      </div>
      <div id="trophies-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:0.75rem;max-height:60vh;overflow-y:auto;padding:0.25rem;">
        <div style="text-align:center;color:var(--text-muted);padding:1rem;grid-column:1/-1;">Ładowanie...</div>
      </div>
      <div class="dialog-choices">
        <button class="choice-btn" id="trophies-close">Wracam do treningu ▸</button>
      </div>
    `;
    modal.classList.add('active');
    document.getElementById('trophies-close').addEventListener('click', () => {
      modal.classList.remove('active');
      renderGame();
    });

    const all = await JR.achievements.fetchAll(SB);
    const list = document.getElementById('trophies-list');

    if (!all || all.length === 0) {
      list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:1rem;grid-column:1/-1;">Trofea niedostępne. Sprawdź migrację v0.4.</div>`;
      return;
    }

    const unlocked = all.filter(a => a.unlocked).length;
    const total = all.length;

    list.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;color:var(--cream);font-size:0.95rem;margin-bottom:0.5rem;">
        Odblokowane: <strong style="color:var(--accent-soft);">${unlocked}/${total}</strong>
      </div>
    ` + all.map(a => {
      const filter = a.unlocked ? 'none' : 'grayscale(100%) brightness(0.4)';
      const opacity = a.unlocked ? '1' : '0.5';
      return `
        <div style="background:rgba(0,0,0,0.35);border-radius:12px;padding:0.85rem;text-align:center;${a.unlocked ? 'border:1px solid rgba(232,86,30,0.4);' : 'border:1px solid rgba(244,234,213,0.06);'}">
          <div style="width:100%;aspect-ratio:1;background-image:url('assets/janusz/${a.image_file || 'logo.webp'}');background-size:contain;background-position:center;background-repeat:no-repeat;filter:${filter};opacity:${opacity};margin-bottom:0.5rem;"></div>
          <div style="font-size:0.85rem;color:${a.unlocked ? 'var(--cream)' : 'var(--text-muted)'};font-weight:bold;margin-bottom:0.25rem;">${escapeHtml(a.name)}</div>
          <div style="font-size:0.7rem;color:var(--text-muted);line-height:1.35;">${escapeHtml(a.description)}</div>
          ${a.unlocked ? `<div style="font-size:0.65rem;color:var(--success);margin-top:0.3rem;">✓ ${new Date(a.unlocked_at).toLocaleDateString('pl-PL')}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  // ==========================================================
  // ACHIEVEMENT UNLOCK — toast/modal pokazujący nową plakietkę
  // ==========================================================
  function showAchievementUnlock(achievement) {
    const overlay = document.createElement('div');
    overlay.className = 'ach-unlock-overlay';
    overlay.innerHTML = `
      <div class="ach-unlock-card">
        <div class="ach-unlock-banner">🏆 ODBLOKOWANO TROFEUM</div>
        <div class="ach-unlock-icon" style="background-image:url('assets/janusz/${achievement.image_file}');"></div>
        <div class="ach-unlock-name">${escapeHtml(achievement.name)}</div>
        <div class="ach-unlock-rewards">
          ${achievement.reward_kapital > 0 ? `<span class="ach-reward-chip">+${achievement.reward_kapital} zł</span>` : ''}
          ${achievement.reward_morale > 0 ? `<span class="ach-reward-chip">+${achievement.reward_morale} morale</span>` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('show'), 20);
    setTimeout(() => overlay.classList.add('hide'), 3500);
    setTimeout(() => overlay.remove(), 4000);
  }

  // ==========================================================
  // FLYING EVENTS — pule tekstów (60+ wariantów na bieg)
  // ==========================================================
  const FLYING_TEXT_POOL = {
    intro: [
      '🌅 Świt nad polem...',
      '🌫️ Mgła snuje się nad rzędami',
      '🐓 Kogut piał pół godziny temu',
      '☕ Para z kubka unosi się ku niebu',
      '🌾 Cisza. Tylko świerszcze i kroki.',
      '🌅 Wschód słońca dotyka horyzontu',
      '💫 Ostatnie gwiazdy gasną',
      '🪶 Wieczorne ptaki jeszcze nie wstały',
      '🌬️ Lekki wiatr od strony lasu',
      '🌄 Niebo robi się różowe'
    ],
    burek: [
      '🐕 Burek się obudził!',
      '🐕 Burek otrzepał się z rosy',
      '🐕 Burek truchta obok — nie wytrzymał',
      '🐕 Burek wyprzedza... znowu',
      '🐕 Burek zatrzymał się przy bruździe',
      '🐕 Burek szczeka radośnie',
      '🐕 Burek poluje na motyla i Cię gubi',
      '🐕 Burek pokazuje jak się biega',
      '🐕 Burek znalazł patyk. Niesie.',
      '🐕 Burek się zmęczył pierwszy'
    ],
    mietek: [
      '👀 Mietek wystaje zza płotu',
      '🍺 Mietek otwiera kolejne piwo',
      '😒 Mietek kręci głową',
      '👀 Mietek mówi do żony: "patrz, znowu lata"',
      '🍺 Mietek wzrusza ramionami',
      '😏 Mietek puszcza dym z papierosa',
      '👀 Mietek tylko obserwuje. Tylko.',
      '🚬 Mietek strzepuje popiół na biegnący świat',
      '😒 Mietek bierze łyk i odwraca wzrok',
      '🍻 Mietek do butelki: "to się jeszcze nie skończy dobrze"'
    ],
    mid_run: [
      '💨 Pierwszy pot na czole',
      '🫁 Oddech zaczyna boleć',
      '🦵 Nogi mówią "ojej, znowu?"',
      '💪 Determinacja: nadal jest',
      '⚡ Tętno: czuję jak wali',
      '😅 "Ile to jest 200 metrów?"',
      '🌡️ Robi się gorąco',
      '💧 Kropla potu spada na nos',
      '🧠 "Anna. Anna obiecałem."',
      '😤 Janusz zaciska zęby',
      '🌱 Pole pachnie ziemią',
      '👟 Trampek się trochę otarł'
    ],
    sun_rising: [
      '🌅 Słońce wyżej',
      '☀️ Pierwsze promienie na twarzy',
      '🌤️ Niebo robi się złote',
      '🌄 Cień Janusza się skraca',
      '☀️ Dzień się otwiera',
      '🌅 Mgła ustępuje światłu',
      '🌞 Słońce mówi "dzień dobry"',
      '☀️ Pole zaczyna mienić się rosą'
    ],
    achievement: [
      '🫁 Drugi oddech!',
      '⚡ Endorfiny dają znać',
      '🔥 Coś się włącza w głowie',
      '💎 "Mogę. Naprawdę mogę."',
      '🌟 Pierwszy raz: euforia',
      '👑 Janusz przekracza barierę',
      '🎯 To jest TO uczucie',
      '🚀 Drugi wiatr w żaglach'
    ],
    finish: [
      '🏁 Finisz zbliża się...',
      '🏁 Ostatnie 50 metrów',
      '🏁 Już prawie...',
      '🏁 Widać metę',
      '🏁 Jeszcze jeden krok',
      '🏁 Mietek wstrzymuje oddech',
      '🏁 Burek czeka na końcu',
      '🏁 Anna w oknie się uśmiecha'
    ]
  };

  // Pamięć użytych tekstów per kategoria (żeby nie powtarzać w obrębie sesji)
  const usedTexts = {};

  function pickFlyingText(category) {
    const pool = FLYING_TEXT_POOL[category];
    if (!pool || pool.length === 0) return '...';

    if (!usedTexts[category]) usedTexts[category] = new Set();
    // Reset jak wyczerpaliśmy całą pulę
    if (usedTexts[category].size >= pool.length) usedTexts[category].clear();

    const available = pool.filter(t => !usedTexts[category].has(t));
    const chosen = available[Math.floor(Math.random() * available.length)];
    usedTexts[category].add(chosen);
    return chosen;
  }

  // ==========================================================
  // BIEG — CINEMATIC RUN SCENE v0.2
  // ==========================================================
  async function startRun(type) {
    if (JR.runInProgress) return;
    JR.runInProgress = true;

    const config = {
      short: { distance: 0.2, energyCost: 25, duration: RUN_REAL_DURATION_MS, title: 'Bieg po polu', subtitle: '200 metrów wokół pola ziemniaków' },
      medium: { distance: 0.4, energyCost: 45, duration: RUN_REAL_DURATION_MS * 1.8, title: 'Dwa kółka', subtitle: '400 metrów — pierwszy prawdziwy trening' }
    }[type];

    if (!config) { JR.runInProgress = false; return; }

    const newEnergia = Math.max(0, JR.athlete.energia - config.energyCost);

    // Zbuduj scenę biegu (pełnoekranowa)
    const scene = buildRunScene(config);
    document.body.appendChild(scene);
    // Force reflow → trigger fade-in
    void scene.offsetHeight;
    scene.classList.add('active');

    // Lista eventów "w locie" — generowana na nowo dla każdego biegu, z losowaniem!
    const flyingEvents = [
      { at: 0.08, text: pickFlyingText('intro'),         type: 'intro' },
      { at: 0.22, text: pickFlyingText('burek'),         type: 'burek' },
      { at: 0.38, text: pickFlyingText('mid_run'),       type: 'midrun' },
      { at: 0.50, text: pickFlyingText('mietek'),        type: 'mietek' },
      { at: 0.62, text: pickFlyingText('mid_run'),       type: 'midrun' },
      { at: 0.74, text: pickFlyingText('sun_rising'),    type: 'sun' },
      { at: 0.85, text: pickFlyingText('achievement'),   type: 'achievement' },
      { at: 0.94, text: pickFlyingText('finish'),        type: 'finish' }
    ];

    // Animacja sceny
    const startTime = Date.now();
    let lastEventIdx = -1;
    const elBurek = scene.querySelector('.scene-burek');
    const elMietek = scene.querySelector('.scene-mietek');

    const animInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / config.duration);
      const seconds = Math.floor(elapsed / 1000);

      // HUD: czas i dystans
      scene.querySelector('.hud-time').textContent =
        `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      const distM = Math.floor(config.distance * 1000 * progress);
      scene.querySelector('.hud-distance').textContent = `${distM} m`;

      // Tętno — wahanie 120-165 z lekkim wzrostem w trakcie biegu
      const baseHR = 120 + Math.floor(45 * progress);
      const hr = baseHR + Math.floor(Math.sin(elapsed / 200) * 4);
      scene.querySelector('.hud-hr').textContent = `${hr} bpm`;

      // Progres "okrążenia" — wskaźnik na dole
      scene.querySelector('.scene-progress-fill').style.width = (progress * 100) + '%';

      // Zmiana koloru nieba (sky overlay)
      const skyEl = scene.querySelector('.scene-sky-overlay');
      if (skyEl) {
        const skyAlpha = 0.4 * (1 - progress); // świt fade → poranek
        skyEl.style.opacity = skyAlpha;
      }

      // Wyzwól event w locie
      for (let i = lastEventIdx + 1; i < flyingEvents.length; i++) {
        if (progress >= flyingEvents[i].at) {
          showFlyingEvent(scene, flyingEvents[i]);
          // Specjalne efekty
          if (flyingEvents[i].type === 'burek') triggerBurekRun(elBurek);
          if (flyingEvents[i].type === 'mietek') triggerMietekPeek(elMietek);
          lastEventIdx = i;
        }
      }

      if (progress >= 1) {
        clearInterval(animInterval);
      }
    }, 100);

    // Czekaj na koniec biegu
    await sleep(config.duration);
    clearInterval(animInterval);

    // Wylosuj rezultat
    const determinacjaFactor = JR.athlete.determinacja / 10;
    const energyFactor = JR.athlete.energia / 100;
    const successChance = 0.5 + (determinacjaFactor * 0.3) + (energyFactor * 0.2);
    const completed = Math.random() < successChance;

    // Pokaż finalny moment — Janusz zatrzymuje się, dyszy
    scene.classList.add('finishing');
    await sleep(1200);

    // Aktualizuj statystyki
    const updates = {
      energia: newEnergia,
      energia_updated_at: new Date().toISOString(),
      total_runs: JR.athlete.total_runs + 1
    };

    if (completed) {
      updates.total_km = Number(JR.athlete.total_km) + config.distance;
      updates.longest_run_km = Math.max(Number(JR.athlete.longest_run_km), config.distance);
      if (Math.random() < 0.18) updates.kondycja = JR.athlete.kondycja + 1;
      updates.morale = Math.min(100, JR.athlete.morale + 2);
    } else {
      updates.morale = Math.max(0, JR.athlete.morale - 4);
    }

    // Zapisz bieg
    await SB.from('jr_runs').insert({
      athlete_id: JR.athlete.id,
      planned_distance_km: config.distance,
      actual_distance_km: completed ? config.distance : config.distance * 0.6,
      duration_seconds: Math.floor(config.duration / 1000),
      result: completed ? 'completed' : 'gave_up',
      exp_gained: completed ? 10 : 3,
      location: 'pole_ziemniakow'
    });

    // Update athlete
    const { data: updated } = await SB.from('jr_athletes')
      .update(updates).eq('id', JR.athlete.id).select().single();
    if (updated) JR.athlete = updated;

    // Zmniejsz trwałość założonych butów (1 punkt per krótki bieg, 2 per średni)
    if (JR.shop && JR.shop.reduceDurabilityOfEquipped) {
      const wear = type === 'medium' ? 2 : 1;
      try { await JR.shop.reduceDurabilityOfEquipped(SB, JR.athlete.id, wear); } catch {}
    }

    // Fade out sceny
    scene.classList.add('fadeout');
    await sleep(700);
    scene.remove();
    JR.runInProgress = false;

    // Pokaż event z biegu
    const event = pickRunEvent(type, completed);
    showEventModal(event, completed);

    // Sprawdź achievementy — w tle, z opóźnieniem żeby nie nachodzić na modal
    setTimeout(async () => {
      try {
        const moraleBeforeRun = JR.athlete.morale - (completed ? 2 : -4);
        const ctx = { lastRunMoraleLow: completed && moraleBeforeRun < 30 };
        const newly = await JR.achievements?.checkAll?.(SB, ctx);
        if (newly && newly.length > 0) {
          await refreshPlayerState();
          for (let i = 0; i < newly.length; i++) {
            setTimeout(() => showAchievementUnlock(newly[i]), i * 4500);
          }
        }
      } catch (e) { console.warn('[JR ach after run]', e); }
    }, 1500);
  }

  // ==========================================================
  // SCENE BUILDER — buduje DOM pełnoekranowej sceny biegu
  // ==========================================================
  function buildRunScene(config) {
    const scene = document.createElement('div');
    scene.className = 'run-scene';
    scene.innerHTML = `
      <div class="scene-bg-layer scene-bg-far"></div>
      <div class="scene-bg-layer scene-bg-mid"></div>
      <div class="scene-bg-layer scene-bg-near"></div>
      <div class="scene-sky-overlay"></div>

      <div class="scene-character scene-janusz">
        <div class="scene-janusz-sprite"></div>
        <div class="scene-dust"></div>
      </div>

      <div class="scene-character scene-burek"></div>
      <div class="scene-character scene-mietek"></div>

      <div class="scene-hud">
        <div class="hud-corner hud-tl">
          <div class="hud-label">CZAS</div>
          <div class="hud-value hud-time">0:00</div>
        </div>
        <div class="hud-corner hud-tr">
          <div class="hud-label">DYSTANS</div>
          <div class="hud-value hud-distance">0 m</div>
        </div>
        <div class="hud-corner hud-bl">
          <div class="hud-label">${config.title.toUpperCase()}</div>
          <div class="hud-sub">${config.subtitle}</div>
        </div>
        <div class="hud-corner hud-br">
          <div class="hud-label">TĘTNO</div>
          <div class="hud-value hud-hr">120 bpm</div>
        </div>
      </div>

      <div class="scene-flying-events"></div>

      <div class="scene-progress">
        <div class="scene-progress-fill"></div>
      </div>

      <div class="scene-finish-overlay">
        <div class="finish-text">Janusz dyszy ciężko...</div>
      </div>
    `;
    return scene;
  }

  // ==========================================================
  // FLYING EVENTS w trakcie biegu
  // ==========================================================
  function showFlyingEvent(scene, event) {
    const container = scene.querySelector('.scene-flying-events');
    const el = document.createElement('div');
    el.className = 'flying-event flying-event-' + event.type;
    el.textContent = event.text;
    container.appendChild(el);
    setTimeout(() => el.classList.add('show'), 20);
    setTimeout(() => el.classList.add('hide'), 2200);
    setTimeout(() => el.remove(), 2700);
  }

  function triggerBurekRun(burekEl) {
    if (!burekEl) return;
    burekEl.classList.remove('active');
    void burekEl.offsetHeight; // reflow
    burekEl.classList.add('active');
    setTimeout(() => burekEl.classList.remove('active'), 4500);
  }

  function triggerMietekPeek(mietekEl) {
    if (!mietekEl) return;
    mietekEl.classList.remove('active');
    void mietekEl.offsetHeight;
    mietekEl.classList.add('active');
    setTimeout(() => mietekEl.classList.remove('active'), 3500);
  }

  // ==========================================================
  // EVENTY
  // ==========================================================
  function pickRunEvent(type, completed) {
    const pool = JR.events.filter(e => {
      if (e.trigger === 'run_complete' && completed) return true;
      if (e.trigger === 'run_giveup' && !completed) return true;
      if (e.trigger === 'run_any') return true;
      return false;
    });

    if (pool.length === 0) {
      return completed
        ? { text: 'Janusz dał radę! Stoi zdyszany na polu i patrzy w niebo.', name: 'NARRATOR', avatar: 'janusz-portrait.webp' }
        : { text: 'Janusz musiał przerwać. Siada na płocie i łapie oddech.', name: 'NARRATOR', avatar: 'janusz-portrait.webp' };
    }

    return randomFromArray(pool);
  }

  function showEventModal(event, completed) {
    const modal = document.getElementById('event-modal');
    const content = document.getElementById('event-modal-content');

    let effectsHtml = '';
    if (event.effects && Object.keys(event.effects).length > 0) {
      const parts = [];
      for (const [k, v] of Object.entries(event.effects)) {
        const label = { morale: 'Morale', determinacja: 'Determinacja', kapital: 'Kapitał',
                        kondycja: 'Kondycja', energia: 'Energia' }[k] || k;
        const sign = v > 0 ? '+' : '';
        const color = v > 0 ? 'var(--success)' : 'var(--danger)';
        parts.push(`<span style="color:${color}">${sign}${v} ${label}</span>`);
      }
      effectsHtml = `<div style="margin-top:1rem;padding:0.75rem;background:rgba(0,0,0,0.3);border-radius:8px;font-size:0.95rem;">${parts.join(' · ')}</div>`;
    }

    content.innerHTML = `
      <div class="dialog-header">
        <div class="dialog-avatar" style="background-image:url('assets/janusz/${event.avatar || 'janusz-portrait.webp'}')"></div>
        <div class="dialog-name">${event.name || 'NARRATOR'}</div>
      </div>
      <div class="dialog-text">${event.text}</div>
      ${effectsHtml}
      <div class="dialog-choices">
        <button class="choice-btn" id="event-close" style="background:var(--accent);border-color:var(--accent);text-align:center;">Dalej ▸</button>
      </div>
    `;

    modal.classList.add('active');

    document.getElementById('event-close').addEventListener('click', async () => {
      modal.classList.remove('active');

      // Aplikuj efekty eventu
      if (event.effects) await applyEffects(event.effects);

      // Sprawdź czy osiągnęliśmy cel Fazy 1
      checkPhaseGoal();

      // Re-render
      renderGame();
    });
  }

  async function applyEffects(effects) {
    if (!JR.athlete || !JR.player) return;

    const athleteUpdates = {};
    const playerUpdates = {};

    if ('morale' in effects) {
      athleteUpdates.morale = clamp(JR.athlete.morale + effects.morale, 0, 100);
    }
    if ('determinacja' in effects) {
      athleteUpdates.determinacja = clamp(JR.athlete.determinacja + effects.determinacja, 0, 10);
    }
    if ('kondycja' in effects) {
      athleteUpdates.kondycja = Math.max(1, JR.athlete.kondycja + effects.kondycja);
    }
    if ('energia' in effects) {
      athleteUpdates.energia = clamp(JR.athlete.energia + effects.energia, 0, 100);
    }
    if ('kapital' in effects) {
      playerUpdates.kapital = Math.max(0, JR.player.kapital + effects.kapital);
    }

    if (Object.keys(athleteUpdates).length > 0) {
      const { data } = await SB.from('jr_athletes')
        .update(athleteUpdates).eq('id', JR.athlete.id).select().single();
      if (data) JR.athlete = data;
    }
    if (Object.keys(playerUpdates).length > 0) {
      const { data } = await SB.from('jr_players')
        .update(playerUpdates).eq('id', JR.player.id).select().single();
      if (data) JR.player = data;
    }
  }

  // ==========================================================
  // ODPOCZYNEK
  // ==========================================================
  async function rest() {
    const updates = {
      energia: Math.min(100, JR.athlete.energia + 18),
      morale: Math.max(0, JR.athlete.morale - 8),
      energia_updated_at: new Date().toISOString()
    };
    const { data } = await SB.from('jr_athletes')
      .update(updates).eq('id', JR.athlete.id).select().single();
    if (data) JR.athlete = data;

    toast('Mama: "Schudłeś, zjedz coś!" (+18 energii, -8 morale)', 'success');
    renderGame();
  }

  // ==========================================================
  // ENERGY REGEN OFFLINE
  // ==========================================================
  async function regenerateEnergyOffline() {
    if (!JR.athlete) return;
    const lastUpdate = new Date(JR.athlete.energia_updated_at);
    const now = new Date();
    const hoursElapsed = (now - lastUpdate) / (1000 * 60 * 60);
    if (hoursElapsed < 0.1) return; // mniej niż 6 minut — nie ruszamy

    const regenerated = Math.floor(hoursElapsed * ENERGY_REGEN_PER_HOUR);
    if (regenerated <= 0) return;

    const newEnergia = Math.min(100, JR.athlete.energia + regenerated);
    if (newEnergia === JR.athlete.energia) return;

    const { data } = await SB.from('jr_athletes')
      .update({ energia: newEnergia, energia_updated_at: now.toISOString() })
      .eq('id', JR.athlete.id).select().single();
    if (data) JR.athlete = data;

    if (regenerated >= 10) {
      setTimeout(() => toast(`Energia odzyskana podczas Twojej nieobecności: +${regenerated}`, 'success'), 800);
    }
  }

  // ==========================================================
  // PHASE GOAL CHECK
  // ==========================================================
  function checkPhaseGoal() {
    if (JR.athlete.longest_run_km >= PHASE_1_GOAL_KM && JR.athlete.current_phase === 1) {
      // TODO v0.2: Faza 2 unlock — Heniu się pojawia
      toast('🏆 Osiągnąłeś 5 km! Faza 2 wkrótce w v0.2', 'success');
    }
  }

  // ==========================================================
  // FALLBACK EVENTY (gdy nie załaduje się JSON)
  // ==========================================================
  function getFallbackEvents() {
    return [
      {
        trigger: 'run_complete', name: 'BUREK', avatar: 'burek-portrait.webp',
        text: 'Burek wyprzedził Cię na ostatnim kawałku. Pies ma większą kondycję od Ciebie.',
        effects: { morale: -2, determinacja: 1 }
      },
      {
        trigger: 'run_complete', name: 'MIETEK', avatar: 'mietek-portrait.webp',
        text: 'Mietek otworzył firankę, popatrzył, prychnął i zamknął. <em>"Wariat"</em>, mruknął.',
        effects: { determinacja: 2 }
      }
    ];
  }

  // ==========================================================
  // UTIL
  // ==========================================================
  function toast(text, type = '') {
    const container = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = text;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function randomFromArray(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ==========================================================
  // START
  // ==========================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})();
