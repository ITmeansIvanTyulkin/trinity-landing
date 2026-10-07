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
    { id: "SIDEWAYS", book: "D1", alloc: "инвестиции", focus: "фундамент" },
    { id: "TREND", book: "M5", alloc: "trend desk", focus: "BRV6" },
    { id: "ARBITRAGE", book: "FUT", alloc: "calendar", focus: "spread" },
  ];

  const SHOTS = {
    dashboard: {
      url: "",
      kicker: "Multi-strategy",
      title: "Дашборд",
      lead:
        "Пять карточек штаба: инвестиции, тренд по диапазону, позиция, мини-фьючерс BRM и календарный арбитраж. Лента «Сейчас», paper PnL и «Анализ + paper».",
      bullets: [
        "Инвестиции: фундамент, дневной тренд, зоны и кластеры",
        "Тренд · диапазон и BRM мини — один нефтяной чеклист, разный номинал",
        "Календарный арбитраж: спред FORTS, paper, live только после включения",
      ],
    },
    broker: {
      url: "",
      kicker: "Исполнение",
      title: "Брокерская консоль",
      lead:
        "T-Invest sandbox: токен и счёт в UI, reconcile, пополнение песочницы и kill-switch.",
      bullets: [
        "Статус и сверка paper ↔ брокер",
        "AUTO / sandbox / лимитные заявки",
        "Токен хранится в операторке, не на лендинге",
      ],
    },
  };

  const TIPS = {
    investments: {
      label: "Инвестиции",
      body: "Книга акций: фундамент, дневной тренд, зоны объёма и кластеры. Авторежим включается на деске, вручную стратегия открывается в кабинете.",
    },
    trendRange: {
      label: "Тренд · диапазон",
      body: "Нефть BR на M5: зона размечена, ждём confirm. Тот же чеклист доступен на мини-фьючерсе BRM.",
    },
    calendarArb: {
      label: "Календарный арбитраж",
      body: "FORTS spread · котировки T-Invest · paper-сделки, live-ордера отключены.",
    },
    regime: {
      label: "Режим рынка",
      body: "Режим индекса смещает долю сценария между книгами. Высокий ADX не выключает «Инвестиции»: акции идут по своему чеклисту.",
    },
    capital: {
      label: "Капитал",
      body: "Equity 200 000 ₽. Плечо выключено, пока счёт меньше 1 млн ₽.",
    },
    universe: {
      label: "Вселенная",
      body: "Ликвидные акции широкого рынка: нефть, металлы, банки, ритейл. Отбор идёт по чеклисту фундамента.",
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
      body: "Песочница брокера готова: paper-журнал и позиции сверяются без боевого риска.",
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
