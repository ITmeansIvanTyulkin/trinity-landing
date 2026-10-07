/**
 * Capital Allocator scenario math (pure).
 * Illustrative only — not a forecast / live broker PnL.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TrinityCapitalAllocator = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WEIGHTS = {
    SIDEWAYS: { pairs: 75, trend: 12, arb: 13 },
    NEUTRAL: { pairs: 50, trend: 25, arb: 25 },
    TREND: { pairs: 15, trend: 55, arb: 30 },
  };

  const REGIME_NOTES = {
    SIDEWAYS:
      "Спокойный индекс → в сценарии больше доля «Инвестиций»; тренд и арбитраж — резерв.",
    NEUTRAL:
      "Смешанный режим → капитал делится между тремя книгами ровнее.",
    TREND:
      "ADX индекса высокий → доля сценария уходит тренд-деску и календарю. Книга «Инвестиции» не блокируется.",
  };

  function formatRub(n) {
    return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";
  }

  function renorm(parts) {
    const entries = Object.entries(parts).filter(([, v]) => v > 0);
    const sum = entries.reduce((a, [, v]) => a + v, 0);
    if (sum <= 0) return { pairs: 100, trend: 0, arb: 0 };
    const out = { pairs: 0, trend: 0, arb: 0 };
    let allocated = 0;
    const keys = entries.map(([k]) => k);
    keys.forEach((k, i) => {
      if (i === keys.length - 1) {
        out[k] = 100 - allocated;
      } else {
        const v = Math.round((100 * parts[k]) / sum);
        out[k] = v;
        allocated += v;
      }
    });
    return out;
  }

  function allocSplit(n, regime) {
    const w = WEIGHTS[regime] || WEIGHTS.NEUTRAL;
    if (n === 1) return { pairs: 100, trend: 0, arb: 0 };
    if (n === 2) return renorm({ pairs: w.pairs, trend: w.trend, arb: 0 });
    return { pairs: w.pairs, trend: w.trend, arb: w.arb };
  }

  function slotsFor(capital) {
    let slots = Math.max(1, Math.floor(Number(capital) / 100000));
    if (capital >= 1000000) slots = Math.min(slots, 12);
    else slots = Math.min(slots, 8);
    return slots;
  }

  function scenarioRange(capital, n, regime) {
    const bands = {
      1: { lowPct: 0.005, highPct: 0.025 },
      2: { lowPct: 0.008, highPct: 0.045 },
      3: { lowPct: 0.012, highPct: 0.07 },
    };
    let { lowPct, highPct } = bands[n] || bands[1];

    if (n > 1 && regime === "SIDEWAYS") {
      lowPct *= 0.92;
      highPct *= 0.88;
    } else if (n > 1 && regime === "TREND") {
      lowPct *= 1.05;
      highPct *= 1.12;
    }

    return {
      low: Math.round(capital * lowPct),
      high: Math.round(capital * highPct),
    };
  }

  function leverageNote(capital) {
    return capital < 1000000
      ? "Без плеча (equity < 1M ₽)"
      : "Возможен leverage-контур при ≥ 1M ₽ (в продукте)";
  }

  function strategyWarn(n, regime) {
    if (n === 1) {
      return regime === "TREND"
        ? "Только «Инвестиции»: книга акций по чеклисту. Тренд-деск и календарь в этом сценарии не участвуют."
        : "Сценарий одной книги — «Инвестиции». Полный штаб включает ещё тренд и арбитраж.";
    }
    if (n === 2) {
      return (
        "Инвестиции + тренд-деск — доли по режиму " +
        regime +
        "; fair-paper, live на срочке только после явного включения."
      );
    }
    return (
      "Полный контур · режим " +
      regime +
      " — инвестиции, тренд и арбитраж в одном сценарии; срочка остаётся fair-paper, пока live не включён."
    );
  }

  function buildScenario(capital, n, regime) {
    const reg = regime || "SIDEWAYS";
    const count = Number(n) || 1;
    const cap = Number(capital) || 0;
    const split = allocSplit(count, reg);
    const range = scenarioRange(cap, count, reg);
    return {
      capital: cap,
      strategies: count,
      regime: reg,
      slots: slotsFor(cap),
      split: split,
      range: range,
      leverageNote: leverageNote(cap),
      strategyWarn: strategyWarn(count, reg),
      regimeNote: REGIME_NOTES[reg] || "",
      capitalLabel: formatRub(cap),
    };
  }

  return {
    WEIGHTS: WEIGHTS,
    REGIME_NOTES: REGIME_NOTES,
    formatRub: formatRub,
    renorm: renorm,
    allocSplit: allocSplit,
    slotsFor: slotsFor,
    scenarioRange: scenarioRange,
    leverageNote: leverageNote,
    strategyWarn: strategyWarn,
    buildScenario: buildScenario,
  };
});
