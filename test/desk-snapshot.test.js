const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Snap = require("../js/lib/desk-snapshot.js");

describe("TrinityDeskSnapshot", () => {
  it("exposes a 7-day trial", () => {
    assert.equal(Snap.TRIAL_DAYS, 7);
  });

  it("empty row: download copy, not live trading", () => {
    const n = Snap.normalize(null);
    assert.equal(n.hasRow, false);
    assert.match(Snap.licenseCopy(n), /Скачайте приложение/);
    assert.equal(n.liveTrading, false);
  });

  it("trial copy names remaining days", () => {
    const n = Snap.normalize({
      license_status: "trial",
      trial_days_left: 5,
      live_trading: false,
      updated_at: new Date().toISOString(),
    });
    assert.equal(n.trialActive, true);
    assert.match(Snap.licenseCopy(n), /5 из 7/);
    assert.match(Snap.licenseCopy(n), /Живых заявок/);
  });

  it("expired copy: app opens, robot after pay", () => {
    const n = Snap.normalize({
      license_status: "expired",
      trial_days_left: 0,
      updated_at: new Date().toISOString(),
    });
    assert.equal(n.trialActive, false);
    assert.match(Snap.licenseCopy(n), /закончились/);
    assert.match(Snap.licenseCopy(n), /автоторги/);
  });

  it("trial_ends_at in the past expires even if status still trial", () => {
    const n = Snap.normalize({
      license_status: "trial",
      trial_days_left: 99,
      trial_ends_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    });
    assert.equal(n.licenseStatus, "expired");
    assert.equal(n.liveTrading, false);
  });

  it("active from DB is treated as paid", () => {
    const n = Snap.normalize({
      license_status: "active",
      live_trading: false,
      updated_at: new Date().toISOString(),
    });
    assert.equal(n.licenseStatus, "active");
    assert.equal(n.liveTrading, true);
  });

  it("marks stale snapshots", () => {
    const old = new Date(Date.now() - Snap.STALE_MS - 1000).toISOString();
    assert.equal(Snap.isStale(old), true);
    assert.equal(Snap.normalize({ updated_at: old }).stale, true);
  });

  it("parses slots and equity points", () => {
    const n = Snap.normalize({
      license_status: "trial",
      trial_days_left: 7,
      updated_at: new Date().toISOString(),
      equity_points: [0, 10, 8],
      open_slots: [{ pair: "SBER / VTBR", book: "DAILY", z: "1.9", status: "OPEN", size: "50%", side: "BUY", entryPrice: 280.5 }],
    });
    assert.deepEqual(n.equityPoints, [0, 10, 8]);
    assert.equal(n.openSlots[0].pair, "SBER / VTBR");
    assert.equal(n.openSlots[0].side, "BUY");
    assert.equal(n.openSlots[0].entryPrice, 280.5);
  });

  it("source copy: empty is not live", () => {
    const c = Snap.dataSourceCopy("none");
    assert.equal(c.kind, "empty");
    assert.equal(c.flag, "Нет снимка");
    assert.match(c.line, /не живые данные/i);
  });

  it("source copy: fresh snapshot is live from the app", () => {
    const now = new Date("2026-09-14T12:00:00Z");
    const c = Snap.dataSourceCopy("snapshot", {
      stale: false,
      updatedAt: new Date(now.getTime() - 120000).toISOString(),
      now: now,
    });
    assert.equal(c.kind, "live");
    assert.equal(c.flag, "Из приложения");
    assert.match(c.line, /Живые данные из вашего приложения/);
    assert.match(c.line, /2 мин назад/);
  });

  it("source copy: stale snapshot is not live", () => {
    const c = Snap.dataSourceCopy("snapshot", {
      stale: true,
      updatedAt: new Date(Date.now() - Snap.STALE_MS - 1000).toISOString(),
    });
    assert.equal(c.kind, "stale");
    assert.equal(c.flag, "Снимок устарел");
    assert.match(c.line, /не живые данные/i);
  });

  it("source copy: local desk is live on this computer", () => {
    const c = Snap.dataSourceCopy("local");
    assert.equal(c.kind, "local");
    assert.equal(c.flag, "С этого компьютера");
    assert.match(c.line, /Живые данные с приложения/);
  });

  it("formatAge: just now and minutes", () => {
    const now = new Date("2026-09-14T12:00:00Z");
    assert.equal(Snap.formatAge(now.toISOString(), now), "только что");
    assert.equal(
      Snap.formatAge(new Date(now.getTime() - 5 * 60 * 1000).toISOString(), now),
      "5 мин назад"
    );
  });
});
