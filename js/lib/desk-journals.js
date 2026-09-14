/**
 * Merge paper journals from all desk strategies (pairs, trend, calendar-arb).
 * Pure: no fetch, no DOM.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TrinityDeskJournals = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EXIT_RU = {
    TP2: "Цель 2",
    TP1: "Цель 1",
    TP1_FULL: "Цель 1",
    TP_30PTS: "Цель",
    SL: "Стоп",
    BE_STOP: "Безубыток",
  };

  const EXIT_DETAIL_RU = {
    TP2: "Тейк-профит 2",
    TP1: "Тейк-профит 1",
    TP1_FULL: "Тейк-профит 1",
    TP_30PTS: "Тейк-профит",
    SL: "Стоп-лосс",
    BE_STOP: "Безубыток",
  };

  function asNumber(v) {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function asInt(v, fallback) {
    const n = asNumber(v);
    return n == null ? fallback : Math.round(n);
  }

  function dayKey(iso) {
    if (!iso) return "";
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const d = new Date(t);
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  function fmtRub(n) {
    const x = asNumber(n);
    if (x == null) return "—";
    const r = Math.round(x);
    const sign = r > 0 ? "+" : "";
    return sign + r.toLocaleString("ru-RU") + " ₽";
  }

  function exitLabel(code) {
    const c = String(code || "").toUpperCase();
    return EXIT_RU[c] || code || "—";
  }

  function exitDetail(code) {
    const c = String(code || "").toUpperCase();
    return EXIT_DETAIL_RU[c] || EXIT_RU[c] || code || "—";
  }

  function sideLabel(side) {
    const s = String(side || "").toUpperCase();
    if (s === "BUY" || s === "LONG") return "Покупка";
    if (s === "SELL" || s === "SHORT") return "Продажа";
    return s ? String(side) : "—";
  }

  function formatPrice(n) {
    const x = asNumber(n);
    if (x == null) return "—";
    const s = x.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    return s.replace(".", ",");
  }

  function dealFields(e, extra) {
    extra = extra || {};
    const ticker =
      extra.ticker ||
      (e && (e.instrument || e.ticker || e.pair)) ||
      "";
    return {
      id: extra.id || (e && e.id) || "",
      ticker: ticker,
      side: extra.side || (e && e.side) || "",
      entryPrice: asNumber(
        e && (e.entryPrice != null ? e.entryPrice : e.entry)
      ),
      exitPrice: asNumber(
        e && (e.exitPrice != null ? e.exitPrice : e.exit)
      ),
      exitReason:
        extra.exitReason != null
          ? extra.exitReason
          : (e && e.exitReason) || "",
      openedAt: (e && e.openedAt) || "",
      closedAt: (e && e.closedAt) || "",
      qty: asNumber(e && e.qty),
      mode: (e && e.mode) || "",
    };
  }

  function dealFacts(slot) {
    slot = slot || {};
    const open = String(slot.status || "").toUpperCase() === "OPEN";
    return {
      ticker: slot.ticker || slot.pair || "—",
      side: sideLabel(slot.side),
      entry: formatPrice(slot.entryPrice),
      exit: formatPrice(slot.exitPrice),
      reason: open && !slot.exitReason ? "Ещё открыта" : exitDetail(slot.exitReason),
      openedAt: slot.openedAt || "",
      closedAt: slot.closedAt || (open ? "" : slot.t || ""),
      qty: slot.qty != null && slot.qty !== "" ? String(slot.qty) : "",
      pnl: asNumber(slot.pnl),
      mode: slot.mode || "",
    };
  }

  function pairsLegs(journal) {
    const entries = (journal && journal.entries) || [];
    return entries.map(function (e) {
      const status = String((e && e.status) || "").toUpperCase();
      const pair =
        (e && e.pair) ||
        [e && e.tickerY, e && e.tickerX].filter(Boolean).join(" / ") ||
        "—";
      return Object.assign(
        {
          t: (e && (e.closedAt || e.openedAt)) || "",
          pnl: asNumber(e && e.pnlRub) || 0,
          unrealized: asNumber(e && e.unrealizedPnlRub) || 0,
          status: status || "WATCH",
          book: (e && e.book) || "DAILY",
          pair: pair,
          z:
            e && e.markZ != null
              ? Number(e.markZ).toFixed(2)
              : e && e.entryZ != null
                ? Number(e.entryZ).toFixed(2)
                : "—",
          size:
            e && e.remainingFraction != null
              ? String(Math.round(Number(e.remainingFraction) * 100)) + "%"
              : status === "CLOSED"
                ? fmtRub(e && e.pnlRub)
                : "—",
        },
        dealFields(e, { ticker: pair })
      );
    });
  }

  function trendLegs(paper) {
    const trades = (paper && paper.trades) || [];
    return trades.map(function (e) {
      const pnl = asNumber(e && e.pnlRub) || 0;
      const pair = (e && (e.instrument || e.ticker)) || "—";
      return Object.assign(
        {
          t: (e && (e.closedAt || e.openedAt)) || "",
          pnl: pnl,
          unrealized: 0,
          status: "CLOSED",
          book: "TREND",
          pair: pair,
          z: exitLabel(e && e.exitReason),
          size: fmtRub(pnl),
        },
        dealFields(e, { ticker: pair })
      );
    });
  }

  function arbLegs(status) {
    const st = (status && status.statement) || {};
    const trades = st.trades || (status && status.trades) || [];
    if (trades.length) {
      return trades.map(function (e) {
        const pnl = asNumber(e && e.pnlRub) || 0;
        const statusCode = String((e && e.status) || "CLOSED").toUpperCase();
        const pair =
          (e && (e.pair || e.instrument || e.family)) || "Арбитраж";
        return Object.assign(
          {
            t: (e && (e.closedAt || e.openedAt)) || "",
            pnl: pnl,
            unrealized: asNumber(e && e.unrealizedPnlRub) || 0,
            status: statusCode,
            book: "ARB",
            pair: pair,
            z: exitLabel(e && e.exitReason),
            size: statusCode === "CLOSED" ? fmtRub(pnl) : "—",
          },
          dealFields(e, { ticker: pair })
        );
      });
    }
    return [];
  }

  function slotFromLeg(leg) {
    return {
      id: leg.id || "",
      pair: leg.pair,
      ticker: leg.ticker || leg.pair,
      book: leg.book,
      z: leg.z,
      status: leg.status,
      size: leg.size,
      side: leg.side || "",
      entryPrice: leg.entryPrice,
      exitPrice: leg.exitPrice,
      exitReason: leg.exitReason || "",
      openedAt: leg.openedAt || "",
      closedAt: leg.closedAt || "",
      t: leg.t || "",
      qty: leg.qty,
      pnl: leg.pnl,
      mode: leg.mode || "",
    };
  }

  function laterIso(a, b) {
    const ta = Date.parse(a || "");
    const tb = Date.parse(b || "");
    const aOk = Number.isFinite(ta);
    const bOk = Number.isFinite(tb);
    if (aOk && bOk) return ta >= tb ? a : b;
    if (aOk) return a;
    if (bOk) return b;
    return a || b || null;
  }

  /**
   * @param {{ pairs?: object, trend?: object, arb?: object }} parts
   * @param {Date} [now]
   */
  function mergeDeskJournals(parts, now) {
    parts = parts || {};
    const pairs = pairsLegs(parts.pairs);
    const trend = trendLegs(parts.trend);
    const arb = arbLegs(parts.arb);
    const all = pairs.concat(trend, arb);

    const closed = all
      .filter(function (l) {
        return l.status === "CLOSED";
      })
      .map(function (l) {
        return { t: l.t, pnl: l.pnl };
      })
      .filter(function (l) {
        return l.t;
      })
      .sort(function (a, b) {
        return String(a.t).localeCompare(String(b.t));
      });

    let acc = 0;
    const equityMarks = closed.map(function (l) {
      acc += l.pnl;
      return {
        t: l.t,
        v: acc,
        pnl: l.pnl,
        day: dayKey(l.t),
      };
    });
    const equityPoints = equityMarks.map(function (m) {
      return m.v;
    });
    const dayMap = {};
    equityMarks.forEach(function (m, i) {
      const prev = dayMap[m.day];
      dayMap[m.day] = {
        t: m.t,
        v: m.v,
        day: m.day,
        pnl: (prev ? prev.pnl : 0) + m.pnl,
        count: (prev ? prev.count : 0) + 1,
        index: i,
      };
    });
    const dayMarks = Object.keys(dayMap).map(function (k) {
      return dayMap[k];
    });

    const opens = all.filter(function (l) {
      return l.status === "OPEN";
    });
    const closedLegs = all
      .filter(function (l) {
        return l.status === "CLOSED";
      })
      .slice()
      .sort(function (a, b) {
        return String(b.t).localeCompare(String(a.t));
      });

    const n = now instanceof Date ? now : new Date();
    const today = dayKey(n.toISOString());
    const todayLegs = closedLegs.filter(function (l) {
      return dayKey(l.t) === today;
    });

    const pairsJ = parts.pairs || {};
    const trendSt = (parts.trend && parts.trend.statement) || {};
    const arbSt = (parts.arb && parts.arb.statement) || {};

    const realizedFromLegs = closed.reduce(function (s, l) {
      return s + l.pnl;
    }, 0);
    const realizedFromStatements =
      (asNumber(pairsJ.realizedPnlRub) || 0) +
      (asNumber(trendSt.realizedPnlRub) || 0) +
      (asNumber(arbSt.realizedPnlRub) || 0);
    const hasStatementPnl =
      asNumber(pairsJ.realizedPnlRub) != null ||
      asNumber(trendSt.realizedPnlRub) != null ||
      asNumber(arbSt.realizedPnlRub) != null;

    const unrealized =
      (asNumber(pairsJ.unrealizedPnlRub) || 0) +
      opens.reduce(function (s, l) {
        return s + (l.unrealized || 0);
      }, 0);

    const closedFromStatements =
      asInt(pairsJ.closedCount, 0) +
      asInt(trendSt.closedCount, 0) +
      asInt(arbSt.closedCount, 0);
    const todayFromStatements =
      (asNumber(trendSt.todayPnlRub) || 0) + (asNumber(arbSt.todayPnlRub) || 0);
    const todayPnlRub =
      todayFromStatements ||
      todayLegs.reduce(function (s, l) {
        return s + l.pnl;
      }, 0);

    const openSlots = opens
      .map(slotFromLeg)
      .concat(closedLegs.slice(0, 8).map(slotFromLeg));

    function bookRow(book, label, stClosed, stPnl) {
      const legs = all.filter(function (l) {
        return l.book === book && l.status === "CLOSED";
      });
      const fromSt = asInt(stClosed, 0);
      const pnl = asNumber(stPnl);
      return {
        book: book,
        label: label,
        closed: fromSt || legs.length,
        realized: pnl != null ? pnl : legs.reduce(function (s, l) {
          return s + l.pnl;
        }, 0),
      };
    }

    const byBook = [
      bookRow("DAILY", "Пары на дневках", pairsJ.closedCount, pairsJ.realizedPnlRub),
      bookRow("TREND", "Тренд по нефти", trendSt.closedCount, trendSt.realizedPnlRub),
      bookRow("ARB", "Календарный арбитраж", arbSt.closedCount, arbSt.realizedPnlRub),
    ];

    return {
      realizedPnlRub: hasStatementPnl
        ? realizedFromStatements
        : realizedFromLegs || null,
      unrealizedPnlRub: unrealized,
      openCount: asInt(pairsJ.openCount, opens.length),
      closedCount: closedFromStatements || closed.length,
      openSlots: openSlots,
      equityPoints: equityPoints,
      equityMarks: equityMarks,
      dayMarks: dayMarks,
      updatedAt: laterIso(
        laterIso(pairsJ.updatedAt, trendSt.updatedAt),
        arbSt.updatedAt
      ),
      todayPnlRub: todayPnlRub,
      todayClosedCount: todayLegs.length,
      hasTrades: closed.length + opens.length > 0,
      byBook: byBook,
    };
  }

  function isMarketEmpty(snap) {
    if (!snap || !snap.hasRow) return true;
    const closed = snap.closedCount || 0;
    const open = snap.openCount || 0;
    const pts = (snap.equityPoints && snap.equityPoints.length) || 0;
    return closed === 0 && open === 0 && pts === 0;
  }

  function cleanDetail(text) {
    return String(text || "")
      .replace(/^Sit-out:\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function toneOf(robot) {
    const t = String((robot && robot.tone) || "").toLowerCase();
    if (t === "trade" || t === "armed") return "live";
    if (t === "flat") return "flat";
    if (t === "scan" || t === "watch") return "scan";
    return "scan";
  }

  function fromRobot(robot, id, label) {
    if (!robot) {
      return {
        id: id,
        label: label,
        status: "Нет данных",
        detail: "Стол ещё не прислал статус этой стратегии.",
        tone: "empty",
      };
    }
    return {
      id: id,
      label: label,
      status: robot.status || "—",
      detail: cleanDetail(robot.detail),
      tone: toneOf(robot),
      instrument: robot.instrument || "",
    };
  }

  function arbFromStatus(arb) {
    if (!arb) {
      return fromRobot(null, "arb", "Календарный арбитраж");
    }
    const fp = arb.fairPaper || {};
    if (fp.open) {
      return {
        id: "arb",
        label: "Календарный арбитраж",
        status: "В сделке",
        detail: cleanDetail(fp.lastReason || arb.message || "Открыт спред."),
        tone: "live",
      };
    }
    const action = String(fp.lastAction || "");
    const reason = String(fp.lastReason || "");
    if (action === "SKIP_SESSION" || /сессии/i.test(reason)) {
      const detail = reason
        ? reason.charAt(0).toUpperCase() + reason.slice(1) + "."
        : "Вне основной сессии.";
      return {
        id: "arb",
        label: "Календарный арбитраж",
        status: "Сессия закрыта",
        detail: detail,
        tone: "flat",
      };
    }
    if (action.indexOf("SKIP") === 0) {
      return {
        id: "arb",
        label: "Календарный арбитраж",
        status: "Пропуск",
        detail: reason || arb.message || "Сейчас без входа.",
        tone: "flat",
      };
    }
    return {
      id: "arb",
      label: "Календарный арбитраж",
      status: "Сканирует",
      detail: arb.message || "Ищет календарный спред.",
      tone: "scan",
    };
  }

  function strategiesFromDesk(plaques, arb) {
    const robots = (plaques && plaques.robots) || [];
    const by = {};
    robots.forEach(function (r) {
      if (r && r.key) by[r.key] = r;
    });
    return [
      fromRobot(by.pairs, "pairs", "Пары на дневках"),
      fromRobot(by.oil, "oil", "Нефть · внутри дня"),
      fromRobot(by.positional, "positional", "Нефть · позиционная"),
      arbFromStatus(arb),
    ];
  }

  return {
    mergeDeskJournals: mergeDeskJournals,
    isMarketEmpty: isMarketEmpty,
    strategiesFromDesk: strategiesFromDesk,
    fmtRub: fmtRub,
    dayKey: dayKey,
    sideLabel: sideLabel,
    exitDetail: exitDetail,
    formatPrice: formatPrice,
    dealFacts: dealFacts,
  };
});
