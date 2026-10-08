const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Lab = require("../js/lib/decision-lab.js");

describe("TrinityDecisionLab calendar-arb scenario", () => {
  const base = Lab.defaultGates();

  it("exposes Z bands and families", () => {
    assert.equal(Lab.Z_WATCH, 1.5);
    assert.equal(Lab.Z_ENTER, 2.0);
    assert.equal(Lab.Z_LATE, 3.0);
    assert.ok(Lab.FAMILIES.length >= 5);
    assert.equal(Lab.familyById("BR").id, "BR");
  });

  it("PAPER OPEN on green default gates", () => {
    const r = Lab.evaluatePipeline(base);
    assert.equal(r.outcome, "PAPER OPEN");
    assert.equal(r.outcomeClass, "lab-out-enter");
    assert.match(r.reason, /buy next|дешёвый/i);
  });

  it("WATCH when waiting for recede", () => {
    const r = Lab.evaluatePipeline({ ...base, recede: false });
    assert.equal(r.outcome, "WATCH");
    assert.match(r.reason, /recede/i);
  });

  it("WATCH on mid |Z|", () => {
    const r = Lab.evaluatePipeline({ ...base, zAbs: 1.7 });
    assert.equal(r.outcome, "WATCH");
  });

  it("BLOCK outside session / roll / event", () => {
    assert.equal(
      Lab.evaluatePipeline({ ...base, session: false }).outcome,
      "BLOCK"
    );
    assert.equal(
      Lab.evaluatePipeline({ ...base, rollOk: false }).outcome,
      "BLOCK"
    );
    assert.equal(
      Lab.evaluatePipeline({ ...base, eventClear: false }).outcome,
      "BLOCK"
    );
  });

  it("BLOCK on broken curve, thin costs, GO, late |Z|", () => {
    assert.equal(
      Lab.evaluatePipeline({ ...base, curve: "broken" }).outcome,
      "BLOCK"
    );
    assert.equal(
      Lab.evaluatePipeline({ ...base, curve: "slope" }).outcome,
      "BLOCK"
    );
    assert.equal(
      Lab.evaluatePipeline({ ...base, costOk: false }).outcome,
      "BLOCK"
    );
    assert.equal(
      Lab.evaluatePipeline({ ...base, goOk: false }).outcome,
      "BLOCK"
    );
    assert.equal(
      Lab.evaluatePipeline({ ...base, zAbs: 3.2 }).outcome,
      "BLOCK"
    );
  });

  it("rich side explains short-spread scenario", () => {
    const r = Lab.evaluatePipeline({ ...base, side: "rich" });
    assert.equal(r.outcome, "PAPER OPEN");
    assert.match(r.reason, /sell next|дорог/i);
  });

  it("fly structure mentions wings", () => {
    const r = Lab.evaluatePipeline({ ...base, structure: "fly" });
    assert.equal(r.outcome, "PAPER OPEN");
    assert.match(r.reason, /крыл|бабоч/i);
  });

  it("returns ordered checklist steps", () => {
    const r = Lab.evaluatePipeline(base);
    assert.ok(r.steps.length >= 8);
    assert.deepEqual(
      r.steps.slice(0, 4).map((s) => s.id),
      ["tech", "session", "roll", "event"]
    );
  });

  it("sameGates / defaultGates / buildLabState", () => {
    const a = Lab.defaultGates();
    assert.equal(Lab.sameGates(a, Lab.defaultGates()), true);
    assert.equal(Lab.sameGates(a, { ...a, session: false }), false);
    const s = Lab.buildLabState();
    assert.deepEqual(s.pairs, []);
    assert.match(s.line, /ручн/i);
    assert.deepEqual(Lab.catalogPairs(), []);
  });
});
