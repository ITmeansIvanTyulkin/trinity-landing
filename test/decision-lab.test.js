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
    assert.match(r.reason, /TREND/);
  });

  it("BLOCK when cluster ineligible", () => {
    const r = Lab.evaluatePipeline({ ...base, cluster: false });
    assert.equal(r.outcome, "BLOCK");
    assert.match(r.reason, /Cluster/);
  });

  it("BLOCK when FA fails", () => {
    const r = Lab.evaluatePipeline({ ...base, fa: "fail" });
    assert.equal(r.outcome, "BLOCK");
    assert.match(r.reason, /FA/);
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
