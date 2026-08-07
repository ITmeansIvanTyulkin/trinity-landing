const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Calc = require("../js/lib/capital-allocator.js");

describe("TrinityCapitalAllocator", () => {
  it("exposes WEIGHTS and REGIME_NOTES", () => {
    assert.equal(Calc.WEIGHTS.SIDEWAYS.pairs, 75);
    assert.ok(Calc.REGIME_NOTES.TREND.includes("ADX"));
  });

  it("formatRub rounds and formats ru-RU", () => {
    assert.match(Calc.formatRub(200000.4), /200[\u00a0\s]?000/);
    assert.ok(Calc.formatRub(1).endsWith("₽"));
  });

  it("renorm redistributes positive parts to 100%", () => {
    const r = Calc.renorm({ pairs: 75, trend: 25, arb: 0 });
    assert.equal(r.pairs + r.trend + r.arb, 100);
    assert.equal(r.arb, 0);
    assert.deepEqual(Calc.renorm({ pairs: 0, trend: 0, arb: 0 }), {
      pairs: 100,
      trend: 0,
      arb: 0,
    });
  });

  it("allocSplit: 1 strategy is pairs-only", () => {
    assert.deepEqual(Calc.allocSplit(1, "SIDEWAYS"), {
      pairs: 100,
      trend: 0,
      arb: 0,
    });
  });

  it("allocSplit: 2 strategies drops arb and renorms", () => {
    const s = Calc.allocSplit(2, "SIDEWAYS");
    assert.equal(s.arb, 0);
    assert.equal(s.pairs + s.trend, 100);
  });

  it("allocSplit: 3 strategies uses weights; unknown regime → NEUTRAL", () => {
    assert.deepEqual(Calc.allocSplit(3, "TREND"), Calc.WEIGHTS.TREND);
    assert.deepEqual(Calc.allocSplit(3, "NOPE"), Calc.WEIGHTS.NEUTRAL);
  });

  it("slotsFor caps by capital band", () => {
    assert.equal(Calc.slotsFor(50000), 1);
    assert.equal(Calc.slotsFor(200000), 2);
    assert.equal(Calc.slotsFor(900000), 8);
    assert.equal(Calc.slotsFor(2000000), 12);
  });

  it("scenarioRange respects regime multipliers", () => {
    const base = Calc.scenarioRange(200000, 1, "SIDEWAYS");
    const trend = Calc.scenarioRange(200000, 1, "TREND");
    assert.ok(trend.high < base.high);
    const full = Calc.scenarioRange(200000, 3, "TREND");
    assert.ok(full.high > Calc.scenarioRange(200000, 3, "SIDEWAYS").high);
  });

  it("leverageNote switches at 1M", () => {
    assert.match(Calc.leverageNote(200000), /Без плеча/);
    assert.match(Calc.leverageNote(1000000), /leverage/);
  });

  it("strategyWarn covers n=1/2/3", () => {
    assert.match(Calc.strategyWarn(1, "TREND"), /standby/);
    assert.match(Calc.strategyWarn(1, "SIDEWAYS"), /Оператор/);
    assert.match(Calc.strategyWarn(2, "NEUTRAL"), /Trend EA/);
    assert.match(Calc.strategyWarn(3, "SIDEWAYS"), /Full Trinity/);
  });

  it("buildScenario assembles a full illustrative packet", () => {
    const s = Calc.buildScenario(200000, 3, "SIDEWAYS");
    assert.equal(s.slots, 2);
    assert.equal(s.split.pairs, 75);
    assert.ok(s.range.low < s.range.high);
    assert.ok(s.capitalLabel.includes("₽"));
    assert.ok(s.regimeNote.length > 10);
  });
});
