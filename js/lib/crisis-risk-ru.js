/**
 * Russia Crisis Risk Index (CRI_RU) — frontend engine for the protected invest contour.
 *
 * Trust rules for public users:
 * - Score from MOEX ISS + ЦБ (live) + dated macro file for slow series. Missing rows omitted / reweighted.
 * - No anonymous demo numbers in the published score.
 * - Outlook from MOEX trading-day history (last ≥5 sessions) + browser cache; asOf stays today.
 * - Research / decision-support only — not a price forecast or investment advice.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TrinityCrisisRiskRu = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const globalRoot = typeof globalThis !== "undefined" ? globalThis : null;

  const ZONES = [
    { id: "calm", min: 0, max: 29, label: "спокойно", labelEn: "Calm" },
    { id: "elevated", min: 30, max: 49, label: "повышенный", labelEn: "Elevated" },
    { id: "high", min: 50, max: 69, label: "высокий", labelEn: "High" },
    { id: "crisis", min: 70, max: 100, label: "кризисный", labelEn: "Crisis" },
  ];

  const BLOCKS = [
    { id: "market", label: "Рынок / риск", weight: 22 },
    { id: "money", label: "Деньги / ЦБ", weight: 22 },
    { id: "real", label: "Реальный сектор", weight: 22 },
    { id: "commodity", label: "Сырьё / внешнее", weight: 16 },
    { id: "geo", label: "Геополитика", weight: 18 },
  ];

  /** Minimum covered weight (%) before we publish a score / macro gate. */
  const MIN_COVERED_WEIGHT = 25;
  /** Outlook needs this many stored live daily scores and calendar span. */
  const OUTLOOK_MIN_POINTS = 5;
  const OUTLOOK_MIN_SPAN_DAYS = 5;

  const CACHE_KEY = "trinity.cri.ru.daily.v4";
  const MACRO_URL = "data/crisis-risk-ru-macro.json";
  const ISS_DEFAULT = "https://iss.moex.com/iss";
  const DEFAULT_ISS_READER = "https://r.jina.ai/";
  /** Max age (days) for slow macro-file rows to enter the score (monthly series). */
  const MACRO_MAX_AGE_DAYS = 100;

  /**
   * weightPct — points that sum to 100.
   * live: can be filled from public MOEX/CBR in the browser.
   */
  const INDICATORS = [
    {
      id: "imoex_dd20",
      block: "market",
      title: "IMOEX 20d drawdown, %",
      weightPct: 5,
      higherWorse: true,
      calm: 3,
      alert: 8,
      stress: 18,
      unit: "%",
      live: true,
    },
    {
      id: "rtsvix",
      block: "market",
      title: "RVI (волатильность)",
      weightPct: 5,
      higherWorse: true,
      calm: 18,
      alert: 28,
      stress: 45,
      unit: "",
      live: true,
    },
    {
      id: "ofz_curve",
      block: "market",
      title: "Спред ОФЗ 10Y−1Y, п.п.",
      weightPct: 4,
      higherWorse: false,
      calm: 1.2,
      alert: 0.3,
      stress: -0.5,
      unit: "п.п.",
      live: true,
    },
    {
      id: "ofz_10y",
      block: "market",
      title: "ОФЗ 10Y vs медиана 1Y, п.п.",
      weightPct: 4,
      higherWorse: true,
      calm: 0.3,
      alert: 1.0,
      stress: 2.5,
      unit: "п.п.",
      live: true,
    },
    {
      id: "usdrub_20d",
      block: "market",
      title: "USD/RUB 20d change, %",
      weightPct: 4,
      higherWorse: true,
      calm: 2,
      alert: 6,
      stress: 14,
      unit: "%",
      live: true,
    },
    {
      id: "key_rate",
      block: "money",
      title: "Ключевая ставка ЦБ, %",
      weightPct: 5,
      higherWorse: true,
      calm: 10,
      alert: 16,
      stress: 21,
      unit: "%",
      live: true,
    },
    {
      id: "ruonia_basis",
      block: "money",
      title: "RUSFAR − ключевая, б.п.",
      weightPct: 4,
      higherWorse: true,
      calm: 20,
      alert: 80,
      stress: 200,
      unit: "б.п.",
      live: true,
    },
    {
      id: "cpi_yoy",
      block: "money",
      title: "CPI YoY, %",
      weightPct: 5,
      higherWorse: true,
      calm: 5,
      alert: 8,
      stress: 14,
      unit: "%",
      live: true,
      feed: "cbr",
    },
    {
      id: "m2_yoy",
      block: "money",
      title: "M2 YoY, %",
      weightPct: 4,
      higherWorse: true,
      calm: 12,
      alert: 20,
      stress: 30,
      unit: "%",
      live: true,
      feed: "macro",
    },
    {
      id: "reserves",
      block: "money",
      title: "ЗВР, $ млрд",
      weightPct: 4,
      higherWorse: false,
      calm: 580,
      alert: 500,
      stress: 420,
      unit: "$ млрд",
      live: true,
      feed: "cbr",
    },
    {
      id: "pmi_mfg",
      block: "real",
      title: "PMI промышленность",
      weightPct: 5,
      higherWorse: false,
      calm: 52,
      alert: 48,
      stress: 44,
      unit: "",
      live: true,
      feed: "macro",
    },
    {
      id: "pmi_svc",
      block: "real",
      title: "PMI услуги",
      weightPct: 4,
      higherWorse: false,
      calm: 52,
      alert: 48,
      stress: 44,
      unit: "",
      live: true,
      feed: "macro",
    },
    {
      id: "ind_prod_yoy",
      block: "real",
      title: "Промпроизводство YoY, %",
      weightPct: 4,
      higherWorse: false,
      calm: 3,
      alert: 0,
      stress: -4,
      unit: "%",
      live: true,
      feed: "macro",
    },
    {
      id: "retail_yoy",
      block: "real",
      title: "Розница YoY, %",
      weightPct: 3,
      higherWorse: false,
      calm: 3,
      alert: 0,
      stress: -5,
      unit: "%",
      live: true,
      feed: "macro",
    },
    {
      id: "unemployment",
      block: "real",
      title: "Безработица, %",
      weightPct: 3,
      higherWorse: true,
      calm: 3.5,
      alert: 5,
      stress: 7.5,
      unit: "%",
      live: true,
      feed: "macro",
    },
    {
      id: "rail_yoy",
      block: "real",
      title: "Ж/д погрузка YoY, %",
      weightPct: 3,
      higherWorse: false,
      calm: 2,
      alert: -1,
      stress: -6,
      unit: "%",
      live: true,
      feed: "macro",
    },
    {
      id: "brent",
      block: "commodity",
      title: "Brent (фьючерс MOEX), $",
      weightPct: 4,
      higherWorse: false,
      calm: 80,
      alert: 65,
      stress: 50,
      unit: "$",
      live: true,
    },
    {
      id: "urals_disc",
      block: "commodity",
      title: "Дисконт Urals к Brent, $",
      weightPct: 5,
      higherWorse: true,
      calm: 8,
      alert: 15,
      stress: 28,
      unit: "$",
      live: true,
      feed: "macro",
    },
    {
      id: "gas_ttf",
      block: "commodity",
      title: "Газ TTF / proxy, €/MWh",
      weightPct: 3,
      higherWorse: true,
      calm: 35,
      alert: 60,
      stress: 120,
      unit: "€",
      live: true,
      feed: "macro",
    },
    {
      id: "trade_balance",
      block: "commodity",
      title: "Торговый баланс, $ млрд/мес",
      weightPct: 4,
      higherWorse: false,
      calm: 10,
      alert: 4,
      stress: -2,
      unit: "$ млрд",
      live: true,
      feed: "macro",
    },
    {
      id: "cny_fx_stress",
      block: "geo",
      title: "CNY/RUB 20d stress 0–100",
      weightPct: 5,
      higherWorse: true,
      calm: 25,
      alert: 50,
      stress: 80,
      unit: "",
      live: true,
    },
    {
      id: "cds_5y",
      block: "geo",
      title: "CDS РФ 5Y / EM-спред, б.п.",
      weightPct: 5,
      higherWorse: true,
      calm: 120,
      alert: 250,
      stress: 500,
      unit: "б.п.",
      live: true,
      feed: "macro",
    },
    {
      id: "gold_fx_reserves",
      block: "geo",
      title: "Резервы: gold share stress 0–100",
      weightPct: 4,
      higherWorse: true,
      calm: 25,
      alert: 50,
      stress: 75,
      unit: "",
      live: true,
      feed: "macro",
    },
    {
      id: "sanctions_news",
      block: "geo",
      title: "News/sanctions stress 0–100",
      weightPct: 4,
      higherWorse: true,
      calm: 20,
      alert: 45,
      stress: 75,
      unit: "",
      live: true,
      feed: "macro",
    },
  ];

  /** Unit-test fixture only — never used for the published invest snapshot. */
  const SAMPLE_READINGS = {
    asOf: null,
    values: {
      imoex_dd20: 6.2,
      rtsvix: 26,
      ofz_curve: 0.4,
      ofz_10y: 0.9,
      usdrub_20d: 4.5,
      key_rate: 14,
      ruonia_basis: 2,
      brent: 72,
      cny_fx_stress: 40,
    },
  };

  const SOFT_SECTORS = {
    oil: true,
    energy: true,
    oilgas: true,
    banks: true,
    fin: true,
    financials: true,
    metals: true,
    mining: true,
  };

  function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
  }

  function round(n, d) {
    if (n == null || !Number.isFinite(n)) return null;
    const p = Math.pow(10, d == null ? 1 : d);
    return Math.round(n * p) / p;
  }

  function indicatorById(id) {
    for (let i = 0; i < INDICATORS.length; i++) {
      if (INDICATORS[i].id === id) return INDICATORS[i];
    }
    return null;
  }

  function normalizeValue(raw, ind) {
    if (raw == null || !Number.isFinite(Number(raw))) return null;
    const v = Number(raw);
    const c = ind.calm;
    const a = ind.alert;
    const s = ind.stress;

    if (ind.higherWorse) {
      if (v <= c) return 0;
      if (v >= s) return 100;
      if (v <= a) {
        const den = a - c;
        return den === 0 ? 50 : 50 * ((v - c) / den);
      }
      const den = s - a;
      return den === 0 ? 100 : 50 + 50 * ((v - a) / den);
    }

    if (v >= c) return 0;
    if (v <= s) return 100;
    if (v >= a) {
      const den = c - a;
      return den === 0 ? 50 : 50 * ((c - v) / den);
    }
    const den = a - s;
    return den === 0 ? 100 : 50 + 50 * ((a - v) / den);
  }

  function zoneFromScore(score) {
    const s = clamp(Number(score) || 0, 0, 100);
    for (let i = 0; i < ZONES.length; i++) {
      const z = ZONES[i];
      if (s >= z.min && s <= z.max) {
        return { id: z.id, label: z.label, labelEn: z.labelEn, min: z.min, max: z.max };
      }
    }
    return { id: "crisis", label: "кризисный", labelEn: "Crisis", min: 70, max: 100 };
  }

  function sectorSoft(sector) {
    const key = String(sector || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-zа-яё]/gi, "");
    if (!key) return false;
    if (SOFT_SECTORS[key]) return true;
    if (key.indexOf("нефт") !== -1 || key.indexOf("газ") !== -1) return true;
    if (key.indexOf("банк") !== -1 || key.indexOf("фин") !== -1) return true;
    if (key.indexOf("металл") !== -1) return true;
    if (key.indexOf("oil") !== -1 || key.indexOf("bank") !== -1) return true;
    return false;
  }

  function toMacroGate(snapshot, sector) {
    if (
      !snapshot ||
      snapshot.score == null ||
      !Number.isFinite(Number(snapshot.score)) ||
      snapshot.reliable === false
    ) {
      return {
        id: "macro",
        title: "Макро/сектор",
        status: "NoData",
        detail:
          snapshot && snapshot.coveredWeight != null
            ? "CRI_RU покрытие " + snapshot.coveredWeight + "% — мало живых рядов"
            : "CRI_RU — нет надёжного снимка",
        metrics: {},
      };
    }
    const score = round(Number(snapshot.score), 1);
    const zone = snapshot.zone || zoneFromScore(score);
    let status = "Pass";
    if (score >= 55) {
      status = sectorSoft(sector) && score < 70 ? "Weak" : "Fail";
    } else if (score >= 35) {
      status = "Weak";
    }
    const out = snapshot.outlook;
    const outBit =
      out && out.direction && out.direction !== "insufficient"
        ? " · " + outlookLabel(out.direction)
        : "";
    return {
      id: "macro",
      title: "Макро/сектор",
      status: status,
      detail: "CRI_RU " + score + " · " + (zone.label || zone.id) + outBit,
      metrics: {
        criRu: score,
        zone: zone.id,
        coveredWeight: snapshot.coveredWeight,
        outlook: out && out.direction,
      },
    };
  }

  function outlookLabel(dir) {
    if (dir === "improving") return "смягчение";
    if (dir === "deteriorating") return "ухудшение";
    if (dir === "insufficient") return "недостаточно истории";
    return "стабильно";
  }

  function historyTrusted(history, day) {
    if (!history || history.length < OUTLOOK_MIN_POINTS) return false;
    const liveHist = history.filter((h) => h && h.live && h.score != null && h.day);
    if (liveHist.length < OUTLOOK_MIN_POINTS) return false;
    let oldest = day;
    liveHist.forEach((h) => {
      if (h.day < oldest) oldest = h.day;
    });
    const span = daysBetween(oldest, day);
    return span != null && span >= OUTLOOK_MIN_SPAN_DAYS;
  }

  function buildOutlook(score, blockScores, rows, opts) {
    const o = opts || {};
    if (!o.historyTrusted) {
      return {
        direction: "insufficient",
        label: outlookLabel("insufficient"),
        trust: "low",
        horizon: "1–4 недели",
        delta7d: null,
        delta30d: null,
        reasons: [
          "Нужна история ≥" +
            OUTLOOK_MIN_POINTS +
            " торговых дней Мосбиржи — сейчас её ещё нет в снимке.",
        ],
      };
    }

    const d7 = o.scorePrev7d != null ? score - Number(o.scorePrev7d) : null;
    const d30 = o.scorePrev30d != null ? score - Number(o.scorePrev30d) : null;
    const reasons = [];
    let direction = "stable";

    if (d7 != null && d7 <= -3) direction = "improving";
    else if (d7 != null && d7 >= 3) direction = "deteriorating";
    else if (d30 != null && d30 <= -5) direction = "improving";
    else if (d30 != null && d30 >= 5) direction = "deteriorating";

    if (d7 != null) {
      reasons.push("ΔCRI за ~7д: " + (d7 > 0 ? "+" : "") + round(d7, 1) + " п.");
    }
    if (d30 != null && reasons.length < 3) {
      reasons.push("ΔCRI за ~30д: " + (d30 > 0 ? "+" : "") + round(d30, 1) + " п.");
    }
    const sorted = (rows || [])
      .filter((r) => r.stressScore != null)
      .slice()
      .sort((a, b) => (b.contribution || 0) - (a.contribution || 0));
    if (sorted[0] && reasons.length < 3) {
      reasons.push(
        "Сильнее всего тянет: " +
          sorted[0].title +
          " (стресс " +
          round(sorted[0].stressScore, 0) +
          ")"
      );
    }

    return {
      direction: direction,
      label: outlookLabel(direction),
      trust: "history",
      horizon: "1–4 недели",
      delta7d: d7 != null ? round(d7, 1) : null,
      delta30d: d30 != null ? round(d30, 1) : null,
      reasons: reasons.slice(0, 3),
    };
  }

  function todayKey(date) {
    const d = date instanceof Date ? date : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function formatAsOf(iso) {
    if (!iso || typeof iso !== "string") return "";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (!m) return iso;
    const months = [
      "января",
      "февраля",
      "марта",
      "апреля",
      "мая",
      "июня",
      "июля",
      "августа",
      "сентября",
      "октября",
      "ноября",
      "декабря",
    ];
    return Number(m[3]) + " " + (months[Number(m[2]) - 1] || m[2]) + " " + m[1];
  }

  function daysBetween(a, b) {
    const pa = Date.parse(a + "T12:00:00");
    const pb = Date.parse(b + "T12:00:00");
    if (!Number.isFinite(pa) || !Number.isFinite(pb)) return null;
    return Math.round((pb - pa) / 86400000);
  }

  function scoreNear(history, day, lookback) {
    if (!history || !history.length) return null;
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < history.length; i++) {
      const h = history[i];
      if (!h || h.day == null || h.score == null || !h.live) continue;
      const dist = daysBetween(h.day, day);
      if (dist == null || dist < 0) continue;
      const err = Math.abs(dist - lookback);
      if (err < bestDist) {
        bestDist = err;
        best = Number(h.score);
      }
    }
    return bestDist <= 3 ? best : null;
  }

  function readDailyCache() {
    try {
      if (typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function writeDailyCache(day, snapshot, history) {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          day: day,
          snapshot: snapshot,
          history: (history || []).slice(-40),
        })
      );
    } catch (_) {}
  }

  function compute(readings) {
    const src = readings || {};
    const values = src.values || {};
    const asOf = src.asOf || todayKey();
    const sources = src.sources || {};
    const rows = [];
    let weightSum = 0;
    let weighted = 0;
    const blockAcc = {};
    let liveCount = 0;
    let missingLive = 0;

    BLOCKS.forEach((b) => {
      blockAcc[b.id] = { weight: 0, weighted: 0 };
    });

    INDICATORS.forEach((ind) => {
      const raw = values[ind.id];
      const stress = normalizeValue(raw, ind);
      const w = ind.weightPct / 100;
      const has = stress != null;
      if (ind.live) {
        if (has) liveCount += 1;
        else missingLive += 1;
      }
      if (has) {
        weightSum += w;
        weighted += stress * w;
        if (blockAcc[ind.block]) {
          blockAcc[ind.block].weight += w;
          blockAcc[ind.block].weighted += stress * w;
        }
      }
      rows.push({
        id: ind.id,
        block: ind.block,
        title: ind.title,
        weightPct: ind.weightPct,
        live: !!ind.live,
        source: sources[ind.id] || (has ? src.source || null : null),
        value: has ? Number(raw) : null,
        unit: ind.unit || "",
        stressScore: has ? round(stress, 1) : null,
        /* filled after weightSum known — share of renormalized score */
        contribution: null,
        _w: has ? w : 0,
        _stress: has ? stress : null,
        feed: ind.feed || (ind.live ? "iss" : "none"),
        status: has ? "ok" : ind.live ? "pending" : "unavailable",
        higherWorse: ind.higherWorse,
        thresholds: { calm: ind.calm, alert: ind.alert, stress: ind.stress },
      });
    });

    const coveredWeight = round(weightSum * 100, 1);
    const reliable = coveredWeight >= MIN_COVERED_WEIGHT;
    const scoreR =
      reliable && weightSum > 0 ? round(clamp(weighted / weightSum, 0, 100), 1) : null;
    if (weightSum > 0) {
      rows.forEach(function (r) {
        if (r._stress == null) return;
        r.contribution = round((r._stress * r._w) / weightSum, 2);
        delete r._w;
        delete r._stress;
      });
    } else {
      rows.forEach(function (r) {
        delete r._w;
        delete r._stress;
      });
    }
    const blockScores = {};
    BLOCKS.forEach((b) => {
      const acc = blockAcc[b.id];
      blockScores[b.id] =
        acc.weight > 0 ? round(clamp(acc.weighted / acc.weight, 0, 100), 1) : null;
    });
    const zone = scoreR == null ? null : zoneFromScore(scoreR);
    const trusted = !!src.historyTrusted;
    const outlook =
      scoreR == null
        ? null
        : buildOutlook(scoreR, blockScores, rows, {
            scorePrev7d: trusted ? src.scorePrev7d : null,
            scorePrev30d: trusted ? src.scorePrev30d : null,
            historyTrusted: trusted,
          });

    return {
      asOf: asOf,
      score: scoreR,
      zone: zone,
      blockScores: blockScores,
      rows: rows,
      outlook: outlook,
      coveredWeight: coveredWeight,
      reliable: reliable,
      liveCount: liveCount,
      missingLive: missingLive,
      minCoveredWeight: MIN_COVERED_WEIGHT,
      source: src.source || "live",
      sources: sources,
      errors: src.errors || [],
      qualityNote: reliable
        ? "Счёт по живым рядам Мосбиржи/ЦБ; отсутствующие макро не подставляются из демо."
        : "Мало подтверждённых рядов — индекс не публикуем.",
    };
  }

  function computeFromSample() {
    return compute({
      _sample: true,
      asOf: todayKey(),
      source: "sample",
      historyTrusted: false,
      values: SAMPLE_READINGS.values,
      sources: Object.keys(SAMPLE_READINGS.values).reduce((acc, k) => {
        acc[k] = "sample";
        return acc;
      }, {}),
    });
  }

  function parseIssTable(block) {
    if (!block || !Array.isArray(block.columns) || !Array.isArray(block.data)) return [];
    return block.data.map((row) => {
      const o = {};
      block.columns.forEach((c, i) => {
        o[c] = row[i];
      });
      return o;
    });
  }

  function extractIssJson(text) {
    const s = String(text || "").trim();
    if (!s) throw new Error("пустой ответ");
    try {
      return JSON.parse(s);
    } catch (_) {}
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1));
    throw new Error("ответ не JSON");
  }

  async function fetchText(fetchFn, url, ms, headers) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer =
      ctrl && ms
        ? setTimeout(function () {
            try {
              ctrl.abort();
            } catch (_) {}
          }, ms)
        : null;
    try {
      const res = await fetchFn(
        url,
        Object.assign(
          { signal: ctrl ? ctrl.signal : undefined },
          headers ? { headers: headers } : {}
        )
      );
      const body = await res.text();
      return { ok: res.ok, status: res.status, body: body };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function fetchIssJsonFallback(pathAndQuery, options) {
    const opts = options || {};
    const fetchFn = opts.fetchImpl || fetch;
    const base = String(opts.issBase || ISS_DEFAULT).replace(/\/$/, "");
    const url = pathAndQuery.indexOf("http") === 0 ? pathAndQuery : base + pathAndQuery;
    const readerBase = String(opts.issReader != null ? opts.issReader : DEFAULT_ISS_READER).replace(
      /\/?$/,
      "/"
    );
    const reader = opts.issReader === false ? null : readerBase + url;
    try {
      const res = await fetchText(fetchFn, url, opts.timeoutMs || 4000);
      if (!res.ok) throw new Error("ISS HTTP " + res.status);
      return extractIssJson(res.body);
    } catch (_) {
      if (!reader) throw new Error("ISS недоступен");
      const res = await fetchText(fetchFn, reader, opts.readerTimeoutMs || 25000, {
        "X-Return-Format": "text",
      });
      if (!res.body) throw new Error("reader пуст");
      return extractIssJson(res.body);
    }
  }

  function fromDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - (days || 60));
    return todayKey(d);
  }

  function closesFromHistory(json, field) {
    const rows = parseIssTable(json && json.history);
    const key = field || "CLOSE";
    return rows
      .map((r) => ({
        date: r.TRADEDATE,
        value: r[key] != null ? Number(r[key]) : null,
      }))
      .filter((x) => x.date && Number.isFinite(x.value));
  }

  function pctChange(series, lookback) {
    if (!series || series.length < lookback + 1) return null;
    const last = series[series.length - 1].value;
    const prev = series[series.length - 1 - lookback].value;
    if (!prev) return null;
    return ((last - prev) / prev) * 100;
  }

  function drawdownFromPeak(series, lookback) {
    if (!series || !series.length) return null;
    const slice = series.slice(Math.max(0, series.length - (lookback + 1)));
    if (!slice.length) return null;
    let peak = slice[0].value;
    for (let i = 0; i < slice.length; i++) peak = Math.max(peak, slice[i].value);
    const last = slice[slice.length - 1].value;
    if (!peak) return null;
    return ((peak - last) / peak) * 100;
  }

  function median(nums) {
    const a = (nums || []).filter((n) => Number.isFinite(n)).slice().sort((x, y) => x - y);
    if (!a.length) return null;
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }

  function mapChangeToStress0_100(pctChangeAbs) {
    /* Map |%| move into 0–100 stress for CNY proxy. */
    if (pctChangeAbs == null || !Number.isFinite(pctChangeAbs)) return null;
    const v = Math.abs(pctChangeAbs);
    if (v <= 2) return round((v / 2) * 25, 1);
    if (v <= 6) return round(25 + ((v - 2) / 4) * 25, 1);
    if (v <= 14) return round(50 + ((v - 6) / 8) * 30, 1);
    return 100;
  }

  function parseKeyRateFromText(text) {
    const pairs = String(text || "").match(/(\d{2}\.\d{2}\.\d{4})\D{0,40}(\d{1,2},\d{2})/g) || [];
    let best = null;
    pairs.forEach((chunk) => {
      const m = /(\d{2})\.(\d{2})\.(\d{4})\D{0,40}(\d{1,2}),(\d{2})/.exec(chunk);
      if (!m) return;
      const iso = m[3] + "-" + m[2] + "-" + m[1];
      const rate = Number(m[4] + "." + m[5]);
      if (rate < 5 || rate > 25) return;
      if (!best || iso > best.iso) best = { iso: iso, rate: rate };
    });
    return best;
  }

  function parseInflationYoYFromText(text) {
    /* Rows like: 08.2026	14,00	6,33	4,00 */
    const rows = [];
    const re = /(\d{2})\.(\d{4})\t(\d{1,2},\d{2})\t(\d{1,2},\d{2})/g;
    let m;
    while ((m = re.exec(String(text || "")))) {
      const month = m[1];
      const year = m[2];
      const cpi = Number(String(m[4]).replace(",", "."));
      if (!Number.isFinite(cpi) || cpi < 0 || cpi > 30) continue;
      const iso = year + "-" + month + "-01";
      rows.push({ iso: iso, cpi: cpi });
    }
    if (!rows.length) return null;
    rows.sort(function (a, b) {
      return a.iso < b.iso ? 1 : -1;
    });
    return rows[0];
  }

  function parseReservesFromText(text) {
    const pairs = String(text || "").match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{3},\d)/g) || [];
    let best = null;
    pairs.forEach(function (chunk) {
      const m = /(\d{2})\.(\d{2})\.(\d{4})\s+(\d{3}),(\d)/.exec(chunk);
      if (!m) return;
      const iso = m[3] + "-" + m[2] + "-" + m[1];
      const bn = Number(m[4] + "." + m[5]);
      if (bn < 200 || bn > 1200) return;
      if (!best || iso > best.iso) best = { iso: iso, bn: bn };
    });
    return best;
  }

  async function fetchCbrText(page, options) {
    const opts = options || {};
    const fetchFn = opts.fetchImpl || fetch;
    const readerBase = String(opts.issReader != null ? opts.issReader : DEFAULT_ISS_READER).replace(
      /\/?$/,
      "/"
    );
    const url = opts.issReader === false ? page : readerBase + page;
    const res = await fetchText(fetchFn, url, opts.readerTimeoutMs || 25000, {
      "X-Return-Format": "text",
    });
    return res.body || "";
  }

  async function fetchKeyRate(options) {
    const body = await fetchCbrText("https://www.cbr.ru/hd_base/KeyRate/", options);
    const parsed = parseKeyRateFromText(body);
    if (!parsed) throw new Error("не разобрали ключевую ставку ЦБ");
    return parsed;
  }

  async function fetchCpiYoY(options) {
    const body = await fetchCbrText("https://www.cbr.ru/hd_base/infl/", options);
    const parsed = parseInflationYoYFromText(body);
    if (!parsed) throw new Error("не разобрали ИПЦ ЦБ");
    return parsed;
  }

  async function fetchReservesBn(options) {
    const body = await fetchCbrText("https://www.cbr.ru/hd_base/mrrf/mrrf_7d/", options);
    const parsed = parseReservesFromText(body);
    if (!parsed) throw new Error("не разобрали ЗВР ЦБ");
    return parsed;
  }

  async function loadMacroFile(url) {
    const href = url || MACRO_URL;
    try {
      if (typeof fetch === "function") {
        const res = await fetch(href, { credentials: "same-origin", cache: "no-store" });
        if (res.ok) return await res.json();
      }
    } catch (_) {}
    try {
      if (typeof module === "object" && module.exports) {
        const fs = require("fs");
        const path = require("path");
        const file = path.isAbsolute(href)
          ? href
          : path.join(__dirname, "..", "..", href.replace(/^\//, ""));
        return JSON.parse(fs.readFileSync(file, "utf8"));
      }
    } catch (_) {}
    return null;
  }

  function mergeMacroValues(macroJson, day, values, sources, errors) {
    if (!macroJson || !macroJson.values) return;
    const entries = macroJson.values;
    Object.keys(entries).forEach(function (id) {
      if (values[id] != null) return;
      const row = entries[id];
      if (!row || row.value == null || !Number.isFinite(Number(row.value))) return;
      const asOf = row.asOf || macroJson.asOf || null;
      if (asOf) {
        const age = daysBetween(asOf, day);
        if (age == null || age < 0 || age > MACRO_MAX_AGE_DAYS) {
          errors.push(id + ": макрофайл устарел (" + asOf + ")");
          return;
        }
      }
      values[id] = Number(row.value);
      sources[id] =
        (row.source || "макрофайл") + (asOf ? " · на " + asOf : "");
    });
  }

  function valueOnOrBefore(series, day) {
    if (!series || !series.length) return null;
    for (let i = series.length - 1; i >= 0; i--) {
      if (series[i].date <= day) return series[i].value;
    }
    return null;
  }

  function seriesUpTo(series, day) {
    return (series || []).filter(function (x) {
      return x.date <= day;
    });
  }

  /**
   * Build prior daily scores from MOEX history (trading days before `day`).
   * Slow/CBR values held constant — variation comes from market path.
   */
  function buildMarketHistoryScores(seriesBag, baseValues, day, count) {
    const imoex = seriesBag.imoex || [];
    const dates = [];
    for (let i = imoex.length - 1; i >= 0 && dates.length < count; i--) {
      if (imoex[i].date < day) dates.push(imoex[i].date);
    }
    dates.reverse();
    const out = [];
    dates.forEach(function (d) {
      const values = Object.assign({}, baseValues);
      const imoexTo = seriesUpTo(seriesBag.imoex, d);
      const rviTo = seriesUpTo(seriesBag.rvi, d);
      const usdTo = seriesUpTo(seriesBag.usd, d);
      const y1To = seriesUpTo(seriesBag.y1, d);
      const y10To = seriesUpTo(seriesBag.y10, d);
      const cnyTo = seriesUpTo(seriesBag.cny, d);
      const rusfarTo = seriesUpTo(seriesBag.rusfar, d);

      const dd = drawdownFromPeak(imoexTo, 20);
      if (dd != null) values.imoex_dd20 = round(dd, 2);
      if (rviTo.length) values.rtsvix = round(rviTo[rviTo.length - 1].value, 2);
      const usdCh = pctChange(usdTo, 20);
      if (usdCh != null) values.usdrub_20d = round(usdCh, 2);
      if (y1To.length && y10To.length) {
        values.ofz_curve = round(
          y10To[y10To.length - 1].value - y1To[y1To.length - 1].value,
          2
        );
      }
      if (y10To.length >= 20) {
        const med = median(y10To.map(function (x) {
          return x.value;
        }));
        if (med != null) {
          values.ofz_10y = round(y10To[y10To.length - 1].value - med, 2);
        }
      }
      const cnyCh = pctChange(cnyTo, 20);
      const cnyStress = mapChangeToStress0_100(cnyCh);
      if (cnyStress != null) values.cny_fx_stress = cnyStress;
      if (rusfarTo.length && values.key_rate != null) {
        values.ruonia_basis = round(
          (rusfarTo[rusfarTo.length - 1].value - values.key_rate) * 100,
          1
        );
      }

      const snap = compute({
        asOf: d,
        source: "live",
        values: values,
        historyTrusted: false,
      });
      if (snap.reliable && snap.score != null) {
        out.push({ day: d, score: snap.score, live: true, fromMarket: true });
      }
    });
    return out;
  }

  async function fetchBrentLast(fetchIss, options) {
    const json = await fetchIss(
      "/engines/futures/markets/forts/securities.json?iss.meta=off&iss.only=securities,marketdata",
      options
    );
    const secs = parseIssTable(json.securities);
    const mds = parseIssTable(json.marketdata);
    const byId = {};
    mds.forEach((m) => {
      byId[m.SECID] = m;
    });
    const candidates = secs
      .filter((s) => /^BR[FGHJKMNQUVXZ]\d$/.test(String(s.SECID || "")))
      .map((s) => {
        const md = byId[s.SECID] || {};
        const last = md.LAST != null ? Number(md.LAST) : null;
        return {
          secid: s.SECID,
          last: last,
          ltd: s.LASTTRADEDATE || "",
        };
      })
      .filter((x) => Number.isFinite(x.last) && x.last > 20 && x.last < 250)
      .sort((a, b) => String(a.ltd).localeCompare(String(b.ltd)));
    return candidates.length ? candidates[0] : null;
  }

  /**
   * Pull public series + macro file. Returns values, sources, MOEX series for history.
   */
  async function fetchLiveReadings(options) {
    const opts = options || {};
    const day = opts.day || todayKey();
    const fetchIss =
      typeof opts.fetchIssJson === "function"
        ? opts.fetchIssJson
        : function (path, o) {
            const Pipe = globalRoot && globalRoot.TrinityInvestPipeline;
            if (Pipe && typeof Pipe.fetchIssJson === "function") {
              return Pipe.fetchIssJson(path, Object.assign({}, opts, o || {}));
            }
            return fetchIssJsonFallback(path, Object.assign({}, opts, o || {}));
          };

    const values = {};
    const sources = {};
    const errors = [];
    const from = fromDaysAgo(80);
    const seriesBag = {
      imoex: [],
      rvi: [],
      usd: [],
      y1: [],
      y10: [],
      cny: [],
      rusfar: [],
    };

    async function pull(id, label, fn) {
      try {
        const v = await fn();
        if (v == null || (typeof v === "object" && v.value == null)) {
          throw new Error("пусто");
        }
        if (typeof v === "object") {
          values[id] = v.value;
          sources[id] = v.source || label;
        } else {
          values[id] = v;
          sources[id] = label;
        }
      } catch (err) {
        errors.push(id + ": " + (err && err.message ? err.message : String(err)));
      }
    }

    await Promise.all([
      pull("imoex_dd20", "MOEX ISS · IMOEX", async function () {
        const json = await fetchIss(
          "/history/engines/stock/markets/index/securities/IMOEX.json?from=" +
            from +
            "&iss.meta=off",
          opts
        );
        seriesBag.imoex = closesFromHistory(json, "CLOSE");
        const dd = drawdownFromPeak(seriesBag.imoex, 20);
        if (dd == null) throw new Error("мало истории IMOEX");
        return { value: round(dd, 2), source: "MOEX ISS · IMOEX" };
      }),
      pull("rtsvix", "MOEX ISS · RVI", async function () {
        const json = await fetchIss(
          "/history/engines/stock/markets/index/securities/RVI.json?from=" +
            from +
            "&iss.meta=off",
          opts
        );
        seriesBag.rvi = closesFromHistory(json, "CLOSE");
        if (!seriesBag.rvi.length) throw new Error("нет RVI");
        return {
          value: round(seriesBag.rvi[seriesBag.rvi.length - 1].value, 2),
          source: "MOEX ISS · RVI",
        };
      }),
      pull("ofz_curve", "MOEX ISS · RUGBITR", async function () {
        const y1j = await fetchIss(
          "/history/engines/stock/markets/index/securities/RUGBITR1Y.json?from=" +
            from +
            "&iss.meta=off",
          opts
        );
        const y10j = await fetchIss(
          "/history/engines/stock/markets/index/securities/RUGBITR10Y.json?from=" +
            from +
            "&iss.meta=off",
          opts
        );
        const y1 = closesFromHistory(y1j, "YIELD");
        const y10 = closesFromHistory(y10j, "YIELD");
        if (y1.length > seriesBag.y1.length) seriesBag.y1 = y1;
        if (y10.length > seriesBag.y10.length) seriesBag.y10 = y10;
        if (!seriesBag.y1.length || !seriesBag.y10.length) {
          throw new Error("нет доходностей ОФЗ");
        }
        const spread =
          seriesBag.y10[seriesBag.y10.length - 1].value -
          seriesBag.y1[seriesBag.y1.length - 1].value;
        return { value: round(spread, 2), source: "MOEX ISS · RUGBITR1Y/10Y" };
      }),
      pull("ofz_10y", "MOEX ISS · RUGBITR10Y", async function () {
        const json = await fetchIss(
          "/history/engines/stock/markets/index/securities/RUGBITR10Y.json?from=" +
            fromDaysAgo(400) +
            "&iss.meta=off",
          opts
        );
        const series = closesFromHistory(json, "YIELD");
        if (series.length > seriesBag.y10.length) seriesBag.y10 = series;
        if (seriesBag.y10.length < 20) throw new Error("мало истории 10Y");
        const use = seriesBag.y10;
        const last = use[use.length - 1].value;
        const med = median(
          use.map(function (x) {
            return x.value;
          })
        );
        if (med == null) throw new Error("нет медианы");
        return { value: round(last - med, 2), source: "MOEX ISS · RUGBITR10Y vs median" };
      }),
      pull("usdrub_20d", "MOEX ISS · USD000UTSTOM", async function () {
        const json = await fetchIss(
          "/history/engines/currency/markets/selt/boards/CETS/securities/USD000UTSTOM.json?from=" +
            from +
            "&iss.meta=off",
          opts
        );
        seriesBag.usd = closesFromHistory(json, "CLOSE");
        const ch = pctChange(seriesBag.usd, 20);
        if (ch == null) throw new Error("мало истории USD/RUB");
        return { value: round(ch, 2), source: "MOEX ISS · USD000UTSTOM" };
      }),
      pull("key_rate", "ЦБ РФ · KeyRate", async function () {
        const kr = await fetchKeyRate(opts);
        return { value: round(kr.rate, 2), source: "ЦБ РФ · KeyRate (" + kr.iso + ")" };
      }),
      pull("cpi_yoy", "ЦБ РФ · ИПЦ", async function () {
        const cpi = await fetchCpiYoY(opts);
        return {
          value: round(cpi.cpi, 2),
          source: "ЦБ РФ · инфляция г/г (" + cpi.iso.slice(0, 7) + ")",
        };
      }),
      pull("reserves", "ЦБ РФ · ЗВР", async function () {
        const r = await fetchReservesBn(opts);
        return {
          value: round(r.bn, 1),
          source: "ЦБ РФ · ЗВР (" + r.iso + ")",
        };
      }),
      pull("brent", "MOEX FORTS · BR", async function () {
        const br = await fetchBrentLast(fetchIss, opts);
        if (!br) throw new Error("нет фьючерса BR");
        return { value: round(br.last, 2), source: "MOEX FORTS · " + br.secid };
      }),
      pull("cny_fx_stress", "MOEX ISS · CNYRUB_TOM", async function () {
        const json = await fetchIss(
          "/history/engines/currency/markets/selt/boards/CETS/securities/CNYRUB_TOM.json?from=" +
            from +
            "&iss.meta=off",
          opts
        );
        seriesBag.cny = closesFromHistory(json, "CLOSE");
        const ch = pctChange(seriesBag.cny, 20);
        const stress = mapChangeToStress0_100(ch);
        if (stress == null) throw new Error("мало истории CNY/RUB");
        return { value: stress, source: "MOEX ISS · CNYRUB 20d → stress" };
      }),
    ]);

    await pull("ruonia_basis", "MOEX ISS · RUSFAR", async function () {
      if (values.key_rate == null) throw new Error("нет ставки для базиса");
      const json = await fetchIss(
        "/history/engines/stock/markets/index/securities/RUSFAR.json?from=" +
          from +
          "&iss.meta=off",
        opts
      );
      seriesBag.rusfar = closesFromHistory(json, "CLOSE");
      if (!seriesBag.rusfar.length) throw new Error("нет RUSFAR");
      const basisBp =
        (seriesBag.rusfar[seriesBag.rusfar.length - 1].value - values.key_rate) * 100;
      return { value: round(basisBp, 1), source: "MOEX ISS · RUSFAR − ЦБ" };
    });

    const macro = await loadMacroFile(opts.macroUrl || MACRO_URL);
    if (!macro) {
      errors.push("macro: не загрузился " + (opts.macroUrl || MACRO_URL));
    } else {
      mergeMacroValues(macro, day, values, sources, errors);
    }

    const priorScores = buildMarketHistoryScores(
      seriesBag,
      values,
      day,
      OUTLOOK_MIN_POINTS
    );

    return {
      asOf: day,
      source: "live",
      values: values,
      sources: sources,
      errors: errors,
      liveFetched: Object.keys(values).length,
      priorScores: priorScores,
      seriesBag: seriesBag,
    };
  }

  /**
   * Daily snapshot. asOf = сегодня.
   * Outlook history: MOEX trading days (today−N) merged into browser cache.
   */
  async function loadSnapshot(url, options) {
    const opts = options || {};
    const day = opts.day || todayKey();
    const force = !!opts.force;
    const cached = readDailyCache();

    if (
      !force &&
      cached &&
      cached.day === day &&
      cached.snapshot &&
      cached.snapshot.reliable &&
      cached.snapshot.source === "live" &&
      cached.snapshot.outlook &&
      cached.snapshot.outlook.direction !== "insufficient"
    ) {
      return cached.snapshot;
    }

    const live = await fetchLiveReadings(Object.assign({}, opts, { day: day }));
    let history = (cached && Array.isArray(cached.history) ? cached.history : []).slice();

    (live.priorScores || []).forEach(function (h) {
      if (!h || !h.day || h.score == null) return;
      history = history.filter(function (x) {
        return !x || x.day !== h.day;
      });
      history.push(h);
    });

    const trusted = historyTrusted(history, day);
    const prev7 = trusted ? scoreNear(history, day, 7) : null;
    const prev30 = trusted ? scoreNear(history, day, 30) : null;

    const snap = compute({
      asOf: day,
      source: "live",
      values: live.values,
      sources: live.sources,
      errors: live.errors,
      historyTrusted: trusted,
      scorePrev7d: prev7,
      scorePrev30d: prev30,
    });

    const nextHist = history.filter(function (h) {
      return h && h.day !== day;
    });
    if (snap.reliable && snap.score != null) {
      nextHist.push({ day: day, score: snap.score, live: true });
    }
    writeDailyCache(day, snap, nextHist);
    return snap;
  }

  return {
    ZONES,
    BLOCKS,
    INDICATORS,
    SAMPLE_READINGS,
    CACHE_KEY,
    MIN_COVERED_WEIGHT,
    OUTLOOK_MIN_POINTS,
    normalizeValue,
    zoneFromScore,
    toMacroGate,
    buildOutlook,
    compute,
    computeFromSample,
    loadSnapshot,
    fetchLiveReadings,
    todayKey,
    formatAsOf,
    scoreNear,
    historyTrusted,
    parseKeyRateFromText,
    parseInflationYoYFromText,
    parseReservesFromText,
    buildMarketHistoryScores,
    mergeMacroValues,
    indicatorById,
    outlookLabel,
    sectorSoft,
    drawdownFromPeak,
    pctChange,
    median,
  };
});
