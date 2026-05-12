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
  const ENERGY_REGEN_PER_HOUR = 20; // +20 energii/godzinę offline
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
        <button class="action-btn" id="btn-run-short" ${a.energia < 15 ? 'disabled' : ''}>
          <span class="action-icon">🥔</span>
          <span class="action-text">
            <strong>Wyślij Janusza na pole (200 m)</strong>
            <small>Krótki bieg · −15 energii · ~8 sekund</small>
          </span>
        </button>

        <button class="action-btn" id="btn-run-medium" ${a.energia < 30 || a.kondycja < 2 ? 'disabled' : ''}>
          <span class="action-icon">🌅</span>
          <span class="action-text">
            <strong>Dwa kółka wokół pola (400 m)</strong>
            <small>Średni bieg · −30 energii · wymaga Kondycja ≥ 2</small>
          </span>
        </button>

        <button class="action-btn" id="btn-rest">
          <span class="action-icon">🛋️</span>
          <span class="action-text">
            <strong>Odpocznij i zjedz coś</strong>
            <small>+25 energii · −5 morale (mama gada)</small>
          </span>
        </button>

        <button class="action-btn" id="btn-stats">
          <span class="action-icon">📊</span>
          <span class="action-text">
            <strong>Pełne statystyki</strong>
            <small>Historia biegów, achievementy, kolekcja</small>
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
    document.getElementById('btn-stats')?.addEventListener('click', () => {
      toast('Statystyki — coming soon w v0.2', 'success');
    });
  }

  // ==========================================================
  // BIEG
  // ==========================================================
  async function startRun(type) {
    if (JR.runInProgress) return;
    JR.runInProgress = true;

    const config = {
      short: { distance: 0.2, energyCost: 15, duration: RUN_REAL_DURATION_MS, title: 'Bieg po polu (200 m)' },
      medium: { distance: 0.4, energyCost: 30, duration: RUN_REAL_DURATION_MS * 1.8, title: 'Dwa kółka (400 m)' }
    }[type];

    if (!config) { JR.runInProgress = false; return; }

    // Zaktualizuj energię
    const newEnergia = Math.max(0, JR.athlete.energia - config.energyCost);

    // Pokaż overlay
    const overlay = document.getElementById('run-overlay');
    const titleEl = document.getElementById('run-title');
    const subtitleEl = document.getElementById('run-subtitle');
    const fillEl = document.getElementById('run-progress-fill');
    const timeEl = document.getElementById('run-time');

    titleEl.textContent = config.title;
    subtitleEl.textContent = randomFromArray([
      'Janusz okrąża pole ziemniaków...',
      'Burek się przygląda...',
      'Mietek otwiera firankę za płotem...',
      'Mgła rozprasza się powoli...',
      'Słychać tylko ciężki oddech i kroki...'
    ]);
    fillEl.style.width = '0%';
    timeEl.textContent = '0:00';
    overlay.classList.add('active');

    // Animacja progress baru
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const percent = Math.min(100, (elapsed / config.duration) * 100);
      const seconds = Math.floor(elapsed / 1000);
      fillEl.style.width = percent + '%';
      timeEl.textContent = `0:${String(seconds).padStart(2, '0')}`;
      if (percent >= 100) clearInterval(progressInterval);
    }, 100);

    // Czekaj na koniec biegu
    await sleep(config.duration);
    clearInterval(progressInterval);

    // Wylosuj rezultat
    const determinacjaFactor = JR.athlete.determinacja / 10;
    const energyFactor = JR.athlete.energia / 100;
    const successChance = 0.5 + (determinacjaFactor * 0.3) + (energyFactor * 0.2);
    const completed = Math.random() < successChance;

    // Aktualizuj statystyki
    const updates = {
      energia: newEnergia,
      energia_updated_at: new Date().toISOString(),
      total_runs: JR.athlete.total_runs + 1
    };

    if (completed) {
      updates.total_km = Number(JR.athlete.total_km) + config.distance;
      updates.longest_run_km = Math.max(Number(JR.athlete.longest_run_km), config.distance);
      // Lekki progres kondycji co kilka biegów
      if (Math.random() < 0.3) {
        updates.kondycja = JR.athlete.kondycja + 1;
      }
      // Morale w górę
      updates.morale = Math.min(100, JR.athlete.morale + 5);
    } else {
      updates.morale = Math.max(0, JR.athlete.morale - 3);
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
      .update(updates)
      .eq('id', JR.athlete.id)
      .select()
      .single();
    if (updated) JR.athlete = updated;

    // Ukryj overlay
    overlay.classList.remove('active');
    JR.runInProgress = false;

    // Pokaż event z biegu
    const event = pickRunEvent(type, completed);
    showEventModal(event, completed);
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
      energia: Math.min(100, JR.athlete.energia + 25),
      morale: Math.max(0, JR.athlete.morale - 5),
      energia_updated_at: new Date().toISOString()
    };
    const { data } = await SB.from('jr_athletes')
      .update(updates).eq('id', JR.athlete.id).select().single();
    if (data) JR.athlete = data;

    toast('Mama: "Schudłeś, zjedz coś!" (+25 energii, -5 morale)', 'success');
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
