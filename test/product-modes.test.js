const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Modes = require("../js/lib/product-modes.js");

describe("TrinityProductModes", () => {
  it("modeAt wraps index", () => {
    assert.equal(Modes.modeAt(0).id, "SIDEWAYS");
    assert.equal(Modes.modeAt(3).id, "SIDEWAYS");
    assert.equal(Modes.modeAt(-1).id, "ARBITRAGE");
  });

  it("nextModeIndex cycles 0→1→2→0", () => {
    assert.equal(Modes.nextModeIndex(0), 1);
    assert.equal(Modes.nextModeIndex(2), 0);
  });

  it("getShot / getTip return known keys and null unknowns", () => {
    assert.equal(Modes.getShot("dashboard").title, "Дашборд");
    assert.equal(Modes.getShot("nope"), null);
    assert.equal(Modes.getTip("regime").label, "Режим рынка");
    assert.equal(Modes.getTip("nope"), null);
  });

  it("SHOTS and TIPS cover product showcase surface", () => {
    assert.deepEqual(Object.keys(Modes.SHOTS).sort(), [
      "broker",
      "charts",
      "dashboard",
    ]);
    assert.ok(Modes.TIPS.zscore.body.includes("Z-score") || Modes.TIPS.zscore.body.includes("±2"));
  });

  it("chromeTilt maps pointer to small rotate degrees", () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    const mid = Modes.chromeTilt(50, 50, rect);
    assert.equal(mid.rotateY, 0);
    assert.equal(mid.rotateX, 0);
    const corner = Modes.chromeTilt(100, 0, rect);
    assert.equal(corner.rotateY, 2);
    assert.equal(corner.rotateX, 1.5);
    assert.deepEqual(Modes.chromeTilt(0, 0, null), { rotateY: 0, rotateX: 0 });
  });
});
