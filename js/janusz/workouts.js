// ==========================================================
// JANUSZ RUN — Achievements Module v0.4
// ==========================================================
// System osiągnięć z auto-sprawdzaniem warunków.
// ==========================================================

(function() {
  'use strict';

  if (!window.JR) window.JR = {};
  JR.achievements = JR.achievements || {};

  // Definicje warunków (ewaluowane lokalnie + niektóre wymagają RPC)
  // Każdy zwraca { unlocked: bool, progress: { current, target } }
  const CONDITIONS = {
    // Łączna liczba km
    'pierwszy_km': async (ctx) => {
      const km = Number(ctx.athlete?.total_km || 0);
      return { unlocked: km >= 1.0, progress: { current: km.toFixed(2), target: 1.0 } };
    },

    // Pierwszy ukończony bieg
    'wstal_z_fotela': async (ctx) => {
      const runs = ctx.athlete?.total_runs || 0;
      return { unlocked: runs >= 1, progress: { current: runs, target: 1 } };
    },

    // 10 eventów z Burkiem
    'burek_dziwi': async (ctx) => {
      const count = await JR.achievements.countEvents(ctx.SB, 'burek_%');
      return { unlocked: count >= 10, progress: { current: count, target: 10 } };
    },

    // 5 eventów Mietka
    'mietek_wkurzony': async (ctx) => {
      const count = await JR.achievements.countEvents(ctx.SB, 'mietek_%');
      return { unlocked: count >= 5, progress: { current: count, target: 5 } };
    },

    // 3 SMS-y od Anny
    'anna_dumna': async (ctx) => {
      const count = await JR.achievements.countEvents(ctx.SB, 'anna_%');
      return { unlocked: count >= 3, progress: { current: count, target: 3 } };
    },

    // Event second_wind
    'drugi_oddech': async (ctx) => {
      const count = await JR.achievements.countEvents(ctx.SB, 'second_wind');
      return { unlocked: count >= 1, progress: { current: count, target: 1 } };
    },

    // Bieg ukończony przy morale < 30 (ten warunek sprawdzamy tylko w momencie biegu)
    'deszczowy': async (ctx) => {
      const has = ctx.lastRunMoraleLow === true;
      return { unlocked: has, progress: { current: has ? 1 : 0, target: 1 } };
    },

    // 5 km bez przerwy
    'piec_k': async (ctx) => {
      const longest = Number(ctx.athlete?.longest_run_km || 0);
      return { unlocked: longest >= 5.0, progress: { current: longest.toFixed(2), target: 5.0 } };
    },

    // 10 przekazanych treningów z BiegaMy
    'trener_widzi': async (ctx) => {
      try {
        const { count } = await ctx.SB
          .from('jr_workout_bonuses')
          .select('id', { count: 'exact', head: true })
          .eq('player_id', ctx.player.id);
        return { unlocked: (count || 0) >= 10, progress: { current: count || 0, target: 10 } };
      } catch {
        return { unlocked: false, progress: { current: 0, target: 10 } };
      }
    },

    // 5 ukończonych biegów
    'pierwszy_splul': async (ctx) => {
      const runs = ctx.athlete?.total_runs || 0;
      return { unlocked: runs >= 5, progress: { current: runs, target: 5 } };
    }
  };

  // ==========================================================
  // FETCH: pobierz wszystkie achievementy z postępem
  // ==========================================================
  JR.achievements.fetchAll = async function(SB) {
    try {
      const { data, error } = await SB.rpc('jr_get_achievements');
      if (error) {
        console.warn('[JR ach] fetchAll error', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('[JR ach] fetchAll failed', err);
      return [];
    }
  };

  // ==========================================================
  // COUNT: pomocnik do liczenia eventów po wzorcu
  // ==========================================================
  JR.achievements.countEvents = async function(SB, pattern) {
    try {
      const { data, error } = await SB.rpc('jr_count_events_by_pattern', { p_pattern: pattern });
      if (error) return 0;
      return data || 0;
    } catch {
      return 0;
    }
  };

  // ==========================================================
  // UNLOCK: odblokuj pojedynczy achievement
  // ==========================================================
  JR.achievements.unlock = async function(SB, key) {
    try {
      const { data, error } = await SB.rpc('jr_unlock_achievement', { p_achievement_key: key });
      if (error) {
        console.warn('[JR ach] unlock error', error);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('[JR ach] unlock failed', err);
      return null;
    }
  };

  // ==========================================================
  // CHECK ALL: sprawdza wszystkie warunki i odblokowuje co należne
  // Zwraca listę nowo odblokowanych achievementów (dla UI toast/modal)
  // ==========================================================
  JR.achievements.checkAll = async function(SB, ctx) {
    if (!ctx) ctx = {};
    ctx.SB = SB;
    if (!ctx.player) ctx.player = JR.player;
    if (!ctx.athlete) ctx.athlete = JR.athlete;

    // Pobierz aktualny stan odblokowań (jednym query)
    const all = await JR.achievements.fetchAll(SB);
    const alreadyUnlocked = new Set(all.filter(a => a.unlocked).map(a => a.achievement_key));

    const newlyUnlocked = [];

    for (const key of Object.keys(CONDITIONS)) {
      if (alreadyUnlocked.has(key)) continue;
      try {
        const cond = await CONDITIONS[key](ctx);
        if (cond && cond.unlocked) {
          const result = await JR.achievements.unlock(SB, key);
          if (result && result.ok) {
            newlyUnlocked.push(result);
          }
        }
      } catch (err) {
        console.warn('[JR ach] check failed for', key, err);
      }
    }

    return newlyUnlocked;
  };

  // Eksportujemy CONDITIONS na wypadek diagnostyki
  JR.achievements._conditions = CONDITIONS;

})();
