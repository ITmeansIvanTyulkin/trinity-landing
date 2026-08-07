const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Unlock = require("../js/lib/unlock-key.js");

describe("TrinityUnlockKey", () => {
  it("segmentFromRandom returns 4 alnum chars", () => {
    const seg = Unlock.segmentFromRandom(() => 0.123456789);
    assert.equal(seg.length, 4);
    assert.match(seg, /^[A-Z0-9]+$/);
  });

  it("maskKey hides middle segments", () => {
    const masked = Unlock.maskKey("TRINITY-7K2M-X4PL-9WNR-A9Q1");
    assert.match(masked, /^TRINITY-7K2M-••••-••••-A9Q1$/);
  });

  it("generateKey builds full + masked + date", () => {
    let i = 0;
    const seq = [0.11, 0.22, 0.33, 0.44, 0.55, 0.66, 0.77, 0.88];
    const key = Unlock.generateKey(
      () => seq[i++ % seq.length],
      new Date("2026-08-07T12:00:00.000Z")
    );
    assert.match(key.full, /^TRINITY-[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
    assert.equal(key.masked, Unlock.maskKey(key.full));
    assert.equal(key.lastRotated, "2026-08-07");
  });

  it("displayKey / toggleLabel honor reveal flag", () => {
    const current = {
      full: "TRINITY-AAAA-BBBB-CCCC-DDDD",
      masked: "TRINITY-AAAA-••••-••••-DDDD",
    };
    assert.equal(Unlock.displayKey(current, false), current.masked);
    assert.equal(Unlock.displayKey(current, true), current.full);
    assert.equal(Unlock.displayKey(null, true), "");
    assert.equal(Unlock.toggleLabel(false), "Показать");
    assert.equal(Unlock.toggleLabel(true), "Скрыть");
  });
});
