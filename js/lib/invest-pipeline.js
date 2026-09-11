/**
 * Invest auto-pipeline: MOEX ISS market + indicators + strategy skeleton +
 * volume-cluster proxy + composite verdict.
 *
 * Thresholds live in THRESHOLDS (edit in one place).
 *
 * TODO (strategy PDF, ~141 pp — not fully ported in MVP):
 * - full issuer screen / universe filters
 * - dividend calendar and payout quality
 * - position sizing / pyramid rules
 * - accompaniment playbook after fill
 * - sector relative-value vs peers
 *
 * TODO (indicators PDF): MACD, ADX, Bollinger, stochastic, VWAP — slot later.
 * TODO (cluster PDF): footprint / delta / POC — phase 2; MVP is volume proxy only.
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
    candleDays: 400,
    weights: {
      market: 0.15,
      fund: 0.3,
      indicators: 0.2,
      strategy: 0.25,
      cluster: 0.1,
    },
    investMin: 0.72,
    watchMin: 0.4,
  };

  const STATUS_SCORE = { Pass: 1, Weak: 0.55, Fail: 0, NoData: null };

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

  function gateIndicators(ind) {
    const parts = [];
    let smaStatus = "NoData";
    if (ind.last != null && ind.smaFast != null && ind.smaSlow != null) {
      const up = ind.last > ind.smaFast && ind.smaFast > ind.smaSlow;
      const down = ind.last < ind.smaFast && ind.smaFast < ind.smaSlow;
      smaStatus = up ? "Pass" : down ? "Fail" : "Weak";
      parts.push(
        "SMA" +
          THRESHOLDS.smaFast +
          "/" +
          THRESHOLDS.smaSlow +
          ": close " +
          round(ind.last, 2) +
          " vs " +
          round(ind.smaFast, 2) +
          " / " +
          round(ind.smaSlow, 2) +
          " → " +
          smaStatus
      );
    } else {
      parts.push("SMA: недостаточно баров");
    }

    let rsiStatus = "NoData";
    if (ind.rsi != null) {
      if (ind.rsi >= THRESHOLDS.rsiPassLow && ind.rsi <= THRESHOLDS.rsiPassHigh) rsiStatus = "Pass";
      else if (ind.rsi > THRESHOLDS.rsiWeakHigh || ind.rsi < THRESHOLDS.rsiWeakLow) rsiStatus = "Fail";
      else rsiStatus = "Weak";
      parts.push("RSI(" + THRESHOLDS.rsiPeriod + ")=" + round(ind.rsi, 1) + " → " + rsiStatus);
    } else {
      parts.push("RSI: недостаточно баров");
    }

    let volStatus = "NoData";
    if (ind.volRatio != null) {
      if (ind.volRatio < THRESHOLDS.volumeFailLow || ind.volRatio > THRESHOLDS.volumeFailHigh) {
        volStatus = "Fail";
      } else if (ind.volRatio >= THRESHOLDS.volumePassLow && ind.volRatio <= THRESHOLDS.volumePassHigh) {
        volStatus = "Pass";
      } else {
        volStatus = "Weak";
      }
      parts.push("объём/SMA(объём)=" + round(ind.volRatio, 2) + " → " + volStatus);
    }

    const status = worstStatus([smaStatus, rsiStatus, volStatus].filter((s) => s !== "NoData"));
    return {
      id: "indicators",
      title: "Индикаторы",
      status: status || "NoData",
      detail: parts.join("; "),
      metrics: {
        smaFast: round(ind.smaFast, 4),
        smaSlow: round(ind.smaSlow, 4),
        rsi: round(ind.rsi, 2),
        volRatio: round(ind.volRatio, 3),
        rangePct: round(ind.rangePct, 4),
        smaStatus,
        rsiStatus,
        volStatus,
      },
    };
  }

  function gateStrategy(ind, fundGate, quote, profile) {
    /* Playbook skeleton: context → selection → entry zone → risk → accompaniment. */
    const rules = [];

    let context = "NoData";
    if (ind.last != null && ind.smaSlow != null) {
      context = ind.last >= ind.smaSlow ? "Pass" : "Weak";
      rules.push({
        id: "context",
        status: context,
        text: "Контекст тренда: цена относительно SMA" + THRESHOLDS.smaSlow,
      });
    }

    let selection = "NoData";
    if (ind.rsi != null) {
      selection = ind.rsi > THRESHOLDS.rsiWeakHigh ? "Fail" : ind.rsi >= THRESHOLDS.rsiPassHigh ? "Weak" : "Pass";
      rules.push({
        id: "selection",
        status: selection,
        text: "Отбор: RSI не в зоне перекупленности для нового интереса",
      });
    }

    let entry = "NoData";
    if (ind.last != null && ind.smaFast != null) {
      const dist = Math.abs(ind.last - ind.smaFast) / ind.smaFast;
      const between =
        ind.smaSlow != null &&
        ((ind.last <= ind.smaFast && ind.last >= ind.smaSlow) ||
          (ind.last >= ind.smaFast && ind.last <= ind.smaSlow));
      entry = dist <= THRESHOLDS.entryBandPct || between ? "Pass" : "Weak";
      rules.push({
        id: "entry",
        status: entry,
        text: "Зона входа: близость к SMA" + THRESHOLDS.smaFast + " или коридор SMA",
      });
    }

    let chase = "NoData";
    if (ind.last != null && ind.smaFast != null && ind.smaFast > 0) {
      const ext = (ind.last - ind.smaFast) / ind.smaFast;
      chase = ext > THRESHOLDS.chasePct ? "Fail" : ext > THRESHOLDS.entryBandPct * 2 ? "Weak" : "Pass";
      rules.push({
        id: "chase",
        status: chase,
        text: "Не догонять растяжку от SMA" + THRESHOLDS.smaFast,
      });
    }

    let risk = "NoData";
    if (ind.rangePct != null) {
      const warn = profile && profile.warn_drawdown_pct != null ? Number(profile.warn_drawdown_pct) / 100 : 0.15;
      risk = ind.rangePct > warn * 1.6 ? "Fail" : ind.rangePct > warn * 1.15 ? "Weak" : "Pass";
      rules.push({
        id: "risk",
        status: risk,
        text: "Риск: 20-дневный диапазон vs граница предупреждения анкеты",
      });
    }

    let accompany = "NoData";
    if (ind.volRatio != null) {
      accompany = ind.volRatio >= 0.8 ? "Pass" : "Weak";
      rules.push({
        id: "accompany",
        status: accompany,
        text: "Сопровождение: объём не «мёртвый» относительно своей SMA",
      });
    }

    let list = "NoData";
    if (quote && quote.listLevel != null) {
      list = quote.listLevel === 1 ? "Pass" : quote.listLevel === 2 ? "Weak" : "Fail";
      rules.push({
        id: "listing",
        status: list,
        text: "Листинг MOEX уровень " + quote.listLevel,
      });
    }

    let fundAlign = "Weak";
    if (!fundGate || fundGate.status === "NoData") fundAlign = "Weak";
    else if (fundGate.status === "Fail") fundAlign = "Fail";
    else fundAlign = fundGate.status;
    rules.push({
      id: "fund_align",
      status: fundAlign,
      text: "Стыковка с фундаментальным скорингом (если поля есть)",
    });

    const statuses = rules.map((r) => r.status).filter((s) => s !== "NoData");
    const fails = statuses.filter((s) => s === "Fail").length;
    let status = worstStatus(statuses.length ? statuses : ["NoData"]);
    if (fails >= 2) status = "Fail";
    else if (fails === 1 && status === "Fail") {
      /* single fail stays Fail only if chase/selection/fund — already Fail */
    }

    return {
      id: "strategy",
      title: "Стратегия (каркас playbook)",
      status: status || "NoData",
      detail: rules.map((r) => r.id + ":" + r.status).join(" · "),
      metrics: { rules },
    };
  }

  function gateCluster(ind) {
    if (ind.volRatio == null) {
      return {
        id: "cluster",
        title: "Кластер / объём (прокси)",
        status: "NoData",
        detail:
          "Нет ряда объёмов. Это прокси по свечам ISS, не полный кластерный анализ (footprint / дельта / POC — фаза 2).",
        metrics: { proxy: true },
      };
    }
    let status = "Weak";
    if (ind.volRatio >= 0.8 && ind.volRatio <= 2.5) status = "Pass";
    else if (ind.volRatio < 0.5) status = "Fail";
    return {
      id: "cluster",
      title: "Кластер / объём (прокси)",
      status,
      detail:
        "Относительный объём " +
        round(ind.volRatio, 2) +
        "× SMA(" +
        THRESHOLDS.volumeSma +
        "). Прокси, не полный кластерный анализ; слот фазы 2 — footprint.",
      metrics: { volRatio: round(ind.volRatio, 3), proxy: true, phase2: "footprint" },
    };
  }

  function composeVerdict(gates) {
    const w = THRESHOLDS.weights;
    let num = 0;
    let den = 0;
    Object.keys(w).forEach((k) => {
      const g = gates[k];
      if (!g) return;
      const s = STATUS_SCORE[g.status];
      if (s == null) return;
      num += w[k] * s;
      den += w[k];
    });
    const weighted = den > 0 ? num / den : 0;
    const fund = gates.fund || {};
    const market = gates.market || {};
    const strategy = gates.strategy || {};
    const fails = Object.keys(gates).filter((k) => gates[k].status === "Fail").length;

    let verdict = "watch";
    if (market.status === "Fail" || fails >= 2 || weighted < THRESHOLDS.watchMin) {
      verdict = "skip";
    } else if (
      fund.status !== "NoData" &&
      fund.status !== "Fail" &&
      market.status !== "Fail" &&
      strategy.status !== "Fail" &&
      weighted >= THRESHOLDS.investMin
    ) {
      verdict = "invest";
    } else {
      verdict = "watch";
    }

    /* Never Invest blindly without fundamentals. */
    if (fund.status === "NoData" && verdict === "invest") verdict = "watch";
    if (fund.status === "Fail" && verdict === "invest") verdict = "watch";

    return { verdict, weighted: round(weighted, 4), failCount: fails };
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
    const gates = {
      market: gateMarket(quote, candles),
      fund: gateFund(fundScored),
      indicators: gateIndicators(ind),
      strategy: gateStrategy(ind, null, quote, profile),
      cluster: gateCluster(ind),
    };
    gates.strategy = gateStrategy(ind, gates.fund, quote, profile);
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
      gates,
      verdict: composed.verdict,
      weighted: composed.weighted,
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
    gateMarket,
    gateFund,
    gateIndicators,
    gateStrategy,
    gateCluster,
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
