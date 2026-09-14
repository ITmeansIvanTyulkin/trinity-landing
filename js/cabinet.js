(() => {
  const data = window.CABINET_DATA;
  if (!data) return;

  function cfg() {
    return window.CABINET_CONFIG || {};
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = (n) => new Intl.NumberFormat("ru-RU").format(Math.round(n));
  const rub = (n) => fmt(n) + " ₽";

  const Lab = window.TrinityDecisionLab;
  const Unlock = window.TrinityUnlockKey;
  const Snap = window.TrinityDeskSnapshot;
  const Journals = window.TrinityDeskJournals;

  function setText(sel, text) {
    const el = document.querySelector(sel);
    if (el) el.textContent = text;
  }

  const REGIME_RU = {
    UNKNOWN: "Неизвестно",
    SIDEWAYS: "Боковик",
    NEUTRAL: "Нейтральный",
    TREND: "Тренд",
    ARBITRAGE: "Арбитраж",
  };
  const BOOK_RU = {
    DAILY: "Дневной",
    INTRADAY: "Внутри дня",
    TREND: "Тренд",
    ARB: "Арбитраж",
  };
  const SLOT_STATUS_RU = {
    OPEN: "Открыта",
    WATCH: "Наблюдение",
    CLOSED: "Закрыта",
  };
  const LAB_OUTCOME_RU = {
    "PAPER OPEN": "Можно открыть",
    WATCH: "Подождать",
    BLOCK: "Нельзя",
    RESEARCH: "Пока только смотреть",
  };

  function regimeLabel(code) {
    const c = String(code || "UNKNOWN").toUpperCase();
    return REGIME_RU[c] || code || "Неизвестно";
  }

  function bookLabel(code) {
    const c = String(code || "DAILY").toUpperCase();
    return BOOK_RU[c] || code || "Дневной";
  }

  function slotStatusLabel(code) {
    const c = String(code || "").toUpperCase();
    return SLOT_STATUS_RU[c] || code || "—";
  }

  function labOutcomeLabel(code) {
    return LAB_OUTCOME_RU[code] || code || "";
  }

  function imoexBase() {
    const configured = String(cfg().imoexBase || "").replace(/\/$/, "");
    if (!configured) return "";
    try {
      const u = new URL(configured);
      const localDesk =
        (u.hostname === "127.0.0.1" || u.hostname === "localhost") &&
        u.port === "8080";
      if (localDesk && typeof location !== "undefined" && location.origin) {
        return location.origin.replace(/\/$/, "") + "/imoex-api";
      }
    } catch (_) {
      /* keep configured */
    }
    return configured;
  }

  function isRegimeFromDesk() {
    const k = data.liveSource && data.liveSource.kind;
    return k === "live" || k === "local" || k === "stale";
  }

  function paintLiveSource() {
    const info =
      data.liveSource ||
      (Snap && Snap.dataSourceCopy("none")) || {
        kind: "empty",
        flag: "Нет снимка",
        line: "Это не живые данные. Приложение ещё не присылало снимок — блоки пустые, без выдуманного результата.",
      };
    document.querySelectorAll("[data-live-status], [data-data-source]").forEach(function (el) {
      el.textContent = info.line;
      el.dataset.liveKind = info.kind;
    });
    const flag = document.querySelector("[data-regime-live]");
    if (flag) {
      flag.textContent = info.flag;
      flag.dataset.liveKind = info.kind;
    }
    const card = document.querySelector("[data-regime-card]");
    if (card) card.dataset.liveKind = info.kind;
  }

  function applyNormalizedSnapshot(snap) {
    const s = data.subscription;
    s.trialTotalDays = (Snap && Snap.TRIAL_DAYS) || 7;
    s.licenseStatus = (snap && snap.licenseStatus) || "";
    s.trialActive = Boolean(snap && snap.trialActive);
    s.trialDaysLeft = (snap && snap.trialDaysLeft) || 0;
    s.reverseTrialNote = Snap
      ? Snap.licenseCopy(snap || Snap.normalize(null))
      : s.reverseTrialNote;

    data.liveSource = Snap
      ? Snap.dataSourceCopy(snap && snap.hasRow ? "snapshot" : "none", {
          stale: Boolean(snap && snap.stale),
          updatedAt: snap && snap.updatedAt,
        })
      : data.liveSource;

    if (!snap || !snap.hasRow) {
      applyRegime({
        current: "UNKNOWN",
        book: "DAILY",
        note: "Режим рынка придёт из приложения, когда оно пришлёт снимок. Запустите стол на компьютере.",
        source: "offline",
      });
      renderOverview();
      paintKeyNote();
      return;
    }

    applyRegime({
      current: snap.regimeLabel,
      book: snap.book,
      note: snap.regimeNote || regimeLabel(snap.regimeLabel),
      source: "snapshot",
    });

    data.paperSummary = {
      realizedPnlRub: snap.realizedPnlRub,
      unrealizedPnlRub: snap.unrealizedPnlRub,
      openCount: snap.openCount,
      closedCount: snap.closedCount,
      updatedAt: snap.updatedAt,
    };
    data.openSlots = snap.openSlots || [];
    const realized = snap.realizedPnlRub != null ? rub(snap.realizedPnlRub) : "—";
    const unrealized =
      snap.unrealizedPnlRub != null ? rub(snap.unrealizedPnlRub) : "—";
    data.equityCurve = {
      points: snap.equityPoints || [],
      marks: (snap.equityPoints || []).map(function (v, i) {
        return { v: v, index: i, t: "", day: "", pnl: null };
      }),
      dayMarks: (snap.equityPoints || []).map(function (v, i) {
        return { v: v, index: i, t: "", day: "", pnl: null, count: 1 };
      }),
      label: (snap.equityPoints || []).length
        ? "Закрытые сделки со стола"
        : "Пока нет закрытых сделок",
      note:
        "Закрыто: " +
        realized +
        " · в работе: " +
        unrealized +
        " · позиций: " +
        snap.openCount +
        " · сделок: " +
        snap.closedCount +
        " · со стола",
    };

    if (data.unlockKey) {
      if (snap.licenseStatus === "active") {
        data.unlockKey.note =
          "Подписка активна. Автоторги роботом — в приложении на компьютере.";
      } else if (snap.licenseStatus === "expired") {
        data.unlockKey.note =
          "Триал закончился. Оплатите — стол снова заработает, включатся автоторги у брокера.";
      } else if (snap.licenseStatus === "trial") {
        data.unlockKey.note =
          "Триал идёт в приложении. Живых заявок у брокера нет.";
      }
    }

    if (Lab) {
      applyLabDesk({
        regime: {
          label: snap.regimeLabel,
          current: snap.regimeLabel,
        },
        slots: snap.openSlots || [],
      });
    }

    renderOverview();
    renderOps();
    drawEquity();
    paintKeyNote();
    refreshLab();
  }

  function paintKeyNote() {
    const keyNote = document.querySelector("[data-key-note]");
    if (keyNote && data.unlockKey) {
      keyNote.textContent = data.unlockKey.note || "";
    }
  }

  function applyRegime(r) {
    if (!r) return;
    data.regime = Object.assign({}, data.regime, r);
    setText("[data-regime-note]", data.regime.note || "");
    const fromDesk = isRegimeFromDesk();
    const bookEl = document.querySelector("[data-regime-book]");
    if (bookEl) {
      bookEl.hidden = !fromDesk;
      bookEl.textContent = fromDesk ? bookLabel(data.regime.book || "DAILY") : "";
    }
    const pill = document.querySelector("[data-regime-pill]");
    if (pill) {
      pill.dataset.mode = fromDesk ? data.regime.current || "UNKNOWN" : "UNKNOWN";
      pill.textContent = fromDesk
        ? regimeLabel(data.regime.current || "UNKNOWN")
        : "Нет данных";
    }
  }

  function applyDeskBundle(merged, licenseSnap) {
    if (!merged) return;
    data.paperSummary = {
      realizedPnlRub: merged.realizedPnlRub,
      unrealizedPnlRub: merged.unrealizedPnlRub,
      openCount: merged.openCount,
      closedCount: merged.closedCount,
      updatedAt: merged.updatedAt,
      todayPnlRub: merged.todayPnlRub,
      todayClosedCount: merged.todayClosedCount,
    };
    data.openSlots = merged.openSlots || [];
    const realized = merged.realizedPnlRub != null ? rub(merged.realizedPnlRub) : "—";
    const unrealized =
      merged.unrealizedPnlRub != null ? rub(merged.unrealizedPnlRub) : "—";
    let note =
      "Закрыто: " +
      realized +
      " · в работе: " +
      unrealized +
      " · позиций: " +
      merged.openCount +
      " · сделок: " +
      merged.closedCount +
      " · пары, нефть, арбитраж";
    if (merged.todayClosedCount) {
      const today = merged.todayPnlRub || 0;
      note +=
        " · сегодня " +
        (today > 0 ? "+" : "") +
        fmt(today) +
        " ₽ (" +
        merged.todayClosedCount +
        ")";
    }
    data.equityCurve = {
      points: merged.equityPoints || [],
      marks: merged.equityMarks || [],
      dayMarks: merged.dayMarks || [],
      label: (merged.equityPoints || []).length
        ? "Закрытые сделки со стола"
        : "Пока нет закрытых сделок",
      note: note,
    };
    data.bookSplit = merged.byBook || [];
    drawAllocation();

    data.liveSource = Snap
      ? Snap.dataSourceCopy("local")
      : {
          kind: "local",
          flag: "С этого компьютера",
          line: "Живые данные с приложения на этом компьютере.",
        };

    if (licenseSnap && licenseSnap.hasRow && Snap) {
      const s = data.subscription;
      s.trialTotalDays = Snap.TRIAL_DAYS || 7;
      s.licenseStatus = licenseSnap.licenseStatus || "";
      s.trialActive = Boolean(licenseSnap.trialActive);
      s.trialDaysLeft = licenseSnap.trialDaysLeft || 0;
      s.reverseTrialNote = Snap.licenseCopy(licenseSnap);
    } else {
      data.subscription.reverseTrialNote =
        "Счётчик триала в кабинете появится, когда приложение запишет снимок. Сейчас цифры — с этого компьютера, по всем стратегиям.";
    }

    renderOps();
    drawEquity();
    renderOverview();
    refreshLab();
  }

  async function getJson(url, signal) {
    try {
      const res = await fetch(url, { signal: signal });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function applyLabDesk(parts) {
    if (!Lab || typeof Lab.buildLabState !== "function") return;
    const state = Lab.buildLabState(parts || {});
    data.labDesk = state;
    data.labPairs = state.pairs || [];
    refreshLab();
  }

  async function loadLabFromDesk() {
    const base = imoexBase();
    if (!base || !Lab) return false;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const [regime, report, cluster, finals, pairs] = await Promise.all([
        getJson(base + "/api/analysis/regime", ctrl.signal),
        getJson(base + "/api/analysis/report", ctrl.signal),
        getJson(base + "/api/analysis/cluster-review", ctrl.signal),
        getJson(base + "/api/analysis/final", ctrl.signal),
        getJson(base + "/api/paper/journal", ctrl.signal),
      ]);
      clearTimeout(t);
      if (!(regime || report || cluster || finals || pairs)) return false;
      applyLabDesk({
        regime: regime,
        report: report,
        cluster: cluster,
        finals: finals || [],
        journal: pairs,
      });
      return true;
    } catch {
      clearTimeout(t);
      return false;
    }
  }

  /* —— Optional local IMOEX (developer machine only) —— */
  async function tryImoexStub(licenseSnap) {
    const base = imoexBase();
    if (!base) return false;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    try {
      const [pairs, trend, arb, regime, plaques, report, cluster, finals] =
        await Promise.all([
          getJson(base + "/api/paper/journal", ctrl.signal),
          getJson(base + "/api/trend/paper", ctrl.signal),
          getJson(base + "/api/calendar-arb/status", ctrl.signal),
          getJson(base + "/api/analysis/regime", ctrl.signal),
          getJson(base + "/api/desk/plaques", ctrl.signal),
          getJson(base + "/api/analysis/report", ctrl.signal),
          getJson(base + "/api/analysis/cluster-review", ctrl.signal),
          getJson(base + "/api/analysis/final", ctrl.signal),
        ]);
      clearTimeout(t);

      let ok = false;
      if (Journals && (pairs || trend || arb)) {
        applyDeskBundle(Journals.mergeDeskJournals({ pairs: pairs, trend: trend, arb: arb }), licenseSnap);
        ok = true;
      }
      if (Journals && (plaques || arb)) {
        data.strategies = Journals.strategiesFromDesk(plaques, arb);
        renderStrategies();
        ok = true;
      }

      if (regime) {
        const label = regime.label || "UNKNOWN";
        let cleaned = String(regime.detail || "")
          .replace(/^ADX\s*=\s*[\d.,]+\s*[—–-]\s*/i, "")
          .replace(/\bADX\b=?/gi, "")
          .replace(/\s+/g, " ")
          .trim();
        if (cleaned) {
          cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
          if (!/[.!?…]$/.test(cleaned)) cleaned += ".";
        }
        const adxBit =
          typeof regime.adx === "number" && !Number.isNaN(regime.adx)
            ? " Сила тренда — " + regime.adx.toFixed(1).replace(".", ",") + "."
            : "";
        data.liveSource = Snap
          ? Snap.dataSourceCopy("local")
          : {
              kind: "local",
              flag: "С этого компьютера",
              line: "Живые данные с приложения на этом компьютере.",
            };
        applyRegime({
          current: label,
          book: "DAILY",
          adx: regime.adx,
          source: "imoex",
          note:
            (cleaned || regimeLabel(label)) +
            (regime.blockEntries ? " Новые входы в пары сейчас закрыты." : "") +
            adxBit,
        });
        ok = true;
        renderOverview();
      }

      if (Lab && (regime || report || cluster || finals || pairs)) {
        applyLabDesk({
          regime: regime,
          report: report,
          cluster: cluster,
          finals: finals || [],
          journal: pairs,
        });
        ok = true;
      }
      return ok;
    } catch {
      clearTimeout(t);
      return false;
    }
  }

  async function loadDeskLive() {
    const auth = window.TrinityCabinetAuth;
    const sb = auth && typeof auth.getClient === "function" ? auth.getClient() : null;
    let licenseSnap = null;
    if (sb && Snap) {
      try {
        const { data: sessionData } = await sb.auth.getSession();
        const user =
          sessionData && sessionData.session && sessionData.session.user;
        if (user) {
          const { data: row, error } = await sb
            .from("desk_snapshots")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();
          if (!error && row) {
            const snap = Snap.normalize(row);
            const emptyMarket = Journals
              ? Journals.isMarketEmpty(snap)
              : !snap.closedCount && !snap.openCount;
            if (!emptyMarket) {
              applyNormalizedSnapshot(snap);
              await loadLabFromDesk();
              return;
            }
            licenseSnap = snap;
          }
        }
      } catch {
        /* snapshot missing is fine */
      }
    }
    const local = await tryImoexStub(licenseSnap);
    if (!local) {
      if (licenseSnap) applyNormalizedSnapshot(licenseSnap);
      else applyNormalizedSnapshot(Snap ? Snap.normalize(null) : null);
    }
  }

  /* —— Overview —— */
  function renderOverview() {
    const s = data.subscription;
    const r = data.regime || {};
    setText("[data-tier]", s.tier);
    setText("[data-tier-price]", fmt(s.priceRub) + " ₽/мес");
    setText("[data-delivery]", s.delivery);
    setText("[data-next-billing]", s.nextBilling);
    setText("[data-trial-note]", s.reverseTrialNote);
    paintLiveSource();
    applyRegime(r);

    const badge = document.querySelector("[data-trial-badge]");
    if (badge) {
      if (s.trialActive) {
        badge.hidden = false;
        badge.textContent =
          "Пробный · " + s.trialDaysLeft + " из " + s.trialTotalDays + " дн.";
      } else if (s.licenseStatus === "expired") {
        badge.hidden = false;
        badge.textContent = "Триал закончился";
      } else if (s.licenseStatus === "active") {
        badge.hidden = false;
        badge.textContent = "Подписка";
      } else {
        badge.hidden = true;
      }
    }

    const bar = document.querySelector("[data-trial-bar]");
    const track = bar && bar.parentElement;
    if (bar && s.trialActive) {
      if (track) track.hidden = false;
      const pct = Math.max(0, Math.min(100, (s.trialDaysLeft / s.trialTotalDays) * 100));
      bar.style.width = pct + "%";
    } else if (track) {
      track.hidden = true;
    }
  }

  /* —— Slots table —— */
  let openDealKey = "";
  let slotsBound = false;

  function dealKey(row, i) {
    return String(row.id || row.pair || "deal") + "|" + String(row.closedAt || row.t || "") + "|" + i;
  }

  function formatDealWhen(iso, part) {
    const t = Date.parse(iso || "");
    if (!Number.isFinite(t)) return "—";
    const d = new Date(t);
    if (part === "date") {
      return d.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
    return d.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function addDealFact(root, label, value, mono) {
    const item = document.createElement("div");
    item.className = "cab-deal-fact";
    const k = document.createElement("span");
    k.className = "cab-deal-k";
    k.textContent = label;
    const v = document.createElement("span");
    v.className = "cab-deal-v" + (mono ? " mono" : "");
    v.textContent = value == null || value === "" ? "—" : value;
    item.appendChild(k);
    item.appendChild(v);
    root.appendChild(item);
  }

  function setDealExpanded(tbody, key) {
    openDealKey = key;
    tbody.querySelectorAll("[data-deal-row]").forEach(function (tr) {
      const on = tr.getAttribute("data-deal-key") === key;
      tr.classList.toggle("is-open", on);
      tr.setAttribute("aria-expanded", on ? "true" : "false");
    });
    tbody.querySelectorAll("[data-deal-detail]").forEach(function (tr) {
      const on = tr.getAttribute("data-deal-for") === key;
      tr.classList.toggle("is-open", on);
      tr.setAttribute("aria-hidden", on ? "false" : "true");
    });
  }

  function renderOps() {
    const tbody = document.querySelector("[data-slots-body]");
    if (!tbody) return;
    tbody.innerHTML = "";
    const rows = data.openSlots || [];
    if (!rows.length) {
      openDealKey = "";
      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td colspan="5" class="cab-empty-cell">Сделок здесь нет. Они появятся, когда приложение пришлёт пары, нефть или арбитраж.</td>';
      tbody.appendChild(tr);
      return;
    }
    rows.forEach((row, i) => {
      const key = dealKey(row, i);
      const status = row.status || "WATCH";
      const facts = Journals && Journals.dealFacts ? Journals.dealFacts(row) : null;
      const tr = document.createElement("tr");
      tr.className = "cab-deal-row";
      tr.setAttribute("data-deal-row", "");
      tr.setAttribute("data-deal-key", key);
      tr.setAttribute("tabindex", "0");
      tr.setAttribute("role", "button");
      tr.setAttribute("aria-expanded", "false");
      tr.title = "Нажмите, чтобы открыть детали сделки";

      const tdPair = document.createElement("td");
      const pairWrap = document.createElement("span");
      pairWrap.className = "cab-deal-pair";
      const pairName = document.createElement("span");
      pairName.textContent = row.pair;
      const chev = document.createElement("span");
      chev.className = "cab-deal-chev";
      chev.setAttribute("aria-hidden", "true");
      pairWrap.appendChild(pairName);
      pairWrap.appendChild(chev);
      tdPair.appendChild(pairWrap);

      const tdBook = document.createElement("td");
      tdBook.textContent = bookLabel(row.book);

      const tdZ = document.createElement("td");
      tdZ.className = "mono";
      tdZ.textContent = row.z;

      const tdStatus = document.createElement("td");
      const chip = document.createElement("span");
      chip.className = "chip chip-" + status.toLowerCase();
      chip.textContent = slotStatusLabel(status);
      tdStatus.appendChild(chip);

      const tdSize = document.createElement("td");
      tdSize.className = "mono";
      tdSize.textContent = row.size;

      tr.appendChild(tdPair);
      tr.appendChild(tdBook);
      tr.appendChild(tdZ);
      tr.appendChild(tdStatus);
      tr.appendChild(tdSize);
      tbody.appendChild(tr);

      const detail = document.createElement("tr");
      detail.className = "cab-deal-detail";
      detail.setAttribute("data-deal-detail", "");
      detail.setAttribute("data-deal-for", key);
      detail.setAttribute("aria-hidden", "true");
      const td = document.createElement("td");
      td.colSpan = 5;
      const clip = document.createElement("div");
      clip.className = "cab-deal-clip";
      const inner = document.createElement("div");
      inner.className = "cab-deal-clip-inner";
      const sheet = document.createElement("div");
      sheet.className = "cab-deal-sheet";
      const sub = document.createElement("div");
      sub.className = "cab-deal-sub";
      const grid = document.createElement("div");
      grid.className = "cab-deal-facts";

      const when = facts && (facts.closedAt || facts.openedAt);
      addDealFact(grid, "Тикер", facts ? facts.ticker : row.pair, true);
      addDealFact(grid, "Направление", facts ? facts.side : "—");
      addDealFact(grid, "Количество", facts && facts.qty ? facts.qty : "—", true);
      addDealFact(grid, "Вход", facts ? facts.entry : "—", true);
      addDealFact(grid, "Выход", facts ? facts.exit : "—", true);
      addDealFact(grid, "Закрытие", facts ? facts.reason : "—");
      addDealFact(grid, "Дата", formatDealWhen(when, "date"));
      addDealFact(grid, "Время", formatDealWhen(when, "time"), true);
      if (facts && facts.openedAt && facts.closedAt) {
        addDealFact(grid, "Открыта", formatDealWhen(facts.openedAt, "time"), true);
      }
      if (facts && facts.pnl != null) {
        const pnlText =
          (facts.pnl > 0 ? "+" : "") +
          fmt(facts.pnl) +
          " ₽";
        addDealFact(grid, "Результат", pnlText, true);
      }

      sub.appendChild(grid);
      sheet.appendChild(sub);
      inner.appendChild(sheet);
      clip.appendChild(inner);
      td.appendChild(clip);
      detail.appendChild(td);
      tbody.appendChild(detail);
    });

    if (openDealKey) setDealExpanded(tbody, openDealKey);

    if (!slotsBound) {
      slotsBound = true;
      tbody.addEventListener("click", function (ev) {
        const row = ev.target.closest("[data-deal-row]");
        if (!row || !tbody.contains(row)) return;
        const key = row.getAttribute("data-deal-key");
        setDealExpanded(tbody, openDealKey === key ? "" : key);
      });
      tbody.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        const row = ev.target.closest("[data-deal-row]");
        if (!row || !tbody.contains(row)) return;
        ev.preventDefault();
        const key = row.getAttribute("data-deal-key");
        setDealExpanded(tbody, openDealKey === key ? "" : key);
      });
    }
  }

  /* —— Equity chart (canvas) —— */
  const GOLD = "#c4a35a";
  let equityHover = { on: false, x: 0, y: 0, index: -1 };
  let equityBound = false;

  function signedRub(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    const r = Math.round(Number(n));
    return (r > 0 ? "+" : "") + fmt(r) + " ₽";
  }

  function fmtChartDay(iso) {
    const t = Date.parse(iso || "");
    if (!Number.isFinite(t)) return "";
    return new Date(t).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
    });
  }

  function paintGoldDot(ctx, x, y, r, ring) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = GOLD;
    ctx.fill();
    if (ring) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    }
  }

  function drawEquity() {
    const canvas = document.getElementById("equity-chart");
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const tip = document.querySelector("[data-equity-tip]");
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const curve = data.equityCurve || {};
    const pts = curve.points || [];
    const label = document.querySelector("[data-equity-end]");
    const sub = document.querySelector("[data-equity-sub]");
    if (sub) sub.textContent = curve.note || "";

    if (!pts.length) {
      if (tip) tip.hidden = true;
      ctx.fillStyle = "#6a7680";
      ctx.font = "13px 'IBM Plex Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(curve.label || "Пока нечего показать", w / 2, h / 2 - 6);
      ctx.font = "12px 'IBM Plex Sans', sans-serif";
      ctx.fillText("Запустите приложение — снимок появится здесь", w / 2, h / 2 + 14);
      if (label) {
        const ps = data.paperSummary || {};
        label.textContent =
          ps.realizedPnlRub != null ? rub(ps.realizedPnlRub) : "—";
      }
      return;
    }

    const marks = curve.marks && curve.marks.length
      ? curve.marks
      : pts.map(function (v, i) {
          return { v: v, index: i, t: "", day: "" };
        });
    const dayMarks = curve.dayMarks && curve.dayMarks.length
      ? curve.dayMarks
      : marks.map(function (m, i) {
          return {
            v: m.v,
            index: m.index != null ? m.index : i,
            t: m.t,
            day: m.day,
            pnl: m.pnl,
            count: 1,
          };
        });

    const min = Math.min.apply(null, pts) * 0.995;
    const max = Math.max.apply(null, pts) * 1.005;
    const pad = { t: 16, r: 12, b: 28, l: 52 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const span = Math.max(pts.length - 1, 1);
    const xAt = function (i) {
      return pad.l + (iw * i) / span;
    };
    const yAt = function (v) {
      return pad.t + ih * (1 - (v - min) / (max - min || 1));
    };

    ctx.strokeStyle = "rgba(30,42,50,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ih * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      const val = max - ((max - min) * i) / 4;
      ctx.fillStyle = "#6a7680";
      ctx.font = "11px 'IBM Plex Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText(fmt(val), pad.l - 8, y + 4);
    }

    ctx.beginPath();
    pts.forEach(function (v, i) {
      const x = xAt(i);
      const y = yAt(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(xAt(pts.length - 1), pad.t + ih);
    ctx.lineTo(xAt(0), pad.t + ih);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
    grad.addColorStop(0, "rgba(11,122,102,0.28)");
    grad.addColorStop(1, "rgba(11,122,102,0)");
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    pts.forEach(function (v, i) {
      const x = xAt(i);
      const y = yAt(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#0b7a66";
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    ctx.stroke();

    const last = pts[pts.length - 1];
    paintGoldDot(ctx, xAt(pts.length - 1), yAt(last), 4, false);

    let hoverMark = null;
    if (equityHover.on && pts.length) {
      const ratio = Math.max(0, Math.min(1, (equityHover.x - pad.l) / iw));
      const nearest = Math.round(ratio * span);
      hoverMark = marks[nearest] || { v: pts[nearest], index: nearest };
      const hoverDay = hoverMark.day || "";
      dayMarks.forEach(function (d) {
        const idx = d.index != null ? d.index : 0;
        const active = hoverDay && d.day && d.day === hoverDay;
        paintGoldDot(ctx, xAt(idx), yAt(d.v), active ? 5.5 : 3.5, active);
      });
      const hx = xAt(nearest);
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(196,163,90,0.55)";
      ctx.lineWidth = 1;
      ctx.moveTo(hx, pad.t);
      ctx.lineTo(hx, pad.t + ih);
      ctx.stroke();
      ctx.setLineDash([]);
      paintGoldDot(ctx, hx, yAt(pts[nearest]), 5.5, true);
    }

    if (label) label.textContent = rub(last);

    if (tip) {
      if (hoverMark) {
        const day = fmtChartDay(hoverMark.t);
        const total = signedRub(hoverMark.v);
        const dayHit = dayMarks.filter(function (d) {
          return hoverMark.day && d.day === hoverMark.day;
        })[0];
        let text = total;
        if (day) text = day + " · " + text;
        if (dayHit && dayHit.pnl != null && dayHit.count) {
          text +=
            " · день " +
            signedRub(dayHit.pnl) +
            " (" +
            dayHit.count +
            ")";
        }
        tip.hidden = false;
        tip.textContent = text;
        const tw = tip.offsetWidth;
        const th = tip.offsetHeight;
        let left = equityHover.x - tw / 2;
        let top = equityHover.y - th - 12;
        const boxW = wrap ? wrap.clientWidth : w;
        left = Math.max(8, Math.min(left, boxW - tw - 8));
        top = Math.max(6, top);
        tip.style.transform = "translate(" + left + "px," + top + "px)";
      } else {
        tip.hidden = true;
      }
    }

    if (!equityBound) {
      equityBound = true;
      canvas.addEventListener("pointermove", function (ev) {
        const rect = canvas.getBoundingClientRect();
        equityHover = {
          on: true,
          x: ev.clientX - rect.left,
          y: ev.clientY - rect.top,
          index: -1,
        };
        drawEquity();
      });
      canvas.addEventListener("pointerleave", function () {
        equityHover = { on: false, x: 0, y: 0, index: -1 };
        drawEquity();
      });
    }
  }

  function dealsWord(n) {
    const abs = Math.abs(Math.round(Number(n) || 0));
    const n10 = abs % 10;
    const n100 = abs % 100;
    if (n10 === 1 && n100 !== 11) return "сделка";
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "сделки";
    return "сделок";
  }

  /* —— Split of closed paper by strategy —— */
  function drawAllocation() {
    const root = document.querySelector("[data-alloc-bars]");
    if (!root) return;
    const rows = data.bookSplit || [];
    const totalClosed = rows.reduce(function (s, r) {
      return s + (r.closed || 0);
    }, 0);
    root.innerHTML = "";
    root.classList.remove("ready");

    if (!rows.length) {
      const p = document.createElement("p");
      p.className = "cab-panel-sub";
      p.textContent =
        "Когда стол пришлёт сделки, здесь будет разрез: пары, нефть, арбитраж.";
      root.appendChild(p);
      return;
    }

    const colors = {
      DAILY: "var(--accent)",
      TREND: "var(--gold)",
      ARB: "var(--ring)",
    };
    rows.forEach(function (row) {
      const pct = totalClosed ? Math.round(((row.closed || 0) / totalClosed) * 100) : 0;
      const el = document.createElement("div");
      el.className = "alloc-row";
      const meta = document.createElement("div");
      meta.className = "alloc-meta";
      const name = document.createElement("span");
      name.textContent = row.label;
      const val = document.createElement("strong");
      val.textContent =
        (row.closed || 0) +
        " " +
        dealsWord(row.closed) +
        " · " +
        (row.realized != null ? rub(row.realized) : "—");
      meta.appendChild(name);
      meta.appendChild(val);
      const track = document.createElement("div");
      track.className = "alloc-track";
      const bar = document.createElement("i");
      bar.style.setProperty("--w", pct + "%");
      bar.style.setProperty("--c", colors[row.book] || "var(--accent)");
      track.appendChild(bar);
      el.appendChild(meta);
      el.appendChild(track);
      root.appendChild(el);
    });
    const p = document.createElement("p");
    p.className = "cab-panel-sub";
    p.textContent = totalClosed
      ? "Полоска — доля закрытых сделок, не «вес тарифа» и не прогноз доходности."
      : "Закрытых сделок пока нет.";
    root.appendChild(p);

    if (!reduceMotion) {
      requestAnimationFrame(function () {
        root.classList.add("ready");
      });
    } else {
      root.classList.add("ready");
    }
  }

  /* —— Unlock key —— */
  function setupUnlock() {
    const masked = document.querySelector("[data-key-masked]");
    const toggle = document.querySelector("[data-key-toggle]");
    const regen = document.querySelector("[data-key-regen]");
    const rotated = document.querySelector("[data-key-rotated]");
    const keyNote = document.querySelector("[data-key-note]");
    const current = data.unlockKey || {};

    if (keyNote) keyNote.textContent = current.note || "";

    if (current.status === "pending" || !current.full) {
      if (masked) masked.textContent = "Ключ ещё не выдан";
      if (rotated) rotated.textContent = "Ключ появится вместе с приложением. Оплата ещё не подключена.";
      if (toggle) {
        toggle.disabled = true;
        toggle.textContent = "Недоступно";
      }
      if (regen) {
        regen.disabled = true;
        regen.textContent = "Пока недоступно";
      }
      return;
    }

    let revealed = false;

    function paint() {
      if (masked) {
        masked.textContent = Unlock
          ? Unlock.displayKey(current, revealed)
          : revealed
            ? current.full
            : current.masked;
      }
      if (rotated) rotated.textContent = "Обновлён: " + current.lastRotated;
      if (toggle) {
        toggle.textContent = Unlock
          ? Unlock.toggleLabel(revealed)
          : revealed
            ? "Скрыть"
            : "Показать";
      }
    }

    if (toggle) {
      toggle.addEventListener("click", () => {
        revealed = !revealed;
        paint();
      });
    }

    if (regen) {
      regen.addEventListener("click", () => {
        /* Real reissue needs billing backend — keep disabled messaging if pending handled above. */
        regen.textContent = "Только через поддержку";
        setTimeout(() => {
          regen.textContent = "Перевыпустить";
        }, 1800);
      });
    }

    paint();
  }

  /* —— Self-help chat (no live first-line) —— */
  function setupHelp() {
    const Help = window.TrinityCabinetHelp;
    const log = document.querySelector("[data-help-log]");
    const form = document.querySelector("[data-help-form]");
    const input = document.querySelector("[data-help-input]");
    const escalate = document.querySelector("[data-help-escalate]");
    const mailForm = document.querySelector("[data-help-mail-form]");
    const mailEmail = document.querySelector("[data-help-mail-email]");
    const mailBody = document.querySelector("[data-help-mail-body]");
    const mailCancel = document.querySelector("[data-help-mail-cancel]");
    if (!Help || !log || !form || !input) return;

    const supportTo =
      (cfg().supportEmail) || Help.DEFAULT_SUPPORT_EMAIL;
    let lastQuery = "";
    let pathTitles = [];

    function userEmail() {
      return (
        (window.localStorage &&
          localStorage.getItem(
            (window.TrinityCabinetAuth && window.TrinityCabinetAuth.userKey) ||
              "trinity.supabase.user_email"
          )) ||
        ""
      );
    }

    function scrollLog() {
      log.scrollTop = log.scrollHeight;
    }

    function el(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    }

    function botText(text) {
      const wrap = el("div", "help-msg help-bot");
      wrap.appendChild(el("p", "", text));
      log.appendChild(wrap);
      scrollLog();
    }

    function userText(text) {
      const wrap = el("div", "help-msg help-user");
      wrap.appendChild(el("p", "", text));
      log.appendChild(wrap);
      scrollLog();
    }

    function renderOptions(cards, prompt) {
      if (prompt) botText(prompt);
      if (!cards.length) {
        botText("По этому тексту вариантов нет. Перефразируйте или напишите человеку — ответ придёт письмом.");
        showEscalate(true);
        return;
      }
      const box = el("div", "help-options");
      cards.forEach(function (card) {
        const btn = el("button", "help-opt", card.title);
        btn.type = "button";
        btn.dataset.helpPick = card.id;
        box.appendChild(btn);
      });
      log.appendChild(box);
      scrollLog();
    }

    function renderSolution(node) {
      const wrap = el("div", "help-msg help-bot");
      wrap.appendChild(el("p", "", node.title));
      const ol = el("ol", "help-steps");
      (node.steps || []).forEach(function (step) {
        ol.appendChild(el("li", "", step));
      });
      wrap.appendChild(ol);
      if (node.href && node.hrefLabel) {
        const p = el("p");
        const a = el("a", "", node.hrefLabel);
        a.href = node.href;
        p.appendChild(a);
        wrap.appendChild(p);
      }
      const actions = el("div", "help-actions");
      const ok = el("button", "btn btn-line", "Помогло");
      ok.type = "button";
      ok.dataset.helpAct = "ok";
      const more = el("button", "btn btn-line", "Другая проблема");
      more.type = "button";
      more.dataset.helpAct = "more";
      const mail = el("button", "btn btn-dark", "Написать человеку");
      mail.type = "button";
      mail.dataset.helpAct = "mail";
      actions.appendChild(ok);
      actions.appendChild(more);
      actions.appendChild(mail);
      wrap.appendChild(actions);
      log.appendChild(wrap);
      scrollLog();
    }

    function openNode(id) {
      const node = Help.findById(id);
      if (!node) return;
      pathTitles.push(node.title);
      userText(node.title);
      if (node.children && node.children.length) {
        renderOptions(Help.childrenOf(id), node.prompt || "Уточните:");
        return;
      }
      renderSolution(node);
    }

    function search(text) {
      lastQuery = text;
      const cards = Help.matchQuery(text);
      if (text) {
        renderOptions(cards, cards.length ? "Похоже на одно из этого:" : null);
      } else {
        renderOptions(cards, "Частые темы — или напишите своими словами:");
      }
    }

    function showEscalate(open) {
      if (!escalate) return;
      escalate.hidden = !open;
      if (open && mailEmail && !mailEmail.value) mailEmail.value = userEmail();
      if (open) escalate.scrollIntoView({ block: "nearest" });
    }

    function greet() {
      log.innerHTML = "";
      pathTitles = [];
      botText(
        "Напишите, что случилось — подберём шаги. Живого чата нет: если не помогло, человек ответит письмом."
      );
      search("");
    }

    log.addEventListener("click", function (ev) {
      const pick = ev.target.closest("[data-help-pick]");
      if (pick && pick.dataset.helpPick) {
        openNode(pick.dataset.helpPick);
        return;
      }
      const act = ev.target.closest("[data-help-act]");
      if (!act) return;
      if (act.dataset.helpAct === "ok") {
        botText("Хорошо. Если всплывёт другое — напишите снова или выберите тему.");
      } else if (act.dataset.helpAct === "more") {
        pathTitles = [];
        search("");
      } else if (act.dataset.helpAct === "mail") {
        showEscalate(true);
      }
    });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      const text = String(input.value || "").trim();
      if (!text) {
        search("");
        return;
      }
      userText(text);
      input.value = "";
      search(text);
    });

    if (mailCancel) {
      mailCancel.addEventListener("click", function () {
        showEscalate(false);
      });
    }

    if (mailForm) {
      mailForm.addEventListener("submit", function (ev) {
        ev.preventDefault();
        const href = Help.composeMailto({
          to: supportTo,
          email: mailEmail ? mailEmail.value : "",
          topicTitle: pathTitles[pathTitles.length - 1] || "",
          query: lastQuery,
          path: pathTitles.join(" → "),
          body: mailBody ? mailBody.value : "",
        });
        window.location.href = href;
      });
    }

    greet();
  }

  /* —— Payments —— */
  function renderPayments() {
    const tbody = document.querySelector("[data-payments-body]");
    if (!tbody) return;
    tbody.innerHTML = "";
    const rows = data.payments || [];
    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td colspan="5" class="cab-empty-cell">Платежей пока нет: оплату ещё не подключили.</td>';
      tbody.appendChild(tr);
      return;
    }
    rows.forEach((p) => {
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        p.date +
        "</td><td>" +
        p.plan +
        "</td><td class=\"mono\">" +
        p.amount +
        "</td><td>" +
        p.status +
        "</td><td>" +
        (p.receipt === "—" || p.receipt === "#"
          ? "<span class=\"muted\">—</span>"
          : "<a href=\"" + p.receipt + "\">Чек</a>") +
        "</td>";
      tbody.appendChild(tr);
    });
  }

  /* —— Strategy statuses from the desk —— */
  function renderStrategies() {
    const root = document.querySelector("[data-strategy-cards]");
    if (!root) return;
    root.innerHTML = "";
    const rows = data.strategies || [];
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "cab-strategies-empty";
      empty.textContent =
        "Статусы стратегий появятся, когда приложение пришлёт снимок. «На столе» больше не пишем — это не статус.";
      root.appendChild(empty);
      return;
    }
    rows.forEach((r) => {
      const art = document.createElement("article");
      art.className = "cab-strat cab-strat-" + (r.tone || "empty");
      const label = document.createElement("span");
      label.className = "cab-label";
      label.textContent = r.label + (r.instrument ? " · " + r.instrument : "");
      const status = document.createElement("p");
      status.className = "cab-strat-status";
      status.textContent = r.status || "—";
      const detail = document.createElement("p");
      detail.className = "cab-strat-detail";
      detail.textContent = r.detail || "";
      art.appendChild(label);
      art.appendChild(status);
      art.appendChild(detail);
      root.appendChild(art);
    });
  }

  /* —— Decision Lab (pipeline sandbox) —— */
  let refreshLab = function () {};

  function setupLab() {
    const pairSel = document.getElementById("lab-pair");
    const zEl = document.getElementById("lab-z");
    const zLabel = document.querySelector("[data-lab-z]");
    const regimeInputs = document.querySelectorAll('input[name="lab-regime"]');
    const clusterInputs = document.querySelectorAll('input[name="lab-cluster"]');
    const faInputs = document.querySelectorAll('input[name="lab-fa"]');
    const bookInputs = document.querySelectorAll('input[name="lab-book"]');
    const atasInputs = document.querySelectorAll('input[name="lab-atas"]');
    const atasWrap = document.querySelector("[data-lab-atas-wrap]");
    const pairNote = document.querySelector("[data-lab-pair-note]");
    const liveLine = document.querySelector("[data-lab-live-line]");
    const resetBtn = document.querySelector("[data-lab-reset]");
    const modeEl = document.querySelector("[data-lab-mode]");
    const stepsRoot = document.querySelector("[data-lab-steps]");
    const verdict = document.querySelector("[data-lab-verdict]");
    const why = document.querySelector("[data-lab-why]");
    const controls = document.querySelector(".lab-controls");

    if (!pairSel || !zEl || !stepsRoot) return;

    let applying = false;
    let liveGates = null;
    let labBound = false;

    function val(inputs, fallback) {
      return [...inputs].find((i) => i.checked)?.value || fallback;
    }

    function setRadio(inputs, value) {
      let hit = false;
      inputs.forEach(function (i) {
        const on = i.value === value;
        i.checked = on;
        if (on) hit = true;
      });
      if (!hit && inputs[0]) inputs[0].checked = true;
    }

    function currentPair() {
      return (
        (data.labPairs || []).find((p) => p.id === pairSel.value) ||
        (data.labPairs || [])[0] ||
        null
      );
    }

    function readGates() {
      return {
        zAbs: Number(zEl.value),
        regime: val(regimeInputs, "SIDEWAYS"),
        cluster: val(clusterInputs, "yes") === "yes",
        fa: val(faInputs, "pass"),
        book: val(bookInputs, "DAILY"),
        atas: val(atasInputs, "pass") === "pass",
      };
    }

    function fillSelect() {
      const prev = pairSel.value;
      pairSel.innerHTML = "";
      const rows = data.labPairs || [];
      if (!rows.length && Lab && typeof Lab.catalogPairs === "function") {
        data.labPairs = Lab.catalogPairs();
      }
      const list = data.labPairs || [];
      const live = list.filter((p) => p.live);
      const rest = list.filter((p) => !p.live);
      function addGroup(label, items) {
        if (!items.length) return;
        const g = document.createElement("optgroup");
        g.label = label;
        items.forEach(function (p) {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.label;
          g.appendChild(opt);
        });
        pairSel.appendChild(g);
      }
      if (live.length && rest.length) {
        addGroup("Со стола", live);
        addGroup("Вселенная", rest);
      } else {
        list.forEach(function (p) {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.label;
          pairSel.appendChild(opt);
        });
      }
      if (prev && list.some((p) => p.id === prev)) pairSel.value = prev;
    }

    function applyLive(pair) {
      if (!pair || !Lab || typeof Lab.gatesFromPair !== "function") return;
      const g = Lab.gatesFromPair(pair, {
        regime: (data.regime && data.regime.current) || pair.regime,
      });
      applying = true;
      const z = Math.max(0, Math.min(4, Number(g.zAbs) || 0));
      zEl.value = String(z);
      setRadio(regimeInputs, g.regime);
      setRadio(clusterInputs, g.cluster ? "yes" : "no");
      setRadio(faInputs, g.fa);
      setRadio(bookInputs, g.book || "DAILY");
      applying = false;
      liveGates = g;
      update();
    }

    function update() {
      const pair = currentPair();
      const ui = readGates();
      const zAbs = ui.zAbs;
      const dirty =
        liveGates && Lab && Lab.sameGates
          ? !Lab.sameGates(ui, liveGates)
          : false;

      if (zLabel) zLabel.textContent = zAbs.toFixed(2);
      if (pairNote) pairNote.textContent = pair ? pair.note : "";
      if (atasWrap) atasWrap.hidden = ui.book !== "INTRADAY";
      if (liveLine) {
        liveLine.textContent =
          (data.labDesk && data.labDesk.line) ||
          "Выберите пару. Цифры со стола подставятся сами, щелчки — сценарий.";
      }
      if (resetBtn) resetBtn.hidden = !dirty;
      if (modeEl) {
        modeEl.hidden = false;
        modeEl.textContent = dirty ? "Сценарий" : pair && pair.live ? "Со стола" : "Вселенная";
        modeEl.className =
          "lab-mode" + (dirty ? " is-scenario" : pair && pair.live ? " is-live" : "");
      }
      if (controls) controls.classList.toggle("is-scenario", dirty);

      const result = Lab
        ? Lab.evaluatePipeline({
            zAbs: zAbs,
            regime: ui.regime,
            cluster: ui.cluster,
            fa: ui.fa,
            book: ui.book,
            atas: ui.atas,
            sector: pair && (Lab.sectorLabel ? Lab.sectorLabel(pair.sector) : pair.sector),
          })
        : null;

      const steps = result ? result.steps : [];
      stepsRoot.innerHTML = "";
      steps.forEach((s, i) => {
        const li = document.createElement("li");
        li.className = "lab-step lab-" + s.status;
        const n = document.createElement("span");
        n.className = "lab-step-n";
        n.textContent = String(i + 1);
        const body = document.createElement("div");
        const strong = document.createElement("strong");
        strong.textContent = s.title;
        const p = document.createElement("p");
        p.textContent = s.detail;
        body.appendChild(strong);
        body.appendChild(p);
        const badge = document.createElement("span");
        badge.className = "lab-step-badge";
        badge.textContent =
          s.status === "pass" ? "Да" : s.status === "watch" ? "Подождать" : "Нет";
        li.appendChild(n);
        li.appendChild(body);
        li.appendChild(badge);
        stepsRoot.appendChild(li);
      });

      if (verdict && result) {
        verdict.className = "lab-verdict " + result.outcomeClass;
        verdict.textContent = labOutcomeLabel(result.outcome);
      }
      if (why && result) why.textContent = result.reason;
    }

    refreshLab = function () {
      fillSelect();
      applyLive(currentPair());
    };

    if (!labBound) {
      labBound = true;
      pairSel.addEventListener("change", function () {
        applyLive(currentPair());
      });
      zEl.addEventListener("input", function () {
        if (!applying) update();
      });
      [regimeInputs, clusterInputs, faInputs, bookInputs, atasInputs].forEach(
        function (list) {
          list.forEach(function (i) {
            i.addEventListener("change", function () {
              if (!applying) update();
            });
          });
        }
      );
      if (resetBtn) {
        resetBtn.addEventListener("click", function () {
          applyLive(currentPair());
        });
      }
    }

    if (!(data.labPairs && data.labPairs.length) && Lab && Lab.catalogPairs) {
      data.labPairs = Lab.catalogPairs();
    }
    refreshLab();
  }

  /* —— Nav mobile —— */
  function setupNav() {
    const toggle = document.querySelector("[data-nav-toggle]");
    const links = document.querySelector("[data-nav-links]");
    if (!toggle || !links) return;
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  /* —— Reveal —— */
  function setupReveal() {
    const reveals = document.querySelectorAll(".reveal");
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("visible");
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.1, rootMargin: "0px 0px -30px 0px" }
      );
      reveals.forEach((el) => io.observe(el));
    } else {
      reveals.forEach((el) => el.classList.add("visible"));
    }
  }

  function refreshUserEmail() {
    const email =
      (window.localStorage &&
        localStorage.getItem(
          (window.TrinityCabinetAuth && window.TrinityCabinetAuth.userKey) ||
            "trinity.supabase.user_email"
        )) ||
      "";
    const label = document.querySelector("[data-cab-user-email]");
    if (label && email) label.textContent = email;
  }

  let uiBooted = false;
  function bootCabinetUi() {
    if (uiBooted) {
      refreshUserEmail();
      return;
    }
    uiBooted = true;
    renderOverview();
    renderOps();
    drawEquity();
    drawAllocation();
    setupUnlock();
    setupHelp();
    renderPayments();
    renderStrategies();
    setupLab();
    setupNav();
    setupReveal();
    loadDeskLive();
    refreshUserEmail();
  }

  /* Metrics / lab must not wait on Supabase session (can hang offline). */
  bootCabinetUi();
  const auth = window.TrinityCabinetAuth;
  if (auth && typeof auth.setupAuth === "function") {
    auth
      .setupAuth()
      .then(function () {
        refreshUserEmail();
        return loadDeskLive();
      })
      .catch(() => {});
  }

  window.addEventListener("resize", () => {
    drawEquity();
  });
})();
