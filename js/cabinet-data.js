/**
 * TRINITY cabinet — honest defaults (no fake PnL / invented trades).
 *
 * Auth config: js/cabinet-config.js (+ optional cabinet-config.local.js).
 * Auth runtime: js/cabinet-auth.js (Supabase).
 *
 * Live desk numbers: Supabase `desk_snapshots` (written by the desktop app).
 * Optional local fallback: GET pairs + trend + calendar-arb journals and regime
 *   — developer machine only; never shown as a user URL.
 *
 * NO order placement, NO broker token entry here.
 */
window.CABINET_DATA = {
  subscription: {
    tier: "Оператор",
    priceRub: 7500,
    delivery: "Базовая",
    trialActive: false,
    trialDaysLeft: 0,
    trialTotalDays: 7,
    nextBilling: "Оплата ещё не подключена",
    reverseTrialNote:
      "Скачайте приложение на компьютер. Семь дней триала начнутся с первого запуска. В триале нет живых заявок у брокера.",
  },

  liveSource: {
    kind: "empty",
    flag: "Нет снимка",
    line: "Это не живые данные. Приложение ещё не присылало снимок — блоки пустые, без выдуманного результата.",
  },

  unlockKey: {
    status: "pending",
    masked: "—",
    full: "",
    lastRotated: "",
    note: "Ключ появится вместе с приложением. Триал 7 дней — с первого запуска, без живых заявок.",
  },

  regime: {
    current: "UNKNOWN",
    book: "DAILY",
    note: "Режим рынка придёт из приложения, когда оно пришлёт снимок. Запустите стол на компьютере.",
    source: "offline",
    adx: null,
  },

  /* Empty until /api/paper/journal answers (or stay empty offline). */
  openSlots: [],

  bookSplit: [],

  equityCurve: {
    points: [],
    label: "Пока нечего показать",
    note: "Кривая появится, когда приложение на компьютере пришлёт снимок. Здесь мы не рисуем выдуманный результат.",
  },

  paperSummary: {
    realizedPnlRub: null,
    unrealizedPnlRub: null,
    openCount: 0,
    closedCount: 0,
    updatedAt: null,
  },

  payments: [],

  strategies: [],

  /* Filled from the desk analysis / catalog in decision-lab.js */
  labPairs: [],
  labDesk: null,
};
