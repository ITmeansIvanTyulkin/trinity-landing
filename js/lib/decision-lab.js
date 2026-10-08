/**
 * Calendar-arb Decision Lab (pure scenario sandbox).
 * Manual toggles only — does not need a live desk feed.
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

  /** |Z| watch / enter / late-stop (illustrative, aligned with desk playbook bands). */
  const Z_WATCH = 1.5;
  const Z_ENTER = 2.0;
  const Z_LATE = 3.0;

  const FAMILIES = [
    { id: "BR", label: "Нефть · BR", note: "Near/next Brent на FORTS" },
    { id: "SI", label: "Валюта · Si", note: "Календарь доллар–рубль" },
    { id: "RI", label: "Индекс · RI", note: "Календарь RTS" },
    { id: "GD", label: "Золото · GD", note: "Календарь золота" },
    { id: "NG", label: "Газ · NG", note: "Календарь газа" },
  ];

  function familyById(id) {
    return FAMILIES.find(function (f) {
      return f.id === id;
    }) || FAMILIES[0];
  }

  function fmtZ(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return (Math.round(x * 100) / 100).toFixed(2).replace(".", ",");
  }

  /**
   * @param {object} input
   * @param {number} input.zAbs absolute |Z| of near–next (or fly) spread
   * @param {string} input.side "cheap" | "rich" — cheap → long spread, rich → short
   * @param {string} input.family BR|SI|RI|GD|NG
   * @param {string} input.structure "spread" | "fly"
   * @param {boolean} input.session in main FORTS session
   * @param {boolean} input.rollOk near DTE / roll window allows new entries
   * @param {boolean} input.eventClear no EIA / event blackout
   * @param {string} input.curve "ok" | "slope" | "broken" — mean-reverting / trending / not stationary
   * @param {boolean} input.costOk edge to mean covers two-leg costs
   * @param {boolean} input.goOk GO / margin within limit
   * @param {boolean} input.recede Z already turned back toward mean
   */
  function evaluatePipeline(input) {
    const zAbs = Math.abs(Number(input.zAbs) || 0);
    const side = input.side === "rich" ? "rich" : "cheap";
    const family = familyById(input.family);
    const structure = input.structure === "fly" ? "fly" : "spread";
    const session = input.session !== false;
    const rollOk = input.rollOk !== false;
    const eventClear = input.eventClear !== false;
    const curve = input.curve || "ok";
    const costOk = input.costOk !== false;
    const goOk = input.goOk !== false;
    const recede = input.recede !== false;

    const steps = [];

    let techStatus = "fail";
    let techDetail = "";
    if (zAbs >= Z_LATE) {
      techStatus = "fail";
      techDetail =
        "|Z| ≥ " +
        Z_LATE +
        " — поздно: у зоны стопа, не догоняем хвост";
    } else if (zAbs >= Z_ENTER) {
      techStatus = "pass";
      techDetail =
        "|Z| ≥ " +
        Z_ENTER +
        " — спред достаточно разошёлся" +
        (side === "cheap"
          ? " (дешёвый → long next / short near)"
          : " (дорогой → short next / long near)");
    } else if (zAbs >= Z_WATCH) {
      techStatus = "watch";
      techDetail =
        "|Z| в зоне наблюдения (" + Z_WATCH + "–" + Z_ENTER + ")";
    } else {
      techDetail = "|Z| < " + Z_WATCH + " — расхождение слабое";
    }
    steps.push({
      id: "tech",
      title: "Техника (Z спреда)",
      status: techStatus,
      detail: techDetail,
    });

    steps.push({
      id: "session",
      title: "Сессия FORTS",
      status: session ? "pass" : "fail",
      detail: session
        ? "Основная сессия — сценарий входа допустим"
        : "Вне основной сессии — новые входы не открываем",
    });

    steps.push({
      id: "roll",
      title: "Ролл / DTE ближнего",
      status: rollOk ? "pass" : "fail",
      detail: rollOk
        ? "До экспирации запас есть — окно входа открыто"
        : "Близко к роллу / короткий DTE — новые входы блокируем",
    });

    steps.push({
      id: "event",
      title: "События / EIA",
      status: eventClear ? "pass" : "fail",
      detail: eventClear
        ? "Чёрный список событий чист"
        : "Событийный blackout (EIA / отчёт) — вход откладываем",
    });

    let curveStatus = "pass";
    let curveDetail = "Кривая mean-reverting — fade уместен";
    if (curve === "slope") {
      curveStatus = "fail";
      curveDetail = "Сильный уклон спреда — не fade'им тренд";
    } else if (curve === "broken") {
      curveStatus = "fail";
      curveDetail = "Спред не стационарен — mean-reversion сомнителен";
    }
    steps.push({
      id: "curve",
      title: "Качество кривой",
      status: curveStatus,
      detail: curveDetail,
    });

    steps.push({
      id: "cost",
      title: "Издержки двух ног",
      status: costOk ? "pass" : "fail",
      detail: costOk
        ? "До среднего хватает на round-trip + запас"
        : "К среднему меньше издержек — edge тонкий",
    });

    steps.push({
      id: "go",
      title: "ГО / маржа",
      status: goOk ? "pass" : "fail",
      detail: goOk
        ? "Оценка ГО в лимите сценария"
        : "ГО / лимит не проходит — размер не ставим",
    });

    const needRecede = techStatus === "pass";
    let recedeStatus = "pass";
    let recedeDetail = "Разворот к среднему уже намечен";
    if (needRecede && !recede) {
      recedeStatus = "watch";
      recedeDetail =
        "Ждём recede: |Z| у порога, но разворота к среднему ещё нет";
    } else if (!needRecede) {
      recedeStatus = techStatus === "watch" ? "watch" : "pass";
      recedeDetail = needRecede
        ? recedeDetail
        : "Пока техника не на пороге — recede не обязателен";
    }
    steps.push({
      id: "recede",
      title: "Разворот (recede)",
      status: recedeStatus,
      detail: recedeDetail,
    });

    steps.push({
      id: "book",
      title: "Инструмент",
      status: "pass",
      detail:
        family.label +
        " · " +
        (structure === "fly" ? "бабочка (три месяца)" : "near–next спред") +
        " · " +
        family.note,
    });

    const hardFail = steps.some(function (s) {
      return (
        s.status === "fail" &&
        s.id !== "tech" &&
        s.id !== "recede"
      );
    });
    const techFail = techStatus === "fail";
    const techWatch = techStatus === "watch";
    const waitingRecede = needRecede && !recede;

    let outcome = "BLOCK";
    let outcomeClass = "lab-out-block";
    let reason = "";

    if (!session) {
      reason = "Вне сессии FORTS сценарий входа не собираем.";
    } else if (!rollOk) {
      reason = "Окно ролла / короткий DTE — новые входы не открываем.";
    } else if (!eventClear) {
      reason = "Событийный blackout — ждём после отчёта / EIA.";
    } else if (curve !== "ok") {
      reason =
        curve === "slope"
          ? "Уклон кривой против fade — не ловим тренд спредом."
          : "Кривая не стационарна — mean-reversion не опираемся.";
    } else if (!costOk) {
      reason = "До среднего не покрывает издержки двух ног.";
    } else if (!goOk) {
      reason = "ГО / лимит не проходит — размер в сценарии нулевой.";
    } else if (techFail) {
      reason =
        zAbs >= Z_LATE
          ? "Слишком поздно: |Z| у стопа, хвост не догоняем."
          : "Расхождение слабое — ждём более жирный спред.";
    } else if (techWatch || waitingRecede) {
      outcome = "WATCH";
      outcomeClass = "lab-out-watch";
      reason = waitingRecede
        ? "Порог по |Z| есть, но разворота к среднему ещё нет — подождать recede."
        : "Спред в зоне наблюдения — не вход, а сценарий «подождать».";
    } else if (!hardFail && techStatus === "pass" && recede) {
      outcome = "PAPER OPEN";
      outcomeClass = "lab-out-enter";
      reason =
        structure === "fly"
          ? side === "cheap"
            ? "Бабочка дешёвая: сценарий buy wings / sell 2× body. Это разбор, не заявка."
            : "Бабочка дорогая: сценарий sell wings / buy 2× body. Это разбор, не заявка."
          : side === "cheap"
            ? "Спред дешёвый: сценарий buy next / sell near. Это разбор логики, не ордер брокеру."
            : "Спред дорогой: сценарий sell next / buy near. Это разбор логики, не ордер брокеру.";
    } else {
      reason = "Проверки не собрались в одну картину.";
    }

    return {
      steps: steps,
      outcome: outcome,
      outcomeClass: outcomeClass,
      reason: reason,
      flags: {
        zAbs: zAbs,
        side: side,
        family: family.id,
        structure: structure,
        techStatus: techStatus,
      },
    };
  }

  /** Default gates for a fresh scenario (all green except mild Z). */
  function defaultGates() {
    return {
      zAbs: 2.1,
      side: "cheap",
      family: "BR",
      structure: "spread",
      session: true,
      rollOk: true,
      eventClear: true,
      curve: "ok",
      costOk: true,
      goOk: true,
      recede: true,
    };
  }

  function sameGates(a, b) {
    if (!a || !b) return false;
    const keys = [
      "zAbs",
      "side",
      "family",
      "structure",
      "session",
      "rollOk",
      "eventClear",
      "curve",
      "costOk",
      "goOk",
      "recede",
    ];
    return keys.every(function (k) {
      if (k === "zAbs") {
        return Math.abs(Number(a.zAbs) - Number(b.zAbs)) < 0.001;
      }
      return a[k] === b[k];
    });
  }

  /** Kept for cabinet bootstrap: lab no longer pulls pairs from the desk. */
  function buildLabState() {
    return {
      pairs: [],
      regime: null,
      sitOut: false,
      line:
        "Ручная лаборатория календарного спреда. Крутите тумблеры — стол для этого блока не нужен.",
    };
  }

  function catalogPairs() {
    return [];
  }

  return {
    Z_WATCH: Z_WATCH,
    Z_ENTER: Z_ENTER,
    Z_LATE: Z_LATE,
    FAMILIES: FAMILIES,
    familyById: familyById,
    fmtZ: fmtZ,
    evaluatePipeline: evaluatePipeline,
    defaultGates: defaultGates,
    sameGates: sameGates,
    buildLabState: buildLabState,
    catalogPairs: catalogPairs,
  };
});
