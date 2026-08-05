(() => {
  const modes = [
    { id: "SIDEWAYS", book: "DAILY", alloc: "100% pairs", focus: "mean-rev" },
    { id: "TREND", book: "DAILY", alloc: "trend EA", focus: "momentum" },
    { id: "ARBITRAGE", book: "FUT", alloc: "calendar", focus: "spread" },
  ];

  const pill = document.querySelector("[data-mode-pill]");
  const kpiBook = document.querySelector("[data-kpi-book]");
  const kpiAlloc = document.querySelector("[data-kpi-alloc]");
  const kpiFocus = document.querySelector("[data-kpi-focus]");

  let modeIndex = 0;

  function applyMode(index) {
    const mode = modes[index];
    if (!pill || !mode) return;
    pill.dataset.mode = mode.id;
    pill.textContent = mode.id;
    if (kpiBook) kpiBook.textContent = mode.book;
    if (kpiAlloc) kpiAlloc.textContent = mode.alloc;
    if (kpiFocus) kpiFocus.textContent = mode.focus;
  }

  applyMode(0);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reduceMotion) {
    setInterval(() => {
      modeIndex = (modeIndex + 1) % modes.length;
      applyMode(modeIndex);
    }, 3200);
  }

  /* Hero candlesticks — replaced by assets/hero-chart.png pan in CSS */

  /* Mobile nav */
  const toggle = document.querySelector("[data-nav-toggle]");
  const links = document.querySelector("[data-nav-links]");
  if (toggle && links) {
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    links.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* Scroll reveal */
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
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("visible"));
  }

  /* Capital Allocator scenario calculator → js/calc.js */

  /* —— Product showcase (tabs / hotspots / lightbox) —— */
  const showcase = document.querySelector("[data-product-showcase]");
  if (showcase) {
    const shots = {
      dashboard: {
        url: "/view · dashboard",
        kicker: "Операторский контур",
        title: "Дашборд",
        lead:
          "Восемь виджетов в одном взгляде: paper, брокер, final, режим рынка, капитал, сигналы, стратегии и вселенная. Сейчас TREND (ADX 34) — новые pairs-входы блокируются.",
        bullets: [
          "Режим рынка дисциплинирует входы (TREND → блок)",
          "Капитал 200 000 ₽ · DAILY 100% · без плеча &lt;1M",
          "Вселенная: 55 тикеров · 178 пар · топ cointegration",
        ],
      },
      charts: {
        url: "/view/charts · pair spread",
        kicker: "Техника пары",
        title: "Спред / Z-score",
        lead:
          "Спред с KAMA и Z-score с порогами ±2: стрелки входа/выхода и текущий сигнал — rationale mean-reversion наглядно.",
        bullets: [
          "Спред + Kaufman Adaptive MA",
          "Z-score: купить / продать / выход",
          "Пороги и «СЕЙЧАС» — без чёрного ящика",
        ],
      },
      broker: {
        url: "/view/settings · broker",
        kicker: "Исполнение",
        title: "Брокерская консоль",
        lead:
          "T-Invest sandbox: токен и счёт в UI, reconcile, пополнение песочницы и kill-switch — без правки application-local.yml.",
        bullets: [
          "Статус и сверка paper ↔ брокер",
          "AUTO / sandbox / лимитные заявки",
          "Токен хранится в операторке, не на лендинге",
        ],
      },
    };

    const tips = {
      regime: {
        label: "Режим рынка",
        body: "TREND + ADX 34 → блок новых pairs-входов. Mean-reversion ждёт SIDEWAYS.",
      },
      capital: {
        label: "Капитал",
        body: "Equity 200 000 ₽ · 100% DAILY · INTRADAY 0%. Плечо выкл при equity &lt; 1M ₽.",
      },
      universe: {
        label: "Вселенная",
        body: "55 тикеров · 178 пар · топ-2 по коинтеграции. Исследовательский контур, не автоордер.",
      },
      broker: {
        label: "Брокер",
        body: "Токен и счёт подключены. Контур AUTO · sandbox — безопасная проверка исполнения.",
      },
      next: {
        label: "Что сделать сейчас",
        body: "Подсказка оператору: смотреть режим, запустить «Анализ + paper», разобрать Итог / Paper.",
      },
      spread: {
        label: "Спред + KAMA",
        body: "Сырой спред и адаптивная средняя — база для Z-score и визуальной оценки разъезда.",
      },
      zscore: {
        label: "Z-score",
        body: "Пороги ±2σ и стрелки входа/выхода. Research-сигнал, не кнопка «купить на бирже».",
      },
      now: {
        label: "Сейчас",
        body: "Текущий вердикт по паре (например ПРОДАТЬ спред) — для разбора, не автоордер с лендинга.",
      },
      sandbox: {
        label: "Песочница",
        body: "T-Invest sandbox готов: paper pairs и позиции брокера сверяются без боевого риска.",
      },
      token: {
        label: "Токен / счёт",
        body: "Токен и accountId задаются в настройках операторки. На маркетинговом кабинете их нет.",
      },
      safety: {
        label: "Защита",
        body: "Kill-switch и market-exit — аварийные тумблеры. По умолчанию выключены, пока не включите сами.",
      },
    };

    const tabs = showcase.querySelectorAll("[data-shot]");
    const panels = showcase.querySelectorAll("[data-panel]");
    const tipBox = showcase.querySelector("[data-product-tip]");
    const tipLabel = showcase.querySelector("[data-tip-label]");
    const tipBody = showcase.querySelector("[data-tip-body]");
    const chromeUrl = showcase.querySelector("[data-chrome-url]");
    const chrome = showcase.querySelector("[data-product-chrome]");
    const lightbox = document.querySelector("[data-product-lightbox]");
    const lightboxImg = lightbox && lightbox.querySelector("[data-lightbox-img]");

    function setCopy(id) {
      const data = shots[id];
      if (!data) return;
      const kicker = showcase.querySelector("[data-shot-kicker]");
      const title = showcase.querySelector("[data-shot-title]");
      const lead = showcase.querySelector("[data-shot-lead]");
      const bullets = showcase.querySelector("[data-shot-bullets]");
      if (chromeUrl) chromeUrl.textContent = data.url;
      if (kicker) kicker.textContent = data.kicker;
      if (title) title.textContent = data.title;
      if (lead) lead.textContent = data.lead;
      if (bullets) {
        bullets.innerHTML = data.bullets.map((b) => "<li>" + b + "</li>").join("");
      }
    }

    function hideTip() {
      if (!tipBox) return;
      tipBox.hidden = true;
      showcase.querySelectorAll(".hotspot.is-active").forEach((h) => h.classList.remove("is-active"));
    }

    function showTip(key, hotspot) {
      const tip = tips[key];
      if (!tip || !tipBox) return;
      tipLabel.textContent = tip.label;
      tipBody.textContent = tip.body;
      tipBox.hidden = false;
      showcase.querySelectorAll(".hotspot.is-active").forEach((h) => h.classList.remove("is-active"));
      if (hotspot) hotspot.classList.add("is-active");
    }

    function activate(id) {
      tabs.forEach((tab) => {
        const on = tab.getAttribute("data-shot") === id;
        tab.classList.toggle("is-active", on);
        tab.setAttribute("aria-selected", String(on));
      });
      panels.forEach((panel) => {
        const on = panel.getAttribute("data-panel") === id;
        panel.classList.toggle("is-active", on);
        panel.hidden = !on;
      });
      hideTip();
      setCopy(id);
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => activate(tab.getAttribute("data-shot")));
    });

    showcase.querySelectorAll(".hotspot").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const key = btn.getAttribute("data-tip");
        if (btn.classList.contains("is-active")) hideTip();
        else showTip(key, btn);
      });
    });

    showcase.querySelectorAll("[data-zoom]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!lightbox || !lightboxImg) return;
        const src = btn.getAttribute("data-zoom");
        const img = btn.querySelector("img");
        lightboxImg.src = src;
        lightboxImg.alt = (img && img.alt) || "";
        if (typeof lightbox.showModal === "function") lightbox.showModal();
      });
    });

    if (lightbox) {
      lightbox.addEventListener("click", (e) => {
        if (e.target === lightbox) lightbox.close();
      });
    }

    if (chrome && !reduceMotion) {
      chrome.addEventListener("mousemove", (e) => {
        const r = chrome.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        chrome.style.transform =
          "perspective(1200px) rotateY(" +
          (x * 4).toFixed(2) +
          "deg) rotateX(" +
          (-y * 3).toFixed(2) +
          "deg)";
      });
      chrome.addEventListener("mouseleave", () => {
        chrome.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg)";
      });
    }

    setCopy("dashboard");
  }
})();
