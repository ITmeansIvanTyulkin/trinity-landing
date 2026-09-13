const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Fund = require("../js/lib/invest-fundamentals.js");
const Explain = require("../js/lib/invest-explain.js");
const Pipe = require("../js/lib/invest-pipeline.js");

function candlesFromCloses(closes, vol) {
  return closes.map((close, i) => ({
    open: close,
    close,
    high: close + 0.5,
    low: close - 0.5,
    volume: vol == null ? 1000 : vol,
    value: close * 1000,
    begin: "2025-01-01",
    end: "2025-01-01",
  }));
}

/** Mild uptrend that finishes with mid RSI and price above SMA20/50. */
function grindCandles(n) {
  const closes = [];
  for (let i = 0; i < n; i++) {
    closes.push(100 + i * 0.04 + Math.sin((i + 4) / 5) * 1.2);
  }
  return candlesFromCloses(closes, 1000);
}

describe("TrinityInvestFundamentals", () => {
  it("LUKOIL-like non-fin row is reliable with contained leverage", () => {
    const s = Fund.scoreFundamentals({
      sector: "nonfin",
      revenue_curr: 7928,
      revenue_prev: 9431,
      debt_curr: 396,
      debt_prev: 758,
      equity_curr: 4523184,
      equity_prev: 4123014,
      op_profit_curr: 1428,
      op_profit_prev: 978.9,
      fcf_curr: 964,
      fcf_prev: 693.6,
      ebitda_curr: 2005,
      ebitda_prev: 1404,
      st_liab_curr: 1441,
    });
    assert.equal(s.status, "Pass");
    assert.equal(s.reliable, true);
    assert.equal(s.reliabilityLabel, "надежная");
    assert.ok(s.metrics.debtEbitda < 0.3);
  });

  it("high leverage marks non-fin as Fail / unreliable", () => {
    const s = Fund.scoreNonFin({
      revenue_curr: 1,
      revenue_prev: 912.7,
      debt_curr: 1199,
      debt_prev: 1061,
      equity_curr: 148589,
      equity_prev: 187531,
      op_profit_curr: 116.3,
      op_profit_prev: 161.3,
      fcf_curr: -99.4,
      fcf_prev: -119.3,
      ebitda_curr: 264.3,
      ebitda_prev: 271.8,
      st_liab_curr: 1257190,
    });
    assert.equal(s.reliable, false);
    assert.equal(s.status, "Fail");
  });

  it("Sber-like bank score is 3/5 when reserves and CAR are not improving", () => {
    const s = Fund.scoreFin({
      reserves_curr: 235.4,
      reserves_prev: 450.1,
      loans_curr: 37558,
      loans_prev: 29373,
      deposits_curr: 36693,
      deposits_prev: 29876,
      car_curr: 0.138,
      car_prev: 0.151,
      noi_curr: 3428,
      noi_prev: 2055,
    });
    assert.equal(s.score, 3);
    assert.equal(s.scoreMax, 5);
    assert.equal(s.reliable, true);
  });

  it("empty fundamentals → NoData", () => {
    const s = Fund.scoreFundamentals(null);
    assert.equal(s.status, "NoData");
    assert.equal(s.score, null);
  });

  it("buy ranges follow Excel-like 95–90% and 84–77% bands", () => {
    const r = Fund.buyRanges(6600);
    assert.equal(r.zone1.high, 6270);
    assert.equal(r.zone1.low, 5940);
    assert.equal(r.zone2.high, 5544);
    assert.equal(r.zone2.low, 5082);
  });

  it("risk questionnaire maps low points to conservative / 8% warn", () => {
    const r = Fund.scoreRiskAnswers({
      horizon: "lt1",
      liquidity: "soon",
      reserve: "none",
      drawdown_behavior: "sell_all",
      expense_impact: "high",
      volatility: "low",
      acknowledgement: true,
    });
    assert.equal(r.risk_level, "conservative");
    assert.equal(r.warn_drawdown_pct, 8);
  });

  it("rejects questionnaire without acknowledgement", () => {
    const r = Fund.scoreRiskAnswers({ horizon: "y5", acknowledgement: false });
    assert.match(r.error, /research/i);
  });
});

describe("TrinityInvestPipeline", () => {
  it("sma and rsi are defined on a long series", () => {
    const xs = [];
    for (let i = 0; i < 40; i++) xs.push(100 + (i % 3) - 1);
    assert.ok(Pipe.sma(xs, 20) > 90);
    const rsi = Pipe.rsiWilder(xs, 14);
    assert.ok(rsi >= 0 && rsi <= 100);
  });

  it("parseIssTable maps columns to objects", () => {
    const rows = Pipe.parseIssTable({
      columns: ["SECID", "LAST"],
      data: [["SBER", 283]],
    });
    assert.equal(rows[0].SECID, "SBER");
    assert.equal(rows[0].LAST, 283);
  });

  it("does not emit Invest when fundamentals are NoData", () => {
    const result = Pipe.analyzePrepared({
      ticker: "SBER",
      quote: {
        ticker: "SBER",
        found: true,
        last: 283,
        board: "TQBR",
        shortName: "Сбербанк",
        listLevel: 1,
      },
      candles: grindCandles(80),
      fundamentals: null,
      riskProfile: { risk_level: "moderate", warn_drawdown_pct: 15 },
    });
    assert.equal(result.fund.status, "NoData");
    assert.notEqual(result.verdict, "invest");
    assert.equal(result.explanation.sections.length, 9);
    const fundSec = result.explanation.sections.find((s) => s.id === "fundamentals");
    assert.equal(fundSec.status, "NoData");
    assert.match(fundSec.body, /отчётности|отчётность/i);
  });

  it("emits Invest when market/fund/indicators/strategy are constructive", () => {
    const candles = grindCandles(90);
    const result = Pipe.analyzePrepared({
      ticker: "LKOH",
      quote: {
        ticker: "LKOH",
        found: true,
        last: candles[candles.length - 1].close,
        board: "TQBR",
        shortName: "ЛУКОЙЛ",
        listLevel: 1,
      },
      candles,
      fundamentals: {
        sector: "nonfin",
        revenue_curr: 7928,
        revenue_prev: 7000,
        debt_curr: 396,
        debt_prev: 758,
        equity_curr: 4523184,
        equity_prev: 4123014,
        op_profit_curr: 1428,
        op_profit_prev: 978.9,
        fcf_curr: 964,
        fcf_prev: 693.6,
        ebitda_curr: 2005,
        ebitda_prev: 1404,
        st_liab_curr: 1441,
      },
      riskProfile: { risk_level: "moderate", warn_drawdown_pct: 25 },
    });
    assert.equal(result.fund.status, "Pass");
    assert.notEqual(result.gates.market.status, "Fail");
    assert.equal(result.verdict, "invest");
    assert.equal(result.explanation.sections.length, 9);
  });

  it("composeVerdict never upgrades NoData fund to invest", () => {
    const gates = {
      market: { status: "Pass" },
      fund: { status: "NoData" },
      indicators: { status: "Pass" },
      strategy: { status: "Pass" },
      cluster: { status: "Pass" },
    };
    const v = Pipe.composeVerdict(gates);
    assert.equal(v.verdict, "watch");
  });

  it("composeVerdict returns skip on market Fail", () => {
    const v = Pipe.composeVerdict({
      market: { status: "Fail" },
      fund: { status: "Pass" },
      indicators: { status: "Pass" },
      strategy: { status: "Pass" },
      cluster: { status: "Pass" },
    });
    assert.equal(v.verdict, "skip");
  });

  it("desk open legs become source=desk assets labelled by book", () => {
    const legs = Pipe.deskLegsFromJournal({
      entries: [
        {
          status: "OPEN",
          tickerY: "SBER",
          tickerX: "GAZP",
          book: "DAILY",
          remainingFraction: 0.5,
        },
        {
          status: "CLOSED",
          tickerY: "LKOH",
          tickerX: "ROSN",
          book: "EXCLUSIVE",
        },
      ],
    });
    assert.equal(legs.length, 1);
    assert.equal(legs[0].source, "desk");
    assert.match(legs[0].name, /pairs/);
    assert.equal(legs[0].ticker, "SBER");
  });

  it("builds a daily volume profile and parks POC on the heavy shelf", () => {
    const rows = [];
    for (let i = 0; i < 80; i++) {
      rows.push({ open: 100, close: 100.2, high: 101, low: 99.4, volume: 80 });
    }
    for (let i = 0; i < 50; i++) {
      rows.push({ open: 90, close: 90.1, high: 90.5, low: 89.8, volume: 900 });
    }
    const p = Pipe.volumeProfile(rows, 220);
    assert.ok(p);
    assert.ok(p.poc >= 89 && p.poc <= 91.5, "poc=" + p.poc);
    assert.ok(p.val < p.poc && p.poc < p.vah);
  });

  it("keeps cluster lookback on daily bars for a long horizon", () => {
    const cl = Pipe.buildCluster(grindCandles(80), { horizon: "y5" }, 110);
    assert.equal(cl.lookback, 320);
    assert.equal(cl.source, "daily");
    assert.ok(cl.bars >= 40);
  });

  it("extractIssJson accepts raw JSON and markdown wrappers", () => {
    const raw = { securities: { columns: ["SECID"], data: [["GAZP"]] } };
    assert.equal(Pipe.extractIssJson(JSON.stringify(raw)).securities.data[0][0], "GAZP");
    const wrapped = "Title: ISS\n\nURL Source: https://iss.moex.com/\n\n" + JSON.stringify(raw);
    assert.equal(Pipe.extractIssJson(wrapped).securities.data[0][0], "GAZP");
  });

  it("fetchIssJson falls back to reader when direct ISS aborts", async () => {
    const payload = {
      securities: { columns: ["SECID", "BOARDID"], data: [["GAZP", "TQBR"]] },
      marketdata: { columns: ["SECID", "BOARDID", "LAST"], data: [["GAZP", "TQBR", 93.05]] },
    };
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(url);
      if (String(url).indexOf("r.jina.ai") >= 0) {
        return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
      }
      const err = new Error("Fetch is aborted");
      err.name = "AbortError";
      throw err;
    };
    const json = await Pipe.fetchIssJson(
      "/engines/stock/markets/shares/securities/GAZP.json?iss.meta=off",
      { fetchImpl: fetchImpl, timeoutMs: 20 }
    );
    assert.equal(json.securities.data[0][0], "GAZP");
    assert.ok(urls.some((u) => String(u).indexOf("iss.moex.com") >= 0));
    assert.ok(urls.some((u) => String(u).indexOf("r.jina.ai") >= 0));
  });
});

describe("TrinityInvestExplain", () => {
  it("builds nine named sections with statuses", () => {
    const expl = Explain.buildExplanation({
      ticker: "SBER",
      name: "Сбербанк",
      verdict: "watch",
      weighted: 0.5,
      quote: { last: 283, board: "TQBR" },
      indicators: { last: 283, smaFast: 280, smaSlow: 270, rsi: 55, volRatio: 1.1, rangePct: 0.1, bars: 80, thresholds: {} },
      fund: { status: "NoData", metrics: {} },
      gates: {
        market: { status: "Pass", detail: "ok", metrics: {} },
        fund: { status: "NoData", detail: "нет МСФО", metrics: {} },
        indicators: { status: "Pass", detail: "sma", metrics: { smaStatus: "Pass", rsiStatus: "Pass", volStatus: "Pass" } },
        strategy: { status: "Weak", detail: "entry", metrics: { rules: [] } },
        cluster: { status: "Pass", detail: "proxy", metrics: { volRatio: 1.1 } },
      },
      scenarios: { base: "b", optimistic: "o", risk: "r" },
      riskProfile: { risk_level: "moderate", warn_drawdown_pct: 15 },
    });
    const ids = expl.sections.map((s) => s.id);
    assert.deepEqual(ids, [
      "summary",
      "fundamentals",
      "strategy",
      "indicators",
      "cluster",
      "risk_fit",
      "scenarios",
      "risks",
      "next",
    ]);
    expl.sections.forEach((s) => {
      assert.ok(s.body && s.body.length > 80, s.id + " too short");
      assert.ok(["Pass", "Weak", "Fail", "NoData"].indexOf(s.status) >= 0);
    });
    assert.match(expl.disclaimer, /не индивидуальная/i);
    assert.match(expl.sections.find((s) => s.id === "cluster").body, /дневк/i);
    assert.equal(expl.verdictLabel, "Наблюдать");
    expl.sections.forEach((s) => {
      assert.ok(s.statusLabel, s.id + " needs statusLabel");
      assert.doesNotMatch(s.body, /NoData|Watch|Invest|Excel|MVP|playbook|ISS|гейтов|гейта|ЦКИ/i);
    });
  });
});
