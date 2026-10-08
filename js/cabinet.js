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
    s.trialTotalDays = (Snap && Snap.TRIAL_DAYS) || 5;
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
      s.trialTotalDays = Snap.TRIAL_DAYS || 5;
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

  function applyLabDesk() {
    if (!Lab || typeof Lab.buildLabState !== "function") return;
    data.labDesk = Lab.buildLabState();
    data.labPairs = [];
    refreshLab();
  }

  async function loadLabFromDesk() {
    /* Calendar-arb lab is fully manual — no pairs feed from the desk. */
    applyLabDesk();
    return true;
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

  /* —— Self-help chat · Маша (no live first-line) —— */
  function setupHelp() {
    const Help = window.TrinityCabinetHelp;
    const Auth = window.TrinityCabinetAuth;
    const log = document.querySelector("[data-help-log]");
    const form = document.querySelector("[data-help-form]");
    const input = document.querySelector("[data-help-input]");
    const escalate = document.querySelector("[data-help-escalate]");
    const mailForm = document.querySelector("[data-help-mail-form]");
    const mailEmail = document.querySelector("[data-help-mail-email]");
    const mailBody = document.querySelector("[data-help-mail-body]");
    const mailCancel = document.querySelector("[data-help-mail-cancel]");
    const agentNameEl = document.querySelector("[data-help-agent-name]");
    const agentStatusEl = document.querySelector("[data-help-agent-status]");
    if (!Help || !log || !form || !input) return;

    const supportTo =
      (cfg().supportEmail) || Help.DEFAULT_SUPPORT_EMAIL;
    const avatarSrc = Help.AGENT_AVATAR || "assets/masha-avatar.png";
    const HELP_QUEUE_KEY = "trinity.masha.help_queue";
    let lastQuery = "";
    let pathTitles = [];
    let cachedName = "";
    let lastTurn = null;
    let helpSessionId = "";

    try {
      helpSessionId =
        sessionStorage.getItem("trinity.masha.session") ||
        "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem("trinity.masha.session", helpSessionId);
    } catch {
      helpSessionId = "m" + Date.now().toString(36);
    }

    if (agentNameEl) agentNameEl.textContent = Help.AGENT_NAME || "Маша";

    function userEmail() {
      return (
        (window.localStorage &&
          localStorage.getItem(
            (Auth && Auth.userKey) || "trinity.supabase.user_email"
          )) ||
        ""
      );
    }

    function storedDisplayName() {
      try {
        return (
          localStorage.getItem(
            (Auth && Auth.nameKey) || "trinity.supabase.display_name"
          ) || ""
        );
      } catch {
        return "";
      }
    }

    function readHelpQueue() {
      try {
        const raw = localStorage.getItem(HELP_QUEUE_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
      } catch {
        return [];
      }
    }

    function writeHelpQueue(list) {
      try {
        localStorage.setItem(HELP_QUEUE_KEY, JSON.stringify(list.slice(-40)));
      } catch {
        /* quota */
      }
    }

    async function flushHelpLogs() {
      const sb = Auth && typeof Auth.getClient === "function" ? Auth.getClient() : null;
      if (!sb) return;
      const queue = readHelpQueue();
      if (!queue.length) return;
      let userId = null;
      try {
        const { data } = await sb.auth.getSession();
        userId = data && data.session && data.session.user && data.session.user.id;
      } catch {
        return;
      }
      if (!userId) return;
      const left = [];
      for (let i = 0; i < queue.length; i++) {
        const row = Object.assign({}, queue[i], { user_id: userId });
        try {
          const { error } = await sb.from("masha_help_logs").insert(row);
          if (error) left.push(queue[i]);
        } catch {
          left.push(queue[i]);
        }
      }
      writeHelpQueue(left);
    }

    function recordHelp(opts) {
      if (!Help.buildHelpLog) return;
      const payload = Help.buildHelpLog(
        Object.assign(
          {
            sessionId: helpSessionId,
            path: pathTitles.join(" → "),
          },
          opts || {}
        )
      );
      if (payload.event_type === "turn") {
        lastTurn = {
          userText: payload.user_text,
          replyMode: payload.reply_mode,
          replySummary: payload.reply_summary,
          topicIds: payload.topic_ids,
          wikiId: payload.wiki_id,
          wikiHref: payload.wiki_href,
        };
      }
      const queue = readHelpQueue();
      queue.push(payload);
      writeHelpQueue(queue);
      flushHelpLogs();
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

    function botAvatar() {
      const img = el("img", "help-avatar");
      img.src = avatarSrc;
      img.alt = Help.AGENT_NAME || "Маша";
      img.width = 40;
      img.height = 40;
      img.decoding = "async";
      return img;
    }

    function botText(text) {
      const row = el("div", "help-row help-row-bot");
      row.appendChild(botAvatar());
      const wrap = el("div", "help-msg help-bot");
      wrap.appendChild(el("p", "", text));
      row.appendChild(wrap);
      log.appendChild(row);
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
      if (!cards.length) return;
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

    function helpActions(wrap) {
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
    }

    function renderSolution(node) {
      const row = el("div", "help-row help-row-bot");
      row.appendChild(botAvatar());
      const wrap = el("div", "help-msg help-bot");
      wrap.appendChild(el("p", "", node.title));
      const ol = el("ol", "help-steps");
      (node.steps || []).forEach(function (step) {
        ol.appendChild(el("li", "", step));
      });
      wrap.appendChild(ol);
      if (node.href && node.hrefLabel) {
        const p = el("p", "help-wiki-link");
        const a = el("a", "", node.hrefLabel);
        a.href = node.href;
        p.appendChild(document.createTextNode("Подробнее: "));
        p.appendChild(a);
        wrap.appendChild(p);
      }
      helpActions(wrap);
      row.appendChild(wrap);
      log.appendChild(row);
      scrollLog();
    }

    function renderWiki(hit, alt) {
      if (!hit) return;
      const row = el("div", "help-row help-row-bot");
      row.appendChild(botAvatar());
      const wrap = el("div", "help-msg help-bot");
      wrap.appendChild(el("p", "help-wiki-title", hit.title));
      wrap.appendChild(el("p", "", hit.blurb));
      const p = el("p", "help-wiki-link");
      const a = el("a", "", "Читать статью →");
      a.href = hit.href;
      p.appendChild(a);
      wrap.appendChild(p);
      if (alt && alt.length) {
        const more = el("p", "help-wiki-alt", "Ещё по теме:");
        alt.forEach(function (w, i) {
          if (i) more.appendChild(document.createTextNode(" · "));
          const link = el("a", "", w.title);
          link.href = w.href;
          more.appendChild(link);
        });
        wrap.appendChild(more);
      }
      helpActions(wrap);
      row.appendChild(wrap);
      log.appendChild(row);
      scrollLog();
    }

    function openNode(id) {
      const node = Help.findById(id);
      if (!node) return;
      pathTitles.push(node.title);
      userText(node.title);
      if (node.children && node.children.length) {
        const kids = Help.childrenOf(id);
        renderOptions(kids, node.prompt || "Уточните:");
        recordHelp({
          eventType: "turn",
          userText: node.title,
          replyMode: "branch",
          replySummary: Help.summarizeResolved
            ? Help.summarizeResolved({ mode: "branch", topics: kids })
            : kids.map(function (c) {
                return c.title;
              }).join(" · "),
          topicIds: [id].concat(
            kids.map(function (c) {
              return c.id;
            })
          ),
        });
        return;
      }
      renderSolution(node);
      recordHelp({
        eventType: "turn",
        userText: node.title,
        replyMode: "solution",
        replySummary: Help.summarizeSolution
          ? Help.summarizeSolution(node)
          : node.title,
        topicIds: [id],
        wikiHref: node.href || null,
      });
    }

    function search(text) {
      lastQuery = text;
      const resolved =
        typeof Help.resolveHelp === "function"
          ? Help.resolveHelp(text)
          : {
              mode: text ? "topics" : "menu",
              topics: Help.matchQuery(text),
              wiki: null,
              wikiAlt: [],
            };

      if (resolved.mode === "menu") {
        renderOptions(
          resolved.topics,
          "Частые темы — или напишите своими словами (кабинет, стол, Wiki):"
        );
        return;
      }

      if (resolved.mode === "wiki" && resolved.wiki) {
        botText(
          "Прямого пункта в меню нет — кратко из Wiki, дальше ссылка на статью."
        );
        renderWiki(resolved.wiki, resolved.wikiAlt);
        if (resolved.topics && resolved.topics.length) {
          renderOptions(resolved.topics, "Похожие темы в кабинете:");
        }
        recordHelp({
          eventType: "turn",
          userText: text,
          replyMode: "wiki",
          replySummary: Help.summarizeResolved
            ? Help.summarizeResolved(resolved)
            : resolved.wiki.blurb,
          topicIds: (resolved.topics || []).map(function (t) {
            return t.id;
          }),
          wikiId: resolved.wiki.id,
          wikiHref: resolved.wiki.href,
        });
        return;
      }

      if (resolved.mode === "topics" && resolved.topics.length) {
        renderOptions(resolved.topics, "Похоже на одно из этого:");
        if (resolved.wiki) {
          botText("Ещё кратко из Wiki по соседней теме:");
          renderWiki(resolved.wiki, []);
        }
        recordHelp({
          eventType: "turn",
          userText: text,
          replyMode: "topics",
          replySummary: Help.summarizeResolved
            ? Help.summarizeResolved(resolved)
            : resolved.topics
                .map(function (t) {
                  return t.title;
                })
                .join(" · "),
          topicIds: resolved.topics.map(function (t) {
            return t.id;
          }),
          wikiId: resolved.wiki ? resolved.wiki.id : null,
          wikiHref: resolved.wiki ? resolved.wiki.href : null,
        });
        return;
      }

      botText(
        "По этому тексту готового ответа нет. Перефразируйте, выберите тему или напишите человеку — ответим письмом."
      );
      showEscalate(true);
      renderOptions(Help.matchQuery(""), "Или начните с частой темы:");
      recordHelp({
        eventType: "turn",
        userText: text,
        replyMode: "empty",
        replySummary: "no_match",
        topicIds: [],
      });
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
      const line = Help.buildGreeting({
        displayName: cachedName || storedDisplayName(),
        email: userEmail(),
      });
      botText(line);
      if (agentStatusEl) {
        const name = Help.resolveDisplayName({
          displayName: cachedName || storedDisplayName(),
          email: userEmail(),
        });
        agentStatusEl.textContent = name
          ? "Онлайн · для " + name
          : "Онлайн · подберу шаги";
      }
      search("");
    }

    async function resolveNameThenGreet() {
      cachedName = storedDisplayName();
      greet();
      try {
        const sb = Auth && typeof Auth.getClient === "function" ? Auth.getClient() : null;
        if (!sb || typeof Auth.refreshDisplayName !== "function") return;
        const { data } = await sb.auth.getSession();
        const user = data && data.session && data.session.user;
        if (!user) return;
        const fresh = await Auth.refreshDisplayName(user);
        if (fresh && fresh !== cachedName) {
          cachedName = fresh;
          greet();
        }
      } catch {
        /* keep cached greeting */
      }
    }

    function logFeedback(kind) {
      recordHelp({
        eventType: "feedback",
        userText: lastTurn ? lastTurn.userText : lastQuery,
        replyMode: lastTurn ? lastTurn.replyMode : null,
        replySummary: lastTurn ? lastTurn.replySummary : null,
        topicIds: lastTurn ? lastTurn.topicIds : [],
        wikiId: lastTurn ? lastTurn.wikiId : null,
        wikiHref: lastTurn ? lastTurn.wikiHref : null,
        feedback: kind,
      });
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
        logFeedback("helped");
        botText("Рада, что помогло. Если всплывёт другое — напишите снова или выберите тему.");
      } else if (act.dataset.helpAct === "more") {
        logFeedback("more");
        pathTitles = [];
        search("");
      } else if (act.dataset.helpAct === "mail") {
        logFeedback("mail");
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
        logFeedback("escalate_mail");
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

    resolveNameThenGreet();
    flushHelpLogs();
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") flushHelpLogs();
    });
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

  /* —— Decision Lab: calendar arb manual scenario —— */
  let refreshLab = function () {};

  function setupLab() {
    const familySel = document.getElementById("lab-family");
    const zEl = document.getElementById("lab-z");
    const zLabel = document.querySelector("[data-lab-z]");
    const familyNote = document.querySelector("[data-lab-family-note]");
    const liveLine = document.querySelector("[data-lab-live-line]");
    const resetBtn = document.querySelector("[data-lab-reset]");
    const modeEl = document.querySelector("[data-lab-mode]");
    const stepsRoot = document.querySelector("[data-lab-steps]");
    const verdict = document.querySelector("[data-lab-verdict]");
    const why = document.querySelector("[data-lab-why]");
    const controls = document.querySelector(".lab-controls");

    const structureInputs = document.querySelectorAll('input[name="lab-structure"]');
    const sideInputs = document.querySelectorAll('input[name="lab-side"]');
    const sessionInputs = document.querySelectorAll('input[name="lab-session"]');
    const rollInputs = document.querySelectorAll('input[name="lab-roll"]');
    const eventInputs = document.querySelectorAll('input[name="lab-event"]');
    const curveInputs = document.querySelectorAll('input[name="lab-curve"]');
    const costInputs = document.querySelectorAll('input[name="lab-cost"]');
    const goInputs = document.querySelectorAll('input[name="lab-go"]');
    const recedeInputs = document.querySelectorAll('input[name="lab-recede"]');

    if (!familySel || !zEl || !stepsRoot || !Lab) return;

    let applying = false;
    let baseline = null;
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

    function fillFamilies() {
      const prev = familySel.value;
      familySel.innerHTML = "";
      const list = Lab.FAMILIES || [];
      list.forEach(function (f) {
        const opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = f.label;
        familySel.appendChild(opt);
      });
      if (prev && list.some((f) => f.id === prev)) familySel.value = prev;
      else if (list[0]) familySel.value = list[0].id;
    }

    function readGates() {
      return {
        zAbs: Number(zEl.value),
        side: val(sideInputs, "cheap"),
        family: familySel.value || "BR",
        structure: val(structureInputs, "spread"),
        session: val(sessionInputs, "yes") === "yes",
        rollOk: val(rollInputs, "yes") === "yes",
        eventClear: val(eventInputs, "yes") === "yes",
        curve: val(curveInputs, "ok"),
        costOk: val(costInputs, "yes") === "yes",
        goOk: val(goInputs, "yes") === "yes",
        recede: val(recedeInputs, "yes") === "yes",
      };
    }

    function applyGates(g) {
      if (!g) return;
      applying = true;
      const z = Math.max(0, Math.min(4, Number(g.zAbs) || 0));
      zEl.value = String(z);
      if (g.family) familySel.value = g.family;
      setRadio(structureInputs, g.structure || "spread");
      setRadio(sideInputs, g.side || "cheap");
      setRadio(sessionInputs, g.session === false ? "no" : "yes");
      setRadio(rollInputs, g.rollOk === false ? "no" : "yes");
      setRadio(eventInputs, g.eventClear === false ? "no" : "yes");
      setRadio(curveInputs, g.curve || "ok");
      setRadio(costInputs, g.costOk === false ? "no" : "yes");
      setRadio(goInputs, g.goOk === false ? "no" : "yes");
      setRadio(recedeInputs, g.recede === false ? "no" : "yes");
      applying = false;
      baseline = readGates();
      update();
    }

    function update() {
      const ui = readGates();
      const dirty = baseline && Lab.sameGates ? !Lab.sameGates(ui, baseline) : false;
      const fam = Lab.familyById ? Lab.familyById(ui.family) : null;

      if (zLabel) zLabel.textContent = ui.zAbs.toFixed(2);
      if (familyNote) familyNote.textContent = fam ? fam.note : "";
      if (liveLine) {
        liveLine.textContent =
          (data.labDesk && data.labDesk.line) ||
          "Крутите тумблеры и ползунок — это ручной сценарий календарного спреда.";
      }
      if (modeEl) {
        modeEl.hidden = false;
        modeEl.textContent = dirty ? "Сценарий изменён" : "Базовый сценарий";
        modeEl.className = "lab-mode" + (dirty ? " is-scenario" : "");
      }
      if (controls) controls.classList.toggle("is-scenario", dirty);

      const result = Lab.evaluatePipeline(ui);
      const steps = result ? result.steps : [];
      stepsRoot.innerHTML = "";
      steps.forEach(function (s, i) {
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
      fillFamilies();
      if (!baseline && Lab.defaultGates) {
        applyGates(Lab.defaultGates());
      } else {
        update();
      }
    };

    if (!labBound) {
      labBound = true;
      familySel.addEventListener("change", function () {
        if (!applying) update();
      });
      zEl.addEventListener("input", function () {
        if (!applying) update();
      });
      [
        structureInputs,
        sideInputs,
        sessionInputs,
        rollInputs,
        eventInputs,
        curveInputs,
        costInputs,
        goInputs,
        recedeInputs,
      ].forEach(function (list) {
        list.forEach(function (i) {
          i.addEventListener("change", function () {
            if (!applying) update();
          });
        });
      });
      if (resetBtn) {
        resetBtn.addEventListener("click", function () {
          if (Lab.defaultGates) applyGates(Lab.defaultGates());
        });
      }
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

  /* Auto-refresh cabinet from desk_snapshots while the tab is open. */
  const DESK_POLL_MS = 60000;
  setInterval(function () {
    if (document.visibilityState === "hidden") return;
    loadDeskLive().catch(function () {});
  }, DESK_POLL_MS);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      loadDeskLive().catch(function () {});
    }
  });

  window.addEventListener("resize", () => {
    drawEquity();
  });
})();
