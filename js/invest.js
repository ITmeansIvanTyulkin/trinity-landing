(() => {
  const Fund = window.TrinityInvestFundamentals;
  const Pipe = window.TrinityInvestPipeline;
  const FundFetch = window.TrinityInvestFundFetch;
  const Imp = window.TrinityInvestImport;
  const Auth = window.TrinityCabinetAuth;

  const ASSET_CLASSES = [
    ["акции", "Акции"],
    ["облигации", "Облигации"],
    ["ETF", "ETF"],
    ["крипто", "Крипто"],
    ["кэш", "Кэш"],
    ["валюта", "Валюта"],
    ["золото — слитки", "Золото — слитки"],
    ["золото — монеты", "Золото — монеты"],
    ["золото — бумажное", "Золото — бумажное"],
    ["драгметаллы", "Драгметаллы"],
    ["forex", "Forex"],
    ["опционы", "Опционы"],
    ["фьючерсы", "Фьючерсы"],
    ["фонды", "Фонды"],
    ["сырьё", "Сырьё"],
    ["депозиты", "Депозиты"],
    ["недвижимость", "Недвижимость"],
    ["автомобиль", "Автомобиль"],
    ["private equity", "Private equity"],
    ["структурные продукты", "Структурные продукты"],
  ];

  const CHART_COLORS = [
    "#0b7a66",
    "#2a3a44",
    "#c4a35a",
    "#7eb6d4",
    "#1f7a45",
    "#b7791f",
    "#6a7680",
    "#1e2a32",
    "#096556",
    "#8a6d2f",
    "#3d6a82",
    "#c53030",
  ];

  const state = {
    user: null,
    profile: null,
    positions: [],
    deskLegs: [],
    deskNote: "",
    lastResult: null,
    gold: null,
    fx: {},
    editingId: null,
    watchlist: [],
    watchRemote: false,
    watchBusy: false,
    filters: { side: "", asset_class: "", source: "" },
    importFileName: "",
  };

  function cfg() {
    return window.CABINET_CONFIG || {};
  }

  function sb() {
    return Auth && Auth.getClient ? Auth.getClient() : null;
  }

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  const TROY_OZ_GRAMS = 31.1034768;

  function fmtPct(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    return Number(n).toFixed(1).replace(".", ",") + "%";
  }

  function monthlyIncome(p) {
    const n = Number(p && p.income_monthly);
    return Number.isFinite(n) ? n : 0;
  }

  function goldScaleUnits(valueRub, goldRubPerGram) {
    const oz = Number(goldRubPerGram) * TROY_OZ_GRAMS;
    if (!Number.isFinite(valueRub) || !Number.isFinite(oz) || oz <= 0) return null;
    return (valueRub / oz) * 100;
  }

  function isGoldClass(p) {
    return String((p && p.asset_class) || "").indexOf("золото") === 0;
  }

  function posRubThen(p) {
    if (!p) return null;
    const nowRub = posRub(p);
    if (nowRub == null) return null;
    if (isGoldClass(p) && state.gold && state.gold.perGram && state.gold.monthAgo) {
      return nowRub * (Number(state.gold.monthAgo) / Number(state.gold.perGram));
    }
    const ccy = positionCcy(p);
    if (ccy === "RUB" || ccy === "RUR") return Number(p.value) || 0;
    const q = fxQuote(ccy);
    if (!q || !Number.isFinite(q.monthAgo) || q.monthAgo <= 0) return null;
    const amt = Number(p.value);
    if (!Number.isFinite(amt)) return null;
    return amt * q.monthAgo;
  }

  function netRubNow() {
    return mergedPositions().reduce((s, p) => {
      const rub = posRub(p);
      if (rub == null) return s;
      return s + (p.side === "liability" ? -rub : rub);
    }, 0);
  }

  function netRubThen() {
    let ok = true;
    const n = mergedPositions().reduce((s, p) => {
      if (!Number(p.value)) return s;
      const rub = posRubThen(p);
      if (rub == null) {
        ok = false;
        return s;
      }
      return s + (p.side === "liability" ? -rub : rub);
    }, 0);
    return ok ? n : null;
  }

  function goldVsCapital() {
    const g = state.gold;
    if (!g || !g.perGram || !g.monthAgo) return null;
    const nowRub = netRubNow();
    const thenRub = netRubThen();
    const nowU = goldScaleUnits(nowRub, g.perGram);
    const thenU = goldScaleUnits(thenRub, g.monthAgo);
    if (nowU == null || thenU == null || Math.abs(thenU) < 0.0001) return null;
    const pct = ((nowU - thenU) / Math.abs(thenU)) * 100;
    let tone = "flat";
    let verb = "сохранился";
    if (pct > 0.8) {
      tone = "up";
      verb = "вырос";
    } else if (pct < -0.8) {
      tone = "down";
      verb = "потерял";
    }
    return {
      tone: tone,
      verb: verb,
      pct: pct,
      nowU: nowU,
      thenU: thenU,
      perGram: g.perGram,
      monthAgo: g.monthAgo,
      asOf: g.asOf,
    };
  }

  function paintGoldNote() {
    const el = $("[data-chart-note]");
    const vs = goldVsCapital();
    if (!el) return;
    el.removeAttribute("data-tone");
    if (!vs) {
      el.textContent =
        state.gold && state.gold.error
          ? "Золотую котировку MOEX не сняли — стандарт временно недоступен."
          : "Золотой стандарт: ждём GLDRUB 30 дней, чтобы сравнить капитал.";
      return;
    }
    el.setAttribute("data-tone", vs.tone);
    const pct =
      (vs.pct > 0 ? "+" : vs.pct < 0 ? "−" : "") +
      Math.abs(vs.pct).toFixed(1).replace(".", ",") +
      "%";
    el.textContent =
      "К золоту за 30 дней: " +
      pct +
      " — капитал " +
      vs.verb +
      ". Шкала " +
      vs.nowU.toFixed(1).replace(".", ",") +
      " · GLDRUB " +
      vs.perGram.toFixed(0) +
      " ₽/г. Не слитки и не рекомендация.";
  }

  const FX_SECS = {
    USD: "USD000UTSTOM",
    EUR: "EUR_RUB__TOM",
    CNY: "CNYRUB_TOM",
  };

  function positionCcy(p) {
    const declared = String((p && p.currency) || "")
      .trim()
      .toUpperCase();
    if (declared === "RUR") return "RUB";
    if (declared && declared !== "RUB") return declared;
    const n = String((p && p.name) || "").toLowerCase();
    if (/доллар|\busd\b|\$/.test(n)) return "USD";
    if (/евро|\beur\b|euro|€/.test(n)) return "EUR";
    if (/юан|\bcny\b|rmb/.test(n)) return "CNY";
    return "RUB";
  }

  function fxQuote(ccy) {
    const c = String(ccy || "").toUpperCase();
    return (state.fx && state.fx[c]) || null;
  }

  function fxRate(ccy) {
    const c = String(ccy || "RUB").toUpperCase();
    if (c === "RUB" || c === "RUR") return 1;
    const q = fxQuote(c);
    if (!q) return null;
    const n = Number(q.last != null ? q.last : q);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function toRub(amount, ccy) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return null;
    const rate = fxRate(ccy);
    if (rate == null) return null;
    return n * rate;
  }

  function posRub(p) {
    return toRub(p && p.value, positionCcy(p));
  }

  function incomeRub(p) {
    const inc = monthlyIncome(p);
    if (!inc) return 0;
    const rub = toRub(inc, positionCcy(p));
    return rub == null ? 0 : rub;
  }

  function isVehicle(p) {
    return String((p && p.asset_class) || "") === "автомобиль";
  }

  function vehicleEarns(p) {
    const blob = String((p && p.name) || "") + " " + String((p && p.notes) || "");
    return /такси|аренд|uber|яндекс/i.test(blob);
  }

  function isCostingOwnedVehicle(p) {
    return p && p.side === "asset" && isVehicle(p) && !vehicleEarns(p);
  }

  function flowInRub(p) {
    const n = Math.abs(incomeRub(p));
    if (!n) return 0;
    if (p.side === "liability" || isCostingOwnedVehicle(p)) return 0;
    return n;
  }

  function flowOutRub(p) {
    const n = Math.abs(incomeRub(p));
    if (!n) return 0;
    if (p.side === "liability" || isCostingOwnedVehicle(p)) return n;
    return 0;
  }

  function vehicleLiabilities() {
    return (state.positions || []).filter(
      (p) => p.side === "liability" && isVehicle(p) && p.id && String(p.id).indexOf("desk-") !== 0
    );
  }

  async function reclassVehicleLiabilities() {
    const cars = vehicleLiabilities();
    const client = sb();
    if (!client || !cars.length) return;
    for (let i = 0; i < cars.length; i++) {
      const { error } = await client
        .from("invest_positions")
        .update({ side: "asset", updated_at: new Date().toISOString() })
        .eq("id", cars[i].id);
      if (error) console.warn("invest_positions", error.message);
    }
    await loadPositions();
  }

  function fxPnl(p) {
    const ccy = positionCcy(p);
    if (!p || ccy === "RUB" || ccy === "RUR") return null;
    const q = fxQuote(ccy);
    const amt = Number(p.value);
    if (!q || !Number.isFinite(amt) || !Number.isFinite(q.last)) return null;
    const then = q.monthAgo != null ? q.monthAgo : q.prev;
    const period = q.monthAgo != null ? "30 дн" : "день";
    if (!Number.isFinite(then) || then <= 0) return null;
    const sign = p.side === "liability" ? -1 : 1;
    const pnl = sign * amt * (q.last - then);
    const nowRub = toRub(amt, ccy);
    return {
      pnl: pnl,
      last: q.last,
      then: then,
      period: period,
      ccy: ccy,
      pct: nowRub ? (pnl / Math.abs(nowRub)) * 100 : null,
    };
  }

  function fmtSignedRub(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    const abs = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(Math.abs(n))) + " ₽";
    if (n > 0.49) return "+" + abs;
    if (n < -0.49) return "−" + abs;
    return abs;
  }

  function fmtMoney(n, ccy) {
    const cur = String(ccy || "RUB").toUpperCase();
    const digits = cur === "RUB" || cur === "RUR" ? 0 : 2;
    const num = new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(Number(n) || 0);
    if (cur === "USD") return num + " $";
    if (cur === "EUR") return num + " €";
    if (cur === "CNY") return num + " ¥";
    if (cur === "GBP") return num + " £";
    return num + " ₽";
  }

  function fmtShare(pct) {
    if (!Number.isFinite(pct) || pct <= 0) return "0%";
    if (pct < 0.05) return "<0,1%";
    if (pct < 10) return pct.toFixed(1).replace(".", ",") + "%";
    return Math.round(pct) + "%";
  }

  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function classLabel(key) {
    const raw = String(key || "");
    if (raw.indexOf("desk · ") === 0) return "Desk · " + raw.slice(7);
    const hit = ASSET_CLASSES.find((p) => p[0] === raw);
    return hit ? hit[1] : raw;
  }

  function fmtRub(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n)) + " ₽";
  }

  function setText(sel, text) {
    const el = $(sel);
    if (el) el.textContent = text;
  }

  function showView(name) {
    const id = name || "overview";
    $$("[data-invest-view]").forEach((el) => {
      el.hidden = el.getAttribute("data-invest-view") !== id;
    });
    $$("[data-invest-nav]").forEach((a) => {
      a.classList.toggle("is-active", a.getAttribute("data-invest-nav") === id);
    });
    if (location.hash.replace("#", "") !== id) {
      history.replaceState(null, "", "#" + id);
    }
    if (id === "report" && state.lastResult) {
      requestAnimationFrame(() => applyChartSurface(state.lastResult));
    }
  }

  function currentView() {
    const h = (location.hash || "#overview").replace("#", "");
    const known = ["overview", "portfolio", "watchlist", "analyze", "report", "profile"];
    return known.indexOf(h) >= 0 ? h : "overview";
  }

  function fillSelect(sel, items, withEmpty, emptyLabel) {
    if (!sel) return;
    const keep = sel.value;
    sel.innerHTML = withEmpty ? '<option value="">' + (emptyLabel || "Все классы") + "</option>" : "";
    items.forEach(([id, label]) => {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = label;
      sel.appendChild(o);
    });
    if (keep) sel.value = keep;
  }

  function readForm(form) {
    const fd = new FormData(form);
    const o = {};
    fd.forEach((v, k) => {
      o[k] = typeof v === "string" ? v.trim() : v;
    });
    return o;
  }

  function fillRiskOptions() {
    const opts = Fund.RISK_OPTIONS;
    Object.keys(opts).forEach((field) => {
      const host = $('[data-risk-opts="' + field + '"]');
      if (!host) return;
      host.innerHTML = opts[field]
        .map(
          (o) =>
            '<label class="cabinet-check"><input type="radio" name="' +
            field +
            '" value="' +
            o.id +
            '" required /> <span>' +
            o.label +
            "</span></label>"
        )
        .join("");
    });
  }

  async function loadProfile() {
    const client = sb();
    if (!client || !state.user) return;
    const { data, error } = await client
      .from("invest_risk_profiles")
      .select("*")
      .eq("user_id", state.user.id)
      .maybeSingle();
    if (error) {
      console.warn("invest_risk_profiles", error.message);
      return;
    }
    state.profile = data || null;
    renderRisk();
    renderOverview();
  }

  async function loadPositions() {
    const client = sb();
    if (!client || !state.user) return;
    const { data, error } = await client
      .from("invest_positions")
      .select("*")
      .eq("user_id", state.user.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("invest_positions", error.message);
      const msg = $("[data-pos-form-msg]");
      if (msg) {
        msg.textContent =
          error.message && /relation|schema cache|does not exist/i.test(error.message)
            ? "Таблицы invest_* ещё не созданы. Выполните supabase/invest.sql в SQL Editor."
            : error.message;
      }
      return;
    }
    state.positions = data || [];
    renderPortfolio();
    renderOverview();
  }

  async function loadDesk() {
    const base = String(cfg().imoexBase || "").replace(/\/$/, "");
    if (!base) {
      state.deskLegs = [];
      state.deskNote = "Деск не задан (imoexBase пуст) — сегмента desk нет, без мока.";
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    try {
      const res = await fetch(base + "/api/paper/journal", { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) {
        state.deskLegs = [];
        state.deskNote = "Деск " + base + " ответил " + res.status + " — сегмент desk пропущен.";
        return;
      }
      const journal = await res.json();
      state.deskLegs = Pipe.deskLegsFromJournal(journal);
      state.deskNote =
        "Desk read-only: " +
        state.deskLegs.length +
        " открытых ног с " +
        base +
        "/api/paper/journal.";
    } catch {
      clearTimeout(t);
      state.deskLegs = [];
      state.deskNote = "IMOEX недоступен из браузера (" + base + "). Desk-сегмента нет.";
    }
  }

  async function fetchSeltQuote(secid) {
    const json = await Pipe.fetchIssJson(
      "https://iss.moex.com/iss/engines/currency/markets/selt/securities/" +
        encodeURIComponent(secid) +
        ".json?iss.meta=off&iss.only=securities,marketdata",
      {
        issReader: cfg().issReader,
        timeoutMs: 4000,
        readerTimeoutMs: 18000,
      }
    );
    const secs = Pipe.parseIssTable(json.securities);
    const mds = Pipe.parseIssTable(json.marketdata);
    const byBoard = {};
    secs.forEach((s) => {
      byBoard[s.BOARDID] = Object.assign({}, s, byBoard[s.BOARDID]);
    });
    mds.forEach((m) => {
      byBoard[m.BOARDID] = Object.assign({}, byBoard[m.BOARDID] || {}, m);
    });
    const prefer = ["CETS", "CNGD"];
    const rows = Object.keys(byBoard).map((k) => byBoard[k]);
    rows.sort((a, b) => {
      const ia = prefer.indexOf(a.BOARDID);
      const ib = prefer.indexOf(b.BOARDID);
      return (ia === -1 ? 9 : ia) - (ib === -1 ? 9 : ib);
    });
    const priced = rows.find((r) => {
      const last = Number(r.LAST || r.MARKETPRICE || r.WAPRICE || r.PREVPRICE);
      return Number.isFinite(last) && last > 0;
    });
    if (!priced) throw new Error("нет цены " + secid);
    const last = Number(priced.LAST || priced.MARKETPRICE || priced.WAPRICE || priced.PREVPRICE);
    const prev = Number(priced.PREVPRICE);
    return {
      last: last,
      prev: Number.isFinite(prev) && prev > 0 ? prev : null,
      asOf: priced.UPDATETIME || priced.SYSTIME || priced.TIME || priced.PREVDATE || "",
      board: priced.BOARDID,
    };
  }

  async function fetchSeltMonthAgo(secid, board) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 40);
    const from = d.toISOString().slice(0, 10);
    const json = await Pipe.fetchIssJson(
      "https://iss.moex.com/iss/engines/currency/markets/selt/boards/" +
        encodeURIComponent(board || "CETS") +
        "/securities/" +
        encodeURIComponent(secid) +
        "/candles.json?iss.meta=off&interval=24&from=" +
        from,
      {
        issReader: cfg().issReader,
        timeoutMs: 4000,
        readerTimeoutMs: 18000,
      }
    );
    const rows = Pipe.parseIssTable(json.candles);
    if (!rows.length) return null;
    const target = new Date();
    target.setUTCDate(target.getUTCDate() - 30);
    const t = target.toISOString().slice(0, 10);
    let picked = null;
    rows.forEach((r) => {
      const day = String(r.begin || "").slice(0, 10);
      if (day && day <= t) picked = r;
    });
    const close = Number((picked || rows[0]).close);
    return Number.isFinite(close) && close > 0 ? close : null;
  }

  async function loadMarketQuotes() {
    if (!Pipe || typeof Pipe.fetchIssJson !== "function") {
      state.gold = { error: "no pipeline" };
      return;
    }
    const jobs = [
      (async () => {
        const q = await fetchSeltQuote("GLDRUB_TOM");
        let monthAgo = null;
        try {
          monthAgo = await fetchSeltMonthAgo("GLDRUB_TOM", q.board);
        } catch (_) {}
        state.gold = {
          perGram: q.last,
          monthAgo: monthAgo,
          asOf: q.asOf,
          board: q.board,
        };
      })().catch((err) => {
        state.gold = { error: err && err.message ? err.message : String(err) };
      }),
    ];
    Object.keys(FX_SECS).forEach((ccy) => {
      jobs.push(
        (async () => {
          const q = await fetchSeltQuote(FX_SECS[ccy]);
          let monthAgo = null;
          try {
            monthAgo = await fetchSeltMonthAgo(FX_SECS[ccy], q.board);
          } catch (_) {}
          state.fx[ccy] = {
            last: q.last,
            prev: q.prev,
            monthAgo: monthAgo,
            asOf: q.asOf,
            board: q.board,
          };
          state.fxAsOf = q.asOf;
        })().catch(() => {})
      );
    });
    await Promise.all(jobs);
  }

  function mergedPositions() {
    const owned = (state.positions || []).filter((p) => !isWatchStub(p));
    return owned.concat(state.deskLegs);
  }

  function isWatchStub(p) {
    if (!p) return false;
    const notes = String(p.notes || "");
    return Number(p.value) === 0 && /watchlist/i.test(notes);
  }

  function renderRisk() {
    const p = state.profile;
    const result = $("[data-risk-result]");
    const wrap = $("[data-risk-form-wrap]");
    if (p && p.completed_at) {
      if (result) result.hidden = false;
      setText("[data-risk-level-out]", Fund.riskLevelLabel(p.risk_level));
      setText("[data-risk-warn-out]", p.warn_drawdown_pct + "%");
      setText(
        "[data-risk-completed]",
        "Сохранено " + new Date(p.completed_at).toLocaleString("ru-RU")
      );
      if (wrap) wrap.hidden = true;
    } else {
      if (result) result.hidden = true;
      if (wrap) wrap.hidden = false;
    }
  }

  function fmtGrams(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    const g = Number(n);
    const digits = g >= 100 ? 0 : 1;
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(g) + " г";
  }

  function overviewActions(ctx) {
    const acts = [];
    if (!state.profile || !state.profile.completed_at) {
      acts.push({
        href: "#profile",
        title: "Пройти анкету",
        body: "Без рамки просадки обзор не знает, какая качка для вас уже слишком.",
      });
    }
    if (!ctx.aSum) {
      acts.push({
        href: "#portfolio",
        title: "Собрать портфель",
        body: "Добавьте то, что уже есть: квартиру, кэш, бумаги. Тогда круг и золото оживут.",
      });
    }
    const carAsDebt = mergedPositions().filter(
      (p) => p.side === "liability" && isVehicle(p) && (posRub(p) || 0) > 0
    );
    if (carAsDebt.length) {
      const sum = carAsDebt.reduce((s, p) => s + (posRub(p) || 0), 0);
      acts.push({
        href: "#portfolio",
        title: "Машина записана как долг",
        fix: "cars",
        body:
          fmtRub(sum) +
          " сейчас вычитаются из капитала, как будто вы их должны. Если авто ваше — нажмите: сумма войдёт в имущество. Кредит, если остался, добавьте отдельно на остаток долга, не на цену машины.",
      });
    }
    const stale = (state.watchlist || []).filter((w) => !w.last_run_at);
    const ready = (state.watchlist || []).filter((w) => w.last_verdict === "invest");
    if (ready.length) {
      acts.push({
        href: "#watchlist",
        title: "Вход ближе: " + ready.map((w) => w.ticker).join(", "),
        body: "Это всё ещё не покупка. Откройте отчёт и решите сами.",
      });
    } else if (stale.length) {
      acts.push({
        href: "#watchlist",
        title: "Обновить watch list",
        body: stale.map((w) => w.ticker).join(", ") + " ждут свежего разбора.",
      });
    } else if ((state.watchlist || []).length) {
      acts.push({
        href: "#watchlist",
        title: "Подождать более тихий вход",
        body: "В списке " + state.watchlist.length + " бумаг без позиции. Обновляйте, когда будет время.",
      });
    }
    if (ctx.aSum > 0 && ctx.lSum / ctx.aSum > 0.5) {
      acts.push({
        href: "#portfolio",
        title: "Долги тяжелы",
        body: "Долги больше половины активов. Имеет смысл глянуть, что можно закрыть или не раздувать.",
      });
    }
    if (mergedPositions().some((p) => Number(p.value) > 0 && posRub(p) == null)) {
      acts.push({
        href: "#portfolio",
        title: "Валюта без курса",
        body: "Есть сумма не в рублях, которую Мосбиржа сейчас не перевела. В круге её нет.",
      });
    }
    if (state.lastResult && state.lastResult.verdict === "skip") {
      acts.push({
        href: "#report",
        title: "Последний разбор — отойти",
        body: state.lastResult.ticker + ": идея сейчас не рабочая. Можно оставить в watch list.",
      });
    }
    if (!acts.length) {
      acts.push({
        href: "#analyze",
        title: "Разобрать тикер",
        body: "Картина капитала собрана. Если появилась мысль — снимите рынок и прочитайте отчёт.",
      });
    }
    return acts.slice(0, 4);
  }

  function renderOverviewWatch() {
    const host = $("[data-ov-watch]");
    if (!host) return;
    const rows = (state.watchlist || []).slice(0, 4);
    if (!rows.length) {
      host.innerHTML =
        '<p class="invest-ov-watch-empty">Список пуст. Разберите тикер и нажмите «Добавить в watch list» — бумага не попадёт в портфель, пока вы её не купите.</p>';
      return;
    }
    host.innerHTML = rows
      .map((w) => {
        const ready = w.last_verdict === "invest";
        const price =
          w.last_price != null && Number.isFinite(Number(w.last_price))
            ? Number(w.last_price).toFixed(2).replace(".", ",") + " ₽"
            : "нет цены";
        return (
          '<button type="button" class="invest-ov-watch-card" data-ov-open="' +
          escHtml(w.ticker) +
          '" data-ready="' +
          (ready ? "1" : "0") +
          '"><div><strong>' +
          escHtml(w.ticker) +
          " · " +
          escHtml(w.name || w.ticker) +
          "</strong><em>" +
          escHtml((w.last_lead || "Нажмите, чтобы открыть отчёт").slice(0, 140)) +
          '</em></div><div><span class="invest-status-pill">' +
          escHtml(verdictRu(w.last_verdict)) +
          "</span><p class=\"cab-meta mono\">" +
          escHtml(price) +
          "</p></div></button>"
        );
      })
      .join("");
  }

  function renderOverview() {
    const p = state.profile;
    const all = mergedPositions();
    const assets = all.filter((x) => x.side === "asset");
    const liab = all.filter((x) => x.side === "liability");
    const aSum = assets.reduce((s, x) => s + (posRub(x) || 0), 0);
    const lSum = liab.reduce((s, x) => s + (posRub(x) || 0), 0);
    const net = aSum - lSum;
    const inFlow = all.reduce((s, x) => s + flowInRub(x), 0);
    const outFlow = all.reduce((s, x) => s + flowOutRub(x), 0);
    const netFlow = inFlow - outFlow;
    const fxNet = all.reduce((s, x) => {
      const f = fxPnl(x);
      return s + (f ? f.pnl : 0);
    }, 0);
    const vs = goldVsCapital();
    const g = state.gold;
    const grams = g && g.perGram ? net / Number(g.perGram) : null;

    setText("[data-ov-risk]", p ? Fund.riskLevelLabel(p.risk_level) : "Не задан");
    setText("[data-ov-warn]", p && p.warn_drawdown_pct != null ? p.warn_drawdown_pct + "%" : "не задана");
    setText("[data-ov-net]", fmtRub(net));
    setText("[data-ov-assets]", fmtRub(aSum));
    setText("[data-ov-liab]", fmtRub(lSum));
    setText("[data-ov-flow]", fmtRub(netFlow) + " / мес");

    const flowNote = $("[data-ov-flow-note]");
    if (flowNote) {
      const bits = ["приходит " + fmtRub(inFlow), "уходит " + fmtRub(outFlow)];
      if (fxNet) bits.push("курс " + fmtSignedRub(fxNet) + " за 30 дней");
      flowNote.textContent = bits.join(" · ");
    }

    const lev = aSum > 0 ? (lSum / aSum) * 100 : null;
    setText("[data-ov-leverage]", lev == null ? "—" : fmtPct(lev));
    const levNote = $("[data-ov-leverage-note]");
    if (levNote) {
      levNote.textContent =
        lev == null
          ? "Пока нет имущества с суммой — отношение не считается."
          : lev > 50
            ? "Долгов больше половины того, чем владеете."
            : lev > 25
              ? "Долговая нагрузка заметная, но не подавляет картину."
              : "Долги не перевешивают то, чем владеете.";
    }

    const splitA = $("[data-ov-split-a]");
    const splitL = $("[data-ov-split-l]");
    const span = aSum + lSum;
    if (splitA && splitL) {
      const ap = span > 0 ? (aSum / span) * 100 : 50;
      splitA.style.width = ap + "%";
      splitL.style.width = 100 - ap + "%";
    }
    const splitNote = $("[data-ov-split-note]");
    if (splitNote) {
      splitNote.textContent = aSum
        ? assets.length +
          " в собственности, " +
          liab.length +
          " долгов. Зелёное — своё, красное — то, что должны."
        : "Добавьте первую позицию — полоса покажет, что своё, а что долг.";
    }

    const goldCard = $("[data-ov-gold-card]");
    if (goldCard) goldCard.setAttribute("data-tone", vs ? vs.tone : "flat");
    if (vs) {
      const pct =
        (vs.pct > 0 ? "+" : vs.pct < 0 ? "−" : "") +
        Math.abs(vs.pct).toFixed(1).replace(".", ",") +
        "%";
      setText("[data-ov-gold-verb]", "Капитал " + vs.verb);
      setText("[data-ov-gold-pct]", pct);
      setText(
        "[data-ov-gold-grams]",
        "Сейчас это около " + fmtGrams(grams) + " золота по споту Мосбиржи."
      );
      setText(
        "[data-ov-gold-note]",
        "Не слитки и не рекомендация. Шкала — держит ли капитал золото, а не рубли сами по себе."
      );
    } else {
      setText("[data-ov-gold-verb]", grams != null ? "Около " + fmtGrams(grams) : "Ждём золото");
      setText("[data-ov-gold-pct]", grams != null ? "по споту" : "");
      setText(
        "[data-ov-gold-grams]",
        grams != null
          ? "Столько граммов стоит ваш капитал после долгов."
          : "Котировку золота ещё не сняли."
      );
      setText(
        "[data-ov-gold-note]",
        g && g.error
          ? "Золотую цену Мосбиржи не удалось снять. Сравнение за 30 дней появится, когда вернётся котировка."
          : "Через 30 дней здесь будет: вырос, сохранился или потерял относительно золота."
      );
    }

    const top = $("[data-ov-top]");
    if (top) {
      const ranked = assets
        .map((r) => ({ r: r, v: posRub(r) || 0 }))
        .filter((x) => x.v > 0)
        .sort((a, b) => b.v - a.v)
        .slice(0, 3);
      if (!ranked.length) {
        top.innerHTML = "<li><strong>Пока пусто</strong><span>Добавьте актив в портфель</span></li>";
      } else {
        top.innerHTML = ranked
          .map((x) => {
            const share = aSum > 0 ? fmtShare((x.v / aSum) * 100) : "—";
            return (
              "<li><div><strong>" +
              escHtml(x.r.name || x.r.ticker || "Без имени") +
              "</strong><span>" +
              escHtml(classLabel(x.r.asset_class)) +
              "</span></div><b>" +
              escHtml(fmtRub(x.v)) +
              "<span> · " +
              escHtml(share) +
              "</span></b></li>"
            );
          })
          .join("");
      }
    }

    const leadBits = [];
    if (aSum) {
      leadBits.push("Капитал после долгов — " + fmtRub(net) + ".");
      if (vs) {
        leadBits.push(
          "За месяц к золоту он " +
            vs.verb +
            " на " +
            Math.abs(vs.pct).toFixed(1).replace(".", ",") +
            "%."
        );
      }
      if (netFlow) leadBits.push("Живыми деньгами " + fmtSignedRub(netFlow) + " в месяц.");
    } else {
      leadBits.push(
        "Пока нечего складывать. Добавьте первую позицию — и здесь появится, сколько у вас есть на самом деле."
      );
    }
    const readyN = (state.watchlist || []).filter((w) => w.last_verdict === "invest").length;
    if (readyN) leadBits.push("В watch list " + readyN + " бумаг ближе к входу.");
    const carDebtNow = vehicleLiabilities();
    if (carDebtNow.length) {
      const carSum = carDebtNow.reduce((s, p) => s + (posRub(p) || 0), 0);
      leadBits.push(
        "Авто на " +
          fmtRub(carSum) +
          " сейчас вычитается как долг. Если машина ваша, капитал на самом деле больше."
      );
    }
    setText("[data-ov-lead]", leadBits.join(" "));

    const acts = $("[data-ov-actions]");
    if (acts) {
      try {
        acts.innerHTML = overviewActions({ aSum: aSum, lSum: lSum })
          .map((a) => {
            const inner =
              "<strong>" + escHtml(a.title) + "</strong><span>" + escHtml(a.body) + "</span>";
            if (a.fix) {
              return (
                '<button type="button" class="invest-ov-act" data-ov-fix="' +
                escHtml(a.fix) +
                '">' +
                inner +
                "</button>"
              );
            }
            return '<a class="invest-ov-act" href="' + a.href + '">' + inner + "</a>";
          })
          .join("");
      } catch (err) {
        console.warn("overview actions", err);
        acts.innerHTML =
          '<a class="invest-ov-act" href="#analyze"><strong>Разобрать тикер</strong><span>Картина капитала собрана. Если появилась мысль — снимите рынок и прочитайте отчёт.</span></a>';
      }
    }
    try {
      renderOverviewWatch();
    } catch (err) {
      console.warn("overview watch", err);
    }
    renderChart(all);
  }

  function renderChart(rows) {
    const hosts = $$("[data-structure-chart]");
    if (!hosts.length) return;
    const assets = rows.filter((r) => r.side === "asset" && (posRub(r) || 0) > 0);
    const byClass = {};
    assets.forEach((r) => {
      const key = r.source === "desk" ? "desk · " + (r.book || r.asset_class) : r.asset_class;
      if (!byClass[key]) byClass[key] = { v: 0, names: [] };
      byClass[key].v += posRub(r);
      if (r.name) byClass[key].names.push(r.name);
    });
    let entries = Object.keys(byClass)
      .map((k) => ({ k, v: byClass[k].v, names: byClass[k].names }))
      .sort((a, b) => b.v - a.v);
    const total = entries.reduce((s, e) => s + e.v, 0);
    if (!entries.length || total <= 0) {
      hosts.forEach((h) => {
        h.innerHTML =
          '<div class="invest-structure-empty"><p>Нечего строить: нет активов с суммой &gt; 0.</p></div>';
      });
      paintGoldNote();
      return;
    }
    if (entries.length > 7) {
      const head = entries.slice(0, 6);
      const rest = entries.slice(6).reduce((s, e) => s + e.v, 0);
      entries = head.concat([{ k: "прочие", v: rest, names: [] }]);
    }

    const radius = 68;
    const circ = 2 * Math.PI * radius;
    const gap = entries.length > 1 ? Math.min(6, circ * 0.012) : 0;
    const usable = circ - gap * entries.length;
    let acc = 0;
    const slices = entries.map((e, i) => {
      const frac = e.v / total;
      const arc = Math.max(0.01, usable * frac);
      const slice = {
        i: i,
        label:
          e.k === "прочие"
            ? "Прочие"
            : (function () {
                const uniq = [];
                (e.names || []).forEach((n) => {
                  const t = String(n || "").trim();
                  if (t && uniq.indexOf(t) === -1) uniq.push(t);
                });
                const cls = classLabel(e.k);
                return uniq.length === 1 ? uniq[0] + " · " + cls : cls;
              })(),
        v: e.v,
        pct: 100 * frac,
        color: CHART_COLORS[i % CHART_COLORS.length],
        arc: arc,
        rest: circ - arc,
        off: -acc,
        delay: 80 * i,
      };
      acc += arc + gap;
      return slice;
    });

    const segs = slices
      .map((s) => {
        const style =
          "--arc:" +
          s.arc.toFixed(3) +
          ";--rest:" +
          s.rest.toFixed(3) +
          ";--off:" +
          s.off.toFixed(3) +
          ";--circ:" +
          circ.toFixed(3) +
          ";--delay:" +
          s.delay +
          "ms;--c:" +
          s.color;
        return (
          '<g data-slice="' +
          s.i +
          '">' +
          '<circle class="invest-donut-hit" cx="100" cy="100" r="' +
          radius +
          '" style="' +
          style +
          '"></circle>' +
          '<circle class="invest-donut-seg" cx="100" cy="100" r="' +
          radius +
          '" style="' +
          style +
          '"></circle>' +
          "</g>"
        );
      })
      .join("");

    const legend = slices
      .map((s) => {
        return (
          '<button type="button" class="invest-donut-legend-item" data-slice="' +
          s.i +
          '">' +
          '<i style="background:' +
          s.color +
          '"></i>' +
          "<span>" +
          escHtml(s.label) +
          "</span>" +
          '<b class="mono">' +
          fmtShare(s.pct) +
          "</b>" +
          "</button>"
        );
      })
      .join("");

    const markup =
      '<div class="invest-donut" data-donut>' +
      '<div class="invest-donut-stage">' +
      '<svg viewBox="0 0 200 200" role="img" aria-label="Структура активов в рублях">' +
      '<circle class="invest-donut-halo" cx="100" cy="100" r="88"></circle>' +
      '<circle class="invest-donut-halo invest-donut-halo-gold" cx="100" cy="100" r="80"></circle>' +
      '<circle class="invest-donut-track" cx="100" cy="100" r="' +
      radius +
      '"></circle>' +
      segs +
      "</svg>" +
      '<div class="invest-donut-core">' +
      '<p class="invest-donut-kicker" data-donut-kicker>Активы</p>' +
      '<p class="invest-donut-value" data-donut-value>' +
      escHtml(fmtRub(total)) +
      "</p>" +
      '<p class="invest-donut-sub" data-donut-sub>в рублях</p>' +
      "</div></div>" +
      '<div class="invest-donut-legend">' +
      legend +
      "</div></div>";

    hosts.forEach((host) => {
      host.innerHTML = markup;
      const root = host.querySelector("[data-donut]");
      requestAnimationFrame(() => {
        if (root) root.classList.add("is-in");
      });
      function setCore(kicker, value, sub) {
        const kEl = root && root.querySelector("[data-donut-kicker]");
        const vEl = root && root.querySelector("[data-donut-value]");
        const sEl = root && root.querySelector("[data-donut-sub]");
        if (kEl) kEl.textContent = kicker;
        if (vEl) vEl.textContent = value;
        if (sEl) sEl.textContent = sub;
      }
      function paintHot(idx) {
        if (!root) return;
        root.querySelectorAll("[data-slice]").forEach((el) => {
          el.classList.toggle("is-hot", idx != null && Number(el.getAttribute("data-slice")) === idx);
        });
        if (idx == null) {
          root.removeAttribute("data-hot");
          setCore("Активы", fmtRub(total), "в рублях");
          return;
        }
        const s = slices[idx];
        if (!s) return;
        root.setAttribute("data-hot", String(idx));
        setCore(s.label, fmtShare(s.pct), fmtRub(s.v));
      }
      host.querySelectorAll("[data-slice]").forEach((el) => {
        const idx = Number(el.getAttribute("data-slice"));
        el.addEventListener("mouseenter", () => paintHot(idx));
        el.addEventListener("mouseleave", () => paintHot(null));
        el.addEventListener("focus", () => paintHot(idx));
        el.addEventListener("blur", () => paintHot(null));
      });
    });
    paintGoldNote();
  }

  function renderPortfolio() {
    const all = mergedPositions();
    const f = state.filters;
    const rows = all.filter((r) => {
      if (f.side && r.side !== f.side) return false;
      if (f.asset_class && r.asset_class !== f.asset_class) return false;
      if (f.source && r.source !== f.source) return false;
      return true;
    });
    const body = $("[data-pos-body]");
    if (body) {
      if (!rows.length) {
        body.innerHTML =
          '<tr><td colspan="8" class="cab-empty-cell">Список пуст. Добавьте актив или пассив — или подключите imoexBase для desk.</td></tr>';
      } else {
        body.innerHTML = rows
          .map((r) => {
            const canDel = r.source !== "desk" && r.id && String(r.id).indexOf("desk-") !== 0;
            const src =
              r.source === "desk"
                ? '<span class="invest-src-pill">desk · ' + (Pipe.bookLabel(r.book) || r.book || "") + "</span>"
                : "manual";
            const valNote = r.valueKind === "relative" ? " <span class=\"muted\">усл. ед.</span>" : "";
            const ccy = positionCcy(r);
            const rub = posRub(r);
            const income = monthlyIncome(r);
            const incR = incomeRub(r);
            const fx = fxPnl(r);
            const yld =
              r.side === "asset" && rub > 0 && incR && !isCostingOwnedVehicle(r)
                ? " <span class=\"muted\">" + fmtPct((incR * 12 * 100) / rub) + "</span>"
                : "";
            const rubHint =
              ccy !== "RUB" && rub != null
                ? '<div class="muted">≈ ' + fmtRub(rub) + "</div>"
                : "";
            const incomeBits = [];
            if (income) {
              const out = r.side === "liability" || isCostingOwnedVehicle(r);
              incomeBits.push((out ? "−" : "") + fmtMoney(income, ccy) + yld);
            }
            if (fx) {
              incomeBits.push(
                fmtSignedRub(fx.pnl) +
                  '<div class="muted">курс ' +
                  fx.ccy +
                  ", " +
                  fx.period +
                  (fx.pct != null ? " · " + (fx.pct > 0 ? "+" : "") + fmtPct(fx.pct) : "") +
                  "</div>"
              );
            }
            return (
              "<tr>" +
              "<td>" +
              (r.side === "liability" ? "долг" : "владею") +
              "</td>" +
              "<td>" +
              escHtml(classLabel(r.asset_class || "")) +
              "</td>" +
              "<td>" +
              escHtml(r.name || "") +
              "</td>" +
              "<td class=\"mono\">" +
              (r.ticker || "—") +
              "</td>" +
              "<td class=\"mono\">" +
              fmtMoney(r.value, ccy) +
              valNote +
              rubHint +
              "</td>" +
              "<td class=\"mono\">" +
              (incomeBits.length ? incomeBits.join("") : "—") +
              "</td>" +
              "<td>" +
              src +
              "</td>" +
              "<td>" +
              (canDel
                ? '<button type="button" class="nav-text-btn" data-edit-pos="' +
                  r.id +
                  '">Изменить</button> ' +
                  (r.side === "liability" && isVehicle(r)
                    ? '<button type="button" class="nav-text-btn" data-own-car="' +
                      r.id +
                      '">Это собственность</button> '
                    : "") +
                  '<button type="button" class="nav-text-btn" data-del-pos="' +
                  r.id +
                  '">Удалить</button>'
                : "") +
              "</td>" +
              "</tr>"
            );
          })
          .join("");
      }
    }
    renderChart(all);
    paintGoldNote();
  }

  function paragraphs(text) {
    return String(text || "")
      .split(/\n{2,}/)
      .map((p) => "<p>" + escHtml(p).replace(/\n/g, "<br />") + "</p>")
      .join("");
  }

  function explanationOf(result) {
    const Explain = window.TrinityInvestExplain;
    if (result && Explain && typeof Explain.buildExplanation === "function") {
      result.explanation = Explain.buildExplanation(result);
      return result.explanation;
    }
    return (result && result.explanation) || { sections: [], verdictLabel: "", disclaimer: "" };
  }

  function renderReport(result) {
    state.lastResult = result;
    const empty = $("[data-report-empty]");
    const body = $("[data-report-body]");
    if (!result) {
      if (empty) empty.hidden = false;
      if (body) body.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;
    if (body) body.hidden = false;
    const expl = explanationOf(result);
    const banner = $("[data-verdict-banner]");
    if (banner) banner.setAttribute("data-verdict", result.verdict || "");
    setText("[data-verdict-title]", (expl.verdictLabel || result.verdict) + " · " + (result.ticker || ""));
    const price = result.quote && result.quote.last;
    const priceBit =
      price != null && Number.isFinite(Number(price))
        ? "Последняя цена " +
          Number(price).toFixed(2).replace(".", ",") +
          " ₽. "
        : "";
    setText(
      "[data-verdict-sub]",
      (result.name ? result.name + ". " : "") + priceBit + (expl.lead || expl.disclaimer || "")
    );
    const host = $("[data-report-sections]");
    if (host) {
      host.innerHTML = (expl.sections || [])
        .map((s) => {
          const pill = s.statusLabel || s.status || "";
          return (
            '<article class="invest-report-sec" data-status="' +
            escHtml(s.status) +
            '">' +
            '<div class="invest-report-sec-h"><h3>' +
            escHtml(s.title) +
            '</h3><span class="invest-status-pill">' +
            escHtml(pill) +
            "</span></div>" +
            '<div class="invest-report-sec-b">' +
            paragraphs(s.body) +
            "</div></article>"
          );
        })
        .join("");
    }
    const tvLink = $("[data-tv-link]");
    if (tvLink && result.ticker) {
      tvLink.href =
        "https://www.tradingview.com/chart/?symbol=" +
        encodeURIComponent("MOEX:" + String(result.ticker).toUpperCase());
      tvLink.textContent = "Открыть график";
    }
    requestAnimationFrame(() => requestAnimationFrame(() => applyChartSurface(result)));
    renderOverview();
    syncWatchButton();
  }

  function chartMode() {
    try {
      return localStorage.getItem("trinity-invest-chart") === "iss" ? "iss" : "tv";
    } catch {
      return "tv";
    }
  }

  function setChartMode(mode) {
    const next = mode === "iss" ? "iss" : "tv";
    try {
      localStorage.setItem("trinity-invest-chart", next);
    } catch (_) {}
    applyChartSurface(state.lastResult);
  }

  function tvEmbedSrc(ticker) {
    const symbol = "MOEX:" + String(ticker || "").toUpperCase();
    const q =
      "symbol=" +
      encodeURIComponent(symbol) +
      "&interval=15&theme=light&style=1&locale=ru&timezone=" +
      encodeURIComponent("Europe/Moscow") +
      "&allow_symbol_change=1&hidetoptoolbar=0&hidesidetoolbar=0&symboledit=1&withdateranges=1&hideideas=1&saveimage=0&hidevolume=0&studies=%5B%5D";
    return "https://ru.tradingview.com/widgetembed/?" + q;
  }

  function mountTv(ticker) {
    const frame = document.getElementById("invest-tv-frame");
    if (!frame || !ticker) return;
    const src = tvEmbedSrc(ticker);
    if (frame.getAttribute("data-symbol") === String(ticker).toUpperCase() && frame.getAttribute("src")) {
      return;
    }
    frame.setAttribute("data-symbol", String(ticker).toUpperCase());
    frame.src = src;
  }

  function applyChartSurface(result) {
    const mode = chartMode();
    const frame = document.getElementById("invest-tv-frame");
    const canvas = document.getElementById("invest-iss-chart");
    $$("[data-chart-mode]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-chart-mode") === mode);
    });
    const sub = $("[data-chart-sub]");
    if (sub) {
      sub.textContent =
        mode === "tv"
          ? "Живой график, 15 минут. Интервал можно сменить на самом графике. Если пусто — снимок Мосбиржи."
          : "Дневные свечи Мосбиржи на момент разбора. Не живой поток.";
    }
    if (frame) frame.hidden = mode !== "tv";
    if (canvas) canvas.hidden = mode !== "iss";
    if (result && result.ticker && mode === "tv") mountTv(result.ticker);
    if (result && mode === "iss") mountChart(result);
  }

  function smaLast(values, period) {
    if (!values || values.length < period) return [];
    const out = new Array(values.length).fill(null);
    let acc = 0;
    for (let i = 0; i < values.length; i++) {
      acc += values[i];
      if (i >= period) acc -= values[i - period];
      if (i >= period - 1) out[i] = acc / period;
    }
    return out;
  }

  function mountChart(result) {
    const canvas = document.getElementById("invest-iss-chart");
    if (!canvas || !result) return;
    const bars = (result.candles || []).filter(
      (b) => b && Number.isFinite(Number(b.c)) && Number.isFinite(Number(b.h)) && Number.isFinite(Number(b.l))
    );
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(320, canvas.clientWidth || 640);
    const h = Math.max(240, canvas.clientHeight || 420);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fbfcfd";
    ctx.fillRect(0, 0, w, h);

    if (!bars.length) {
      ctx.fillStyle = "#6a7680";
      ctx.font = "14px 'IBM Plex Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Нет дневных свечей по этому тикеру", w / 2, h / 2);
      return;
    }

    const pad = { t: 22, r: 16, b: 28, l: 56 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const highs = bars.map((b) => Number(b.h));
    const lows = bars.map((b) => Number(b.l));
    let min = Math.min.apply(null, lows);
    let max = Math.max.apply(null, highs);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const span = max - min;
    const yOf = (px) => pad.t + ((max - px) / span) * ih;
    const slot = iw / bars.length;

    ctx.strokeStyle = "#e4e9ee";
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const px = max - (span * g) / 4;
      const y = yOf(px);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + iw, y);
      ctx.stroke();
      ctx.fillStyle = "#6a7680";
      ctx.font = "11px 'IBM Plex Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText(px.toFixed(2), pad.l - 6, y + 4);
    }

    bars.forEach((b, i) => {
      const x = pad.l + (i + 0.5) * slot;
      const o = Number(b.o);
      const c = Number(b.c);
      const up = c >= o;
      ctx.strokeStyle = up ? "#0b7a66" : "#c53030";
      ctx.beginPath();
      ctx.moveTo(x, yOf(Number(b.h)));
      ctx.lineTo(x, yOf(Number(b.l)));
      ctx.stroke();
      const bodyTop = yOf(Math.max(o, c));
      const bodyBot = yOf(Math.min(o, c));
      const bh = Math.max(1, bodyBot - bodyTop);
      ctx.fillStyle = up ? "#0b7a66" : "#c53030";
      ctx.fillRect(x - Math.max(1, slot * 0.28), bodyTop, Math.max(2, slot * 0.56), bh);
    });

    const closes = bars.map((b) => Number(b.c));
    function strokeSma(arr, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      arr.forEach((v, i) => {
        if (v == null) return;
        const x = pad.l + (i + 0.5) * slot;
        const y = yOf(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      });
      if (started) ctx.stroke();
    }
    strokeSma(smaLast(closes, 20), "#c4a35a");
    strokeSma(smaLast(closes, 50), "#2a3a44");

    const last = bars[bars.length - 1];
    ctx.fillStyle = "#1a2228";
    ctx.font = "12px 'IBM Plex Sans', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(
      (result.ticker || "") +
        "  " +
        Number(last.c).toFixed(2) +
        "  · средняя 20 дней — золото · 50 дней — графит · снимок, не сигнал",
      pad.l + 8,
      16
    );
  }

  function watchKey() {
    return "trinity-invest-watch:" + ((state.user && state.user.id) || "anon");
  }

  function readLocalWatch() {
    try {
      const raw = JSON.parse(localStorage.getItem(watchKey()) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function writeLocalWatch(rows) {
    try {
      localStorage.setItem(watchKey(), JSON.stringify(rows || []));
    } catch (_) {}
  }

  function tableMissing(err) {
    const msg = err && err.message ? err.message : String(err || "");
    return /relation|schema cache|does not exist/i.test(msg);
  }

  function fundFromPull(pulled) {
    if (!pulled || !pulled.fields) return null;
    const out = { sector: pulled.sector || "nonfin" };
    let any = false;
    Object.keys(pulled.fields).forEach((k) => {
      const n = Fund.parseNumber(pulled.fields[k]);
      if (n != null) {
        out[k] = n;
        any = true;
      }
    });
    return any ? out : null;
  }

  async function analyzeQuiet(ticker, statusEl) {
    const code = String(ticker || "")
      .trim()
      .toUpperCase();
    if (!code) throw new Error("Нет тикера");
    let fundamentals = fundFromPull(readFundCache(code));
    if (!fundamentals && FundFetch && typeof FundFetch.pullFundamentals === "function") {
      if (statusEl) statusEl.textContent = code + ": ищем отчётность…";
      try {
        const pulled = await FundFetch.pullFundamentals(code, {
          config: cfg(),
          timeoutMs: 16000,
        });
        writeFundCache(code, pulled);
        fundamentals = fundFromPull(pulled);
      } catch (_) {}
    }
    if (statusEl) statusEl.textContent = code + ": снимаем цену на Мосбирже…";
    const result = await Pipe.analyzeTicker(code, {
      fundamentals: fundamentals,
      riskProfile: state.profile,
      issBase: cfg().issBase || undefined,
      issReader: cfg().issReader,
    });
    const Explain = window.TrinityInvestExplain;
    if (Explain && typeof Explain.buildExplanation === "function") {
      result.explanation = Explain.buildExplanation(result);
    }
    return result;
  }

  function watchSnapshot(result) {
    const expl = result.explanation || {};
    const price = result.quote && result.quote.last;
    return {
      ticker: String(result.ticker || "").toUpperCase(),
      name: result.name || result.ticker,
      last_verdict: result.verdict || "watch",
      last_price: price != null && Number.isFinite(Number(price)) ? Number(price) : null,
      last_lead: expl.lead || "",
      last_run_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  function verdictRu(code) {
    const E = window.TrinityInvestExplain;
    return (E && E.VERDICT_RU && E.VERDICT_RU[code]) || code || "—";
  }

  function fmtWatchWhen(iso) {
    if (!iso) return "ещё не обновляли";
    try {
      return new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return String(iso);
    }
  }

  function syncWatchButton() {
    const btn = $("[data-act-watch]");
    if (!btn) return;
    const t = state.lastResult && state.lastResult.ticker ? String(state.lastResult.ticker).toUpperCase() : "";
    const hit = t && (state.watchlist || []).some((w) => String(w.ticker).toUpperCase() === t);
    btn.textContent = hit ? "Уже в watch list" : "Добавить в watch list";
  }

  async function loadWatchlist() {
    const client = sb();
    if (client && state.user) {
      const { data, error } = await client
        .from("invest_watchlist")
        .select("*")
        .eq("user_id", state.user.id)
        .order("updated_at", { ascending: false });
      if (!error) {
        state.watchRemote = true;
        let rows = data || [];
        const local = readLocalWatch();
        if (!rows.length && local.length) {
          for (let i = 0; i < local.length; i++) {
            await upsertWatch(local[i], true);
          }
          writeLocalWatch([]);
          const again = await client
            .from("invest_watchlist")
            .select("*")
            .eq("user_id", state.user.id)
            .order("updated_at", { ascending: false });
          rows = again.data || [];
        }
        state.watchlist = rows;
        renderWatchlist();
        renderOverview();
        return;
      }
      if (!tableMissing(error)) console.warn("invest_watchlist", error.message);
    }
    state.watchRemote = false;
    state.watchlist = readLocalWatch();
    renderWatchlist();
    renderOverview();
  }

  async function upsertWatch(snap, skipLoad) {
    const ticker = String((snap && snap.ticker) || "")
      .trim()
      .toUpperCase();
    if (!ticker) return;
    const row = {
      ticker: ticker,
      name: snap.name || ticker,
      last_verdict: snap.last_verdict || null,
      last_price: snap.last_price != null ? snap.last_price : null,
      last_lead: snap.last_lead || "",
      last_run_at: snap.last_run_at || null,
      updated_at: new Date().toISOString(),
    };
    const client = sb();
    if (state.watchRemote && client && state.user) {
      const { error } = await client.from("invest_watchlist").upsert(
        Object.assign({ user_id: state.user.id }, row),
        { onConflict: "user_id,ticker" }
      );
      if (error) {
        if (tableMissing(error)) state.watchRemote = false;
        else {
          console.warn("invest_watchlist upsert", error.message);
          return;
        }
      } else if (!skipLoad) {
        await loadWatchlist();
        return;
      }
    }
    const rows = (state.watchlist || []).slice();
    const ix = rows.findIndex((w) => String(w.ticker).toUpperCase() === ticker);
    const localRow = Object.assign({ id: "local-" + ticker, created_at: new Date().toISOString() }, ix >= 0 ? rows[ix] : {}, row);
    if (ix >= 0) rows[ix] = localRow;
    else rows.unshift(localRow);
    state.watchlist = rows;
    writeLocalWatch(rows);
    if (!skipLoad) {
      renderWatchlist();
      renderOverview();
    }
  }

  async function removeWatch(id, ticker) {
    const client = sb();
    if (state.watchRemote && client && id && String(id).indexOf("local-") !== 0) {
      const { error } = await client.from("invest_watchlist").delete().eq("id", id);
      if (error) console.warn("invest_watchlist delete", error.message);
      await loadWatchlist();
      return;
    }
    const code = String(ticker || "").toUpperCase();
    state.watchlist = (state.watchlist || []).filter(
      (w) => String(w.id) !== String(id) && String(w.ticker).toUpperCase() !== code
    );
    writeLocalWatch(state.watchlist);
    renderWatchlist();
    renderOverview();
  }

  function renderWatchlist() {
    const rows = state.watchlist || [];
    const empty = $("[data-watch-empty]");
    const host = $("[data-watch-list]");
    const sub = $("[data-watch-sub]");
    const readyN = rows.filter((w) => w.last_verdict === "invest").length;
    if (sub) {
      sub.textContent = rows.length
        ? rows.length +
          " бумаг в наблюдении" +
          (readyN ? " · " + readyN + " ближе к входу" : "") +
          ". Портфеля это не касается."
        : "Пусто, пока не добавите тикер из отчёта.";
    }
    if (empty) empty.hidden = rows.length > 0;
    if (!host) {
      syncWatchButton();
      return;
    }
    host.hidden = rows.length === 0;
    host.innerHTML = rows
      .map((w) => {
        const ready = w.last_verdict === "invest";
        const price =
          w.last_price != null && Number.isFinite(Number(w.last_price))
            ? Number(w.last_price).toFixed(2).replace(".", ",") + " ₽"
            : "цены пока нет";
        return (
          '<article class="invest-watch-card" data-ready="' +
          (ready ? "1" : "0") +
          '" data-verdict="' +
          escHtml(w.last_verdict || "") +
          '">' +
          '<div class="invest-watch-card-h"><div><span class="cab-label">' +
          escHtml(w.ticker) +
          "</span><h3>" +
          escHtml(w.name || w.ticker) +
          '</h3></div><span class="invest-status-pill">' +
          escHtml(verdictRu(w.last_verdict)) +
          "</span></div>" +
          '<p class="invest-watch-price">' +
          escHtml(price) +
          "</p>" +
          '<p class="invest-watch-lead">' +
          escHtml(w.last_lead || "Разбор ещё не обновляли — нажмите «Обновить».") +
          "</p>" +
          (ready
            ? '<p class="invest-watch-ready">Похоже, вход стал спокойнее. Это по-прежнему не покупка: откройте отчёт и решите сами.</p>'
            : "") +
          '<p class="cab-meta">Обновлено ' +
          escHtml(fmtWatchWhen(w.last_run_at || w.updated_at)) +
          "</p>" +
          '<div class="invest-watch-actions">' +
          '<button type="button" class="btn btn-primary" data-watch-one="' +
          escHtml(w.ticker) +
          '">Обновить</button>' +
          '<button type="button" class="btn btn-line" data-watch-open="' +
          escHtml(w.ticker) +
          '">Открыть отчёт</button>' +
          '<button type="button" class="btn btn-line" data-watch-del="' +
          escHtml(w.id || "") +
          '" data-watch-ticker="' +
          escHtml(w.ticker) +
          '">Убрать</button>' +
          "</div></article>"
        );
      })
      .join("");
    syncWatchButton();
  }

  async function refreshWatchTicker(ticker) {
    const status = $("[data-watch-status]");
    const result = await analyzeQuiet(ticker, status);
    await upsertWatch(watchSnapshot(result));
    if (status) {
      status.textContent = result.ticker + ": " + verdictRu(result.verdict);
    }
    return result;
  }

  async function refreshWatchAll() {
    if (state.watchBusy) return;
    const rows = (state.watchlist || []).slice();
    const status = $("[data-watch-status]");
    const btn = $("[data-watch-refresh]");
    if (!rows.length) {
      if (status) status.textContent = "Список пуст.";
      return;
    }
    state.watchBusy = true;
    if (btn) btn.disabled = true;
    try {
      for (let i = 0; i < rows.length; i++) {
        if (status) status.textContent = "Обновляем " + rows[i].ticker + " (" + (i + 1) + " из " + rows.length + ")…";
        try {
          await refreshWatchTicker(rows[i].ticker);
        } catch (err) {
          if (status) {
            status.textContent =
              rows[i].ticker +
              ": не удалось обновить (" +
              (err && err.message ? err.message : String(err)) +
              ").";
          }
        }
      }
      if (status) {
        const readyN = (state.watchlist || []).filter((w) => w.last_verdict === "invest").length;
        status.textContent = readyN
          ? "Готово. Ближе к входу: " +
            (state.watchlist || [])
              .filter((w) => w.last_verdict === "invest")
              .map((w) => w.ticker)
              .join(", ") +
            "."
          : "Готово. Спокойного входа пока нет — загляните позже.";
      }
    } finally {
      state.watchBusy = false;
      if (btn) btn.disabled = false;
    }
  }

  async function addCurrentToWatch() {
    const r = state.lastResult;
    const status = $("[data-watch-status]");
    if (!r || !r.ticker) return;
    await upsertWatch(watchSnapshot(r));
    if (status) status.textContent = r.ticker + " в watch list. Это не позиция.";
    showView("watchlist");
  }

  async function migrateWatchStubs() {
    const stubs = (state.positions || []).filter(isWatchStub);
    if (!stubs.length) return;
    for (let i = 0; i < stubs.length; i++) {
      const p = stubs[i];
      if (!p.ticker) continue;
      await upsertWatch(
        {
          ticker: p.ticker,
          name: p.name || p.ticker,
          last_verdict: "watch",
          last_lead: "Перенесено из портфеля: это было наблюдение, не покупка.",
          last_run_at: null,
        },
        true
      );
      const client = sb();
      if (client && p.id) {
        await client.from("invest_positions").delete().eq("id", p.id);
      }
    }
    if (!state.watchRemote) writeLocalWatch(state.watchlist);
    await loadPositions();
    await loadWatchlist();
  }

  async function persistRun(result) {
    const client = sb();
    if (!client || !state.user || !result) return;
    try {
      await client.from("invest_analysis_runs").insert({
        user_id: state.user.id,
        ticker: result.ticker,
        inputs: result.inputs || {},
        gates: result.gates || {},
        verdict: result.verdict,
        scenarios: result.scenarios || {},
        explanation: result.explanation || {},
      });
    } catch (err) {
      console.warn("invest_analysis_runs", err);
    }
  }

  function readFundForm() {
    const form = $("[data-fund-form]");
    if (!form) return null;
    const o = readForm(form);
    const sector = o.sector || "nonfin";
    const keys = sector === "fin" ? Fund.FIN_FIELDS : Fund.NONFIN_FIELDS;
    const out = { sector };
    let any = false;
    keys.forEach((k) => {
      const n = Fund.parseNumber(o[k]);
      if (n != null) {
        out[k] = n;
        any = true;
      }
    });
    return any ? out : null;
  }

  function toggleFundSector(isFin) {
    const sector = $("[data-fund-form] select[name=sector]");
    const nonfin = $("[data-fund-nonfin]");
    const fin = $("[data-fund-fin]");
    if (sector) sector.value = isFin ? "fin" : "nonfin";
    if (nonfin) nonfin.hidden = Boolean(isFin);
    if (fin) fin.hidden = !isFin;
  }

  function applyFundPull(result) {
    const form = $("[data-fund-form]");
    const note = $("[data-fund-pull-note]");
    if (!form || !result) return;
    toggleFundSector(result.sector === "fin");
    const keys = result.sector === "fin" ? Fund.FIN_FIELDS : Fund.NONFIN_FIELDS;
    keys.forEach((k) => {
      if (!form[k]) return;
      form[k].value = result.fields && result.fields[k] != null ? String(result.fields[k]) : "";
    });
    const yrs = result.years || {};
    const files = (result.edisclosureFiles || []).slice(0, 4);
    const off = result.official || {};
    const bits = [];
    if (yrs.currYear && yrs.prevYear) {
      bits.push("Периоды: " + yrs.currYear + " vs " + yrs.prevYear);
    }
    if (off.inn) bits.push("ИНН " + off.inn);
    if (off.search) {
      bits.push('<a href="' + off.search + '" target="_blank" rel="noopener noreferrer">поиск e-disclosure</a>');
    }
    if (result.sources && result.sources.smartlab && result.sources.smartlab.url) {
      bits.push(
        '<a href="' + result.sources.smartlab.url + '" target="_blank" rel="noopener noreferrer">Smart-Lab МСФО</a>'
      );
    }
    files.forEach((u) => {
      bits.push('<a href="' + u + '" target="_blank" rel="noopener noreferrer">файл раскрытия</a>');
    });
    if (result.sources && result.sources.smartlab && !result.sources.smartlab.ok) {
      bits.push("Smart-Lab: " + (result.sources.smartlab.error || "нет данных"));
    }
    bits.push(result.note || "");
    if (note) note.innerHTML = bits.filter(Boolean).join(" · ");
    const box = $("[data-fund-box]");
    if (box) box.open = true;
  }

  const FUND_CACHE_KEY = "trinity-invest-fund-v1";
  const FUND_CACHE_MS = 14 * 24 * 60 * 60 * 1000;

  function readFundCache(ticker) {
    try {
      const all = JSON.parse(localStorage.getItem(FUND_CACHE_KEY) || "{}");
      const row = all[String(ticker || "").toUpperCase()];
      if (!row || !row.fields || Date.now() - (row.at || 0) > FUND_CACHE_MS) return null;
      return row;
    } catch {
      return null;
    }
  }

  function writeFundCache(ticker, result) {
    if (!ticker || !result || !result.fields) return;
    try {
      const all = JSON.parse(localStorage.getItem(FUND_CACHE_KEY) || "{}");
      all[String(ticker).toUpperCase()] = {
        at: Date.now(),
        sector: result.sector,
        fields: result.fields,
        years: result.years,
        official: result.official,
        sources: result.sources,
        edisclosureFiles: result.edisclosureFiles,
        note: result.note,
      };
      localStorage.setItem(FUND_CACHE_KEY, JSON.stringify(all));
    } catch (_) {}
  }

  async function ensureFundamentals(ticker, statusEl) {
    let fund = readFundForm();
    if (fund) return fund;
    const cached = readFundCache(ticker);
    if (cached) {
      applyFundPull(cached);
      fund = readFundForm();
      if (fund) return fund;
    }
    if (!FundFetch || typeof FundFetch.pullFundamentals !== "function") return null;
    if (statusEl) statusEl.textContent = "Ищем отчётность компании, затем цену на Мосбирже…";
    try {
      const pulled = await FundFetch.pullFundamentals(ticker, {
        config: cfg(),
        timeoutMs: 18000,
      });
      applyFundPull(pulled);
      writeFundCache(ticker, pulled);
      return readFundForm();
    } catch {
      return null;
    }
  }

  async function runAnalysis(ticker) {
    const status = $("[data-analyze-status]");
    if (status) status.textContent = "Готовим разбор…";
    const issBase = cfg().issBase || undefined;
    try {
      const fundamentals = await ensureFundamentals(ticker, status);
      if (status) {
        status.textContent = fundamentals
          ? "Снимаем цену на Мосбирже…"
          : "Отчётность не нашли — смотрим рынок без неё…";
      }
      const result = await Pipe.analyzeTicker(ticker, {
        fundamentals: fundamentals,
        riskProfile: state.profile,
        issBase: issBase,
        issReader: cfg().issReader,
      });
      if (status) {
        const Explain = window.TrinityInvestExplain;
        const label =
          (Explain && Explain.VERDICT_RU && Explain.VERDICT_RU[result.verdict]) || result.verdict;
        const fundNote =
          result.fund && result.fund.status === "NoData" ? " · без отчётности" : "";
        status.textContent =
          result.quote && result.quote.found
            ? "Готово: " + result.ticker + " · " + label + fundNote
            : "Такого тикера на Мосбирже среди акций не нашли. Проверьте код.";
      }
      showView("report");
      renderReport(result);
      persistRun(result);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (status) {
        status.textContent =
          "Не удалось снять рынок: " +
          msg +
          ". Попробуйте ещё раз чуть позже.";
      }
    }
  }

  function setupNav() {
    const toggle = $("[data-nav-toggle]");
    const links = $("[data-nav-links]");
    if (toggle && links) {
      toggle.addEventListener("click", () => {
        const open = links.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
      });
    }
    $$("[data-invest-nav]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        showView(a.getAttribute("data-invest-nav"));
        if (links) links.classList.remove("open");
      });
    });
    window.addEventListener("hashchange", () => showView(currentView()));
    window.addEventListener("resize", () => {
      const report = $('[data-invest-view="report"]');
      if (report && !report.hidden && state.lastResult && chartMode() === "iss") {
        mountChart(state.lastResult);
      }
    });
    $$("[data-chart-mode]").forEach((btn) => {
      btn.addEventListener("click", () => setChartMode(btn.getAttribute("data-chart-mode")));
    });
  }

  function syncIncomeLabel(form) {
    const name = $("[data-income-label] .invest-income-name");
    if (!name || !form || !form.side) return;
    const cls = form.asset_class ? form.asset_class.value : "";
    if (form.side.value === "liability") name.textContent = "Платёж в месяц";
    else if (cls === "автомобиль") name.textContent = "Расход в месяц";
    else name.textContent = "Доход в месяц";
  }

  function syncPosHints(form) {
    syncIncomeLabel(form);
    const hint = $("[data-pos-hint]");
    if (!hint || !form) return;
    const side = form.side ? form.side.value : "asset";
    const cls = form.asset_class ? form.asset_class.value : "";
    if (cls === "автомобиль" && side === "asset") {
      hint.textContent =
        "Машина в собственности входит в капитал по оценке рынка. Расход в месяц — содержание и страховка. Кредит, если есть, запишите отдельно как долг (остаток), не цену авто. Такси — в заметке слово «такси», тогда месяц считается доходом.";
    } else if (cls === "автомобиль") {
      hint.textContent =
        "Так учитывается только долг: остаток кредита. Саму машину запишите «в собственности», иначе 2 млн выглядят как будто вы их должны, а не владеете.";
    } else if (side === "liability") {
      hint.textContent =
        "Долг — то, что должны: кредит, ипотека, остаток займа. Стоимость здесь — тело долга, не цена заложенной вещи.";
    } else {
      hint.textContent =
        "В собственности — оценка рынка входит в капитал и на круг. Доход в месяц, если вещь его приносит.";
    }
  }

  function resetPosForm(form) {
    if (!form) return;
    state.editingId = null;
    form.reset();
    if (form.currency) form.currency.value = "RUB";
    if (form.asset_class) form.asset_class.value = "";
    syncPosHints(form);
    setText("[data-pos-form-title]", "Добавить позицию");
    const submit = $("[data-pos-submit]");
    if (submit) submit.textContent = "Сохранить";
    const cancel = $("[data-pos-cancel]");
    if (cancel) cancel.hidden = true;
  }

  function fillPosForm(form, row) {
    if (!form || !row) return;
    state.editingId = row.id;
    form.side.value = row.side || "asset";
    form.asset_class.value = row.asset_class || "";
    form.name.value = row.name || "";
    form.ticker.value = row.ticker || "";
    form.value.value = row.value != null ? String(row.value) : "";
    form.currency.value = positionCcy(row);
    form.income_monthly.value =
      row.income_monthly != null && row.income_monthly !== "" ? String(row.income_monthly) : "";
    form.notes.value = row.notes || "";
    syncPosHints(form);
    setText("[data-pos-form-title]", "Изменить позицию");
    const submit = $("[data-pos-submit]");
    if (submit) submit.textContent = "Обновить";
    const cancel = $("[data-pos-cancel]");
    if (cancel) cancel.hidden = false;
    form.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  const XLSX_SRC = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const PDF_SRC = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
  const IMPORT_MAX_BYTES = 8 * 1024 * 1024;

  function loadScriptOnce(src, ready) {
    if (typeof ready === "function" && ready()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const fail = () => reject(new Error("Не удалось загрузить разбор файла. Проверьте сеть."));
      const done = () => {
        if (typeof ready === "function" && !ready()) fail();
        else resolve();
      };
      const hit = document.querySelector('script[data-invest-lib="' + src + '"]');
      if (hit) {
        if (hit.getAttribute("data-ready") === "1") {
          done();
          return;
        }
        hit.addEventListener("load", done);
        hit.addEventListener("error", fail);
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.setAttribute("data-invest-lib", src);
      s.onload = () => {
        s.setAttribute("data-ready", "1");
        done();
      };
      s.onerror = fail;
      document.head.appendChild(s);
    });
  }

  function readAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("Не удалось прочитать файл."));
      r.readAsText(file);
    });
  }

  function readAsBuffer(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("Не удалось прочитать файл."));
      r.readAsArrayBuffer(file);
    });
  }

  function setImportStatus(text) {
    const el = $("[data-import-status]");
    if (el) el.textContent = text || "";
  }

  function hideImportPreview() {
    const wrap = $("[data-import-preview]");
    if (wrap) wrap.hidden = true;
    const body = $("[data-import-body]");
    if (body) body.innerHTML = "";
    state.importFileName = "";
  }

  function classOptionsHtml(selected) {
    return ASSET_CLASSES.map(([id, label]) => {
      return (
        '<option value="' +
        escHtml(id) +
        '"' +
        (id === selected ? " selected" : "") +
        ">" +
        escHtml(label) +
        "</option>"
      );
    }).join("");
  }

  function renderImportPreview(drafts, extraNote) {
    const wrap = $("[data-import-preview]");
    const body = $("[data-import-body]");
    if (!wrap || !body) return;
    if (!drafts.length) {
      wrap.hidden = true;
      body.innerHTML = "";
      return;
    }
    wrap.hidden = false;
    body.innerHTML = drafts
      .map((d) => {
        const side = d.side === "liability" ? "liability" : "asset";
        return (
          '<tr class="invest-import-preview-row" data-import-row data-import-income="' +
          escHtml(d.income_monthly == null ? "" : String(d.income_monthly)) +
          '" data-import-notes="' +
          escHtml(d.notes || "") +
          '">' +
          '<td><input type="checkbox" data-import-on' +
          (d.include === false ? "" : " checked") +
          " /></td>" +
          "<td><select data-import-side>" +
          '<option value="asset"' +
          (side === "asset" ? " selected" : "") +
          ">В собственности</option>" +
          '<option value="liability"' +
          (side === "liability" ? " selected" : "") +
          ">Долг</option>" +
          "</select></td>" +
          "<td><select data-import-class>" +
          classOptionsHtml(d.asset_class) +
          "</select></td>" +
          '<td><input type="text" data-import-name maxlength="120" value="' +
          escHtml(d.name || "") +
          '" /></td>' +
          '<td><input type="text" data-import-ticker maxlength="16" value="' +
          escHtml(d.ticker || "") +
          '" /></td>' +
          '<td><input type="text" data-import-value inputmode="decimal" value="' +
          escHtml(String(d.value)) +
          '" /></td>' +
          "<td><select data-import-ccy>" +
          ["RUB", "USD", "EUR", "CNY", "GBP"]
            .map((c) => {
              return (
                '<option value="' +
                c +
                '"' +
                (d.currency === c ? " selected" : "") +
                ">" +
                c +
                "</option>"
              );
            })
            .join("") +
          "</select></td></tr>"
        );
      })
      .join("");
    if (extraNote) setImportStatus(extraNote);
  }

  function collectImportRows() {
    return $$("[data-import-row]")
      .filter((tr) => {
        const on = $("[data-import-on]", tr);
        return on && on.checked;
      })
      .map((tr) => {
        const name = ($("[data-import-name]", tr) || {}).value || "";
        const ticker = (($("[data-import-ticker]", tr) || {}).value || "")
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");
        const rawVal = ($("[data-import-value]", tr) || {}).value;
        const value = Imp && Imp.parseAmount ? Imp.parseAmount(rawVal) : Number(rawVal);
        const incomeRaw = tr.getAttribute("data-import-income");
        const income =
          Imp && Imp.parseAmount && incomeRaw ? Imp.parseAmount(incomeRaw) : incomeRaw ? Number(incomeRaw) : null;
        return {
          side: ($("[data-import-side]", tr) || {}).value || "asset",
          asset_class: ($("[data-import-class]", tr) || {}).value || "акции",
          name: String(name).trim(),
          ticker: ticker || null,
          value: value,
          income_monthly: Number.isFinite(income) ? income : null,
          currency: ($("[data-import-ccy]", tr) || {}).value || "RUB",
          notes: tr.getAttribute("data-import-notes") || "",
        };
      });
  }

  async function parseExcelBuffer(buf) {
    await loadScriptOnce(XLSX_SRC, () => window.XLSX && window.XLSX.read);
    const XLSX = window.XLSX;
    const wb = XLSX.read(buf, { type: "array" });
    let best = { rows: [], warning: "В таблице не нашли позиций." };
    (wb.SheetNames || []).forEach((name) => {
      if (best.rows.length) return;
      const sheet = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
      const parsed = Imp.parseTable(rows);
      if (parsed.rows.length) best = parsed;
      else if (parsed.warning) best.warning = parsed.warning;
    });
    return best;
  }

  async function parsePdfBuffer(buf) {
    await loadScriptOnce(PDF_SRC, () => window.pdfjsLib && window.pdfjsLib.getDocument);
    const pdfjsLib = window.pdfjsLib;
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf), disableWorker: true }).promise;
    const items = [];
    const maxPages = Math.min(pdf.numPages || 0, 12);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      (content.items || []).forEach((it) => items.push(it));
    }
    if (!items.length) {
      return {
        rows: [],
        warning: "В PDF нет извлекаемого текста — похоже на скан. Сохраните таблицу в Excel или CSV.",
      };
    }
    return Imp.parsePdfLayout(items);
  }

  async function handleImportFile(file) {
    if (!file) return;
    if (!Imp) {
      setImportStatus("Модуль разбора файла не загрузился. Обновите страницу.");
      return;
    }
    if (file.size > IMPORT_MAX_BYTES) {
      setImportStatus("Файл больше 8 МБ — слишком тяжёлый для браузера. Выгрузите CSV или меньший лист.");
      return;
    }
    state.importFileName = file.name || "файл";
    setImportStatus("Читаем «" + state.importFileName + "»…");
    const name = String(file.name || "").toLowerCase();
    const type = String(file.type || "");
    try {
      let parsed;
      if (/\.xlsx?$/.test(name) || /spreadsheet|excel/i.test(type)) {
        parsed = await parseExcelBuffer(await readAsBuffer(file));
      } else if (/\.pdf$/.test(name) || type === "application/pdf") {
        parsed = await parsePdfBuffer(await readAsBuffer(file));
      } else {
        const text = await readAsText(file);
        parsed = /\.csv$|\.tsv$/.test(name) || /[;\t,]/.test(text) ? Imp.parseCsvText(text) : Imp.parsePlainText(text);
        if (!parsed.rows.length) {
          const csvTry = Imp.parseCsvText(text);
          if (csvTry.rows.length) parsed = csvTry;
        }
      }
      const capped = Imp.capRows(parsed.rows || []);
      if (!capped.rows.length) {
        hideImportPreview();
        setImportStatus(parsed.warning || "Не нашли позиций в файле.");
        return;
      }
      let note =
        "Разобрали " +
        capped.rows.length +
        (capped.truncated ? " из " + (capped.rows.length + capped.truncated) : "") +
        " строк в «" +
        state.importFileName +
        "». Отметьте нужные и добавьте в портфель.";
      if (capped.truncated) note += " Показали первые " + Imp.MAX_ROWS + ".";
      renderImportPreview(capped.rows, note);
    } catch (err) {
      hideImportPreview();
      setImportStatus(err && err.message ? err.message : "Не удалось разобрать файл.");
    }
  }

  async function commitImport() {
    const client = sb();
    if (!client || !state.user) {
      setImportStatus("Нет сессии — войдите снова.");
      return;
    }
    const picked = collectImportRows().filter((r) => r.name && r.value != null && Number.isFinite(Number(r.value)));
    if (!picked.length) {
      setImportStatus("Отметьте хотя бы одну строку с названием и суммой.");
      return;
    }
    const filename = state.importFileName || "файл";
    const fresh = Imp.filterNew(
      picked.map((r) => {
        const tag = "из файла " + filename;
        const notes = String(r.notes || "").trim();
        return {
          user_id: state.user.id,
          side: r.side === "liability" ? "liability" : "asset",
          asset_class: r.asset_class,
          name: r.name,
          ticker: r.ticker,
          value: Math.abs(Number(r.value)),
          income_monthly: r.income_monthly,
          currency: r.currency || "RUB",
          notes: notes ? (notes.indexOf(tag) >= 0 ? notes : notes + " · " + tag) : tag,
          source: "manual",
          updated_at: new Date().toISOString(),
        };
      }),
      state.positions || []
    );
    const skipped = picked.length - fresh.length;
    if (!fresh.length) {
      setImportStatus("Эти строки уже есть в портфеле — ничего не добавили.");
      return;
    }
    setImportStatus("Записываем " + fresh.length + "…");
    const { error } = await client.from("invest_positions").insert(fresh);
    if (error) {
      setImportStatus(
        /schema cache|does not exist/i.test(error.message || "")
          ? "Таблицы invest_* ещё не созданы. Выполните supabase/invest.sql в SQL Editor."
          : error.message
      );
      return;
    }
    hideImportPreview();
    setImportStatus("Добавили " + fresh.length + (skipped ? ". Пропустили дубли: " + skipped + "." : "."));
    await loadPositions();
  }

  function setupImport() {
    const input = $("[data-import-file]");
    const drop = input && input.closest ? input.closest(".invest-import-drop") : $(".invest-import-drop");
    if (input) {
      input.addEventListener("change", () => {
        const f = input.files && input.files[0];
        if (f) handleImportFile(f);
        input.value = "";
      });
    }
    if (drop) {
      drop.addEventListener("dragover", (e) => {
        e.preventDefault();
        drop.classList.add("is-hot");
      });
      drop.addEventListener("dragleave", () => drop.classList.remove("is-hot"));
      drop.addEventListener("drop", (e) => {
        e.preventDefault();
        drop.classList.remove("is-hot");
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) handleImportFile(f);
      });
    }
    const commit = $("[data-import-commit]");
    if (commit) commit.addEventListener("click", () => commitImport());
    const cancel = $("[data-import-cancel]");
    if (cancel) {
      cancel.addEventListener("click", () => {
        hideImportPreview();
        setImportStatus("");
      });
    }
  }

  function setupForms() {
    setupImport();
    const pos = $("[data-pos-form]");
    if (pos) {
      pos.addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = $("[data-pos-form-msg]");
        const client = sb();
        if (!client || !state.user) return;
        const o = readForm(pos);
        if (!o.asset_class) {
          if (msg) msg.textContent = "Выберите класс — от него зависит структура.";
          return;
        }
        const value = Fund.parseNumber(o.value);
        if (value == null) {
          if (msg) msg.textContent = "Укажите стоимость числом.";
          return;
        }
        const income =
          o.income_monthly === "" || o.income_monthly == null
            ? null
            : Fund.parseNumber(o.income_monthly);
        if (o.income_monthly && income == null) {
          if (msg) msg.textContent = "Доход/платёж в месяц — числом, либо пусто.";
          return;
        }
        const row = {
          user_id: state.user.id,
          side: o.side,
          asset_class: o.asset_class,
          name: o.name,
          ticker: (o.ticker || "").toUpperCase() || null,
          value,
          income_monthly: income,
          currency: o.currency || "RUB",
          notes: o.notes || null,
          source: "manual",
          updated_at: new Date().toISOString(),
        };
        const wasEdit = Boolean(state.editingId);
        const { error } = wasEdit
          ? await client.from("invest_positions").update(row).eq("id", state.editingId)
          : await client.from("invest_positions").insert(row);
        if (error) {
          if (msg) {
            msg.textContent =
              /income_monthly|schema cache/i.test(error.message || "")
                ? "Нужна колонка income_monthly — ещё раз выполните supabase/invest.sql в SQL Editor."
                : error.message;
          }
          return;
        }
        resetPosForm(pos);
        if (msg) msg.textContent = wasEdit ? "Обновлено." : "Сохранено.";
        await loadPositions();
      });
      if (pos.side) {
        pos.side.addEventListener("change", () => syncPosHints(pos));
      }
      if (pos.asset_class) {
        pos.asset_class.addEventListener("change", () => {
          if (pos.asset_class.value === "автомобиль" && !state.editingId && pos.side) {
            pos.side.value = "asset";
          }
          syncPosHints(pos);
        });
      }
      syncPosHints(pos);
      const cancel = $("[data-pos-cancel]");
      if (cancel) {
        cancel.addEventListener("click", () => {
          resetPosForm(pos);
          const msg = $("[data-pos-form-msg]");
          if (msg) msg.textContent = "";
        });
      }
    }

    document.addEventListener("click", async (e) => {
      const editBtn = e.target.closest("[data-edit-pos]");
      if (editBtn) {
        const id = editBtn.getAttribute("data-edit-pos");
        const row = state.positions.find((p) => String(p.id) === String(id));
        const form = $("[data-pos-form]");
        if (row && form) fillPosForm(form, row);
        return;
      }
      const ownCar = e.target.closest("[data-own-car]");
      if (ownCar) {
        const id = ownCar.getAttribute("data-own-car");
        const client = sb();
        if (client && id) {
          await client
            .from("invest_positions")
            .update({ side: "asset", updated_at: new Date().toISOString() })
            .eq("id", id);
          await loadPositions();
        }
        return;
      }
      const fix = e.target.closest("[data-ov-fix]");
      if (fix && fix.getAttribute("data-ov-fix") === "cars") {
        fix.disabled = true;
        await reclassVehicleLiabilities();
        return;
      }
      const btn = e.target.closest("[data-del-pos]");
      if (!btn) return;
      const id = btn.getAttribute("data-del-pos");
      const client = sb();
      if (!client) return;
      await client.from("invest_positions").delete().eq("id", id);
      if (state.editingId && String(state.editingId) === String(id)) {
        resetPosForm($("[data-pos-form]"));
      }
      await loadPositions();
    });

    ["side", "class", "source"].forEach((k) => {
      const el = $("[data-filter-" + k + "]");
      if (!el) return;
      el.addEventListener("change", () => {
        if (k === "side") state.filters.side = el.value;
        if (k === "class") state.filters.asset_class = el.value;
        if (k === "source") state.filters.source = el.value;
        renderPortfolio();
      });
    });

    const analyze = $("[data-analyze-form]");
    if (analyze) {
      analyze.addEventListener("submit", (e) => {
        e.preventDefault();
        const ticker = (analyze.ticker.value || "").trim();
        if (ticker) runAnalysis(ticker);
      });
    }

    const sector = $("[data-fund-form] select[name=sector]");
    const nonfin = $("[data-fund-nonfin]");
    const fin = $("[data-fund-fin]");
    if (sector) {
      sector.addEventListener("change", () => {
        toggleFundSector(sector.value === "fin");
      });
    }

    const pullBtn = $("[data-fund-pull]");
    if (pullBtn) {
      pullBtn.addEventListener("click", async () => {
        const ticker = (($("#invest-ticker-input") || {}).value || "").trim();
        const note = $("[data-fund-pull-note]");
        if (!ticker) {
          if (note) note.textContent = "Сначала укажите тикер в поле автоанализа.";
          return;
        }
        if (!FundFetch || typeof FundFetch.pullFundamentals !== "function") {
          if (note) note.textContent = "Модуль загрузки отчётности не загрузился.";
          return;
        }
        pullBtn.disabled = true;
        if (note) note.textContent = "Ищем отчётность компании…";
        try {
          const result = await FundFetch.pullFundamentals(ticker, {
            config: cfg(),
            timeoutMs: 10000,
          });
          applyFundPull(result);
          writeFundCache(ticker, result);
          const n = result.fields ? Object.keys(result.fields).length : 0;
          if (!n && note) {
            note.textContent =
              (note.textContent ? note.textContent + " · " : "") +
              "Цифр не собрали — откройте e-disclosure вручную или вставьте поля сами.";
          }
        } catch (err) {
          if (note) {
            note.textContent =
              "Не удалось подтянуть отчётность: " +
              (err && err.message ? err.message : String(err)) +
              ". Можно вставить поля вручную. Reader: r.jina.ai (CORS); свой прокси — CABINET_CONFIG.fundProxy.";
          }
        }
        pullBtn.disabled = false;
      });
    }

    const riskForm = $("[data-risk-form]");
    if (riskForm) {
      riskForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = $("[data-risk-msg]");
        const answers = readForm(riskForm);
        answers.acknowledgement = Boolean(riskForm.acknowledgement.checked);
        const scored = Fund.scoreRiskAnswers(answers);
        if (scored.error) {
          if (msg) msg.textContent = scored.error;
          return;
        }
        const client = sb();
        if (!client || !state.user) return;
        const row = {
          user_id: state.user.id,
          horizon: scored.horizon,
          liquidity: scored.liquidity,
          reserve: scored.reserve,
          drawdown_behavior: scored.drawdown_behavior,
          expense_impact: scored.expense_impact,
          volatility: scored.volatility,
          acknowledgement: true,
          answers: scored.answers,
          risk_level: scored.risk_level,
          warn_drawdown_pct: scored.warn_drawdown_pct,
          completed_at: scored.completed_at,
          updated_at: new Date().toISOString(),
        };
        const { error } = await client.from("invest_risk_profiles").upsert(row, { onConflict: "user_id" });
        if (error) {
          if (msg) {
            msg.textContent =
              error.message && /does not exist|schema cache/i.test(error.message)
                ? "Сначала выполните supabase/invest.sql в SQL Editor."
                : error.message;
          }
          return;
        }
        if (msg) msg.textContent = "Анкета сохранена.";
        await loadProfile();
      });
    }

    const edit = $("[data-risk-edit]");
    if (edit) {
      edit.addEventListener("click", () => {
        const wrap = $("[data-risk-form-wrap]");
        if (wrap) wrap.hidden = false;
      });
    }

    $("[data-act-new]") &&
      $("[data-act-new]").addEventListener("click", () => {
        showView("analyze");
        const inp = document.getElementById("invest-ticker-input");
        if (inp) {
          inp.value = "";
          inp.focus();
        }
      });

    $("[data-act-portfolio]") &&
      $("[data-act-portfolio]").addEventListener("click", () => {
        const r = state.lastResult;
        showView("portfolio");
        const form = $("[data-pos-form]");
        if (!form || !r) return;
        form.side.value = "asset";
        form.asset_class.value = "акции";
        form.name.value = r.name || r.ticker;
        form.ticker.value = r.ticker || "";
        form.notes.value = "из отчёта " + r.verdict;
        form.value.focus();
      });

    $("[data-act-watch]") &&
      $("[data-act-watch]").addEventListener("click", () => {
        addCurrentToWatch();
      });

    const watchRefresh = $("[data-watch-refresh]");
    if (watchRefresh) watchRefresh.addEventListener("click", () => refreshWatchAll());
    const ovRefresh = $("[data-ov-watch-refresh]");
    if (ovRefresh) ovRefresh.addEventListener("click", () => refreshWatchAll());
    const ovWatch = $("[data-ov-watch]");
    if (ovWatch) {
      ovWatch.addEventListener("click", (e) => {
        const btn = e.target && e.target.closest ? e.target.closest("[data-ov-open]") : null;
        if (!btn) return;
        const ticker = btn.getAttribute("data-ov-open");
        const inp = document.getElementById("invest-ticker-input");
        if (inp) inp.value = ticker || "";
        runAnalysis(ticker);
      });
    }

    const watchHost = $("[data-watch-list]");
    if (watchHost) {
      watchHost.addEventListener("click", (e) => {
        const one = e.target.closest("[data-watch-one]");
        const open = e.target.closest("[data-watch-open]");
        const del = e.target.closest("[data-watch-del]");
        if (one) {
          refreshWatchTicker(one.getAttribute("data-watch-one")).catch((err) => {
            const status = $("[data-watch-status]");
            if (status) status.textContent = err && err.message ? err.message : String(err);
          });
          return;
        }
        if (open) {
          const ticker = open.getAttribute("data-watch-open");
          const inp = document.getElementById("invest-ticker-input");
          if (inp) inp.value = ticker || "";
          runAnalysis(ticker);
          return;
        }
        if (del) {
          removeWatch(del.getAttribute("data-watch-del"), del.getAttribute("data-watch-ticker"));
        }
      });
    }
  }

  async function boot() {
    fillSelect($("[data-asset-class]"), ASSET_CLASSES, true, "Выберите класс");
    fillSelect($("[data-filter-class]"), ASSET_CLASSES, true);
    fillRiskOptions();
    setupNav();
    setupForms();
    showView(currentView());

    if (!Auth || !Auth.isConfigured || !Auth.isConfigured()) {
      window.location.replace("cabinet.html");
      return;
    }

    const wait = $("[data-invest-wait]");
    let session = null;
    try {
      const res = await Auth.setupAuth();
      session = res && res.session;
    } catch {
      session = null;
    }
    if (!session) {
      const client = Auth.getClient();
      if (client) {
        try {
          const { data } = await client.auth.getSession();
          session = data && data.session;
        } catch {
          session = null;
        }
      }
    }
    if (!session || !session.user) {
      window.location.replace("cabinet.html");
      return;
    }

    state.user = session.user;
    if (wait) wait.hidden = true;
    document.body.classList.remove("cabinet-locked");

    const client = Auth.getClient();
    if (client) {
      client.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") window.location.replace("cabinet.html");
      });
    }

    await Promise.all([loadProfile(), loadPositions(), loadDesk(), loadMarketQuotes(), loadWatchlist()]);
    await migrateWatchStubs();
    renderPortfolio();
    renderWatchlist();
    renderOverview();
  }

  boot();
})();
