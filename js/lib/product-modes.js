/**
 * Landing hero mode pill + product showcase copy (pure data/helpers).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TrinityProductModes = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MODES = [
    { id: "SIDEWAYS", book: "DAILY", alloc: "100% pairs", focus: "mean-rev" },
    { id: "TREND", book: "M5", alloc: "trend desk", focus: "BRV6" },
    { id: "ARBITRAGE", book: "FUT", alloc: "calendar", focus: "spread" },
  ];

  const SHOTS = {
    dashboard: {
      url: "/view · dashboard",
      kicker: "Multi-strategy",
      title: "Дашборд",
      lead:
        "Четыре столпа на одном экране: коинтеграция (ресёрch), тренд диапазон BRV6, позиционная и календарный арбитраж. Лента «Сейчас», paper PnL и «Анализ + paper».",
      bullets: [
        "Коинтеграция: sit-out / ресёрch — cash РФ или quality-пары",
        "Тренд · диапазон: BRV6 · последняя TP2 +224 ₽ · ждём confirm",
        "Calendar arb: FORTS spread · T-Invest · paper, live gated",
      ],
    },
    charts: {
      url: "/view/charts · pair spread",
      kicker: "Техника пары",
      title: "Спред / Z-score",
      lead:
        "Спред с KAMA и Z-score с порогами ±2: стрелки входа/выхода и текущий сигнал — rationale mean-reversion наглядно.",
      bullets: [
        "Спред + Kaufman Adaptive MA",
        "Z-score: купить / продать / выход",
        "Пороги и «СЕЙЧАС» — без чёрного ящика",
      ],
    },
    broker: {
      url: "/view/settings · broker",
      kicker: "Исполнение",
      title: "Брокерская консоль",
      lead:
        "T-Invest sandbox: токен и счёт в UI, reconcile, пополнение песочницы и kill-switch — без правки application-local.yml.",
      bullets: [
        "Статус и сверка paper ↔ брокер",
        "AUTO / sandbox / лимитные заявки",
        "Токен хранится в операторке, не на лендинге",
      ],
    },
  };

  const TIPS = {
    cointegration: {
      label: "Коинтеграция",
      body: "Sit-out / ресёрch: ни один сектор не доказан — cash РФ или quality-пары.",
    },
    trendRange: {
      label: "Тренд · диапазон",
      body: "BRV6 · интрадей. Последняя TP2 +224 ₽ — зона размечена, ждём confirm на графике.",
    },
    calendarArb: {
      label: "Календарный арбитраж",
      body: "FORTS spread · котировки T-Invest · paper-сделки, live-ордера отключены.",
    },
    regime: {
      label: "Режим рынка",
      body: "TREND + ADX 34 → блок новых pairs-входов. Mean-reversion ждёт SIDEWAYS.",
    },
    capital: {
      label: "Капитал",
      body: "Equity 200 000 ₽ · 100% DAILY · INTRADAY 0%. Плечо выкл при equity &lt; 1M ₽.",
    },
    universe: {
      label: "Вселенная",
      body: "55 тикеров · 178 пар · топ-2 по коинтеграции. Исследовательский контур, не автоордер.",
    },
    broker: {
      label: "Брокер",
      body: "Токен и счёт подключены. Контур AUTO · sandbox — безопасная проверка исполнения.",
    },
    next: {
      label: "Что сделать сейчас",
      body: "Подсказка оператору: смотреть режим, запустить «Анализ + paper», разобрать Итог / Paper.",
    },
    spread: {
      label: "Спред + KAMA",
      body: "Сырой спред и адаптивная средняя — база для Z-score и визуальной оценки разъезда.",
    },
    zscore: {
      label: "Z-score",
      body: "Пороги ±2σ и стрелки входа/выхода. Research-сигнал, не кнопка «купить на бирже».",
    },
    now: {
      label: "Сейчас",
      body: "Текущий вердикт по паре (например ПРОДАТЬ спред) — для разбора, не автоордер с лендинга.",
    },
    sandbox: {
      label: "Песочница",
      body: "T-Invest sandbox готов: paper pairs и позиции брокера сверяются без боевого риска.",
    },
    token: {
      label: "Токен / счёт",
      body: "Токен и accountId задаются в настройках операторки. На маркетинговом кабинете их нет.",
    },
    safety: {
      label: "Защита",
      body: "Kill-switch и market-exit — аварийные тумблеры. По умолчанию выключены, пока не включите сами.",
    },
  };

  function modeAt(index) {
    const i = ((index % MODES.length) + MODES.length) % MODES.length;
    return MODES[i];
  }

  function nextModeIndex(index) {
    return (Number(index) + 1) % MODES.length;
  }

  function getShot(id) {
    return SHOTS[id] || null;
  }

  function getTip(key) {
    return TIPS[key] || null;
  }

  function chromeTilt(clientX, clientY, rect) {
    if (!rect || !rect.width || !rect.height) {
      return { rotateY: 0, rotateX: 0 };
    }
    const x = (clientX - rect.left) / rect.width - 0.5;
    const y = (clientY - rect.top) / rect.height - 0.5;
    return {
      rotateY: +(x * 4).toFixed(2),
      rotateX: +(-y * 3).toFixed(2),
    };
  }

  return {
    MODES: MODES,
    SHOTS: SHOTS,
    TIPS: TIPS,
    modeAt: modeAt,
    nextModeIndex: nextModeIndex,
    getShot: getShot,
    getTip: getTip,
    chromeTilt: chromeTilt,
  };
});
