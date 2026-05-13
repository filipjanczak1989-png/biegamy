// ==========================================================
// JANUSZ RUN — Life Actions Module v0.6
// ==========================================================
// Akcje pozabiegowe — kluczowy element ekonomii gry.
// Każda akcja ma cooldown, flavor text z wariantami i konsekwencje.
// ==========================================================

(function() {
  'use strict';

  if (!window.JR) window.JR = {};
  JR.actions = JR.actions || {};

  // ==========================================================
  // KATALOG AKCJI
  // ==========================================================
  const ACTIONS = {
    anna_call: {
      icon: '📞',
      label: 'Zadzwoń do Anny',
      sublabel: '+15 morale · +3 relacja · cooldown 24h',
      cooldownHours: 24,
      cinematic: 'moment-anna-telefon.webp',
      avatar: 'anna-portrait.webp',
      speaker: 'ANNA',
      effects: { morale: 15, rel_anna: 3 },
      flavors: [
        '<em>"Tata, hej! Jak Ci dzisiaj poszło z bieganiem?"</em><br><br>Janusz słyszy głos córki i nagle wszystko ma sens. Po rozmowie chce iść biegać jeszcze raz. Nie idzie. Ale chce.',
        '<em>"Tata, ja w tym tygodniu zaliczyłam egzamin! Dzięki Tobie."</em><br><br>"Dzięki MNIE?" — Janusz nie rozumie. "Bo widzę że Ty się starasz, to ja też się staram", odpowiada Anna.',
        '<em>"Tata, słuchaj, dzwonię bo... wiesz. Po prostu."</em><br><br>Cisza w słuchawce. Obaj wiedzą o co chodzi. Obaj milczą. Obaj się uśmiechają.',
        '<em>"Tata, mama mówi że schudłeś. Ale w dobrym sensie."</em><br><br>Janusz odkłada słuchawkę i nie wie czy się śmiać czy płakać. Bo mama nigdy nie powiedziała tego jemu.',
        '<em>"Tata, gdybyś jutro przejechał do mnie do miasta na obiad? Wiem że to daleko ale..."</em><br><br>Janusz zapisuje datę w kalendarzu kuchennym pod krzyżem. Wielką literą: <strong>NIEDZIELA — ANIA.</strong>'
      ]
    },

    mama_prayer: {
      icon: '🙏',
      label: 'Pomódl się z Mamą',
      sublabel: '+5 morale, +5 energia, -1 determinacja',
      cooldownHours: 24,
      cinematic: 'moment-mama-modlitwa.webp',
      avatar: 'mama-portrait.webp',
      speaker: 'MAMA KRYSIA',
      effects: { morale: 5, energia: 5, determinacja: -1, rel_mama: 5 },
      flavors: [
        '<em>"Synek, klęknij ze mną. Pomódlmy się o zdrowie."</em><br><br>Janusz klęka. Pachnie świecą i suchymi kwiatami. Po modlitwie czuje że jakaś część zmęczenia odeszła. Ale też mała iskra ambicji zgasła.',
        '<em>"Święty Antoni, zatroszcz się o syna. Niech mu się nogi nie powyginają od tego biegania."</em><br><br>Janusz słyszy i się uśmiecha. Mama jest mamą. Mamy są mamami.',
        '<em>"Pomódlmy się o spokój. O zdrowie. O to żebyś nie był jak ten pijak Mietek."</em><br><br>"Mietek nie jest pijakiem, mamo." "Ale prawie." Janusz nie kłóci się. Po modlitwie ma więcej energii. Mama wie co robi.',
        '<em>"Synek, popatrz na obraz Matki Bożej. Ona też ma syna. Ona też się martwi."</em><br><br>Janusz patrzy. Coś go ściska w gardle. Wieczorem nie ma już siły biegać. Ale jest spokojnie.',
        '<em>"Pomódlmy się — ale wiesz co, synek? Może już dość tego biegania? Może wystarczy?"</em><br><br>Janusz nic nie mówi. Klęczy. Pomyśli o tym jutro.'
      ]
    },

    mietek_drink: {
      icon: '🍺',
      label: 'Piwo z Mietkiem',
      sublabel: '-5 morale, -10 energii, +2 determinacja!',
      cooldownHours: 24,
      cinematic: 'moment-mietek-piwko.webp',
      avatar: 'mietek-portrait.webp',
      speaker: 'MIETEK',
      effects: { morale: -5, energia: -10, determinacja: 2, rel_mietek: 8 },
      flavors: [
        '<em>"Wpadnij na browarka, sąsiad."</em> Mietek pokazuje dwa Żubry. Janusz wchodzi. Mietek opowiada o dawnych czasach. <em>"Wtedy mężczyźni nie biegali. Wtedy mężczyźni pracowali."</em><br><br>Janusz wraca do domu wkurzony. I podekscytowany. <strong>Pokaże mu.</strong>',
        '<em>"Janus, zaśpiewamy?"</em> Mietek odkręca piwo z hukiem. Po godzinie obaj wyją sąsiadom <em>"Hej sokoły"</em>. Halinka z naprzeciwka zamyka okno. Mietek się śmieje.<br><br>Janusz idąc do domu czuje że jego płuca są w opłakanym stanie. <strong>Trzeba biegać.</strong>',
        '<em>"A wiesz że ja kiedyś też biegałem? W wojsku."</em> Mietek pije długim łykiem. <em>"Ale potem przeszło. Wiesz jak."</em><br><br>Janusz nie chce żeby mu też przeszło. <strong>Zaciska zęby.</strong>',
        '<em>"Stary, ty się tym bieganiem zabijesz."</em><br><br>"Może."<br><br><em>"To czemu biegasz?"</em><br><br>Janusz długo myśli. <em>"Bo nie chcę jak Ty być starym z piwem przy płocie."</em><br><br>Cisza. Mietek pije. <em>"Sprawiedliwe."</em>',
        '<em>"Słuchaj, ja Ci coś powiem ale tylko raz. Szanuję."</em><br><br>Janusz nie wie co odpowiedzieć. Mietek nigdy nie szanował. <em>"Tylko nie mów żonie że to powiedziałem. Bo wyłączy mi telewizor."</em>'
      ]
    },

    burek_walk: {
      icon: '🐕',
      label: 'Spacer z Burkiem',
      sublabel: '+3 morale, +5 energii, cooldown 8h',
      cooldownHours: 8,
      cinematic: 'moment-burek-spacer.webp',
      avatar: 'burek-portrait.webp',
      speaker: 'NARRATOR',
      effects: { morale: 3, energia: 5 },
      flavors: [
        'Burek wystawia smycz w pysku. Janusz nie ma siły biec, ale spacer? Spacer zawsze. <br><br>Idą wolno wzdłuż pola. Nie mówią nic. Burek węszy. Janusz oddycha. To wystarcza.',
        'Burek wyprzedził Janusza o 5 metrów, wraca, ponownie wyprzedza. Tak ma już od 7 lat.<br><br>Janusz zaczął rachować ile razy Burek go wyprzedził w życiu. Doszedł do <strong>"za dużo"</strong>.',
        'Spacer przy zachodzącym słońcu. Niebo różowe jak <em>"Mamine pierogi z truskawkami"</em> — pomyślał Janusz. <br><br>Burek się zatrzymał i patrzy w niebo. Może też widzi pierogi.',
        'Burek przyniósł patyk. Janusz rzucił. Burek przyniósł. Janusz rzucił. <br><br>To podstawowy układ wszechświata. Po 15 minutach Janusz czuje że morale wzrosło bez powodu.',
        'Burek przystanął przy drzewie i długo coś tam wąchał. <em>"Burek, co tam?"</em> — Janusz pochylił się. Burek spojrzał z politowaniem. <em>"Ty by nie zrozumiał, człowieku."</em>'
      ]
    },

    read: {
      icon: '📚',
      label: 'Czytaj o bieganiu',
      sublabel: '+1 wiedza, +1 determinacja, cooldown 12h',
      cooldownHours: 12,
      cinematic: null,
      avatar: 'janusz-portrait.webp',
      speaker: 'JANUSZ',
      effects: { wiedza: 1, determinacja: 1 },
      flavors: [
        'Janusz pożyczył z biblioteki "Bieg długodystansowy — podstawy". Czyta o czymś co nazywa się <strong>VO2max</strong>. Nie rozumie. Ale czyta dalej.',
        'W internecie znalazł artykuł "Jak biegać po 40 roku życia". Czyta i kiwa głową. <em>"O tym wiedziałem."</em> Potem czyta drugi raz i już nie kiwa.',
        'Pan z biblioteki podał Januszowi książkę o Kenii. <em>"Tam wszyscy biegają od dziecka."</em> Janusz czyta. <em>"To dlaczego ja zacząłem dopiero teraz?"</em>',
        'Czyta o <strong>"strefach tętna"</strong>. Próbuje policzyć swoje tętno wykładając rękę na szyję. Liczy do 20 i się gubi. <em>"Trzeba kupić zegarek."</em>',
        'Artykuł mówi: <em>"sukces w bieganiu zależy w 30% od talentu, 70% od konsekwencji."</em><br><br>Janusz patrzy w lustro. <em>"Talentu nie mam. Konsekwencji — sprawdzimy."</em>'
      ]
    },

    sleep: {
      icon: '🛌',
      label: 'Idź spać (pomiń dzień)',
      sublabel: '+60 energia, +5 morale, NOWY DZIEŃ',
      cooldownHours: 0,
      cinematic: null,
      avatar: 'janusz-portrait.webp',
      speaker: 'NARRATOR',
      effects: { energia: 60, morale: 5 },
      flavors: [
        'Janusz kładzie się o 21:00. Burek u stóp. Mama gasi światło w kuchni. Jutro nowy dzień.',
        'Janusz patrzy w sufit. Liczy ile dni już biega. Liczy do 14 i zasypia.',
        'Sen przychodzi szybko. We śnie Janusz biegnie maraton. Wygrywa. Anna stoi na mecie.<br><br>Budzi się i nie pamięta wyniku. Ale pamięta że było dobrze.'
      ]
    }
  };

  // ==========================================================
  // PUBLIC API
  // ==========================================================
  JR.actions.list = function() {
    return ACTIONS;
  };

  JR.actions.get = function(key) {
    return ACTIONS[key];
  };

  JR.actions.canPerform = async function(SB) {
    try {
      const { data, error } = await SB.rpc('jr_can_perform_actions');
      if (error) {
        console.warn('[JR actions] canPerform error', error);
        return null;
      }
      return data;
    } catch (err) {
      console.error('[JR actions] canPerform failed', err);
      return null;
    }
  };

  JR.actions.perform = async function(SB, key) {
    const action = ACTIONS[key];
    if (!action) return { ok: false, error: 'unknown_action' };

    try {
      const { data, error } = await SB.rpc('jr_perform_action', { p_action_key: key });
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[JR actions] perform error', err);
      return { ok: false, error: err.message || 'unknown' };
    }
  };

  JR.actions.getFlavor = function(key) {
    const action = ACTIONS[key];
    if (!action || !action.flavors) return '';
    return action.flavors[Math.floor(Math.random() * action.flavors.length)];
  };

  // Helper: czas do następnej dostępności jako string "5h 23m"
  JR.actions.formatCooldown = function(nextAvailableAt) {
    if (!nextAvailableAt) return '';
    const now = new Date();
    const next = new Date(nextAvailableAt);
    const diffMs = next - now;
    if (diffMs <= 0) return 'dostępne';
    const hours = Math.floor(diffMs / 3_600_000);
    const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
    if (hours > 0) return `za ${hours}h ${minutes}m`;
    return `za ${minutes}m`;
  };

})();
