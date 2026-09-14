const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Lab = require("../js/lib/decision-lab.js");

describe("TrinityDecisionLab.evaluatePipeline", () => {
  const base = {
    zAbs: 2.0,
    regime: "SIDEWAYS",
    cluster: true,
    fa: "pass",
    book: "DAILY",
    atas: true,
    sector: "METALS",
  };

  it("exposes Z thresholds", () => {
    assert.equal(Lab.Z_ENTER, 1.8);
    assert.equal(Lab.Z_WATCH, 1.4);
  });

  it("PAPER OPEN when DAILY tech+gates pass", () => {
    const r = Lab.evaluatePipeline(base);
    assert.equal(r.outcome, "PAPER OPEN");
    assert.equal(r.outcomeClass, "lab-out-enter");
    assert.equal(r.steps.find((s) => s.id === "tech").status, "pass");
  });

  it("BLOCK on TREND regime", () => {
    const r = Lab.evaluatePipeline({ ...base, regime: "TREND" });
    assert.equal(r.outcome, "BLOCK");
    assert.match(r.reason, /тренд/i);
  });

  it("BLOCK when cluster ineligible", () => {
    const r = Lab.evaluatePipeline({ ...base, cluster: false });
    assert.equal(r.outcome, "BLOCK");
    assert.match(r.reason, /сектор/i);
  });

  it("BLOCK when FA fails", () => {
    const r = Lab.evaluatePipeline({ ...base, fa: "fail" });
    assert.equal(r.outcome, "BLOCK");
    assert.match(r.reason, /фундамент/i);
  });

  it("WATCH on weak FA or low Z", () => {
    assert.equal(
      Lab.evaluatePipeline({ ...base, fa: "weak" }).outcome,
      "WATCH"
    );
    assert.equal(
      Lab.evaluatePipeline({ ...base, zAbs: 1.0 }).outcome,
      "WATCH"
    );
    assert.equal(
      Lab.evaluatePipeline({ ...base, zAbs: 1.5 }).outcome,
      "WATCH"
    );
  });

  it("INTRADAY → RESEARCH when ATAS ok; WATCH when ATAS blocks", () => {
    assert.equal(
      Lab.evaluatePipeline({ ...base, book: "INTRADAY", atas: true }).outcome,
      "RESEARCH"
    );
    assert.equal(
      Lab.evaluatePipeline({ ...base, book: "INTRADAY", atas: false }).outcome,
      "WATCH"
    );
  });

  it("always returns five-ish ordered steps with ids", () => {
    const r = Lab.evaluatePipeline(base);
    assert.ok(r.steps.length >= 5);
    assert.deepEqual(
      r.steps.slice(0, 4).map((s) => s.id),
      ["tech", "regime", "cluster", "fa"]
    );
  });
});

describe("TrinityDecisionLab.buildLabState", () => {
  it("expands catalog beyond the three demo pairs", () => {
    assert.ok(Lab.catalogPairs().length >= 20);
    assert.ok(Lab.catalogPairs().some((p) => p.id === "gazp-lkoh"));
    assert.ok(Lab.catalogPairs().some((p) => p.id === "magn-nlmk"));
  });

  it("maps desk sit-out to cluster=false and live regime", () => {
    const s = Lab.buildLabState({
      regime: { label: "NEUTRAL", blockEntries: false },
      report: {
        tickersAnalyzed: 32,
        pairsTested: 113,
        cointegratedPairs: 0,
        topPairs: [],
        recommendations: [],
      },
      cluster: {
        sitOut: true,
        champion: null,
        sectors: [
          { sector: "OIL_GAS", eligible: false },
          { sector: "BANKS", eligible: false },
          { sector: "METALS_MINING", eligible: false },
          { sector: "RETAIL", eligible: false },
        ],
      },
      recommendations: [],
    });
    assert.equal(s.regime, "NEUTRAL");
    assert.equal(s.sitOut, true);
    assert.ok(s.pairs.length >= 20);
    const banks = s.pairs.find((p) => p.id === "sber-vtbr");
    assert.equal(banks.cluster, false);
    assert.equal(banks.live, false);
    const g = Lab.gatesFromPair(banks, { regime: s.regime });
    assert.equal(g.regime, "NEUTRAL");
    assert.equal(g.cluster, false);
    assert.equal(g.fa, "weak");
    const verdict = Lab.evaluatePipeline(g);
    assert.equal(verdict.outcome, "BLOCK");
    assert.match(s.line, /фаворита нет/i);
  });

  it("promotes recommendation Z into live pair gates", () => {
    const s = Lab.buildLabState({
      regime: { label: "SIDEWAYS" },
      recommendations: [
        {
          tickerY: "MAGN",
          tickerX: "NLMK",
          currentZScore: -2.1,
          signal: "LONG_SPREAD",
          summary: "Спред ниже среднего",
        },
      ],
      cluster: {
        sitOut: false,
        champion: "METALS_MINING",
        sectors: [{ sector: "METALS_MINING", eligible: true }],
      },
      finals: [{ tickerY: "MAGN", tickerX: "NLMK", decision: "ENTER" }],
    });
    const p = s.pairs.find((x) => x.id === "magn-nlmk");
    assert.equal(p.live, true);
    assert.equal(p.zAbs, 2.1);
    assert.equal(p.cluster, true);
    assert.equal(p.fa, "pass");
    const g = Lab.gatesFromPair(p);
    assert.equal(Lab.evaluatePipeline(g).outcome, "PAPER OPEN");
    assert.equal(Lab.sameGates(g, g), true);
  });

  it("faFromDecision maps ENTER / WATCH / BLOCK", () => {
    assert.equal(Lab.faFromDecision("ENTER"), "pass");
    assert.equal(Lab.faFromDecision("WATCH"), "weak");
    assert.equal(Lab.faFromDecision("BLOCK"), "fail");
  });
});
