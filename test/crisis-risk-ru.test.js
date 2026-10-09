const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Cri = require("../js/lib/crisis-risk-ru.js");

describe("TrinityCrisisRiskRu", () => {
  it("has 24 indicators with weights summing to 100", () => {
    assert.equal(Cri.INDICATORS.length, 24);
    const sum = Cri.INDICATORS.reduce((s, i) => s + i.weightPct, 0);
    assert.equal(sum, 100);
  });

  it("normalizeValue: higher-worse maps calm→0 alert→50 stress→100", () => {
    const ind = Cri.indicatorById("key_rate");
    assert.equal(Cri.normalizeValue(10, ind), 0);
    assert.equal(Cri.normalizeValue(16, ind), 50);
    assert.equal(Cri.normalizeValue(21, ind), 100);
  });

  it("normalizeValue: higher-better inverts (PMI)", () => {
    const ind = Cri.indicatorById("pmi_mfg");
    assert.equal(Cri.normalizeValue(52, ind), 0);
    assert.equal(Cri.normalizeValue(48, ind), 50);
    assert.equal(Cri.normalizeValue(44, ind), 100);
  });

  it("zoneFromScore boundaries", () => {
    assert.equal(Cri.zoneFromScore(29).id, "calm");
    assert.equal(Cri.zoneFromScore(30).id, "elevated");
    assert.equal(Cri.zoneFromScore(50).id, "high");
    assert.equal(Cri.zoneFromScore(70).id, "crisis");
  });

  it("partial live values reweight; unreliable below min coverage", () => {
    const thin = Cri.compute({
      asOf: "2026-10-09",
      source: "live",
      historyTrusted: false,
      values: { imoex_dd20: 2 },
      sources: { imoex_dd20: "test" },
    });
    assert.equal(thin.reliable, false);
    assert.equal(thin.score, null);

    const ok = Cri.compute({
      asOf: "2026-10-09",
      source: "live",
      historyTrusted: false,
      values: {
        imoex_dd20: 5,
        rtsvix: 25,
        ofz_curve: 0.5,
        ofz_10y: 0.8,
        usdrub_20d: 3,
        key_rate: 14,
        ruonia_basis: 5,
        brent: 75,
        cny_fx_stress: 40,
      },
    });
    assert.equal(ok.reliable, true);
    assert.ok(ok.score != null);
    assert.equal(ok.outlook.direction, "insufficient");
  });

  it("outlook improving only when historyTrusted", () => {
    const values = {
      imoex_dd20: 4,
      rtsvix: 22,
      ofz_curve: 0.6,
      ofz_10y: 0.5,
      usdrub_20d: 2,
      key_rate: 14,
      ruonia_basis: 0,
      brent: 80,
      cny_fx_stress: 30,
    };
    const untrusted = Cri.compute({
      values,
      historyTrusted: false,
      scorePrev7d: 50,
    });
    assert.equal(untrusted.outlook.direction, "insufficient");

    const trusted = Cri.compute({
      values,
      historyTrusted: true,
      scorePrev7d: 50,
    });
    assert.equal(trusted.outlook.direction, "improving");
  });

  it("toMacroGate respects unreliable snapshots", () => {
    assert.equal(Cri.toMacroGate({ score: 40, reliable: false }).status, "NoData");
    assert.equal(Cri.toMacroGate({ score: 20, reliable: true }).status, "Pass");
    assert.equal(Cri.toMacroGate({ score: 40, reliable: true }).status, "Weak");
  });

  it("parseKeyRateFromText reads CBR table pairs", () => {
    const text = "Дата\tСтавка\n09.10.2026\t14,00\n08.10.2026\t14,00\n";
    const kr = Cri.parseKeyRateFromText(text);
    assert.equal(kr.rate, 14);
    assert.equal(kr.iso, "2026-10-09");
  });

  it("historyTrusted requires live points and span", () => {
    const day = "2026-10-09";
    assert.equal(Cri.historyTrusted([], day), false);
    const hist = [
      { day: "2026-10-04", score: 42, live: true },
      { day: "2026-10-05", score: 41, live: true },
      { day: "2026-10-06", score: 40, live: true },
      { day: "2026-10-07", score: 39, live: true },
      { day: "2026-10-08", score: 38, live: true },
    ];
    assert.equal(Cri.historyTrusted(hist, day), true);
  });

  it("formatAsOf and todayKey", () => {
    assert.equal(Cri.formatAsOf("2026-10-09"), "9 октября 2026");
    assert.match(Cri.todayKey(new Date("2026-10-09T15:00:00")), /^2026-10-09$/);
  });

  it("parseInflationYoYFromText and reserves", () => {
    const infl = "08.2026\t14,00\t6,33\t4,00\n07.2026\t14,00\t5,98\t4,00\n";
    const cpi = Cri.parseInflationYoYFromText(infl);
    assert.equal(cpi.cpi, 6.33);
    assert.equal(cpi.iso, "2026-08-01");
    const res = Cri.parseReservesFromText("02.10.2026 733,2\n25.09.2026 742,7\n");
    assert.equal(res.bn, 733.2);
    assert.equal(res.iso, "2026-10-02");
  });

  it("buildMarketHistoryScores yields prior live points before asOf", () => {
    const imoex = [];
    for (let i = 0; i < 30; i++) {
      const d = "2026-09-" + String(i + 1).padStart(2, "0");
      if (i + 1 > 30) break;
      imoex.push({ date: d, value: 2200 + i });
    }
    // Oct trading proxies
    ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"].forEach(
      (d, i) => imoex.push({ date: d, value: 2270 + i * 5 })
    );
    const mk = (series) => series.map((x) => ({ date: x.date, value: x.value }));
    const prior = Cri.buildMarketHistoryScores(
      {
        imoex: mk(imoex),
        rvi: mk(imoex).map((x) => ({ date: x.date, value: 25 })),
        usd: mk(imoex).map((x) => ({ date: x.date, value: 80 + (x.value % 3) })),
        y1: mk(imoex).map((x) => ({ date: x.date, value: 12 })),
        y10: mk(imoex).map((x) => ({ date: x.date, value: 16 })),
        cny: mk(imoex).map((x) => ({ date: x.date, value: 12 })),
        rusfar: mk(imoex).map((x) => ({ date: x.date, value: 14.1 })),
      },
      { key_rate: 14, brent: 80, cpi_yoy: 6.3, reserves: 730 },
      "2026-10-09",
      5
    );
    assert.ok(prior.length >= 5);
    assert.ok(prior.every((p) => p.day < "2026-10-09" && p.live && p.score != null));
    assert.equal(Cri.historyTrusted(prior, "2026-10-09"), true);
  });
});
