(() => {
  /**
   * Landing Capital Allocator scenario calculator.
   * Illustrative only — not a forecast, not live broker PnL.
   */
  const WEIGHTS = {
    SIDEWAYS: { pairs: 75, trend: 12, arb: 13 },
    NEUTRAL: { pairs: 50, trend: 25, arb: 25 },
    TREND: { pairs: 15, trend: 55, arb: 30 },
  };

  const REGIME_NOTES = {
    SIDEWAYS:
      "ADX низкий → pairs mean-reversion в фокусе; trend/arb — резерв сценария.",
    NEUTRAL:
      "Смешанный режим → капитал делится между books более равномерно.",
    TREND:
      "ADX высокий → новые pairs-входы блокируются; в сценарии доминируют Trend EA / Arb.",
  };

  const capitalEl = document.getElementById("calc-capital");
  if (!capitalEl) return;

  const rub = (n) =>
    new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";

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
    let slots = Math.max(1, Math.floor(capital / 100000));
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

    if (n === 1) {
      if (regime === "TREND") {
        lowPct *= 0.35;
        highPct *= 0.45;
      } else if (regime === "NEUTRAL") {
        lowPct *= 0.75;
        highPct *= 0.85;
      }
    } else if (regime === "SIDEWAYS") {
      lowPct *= 0.92;
      highPct *= 0.88;
    } else if (regime === "TREND") {
      lowPct *= 1.05;
      highPct *= 1.12;
    }

    return {
      low: Math.round(capital * lowPct),
      high: Math.round(capital * highPct),
    };
  }

  const capitalLabel = document.querySelector("[data-calc-capital]");
  const strategyInputs = document.querySelectorAll('input[name="calc-strategies"]');
  const regimeInputs = document.querySelectorAll('input[name="calc-regime"]');

  function set(sel, html) {
    const el = document.querySelector(sel);
    if (el) el.innerHTML = html;
  }

  function update() {
    const capital = Number(capitalEl.value);
    const n = Number(
      [...strategyInputs].find((i) => i.checked)?.value || 1
    );
    const regime =
      [...regimeInputs].find((i) => i.checked)?.value || "SIDEWAYS";

    if (capitalLabel) capitalLabel.textContent = rub(capital);

    const slots = slotsFor(capital);
    const split = allocSplit(n, regime);
    const range = scenarioRange(capital, n, regime);
    const leverageNote =
      capital < 1000000
        ? "Без плеча (equity &lt; 1M ₽)"
        : "Возможен leverage-контур при ≥ 1M ₽ (в продукте)";

    const why = document.querySelector("[data-calc-regime-why]");
    if (why) {
      why.textContent =
        (REGIME_NOTES[regime] || "") +
        " Split — иллюстративный сценарий Capital Allocator.";
    }

    set("[data-calc-slots]", String(slots));
    set("[data-calc-gross]", rub(capital));
    set(
      "[data-calc-split]",
      "Pairs " +
        split.pairs +
        "%" +
        (split.trend ? " · Trend EA " + split.trend + "%" : "") +
        (split.arb ? " · Arb " + split.arb + "%" : "") +
        ' <span class="scenario-tag">' +
        regime +
        "</span>"
    );
    set(
      "[data-calc-range]",
      rub(range.low) +
        " … " +
        rub(range.high) +
        ' <span class="scenario-tag">сценарий</span>'
    );
    set(
      "[data-calc-range-capital]",
      "от " + rub(capital) + " капитала · режим " + regime
    );
    set("[data-calc-leverage]", leverageNote);

    const warn = document.querySelector("[data-calc-strategy-warn]");
    if (warn) {
      if (n === 1) {
        warn.textContent =
          regime === "TREND"
            ? "Только pairs: в TREND новые входы редки / блокируются ADX — сценарий standby."
            : "Только pairs (strategy 1) — соответствует тарифу Оператор / live paper.";
      } else if (n === 2) {
        warn.textContent =
          "Pairs + Trend EA — веса по режиму " +
          regime +
          "; early-access / roadmap, не live-гарантия.";
      } else {
        warn.textContent =
          "Full Trinity · режим " +
          regime +
          " — иллюстративный Full Core сценарий; arb и trend на roadmap / EA.";
      }
    }

    const mini = document.querySelector("[data-calc-mini-alloc]");
    if (mini) {
      mini.innerHTML =
        '<i class="a-pairs" style="flex:' +
        split.pairs +
        '"></i>' +
        '<i class="a-trend" style="flex:' +
        (split.trend || 0.001) +
        '"></i>' +
        '<i class="a-arb" style="flex:' +
        (split.arb || 0.001) +
        '"></i>';
    }
  }

  capitalEl.addEventListener("input", update);
  strategyInputs.forEach((i) => i.addEventListener("change", update));
  regimeInputs.forEach((i) => i.addEventListener("change", update));
  update();
})();
