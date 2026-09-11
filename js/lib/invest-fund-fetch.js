/**
 * Pull Excel-like fundamentals: official e-disclosure file links +
 * Smart-Lab (and best-effort Conomy) structured MSFO tables.
 *
 * Browser: Smart-Lab has no CORS → fallback reader (r.jina.ai) unless
 * CABINET_CONFIG.fundProxy / fundReader overridden.
 * e-disclosure PDFs are not parsed; FileLoad.ashx links are collected.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TrinityInvestFundFetch = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ISS_SECURITIES = "https://iss.moex.com/iss/securities.json";
  const SMARTLAB_MSFO = "https://smart-lab.ru/q/{TICKER}/f/y/MSFO/";
  const DEFAULT_READER = "https://r.jina.ai/";
  const CONOMY_CANDIDATES = [
    "https://conomy.ru/emitent/{TICKER}",
    "https://www.conomy.ru/emitent/{TICKER}",
    "https://conomy.ru/ticker/{TICKER}",
  ];

  const ROW_ALIASES = {
    revenue: [/^выручка/i],
    debt: [/^долг(?:\s|,|$)/i],
    equity: [/^чист(ые|ый)\s+актив/i, /^собственн.*капитал/i, /^акционерн.*капитал/i, /^капитал(?:\s|,|$)/i],
    op_profit: [/^операционн.*прибыл/i],
    fcf: [/^fcf(?:\s|,|$)/i, /^свободн.*денежн/i],
    ebitda: [/^ebitda/i],
    st_liab: [/^краткосрочн.*обязател/i],
    reserves: [/^создание резервов/i, /^резервы под обесцен/i],
    loans: [/^кредитн.*портфель/i],
    deposits: [/^депозиты(?:\s|,|$)/i],
    car: [/^дост\.?\s*осн/i, /достаточн.*осн/i, /core.?capital/i],
    noi: [/^чист\S*\s*операц/i],
  };

  function normName(s) {
    return String(s || "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseNum(raw) {
    if (raw == null || raw === "") return null;
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    let s = String(raw).trim();
    if (!s || s === "?" || s === "—" || s === "–" || s === "-" || s === "н/д") return null;
    const pct = /%\s*$/.test(s);
    s = s.replace(/\s/g, "").replace("%", "").replace(",", ".");
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return pct && Math.abs(n) > 1 ? n / 100 : n;
  }

  function matchRowKey(name) {
    const n = normName(name).toLowerCase();
    if (!n) return null;
    if (/капитализация|капит\.\s*$/.test(n)) return null;
    if (/^чистый долг/.test(n)) return null;
    if (/^депозиты (юр|физ)/.test(n)) return null;
    if (/^fcf\s*\/|fcf\/акц/.test(n)) return null;
    if (/долг\s*\/\s*ebitda/.test(n)) return null;
    const keys = Object.keys(ROW_ALIASES);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const al = ROW_ALIASES[k];
      for (let j = 0; j < al.length; j++) {
        if (al[j].test(n)) return k;
      }
    }
    return null;
  }

  function extractYears(text) {
    const line = String(text || "");
    const hdr = line.match(/20[12]\d[\s\S]{0,80}LTM/i) || line.match(/(?:\*\*)?20[12]\d(?:\*\*)?/g);
    const years = [];
    const src = hdr ? (typeof hdr === "object" && hdr[0] && hdr.input ? hdr[0] : hdr.join ? hdr.join(" ") : String(hdr)) : line.slice(0, 2500);
    const re = /\b(20[12]\d)\b/g;
    let m;
    const blob = Array.isArray(hdr) ? hdr.join(" ") : src;
    while ((m = re.exec(blob))) {
      const y = Number(m[1]);
      if (years.indexOf(y) === -1) years.push(y);
    }
    return years.filter((y) => y >= 2005 && y <= 2100).slice(0, 12);
  }

  function parseNumberSequence(s) {
    const str = String(s || "").replace(/&minus;|−/g, "-");
    if (str.indexOf("%") >= 0) {
      return str
        .split("%")
        .map((p) => p.replace(/[^0-9.,\-]/g, " ").trim())
        .filter(Boolean)
        .map(parseNum)
        .filter((n) => n != null);
    }
    const re = /-?\d{1,3}(?:\s\d{3})+(?:[.,]\d+)?|-?\d+[.,]\d+|-?\d+/g;
    const out = [];
    let m;
    while ((m = re.exec(str))) {
      const n = parseNum(m[0]);
      if (n != null) out.push(n);
    }
    return out;
  }

  function stripTags(html) {
    return String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "");
  }

  function parseSmartLabHtml(html) {
    const raw = String(html || "");
    const tableMatch = raw.match(/<table[^>]*financials[\s\S]*?<\/table>/i) || raw.match(/<table[\s\S]*?<\/table>/i);
    const table = tableMatch ? tableMatch[0] : raw;
    const rows = [];
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr;
    while ((tr = trRe.exec(table))) {
      const cells = [];
      const cRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let c;
      while ((c = cRe.exec(tr[1]))) {
        cells.push(normName(c[1]));
      }
      if (cells.some(Boolean)) rows.push(cells);
    }
    let years = [];
    let yearIdx = [];
    rows.forEach((cells) => {
      const idx = [];
      cells.forEach((x, i) => {
        const n = Number(x);
        if (n >= 2005 && n <= 2100) idx.push(i);
      });
      if (idx.length >= 2 && idx.length > yearIdx.length) {
        yearIdx = idx;
        years = idx.map((i) => Number(cells[i]));
      }
    });
    const series = {};
    rows.forEach((cells) => {
      const key = matchRowKey(cells[0] || cells[1] || "");
      if (!key) return;
      const vals = yearIdx.length
        ? yearIdx.map((i) => parseNum(cells[i]))
        : cells.slice(1).map(parseNum);
      series[key + "_cells"] = vals;
    });
    return packSeries(years, series, html);
  }

  function parseSmartLabMarkdown(md) {
    const years = extractYears(md);
    const series = {};
    String(md || "")
      .split(/\n/)
      .forEach((line) => {
        const plain = normName(line);
        const key = matchRowKey(plain);
        if (!key) return;
        const after = plain.replace(/^.*?((?:-?\d|\d{1,3}\s\d{3}|-?\d+[.,]\d+|-?\d+%).*)/, "$1");
        const nums = parseNumberSequence(after.indexOf("%") >= 0 || /\d/.test(after) ? after : plain);
        series[key + "_cells"] = nums;
      });
    return packSeries(years, series, md);
  }

  function packSeries(years, series, raw) {
    const keys = Object.keys(ROW_ALIASES);
    const aligned = {};
    keys.forEach((k) => {
      let cells = series[k + "_cells"];
      if (!cells) return;
      cells = cells.slice();
      if (years.length && cells.length === years.length + 1) {
        cells = cells.slice(0, years.length); /* drop LTM */
      }
      if (years.length && cells.length > years.length) {
        cells = cells.slice(0, years.length);
      }
      aligned[k] = {};
      if (years.length && cells.length === years.length) {
        years.forEach((y, i) => {
          aligned[k][y] = cells[i];
        });
      } else {
        /* no year header: last two numeric values */
        const filled = cells.filter((n) => n != null);
        aligned[k]._list = filled;
      }
    });
    return { years: years, series: aligned, rawSnippet: String(raw || "").slice(0, 80) };
  }

  function yearPair(parsed) {
    const years = (parsed && parsed.years) || [];
    const series = (parsed && parsed.series) || {};
    const primary = series.revenue || series.noi || series.loans || series.ebitda || series.deposits;
    if (primary && !primary._list) {
      const ys = years.filter((y) => primary[y] != null);
      if (ys.length >= 1) {
        const currYear = ys[ys.length - 1];
        const prevYear = ys.length >= 2 ? ys[ys.length - 2] : null;
        return { currYear: currYear, prevYear: prevYear };
      }
    }
    if (years.length >= 2) {
      return { currYear: years[years.length - 1], prevYear: years[years.length - 2] };
    }
    return { currYear: "curr", prevYear: "prev" };
  }

  function toFields(parsed) {
    const pair = yearPair(parsed);
    const series = parsed.series || {};
    const isFin = Boolean(series.loans || series.deposits || series.car || series.noi);
    const fieldMap = isFin
      ? {
          reserves_curr: "reserves",
          reserves_prev: "reserves",
          loans_curr: "loans",
          loans_prev: "loans",
          deposits_curr: "deposits",
          deposits_prev: "deposits",
          car_curr: "car",
          car_prev: "car",
          noi_curr: "noi",
          noi_prev: "noi",
        }
      : {
          revenue_curr: "revenue",
          revenue_prev: "revenue",
          debt_curr: "debt",
          debt_prev: "debt",
          equity_curr: "equity",
          equity_prev: "equity",
          op_profit_curr: "op_profit",
          op_profit_prev: "op_profit",
          fcf_curr: "fcf",
          fcf_prev: "fcf",
          ebitda_curr: "ebitda",
          ebitda_prev: "ebitda",
          st_liab_curr: "st_liab",
        };
    const fields = {};
    const gaps = [];
    Object.keys(fieldMap).forEach((outKey) => {
      const src = fieldMap[outKey];
      const row = series[src];
      if (!row) {
        gaps.push(outKey);
        return;
      }
      const isPrev = /_prev$/.test(outKey);
      let v = null;
      if (row._list) {
        const filled = row._list;
        v = isPrev
          ? filled.length >= 2
            ? filled[filled.length - 2]
            : null
          : filled[filled.length - 1];
      } else {
        const y = isPrev ? pair.prevYear : pair.currYear;
        v = y != null ? row[y] : null;
      }
      if (src === "car" && v != null && Math.abs(v) > 1) v = v / 100;
      if (v == null) gaps.push(outKey);
      else fields[outKey] = v;
    });
    return {
      sector: isFin ? "fin" : "nonfin",
      fields: fields,
      gaps: gaps,
      years: pair,
    };
  }

  function parseSmartLab(text) {
    if (!text) return { years: [], series: {} };
    if (/<table/i.test(text) || /<tr/i.test(text)) return parseSmartLabHtml(text);
    return parseSmartLabMarkdown(text);
  }

  function extractEdisclosureFiles(text) {
    const urls = [];
    const re = /https?:\/\/(?:www\.)?e-disclosure\.ru\/[^"'<\s)]+/gi;
    let m;
    while ((m = re.exec(String(text || "")))) {
      const u = m[0].replace(/[.,;]+$/, "");
      if (urls.indexOf(u) === -1) urls.push(u);
    }
    return urls;
  }

  function edisclosureSearchUrl(inn, name) {
    const q = encodeURIComponent(inn || name || "");
    return "https://e-disclosure.ru/portal/search.aspx?query=" + q;
  }

  function edisclosureCompanySearchUrl(inn) {
    return "https://e-disclosure.ru/poisk-po-kompaniyam?query=" + encodeURIComponent(inn || "");
  }

  async function fetchAbort(url, options, extraHeaders) {
    const fetchFn = (options && options.fetchImpl) || fetch;
    const ms = (options && options.timeoutMs) || 12000;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const headers = Object.assign(
        { Accept: "text/html,text/plain,*/*" },
        extraHeaders || {}
      );
      const res = await fetchFn(url, { signal: ctrl.signal, headers: headers });
      const body = await res.text();
      return { ok: res.ok, status: res.status, body: body, url: url };
    } finally {
      clearTimeout(t);
    }
  }

  function readerUrl(pageUrl, options) {
    const cfg = (options && options.config) || {};
    if (cfg.fundReader === false || cfg.fundReader === "") return null;
    const base = String(cfg.fundReader || DEFAULT_READER).replace(/\/?$/, "/");
    return base + pageUrl;
  }

  function proxyUrl(pageUrl, options) {
    const cfg = (options && options.config) || {};
    const p = cfg.fundProxy;
    if (!p) return null;
    if (String(p).indexOf("{url}") >= 0) return String(p).replace("{url}", encodeURIComponent(pageUrl));
    return String(p).replace(/\/$/, "") + "/" + pageUrl.replace(/^https?:\/\//, "");
  }

  async function fetchPage(pageUrl, options) {
    const errors = [];
    const direct = await fetchAbort(pageUrl, options).catch((e) => {
      errors.push("direct: " + (e.message || e));
      return null;
    });
    if (direct && direct.ok && direct.body && direct.body.length > 400 && !/exhkqyad|Forbidden/i.test(direct.body.slice(0, 800))) {
      return { text: direct.body, via: "direct", url: pageUrl };
    }
    if (direct && direct.body && direct.body.length > 400 && /financials|Выручка|EBITDA|кредитн/i.test(direct.body)) {
      return { text: direct.body, via: "direct", url: pageUrl };
    }
    const prox = proxyUrl(pageUrl, options);
    if (prox) {
      const r = await fetchAbort(prox, options).catch((e) => {
        errors.push("proxy: " + (e.message || e));
        return null;
      });
      if (r && r.body && r.body.length > 400) return { text: r.body, via: "proxy", url: pageUrl };
    }
    const reader = readerUrl(pageUrl, options);
    if (reader) {
      const r = await fetchAbort(reader, options, { "X-Return-Format": "html" }).catch((e) => {
        errors.push("reader: " + (e.message || e));
        return null;
      });
      if (r && r.body && r.body.length > 400) return { text: r.body, via: "reader", url: pageUrl };
    }
    throw new Error(errors.join("; ") || "Не удалось загрузить " + pageUrl);
  }

  async function fetchEmitentMeta(ticker, options) {
    const secid = String(ticker || "")
      .trim()
      .toUpperCase();
    const issBase = ((options && options.config && options.config.issBase) || ISS_SECURITIES).replace(
      /\/iss\/?.*$/,
      "/iss/securities.json"
    );
    const url =
      (issBase.indexOf("securities.json") >= 0 ? issBase : ISS_SECURITIES) +
      "?iss.meta=off&q=" +
      encodeURIComponent(secid);
    const r = await fetchAbort(url, options);
    if (!r.ok) throw new Error("ISS meta HTTP " + r.status);
    const json = JSON.parse(r.body);
    const cols = (json.securities && json.securities.columns) || [];
    const rows = (json.securities && json.securities.data) || [];
    let hit = null;
    rows.forEach((row) => {
      const o = {};
      cols.forEach((c, i) => {
        o[c] = row[i];
      });
      if (o.secid === secid && !hit) hit = o;
    });
    if (!hit) {
      rows.forEach((row) => {
        const o = {};
        cols.forEach((c, i) => {
          o[c] = row[i];
        });
        if (!hit && o.secid === secid) hit = o;
      });
    }
    return {
      ticker: secid,
      inn: hit && hit.emitent_inn,
      emitent: hit && (hit.emitent_title || hit.name),
      emitentId: hit && hit.emitent_id,
      found: Boolean(hit),
    };
  }

  async function pullFromSmartLab(ticker, options) {
    const url = SMARTLAB_MSFO.replace("{TICKER}", encodeURIComponent(ticker));
    const page = await fetchPage(url, options);
    const parsed = parseSmartLab(page.text);
    const packed = toFields(parsed);
    packed.sourceUrl = url;
    packed.via = page.via;
    packed.edisclosureFiles = extractEdisclosureFiles(page.text);
    packed.parsedYears = parsed.years;
    return packed;
  }

  async function pullFromConomy(ticker, options) {
    const t = String(ticker || "").toLowerCase();
    const errors = [];
    const maxTry = Math.min(CONOMY_CANDIDATES.length, 1);
    for (let i = 0; i < maxTry; i++) {
      const url = CONOMY_CANDIDATES[i].replace("{TICKER}", encodeURIComponent(t));
      try {
        const page = await fetchPage(url, options);
        if (/404|не найден/i.test(page.text.slice(0, 500))) continue;
        if (!/выручка|ebitda|мcфо|мсфо/i.test(page.text)) continue;
        const packed = toFields(parseSmartLab(page.text));
        packed.sourceUrl = url;
        packed.via = page.via;
        packed.edisclosureFiles = extractEdisclosureFiles(page.text);
        return packed;
      } catch (err) {
        errors.push((err && err.message) || String(err));
      }
    }
    return { sector: null, fields: {}, gaps: [], skip: true, note: errors[0] || "Conomy: страница эмитента не найдена" };
  }

  function mergeFields(primary, fill) {
    const out = Object.assign({}, (primary && primary.fields) || {});
    const used = {};
    Object.keys(out).forEach((k) => {
      used[k] = (primary && primary.sourceLabel) || "primary";
    });
    const extra = (fill && fill.fields) || {};
    Object.keys(extra).forEach((k) => {
      if (out[k] == null) {
        out[k] = extra[k];
        used[k] = (fill && fill.sourceLabel) || "fill";
      }
    });
    return { fields: out, fieldSources: used };
  }

  async function pullFundamentals(ticker, options) {
    const secid = String(ticker || "")
      .trim()
      .toUpperCase();
    if (!secid) throw new Error("Укажите тикер");
    const opts = options || {};
    const meta = await fetchEmitentMeta(secid, opts).catch(() => ({
      ticker: secid,
      inn: null,
      found: false,
    }));
    const official = {
      search: edisclosureSearchUrl(meta.inn, meta.emitent || secid),
      catalog: edisclosureCompanySearchUrl(meta.inn || secid),
      inn: meta.inn || null,
      emitent: meta.emitent || null,
    };

    let smart = null;
    let smartErr = null;
    try {
      smart = await pullFromSmartLab(secid, opts);
      smart.sourceLabel = "smart-lab";
    } catch (err) {
      smartErr = err && err.message ? err.message : String(err);
    }

    let conomy = { fields: {}, skip: true };
    const needConomy = !smart || (smart.gaps && smart.gaps.length);
    if (needConomy) {
      try {
        const cOpts = Object.assign({}, opts, { timeoutMs: Math.min(opts.timeoutMs || 8000, 6000) });
        conomy = await pullFromConomy(secid, cOpts);
        conomy.sourceLabel = "conomy";
      } catch (err) {
        conomy = { fields: {}, skip: true, note: err.message };
      }
    }

    const merged = mergeFields(smart, conomy);
    const sector = (smart && smart.sector) || (conomy && conomy.sector) || "nonfin";
    const files = ((smart && smart.edisclosureFiles) || []).concat((conomy && conomy.edisclosureFiles) || []);
    const uniqFiles = [];
    files.forEach((u) => {
      if (uniqFiles.indexOf(u) === -1) uniqFiles.push(u);
    });

    return {
      ticker: secid,
      sector: sector,
      fields: merged.fields,
      fieldSources: merged.fieldSources,
      years: (smart && smart.years) || {},
      meta: meta,
      official: official,
      edisclosureFiles: uniqFiles,
      sources: {
        smartlab: smart
          ? { ok: true, via: smart.via, url: smart.sourceUrl, years: smart.years }
          : { ok: false, error: smartErr },
        conomy: conomy.skip
          ? { ok: false, note: conomy.note || "нет страницы" }
          : { ok: true, via: conomy.via, url: conomy.sourceUrl },
      },
      note:
        "Цифры — агрегатор МСФО (Smart-Lab, при пробелах Conomy). Файлы e-disclosure — официальное раскрытие, PDF в MVP не разбирается. Сверьте единицы (обычно млрд ₽) и годы.",
    };
  }

  return {
    SMARTLAB_MSFO,
    DEFAULT_READER,
    parseNum,
    matchRowKey,
    parseNumberSequence,
    parseSmartLab,
    parseSmartLabHtml,
    parseSmartLabMarkdown,
    toFields,
    extractEdisclosureFiles,
    edisclosureSearchUrl,
    pullFundamentals,
    fetchEmitentMeta,
    fetchPage,
  };
});
