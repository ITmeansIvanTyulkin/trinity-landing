const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Imp = require("../js/lib/invest-import.js");

describe("TrinityInvestImport", () => {
  it("parses Russian CSV with headers", () => {
    const csv = "Название;Тикер;Стоимость;Валюта\nСбербанк;SBER;150 000;RUB\nЕвро;EUR;2000;EUR\n";
    const r = Imp.parseCsvText(csv);
    assert.equal(r.rows.length, 2);
    assert.equal(r.rows[0].ticker, "SBER");
    assert.equal(r.rows[0].value, 150000);
    assert.equal(r.rows[0].side, "asset");
    assert.equal(r.rows[1].currency, "EUR");
  });

  it("multiplies qty × price when no value column", () => {
    const csv = "Тикер,Количество,Цена\nGAZP,100,92.5\n";
    const r = Imp.parseCsvText(csv);
    assert.equal(r.rows[0].value, 9250);
    assert.equal(r.rows[0].ticker, "GAZP");
  });

  it("does not treat an owned car as debt", () => {
    const csv = "Название,Стоимость\nАвтомобиль Toyota,2300000\n";
    const r = Imp.parseCsvText(csv);
    assert.equal(r.rows[0].asset_class, "автомобиль");
    assert.equal(r.rows[0].side, "asset");
  });

  it("marks a mortgage line as liability", () => {
    const csv = "Название;Стоимость;Тип\nИпотека;5900000;долг\n";
    const r = Imp.parseCsvText(csv);
    assert.equal(r.rows[0].side, "liability");
    assert.equal(r.rows[0].asset_class, "ипотека");
  });

  it("guesses commercial property and a bank loan", () => {
    assert.equal(Imp.guessClass("Офис на Тверской", ""), "недвижимость коммерческая");
    assert.equal(Imp.guessClass("Кредит в банке", ""), "кредит");
    assert.equal(Imp.guessSide("Кредит в банке", "кредит"), "liability");
  });

  it("turns an annual deposit rate into monthly income", () => {
    const csv = "Название;Стоимость;Ставка годовых;Валюта\nДепозит в банке;1000000;20%;RUB\n";
    const r = Imp.parseCsvText(csv);
    assert.equal(r.rows[0].asset_class, "депозиты");
    assert.equal(r.rows[0].yield_annual_pct, 20);
    assert.equal(r.rows[0].income_monthly, 16666.67);
  });

  it("converts yield and monthly income both ways", () => {
    assert.equal(Imp.monthlyFromYield(1000000, 20), 16666.67);
    assert.equal(Imp.yieldFromMonthly(1000000, 16666.67), 20);
  });

  it("reads notepad lines", () => {
    const r = Imp.parsePlainText("SBER 150000\nКвартира — 5 900 000 ₽\n");
    assert.equal(r.rows.length, 2);
    assert.equal(r.rows[0].ticker, "SBER");
    assert.equal(r.rows[1].value, 5900000);
    assert.equal(r.rows[1].asset_class, "недвижимость");
  });

  it("parses millions suffix", () => {
    assert.equal(Imp.parseAmount("1,5 млн"), 1500000);
    assert.equal(Imp.parseAmount("200 тыс"), 200000);
  });

  it("skips duplicates already in the portfolio", () => {
    const fresh = Imp.filterNew(
      [
        { side: "asset", ticker: "SBER", name: "Сбер", value: 150000 },
        { side: "asset", ticker: "GAZP", name: "Газпром", value: 80000 },
      ],
      [{ side: "asset", ticker: "SBER", name: "Сбер", value: 150000 }]
    );
    assert.equal(fresh.length, 1);
    assert.equal(fresh[0].ticker, "GAZP");
  });

  it("rebuilds table rows from PDF text items", () => {
    const items = [
      { str: "Тикер", transform: [1, 0, 0, 1, 10, 200], width: 40 },
      { str: "Сумма", transform: [1, 0, 0, 1, 80, 200], width: 40 },
      { str: "SBER", transform: [1, 0, 0, 1, 10, 180], width: 40 },
      { str: "150000", transform: [1, 0, 0, 1, 80, 180], width: 50 },
    ];
    const r = Imp.parsePdfLayout(items);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].ticker, "SBER");
    assert.equal(r.rows[0].value, 150000);
  });

  it("drops total rows", () => {
    const r = Imp.parseCsvText("Название;Стоимость\nSBER;100\nИтого;100\n");
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].ticker, "SBER");
  });
});
