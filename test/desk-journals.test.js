const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const J = require("../js/lib/desk-journals.js");

describe("TrinityDeskJournals", () => {
  it("empty parts stay empty", () => {
    const m = J.mergeDeskJournals({});
    assert.equal(m.hasTrades, false);
    assert.equal(m.closedCount, 0);
    assert.deepEqual(m.equityPoints, []);
  });

  it("merges trend oil trades that pairs journal does not have", () => {
    const now = new Date("2026-09-14T20:00:00+03:00");
    const m = J.mergeDeskJournals(
      {
        pairs: {
          realizedPnlRub: 0,
          unrealizedPnlRub: 0,
          openCount: 0,
          closedCount: 0,
          entries: [],
        },
        trend: {
          statement: {
            closedCount: 3,
            realizedPnlRub: 1497.57,
            todayPnlRub: 1497.57,
            updatedAt: "2026-09-14T15:25:00",
          },
          trades: [
            {
              instrument: "BRV6",
              side: "BUY",
              qty: 2,
              entryPrice: 107.9583,
              exitPrice: 108.2265,
              openedAt: "2026-09-14T11:45+03:00",
              pnlRub: 515.38,
              closedAt: "2026-09-14T11:50+03:00",
              exitReason: "TP2",
            },
            {
              instrument: "BRV6",
              side: "BUY",
              qty: 1,
              entryPrice: 107.99,
              exitPrice: 108.2581,
              openedAt: "2026-09-14T14:20+03:00",
              pnlRub: 327.69,
              closedAt: "2026-09-14T14:30+03:00",
              exitReason: "TP2",
            },
            {
              instrument: "BRV6",
              side: "SELL",
              qty: 3,
              entryPrice: 107.9583,
              exitPrice: 108.27,
              openedAt: "2026-09-14T15:20+03:00",
              pnlRub: 654.5,
              closedAt: "2026-09-14T15:25+03:00",
              exitReason: "TP2",
            },
          ],
        },
        arb: { statement: { closedCount: 0, realizedPnlRub: 0, todayPnlRub: 0 } },
      },
      now
    );
    assert.equal(m.hasTrades, true);
    assert.equal(m.closedCount, 3);
    assert.equal(m.todayClosedCount, 3);
    assert.equal(Math.round(m.todayPnlRub), 1498);
    assert.equal(m.equityPoints.length, 3);
    assert.equal(m.dayMarks.length, 1);
    assert.equal(m.dayMarks[0].count, 3);
    assert.equal(Math.round(m.equityPoints[2]), 1498);
    assert.equal(m.openSlots[0].pair, "BRV6");
    assert.equal(m.openSlots[0].book, "TREND");
    assert.equal(m.openSlots[0].status, "CLOSED");
    assert.match(m.openSlots[0].z, /Цель/);
    assert.equal(m.openSlots[0].side, "SELL");
    assert.equal(m.openSlots[0].entryPrice, 107.9583);
    assert.equal(m.openSlots[0].qty, 3);
    const facts = J.dealFacts(m.openSlots[0]);
    assert.equal(facts.ticker, "BRV6");
    assert.equal(facts.side, "Продажа");
    assert.equal(facts.reason, "Тейк-профит 2");
    assert.equal(facts.entry, "107,9583");
    assert.equal(facts.exit, "108,27");
    assert.equal(facts.qty, "3");
    assert.equal(J.sideLabel("BUY"), "Покупка");
    assert.equal(J.exitDetail("SL"), "Стоп-лосс");
    assert.equal(m.byBook[1].book, "TREND");
    assert.equal(m.byBook[1].closed, 3);
  });

  it("keeps pairs opens and adds them before recent closed", () => {
    const m = J.mergeDeskJournals({
      pairs: {
        openCount: 1,
        closedCount: 1,
        realizedPnlRub: 10,
        entries: [
          {
            tickerY: "SBER",
            tickerX: "VTBR",
            status: "OPEN",
            book: "DAILY",
            markZ: 1.9,
            remainingFraction: 0.5,
          },
          {
            tickerY: "MAGN",
            tickerX: "NLMK",
            status: "CLOSED",
            book: "DAILY",
            pnlRub: 10,
            closedAt: "2026-09-13T12:00:00Z",
          },
        ],
      },
      trend: { statement: {}, trades: [] },
    });
    assert.equal(m.openCount, 1);
    assert.equal(m.openSlots[0].pair, "SBER / VTBR");
    assert.equal(m.openSlots[0].status, "OPEN");
    assert.equal(m.openSlots[1].status, "CLOSED");
  });

  it("isMarketEmpty: zeros even if a snapshot row exists", () => {
    assert.equal(J.isMarketEmpty(null), true);
    assert.equal(J.isMarketEmpty({ hasRow: true, closedCount: 0, openCount: 0, equityPoints: [] }), true);
    assert.equal(J.isMarketEmpty({ hasRow: true, closedCount: 3, openCount: 0, equityPoints: [1] }), false);
  });

  it("maps live robot plaques to human strategy statuses", () => {
    const rows = J.strategiesFromDesk(
      {
        robots: [
          { key: "pairs", status: "Ресёрч", detail: "Sit-out: нет фаворита.", tone: "scan" },
          { key: "oil", status: "Сессия закрыта", detail: "Основная сессия закончена.", tone: "flat" },
          { key: "positional", status: "Сканирует", detail: "Ищет рабочий сетап.", tone: "scan" },
        ],
      },
      {
        fairPaper: { lastAction: "SKIP_SESSION", lastReason: "вне основной сессии FORTS" },
        message: "Календарный спред FORTS",
      }
    );
    assert.equal(rows.length, 4);
    assert.equal(rows[0].status, "Ресёрч");
    assert.equal(rows[0].detail.indexOf("Sit-out"), -1);
    assert.equal(rows[1].status, "Сессия закрыта");
    assert.equal(rows[2].status, "Сканирует");
    assert.equal(rows[3].status, "Сессия закрыта");
    assert.match(rows[3].detail, /сессии/i);
  });
});
