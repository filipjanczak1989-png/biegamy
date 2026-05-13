// ==========================================================
// JANUSZ RUN — States Module v0.6
// ==========================================================
// System "stanu psychicznego" Janusza zamiast suchych liczb.
// Stan wynika z kombinacji: morale + energia + determinacja + biegi dziś
// ==========================================================

(function() {
  'use strict';

  if (!window.JR) window.JR = {};
  JR.states = JR.states || {};

  // ==========================================================
  // DEFINICJE STANÓW
  // Order MA znaczenie — wcześniejsze warunki "wygrywają"
  // ==========================================================
  const STATES = [
    {
      key: 'wypalony',
      check: (a, p) => (a.runs_today || 0) >= 3 && a.energia < 30,
      label: '🥱 Wypalony',
      tone: 'danger',
      cinematic: 'state-wypalony.webp',
      flavor: [
        'Janusz dzisiaj zrobił już 3 biegi. Nogi mówią dość. Mózg też. Trzeba spać.',
        'Ciało Janusza powiedziało STOP. Trzymasz teraz w rękach człowieka który przeholował.',
        'Tylko sen pomoże. Mama nawet by się ucieszyła — w końcu leży.'
      ],
      desc: 'Janusz przeholował dziś. Tylko sen pomoże.',
      // Blokady
      blockRuns: true,
      blockMostActions: true
    },
    {
      key: 'zalamany',
      check: (a, p) => a.morale < 20,
      label: '🚫 Załamany',
      tone: 'danger',
      cinematic: 'state-zalamany.webp',
      flavor: [
        'Janusz leży na kanapie. Nie chce wstać. "Po co to wszystko, kurde."',
        'Morale na zero. Janusz nawet nie chce słuchać o bieganiu. Trzeba pomóc inaczej.',
        'Coś trzeba zrobić. Zadzwonić do Anny. Pójść do Mamy. Coś. Tylko nie kolejny bieg.'
      ],
      desc: 'Bieg zablokowany. Trzeba podnieść morale przez akcje życiowe.',
      blockRuns: true
    },
    {
      key: 'odrodzony',
      check: (a, p) => a.state_override === 'odrodzony' && a.state_override_until > new Date().toISOString(),
      label: '🌟 Odrodzony',
      tone: 'success',
      cinematic: 'state-odrodzony.webp',
      flavor: [
        'Janusz wrócił z mroku. Mocniejszy niż wcześniej. Wszystko ma teraz sens.',
        'Po dnie zawsze przychodzi świt. Janusz dzisiaj wie, kim jest.',
        'Wczoraj się nie wstał. Dzisiaj wstał wcześniej niż wszyscy.'
      ],
      desc: 'Bonus +20% do wszystkich nagród. Trwa 24h.',
      bonusMultiplier: 1.2
    },
    {
      key: 'w_ogniu',
      check: (a, p) => a.morale >= 80 && a.determinacja >= 7,
      label: '🔥 W ogniu',
      tone: 'fire',
      cinematic: 'state-w-ogniu.webp',
      flavor: [
        'Wszystko leci po jego myśli. Janusz dziś biega jak młody.',
        'Stan flow. Pełna gotowość. Każdy krok ma sens.',
        'Mietek widzi to przez okno i milknie. To jest INNY Janusz.'
      ],
      desc: 'Bonus +50% do nagród z biegów. Korzystaj póki trwa!',
      bonusMultiplier: 1.5
    },
    {
      key: 'glodny',
      check: (a, p) => a.morale >= 60 && a.determinacja >= 5,
      label: '💪 Głodny zwycięstwa',
      tone: 'good',
      cinematic: 'state-glodny-zwyciestwa.webp',
      flavor: [
        'Janusz wie czego chce. Wstaje rano i biegnie.',
        'Spokojny, ale zmotywowany. Idealny stan biegacza.',
        'Robi co ma robić. Bez fajerwerków, ale konsekwentnie.'
      ],
      desc: 'Standard motywacji. Wszystkie akcje dostępne.',
      bonusMultiplier: 1.0
    },
    {
      key: 'watpliwosci',
      check: (a, p) => a.morale < 40,
      label: '😞 Wątpliwości',
      tone: 'warning',
      cinematic: 'state-watpliwosci.webp',
      flavor: [
        'Janusz siedzi i pyta sam siebie: "Po co to wszystko?"',
        'Mietek się znowu śmiał. Trudno się otrząsnąć z takich rzeczy.',
        'Coś go gryzie. Może zadzwonić do Anny? Może po prostu odpocząć?'
      ],
      desc: '-20% efektywność biegu. Pomyśl o akcjach społecznych.',
      bonusMultiplier: 0.8
    },
    {
      key: 'normalnie',
      check: () => true, // fallback
      label: '😐 Robi swoje',
      tone: 'neutral',
      cinematic: null,
      flavor: [
        'Dzień jak co dzień. Janusz robi swoje. Bez wzlotów, bez upadków.',
        'Janusz wie co ma robić. Spokój.',
        'Wszystko OK. Normalny dzień w Hrubieszowie.'
      ],
      desc: 'Standardowy stan. Wszystko działa normalnie.',
      bonusMultiplier: 1.0
    }
  ];

  // ==========================================================
  // Compute: zwraca aktualny stan Janusza
  // ==========================================================
  JR.states.compute = function(athlete, player) {
    if (!athlete || !player) return STATES[STATES.length - 1]; // fallback 'normalnie'
    for (const state of STATES) {
      try {
        if (state.check(athlete, player)) return state;
      } catch (e) {
        console.warn('[JR states] check error for', state.key, e);
      }
    }
    return STATES[STATES.length - 1];
  };

  // Helper — losowy flavor z puli stanu
  JR.states.getFlavor = function(state) {
    if (!state || !state.flavor) return '';
    return state.flavor[Math.floor(Math.random() * state.flavor.length)];
  };

  // Helper — czy bieg dozwolony?
  JR.states.canRun = function(athlete, player, runType) {
    const state = JR.states.compute(athlete, player);
    if (state.blockRuns) return { allowed: false, reason: state.key, message: state.desc };

    // Dodatkowe progi energii
    const energyNeeded = runType === 'medium' ? 45 : 25;
    if (athlete.energia < energyNeeded) {
      return { allowed: false, reason: 'energia_low', message: `Energia za niska (${athlete.energia}/${energyNeeded}). Odpocznij.` };
    }
    if (runType === 'medium' && athlete.kondycja < 2) {
      return { allowed: false, reason: 'kondycja_low', message: 'Kondycja za niska. Najpierw krótkie biegi.' };
    }

    return { allowed: true, bonusMultiplier: state.bonusMultiplier || 1.0 };
  };

  // Eksportuj listę dla diagnostyki
  JR.states._all = STATES;

})();
