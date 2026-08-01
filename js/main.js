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

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setInterval(() => {
      modeIndex = (modeIndex + 1) % modes.length;
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

  /* Capital calculator — mirrors product allocator spirit */
  const equity = document.getElementById("equity");
  const equityLabel = document.querySelector("[data-equity-label]");
  const slotsEl = document.querySelector("[data-slots]");
  const grossEl = document.querySelector("[data-gross]");

  function formatRub(n) {
    return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
  }

  function updateCalc() {
    if (!equity) return;
    const value = Number(equity.value);
    if (equityLabel) equityLabel.textContent = formatRub(value);

    // Soft mirror of CapitalAllocator defaults: ~1 slot per 100k, cap grows with equity
    let slots = Math.max(1, Math.floor(value / 100000));
    if (value >= 1000000) slots = Math.min(slots, 12);
    else slots = Math.min(slots, 8);

    if (slotsEl) slotsEl.textContent = String(slots);
    if (grossEl) grossEl.textContent = formatRub(value);
  }

  if (equity) {
    equity.addEventListener("input", updateCalc);
    updateCalc();
  }
})();
