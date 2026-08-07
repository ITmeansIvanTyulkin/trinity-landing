/**
 * Mock unlock-key helpers for cabinet demo (pure).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TrinityUnlockKey = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function segmentFromRandom(randomFn) {
    const rnd = typeof randomFn === "function" ? randomFn : Math.random;
    return rnd()
      .toString(36)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4);
  }

  function maskKey(full) {
    const body = String(full || "").replace(/^TRINITY-/, "");
    const parts = body.split("-").join("");
    const head = parts.slice(0, 4);
    const tail = parts.slice(-4);
    return "TRINITY-" + head + "-••••-••••-" + tail;
  }

  function generateKey(randomFn, now) {
    const seg = () => segmentFromRandom(randomFn);
    const body = [seg(), seg(), seg(), seg()].join("-");
    const full = "TRINITY-" + body;
    const date =
      now instanceof Date
        ? now.toISOString().slice(0, 10)
        : String(now || new Date().toISOString().slice(0, 10));
    return {
      full: full,
      masked: maskKey(full),
      lastRotated: date,
    };
  }

  function displayKey(current, revealed) {
    if (!current) return "";
    return revealed ? current.full : current.masked;
  }

  function toggleLabel(revealed) {
    return revealed ? "Скрыть" : "Показать";
  }

  return {
    segmentFromRandom: segmentFromRandom,
    maskKey: maskKey,
    generateKey: generateKey,
    displayKey: displayKey,
    toggleLabel: toggleLabel,
  };
});
