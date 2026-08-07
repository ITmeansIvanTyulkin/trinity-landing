(() => {
  const Modes = window.TrinityProductModes;
  const modes = (Modes && Modes.MODES) || [
    { id: "SIDEWAYS", book: "DAILY", alloc: "100% pairs", focus: "mean-rev" },
  ];

  const pill = document.querySelector("[data-mode-pill]");
  const kpiBook = document.querySelector("[data-kpi-book]");
  const kpiAlloc = document.querySelector("[data-kpi-alloc]");
  const kpiFocus = document.querySelector("[data-kpi-focus]");

  let modeIndex = 0;

  function applyMode(index) {
    const mode = Modes ? Modes.modeAt(index) : modes[index];
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
      modeIndex = Modes ? Modes.nextModeIndex(modeIndex) : (modeIndex + 1) % modes.length;
      applyMode(modeIndex);
    }, 3200);
  }

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

  /* —— Product showcase (tabs / hotspots / lightbox) —— */
  const showcase = document.querySelector("[data-product-showcase]");
  if (showcase && Modes) {
    const tabs = showcase.querySelectorAll("[data-shot]");
    const panels = showcase.querySelectorAll("[data-panel]");
    const tipBox = showcase.querySelector("[data-product-tip]");
    const tipLabel = showcase.querySelector("[data-tip-label]");
    const tipBody = showcase.querySelector("[data-tip-body]");
    const chromeUrl = showcase.querySelector("[data-chrome-url]");
    const chrome = showcase.querySelector("[data-product-chrome]");

    function setCopy(id) {
      const data = Modes.getShot(id);
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
      const tip = Modes.getTip(key);
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

    if (chrome && !reduceMotion) {
      chrome.addEventListener("mousemove", (e) => {
        const r = chrome.getBoundingClientRect();
        const t = Modes.chromeTilt(e.clientX, e.clientY, r);
        chrome.style.transform =
          "perspective(1200px) rotateY(" +
          t.rotateY +
          "deg) rotateX(" +
          t.rotateX +
          "deg)";
      });
      chrome.addEventListener("mouseleave", () => {
        chrome.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg)";
      });
    }

    setCopy("dashboard");
  }

  /* Lightbox for product + proof screenshots */
  const lightbox = document.querySelector("[data-product-lightbox]");
  const lightboxImg = lightbox && lightbox.querySelector("[data-lightbox-img]");
  if (lightbox && lightboxImg) {
    document.querySelectorAll("[data-zoom]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const src = btn.getAttribute("data-zoom");
        const img = btn.querySelector("img");
        lightboxImg.src = src;
        lightboxImg.alt = (img && img.alt) || "";
        if (typeof lightbox.showModal === "function") lightbox.showModal();
      });
    });
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) lightbox.close();
    });
  }
})();
