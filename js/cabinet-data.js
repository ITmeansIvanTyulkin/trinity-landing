/**
 * TRINITY cabinet — honest defaults (no fake PnL / invented trades).
 *
 * Auth config: js/cabinet-config.js (+ optional cabinet-config.local.js).
 * Auth runtime: js/cabinet-auth.js (Supabase).
 *
 * Optional live read-only IMOEX (CORS required):
 *   GET {imoexBase}/api/paper/journal
 *   GET {imoexBase}/api/analysis/regime
 * Set CABINET_CONFIG.imoexBase — e.g. "http://localhost:8080"
 *
 * NO order placement, NO broker token entry here. Trading stays in IMOEX /view.
 */
window.CABINET_DATA = {
  subscription: {
    tier: "Оператор",
    priceRub: 7500,
    delivery: "Core Lite",
    trialActive: false,
    trialDaysLeft: 0,
    trialTotalDays: 14,
    nextBilling: "Биллинг не подключён",
    reverseTrialNote:
      "Подписка и reverse-trial заведутся после биллинга / Instance delivery. Сейчас кабинет — аккаунт и research-обзор, без выдуманных оплат.",
  },

  unlockKey: {
    status: "pending",
    masked: "—",
    full: "",
    lastRotated: "",
    note: "Unlock-ключ выдаётся после Instance delivery. Перевыпуск из кабинета пока недоступен.",
  },

  regime: {
    current: "UNKNOWN",
    book: "DAILY",
    note: "Режим рынка смотрите в IMOEX /view. Здесь — только если подключён read-only imoexBase.",
    source: "offline",
    adx: null,
  },

  /* Empty until /api/paper/journal answers (or stay empty offline). */
  openSlots: [],

  allocation: {
    pairs: 100,
    trend: 0,
    arbitrage: 0,
    labels: {
      pairs: "Pairs (DAILY paper)",
      trend: "Trend (BR M5 desk)",
      arbitrage: "Arbitrage (calendar desk)",
    },
    note: "Тариф Оператор / Core Lite: фокус DAILY pairs. Trend и arb desks — на Full Core / Instance.",
  },

  equityCurve: {
    points: [],
    label: "Нет paper equity в кабинете",
    note: "Кривая капитала — в IMOEX /view (paper statement). Здесь не рисуем иллюстративный PnL.",
  },

  paperSummary: {
    realizedPnlRub: null,
    unrealizedPnlRub: null,
    openCount: 0,
    closedCount: 0,
    updatedAt: null,
  },

  payments: [],

  roadmap: [
    { label: "Pairs DAILY", detail: "live paper", status: "live" },
    { label: "INTRADAY", detail: "research only", status: "research" },
    { label: "Trend BR M5", detail: "SANDBOX_FAIR desk", status: "live" },
    { label: "Calendar arb", detail: "fair-paper desk", status: "live" },
  ],

  labPairs: [
    {
      id: "magn-nlmk",
      label: "MAGN / NLMK",
      sector: "METALS",
      note: "Металлы · типичный sideways mean-rev кандидат (лаборатория, не live-слот)",
    },
    {
      id: "sber-vtbr",
      label: "SBER / VTBR",
      sector: "BANKS",
      note: "Банки · чувствителен к режиму и FA (лаборатория)",
    },
    {
      id: "gmkn-plzl",
      label: "GMKN / PLZL",
      sector: "METALS",
      note: "Драгметаллы · cluster обычно eligible (лаборатория)",
    },
  ],
};
