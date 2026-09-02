(() => {
  /**
   * Landing Capital Allocator scenario calculator UI.
   * Logic lives in js/lib/capital-allocator.js
   */
  const Calc = window.TrinityCapitalAllocator;
  const capitalEl = document.getElementById("calc-capital");
  if (!capitalEl || !Calc) return;

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

    const s = Calc.buildScenario(capital, n, regime);

    if (capitalLabel) capitalLabel.textContent = s.capitalLabel;

    const why = document.querySelector("[data-calc-regime-why]");
    if (why) {
      why.textContent =
        s.regimeNote + " Split — иллюстративный сценарий Capital Allocator.";
    }

    set("[data-calc-slots]", String(s.slots));
    set("[data-calc-gross]", Calc.formatRub(s.capital));
    set(
      "[data-calc-split]",
      "Pairs " +
        s.split.pairs +
        "%" +
        (s.split.trend ? " · Trend desk " + s.split.trend + "%" : "") +
        (s.split.arb ? " · Arb " + s.split.arb + "%" : "") +
        ' <span class="scenario-tag">' +
        s.regime +
        "</span>"
    );
    set(
      "[data-calc-range]",
      Calc.formatRub(s.range.low) +
        " … " +
        Calc.formatRub(s.range.high) +
        ' <span class="scenario-tag">сценарий</span>'
    );
    set(
      "[data-calc-range-capital]",
      "от " + Calc.formatRub(s.capital) + " капитала · режим " + s.regime
    );
    set(
      "[data-calc-leverage]",
      s.leverageNote.replace("<", "&lt;")
    );

    const warn = document.querySelector("[data-calc-strategy-warn]");
    if (warn) warn.textContent = s.strategyWarn;

    const mini = document.querySelector("[data-calc-mini-alloc]");
    if (mini) {
      mini.innerHTML =
        '<i class="a-pairs" style="flex:' +
        s.split.pairs +
        '"></i>' +
        '<i class="a-trend" style="flex:' +
        (s.split.trend || 0.001) +
        '"></i>' +
        '<i class="a-arb" style="flex:' +
        (s.split.arb || 0.001) +
        '"></i>';
    }
  }

  capitalEl.addEventListener("input", update);
  strategyInputs.forEach((i) => i.addEventListener("change", update));
  regimeInputs.forEach((i) => i.addEventListener("change", update));
  update();
})();
