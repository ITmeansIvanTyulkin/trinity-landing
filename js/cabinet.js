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

  function setText(sel, text) {
    const el = document.querySelector(sel);
    if (el) el.textContent = text;
  }

  function applyRegime(r) {
    if (!r) return;
    data.regime = Object.assign({}, data.regime, r);
    setText("[data-regime-note]", data.regime.note || "");
    setText("[data-regime-book]", data.regime.book || "DAILY");
    const pill = document.querySelector("[data-regime-pill]");
    if (pill) {
      pill.dataset.mode = data.regime.current || "UNKNOWN";
      pill.textContent = data.regime.current || "UNKNOWN";
    }
  }

  function slotsFromJournal(journal) {
    const entries = (journal && journal.entries) || [];
    return entries
      .filter((e) => String(e.status || "").toUpperCase() === "OPEN")
      .map((e) => ({
        pair: (e.tickerY || "?") + " / " + (e.tickerX || "?"),
        book: e.book || "DAILY",
        z:
          e.markZ != null
            ? Number(e.markZ).toFixed(2)
            : e.entryZ != null
              ? Number(e.entryZ).toFixed(2)
              : "—",
        status: "OPEN",
        size:
          e.remainingFraction != null
            ? String(Math.round(Number(e.remainingFraction) * 100)) + "%"
            : "—",
      }));
  }

  /** Cumulative paper equity from CLOSED journal legs (desk truth, not mock). */
  function equityPointsFromJournal(journal) {
    const entries = ((journal && journal.entries) || [])
      .filter((e) => String(e.status || "").toUpperCase() === "CLOSED")
      .map((e) => ({
        t: e.closedAt || e.openedAt || "",
        pnl: e.pnlRub != null ? Number(e.pnlRub) : 0,
      }))
      .filter((e) => e.t)
      .sort((a, b) => String(a.t).localeCompare(String(b.t)));
    if (!entries.length) return [];
    let acc = 0;
    return entries.map((e) => {
      acc += e.pnl;
      return acc;
    });
  }

  /* —— Optional IMOEX stub (read-only) —— */
  async function tryImoexStub() {
    const base = (cfg().imoexBase || "").replace(/\/$/, "");
    const note = document.querySelector("[data-data-source]");
    if (!base) {
      if (note) {
        note.textContent =
          "Офлайн-кабинет: без выдуманного PnL. Paper и режим рынка — в операторке IMOEX /view.";
      }
      return;
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    try {
      const [journalRes, regimeRes] = await Promise.all([
        fetch(base + "/api/paper/journal", { signal: ctrl.signal }),
        fetch(base + "/api/analysis/regime", { signal: ctrl.signal }),
      ]);
      clearTimeout(t);

      let okParts = [];
      if (journalRes.ok) {
        const journal = await journalRes.json();
        data.paperSummary = {
          realizedPnlRub: journal.realizedPnlRub,
          unrealizedPnlRub: journal.unrealizedPnlRub,
          openCount: journal.openCount || 0,
          closedCount: journal.closedCount || 0,
          updatedAt: journal.updatedAt || null,
        };
        data.openSlots = slotsFromJournal(journal);
        const pts = equityPointsFromJournal(journal);
        const realized =
          journal.realizedPnlRub != null ? rub(journal.realizedPnlRub) : "—";
        const unrealized =
          journal.unrealizedPnlRub != null ? rub(journal.unrealizedPnlRub) : "—";
        data.equityCurve = {
          points: pts,
          label: pts.length
            ? "Paper equity (closed)"
            : "Paper journal · открытых нет",
          note:
            "Realized " +
            realized +
            " · unrealized " +
            unrealized +
            " · open " +
            (journal.openCount || 0) +
            " · closed " +
            (journal.closedCount || 0) +
            " · с деска /api/paper/journal",
        };
        renderOps();
        drawEquity();
        okParts.push("journal");
      }

      if (regimeRes.ok) {
        const regime = await regimeRes.json();
        const label = regime.label || "UNKNOWN";
        const adx =
          typeof regime.adx === "number" && !Number.isNaN(regime.adx)
            ? regime.adx.toFixed(1)
            : "—";
        applyRegime({
          current: label,
          book: "DAILY",
          adx: regime.adx,
          source: "imoex",
          note:
            (regime.detail || label) +
            (regime.blockEntries ? " · новые pairs-входы блокируются" : "") +
            " · ADX " +
            adx,
        });
        okParts.push("regime");
      }

      if (note) {
        note.textContent = okParts.length
          ? "Источник: IMOEX " +
            base +
            " (read-only " +
            okParts.join(" + ") +
            "). Торговля — только в /view."
          : "IMOEX " + base + " ответил без данных. Смотрите paper в /view.";
      }
    } catch {
      clearTimeout(t);
      if (note) {
        note.textContent =
          "IMOEX недоступен из браузера (" +
          base +
          "). Проверьте, что Instance запущен и CORS разрешает лендинг. Paper — в /view.";
      }
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
    applyRegime(r);

    const badge = document.querySelector("[data-trial-badge]");
    if (badge) {
      if (s.trialActive) {
        badge.hidden = false;
        badge.textContent = "Триал · " + s.trialDaysLeft + " из " + s.trialTotalDays + " дн.";
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
  function renderOps() {
    const tbody = document.querySelector("[data-slots-body]");
    if (!tbody) return;
    tbody.innerHTML = "";
    const rows = data.openSlots || [];
    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td colspan="5" class="cab-empty-cell">Нет открытых paper-позиций в кабинете. Журнал — в IMOEX /view.</td>';
      tbody.appendChild(tr);
      return;
    }
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      const status = row.status || "WATCH";
      tr.innerHTML =
        "<td>" +
        row.pair +
        "</td><td>" +
        row.book +
        "</td><td class=\"mono\">" +
        row.z +
        "</td><td><span class=\"chip chip-" +
        status.toLowerCase() +
        "\">" +
        status +
        "</span></td><td class=\"mono\">" +
        row.size +
        "</td>";
      tbody.appendChild(tr);
    });
  }

  /* —— Equity chart (canvas) —— */
  function drawEquity() {
    const canvas = document.getElementById("equity-chart");
    if (!canvas) return;
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
      ctx.fillStyle = "#6a7680";
      ctx.font = "13px 'IBM Plex Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        curve.label || "Нет paper equity в кабинете",
        w / 2,
        h / 2 - 6
      );
      ctx.font = "12px 'IBM Plex Sans', sans-serif";
      ctx.fillText("Смотрите statement в IMOEX /view", w / 2, h / 2 + 14);
      if (label) {
        const ps = data.paperSummary || {};
        label.textContent =
          ps.realizedPnlRub != null ? "Paper " + rub(ps.realizedPnlRub) : "—";
      }
      return;
    }

    const min = Math.min(...pts) * 0.995;
    const max = Math.max(...pts) * 1.005;
    const pad = { t: 16, r: 12, b: 28, l: 52 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;

    ctx.clearRect(0, 0, w, h);

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

    const xAt = (i) => pad.l + (iw * i) / (pts.length - 1);
    const yAt = (v) => pad.t + ih * (1 - (v - min) / (max - min));

    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
    grad.addColorStop(0, "rgba(11,122,102,0.28)");
    grad.addColorStop(1, "rgba(11,122,102,0)");
    ctx.beginPath();
    pts.forEach((v, i) => {
      const x = xAt(i);
      const y = yAt(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(xAt(pts.length - 1), pad.t + ih);
    ctx.lineTo(xAt(0), pad.t + ih);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    pts.forEach((v, i) => {
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
    ctx.beginPath();
    ctx.arc(xAt(pts.length - 1), yAt(last), 4, 0, Math.PI * 2);
    ctx.fillStyle = "#c4a35a";
    ctx.fill();

    if (label) label.textContent = rub(last);
  }

  /* —— Allocation bars —— */
  function drawAllocation() {
    const root = document.querySelector("[data-alloc-bars]");
    if (!root) return;
    const a = data.allocation;
    const rows = [
      { key: "pairs", pct: a.pairs, color: "var(--accent)" },
      { key: "trend", pct: a.trend, color: "var(--gold)" },
      { key: "arbitrage", pct: a.arbitrage, color: "var(--ring)" },
    ];
    root.innerHTML = "";
    rows.forEach((row) => {
      const el = document.createElement("div");
      el.className = "alloc-row";
      el.innerHTML =
        "<div class=\"alloc-meta\"><span>" +
        a.labels[row.key] +
        "</span><strong>" +
        row.pct +
        "%</strong></div>" +
        "<div class=\"alloc-track\"><i style=\"--w:" +
        row.pct +
        "%;--c:" +
        row.color +
        "\"></i></div>";
      root.appendChild(el);
    });
    if (a.note) {
      const p = document.createElement("p");
      p.className = "cab-panel-sub";
      p.textContent = a.note;
      root.appendChild(p);
    }

    if (!reduceMotion) {
      requestAnimationFrame(() => root.classList.add("ready"));
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
      if (rotated) rotated.textContent = "Instance delivery · биллинг не подключён";
      if (toggle) {
        toggle.disabled = true;
        toggle.textContent = "Недоступно";
      }
      if (regen) {
        regen.disabled = true;
        regen.textContent = "После Instance";
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
        "Опишите проблему, как в чате. Подберём варианты. Живого оператора здесь нет — в тупике ответит человек письмом."
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
        '<td colspan="5" class="cab-empty-cell">Платежей пока нет — биллинг не подключён.</td>';
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

  /* —— Roadmap chips —— */
  function renderRoadmap() {
    const root = document.querySelector("[data-roadmap-chips]");
    if (!root) return;
    root.innerHTML = "";
    data.roadmap.forEach((r) => {
      const span = document.createElement("span");
      span.className = "road-chip road-" + r.status;
      span.innerHTML = "<strong>" + r.label + "</strong> · " + r.detail;
      root.appendChild(span);
    });
  }

  /* —— Decision Lab (pipeline sandbox) —— */
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
    const stepsRoot = document.querySelector("[data-lab-steps]");
    const verdict = document.querySelector("[data-lab-verdict]");
    const why = document.querySelector("[data-lab-why]");

    if (!pairSel || !zEl || !stepsRoot) return;

    (data.labPairs || []).forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label;
      pairSel.appendChild(opt);
    });

    function val(inputs, fallback) {
      return [...inputs].find((i) => i.checked)?.value || fallback;
    }

    function update() {
      const pair =
        (data.labPairs || []).find((p) => p.id === pairSel.value) ||
        (data.labPairs || [])[0];
      const zAbs = Number(zEl.value);
      const regime = val(regimeInputs, "SIDEWAYS");
      const cluster = val(clusterInputs, "yes") === "yes";
      const fa = val(faInputs, "pass");
      const book = val(bookInputs, "DAILY");
      const atas = val(atasInputs, "pass") === "pass";

      if (zLabel) zLabel.textContent = zAbs.toFixed(2);
      if (pairNote) pairNote.textContent = pair ? pair.note : "";
      if (atasWrap) atasWrap.hidden = book !== "INTRADAY";

      const result = Lab
        ? Lab.evaluatePipeline({
            zAbs: zAbs,
            regime: regime,
            cluster: cluster,
            fa: fa,
            book: book,
            atas: atas,
            sector: pair && pair.sector,
          })
        : null;

      const steps = result ? result.steps : [];
      stepsRoot.innerHTML = "";
      steps.forEach((s, i) => {
        const li = document.createElement("li");
        li.className = "lab-step lab-" + s.status;
        li.innerHTML =
          "<span class=\"lab-step-n\">" +
          (i + 1) +
          "</span><div><strong>" +
          s.title +
          "</strong><p>" +
          s.detail +
          "</p></div><span class=\"lab-step-badge\">" +
          (s.status === "pass" ? "OK" : s.status === "watch" ? "WATCH" : "BLOCK") +
          "</span>";
        stepsRoot.appendChild(li);
      });

      if (verdict && result) {
        verdict.className = "lab-verdict " + result.outcomeClass;
        verdict.textContent = result.outcome;
      }
      if (why && result) why.textContent = result.reason;
    }

    pairSel.addEventListener("change", update);
    zEl.addEventListener("input", update);
    [regimeInputs, clusterInputs, faInputs, bookInputs, atasInputs].forEach((list) => {
      list.forEach((i) => i.addEventListener("change", update));
    });
    update();
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
    renderRoadmap();
    setupLab();
    setupNav();
    setupReveal();
    tryImoexStub();
    refreshUserEmail();
  }

  /* Metrics / lab must not wait on Supabase session (can hang offline). */
  bootCabinetUi();
  const auth = window.TrinityCabinetAuth;
  if (auth && typeof auth.setupAuth === "function") {
    auth.setupAuth().then(refreshUserEmail).catch(() => {});
  }

  window.addEventListener("resize", () => {
    drawEquity();
  });
})();
