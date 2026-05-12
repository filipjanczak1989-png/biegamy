// ==========================================================
// JANUSZ RUN — Shop Module v0.4
// ==========================================================
// Obsługa sklepu z butami: katalog, kup, załóż, trwałość.
// ==========================================================

(function() {
  'use strict';

  if (!window.JR) window.JR = {};
  JR.shop = JR.shop || {};

  // ==========================================================
  // FETCH: pobierz katalog sklepu (z info o posiadaniu)
  // ==========================================================
  JR.shop.fetchCatalog = async function(SB, athleteId) {
    try {
      const { data, error } = await SB.rpc('jr_get_shop', { p_athlete_id: athleteId });
      if (error) {
        console.warn('[JR shop] fetchCatalog error', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('[JR shop] fetchCatalog failed', err);
      return [];
    }
  };

  // ==========================================================
  // BUY: kup przedmiot (RPC)
  // ==========================================================
  JR.shop.buyItem = async function(SB, itemKey, athleteId) {
    try {
      const { data, error } = await SB.rpc('jr_buy_item', {
        p_item_key: itemKey,
        p_athlete_id: athleteId
      });
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[JR shop] buyItem error', err);
      return { ok: false, error: err.message || 'unknown' };
    }
  };

  // ==========================================================
  // EQUIP: załóż przedmiot
  // ==========================================================
  JR.shop.equipItem = async function(SB, equipmentId) {
    try {
      const { data, error } = await SB.rpc('jr_equip_item', { p_equipment_id: equipmentId });
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[JR shop] equipItem error', err);
      return { ok: false, error: err.message };
    }
  };

  // ==========================================================
  // INIT: automatyczne nadanie klapek przy pierwszym wejściu
  // ==========================================================
  JR.shop.ensureStarterShoes = async function(SB, athleteId) {
    try {
      // Sprawdź czy ma już klapki
      const { data: existing } = await SB.from('jr_equipment')
        .select('id')
        .eq('athlete_id', athleteId)
        .eq('item_key', 'klapki_kubota')
        .maybeSingle();

      if (existing) return false; // już ma

      // Kup klapki (price 0)
      const result = await JR.shop.buyItem(SB, 'klapki_kubota', athleteId);
      if (result.ok && result.equipment_id) {
        await JR.shop.equipItem(SB, result.equipment_id);
        console.log('[JR shop] Klapki Kubota założone domyślnie');
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[JR shop] ensureStarterShoes', err);
      return false;
    }
  };

  // ==========================================================
  // DURABILITY: zmniejszenie trwałości po biegu
  // ==========================================================
  JR.shop.reduceDurabilityOfEquipped = async function(SB, athleteId, amount = 1) {
    try {
      // Pobierz aktualnie założony przedmiot (shoes)
      const { data: equipped } = await SB.from('jr_equipment')
        .select('id, durability, item_key')
        .eq('athlete_id', athleteId)
        .eq('is_equipped', true);

      if (!equipped || equipped.length === 0) return;

      for (const eq of equipped) {
        const newDurability = Math.max(0, eq.durability - amount);
        await SB.from('jr_equipment').update({ durability: newDurability }).eq('id', eq.id);
      }
    } catch (err) {
      console.warn('[JR shop] reduceDurability', err);
    }
  };

  // ==========================================================
  // Pobierz tempo modifier z założonych butów
  // ==========================================================
  JR.shop.getEquippedTempoModifier = async function(SB, athleteId) {
    try {
      const { data } = await SB
        .from('jr_equipment')
        .select('item_key, jr_shop_items(tempo_modifier_pct)')
        .eq('athlete_id', athleteId)
        .eq('is_equipped', true)
        .maybeSingle();

      if (!data) return 0;
      return data.jr_shop_items?.tempo_modifier_pct || 0;
    } catch (err) {
      return 0;
    }
  };

})();
