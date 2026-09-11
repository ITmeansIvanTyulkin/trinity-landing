/**
 * Parse a user-uploaded portfolio file (CSV / TSV / TXT / table rows)
 * into position drafts. Excel and PDF are converted to tables/text by the page.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TrinityInvestImport = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CLASS_KEYS = [
    "акции",
    "облигации",
    "ETF",
    "крипто",
    "кэш",
    "валюта",
    "золото — слитки",
    "золото — монеты",
    "золото — бумажное",
    "драгметаллы",
    "forex",
    "опционы",
    "фьючерсы",
    "фонды",
    "сырьё",
    "депозиты",
    "недвижимость",
    "автомобиль",
    "private equity",
    "структурные продукты",
  ];

  function normHead(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/["'«»]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseAmount(raw) {
    if (raw == null || raw === "") return null;
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    let s = String(raw).trim();
    if (!s || /^[-—–]+$/.test(s)) return null;
    s = s.replace(/\u00a0/g, " ");
    const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
    s = s.replace(/[()]/g, "");
    let mul = 1;
    if (/млн|million|mm\b/i.test(s)) mul = 1e6;
    else if (/млрд|billion/i.test(s)) mul = 1e9;
    else if (/тыс|тысяч|k\b/i.test(s)) mul = 1e3;
    s = s.replace(/[₽$€¥£a-zа-яё%]/gi, "");
    s = s.replace(/\s+/g, "");
    if (s.indexOf(",") >= 0 && s.indexOf(".") >= 0) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if ((s.match(/,/g) || []).length === 1 && /,\d{1,2}$/.test(s)) {
      s = s.replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    const v = n * mul;
    return neg ? -Math.abs(v) : v;
  }

  function detectCurrency(text) {
    const s = String(text || "");
    if (/\$|usd|доллар/i.test(s)) return "USD";
    if (/€|eur|евро/i.test(s)) return "EUR";
    if (/¥|cny|юан/i.test(s)) return "CNY";
    if (/£|gbp/i.test(s)) return "GBP";
    return "RUB";
  }

  function guessClass(name, ticker) {
    const s = (String(name || "") + " " + String(ticker || "")).toLowerCase();
    if (/ипотек/.test(s)) return "недвижимость";
    if (/авто|машин|bmw|toyota|lada|mercedes|kia|hyundai|volkswagen/.test(s)) return "автомобиль";
    if (/квартир|апартам|дом\b|участок|недвиж|офис|дача/.test(s)) return "недвижимость";
    if (/золот|gold|глд|слит/.test(s)) return "золото — бумажное";
    if (/bitcoin|btc|eth|крипт|usdt/.test(s)) return "крипто";
    if (/etf|бпиф|fund/.test(s)) return "ETF";
    if (/облиг|офз|bond|купон/.test(s)) return "облигации";
    if (/фьюч|futur/.test(s)) return "фьючерсы";
    if (/опцион/.test(s)) return "опционы";
    if (/депозит|вклад|накопит/.test(s)) return "депозиты";
    if (/usd|eur|cny|доллар|евро|юан|валют/.test(s)) return "валюта";
    if (/кэш|cash|налич|расчетн|расчётн/.test(s)) return "кэш";
    if (ticker && /^[A-Z0-9]{3,12}$/.test(String(ticker).toUpperCase())) return "акции";
    return "акции";
  }

  function guessSide(name, cls, explicit) {
    const s = String(explicit || name || "").toLowerCase();
    if (/долг|кредит|ипотек|займ|заем|овердрафт|liab/.test(s)) return "liability";
    if (/актив|собств|asset/.test(s) && !/пассив/.test(s)) return "asset";
    if (cls === "автомобиль" && !/кредит|долг/.test(s)) return "asset";
    return "asset";
  }

  function mapHeader(h) {
    const k = normHead(h);
    if (/^(name|название|имя|инструмент|бумага|эмитент|позиция|описание)$/.test(k) || /наименован/.test(k))
      return "name";
    if (/^(ticker|тикер|код|secid|symbol|isin)$/.test(k)) return "ticker";
    if (/стоим|оценка|balance|value|amount|сумма$|итого|объ[её]м/.test(k) && !/количест/.test(k))
      return "value";
    if (/^qty$|количест|шт\b|штук|quantity/.test(k)) return "qty";
    if (/^price$|цена$|курс$/.test(k) && !/валют/.test(k)) return "price";
    if (/валют|currency|ccy/.test(k)) return "currency";
    if (/класс|class|тип актива|категор/.test(k)) return "asset_class";
    if (/^(side|сторона|тип)$/.test(k) || /долг\/актив|актив\/пассив/.test(k)) return "side";
    if (/доход|плат[её]ж|купон|дивиденд|income|rent/.test(k)) return "income_monthly";
    if (/заметк|коммент|note/.test(k)) return "notes";
    return null;
  }

  function looksLikeHeader(cells) {
    const mapped = cells.map(mapHeader).filter(Boolean);
    return mapped.length >= 2;
  }

  function splitCsvLine(line, sep) {
    const out = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if (ch === sep && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  }

  function detectSep(text) {
    const first = String(text || "")
      .split(/\r?\n/)
      .find((l) => l.trim());
    if (!first) return ",";
    const commas = (first.match(/,/g) || []).length;
    const semis = (first.match(/;/g) || []).length;
    const tabs = (first.match(/\t/g) || []).length;
    if (tabs >= commas && tabs >= semis && tabs > 0) return "\t";
    if (semis > commas) return ";";
    return ",";
  }

  function parseTable(rows) {
    if (!rows || !rows.length) return { rows: [], warning: "В файле нет строк." };
    const cleaned = rows
      .map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? "" : String(c).trim())) : []))
      .filter((r) => r.some((c) => c));
    if (!cleaned.length) return { rows: [], warning: "Пустая таблица." };

    let start = 0;
    let keys = [];
    if (looksLikeHeader(cleaned[0])) {
      keys = cleaned[0].map(mapHeader);
      start = 1;
    }

    const drafts = [];
    for (let i = start; i < cleaned.length; i++) {
      const cells = cleaned[i];
      let obj = {};
      if (keys.length) {
        keys.forEach((k, ix) => {
          if (k) obj[k] = cells[ix];
        });
      } else {
        obj = rowFromLooseCells(cells);
      }
      const draft = toDraft(obj, cells.join(" "));
      if (draft) drafts.push(draft);
    }
    return {
      rows: drafts,
      warning: drafts.length ? "" : "Не нашли ни одной позиции с названием или суммой.",
    };
  }

  function rowFromLooseCells(cells) {
    const obj = {};
    const nums = [];
    cells.forEach((c) => {
      if (/^[A-Z0-9]{3,12}$/.test(c) && !obj.ticker) obj.ticker = c;
      else if (parseAmount(c) != null) nums.push(parseAmount(c));
      else if (c && !obj.name) obj.name = c;
    });
    if (nums.length) obj.value = nums[nums.length - 1];
    return obj;
  }

  function toDraft(obj, blob) {
    const name = String(obj.name || "").trim();
    let ticker = String(obj.ticker || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (!ticker && /^[A-Z0-9]{3,12}$/.test(name.toUpperCase())) ticker = name.toUpperCase();
    let value = parseAmount(obj.value);
    const qty = parseAmount(obj.qty);
    const price = parseAmount(obj.price);
    if ((value == null || value === 0) && qty != null && price != null) value = qty * price;
    if (!name && !ticker) return null;
    if (/^(итого|total|всего|сумма)$/i.test(name)) return null;
    if (value == null) return null;
    const clsRaw = String(obj.asset_class || "").trim();
    const clsHit = CLASS_KEYS.find((k) => normHead(k) === normHead(clsRaw));
    const asset_class = clsHit || guessClass(name, ticker);
    const side = guessSide(name + " " + blob, asset_class, obj.side);
    const currency = /^(RUB|USD|EUR|CNY|GBP)$/i.test(String(obj.currency || ""))
      ? String(obj.currency).toUpperCase()
      : detectCurrency(blob + " " + name);
    const income = parseAmount(obj.income_monthly);
    return {
      side: side,
      asset_class: asset_class,
      name: name || ticker,
      ticker: ticker || null,
      value: Math.abs(value),
      income_monthly: income,
      currency: currency,
      notes: obj.notes ? String(obj.notes).trim() : "",
      include: true,
    };
  }

  function parseCsvText(text) {
    const src = String(text || "").replace(/^\uFEFF/, "");
    const sep = detectSep(src);
    const lines = src.split(/\r?\n/);
    const rows = [];
    lines.forEach((line) => {
      if (!line.trim()) return;
      rows.push(splitCsvLine(line, sep));
    });
    return parseTable(rows);
  }

  function parsePlainText(text) {
    const src = String(text || "").replace(/^\uFEFF/, "");
    if (/[;\t,]/.test(src.split(/\r?\n/).find((l) => l.trim()) || "")) {
      return parseCsvText(src);
    }
    const drafts = [];
    src.split(/\r?\n/).forEach((line) => {
      const t = line.trim();
      if (!t || /^[#;]/.test(t) || /^(итого|total)/i.test(t)) return;
      const m = t.match(/^(.*?)[\s—\-]+(-?\d[\d\s.,]*)\s*(₽|руб|usd|eur|\$|€)?$/i);
      if (!m) return;
      const draft = toDraft(
        {
          name: m[1],
          value: m[2],
          currency: m[3] || "",
        },
        t
      );
      if (draft) drafts.push(draft);
    });
    return {
      rows: drafts,
      warning: drafts.length ? "" : "Не разобрали строки. Нужны вид «Сбер 150000» или таблица с заголовками.",
    };
  }

  const MAX_ROWS = 80;

  function dupKey(d) {
    return [
      d && d.side,
      String((d && d.ticker) || "")
        .trim()
        .toUpperCase(),
      String((d && d.name) || "")
        .trim()
        .toLowerCase(),
      Number(d && d.value),
    ].join("|");
  }

  function filterNew(drafts, existing) {
    const seen = new Set((existing || []).map(dupKey));
    return (drafts || []).filter((d) => {
      const k = dupKey(d);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function capRows(drafts) {
    const list = drafts || [];
    if (list.length <= MAX_ROWS) return { rows: list, truncated: 0 };
    return { rows: list.slice(0, MAX_ROWS), truncated: list.length - MAX_ROWS };
  }

  function rowsFromPdfItems(items) {
    const buckets = new Map();
    (items || []).forEach((it) => {
      const str = String(it.str || "").trim();
      if (!str) return;
      const tr = it.transform || [];
      const y = Math.round((tr[5] || 0) / 2) * 2;
      const x = Number(tr[4]) || 0;
      const width = Number(it.width) || str.length * 5;
      if (!buckets.has(y)) buckets.set(y, []);
      buckets.get(y).push({ x: x, str: str, width: width });
    });
    return Array.from(buckets.entries())
      .sort((a, b) => b[0] - a[0])
      .map((entry) => {
        const parts = entry[1].sort((a, b) => a.x - b.x);
        const cells = [];
        let cur = "";
        let lastRight = null;
        parts.forEach((p) => {
          if (lastRight != null && p.x - lastRight > 14) {
            if (cur.trim()) cells.push(cur.trim());
            cur = p.str;
          } else {
            cur = cur ? cur + " " + p.str : p.str;
          }
          lastRight = p.x + p.width;
        });
        if (cur.trim()) cells.push(cur.trim());
        return cells;
      })
      .filter((r) => r.length);
  }

  function parsePdfLayout(items) {
    const table = parseTable(rowsFromPdfItems(items));
    if (table.rows.length) return table;
    const text = (items || [])
      .map((it) => String(it.str || "").trim())
      .filter(Boolean)
      .join("\n");
    return parsePlainText(text);
  }

  return {
    CLASS_KEYS: CLASS_KEYS,
    MAX_ROWS: MAX_ROWS,
    parseAmount: parseAmount,
    parseTable: parseTable,
    parseCsvText: parseCsvText,
    parsePlainText: parsePlainText,
    parsePdfLayout: parsePdfLayout,
    rowsFromPdfItems: rowsFromPdfItems,
    guessClass: guessClass,
    guessSide: guessSide,
    dupKey: dupKey,
    filterNew: filterNew,
    capRows: capRows,
  };
});
