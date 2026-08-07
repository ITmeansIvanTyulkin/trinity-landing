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
      techDetail = "|Z| в зоне WATCH (" + Z_WATCH + "–" + Z_ENTER + ")";
    } else {
      techDetail = "|Z| < " + Z_WATCH + " — техника слабая";
    }
    steps.push({
      id: "tech",
      title: "Техника (EG / Z)",
      status: techStatus,
      detail: techDetail,
    });

    const regimeOk = regime !== "TREND";
    steps.push({
      id: "regime",
      title: "Regime gate",
      status: regimeOk ? "pass" : "fail",
      detail:
        regime === "TREND"
          ? "TREND · ADX высокий — новые pairs-входы блокируются"
          : regime === "SIDEWAYS"
            ? "SIDEWAYS · боковик — pairs в фокусе"
            : "NEUTRAL · смешанный режим, pairs допустимы осторожнее",
    });

    steps.push({
      id: "cluster",
      title: "Cluster gate",
      status: cluster ? "pass" : "fail",
      detail: cluster
        ? sector + " · eligible (net>0, PF≥1.1)"
        : sector + " · не eligible / OIL_GAS-like ban",
    });

    const faOk = fa === "pass";
    const faStatus = fa === "pass" ? "pass" : fa === "weak" ? "watch" : "fail";
    steps.push({
      id: "fa",
      title: "Фундамент (FA)",
      status: faStatus,
      detail:
        fa === "pass"
          ? "Фундамент поддерживает / не противоречит"
          : fa === "weak"
            ? "FA слабый — обычно WATCH, не paper-open"
            : "FA против — блок рекомендации",
    });

    let atasOk = true;
    if (book === "INTRADAY") {
      atasOk = atas;
      steps.push({
        id: "atas",
        title: "ATAS / volume (INTRADAY)",
        status: atas ? "pass" : "fail",
        detail: atas
          ? "Микроструктура ок · book всё равно research-only"
          : "ATAS gate блокирует · типичный WATCH (microstructure)",
      });
    } else {
      steps.push({
        id: "book",
        title: "Book",
        status: "pass",
        detail: "DAILY · live paper после FA (в продукте)",
      });
    }

    let outcome = "BLOCK";
    let outcomeClass = "lab-out-block";
    let reason = "";

    if (!regimeOk) {
      outcome = "BLOCK";
      reason = "Regime TREND — pairs mean-reversion не открывает новые входы.";
    } else if (!cluster) {
      outcome = "BLOCK";
      reason = "Cluster gate — сектор не eligible в месячном review.";
    } else if (fa === "fail") {
      outcome = "BLOCK";
      reason = "FA против — рекомендация не проходит в paper.";
    } else if (book === "INTRADAY" && !atasOk) {
      outcome = "WATCH";
      outcomeClass = "lab-out-watch";
      reason =
        "Техника может быть ок, но ATAS/volume gate блокирует INTRADAY. Book research-only — без paper-открытий.";
    } else if (book === "INTRADAY") {
      outcome = "RESEARCH";
      outcomeClass = "lab-out-research";
      reason =
        "INTRADAY сейчас research-only: метрики считаются, paper-opens выключены до OOS.";
    } else if (techOk && faOk) {
      outcome = "PAPER OPEN";
      outcomeClass = "lab-out-enter";
      reason =
        "Техника + regime + cluster + FA — кандидат в paper-journal (не ордер брокеру).";
    } else if (techStatus === "watch" || fa === "weak" || !techOk) {
      outcome = "WATCH";
      outcomeClass = "lab-out-watch";
      if (!techOk && techStatus === "fail") {
        reason = "Техника ниже порога — ждём разворот / |Z|.";
      } else if (fa === "weak") {
        reason = "FA слабый — держим в WATCH, не форсируем paper-open.";
      } else {
        reason = "На границе порогов — наблюдение, не вход.";
      }
    } else {
      outcome = "BLOCK";
      reason = "Пайплайн не собрал подтверждений.";
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

  return {
    Z_ENTER: Z_ENTER,
    Z_WATCH: Z_WATCH,
    evaluatePipeline: evaluatePipeline,
  };
});
