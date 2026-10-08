/**
 * Invest auto-pipeline aligned with desk InvestmentsPlaybook (IMOEX-core):
 * fund → liquidity → trend D1 → VAP zones → potential/CAT → volume/CD →
 * daily profile proxy for clusters → weighted verdict.
 *
 * Cabinet = research only (no limit ladder / auto-execution).
 * M5 Bid×Ask tape lives on the desk; here cluster uses daily VAP + soft WEAK.
 *
 * Thresholds live in THRESHOLDS (edit in one place).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./invest-fundamentals.js"),
      require("./invest-explain.js")
    );
  } else {
    root.TrinityInvestPipeline = factory(
      root.TrinityInvestFundamentals,
      root.TrinityInvestExplain
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Fund, Explain) {
  "use strict";

  const ISS_DEFAULT = "https://iss.moex.com/iss";
  const DEFAULT_ISS_READER = "https://r.jina.ai/";
  const PREFERRED_BOARDS = ["TQBR", "TQTF", "TQIF", "TQPI", "SMAL"];
  let issDirectAlive = null;

  const THRESHOLDS = {
    smaFast: 20,
    smaSlow: 50,
    rsiPeriod: 14,
    rsiPassLow: 40,
    rsiPassHigh: 65,
    rsiWeakLow: 30,
    rsiWeakHigh: 70,
    volumeSma: 20,
    volumePassLow: 0.7,
    volumePassHigh: 1.8,
    volumeWeakHigh: 3,
    volumeFailLow: 0.5,
    volumeFailHigh: 4,
    entryBandPct: 0.03,
    chasePct: 0.08,
    rangeLookback: 20,
    candleDays: 520,
    profileMinBars: 40,
    profileDefaultBars: 220,
    deltaTailBars: 20,
    maxAddonGapPct: 0.25,
    requireUptrendD1: true,
    minTurnoverRub: 50_000_000,
    /** Desk InvestmentsPlaybook.weighted ids (macro/size optional / often NoData). */
    weights: {
      fund: 0.28,
      liquidity: 0.1,
      macro: 0.07,
      trend: 0.12,
      zones: 0.1,
      potential: 0.08,
      category: 0.05,
      indicators: 0.08,
      cluster: 0.07,
      size: 0.05,
    },
    investMin: 0.72,
    watchMin: 0.4,
  };

  const STATUS_SCORE = { Pass: 1, Weak: 0.55, Fail: 0, Skip: 0, NoData: null };

  function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
  }

  function round(n, d) {
    if (n == null || !Number.isFinite(n)) return null;
    const p = Math.pow(10, d == null ? 4 : d);
    return Math.round(n * p) / p;
  }

  function sma(values, period) {
    if (!values || values.length < period) return null;
    let s = 0;
    for (let i = values.length - period; i < values.length; i++) s += values[i];
    return s / period;
  }

  function rsiWilder(closes, period) {
    const p = period || THRESHOLDS.rsiPeriod;
    if (!closes || closes.length < p + 1) return null;
    let gain = 0;
    let loss = 0;
    const start = closes.length - p - 1;
    for (let i = start + 1; i <= start + p; i++) {
      const ch = closes[i] - closes[i - 1];
      if (ch >= 0) gain += ch;
      else loss -= ch;
    }
    let avgGain = gain / p;
    let avgLoss = loss / p;
    for (let i = start + p + 1; i < closes.length; i++) {
      const ch = closes[i] - closes[i - 1];
      const g = ch > 0 ? ch : 0;
      const l = ch < 0 ? -ch : 0;
      avgGain = (avgGain * (p - 1) + g) / p;
      avgLoss = (avgLoss * (p - 1) + l) / p;
    }
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  function parseIssTable(block) {
    if (!block || !Array.isArray(block.columns) || !Array.isArray(block.data)) {
      return [];
    }
    return block.data.map((row) => {
      const o = {};
      block.columns.forEach((c, i) => {
        o[c] = row[i];
      });
      return o;
    });
  }

  function pickBoardRow(rows) {
    if (!rows || !rows.length) return null;
    const ranked = rows.slice().sort((a, b) => {
      const ia = PREFERRED_BOARDS.indexOf(a.BOARDID);
      const ib = PREFERRED_BOARDS.indexOf(b.BOARDID);
      const pa = ia === -1 ? 99 : ia;
      const pb = ib === -1 ? 99 : ib;
      if (pa !== pb) return pa - pb;
      const la = a.LAST != null ? 1 : 0;
      const lb = b.LAST != null ? 1 : 0;
      return lb - la;
    });
    return ranked[0];
  }

  function mapCandles(rows) {
    return (rows || [])
      .map((r) => ({
        open: Number(r.open),
        close: Number(r.close),
        high: Number(r.high),
        low: Number(r.low),
        value: Number(r.value),
        volume: Number(r.volume),
        begin: r.begin,
        end: r.end,
      }))
      .filter((c) => Number.isFinite(c.close) && Number.isFinite(c.volume));
  }

  function fromDate(days) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (days || THRESHOLDS.candleDays));
    return d.toISOString().slice(0, 10);
  }

  function describeFetchError(err) {
    if (!err) return "ошибка сети";
    const msg = err.message ? String(err.message) : String(err);
    if (err.name === "AbortError" || /abort/i.test(msg)) {
      return "таймаут (iss.moex.com не отвечает с этой сети)";
    }
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      return "сеть/CORS до iss.moex.com";
    }
    return msg;
  }

  function extractIssJson(text) {
    const s = String(text || "").trim();
    if (!s) throw new Error("пустой ответ ISS");
    try {
      return JSON.parse(s);
    } catch (_) {}
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(s.slice(start, end + 1));
    }
    throw new Error("ответ ISS не JSON");
  }

  function issReaderUrl(pageUrl, options) {
    const raw = options && options.issReader;
    if (raw === false || raw === "") return null;
    const base = String(raw || DEFAULT_ISS_READER).replace(/\/?$/, "/");
    return base + pageUrl;
  }

  async function fetchText(fetchFn, url, ms, headers) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetchFn(url, { signal: ctrl.signal, headers: headers || undefined });
      const body = await res.text();
      return { ok: res.ok, status: res.status, body: body };
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * Direct ISS often hangs (TLS/WAF) from some networks; AbortController then
   * surfaces as "Fetch is aborted". Fallback: same HTML/JSON reader as
   * fundamentals (r.jina.ai), or CABINET_CONFIG.issBase / issReader.
   */
  async function fetchIssJson(pathAndQuery, options) {
    const opts = options || {};
    const fetchFn = opts.fetchImpl || fetch;
    const base = String(opts.issBase || ISS_DEFAULT).replace(/\/$/, "");
    const url = pathAndQuery.indexOf("http") === 0 ? pathAndQuery : base + pathAndQuery;
    const reader = issReaderUrl(url, opts);
    const errors = [];
    const testMode = Boolean(opts.fetchImpl);
    const tryDirect = testMode || issDirectAlive !== false;

    if (tryDirect) {
      try {
        const res = await fetchText(fetchFn, url, opts.timeoutMs || 4000);
        if (!res.ok) throw new Error("ISS HTTP " + res.status);
        const json = extractIssJson(res.body);
        if (!testMode) issDirectAlive = true;
        opts._issVia = "iss";
        return json;
      } catch (err) {
        if (!testMode) issDirectAlive = false;
        errors.push(describeFetchError(err));
      }
    }

    if (reader) {
      try {
        const res = await fetchText(fetchFn, reader, opts.readerTimeoutMs || 20000, {
          "X-Return-Format": "text",
        });
        if (!res.body) throw new Error("reader пуст");
        const json = extractIssJson(res.body);
        opts._issVia = "reader";
        return json;
      } catch (err) {
        errors.push("reader: " + describeFetchError(err));
      }
    }

    throw new Error(errors.join(" → ") || "ISS недоступен");
  }

  async function fetchQuote(ticker, options) {
    const secid = String(ticker || "")
      .trim()
      .toUpperCase();
    const json = await fetchIssJson(
      "/engines/stock/markets/shares/securities/" +
        encodeURIComponent(secid) +
        ".json?iss.meta=off&iss.only=securities,marketdata",
      options
    );
    const secs = parseIssTable(json.securities);
    const mds = parseIssTable(json.marketdata);
    const byBoard = {};
    secs.forEach((s) => {
      byBoard[s.BOARDID] = Object.assign({}, s, byBoard[s.BOARDID]);
    });
    mds.forEach((m) => {
      byBoard[m.BOARDID] = Object.assign({}, byBoard[m.BOARDID] || {}, m);
    });
    const row = pickBoardRow(Object.keys(byBoard).map((k) => byBoard[k]));
    if (!row) return { ticker: secid, found: false };
    const last =
      row.LAST != null
        ? Number(row.LAST)
        : row.LCURRENTPRICE != null
          ? Number(row.LCURRENTPRICE)
          : row.PREVPRICE != null
            ? Number(row.PREVPRICE)
            : null;
    return {
      ticker: secid,
      found: true,
      board: row.BOARDID,
      shortName: row.SHORTNAME || row.SECNAME || secid,
      secName: row.SECNAME || row.SHORTNAME || secid,
      last: Number.isFinite(last) ? last : null,
      prevPrice: row.PREVPRICE != null ? Number(row.PREVPRICE) : null,
      listLevel: row.LISTLEVEL != null ? Number(row.LISTLEVEL) : null,
      lotSize: row.LOTSIZE != null ? Number(row.LOTSIZE) : null,
      volToday: row.VOLTODAY != null ? Number(row.VOLTODAY) : null,
      valToday: row.VALTODAY != null ? Number(row.VALTODAY) : null,
      issueCap: row.ISSUECAPITALIZATION != null ? Number(row.ISSUECAPITALIZATION) : null,
      isin: row.ISIN || null,
      asOf: row.TIME || row.SYSTIME || row.UPDATETIME || null,
    };
  }

  async function fetchCandles(ticker, board, options) {
    const secid = String(ticker || "")
      .trim()
      .toUpperCase();
    const b = board || "TQBR";
    const json = await fetchIssJson(
      "/engines/stock/markets/shares/boards/" +
        encodeURIComponent(b) +
        "/securities/" +
        encodeURIComponent(secid) +
        "/candles.json?iss.meta=off&interval=24&from=" +
        fromDate((options && options.candleDays) || THRESHOLDS.candleDays),
      options
    );
    return mapCandles(parseIssTable(json.candles));
  }

  function computeIndicators(candles) {
    const closes = (candles || []).map((c) => c.close);
    const volumes = (candles || []).map((c) => c.volume);
    const highs = (candles || []).map((c) => c.high);
    const lows = (candles || []).map((c) => c.low);
    const last = closes.length ? closes[closes.length - 1] : null;
    const smaFast = sma(closes, THRESHOLDS.smaFast);
    const smaSlow = sma(closes, THRESHOLDS.smaSlow);
    const rsi = rsiWilder(closes, THRESHOLDS.rsiPeriod);
    const volSma = sma(volumes, THRESHOLDS.volumeSma);
    const lastVol = volumes.length ? volumes[volumes.length - 1] : null;
    const volRatio = lastVol != null && volSma ? lastVol / volSma : null;
    const look = THRESHOLDS.rangeLookback;
    let rangePct = null;
    if (highs.length >= look && last) {
      const hh = Math.max.apply(null, highs.slice(-look));
      const ll = Math.min.apply(null, lows.slice(-look));
      rangePct = (hh - ll) / last;
    }
    return {
      last,
      smaFast,
      smaSlow,
      rsi,
      volSma,
      lastVol,
      volRatio,
      rangePct,
      bars: closes.length,
    };
  }

  function profileLookbackDays(profile) {
    const h = profile && (profile.horizon || (profile.answers && profile.answers.horizon));
    if (h === "lt1") return 150;
    if (h === "y3_5") return 280;
    if (h === "y5") return 320;
    return THRESHOLDS.profileDefaultBars;
  }

  function barDelta(c) {
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);
    const open = Number(c.open);
    const vol = Number(c.volume);
    if (!Number.isFinite(vol) || vol <= 0) return 0;
    const range = high - low;
    if (!Number.isFinite(range) || range <= 0) {
      if (Number.isFinite(close) && Number.isFinite(open)) return close >= open ? vol : -vol;
      return 0;
    }
    return (((close - low) - (high - close)) / range) * vol;
  }

  function volumeProfile(candles, lookback) {
    const n = lookback || THRESHOLDS.profileDefaultBars;
    const rows = (candles || [])
      .filter((c) => {
        return (
          Number.isFinite(Number(c.high)) &&
          Number.isFinite(Number(c.low)) &&
          Number.isFinite(Number(c.close)) &&
          Number.isFinite(Number(c.volume)) &&
          Number(c.volume) > 0 &&
          Number(c.high) >= Number(c.low)
        );
      })
      .slice(-n);
    if (rows.length < THRESHOLDS.profileMinBars) return null;
    let minL = Infinity;
    let maxH = -Infinity;
    rows.forEach((c) => {
      if (c.low < minL) minL = Number(c.low);
      if (c.high > maxH) maxH = Number(c.high);
    });
    if (!(maxH > minL)) return null;
    const bins = Math.min(48, Math.max(24, Math.round(rows.length / 2)));
    const step = (maxH - minL) / bins;
    const hist = new Array(bins).fill(0);
    rows.forEach((c) => {
      let from = Math.floor((Number(c.low) - minL) / step);
      let to = Math.floor((Number(c.high) - minL) / step);
      if (from < 0) from = 0;
      if (to >= bins) to = bins - 1;
      if (to < from) to = from;
      const share = Number(c.volume) / (to - from + 1);
      for (let i = from; i <= to; i++) hist[i] += share;
    });
    let pocIdx = 0;
    for (let i = 1; i < bins; i++) {
      if (hist[i] > hist[pocIdx]) pocIdx = i;
    }
    const total = hist.reduce((a, b) => a + b, 0);
    if (!(total > 0)) return null;
    let lo = pocIdx;
    let hi = pocIdx;
    let acc = hist[pocIdx];
    const target = total * 0.7;
    while (acc < target && (lo > 0 || hi < bins - 1)) {
      const left = lo > 0 ? hist[lo - 1] : -1;
      const right = hi < bins - 1 ? hist[hi + 1] : -1;
      if (right > left) {
        hi += 1;
        acc += hist[hi];
      } else if (lo > 0) {
        lo -= 1;
        acc += hist[lo];
      } else {
        hi += 1;
        acc += hist[hi];
      }
    }
    const binMid = (i) => minL + (i + 0.5) * step;
    const hvns = [];
    for (let i = 1; i < bins - 1; i++) {
      if (hist[i] >= hist[pocIdx] * 0.55 && hist[i] >= hist[i - 1] && hist[i] >= hist[i + 1]) {
        hvns.push(round(binMid(i), 2));
      }
    }
    return {
      poc: round(binMid(pocIdx), 2),
      val: round(minL + lo * step, 2),
      vah: round(minL + (hi + 1) * step, 2),
      hvns: hvns.slice(0, 4),
      bars: rows.length,
    };
  }

  function locationVsValue(last, prof) {
    if (!prof || last == null || !Number.isFinite(Number(last))) return null;
    const px = Number(last);
    if (px > prof.vah) return "above";
    if (px < prof.val) return "below";
    return "inside";
  }

  function buildCluster(daily, profile, last) {
    const look = profileLookbackDays(profile);
    const dailyProf = volumeProfile(daily, look);
    const rows = (daily || []).slice(-look);
    const tailN = Math.min(THRESHOLDS.deltaTailBars, rows.length);
    let lastDelta = null;
    let tailDelta = 0;
    let cum = 0;
    rows.forEach((c, i) => {
      const d = barDelta(c);
      cum += d;
      if (i === rows.length - 1) lastDelta = d;
      if (i >= rows.length - tailN) tailDelta += d;
    });
    return {
      poc: dailyProf ? dailyProf.poc : null,
      val: dailyProf ? dailyProf.val : null,
      vah: dailyProf ? dailyProf.vah : null,
      hvns: (dailyProf && dailyProf.hvns) || [],
      source: dailyProf ? "daily" : null,
      bars: dailyProf ? dailyProf.bars : 0,
      location: locationVsValue(last, dailyProf),
      lastDelta: lastDelta != null ? round(lastDelta, 0) : null,
      tailDelta: round(tailDelta, 0),
      tailBars: tailN,
      cumDelta: round(cum, 0),
      lookback: look,
    };
  }

  function worstStatus(list) {
    const rank = { Fail: 0, Weak: 1, NoData: 2, Pass: 3 };
    let worst = "Pass";
    list.forEach((s) => {
      if (rank[s] < rank[worst]) worst = s;
    });
    return worst;
  }

  function gateMarket(quote, candles) {
    if (!quote || !quote.found || quote.last == null) {
      return {
        id: "market",
        title: "Рынок ISS",
        status: "Fail",
        detail: "Тикер не найден на MOEX ISS (shares) или нет цены.",
        metrics: {},
      };
    }
    if (!candles || candles.length < THRESHOLDS.smaSlow) {
      return {
        id: "market",
        title: "Рынок ISS",
        status: "Weak",
        detail:
          "Котировка есть, но мало дневных свечей для индикаторов (" +
          ((candles && candles.length) || 0) +
          ").",
        metrics: { last: quote.last, board: quote.board, bars: (candles && candles.length) || 0 },
      };
    }
    return {
      id: "market",
      title: "Рынок ISS",
      status: "Pass",
      detail:
        quote.shortName +
        " · " +
        quote.board +
        " · последняя " +
        quote.last +
        " · свечей " +
        candles.length,
      metrics: {
        last: quote.last,
        board: quote.board,
        name: quote.shortName,
        listLevel: quote.listLevel,
        bars: candles.length,
      },
    };
  }

  function gateFund(fund) {
    if (!fund || fund.status === "NoData") {
      return {
        id: "fund",
        title: "Фундаментал",
        status: "NoData",
        detail: (fund && fund.detail) || "Нет МСФО-полей.",
        metrics: (fund && fund.metrics) || {},
      };
    }
    return {
      id: "fund",
      title: "Фундаментал",
      status: fund.status,
      detail: fund.detail,
      metrics: Object.assign({}, fund.metrics, {
        score: fund.score,
        scoreMax: fund.scoreMax,
        reliable: fund.reliable,
        potential: fund.potential,
        sector: fund.sector,
      }),
    };
  }

  /** Desk TrendGate — long sleeve, requireUptrendD1. */
  function gateTrend(ind) {
    if (!ind || ind.bars < 40 || ind.last == null || ind.smaFast == null || ind.smaSlow == null) {
      return {
        id: "trend",
        title: "Тренд D1",
        status: "NoData",
        detail: "need ≥40 daily bars",
        metrics: ind || {},
      };
    }
    const up = ind.last > ind.smaFast && ind.smaFast > ind.smaSlow;
    const down = ind.last < ind.smaFast && ind.smaFast < ind.smaSlow;
    if (down && THRESHOLDS.requireUptrendD1) {
      return {
        id: "trend",
        title: "Тренд D1",
        status: "Skip",
        detail: "D1 downtrend — skip",
        metrics: { uptrend: false },
      };
    }
    if (up) {
      return {
        id: "trend",
        title: "Тренд D1",
        status: "Pass",
        detail: "D1 uptrend",
        metrics: { uptrend: true },
      };
    }
    return {
      id: "trend",
      title: "Тренд D1",
      status: "Weak",
      detail: "D1 mixed / sideways",
      metrics: { uptrend: false },
    };
  }

  /** Desk LiquidityFilter — soft proxy from ISS listing / turnover. */
  function gateLiquidity(quote) {
    const q = quote || {};
    if (!q.found) {
      return {
        id: "liquidity",
        title: "Ликвидность",
        status: "Fail",
        detail: "no quote",
        metrics: {},
      };
    }
    const val = q.valToday != null && Number.isFinite(q.valToday) ? q.valToday : null;
    const cap = q.issueCap != null && Number.isFinite(q.issueCap) ? q.issueCap : null;
    if (val != null && val < THRESHOLDS.minTurnoverRub) {
      return {
        id: "liquidity",
        title: "Ликвидность",
        status: "Fail",
        detail: "turnover below min",
        metrics: { valToday: val, issueCap: cap },
      };
    }
    if (q.listLevel != null && q.listLevel >= 3) {
      return {
        id: "liquidity",
        title: "Ликвидность",
        status: "Fail",
        detail: "listing level " + q.listLevel,
        metrics: { listLevel: q.listLevel, valToday: val },
      };
    }
    if (val != null || q.listLevel === 1) {
      return {
        id: "liquidity",
        title: "Ликвидность",
        status: "Pass",
        detail: "liquid",
        metrics: { listLevel: q.listLevel, valToday: val, issueCap: cap },
      };
    }
    if (q.listLevel === 2) {
      return {
        id: "liquidity",
        title: "Ликвидность",
        status: "Weak",
        detail: "listing level 2",
        metrics: { listLevel: 2 },
      };
    }
    return {
      id: "liquidity",
      title: "Ликвидность",
      status: "NoData",
      detail: "no liquidity snapshot",
      metrics: {},
    };
  }

  /**
   * Desk VolumeProfileZones on daily bars (cabinet has no H4 feed).
   */
  function evaluateZones(candles) {
    const bars = candles || [];
    if (bars.length < 30) {
      return {
        status: "NoData",
        detail: "need ≥30 bars for profile",
        range1: null,
        range2: null,
        chartPotentialPct: null,
        targetPrice: null,
      };
    }
    const last = bars[bars.length - 1].close;
    let min = bars[0].low;
    let max = bars[0].high;
    for (let i = 1; i < bars.length; i++) {
      if (bars[i].low < min) min = bars[i].low;
      if (bars[i].high > max) max = bars[i].high;
    }
    if (!(max > min)) {
      return {
        status: "Fail",
        detail: "flat range",
        range1: null,
        range2: null,
        chartPotentialPct: null,
        targetPrice: null,
      };
    }
    const bins = 40;
    const vol = new Array(bins).fill(0);
    const step = (max - min) / bins;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const typ = (b.high + b.low + b.close) / 3;
      const idx = Math.min(bins - 1, Math.max(0, Math.floor((typ - min) / step)));
      vol[idx] += b.volume > 0 ? b.volume : Math.max(b.high - b.low, 1e-9);
    }
    const peaks = [];
    for (let i = 1; i < bins - 1; i++) {
      if (vol[i] >= vol[i - 1] && vol[i] >= vol[i + 1] && vol[i] > 0) {
        peaks.push({ i: i, v: vol[i] });
      }
    }
    peaks.sort(function (a, b) {
      return b.v - a.v;
    });
    function zoneAt(i) {
      const lo = min + i * step;
      return { low: lo, high: lo + step, mid: lo + step / 2 };
    }
    function pot(lastPx, target, entryMid) {
      const base = entryMid > 0 ? entryMid : lastPx;
      if (!(base > 0) || !(target > base)) {
        return Math.max(0, ((target - lastPx) / Math.max(lastPx, 1e-9)) * 100);
      }
      return ((target - base) / base) * 100;
    }
    const below = [];
    for (let p = 0; p < peaks.length; p++) {
      const z = zoneAt(peaks[p].i);
      if (z.mid < last) below.push(z);
      if (below.length >= 2) break;
    }
    if (!below.length) {
      const r1 = {
        low: min,
        high: min + (last - min) * 0.35,
        mid: min + (last - min) * 0.175,
      };
      return {
        status: "Weak",
        detail: "no HVN below — fallback zone",
        range1: r1,
        range2: null,
        chartPotentialPct: pot(last, max, r1.mid),
        targetPrice: max,
      };
    }
    const r1 = below[0];
    const r2 = below.length > 1 ? below[1] : null;
    if (r2) {
      const gap = Math.abs(r1.mid - r2.mid) / r1.mid;
      if (gap > THRESHOLDS.maxAddonGapPct) {
        return {
          status: "Weak",
          detail: "addon gap >" + Math.round(THRESHOLDS.maxAddonGapPct * 100) + "%",
          range1: r1,
          range2: r2,
          chartPotentialPct: pot(last, max, r1.mid),
          targetPrice: max,
        };
      }
    }
    let target = max;
    for (let p = 0; p < peaks.length; p++) {
      const mid = min + (peaks[p].i + 0.5) * step;
      if (mid > last) {
        target = mid;
        break;
      }
    }
    return {
      status: "Pass",
      detail: "zones from HVN (daily)",
      range1: r1,
      range2: r2,
      chartPotentialPct: pot(last, target, r1.mid),
      targetPrice: target,
    };
  }

  function gateZones(zoneEval) {
    const z = zoneEval || {};
    return {
      id: "zones",
      title: "Зоны VAP (D1)",
      status: z.status || "NoData",
      detail: z.detail || "",
      metrics: {
        range1: z.range1,
        range2: z.range2,
        targetPrice: z.targetPrice != null ? round(z.targetPrice, 4) : null,
        chartPotentialPct:
          z.chartPotentialPct != null ? round(z.chartPotentialPct, 2) : null,
      },
    };
  }

  function gatePotentialAndCategory(fundScored, zoneEval) {
    const chart =
      zoneEval && zoneEval.chartPotentialPct != null && Number.isFinite(zoneEval.chartPotentialPct)
        ? zoneEval.chartPotentialPct
        : null;
    let formal = null;
    let method = "chart";
    if (fundScored && fundScored.potential != null && Number.isFinite(fundScored.potential)) {
      formal = fundScored.potential * 100;
      method = "fund_delta_potential";
    }
    let blended;
    if (formal == null && chart == null) blended = null;
    else if (formal == null) {
      blended = chart;
      method = "chart_fallback";
    } else if (chart == null) blended = formal;
    else {
      blended = formal * 0.65 + chart * 0.35;
      method = method + "+chart";
    }
    const potGate = {
      id: "potential",
      title: "Потенциал",
      status: blended == null ? "NoData" : "Pass",
      detail:
        blended == null
          ? "n/a"
          : method + " " + (Math.round(blended * 10) / 10).toFixed(1) + "%",
      metrics: {
        formalPct: formal != null ? round(formal, 2) : null,
        chartPct: chart != null ? round(chart, 2) : null,
        blendedPct: blended != null ? round(blended, 2) : null,
        method: method,
      },
    };

    const bank = fundScored && fundScored.sector === "fin";
    const reliable = fundScored && fundScored.reliable === true;
    const pot = blended == null ? 0 : blended;
    const m = (fundScored && fundScored.metrics) || {};
    let cat = 4;
    let reason = "unreliable";
    if (!reliable) {
      if (!bank && m.debtEbitda != null && m.debtEbitda > 4) {
        cat = 4;
        reason = "DE>4";
      } else if (pot >= 50) {
        cat = 3;
        reason = "unreliable+potential≥50";
      } else {
        cat = 4;
        reason = "unreliable+low_potential";
      }
    } else if (bank) {
      if (pot >= 30) {
        cat = 1;
        reason = "bank+potential≥30";
      } else if (pot >= 10) {
        cat = 2;
        reason = "bank+potential_10_30";
      } else {
        cat = 4;
        reason = "bank+potential<10";
      }
    } else if (pot >= 30 && (m.debtEbitda == null || m.debtEbitda <= 3)) {
      cat = 1;
      reason = "reliable+potential≥30";
    } else if (pot >= 10) {
      cat = 2;
      reason = "reliable+potential≥10";
    } else {
      cat = 4;
      reason = "reliable+potential<10";
    }
    const investable = cat <= 3;
    const catGate = {
      id: "category",
      title: "Категория",
      status: investable ? "Pass" : "Skip",
      detail: "CAT" + cat + " " + reason,
      metrics: { category: cat, reason: reason, investable: investable },
    };
    return { potGate: potGate, catGate: catGate, blendedPct: blended, category: cat };
  }

  /** Desk VolumeIndicatorsGate on daily close-location CD. */
  function gateIndicators(ind, candles) {
    const bars = candles || [];
    if (bars.length < 25) {
      return {
        id: "indicators",
        title: "Volume/CD",
        status: "NoData",
        detail: "need bars for volume/CD",
        metrics: ind || {},
      };
    }
    const n = bars.length;
    let volSma = 0;
    for (let i = n - 20; i < n; i++) volSma += bars[i].volume || 0;
    volSma /= 20;
    const last = bars[n - 1];
    const ratio = volSma <= 0 ? 1 : (last.volume || 0) / volSma;
    let delta = 0;
    const from = Math.max(0, n - 20);
    for (let i = from; i < n; i++) {
      const b = bars[i];
      const range = (b.high || 0) - (b.low || 0);
      const loc = range <= 0 ? 0 : ((b.close - b.low) / range) * 2 - 1;
      delta += loc * (b.volume > 0 ? b.volume : 1);
    }
    if (ratio < 0.5 || ratio > 4) {
      return {
        id: "indicators",
        title: "Volume/CD",
        status: "Fail",
        detail: "volume extreme",
        metrics: {
          volRatio: round(ratio, 3),
          deltaTail: round(delta, 2),
          smaFast: ind && round(ind.smaFast, 4),
          smaSlow: ind && round(ind.smaSlow, 4),
          rsi: ind && round(ind.rsi, 2),
        },
      };
    }
    const absorb = ratio >= 1.2 && last.close < last.open;
    const deltaBull = delta > 0;
    let status = "Weak";
    let detail = "no clear volume edge";
    if (absorb && deltaBull) {
      status = "Pass";
      detail = "absorption+delta↑";
    } else if (deltaBull || absorb) {
      status = "Weak";
      detail = "partial volume/CD";
    }
    return {
      id: "indicators",
      title: "Volume/CD",
      status: status,
      detail: detail,
      metrics: {
        volRatio: round(ratio, 3),
        deltaTail: round(delta, 2),
        smaFast: ind && round(ind.smaFast, 4),
        smaSlow: ind && round(ind.smaSlow, 4),
        rsi: ind && round(ind.rsi, 2),
        rangePct: ind && round(ind.rangePct, 4),
      },
    };
  }

  /** Explain-facing alias: strategy section follows D1 trend gate. */
  function gateStrategy(trendGate, fundGate, quote) {
    const t = trendGate || { status: "NoData", detail: "" };
    const rules = [
      {
        id: "trend",
        status: t.status === "Skip" ? "Fail" : t.status,
        text: t.detail || "D1 trend",
      },
    ];
    if (quote && quote.listLevel != null) {
      rules.push({
        id: "listing",
        status: quote.listLevel === 1 ? "Pass" : quote.listLevel === 2 ? "Weak" : "Fail",
        text: "Листинг MOEX уровень " + quote.listLevel,
      });
    }
    if (fundGate) {
      rules.push({
        id: "fund_align",
        status: fundGate.status === "NoData" ? "Weak" : fundGate.status,
        text: "Стыковка с фундаментом",
      });
    }
    return {
      id: "strategy",
      title: "Тренд и вход (как на столе)",
      status: t.status === "Skip" ? "Fail" : t.status || "NoData",
      detail: t.detail || "",
      metrics: { rules: rules, deskAligned: true },
    };
  }

  function gateCluster(ind, cluster, zoneEval) {
    const vol = ind && ind.volRatio;
    const loc = cluster && cluster.location;
    const metrics = {
      volRatio: vol != null ? round(vol, 3) : null,
      poc: cluster && cluster.poc,
      val: cluster && cluster.val,
      vah: cluster && cluster.vah,
      location: loc || null,
      source: "daily-vap",
      tailDelta: cluster && cluster.tailDelta,
      deskNote: "M5 Bid×Ask tape — только на столе; здесь дневной VAP",
      range1: zoneEval && zoneEval.range1,
      targetPrice: zoneEval && zoneEval.targetPrice,
    };
    if (!(cluster && cluster.poc) && !(zoneEval && zoneEval.range1)) {
      return {
        id: "cluster",
        title: "Профиль / кластер (D1 proxy)",
        status: "Weak",
        detail: "нет дневного профиля — footprint только на столе",
        metrics: metrics,
      };
    }
    let status = "Weak";
    if (loc === "inside") status = "Pass";
    else if (loc === "below" && zoneEval && zoneEval.range1) status = "Pass";
    else if (loc === "above") status = "Weak";
    else if (zoneEval && zoneEval.status === "Pass") status = "Weak";
    return {
      id: "cluster",
      title: "Профиль / кластер (D1 proxy)",
      status: status,
      detail:
        (cluster && cluster.poc != null
          ? "POC " + cluster.poc + " · VA " + cluster.val + "–" + cluster.vah
          : "HVN zone") + " · без M5 footprint (стол)",
      metrics: metrics,
    };
  }

  function gateMacro() {
    return {
      id: "macro",
      title: "Макро/сектор",
      status: "NoData",
      detail: "macro overlay — на столе",
      metrics: {},
    };
  }

  function gateSize(zoneEval, category) {
    if (!zoneEval || !zoneEval.range1 || zoneEval.targetPrice == null) {
      return {
        id: "size",
        title: "Сайзинг",
        status: "NoData",
        detail: "no zones for RR",
        metrics: {},
      };
    }
    const entry = zoneEval.range1.mid;
    let stop = zoneEval.range1.low;
    if (zoneEval.range2 && zoneEval.range2.low < stop) stop = zoneEval.range2.low;
    if (!(stop < entry)) stop = entry * 0.97;
    let target = zoneEval.targetPrice;
    if (!(target > entry)) target = entry * 1.08;
    const risk = entry - stop;
    const reward = target - entry;
    const rr = risk > 0 ? reward / risk : 0;
    if (!(category <= 3)) {
      return {
        id: "size",
        title: "Сайзинг",
        status: "Skip",
        detail: "CAT not investable",
        metrics: { rr: round(rr, 2) },
      };
    }
    if (rr < 2) {
      return {
        id: "size",
        title: "Сайзинг",
        status: "Fail",
        detail: "RR=" + round(rr, 2) + " < 2",
        metrics: {
          rr: round(rr, 2),
          entry: round(entry, 4),
          stop: round(stop, 4),
          target: round(target, 4),
        },
      };
    }
    return {
      id: "size",
      title: "Сайзинг",
      status: "Pass",
      detail: "RR=" + round(rr, 2) + " (research, без лестницы лимиток)",
      metrics: {
        rr: round(rr, 2),
        entry: round(entry, 4),
        stop: round(stop, 4),
        target: round(target, 4),
      },
    };
  }

  /**
   * Desk InvestmentsPlaybook.composeVerdict + softTape (vol & cluster both WEAK → watch).
   */
  function composeVerdict(gates) {
    const w = THRESHOLDS.weights;
    let num = 0;
    let den = 0;
    Object.keys(w).forEach(function (k) {
      const g = gates[k];
      if (!g) return;
      const s = STATUS_SCORE[g.status];
      if (s == null) return;
      num += w[k] * s;
      den += w[k];
    });
    const weighted = den > 0 ? num / den : 0;
    const fund = gates.fund || {};
    const liq = gates.liquidity || {};
    const trend = gates.trend || {};
    const size = gates.size || {};
    const volume = gates.indicators || {};
    const cluster = gates.cluster || {};
    const fails = Object.keys(gates).filter(function (k) {
      return gates[k] && (gates[k].status === "Fail" || gates[k].status === "Skip");
    }).length;

    let verdict = "skip";
    if (
      fund.status === "Fail" ||
      liq.status === "Fail" ||
      trend.status === "Skip" ||
      size.status === "Fail" ||
      volume.status === "Fail" ||
      volume.status === "NoData" ||
      cluster.status === "Fail"
    ) {
      verdict = "skip";
    } else if (weighted >= THRESHOLDS.investMin && fund.status !== "NoData") {
      verdict = "invest";
    } else if (weighted >= THRESHOLDS.watchMin) {
      verdict = "watch";
    } else {
      verdict = "skip";
    }

    if (fund.status === "NoData" && verdict === "invest") verdict = "watch";
    if (verdict === "invest" && volume.status === "Weak" && cluster.status === "Weak") {
      verdict = "watch";
    }

    return { verdict: verdict, weighted: round(weighted, 4), failCount: fails };
  }

  function scenariosFromFund(fund, quote) {
    const name = (quote && quote.shortName) || "Эмитент";
    const rel = fund && fund.reliabilityLabel;
    const pot = fund && fund.potential;
    const nd = !fund || fund.status === "NoData";
    return {
      base: nd
        ? name +
          ": базовый сценарий без МСФО — только рыночный контекст. Решение откладывается до появления отчётности. Это не прогноз цены."
        : name +
          ": база — компания оценивается как «" +
          (rel || "н/д") +
          "», средний темп качества (потенциал) " +
          (pot == null ? "н/д" : (pot * 100).toFixed(1) + "%") +
          ". Сценарий описывает качество бизнеса, не целевую цену.",
      optimistic: nd
        ? "Оптимист без фундаментала недоступен: нет опоры в выручке / FCF / капитале. Не заполняем розовую картину."
        : pot != null && pot > 0
          ? "Оптимист: сохранение положительных дельт (прибыль, FCF или портфель/депозиты для банка) при контролируемом долге. Не обещание роста котировки."
          : "Оптимист ограничен: потенциал по дельтам слабый или отрицательный — апсайд только если развернётся операционка.",
      risk: nd
        ? "Риск-сценарий: неизвестные долг, FCF и устойчивость. Главный риск — инвестировать вслепую."
        : fund.status === "Fail"
          ? "Риск: скоринг ненадёжный (рычаг, CAR или качество потока). Приоритет — не наращивать риск, наблюдать отчётность."
          : "Риск: регресс дельт, рост долга/резервов, пробой границ анкеты по просадке. Мониторинг отчётности важнее «точки цены».",
    };
  }

  function analyzePrepared(input) {
    const quote = input.quote || {};
    const candles = input.candles || [];
    const fundIn = input.fundamentals || null;
    const profile = input.riskProfile || null;
    const ind = computeIndicators(candles);
    const fundScored = Fund.scoreFundamentals(fundIn, quote.last);
    const cluster = buildCluster(candles, profile, ind.last);
    const zoneEval = evaluateZones(candles);
    const trend = gateTrend(ind);
    const fundGate = gateFund(fundScored);
    const potCat = gatePotentialAndCategory(fundScored, zoneEval);
    const gates = {
      market: gateMarket(quote, candles),
      fund: fundGate,
      liquidity: gateLiquidity(quote),
      macro: gateMacro(),
      trend: trend,
      zones: gateZones(zoneEval),
      potential: potCat.potGate,
      category: potCat.catGate,
      indicators: gateIndicators(ind, candles),
      strategy: gateStrategy(trend, fundGate, quote),
      cluster: gateCluster(ind, cluster, zoneEval),
      size: gateSize(zoneEval, potCat.category),
    };
    const composed = composeVerdict(gates);
    const scenarios = scenariosFromFund(fundScored, quote);
    const payload = {
      ticker: quote.ticker || input.ticker,
      name: quote.shortName || quote.ticker,
      quote,
      indicators: {
        last: round(ind.last, 4),
        smaFast: round(ind.smaFast, 4),
        smaSlow: round(ind.smaSlow, 4),
        rsi: round(ind.rsi, 2),
        volRatio: round(ind.volRatio, 3),
        rangePct: round(ind.rangePct, 4),
        bars: ind.bars,
        thresholds: {
          smaFast: THRESHOLDS.smaFast,
          smaSlow: THRESHOLDS.smaSlow,
          rsiPeriod: THRESHOLDS.rsiPeriod,
          rsiPass: [THRESHOLDS.rsiPassLow, THRESHOLDS.rsiPassHigh],
          volumePass: [THRESHOLDS.volumePassLow, THRESHOLDS.volumePassHigh],
        },
      },
      fund: fundScored,
      cluster: cluster,
      zones: zoneEval,
      category: potCat.category,
      blendedPotentialPct: potCat.blendedPct,
      gates,
      verdict: composed.verdict,
      weighted: composed.weighted,
      playbook: "investments-desk",
      scenarios,
      riskProfile: profile,
      candles: (candles || []).slice(-180).map((c) => ({
        t: c.begin || c.end || "",
        o: c.open,
        h: c.high,
        l: c.low,
        c: c.close,
        v: c.volume,
      })),
    };
    payload.explanation = Explain.buildExplanation(payload);
    payload.inputs = {
      ticker: payload.ticker,
      hasFundamentals: fundScored.status !== "NoData",
      sector: fundScored.sector,
      board: quote.board || null,
      profileLevel: profile && profile.risk_level,
    };
    return payload;
  }

  async function analyzeTicker(ticker, options) {
    const opts = options || {};
    const secid = String(ticker || "")
      .trim()
      .toUpperCase();
    if (!secid) throw new Error("Укажите тикер");
    const quote = await fetchQuote(secid, opts);
    let candles = [];
    let issError = null;
    if (quote.found) {
      try {
        candles = await fetchCandles(secid, quote.board, opts);
      } catch (err) {
        issError = err && err.message ? err.message : String(err);
      }
    }
    const result = analyzePrepared({
      ticker: secid,
      quote: quote.found ? quote : { ticker: secid, found: false, last: null },
      candles,
      fundamentals: opts.fundamentals || null,
      riskProfile: opts.riskProfile || null,
    });
    result.marketVia = opts._issVia || null;
    if (issError) {
      result.issError = issError;
      result.gates.market.detail += " · свечи: " + issError;
    }
    return result;
  }

  function deskLegsFromJournal(journal) {
    const entries = (journal && journal.entries) || [];
    return entries
      .filter((e) => String(e.status || "").toUpperCase() === "OPEN")
      .map((e, i) => {
        const book = e.book || "DAILY";
        const pair = (e.tickerY || "?") + " / " + (e.tickerX || "?");
        const rub =
          e.notionalRub != null
            ? Number(e.notionalRub)
            : e.exposureRub != null
              ? Number(e.exposureRub)
              : e.allocatedRub != null
                ? Number(e.allocatedRub)
                : e.capitalRub != null
                  ? Number(e.capitalRub)
                  : null;
        const frac = e.remainingFraction != null ? Number(e.remainingFraction) : null;
        const value = rub != null && Number.isFinite(rub) && rub > 0 ? rub : frac != null ? Math.abs(frac) * 1000 : 0;
        const valueKind = rub != null && rub > 0 ? "rub" : frac != null ? "relative" : "unknown";
        return {
          id: "desk-" + (e.id || e.slotId || i),
          side: "asset",
          asset_class: "акции",
          name: bookLabel(book) + ": " + pair,
          ticker: e.tickerY || "",
          value,
          valueKind,
          currency: "RUB",
          notes: "desk · " + book,
          source: "desk",
          book: book,
        };
      });
  }

  function bookLabel(book) {
    const b = String(book || "").toUpperCase();
    if (b.indexOf("EXCL") !== -1) return "Exclusive";
    if (b.indexOf("ARB") !== -1 || b.indexOf("CAL") !== -1 || b.indexOf("SPREAD") !== -1) return "arb";
    if (b.indexOf("PAIR") !== -1 || b === "DAILY" || b.indexOf("TREND") !== -1) return "pairs";
    return book || "desk";
  }

  return {
    THRESHOLDS,
    ISS_DEFAULT,
    DEFAULT_ISS_READER,
    extractIssJson,
    sma,
    rsiWilder,
    parseIssTable,
    pickBoardRow,
    mapCandles,
    computeIndicators,
    volumeProfile,
    barDelta,
    buildCluster,
    gateMarket,
    gateFund,
    gateLiquidity,
    gateTrend,
    gateZones,
    evaluateZones,
    gatePotentialAndCategory,
    gateIndicators,
    gateStrategy,
    gateCluster,
    gateMacro,
    gateSize,
    composeVerdict,
    analyzePrepared,
    analyzeTicker,
    fetchQuote,
    fetchCandles,
    fetchIssJson,
    deskLegsFromJournal,
    bookLabel,
  };
});
