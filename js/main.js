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

  /* Lightbox: native pixels, wheel/± zoom, pan, 1:1 */
  const lightbox = document.querySelector("[data-product-lightbox]");
  const lightboxImg = lightbox && lightbox.querySelector("[data-lightbox-img]");
  const lightboxStage = lightbox && lightbox.querySelector("[data-lightbox-stage]");
  const lightboxCaption = lightbox && lightbox.querySelector("[data-lightbox-caption]");
  if (lightbox && lightboxImg && lightboxStage) {
    const MIN_SCALE = 0.35;
    const MAX_SCALE = 5;
    let scale = 1;
    let tx = 0;
    let ty = 0;
    let drag = null;

    function applyTransform() {
      lightboxImg.style.transform = "translate(" + tx + "px, " + ty + "px) scale(" + scale + ")";
    }

    function nativeView() {
      scale = 1;
      tx = 0;
      ty = 0;
      applyTransform();
    }

    function fitToStage() {
      const nw = lightboxImg.naturalWidth;
      const nh = lightboxImg.naturalHeight;
      const rect = lightboxStage.getBoundingClientRect();
      if (!nw || !nh || rect.width < 8 || rect.height < 8) {
        nativeView();
        return;
      }
      scale = Math.min(1, (rect.width - 24) / nw, (rect.height - 24) / nh);
      scale = Math.max(MIN_SCALE, scale);
      tx = 0;
      ty = 0;
      applyTransform();
    }

    function bumpZoom(dir, cx, cy) {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale + dir * 0.25));
      if (next === scale) return;
      const rect = lightboxStage.getBoundingClientRect();
      const px = (cx != null ? cx : rect.left + rect.width / 2) - rect.left - rect.width / 2;
      const py = (cy != null ? cy : rect.top + rect.height / 2) - rect.top - rect.height / 2;
      const k = next / scale;
      tx = px - k * (px - tx);
      ty = py - k * (py - ty);
      scale = next;
      applyTransform();
    }

    function openShot() {
      nativeView();
      if (typeof lightbox.showModal === "function") lightbox.showModal();
      if (lightboxImg.complete && lightboxImg.naturalWidth) {
        requestAnimationFrame(fitToStage);
      }
    }

    lightboxImg.addEventListener("load", () => {
      if (lightbox.open) fitToStage();
    });

    document.querySelectorAll("[data-zoom]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const src = btn.getAttribute("data-zoom");
        const img = btn.querySelector("img");
        const caption = btn.getAttribute("data-zoom-caption");
        if (lightboxImg.getAttribute("src") !== src) {
          lightboxImg.src = src;
        }
        lightboxImg.alt = (img && img.alt) || "";
        if (lightboxCaption) {
          if (caption) {
            lightboxCaption.hidden = false;
            lightboxCaption.textContent = caption;
          } else {
            lightboxCaption.hidden = true;
            lightboxCaption.textContent = "";
          }
        }
        openShot();
      });
    });

    lightbox.querySelectorAll("[data-lightbox-zoom]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        bumpZoom(Number(btn.getAttribute("data-lightbox-zoom")) || 1);
      });
    });
    const resetBtn = lightbox.querySelector("[data-lightbox-reset]");
    if (resetBtn) {
      resetBtn.addEventListener("click", (e) => {
        e.preventDefault();
        nativeView();
      });
    }
    const closeBtn = lightbox.querySelector("[data-lightbox-close]");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (typeof lightbox.close === "function") lightbox.close();
      });
    }

    lightboxStage.addEventListener("wheel", (e) => {
      e.preventDefault();
      bumpZoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
    }, { passive: false });

    lightboxStage.addEventListener("dblclick", (e) => {
      e.preventDefault();
      if (scale < 0.98) nativeView();
      else fitToStage();
    });

    lightboxStage.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, tx: tx, ty: ty };
      lightboxStage.classList.add("is-dragging");
      lightboxStage.setPointerCapture(e.pointerId);
    });
    lightboxStage.addEventListener("pointermove", (e) => {
      if (!drag) return;
      tx = drag.tx + (e.clientX - drag.x);
      ty = drag.ty + (e.clientY - drag.y);
      applyTransform();
    });
    function endDrag() {
      drag = null;
      lightboxStage.classList.remove("is-dragging");
    }
    lightboxStage.addEventListener("pointerup", endDrag);
    lightboxStage.addEventListener("pointercancel", endDrag);

    lightbox.addEventListener("keydown", (e) => {
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        bumpZoom(1);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        bumpZoom(-1);
      } else if (e.key === "0") {
        e.preventDefault();
        nativeView();
      }
    });

    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) lightbox.close();
    });
    lightbox.addEventListener("close", nativeView);
  }
})();
