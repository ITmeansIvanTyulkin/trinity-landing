/**
 * Fundamental scoring from the Excel playbook (non-fin vs banks)
 * and risk-questionnaire derivation.
 *
 * Research / decision-support only — not a recommendation or price forecast.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TrinityInvestFundamentals = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const NONFIN_FIELDS = [
    "revenue_curr",
    "revenue_prev",
    "debt_curr",
    "debt_prev",
    "equity_curr",
    "equity_prev",
    "op_profit_curr",
    "op_profit_prev",
    "fcf_curr",
    "fcf_prev",
    "ebitda_curr",
    "ebitda_prev",
    "st_liab_curr",
  ];

  const FIN_FIELDS = [
    "reserves_curr",
    "reserves_prev",
    "loans_curr",
    "loans_prev",
    "deposits_curr",
    "deposits_prev",
    "car_curr",
    "car_prev",
    "noi_curr",
    "noi_prev",
  ];

  function parseNumber(raw) {
    if (raw == null || raw === "") return null;
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    const s = String(raw).trim().replace(/\s/g, "").replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function hasAny(obj, keys) {
    if (!obj) return false;
    return keys.some((k) => parseNumber(obj[k]) != null);
  }

  function delta(curr, prev) {
    const c = parseNumber(curr);
    const p = parseNumber(prev);
    if (c == null || p == null || p === 0) return null;
    return c / p - 1;
  }

  function ratio(a, b) {
    const x = parseNumber(a);
    const y = parseNumber(b);
    if (x == null || y == null || y === 0) return null;
    return x / y;
  }

  function mean(nums) {
    const xs = nums.filter((n) => n != null && Number.isFinite(n));
    if (!xs.length) return null;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  }

  function point(ok) {
    return ok ? 1 : 0;
  }

  /**
   * Non-financial scorecard (Excel: выручка, долг, капитал, опер. прибыль, FCF, EBITDA, кр. обязательства).
   * Reliability ≈ «надежная» when leverage is contained and most quality deltas are constructive.
   */
  function scoreNonFin(input) {
    const revD = delta(input.revenue_curr, input.revenue_prev);
    const debtD = delta(input.debt_curr, input.debt_prev);
    const eqD = delta(input.equity_curr, input.equity_prev);
    const opD = delta(input.op_profit_curr, input.op_profit_prev);
    const fcfD = delta(input.fcf_curr, input.fcf_prev);
    const ebitdaD = delta(input.ebitda_curr, input.ebitda_prev);
    const debtEbitda = ratio(input.debt_curr, input.ebitda_curr);
    const stEbitda = ratio(input.st_liab_curr, input.ebitda_curr);
    const fcf = parseNumber(input.fcf_curr);

    const points = [];
    points.push({ id: "revenue_growth", label: "Выручка растёт", ok: revD != null && revD > 0, value: revD });
    points.push({
      id: "delever",
      label: "Долг снижается или Debt/EBITDA < 2.5",
      ok: (debtD != null && debtD < 0) || (debtEbitda != null && debtEbitda < 2.5),
      value: debtD,
    });
    points.push({ id: "equity_growth", label: "Акционерный капитал растёт", ok: eqD != null && eqD > 0, value: eqD });
    points.push({ id: "op_growth", label: "Опер. прибыль растёт", ok: opD != null && opD > 0, value: opD });
    points.push({
      id: "fcf_quality",
      label: "FCF > 0 и растёт",
      ok: fcf != null && fcf > 0 && fcfD != null && fcfD > 0,
      value: fcfD,
    });
    points.push({ id: "ebitda_growth", label: "EBITDA растёт", ok: ebitdaD != null && ebitdaD > 0, value: ebitdaD });
    points.push({
      id: "leverage",
      label: "Debt/EBITDA < 3",
      ok: debtEbitda != null && debtEbitda < 3,
      value: debtEbitda,
    });
    points.push({
      id: "st_cover",
      label: "Краткосрочные обязательства / EBITDA < 1.5",
      ok: stEbitda == null || stEbitda < 1.5,
      value: stEbitda,
    });

    const score = points.reduce((a, p) => a + point(p.ok), 0);
    const leverageOk = debtEbitda == null || debtEbitda < 3;
    const stOk = stEbitda == null || stEbitda < 2;
    const reliable = leverageOk && stOk && score >= 5;
    const potential = mean([revD, opD, fcfD, ebitdaD, eqD]);

    let status = "Weak";
    if (debtEbitda != null && debtEbitda > 4 && !reliable) status = "Fail";
    else if (reliable && potential != null && potential >= 0) status = "Pass";
    else if (reliable) status = "Weak";
    else status = "Fail";

    return {
      sector: "nonfin",
      status,
      score,
      scoreMax: 8,
      reliable,
      reliabilityLabel: reliable ? "надежная" : "ненадежная",
      potential,
      metrics: {
        revenueDelta: revD,
        debtDelta: debtD,
        equityDelta: eqD,
        opProfitDelta: opD,
        fcfDelta: fcfD,
        ebitdaDelta: ebitdaD,
        debtEbitda,
        stEbitda,
      },
      points,
    };
  }

  /**
   * Banks / financials (Excel: резервы, кредитный портфель, депозиты, CAR ≥ 8%, чистый опер. доход).
   * Sample rows (Sber / T-Bank) score 3/5 when reserves and CAR are not improving.
   */
  function scoreFin(input) {
    const resD = delta(input.reserves_curr, input.reserves_prev);
    const loanD = delta(input.loans_curr, input.loans_prev);
    const depD = delta(input.deposits_curr, input.deposits_prev);
    const carD = delta(input.car_curr, input.car_prev);
    const noiD = delta(input.noi_curr, input.noi_prev);
    const car = parseNumber(input.car_curr);
    const carPct = car != null && car > 1 ? car / 100 : car;

    const points = [];
    points.push({
      id: "reserves",
      label: "Создание резервов (рост)",
      ok: resD != null && resD > 0,
      value: resD,
    });
    points.push({
      id: "loans",
      label: "Кредитный портфель растёт",
      ok: loanD != null && loanD > 0,
      value: loanD,
    });
    points.push({
      id: "deposits",
      label: "Депозиты растут",
      ok: depD != null && depD > 0,
      value: depD,
    });
    points.push({
      id: "car",
      label: "Достаточность капитала ≥ 8% и не снижается",
      ok: carPct != null && carPct >= 0.08 && (carD == null || carD >= 0),
      value: carPct,
    });
    points.push({
      id: "noi",
      label: "Чистый операционный доход растёт",
      ok: noiD != null && noiD > 0,
      value: noiD,
    });

    const score = points.reduce((a, p) => a + point(p.ok), 0);
    const carHardFail = carPct != null && carPct < 0.08;
    const potential = mean([loanD, depD, noiD]);
    const reliable = !carHardFail && score >= 3;

    let status = "Weak";
    if (carHardFail) status = "Fail";
    else if (reliable && potential != null && potential >= 0) status = "Pass";
    else if (reliable) status = "Weak";
    else status = "Fail";

    return {
      sector: "fin",
      status,
      score,
      scoreMax: 5,
      reliable,
      reliabilityLabel: reliable ? "надежная" : "ненадежная",
      potential,
      metrics: {
        reservesDelta: resD,
        loansDelta: loanD,
        depositsDelta: depD,
        car: carPct,
        carDelta: carD,
        noiDelta: noiD,
      },
      points,
    };
  }

  /**
   * Excel-like purchase bands from last price (LUKOIL sample ≈ 95–90% and 84–77% of spot).
   * Research zones, not orders.
   */
  function buyRanges(lastPrice) {
    const last = parseNumber(lastPrice);
    if (last == null || last <= 0) return null;
    const fmt = (n) => Math.round(n * 100) / 100;
    return {
      zone1: { high: fmt(last * 0.95), low: fmt(last * 0.9) },
      zone2: { high: fmt(last * 0.84), low: fmt(last * 0.77) },
      basis: last,
      note: "Диапазоны как в Excel-шаблоне: зона 1 ≈ 5–10% ниже последней цены, зона 2 ≈ 16–23%. Не заявка и не прогноз точки входа.",
    };
  }

  function detectSector(input) {
    if (!input) return null;
    if (input.sector === "fin" || input.sector === "nonfin") return input.sector;
    if (hasAny(input, FIN_FIELDS) && !hasAny(input, ["revenue_curr", "ebitda_curr", "fcf_curr"])) {
      return "fin";
    }
    if (hasAny(input, NONFIN_FIELDS)) return "nonfin";
    if (hasAny(input, FIN_FIELDS)) return "fin";
    return null;
  }

  function scoreFundamentals(input, lastPrice) {
    if (!input || (!hasAny(input, NONFIN_FIELDS) && !hasAny(input, FIN_FIELDS))) {
      return {
        sector: null,
        status: "NoData",
        score: null,
        scoreMax: null,
        reliable: null,
        reliabilityLabel: null,
        potential: null,
        metrics: {},
        points: [],
        ranges: buyRanges(lastPrice),
        detail:
          "МСФО-поля не заданы. Публичный ISS их не отдаёт; ЦКИ в MVP не подключён. Фундаментальный гейт = NoData.",
      };
    }
    const sector = detectSector(input) || "nonfin";
    const scored = sector === "fin" ? scoreFin(input) : scoreNonFin(input);
    scored.ranges = buyRanges(lastPrice);
    scored.detail =
      scored.reliabilityLabel +
      ", баллов " +
      scored.score +
      "/" +
      scored.scoreMax +
      (scored.potential != null
        ? ", потенциал " + (scored.potential * 100).toFixed(1) + "%"
        : "");
    return scored;
  }

  const RISK_OPTIONS = {
    horizon: [
      { id: "lt1", label: "До 1 года", pts: 0 },
      { id: "y1_3", label: "1–3 года", pts: 1 },
      { id: "y3_5", label: "3–5 лет", pts: 2 },
      { id: "y5", label: "Более 5 лет", pts: 3 },
    ],
    liquidity: [
      { id: "soon", label: "Могут понадобиться в ближайшие месяцы", pts: 0 },
      { id: "maybe", label: "Возможно в горизонте 1–2 лет", pts: 1 },
      { id: "no", label: "Не планирую изымать", pts: 2 },
    ],
    reserve: [
      { id: "none", label: "Нет подушки", pts: 0 },
      { id: "m1_3", label: "1–3 месяца расходов", pts: 1 },
      { id: "m3_6", label: "3–6 месяцев", pts: 2 },
      { id: "m6", label: "6+ месяцев", pts: 3 },
    ],
    drawdown_behavior: [
      { id: "sell_all", label: "Продам всё", pts: 0 },
      { id: "sell_some", label: "Сокращу часть", pts: 1 },
      { id: "hold", label: "Буду держать план", pts: 2 },
      { id: "buy_more", label: "Рассмотрю докупку по правилам", pts: 3 },
    ],
    expense_impact: [
      { id: "high", label: "Сильно ударит по текущим расходам", pts: 0 },
      { id: "medium", label: "Заметно, но переживается", pts: 1 },
      { id: "low", label: "На расходы почти не влияет", pts: 2 },
    ],
    volatility: [
      { id: "low", label: "Низкая: спокойные колебания", pts: 0 },
      { id: "medium", label: "Средняя", pts: 1 },
      { id: "high", label: "Высокая: готов к широкому диапазону", pts: 2 },
    ],
  };

  function optionPts(field, id) {
    const list = RISK_OPTIONS[field] || [];
    const hit = list.find((o) => o.id === id);
    return hit ? hit.pts : 0;
  }

  function scoreRiskAnswers(answers) {
    const a = answers || {};
    if (!a.acknowledgement) {
      return { error: "Нужно подтверждение, что это research / decision-support, не рекомендация." };
    }
    const required = [
      "horizon",
      "liquidity",
      "reserve",
      "drawdown_behavior",
      "expense_impact",
      "volatility",
    ];
    for (let i = 0; i < required.length; i++) {
      if (!a[required[i]]) return { error: "Ответьте на все вопросы анкеты." };
    }
    const pts =
      optionPts("horizon", a.horizon) +
      optionPts("liquidity", a.liquidity) +
      optionPts("reserve", a.reserve) +
      optionPts("drawdown_behavior", a.drawdown_behavior) +
      optionPts("expense_impact", a.expense_impact) +
      optionPts("volatility", a.volatility);

    let risk_level = "moderate";
    let warn_drawdown_pct = 15;
    if (pts <= 5) {
      risk_level = "conservative";
      warn_drawdown_pct = 8;
    } else if (pts >= 11) {
      risk_level = "aggressive";
      warn_drawdown_pct = 25;
    }

    return {
      horizon: a.horizon,
      liquidity: a.liquidity,
      reserve: a.reserve,
      drawdown_behavior: a.drawdown_behavior,
      expense_impact: a.expense_impact,
      volatility: a.volatility,
      acknowledgement: true,
      answers: a,
      risk_level,
      warn_drawdown_pct,
      points: pts,
      completed_at: new Date().toISOString(),
    };
  }

  function riskLevelLabel(level) {
    if (level === "conservative") return "Консервативный";
    if (level === "aggressive") return "Агрессивный";
    if (level === "moderate") return "Умеренный";
    return "Не задан";
  }

  return {
    NONFIN_FIELDS,
    FIN_FIELDS,
    RISK_OPTIONS,
    parseNumber,
    delta,
    ratio,
    buyRanges,
    detectSector,
    scoreNonFin,
    scoreFin,
    scoreFundamentals,
    scoreRiskAnswers,
    riskLevelLabel,
  };
});
