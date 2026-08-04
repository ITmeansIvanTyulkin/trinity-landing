(() => {
  const data = window.CABINET_DATA;
  const config = window.CABINET_CONFIG || {};
  if (!data) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = (n) => new Intl.NumberFormat("ru-RU").format(Math.round(n));
  const rub = (n) => fmt(n) + " ₽";

  const Z_ENTER = 1.8;
  const Z_WATCH = 1.4;

  /* —— Auth (same password as IMOEX dashboard) —— */
  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text)
    );
    return [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function passwordMatches(pass) {
    if (!pass || !config.authHash) return false;
    const hash = await sha256Hex(pass);
    return hash === config.authHash;
  }

  function unlockCabinet() {
    try {
      sessionStorage.setItem(config.sessionKey || "trinity.cabinet.auth", "1");
    } catch {
      /* ignore */
    }
    document.body.classList.remove("cabinet-locked");
    const gate = document.getElementById("cabinet-gate");
    if (gate) gate.hidden = true;
  }

  function isSessionOk() {
    try {
      return sessionStorage.getItem(config.sessionKey || "trinity.cabinet.auth") === "1";
    } catch {
      return false;
    }
  }

  async function trySsoFromImoex() {
    try {
      const stored = localStorage.getItem(config.imoexPassKey || "imoex.ops.pass");
      if (stored && (await passwordMatches(stored))) {
        unlockCabinet();
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  async function setupAuth() {
    const gate = document.getElementById("cabinet-gate");
    const form = document.getElementById("cabinet-gate-form");
    const input = document.getElementById("cabinet-gate-pass");
    const err = document.querySelector("[data-gate-error]");
    const logout = document.querySelector("[data-cab-logout]");

    if (isSessionOk()) {
      unlockCabinet();
    } else if (await trySsoFromImoex()) {
      /* unlocked via IMOEX localStorage */
    } else {
      document.body.classList.add("cabinet-locked");
      if (gate) gate.hidden = false;
      if (input) setTimeout(() => input.focus(), 80);
    }

    if (form && input) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const ok = await passwordMatches(input.value);
        if (ok) {
          if (err) err.hidden = true;
          /* Align with IMOEX operator storage for same-browser SSO */
          try {
            localStorage.setItem(config.imoexPassKey || "imoex.ops.pass", input.value);
          } catch {
            /* ignore */
          }
          input.value = "";
          unlockCabinet();
        } else {
          if (err) {
            err.hidden = false;
            err.textContent = "Неверный пароль. Тот же, что API password на дашборде IMOEX.";
          }
          input.select();
        }
      });
    }

    if (logout) {
      logout.addEventListener("click", () => {
        try {
          sessionStorage.removeItem(config.sessionKey || "trinity.cabinet.auth");
        } catch {
          /* ignore */
        }
        document.body.classList.add("cabinet-locked");
        if (gate) gate.hidden = false;
        if (input) {
          input.value = "";
          input.focus();
        }
      });
    }
  }

  /* —— Optional IMOEX stub (read-only) —— */
  async function tryImoexStub() {
    const base = config.imoexBase;
    const note = document.querySelector("[data-data-source]");
    if (!base) {
      if (note) {
        note.textContent =
          "Mock-данные (standalone). Публичного /api/regime в IMOEX пока нет. Торговля — только в /view.";
      }
      return;
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1200);
      const res = await fetch(base + "/api/paper/journal", { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok && note) {
        note.textContent =
          "Источник: IMOEX " +
          base +
          " (read-only stub journal). Режим — mock. Торговля — только в /view.";
      }
    } catch {
      if (note) {
        note.textContent =
          "Mock-данные (IMOEX недоступен). Опционально: CABINET_CONFIG.imoexBase → localhost:8080.";
      }
    }
  }

  /* —— Overview —— */
  function renderOverview() {
    const s = data.subscription;
    const r = data.regime || {};
    const set = (sel, text) => {
      const el = document.querySelector(sel);
      if (el) el.textContent = text;
    };
    set("[data-tier]", s.tier);
    set("[data-tier-price]", fmt(s.priceRub) + " ₽/мес");
    set("[data-delivery]", s.delivery);
    set("[data-next-billing]", s.nextBilling);
    set("[data-trial-note]", s.reverseTrialNote);
    set("[data-regime-note]", r.note || "");
    set("[data-regime-book]", r.book || "DAILY");

    const pill = document.querySelector("[data-regime-pill]");
    if (pill) {
      pill.dataset.mode = r.current || "SIDEWAYS";
      pill.textContent = r.current || "SIDEWAYS";
    }

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
    if (bar && s.trialActive) {
      const pct = Math.max(0, Math.min(100, (s.trialDaysLeft / s.trialTotalDays) * 100));
      bar.style.width = pct + "%";
    }
  }

  /* —— Slots table —— */
  function renderOps() {
    const tbody = document.querySelector("[data-slots-body]");
    if (!tbody) return;
    tbody.innerHTML = "";
    data.openSlots.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        row.pair +
        "</td><td>" +
        row.book +
        "</td><td class=\"mono\">" +
        row.z +
        "</td><td><span class=\"chip chip-" +
        row.status.toLowerCase() +
        "\">" +
        row.status +
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

    const pts = data.equityCurve.points;
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

    const label = document.querySelector("[data-equity-end]");
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
    let revealed = false;
    let current = { ...data.unlockKey };

    function paint() {
      if (masked) masked.textContent = revealed ? current.full : current.masked;
      if (rotated) rotated.textContent = "Обновлён: " + current.lastRotated;
      if (toggle) toggle.textContent = revealed ? "Скрыть" : "Показать";
    }

    if (toggle) {
      toggle.addEventListener("click", () => {
        revealed = !revealed;
        paint();
      });
    }

    if (regen) {
      regen.addEventListener("click", () => {
        const seg = () =>
          Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
        const body = [seg(), seg(), seg(), seg()].join("-");
        current = {
          full: "TRINITY-" + body,
          masked: "TRINITY-" + body.slice(0, 4) + "-••••-••••-" + body.slice(-4),
          lastRotated: new Date().toISOString().slice(0, 10),
        };
        revealed = false;
        paint();
        regen.textContent = "Ключ перевыпущен";
        setTimeout(() => {
          regen.textContent = "Перевыпустить";
        }, 1800);
      });
    }

    paint();
  }

  /* —— Payments —— */
  function renderPayments() {
    const tbody = document.querySelector("[data-payments-body]");
    if (!tbody) return;
    tbody.innerHTML = "";
    data.payments.forEach((p) => {
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

      const steps = [];

      /* 1. Tech Z */
      let techOk = false;
      let techStatus = "fail";
      let techDetail = "";
      if (zAbs >= Z_ENTER) {
        techOk = true;
        techStatus = "pass";
        techDetail = "|Z| ≥ " + Z_ENTER + " — порог входа";
      } else if (zAbs >= Z_WATCH) {
        techStatus = "watch";
        techDetail = "|Z| в зоне WATCH (" + Z_WATCH + "–" + Z_ENTER + ")";
      } else {
        techDetail = "|Z| < " + Z_WATCH + " — техника слабая";
      }
      steps.push({ id: "tech", title: "Техника (EG / Z)", status: techStatus, detail: techDetail });

      /* 2. Regime */
      let regimeOk = regime !== "TREND";
      let regimeStatus = regimeOk ? "pass" : "fail";
      let regimeDetail =
        regime === "TREND"
          ? "TREND · ADX высокий — новые pairs-входы блокируются"
          : regime === "SIDEWAYS"
            ? "SIDEWAYS · боковик — pairs в фокусе"
            : "NEUTRAL · смешанный режим, pairs допустимы осторожнее";
      steps.push({
        id: "regime",
        title: "Regime gate",
        status: regimeStatus,
        detail: regimeDetail,
      });

      /* 3. Cluster */
      steps.push({
        id: "cluster",
        title: "Cluster gate",
        status: cluster ? "pass" : "fail",
        detail: cluster
          ? (pair.sector || "SECTOR") + " · eligible (net>0, PF≥1.1)"
          : (pair.sector || "SECTOR") + " · не eligible / OIL_GAS-like ban",
      });

      /* 4. FA */
      let faOk = fa === "pass";
      let faStatus = fa === "pass" ? "pass" : fa === "weak" ? "watch" : "fail";
      let faDetail =
        fa === "pass"
          ? "Фундамент поддерживает / не противоречит"
          : fa === "weak"
            ? "FA слабый — обычно WATCH, не paper-open"
            : "FA против — блок рекомендации";
      steps.push({ id: "fa", title: "Фундамент (FA)", status: faStatus, detail: faDetail });

      /* 5. Book / ATAS */
      let atasOk = true;
      if (book === "INTRADAY") {
        atasOk = atas;
        steps.push({
          id: "atas",
          title: "ATAS / volume (INTRADAY)",
          status: atas ? "pass" : "fail",
          detail: atas
            ? "Микроструктура ок · book всё равно research-only"
            : "ATAS gate блокирует · типичный WATCH (microstructure)",
        });
      } else {
        steps.push({
          id: "book",
          title: "Book",
          status: "pass",
          detail: "DAILY · live paper после FA (в продукте)",
        });
      }

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

      /* Verdict */
      let outcome = "BLOCK";
      let outcomeClass = "lab-out-block";
      let reason = "";

      if (!regimeOk) {
        outcome = "BLOCK";
        reason = "Regime TREND — pairs mean-reversion не открывает новые входы.";
      } else if (!cluster) {
        outcome = "BLOCK";
        reason = "Cluster gate — сектор не eligible в месячном review.";
      } else if (fa === "fail") {
        outcome = "BLOCK";
        reason = "FA против — рекомендация не проходит в paper.";
      } else if (book === "INTRADAY" && !atasOk) {
        outcome = "WATCH";
        outcomeClass = "lab-out-watch";
        reason =
          "Техника может быть ок, но ATAS/volume gate блокирует INTRADAY. Book research-only — без paper-открытий.";
      } else if (book === "INTRADAY") {
        outcome = "RESEARCH";
        outcomeClass = "lab-out-research";
        reason =
          "INTRADAY сейчас research-only: метрики считаются, paper-opens выключены до OOS.";
      } else if (techOk && faOk) {
        outcome = "PAPER OPEN";
        outcomeClass = "lab-out-enter";
        reason =
          "Техника + regime + cluster + FA — кандидат в paper-journal (не ордер брокеру).";
      } else if (techStatus === "watch" || fa === "weak" || !techOk) {
        outcome = "WATCH";
        outcomeClass = "lab-out-watch";
        if (!techOk && techStatus === "fail") {
          reason = "Техника ниже порога — ждём разворот / |Z|.";
        } else if (fa === "weak") {
          reason = "FA слабый — держим в WATCH, не форсируем paper-open.";
        } else {
          reason = "На границе порогов — наблюдение, не вход.";
        }
      } else {
        outcome = "BLOCK";
        reason = "Пайплайн не собрал подтверждений.";
      }

      if (verdict) {
        verdict.className = "lab-verdict " + outcomeClass;
        verdict.textContent = outcome;
      }
      if (why) why.textContent = reason;
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

  setupAuth().then(() => {
    renderOverview();
    renderOps();
    drawEquity();
    drawAllocation();
    setupUnlock();
    renderPayments();
    renderRoadmap();
    setupLab();
    setupNav();
    setupReveal();
    tryImoexStub();
  });

  window.addEventListener("resize", () => {
    drawEquity();
  });
})();
