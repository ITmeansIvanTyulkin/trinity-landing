/**
 * TRINITY cabinet — mock / demo metrics (standalone).
 *
 * Auth config: js/cabinet-config.js (+ optional cabinet-config.local.js).
 * Auth runtime: js/cabinet-auth.js (Supabase).
 *
 * Optional IMOEX stub:
 *   GET http://localhost:8080/api/paper/journal
 * Set CABINET_CONFIG.imoexBase — mock used when null/unreachable.
 *
 * NO order placement, NO broker token entry here. Trading stays in IMOEX /view.
 */
window.CABINET_DATA = {
  subscription: {
    tier: "Оператор",
    priceRub: 7500,
    delivery: "Core Lite",
    trialActive: true,
    trialDaysLeft: 9,
    trialTotalDays: 14,
    nextBilling: "— (триал, карта не привязана)",
    reverseTrialNote:
      "Reverse-trial: 14 дней полного доступа; после истечения — soft-locks и upsell (как в IMOEX upsell.*). Биллинг на лендинге — mock.",
  },

  unlockKey: {
    masked: "TRINITY-7K2M-••••-••••-A9Q1",
    full: "TRINITY-7K2M-X4PL-9WNR-A9Q1",
    lastRotated: "2026-07-28",
  },

  regime: {
    current: "SIDEWAYS",
    book: "DAILY",
    note: "ADX низкий → pairs mean-reversion в фокусе (иллюстративный режим).",
    source: "mock",
  },

  openSlots: [
    { pair: "MAGN / NLMK", book: "DAILY", z: -1.82, status: "WATCH", size: "—" },
    { pair: "SBER / VTBR", book: "DAILY", z: 2.05, status: "WATCH", size: "—" },
    { pair: "GMKN / PLZL", book: "DAILY", z: -1.41, status: "WATCH", size: "—" },
  ],

  allocation: {
    pairs: 100,
    trend: 0,
    arbitrage: 0,
    labels: {
      pairs: "Pairs (live paper)",
      trend: "Trend (EA / roadmap)",
      arbitrage: "Arbitrage (roadmap)",
    },
  },

  equityCurve: {
    points: [
      200000, 201200, 199800, 202400, 203100, 201900, 204600, 206200,
      205400, 207800, 209100, 208300, 210500, 212000, 211200, 213400,
    ],
  },

  payments: [
    { date: "2026-07-01", plan: "Оператор", amount: "7 500 ₽", status: "Триал", receipt: "—" },
    { date: "2026-06-01", plan: "Обзор", amount: "5 000 ₽", status: "Оплачен", receipt: "#" },
  ],

  roadmap: [
    { label: "Pairs DAILY", detail: "live paper", status: "live" },
    { label: "INTRADAY", detail: "research only", status: "research" },
    { label: "Trend", detail: "EA · Full Core", status: "soon" },
    { label: "Arbitrage", detail: "roadmap · Full Core", status: "soon" },
  ],

  labPairs: [
    {
      id: "magn-nlmk",
      label: "MAGN / NLMK",
      sector: "METALS",
      note: "Металлы · типичный sideways mean-rev кандидат",
    },
    {
      id: "sber-vtbr",
      label: "SBER / VTBR",
      sector: "BANKS",
      note: "Банки · чувствителен к режиму и FA",
    },
    {
      id: "gmkn-plzl",
      label: "GMKN / PLZL",
      sector: "METALS",
      note: "Драгметаллы · cluster обычно eligible",
    },
  ],
};
