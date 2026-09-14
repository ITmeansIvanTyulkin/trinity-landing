/**
 * Decision Lab pipeline sandbox (pure).
 * Research / decision-support — not broker order placement.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TrinityDecisionLab = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const Z_ENTER = 1.8;
  const Z_WATCH = 1.4;

  function evaluatePipeline(input) {
    const zAbs = Number(input.zAbs);
    const regime = input.regime || "SIDEWAYS";
    const cluster = Boolean(input.cluster);
    const fa = input.fa || "pass";
    const book = input.book || "DAILY";
    const atas = input.atas !== false;
    const sector = input.sector || "SECTOR";

    const steps = [];

    let techOk = false;
    let techStatus = "fail";
    let techDetail = "";
    if (zAbs >= Z_ENTER) {
      techOk = true;
      techStatus = "pass";
      techDetail = "|Z| ≥ " + Z_ENTER + " — порог входа";
    } else if (zAbs >= Z_WATCH) {
      techStatus = "watch";
      techDetail = "|Z| в зоне наблюдения (" + Z_WATCH + "–" + Z_ENTER + ")";
    } else {
      techDetail = "|Z| < " + Z_WATCH + " — техника слабая";
    }
    steps.push({
      id: "tech",
      title: "Техника (расхождение)",
      status: techStatus,
      detail: techDetail,
    });

    const regimeOk = regime !== "TREND";
    steps.push({
      id: "regime",
      title: "Режим рынка",
      status: regimeOk ? "pass" : "fail",
      detail:
        regime === "TREND"
          ? "Тренд — новые входы в пары блокируются"
          : regime === "SIDEWAYS"
            ? "Боковик — пары в фокусе"
            : "Нейтральный режим — пары допустимы осторожнее",
    });

    steps.push({
      id: "cluster",
      title: "Сектор",
      status: cluster ? "pass" : "fail",
      detail: cluster
        ? sector + " · сектор проходит отбор"
        : sector + " · сектор не проходит отбор",
    });

    const faOk = fa === "pass";
    const faStatus = fa === "pass" ? "pass" : fa === "weak" ? "watch" : "fail";
    steps.push({
      id: "fa",
      title: "Фундамент",
      status: faStatus,
      detail:
        fa === "pass"
          ? "Фундамент поддерживает / не противоречит"
          : fa === "weak"
            ? "Фундамент слабый — обычно наблюдение, не открытие"
            : "Фундамент против — блок рекомендации",
    });

    let atasOk = true;
    if (book === "INTRADAY") {
      atasOk = atas;
      steps.push({
        id: "atas",
        title: "Объём (внутри дня)",
        status: atas ? "pass" : "fail",
        detail: atas
          ? "Объём в порядке · этот горизонт всё равно только для исследования"
          : "Объём не подтверждает — типичное наблюдение",
      });
    } else {
      steps.push({
        id: "book",
        title: "Горизонт",
        status: "pass",
        detail: "Дневной горизонт · после фундамента позицию можно брать в работу",
      });
    }

    let outcome = "BLOCK";
    let outcomeClass = "lab-out-block";
    let reason = "";

    if (!regimeOk) {
      outcome = "BLOCK";
      reason = "Тренд — новые входы в пары не открываем.";
    } else if (!cluster) {
      outcome = "BLOCK";
      reason = "Сектор не проходит отбор.";
    } else if (fa === "fail") {
      outcome = "BLOCK";
      reason = "Фундамент против — в работу не берём.";
    } else if (book === "INTRADAY" && !atasOk) {
      outcome = "WATCH";
      outcomeClass = "lab-out-watch";
      reason =
        "Техника может быть в порядке, но объём внутри дня не подтверждает. Этот горизонт пока только для исследования.";
    } else if (book === "INTRADAY") {
      outcome = "RESEARCH";
      outcomeClass = "lab-out-research";
      reason =
        "Внутри дня пока только смотрим: цифры считаются, открытия выключены.";
    } else if (techOk && faOk) {
      outcome = "PAPER OPEN";
      outcomeClass = "lab-out-enter";
      reason =
        "Техника, режим, сектор и фундамент сошлись — можно брать в работу. Это не заявка брокеру.";
    } else if (techStatus === "watch" || fa === "weak" || !techOk) {
      outcome = "WATCH";
      outcomeClass = "lab-out-watch";
      if (!techOk && techStatus === "fail") {
        reason = "Техника ниже порога — ждём разворот расхождения.";
      } else if (fa === "weak") {
        reason = "Фундамент слабый — держим в наблюдении, не открываем.";
      } else {
        reason = "На границе порогов — наблюдение, не вход.";
      }
    } else {
      outcome = "BLOCK";
      reason = "Проверки не собрались в одну картину.";
    }

    return {
      steps: steps,
      outcome: outcome,
      outcomeClass: outcomeClass,
      reason: reason,
      flags: {
        techOk: techOk,
        techStatus: techStatus,
        regimeOk: regimeOk,
        cluster: cluster,
        faOk: faOk,
        atasOk: atasOk,
        book: book,
      },
    };
  }

  const SECTOR_RU = {
    BANKS: "Банки",
    OIL_GAS: "Нефть",
    METALS_MINING: "Металлы",
    METALS: "Металлы",
    UTILITIES: "Энергетика",
    RETAIL: "Ритейл",
    TELECOM: "Телеком",
    TRANSPORT: "Транспорт",
    TECH_IT: "IT",
    CHEM_FERT: "Химия",
    REAL_ESTATE: "Недвижимость",
    INDUSTRIALS: "Промышленность",
    SECTOR: "Сектор",
  };

  const SECTOR_BY_TICKER = {
    SBER: "BANKS",
    VTBR: "BANKS",
    TCSG: "BANKS",
    T: "BANKS",
    CBOM: "BANKS",
    BSPB: "BANKS",
    MOEX: "BANKS",
    GAZP: "OIL_GAS",
    LKOH: "OIL_GAS",
    ROSN: "OIL_GAS",
    NVTK: "OIL_GAS",
    SNGS: "OIL_GAS",
    TATN: "OIL_GAS",
    SIBN: "OIL_GAS",
    NLMK: "METALS_MINING",
    MAGN: "METALS_MINING",
    CHMF: "METALS_MINING",
    GMKN: "METALS_MINING",
    ALRS: "METALS_MINING",
    PLZL: "METALS_MINING",
    RUAL: "METALS_MINING",
    MTLR: "METALS_MINING",
    MGNT: "RETAIL",
    FIVE: "RETAIL",
    X5: "RETAIL",
    LENT: "RETAIL",
  };

  const CATALOG_LEGS = [
    ["SBER", "VTBR"],
    ["SBER", "TCSG"],
    ["SBER", "T"],
    ["VTBR", "TCSG"],
    ["CBOM", "SBER"],
    ["GAZP", "LKOH"],
    ["GAZP", "ROSN"],
    ["LKOH", "ROSN"],
    ["LKOH", "NVTK"],
    ["ROSN", "NVTK"],
    ["GAZP", "NVTK"],
    ["TATN", "SNGS"],
    ["MAGN", "NLMK"],
    ["MAGN", "CHMF"],
    ["NLMK", "CHMF"],
    ["GMKN", "PLZL"],
    ["ALRS", "PLZL"],
    ["RUAL", "NLMK"],
    ["GMKN", "NLMK"],
    ["MGNT", "FIVE"],
    ["MGNT", "X5"],
    ["FIVE", "X5"],
    ["MGNT", "LENT"],
  ];

  function pairId(y, x) {
    return String(y || "").toLowerCase() + "-" + String(x || "").toLowerCase();
  }

  function sectorOf(ticker) {
    return SECTOR_BY_TICKER[String(ticker || "").toUpperCase()] || "SECTOR";
  }

  function sectorLabel(code) {
    return SECTOR_RU[code] || code || "Сектор";
  }

  function splitPairLabel(label) {
    const parts = String(label || "").split(/\s*\/\s*/);
    if (parts.length < 2) return null;
    const y = String(parts[0] || "").trim().toUpperCase();
    const x = String(parts[1] || "").trim().toUpperCase();
    if (!y || !x) return null;
    return { tickerY: y, tickerX: x };
  }

  function catalogPairs() {
    return CATALOG_LEGS.map(function (legs) {
      const y = legs[0];
      const x = legs[1];
      const sector = sectorOf(y);
      return {
        id: pairId(y, x),
        tickerY: y,
        tickerX: x,
        label: y + " / " + x,
        sector: sector,
        live: false,
        zAbs: null,
        zSigned: null,
        signal: "",
        cluster: null,
        fa: "weak",
        book: "DAILY",
        note: sectorLabel(sector) + " · из вселенной стола, живого Z пока нет",
      };
    });
  }

  function faFromDecision(code) {
    const d = String(code || "").toUpperCase();
    if (d === "ENTER") return "pass";
    if (d === "REDUCE_SIZE" || d === "WATCH") return "weak";
    if (d === "BLOCK") return "fail";
    return "weak";
  }

  function faFromFinal(row) {
    if (!row) return "weak";
    const nested = row.decision || (row.technical && row.technical.decision);
    return faFromDecision(nested);
  }

  function asFinite(v) {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function noteForPair(pair, cluster) {
    if (pair.note && pair.live) return pair.note;
    const bits = [];
    if (pair.live && pair.zAbs != null) {
      bits.push("Z со стола " + pair.zAbs.toFixed(2).replace(".", ","));
    }
    if (pair.signal && pair.signal !== "HOLD" && pair.signal !== "NO_SIGNAL") {
      bits.push(pair.signal.replace("_", " "));
    }
    bits.push(sectorLabel(pair.sector));
    if (cluster && cluster.sitOut) {
      bits.push("фаворита нет — сектор не в списке");
    } else if (pair.cluster === false) {
      bits.push("сектор не проходит отбор");
    } else if (pair.cluster) {
      bits.push("сектор в списке");
    }
    if (!pair.live) bits.push("живого Z нет — сценарий");
    return bits.join(" · ");
  }

  function liveLine(state) {
    state = state || {};
    const stats = state.stats || {};
    const bits = [];
    if (state.regime && state.regime !== "UNKNOWN") {
      bits.push("Режим со стола уже подставлен");
    }
    if (state.sitOut) {
      bits.push("Фаворита нет, сектора не в списке");
    } else if (state.champion) {
      bits.push("Фаворит: " + sectorLabel(state.champion));
    }
    if (stats.tested) {
      bits.push(
        "Прогон " +
          stats.tickers +
          " тикеров, " +
          stats.tested +
          " пар, коинтегрированных " +
          (stats.cointegrated || 0)
      );
    }
    if (stats.liveCount) {
      bits.push("живых пар " + stats.liveCount);
    }
    if (!bits.length) {
      return "Цифр со стола ещё нет. Можно разобрать вселенную руками — это сценарий, не заявка.";
    }
    return bits.join(". ") + ". Щелчки справа — «а что, если», не приказ.";
  }

  /**
   * Merge desk analysis + catalog into lab pairs.
   * @param {{ regime?: object, report?: object, cluster?: object, finals?: array, journal?: object, recommendations?: array, topPairs?: array, slots?: array }} parts
   */
  function buildLabState(parts) {
    parts = parts || {};
    const recs =
      (parts.report && parts.report.recommendations) ||
      parts.recommendations ||
      [];
    const tops = (parts.report && parts.report.topPairs) || parts.topPairs || [];
    const finals = parts.finals || [];
    const journal = (parts.journal && parts.journal.entries) || [];
    const slots = parts.slots || [];
    const cluster = parts.cluster || null;
    const regimeObj = parts.regime || {};
    const regime = String(regimeObj.label || regimeObj.current || "UNKNOWN").toUpperCase();
    const blockEntries = Boolean(regimeObj.blockEntries);
    const eligible = {};
    ((cluster && cluster.sectors) || []).forEach(function (s) {
      if (s && s.sector) eligible[s.sector] = Boolean(s.eligible);
    });
    const hasCluster = Boolean(cluster && cluster.sectors);
    const sitOut = cluster ? Boolean(cluster.sitOut) : false;

    const byId = {};
    function upsert(row) {
      if (!row || !row.tickerY || !row.tickerX) return;
      const id = pairId(row.tickerY, row.tickerX);
      const prev = byId[id] || {};
      byId[id] = Object.assign({}, prev, row, {
        id: id,
        label: row.tickerY + " / " + row.tickerX,
        sector: row.sector || prev.sector || sectorOf(row.tickerY),
      });
    }

    catalogPairs().forEach(upsert);

    function takeLegs(raw) {
      if (!raw) return null;
      if (raw.tickerY && raw.tickerX) {
        return {
          tickerY: String(raw.tickerY).toUpperCase(),
          tickerX: String(raw.tickerX).toUpperCase(),
        };
      }
      return splitPairLabel(raw.pair || raw.label);
    }

    tops.forEach(function (p) {
      const legs = takeLegs(p);
      if (!legs) return;
      upsert({
        tickerY: legs.tickerY,
        tickerX: legs.tickerX,
        live: true,
        source: "top",
      });
    });

    recs.forEach(function (r) {
      const legs = takeLegs(r);
      if (!legs) return;
      const z = asFinite(r.currentZScore);
      upsert({
        tickerY: legs.tickerY,
        tickerX: legs.tickerX,
        live: true,
        zSigned: z,
        zAbs: z == null ? null : Math.abs(z),
        signal: r.signal || "",
        source: "signal",
        note: r.summary || "",
      });
    });

    journal.forEach(function (e) {
      const legs = takeLegs(e);
      if (!legs) return;
      const z = asFinite(e.markZ != null ? e.markZ : e.entryZ);
      upsert({
        tickerY: legs.tickerY,
        tickerX: legs.tickerX,
        live: true,
        zSigned: z,
        zAbs: z == null ? null : Math.abs(z),
        source: "journal",
        status: e.status || "",
      });
    });

    slots.forEach(function (s) {
      if (!s) return;
      const book = String(s.book || "DAILY").toUpperCase();
      if (book !== "DAILY" && book !== "INTRADAY") return;
      const legs = takeLegs(s);
      if (!legs) return;
      const z = asFinite(s.z);
      upsert({
        tickerY: legs.tickerY,
        tickerX: legs.tickerX,
        live: true,
        zSigned: z,
        zAbs: z == null ? null : Math.abs(z),
        book: book,
        source: "slot",
        status: s.status || "",
      });
    });

    finals.forEach(function (f) {
      const tech = (f && f.technical) || f || {};
      const legs = takeLegs({
        tickerY: f && (f.tickerY || tech.tickerY),
        tickerX: f && (f.tickerX || tech.tickerX),
      });
      if (!legs) return;
      upsert({
        tickerY: legs.tickerY,
        tickerX: legs.tickerX,
        live: true,
        fa: faFromFinal(f),
        faNote: (f && (f.decisionSummary || f.rationale)) || "",
      });
    });

    const pairs = Object.keys(byId).map(function (k) {
      const p = byId[k];
      if (hasCluster) {
        p.cluster = Boolean(eligible[p.sector]) && !sitOut;
      }
      if (p.fa == null) p.fa = "weak";
      p.regime = regime;
      p.blockEntries = blockEntries;
      p.book = p.book || "DAILY";
      p.note = noteForPair(p, cluster);
      return p;
    });

    pairs.sort(function (a, b) {
      const as = (a.live ? 4 : 0) + (a.zAbs != null ? 2 : 0) + (a.signal && /LONG|SHORT/.test(a.signal) ? 1 : 0);
      const bs = (b.live ? 4 : 0) + (b.zAbs != null ? 2 : 0) + (b.signal && /LONG|SHORT/.test(b.signal) ? 1 : 0);
      if (bs !== as) return bs - as;
      return String(a.label).localeCompare(String(b.label), "ru");
    });

    const state = {
      pairs: pairs,
      regime: regime,
      blockEntries: blockEntries,
      sitOut: sitOut,
      champion: (cluster && cluster.champion) || "",
      stats: {
        tickers: (parts.report && parts.report.tickersAnalyzed) || 0,
        tested: (parts.report && parts.report.pairsTested) || 0,
        cointegrated: (parts.report && parts.report.cointegratedPairs) || 0,
        liveCount: pairs.filter(function (p) {
          return p.live;
        }).length,
      },
    };
    state.line = liveLine(state);
    return state;
  }

  function gatesFromPair(pair, extras) {
    extras = extras || {};
    pair = pair || {};
    const z = pair.zAbs != null ? pair.zAbs : 1;
    const regime = String(
      extras.regime || pair.regime || "SIDEWAYS"
    ).toUpperCase();
    return {
      zAbs: z,
      regime: regime === "UNKNOWN" ? "NEUTRAL" : regime,
      cluster: pair.cluster == null ? true : Boolean(pair.cluster),
      fa: pair.fa || "weak",
      book: pair.book || "DAILY",
      atas: true,
      sector: pair.sector || "SECTOR",
    };
  }

  function sameGates(a, b) {
    if (!a || !b) return false;
    return (
      Number(a.zAbs).toFixed(2) === Number(b.zAbs).toFixed(2) &&
      a.regime === b.regime &&
      Boolean(a.cluster) === Boolean(b.cluster) &&
      a.fa === b.fa &&
      a.book === b.book
    );
  }

  return {
    Z_ENTER: Z_ENTER,
    Z_WATCH: Z_WATCH,
    evaluatePipeline: evaluatePipeline,
    buildLabState: buildLabState,
    gatesFromPair: gatesFromPair,
    catalogPairs: catalogPairs,
    pairId: pairId,
    faFromDecision: faFromDecision,
    sectorLabel: sectorLabel,
    liveLine: liveLine,
    sameGates: sameGates,
  };
});
