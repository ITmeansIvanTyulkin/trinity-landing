const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Fetch = require("../js/lib/invest-fund-fetch.js");

const SBER_HTML = `
<table class="simple-little-table financials">
<tr class="header_row"><th>Сбербанк</th><td></td><td>2022</td><td>2023</td><td>2024</td></tr>
<tr><td>Чистый операц доход , млрд руб</td><td></td><td>2055</td><td>3428</td><td>3819</td></tr>
<tr><td>Создание резервов , млрд руб</td><td></td><td>450.1</td><td>235.4</td><td>413</td></tr>
<tr><td>Кредитный портфель , млрд руб</td><td></td><td>29373</td><td>37558</td><td>42931</td></tr>
<tr><td>Депозиты , млрд руб</td><td></td><td>29876</td><td>36693</td><td>44627</td></tr>
<tr><td>Дост.осн капитала , %</td><td></td><td>15.1%</td><td>13.8%</td><td>12.4%</td></tr>
<tr><td>Капитализация , млрд руб</td><td></td><td>3189</td><td>6132</td><td>6305</td></tr>
</table>
<p>файл <a href="https://www.e-disclosure.ru/portal/FileLoad.ashx?Fileid=1912839">МСФО</a></p>
`;

const LKOH_HTML = `
<table class="simple-little-table financials">
<tr class="header_row"><th>ЛУКОЙЛ</th><td>2021</td><td>2023</td><td>2024</td></tr>
<tr><td>Выручка , млрд руб</td><td>9431</td><td>7928</td><td>4421</td></tr>
<tr><td>Операционная прибыль , млрд руб</td><td>978.9</td><td>1428</td><td>1057</td></tr>
<tr><td>EBITDA , млрд руб</td><td>1404</td><td>2005</td><td>1390</td></tr>
<tr><td>FCF , млрд руб</td><td>693.6</td><td>964.0</td><td>979.0</td></tr>
<tr><td>Долг , млрд руб</td><td>758.0</td><td>396.0</td><td>380.0</td></tr>
<tr><td>Чистые активы , млрд руб</td><td>4123</td><td>4523</td><td>4600</td></tr>
<tr><td>Чистый долг , млрд руб</td><td>80</td><td>-784</td><td>-1146</td></tr>
</table>
`;

describe("TrinityInvestFundFetch", () => {
  it("maps Sber-like Smart-Lab HTML to bank Excel fields (latest two years)", () => {
    const packed = Fetch.toFields(Fetch.parseSmartLab(SBER_HTML));
    assert.equal(packed.sector, "fin");
    assert.equal(packed.years.currYear, 2024);
    assert.equal(packed.years.prevYear, 2023);
    assert.equal(packed.fields.noi_curr, 3819);
    assert.equal(packed.fields.noi_prev, 3428);
    assert.equal(packed.fields.loans_prev, 37558);
    assert.equal(packed.fields.reserves_prev, 235.4);
    assert.ok(Math.abs(packed.fields.car_prev - 0.138) < 1e-6);
    assert.equal(packed.fields.capitalization, undefined);
  });

  it("maps LKOH-like HTML to non-fin fields and ignores net debt", () => {
    const packed = Fetch.toFields(Fetch.parseSmartLab(LKOH_HTML));
    assert.equal(packed.sector, "nonfin");
    assert.equal(packed.fields.revenue_curr, 4421);
    assert.equal(packed.fields.revenue_prev, 7928);
    assert.equal(packed.fields.fcf_prev, 964);
    assert.equal(packed.fields.debt_curr, 380);
    assert.equal(packed.fields.equity_curr, 4600);
  });

  it("extracts e-disclosure FileLoad links", () => {
    const urls = Fetch.extractEdisclosureFiles(SBER_HTML);
    assert.ok(urls.some((u) => /Fileid=1912839/.test(u)));
  });

  it("parses thousand-spaced markdown numbers", () => {
    const nums = Fetch.parseNumberSequence("2 501 2 055 3 428");
    assert.deepEqual(nums, [2501, 2055, 3428]);
  });

  it("does not treat capitalization as equity", () => {
    assert.equal(Fetch.matchRowKey("Капитализация , млрд руб"), null);
    assert.equal(Fetch.matchRowKey("Чистые активы , млрд руб"), "equity");
    assert.equal(Fetch.matchRowKey("Чистый долг , млрд руб"), null);
  });
});
