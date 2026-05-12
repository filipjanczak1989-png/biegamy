// ==========================================================
// JANUSZ RUN — Workouts Integration v0.3
// ==========================================================
// Łączy training_logs z BiegaMy z postępem Janusza.
// Każdy realny trening Twojego biegacza = mała opowieść w grze.
// ==========================================================

(function() {
  'use strict';

  // Czekamy aż JR namespace jest gotowy
  if (!window.JR) window.JR = {};
  JR.workouts = JR.workouts || {};

  // ==========================================================
  // PARSE HELPERS — duration "45:30" → 45.5, pace "5:12" → 5.2
  // ==========================================================
  function parseDuration(text) {
    if (!text) return null;
    const parts = String(text).trim().split(':').map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 1) return parts[0]; // tylko minuty
    if (parts.length === 2) return parts[0] + parts[1] / 60; // mm:ss
    if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60; // hh:mm:ss
    return null;
  }

  function parsePace(text) {
    if (!text) return null;
    // Może być "5:12", "5:12 /km", "5:12/km" etc.
    const match = String(text).match(/(\d+):(\d+)/);
    if (!match) return null;
    return parseInt(match[1]) + parseInt(match[2]) / 60;
  }

  // ==========================================================
  // CORE: Mapowanie typu treningu + samopoczucia → bonusy
  // ==========================================================
  function classifyWorkout(log) {
    const distance = Number(log.distance_km) || 0;
    const durationMin = parseDuration(log.duration);
    const paceMin = parsePace(log.pace);
    const typeRaw = (log.training_type || '').toLowerCase();
    const feel = (log.feel || '').toLowerCase();

    // Priorytet 1: explicit training_type
    if (typeRaw.match(/long|wybiegan|dłuższy/)) return 'long';
    if (typeRaw.match(/interw|vo2|sprint|szybki|powtórzeni/)) return 'intervals';
    if (typeRaw.match(/tempo|próg|cruise/)) return 'tempo';
    if (typeRaw.match(/regener|truchcik|spokojn|easy|baz/)) return 'easy';
    if (typeRaw.match(/zawod|start|race|bieg uli/)) return 'race';
    if (typeRaw.match(/siła|trucht|cross/)) return 'cross';

    // Priorytet 2: implicit z dystansu + tempa
    if (distance >= 18) return 'long';
    if (distance >= 12) return 'long_short';
    if (paceMin && paceMin < 4.5 && distance >= 3 && distance < 10) return 'intervals';
    if (paceMin && paceMin >= 4.5 && paceMin < 5.2 && distance >= 5) return 'tempo';
    if (distance < 8) return 'easy';

    return 'other';
  }

  // ==========================================================
  // BONUS GENERATOR — co dostaje Janusz
  // ==========================================================
  function generateBonus(log) {
    const type = classifyWorkout(log);
    const feel = (log.feel || '').toLowerCase();
    const distance = Number(log.distance_km) || 0;

    // Bazowe bonusy per typ treningu (zbalansowane v0.3.1)
    const base = {
      'long': { morale: 12, determinacja: 2, kondycja: 1, kapital: 5 },
      'long_short': { morale: 9, determinacja: 1, kondycja: 1, kapital: 3 },
      'intervals': { morale: 10, determinacja: 2, kondycja: 1, kapital: 3 },
      'tempo': { morale: 8, kondycja: 1, kapital: 2 },
      'race': { morale: 18, determinacja: 3, kapital: 10 },
      'easy': { morale: 4, energia: 3, kapital: 1 },
      'cross': { morale: 3, energia: 5 },
      'other': { morale: 4, kapital: 1 }
    }[type] || { morale: 3 };

    const bonus = { ...base };

    // Modyfikatory za feel (jak się czułeś)
    if (feel.match(/super|świetnie|bomba|extra|fantastycznie/)) {
      bonus.morale = Math.round((bonus.morale || 0) * 1.4);
      if (!bonus.determinacja) bonus.determinacja = 1;
    } else if (feel.match(/dobrze|ok|nieźle|spoko/)) {
      // bez zmian
    } else if (feel.match(/ciężko|trudno|słabo|źle|kiepsko/)) {
      // ciężki trening = mniej morale, więcej determinacji (Janusz uczy się że tak trzeba)
      bonus.morale = Math.round((bonus.morale || 0) * 0.7);
      bonus.determinacja = (bonus.determinacja || 0) + 1;
    } else if (feel.match(/kontuzj|ból|boli/)) {
      // Kontuzja w realu = Janusz odpoczywa solidarnie
      return {
        type: 'injury_solidarity',
        bonus: { energia: 20, morale: 2 },
        flavor: 'NARRATOR|Twój kolega-trener się oszczędza. Janusz też wziął wolne — kładzie się obok Burka. Razem patrzą w okno. Razem czekają na lepszą chwilę.'
      };
    }

    // Bonus za długość (każde 5 km ponad 10 = +1 determinacja)
    if (distance > 10) {
      bonus.determinacja = (bonus.determinacja || 0) + Math.floor((distance - 10) / 5);
    }

    return {
      type: type,
      bonus: bonus,
      flavor: pickFlavor(type, feel, distance, log)
    };
  }

  // ==========================================================
  // FLAVOR TEXTS — po polsku, z duszą
  // Format: "SPEAKER|tekst"
  // ==========================================================
  const FLAVORS = {
    long: [
      'NARRATOR|Trener wrócił z LONGA. Janusz patrzy z dumą zza firanki. "To jest mój trener", myśli.',
      'JANUSZ|Mama, widziałaś? Trener zrobił {KM} kilometrów. JA chcę kiedyś tyle.',
      'HENIU|Słyszałem przez sąsiada, że twój trener {KM} km wczoraj. Janusek, dobrego masz człowieka.',
      'NARRATOR|Janusz nie wie, ile to jest {KM} kilometrów. Wie tylko, że to dużo. Bardzo dużo.',
      'ANNA|*SMS do taty*: "Tata. Twój trener leci jak Bolt. Może i Ty kiedyś tyle?"'
    ],
    long_short: [
      'NARRATOR|Trener nakręcił {KM} km. Janusz słyszał o tym w sklepie. Cała wieś mówi.',
      'JANUSZ|{KM} kilometrów... Burek, ty wiesz że to PRAWIE pół maratonu?',
      'NARRATOR|Pan Mietek widzi wynik trenera w aplikacji. Wyłącza dane i wraca do piwa.'
    ],
    intervals: [
      'NARRATOR|Trener kasłał po interwałach. Janusz wie, że to dobry znak — tak się buduje silnik.',
      'JANUSZ|Trener robi te szybkie odcinki. Heniu mówi że one bolą najbardziej. Ale działają.',
      'HENIU|Interwały, mówisz? Twój trener wie co robi. Janusz, ucz się, ucz się.',
      'NARRATOR|Po sesji szybkościowej trenera, Janusz przez pół godziny przeglądał YouTube o VO2max. Nic nie zrozumiał. Ale czuje, że trochę zrozumiał.'
    ],
    tempo: [
      'NARRATOR|Trener trzymał próg. Janusz notuje w głowie: "to jest to tempo, w którym JESZCZE mogę rozmawiać. ALE NIE BARDZO."',
      'JANUSZ|Tempo... próg... próg mleczanowy... Heniu! HENIU! Co to znaczy?!',
      'HENIU|Próg mleczanowy to jak granica między łatwiznę a szczerością. Twój trener tam właśnie był.'
    ],
    race: [
      'NARRATOR|TRENER STARTOWAŁ. {KM} km na zawodach. Janusz nie spał — całą noc czytał wyniki.',
      'JANUSZ|*krzyczy do córki* Aniu! Trener startował! KIEDY JA BĘDĘ STARTOWAŁ?!',
      'NARRATOR|Wieść o starcie trenera dotarła do każdej baby z osiedla. Pani Halinka spytała Mietka: "no i co? Nadal śmiejesz się z biegaczy?"'
    ],
    easy: [
      'NARRATOR|Trener pobiegał na luzie. Janusz odpoczywa razem. Tak właśnie ma być.',
      'JANUSZ|Spokojnie. Trener wie kiedy spokojnie. Ja też się ucze.',
      'BUREK|*macha ogonem na widok trenera w aplikacji*',
      'NARRATOR|Lekki bieg trenera. Lekki dzień Janusza. Polska tradycja.',
      'HENIU|Regeneracja, to nie strata czasu. Twój trener wie. Ucz się od niego.'
    ],
    cross: [
      'NARRATOR|Trener urozmaicił — siłownia, jakaś joga, coś. Janusz nie do końca rozumie. Ale jest pod wrażeniem.',
      'JANUSZ|*do Burka* Trener się rozwija. Może i my powinniśmy?'
    ],
    other: [
      'NARRATOR|Twój trener nakręcił coś w aplikacji. Janusz to widzi i kiwa głową ze zrozumieniem.',
      'JANUSZ|Każdy kilometr trenera = mała iskra w mojej głowie.',
      'NARRATOR|Ruch jest ruchem. Pot jest potem. Janusz to wie.'
    ]
  };

  function pickFlavor(type, feel, distance, log) {
    const pool = FLAVORS[type] || FLAVORS.other;
    let text = pool[Math.floor(Math.random() * pool.length)];

    // Override jeśli mamy coach_comment od Ciebie (jako trenera)
    if (log.coach_comment && log.coach_comment.length > 5) {
      const escaped = log.coach_comment.replace(/"/g, '\\"').slice(0, 140);
      text = `NARRATOR|Trener napisał sobie po treningu: <em>"${escaped}"</em><br><br>Janusz przeczytał przez ramię. Notuje.`;
    }

    // Podstaw {KM}
    text = text.replace(/\{KM\}/g, distance.toFixed(1));
    return text;
  }

  // ==========================================================
  // FETCH: pobierz niewykorzystane treningi
  // ==========================================================
  JR.workouts.fetchUnused = async function(SB, limit = 5) {
    try {
      const { data, error } = await SB.rpc('jr_get_unused_training_logs', { p_limit: limit });
      if (error) {
        console.warn('[JR workouts] RPC error', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('[JR workouts] fetch failed', err);
      return [];
    }
  };

  // ==========================================================
  // APPLY: przyjmij bonus z treningu
  // ==========================================================
  JR.workouts.applyBonus = async function(SB, log, player, athlete) {
    const result = generateBonus(log);
    const [speaker, ...textParts] = result.flavor.split('|');
    const flavorText = textParts.join('|');

    // Zapisz w bazie
    const { error: insertErr } = await SB.from('jr_workout_bonuses').insert({
      player_id: player.id,
      training_log_id: log.id,
      workout_type: result.type,
      distance_km: log.distance_km,
      duration_min: parseDuration(log.duration),
      pace_min_per_km: parsePace(log.pace),
      feel: log.feel,
      bonus_value: result.bonus,
      flavor_text: flavorText,
      flavor_speaker: speaker
    });

    if (insertErr) {
      console.error('[JR workouts] insert bonus failed', insertErr);
      throw new Error('Nie udało się zapisać bonusu');
    }

    // Zaaplikuj na athlete
    const athleteUpdates = {};
    let playerUpdates = {};

    if ('morale' in result.bonus) {
      athleteUpdates.morale = Math.max(0, Math.min(100, athlete.morale + result.bonus.morale));
    }
    if ('determinacja' in result.bonus) {
      athleteUpdates.determinacja = Math.max(0, Math.min(10, athlete.determinacja + result.bonus.determinacja));
    }
    if ('kondycja' in result.bonus) {
      athleteUpdates.kondycja = Math.max(1, athlete.kondycja + result.bonus.kondycja);
    }
    if ('energia' in result.bonus) {
      athleteUpdates.energia = Math.max(0, Math.min(100, athlete.energia + result.bonus.energia));
    }
    if ('kapital' in result.bonus) {
      playerUpdates.kapital = Math.max(0, player.kapital + result.bonus.kapital);
    }

    let newAthlete = athlete;
    let newPlayer = player;

    if (Object.keys(athleteUpdates).length > 0) {
      const { data } = await SB.from('jr_athletes')
        .update(athleteUpdates).eq('id', athlete.id).select().single();
      if (data) newAthlete = data;
    }
    if (Object.keys(playerUpdates).length > 0) {
      const { data } = await SB.from('jr_players')
        .update(playerUpdates).eq('id', player.id).select().single();
      if (data) newPlayer = data;
    }

    return {
      type: result.type,
      bonus: result.bonus,
      flavor: flavorText,
      speaker: speaker,
      athlete: newAthlete,
      player: newPlayer
    };
  };

  // ==========================================================
  // PUBLIC: getters (na wypadek użycia w engine.js)
  // ==========================================================
  JR.workouts.classify = classifyWorkout;
  JR.workouts.preview = generateBonus;
  JR.workouts.parseDuration = parseDuration;
  JR.workouts.parsePace = parsePace;

})();
