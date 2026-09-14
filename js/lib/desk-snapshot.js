/**
 * Normalize a desk_snapshots row for the cabinet (pure).
 * Trial is 7 days from first desktop launch. Live broker robot is paid-only.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TrinityDeskSnapshot = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TRIAL_DAYS = 7;
  const STALE_MS = 30 * 60 * 1000;

  function asNumber(v) {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function asInt(v, fallback) {
    const n = asNumber(v);
    return n == null ? fallback : Math.round(n);
  }

  function asArray(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function isStale(updatedAt, now) {
    if (!updatedAt) return true;
    const t = Date.parse(updatedAt);
    if (!Number.isFinite(t)) return true;
    const n = now instanceof Date ? now.getTime() : Date.now();
    return n - t > STALE_MS;
  }

  function daysLeftFromEnds(ends, now) {
    if (!ends) return null;
    const endMs = Date.parse(ends);
    if (!Number.isFinite(endMs)) return null;
    const n = now instanceof Date ? now.getTime() : Date.now();
    return Math.max(0, Math.ceil((endMs - n) / 86400000));
  }

  function resolveLicense(row, now) {
    const raw = String((row && row.license_status) || "").toLowerCase();
    if (raw === "active") {
      return {
        licenseStatus: "active",
        trialDaysLeft: 0,
        trialActive: false,
        liveTrading: true,
      };
    }
    const fromEnds = daysLeftFromEnds(row && row.trial_ends_at, now);
    const left = fromEnds != null ? fromEnds : asInt(row && row.trial_days_left, 0);
    if (left > 0) {
      return {
        licenseStatus: "trial",
        trialDaysLeft: left,
        trialActive: true,
        liveTrading: false,
      };
    }
    if (raw === "expired" || (row && row.trial_ends_at) || raw === "trial") {
      return {
        licenseStatus: "expired",
        trialDaysLeft: 0,
        trialActive: false,
        liveTrading: false,
      };
    }
    return {
      licenseStatus: raw,
      trialDaysLeft: 0,
      trialActive: false,
      liveTrading: false,
    };
  }

  function licenseCopy(snap) {
    const status = snap && snap.licenseStatus;
    const left = snap && typeof snap.trialDaysLeft === "number" ? snap.trialDaysLeft : 0;
    if (status === "active") {
      return "Подписка активна. Автоторги роботом — в приложении на вашем компьютере, у брокера.";
    }
    if (status === "expired") {
      return "Семь дней триала закончились. Приложение открывается, но не работает, пока не оплатите. После оплаты включатся автоторги у брокера.";
    }
    if (status === "trial") {
      return (
        "Пробный период: осталось " +
        left +
        " из " +
        TRIAL_DAYS +
        " дней. Живых заявок и автоторгов у брокера нет — только разбор и учебный журнал."
      );
    }
    return "Скачайте приложение на компьютер. Семь дней триала начнутся с первого запуска. В триале нет живых заявок у брокера.";
  }

  function formatAge(updatedAt, now) {
    if (!updatedAt) return "";
    const t = Date.parse(updatedAt);
    if (!Number.isFinite(t)) return "";
    const n = now instanceof Date ? now.getTime() : Date.now();
    const sec = Math.max(0, Math.round((n - t) / 1000));
    if (sec < 60) return "только что";
    const min = Math.round(sec / 60);
    if (min < 60) return min + " мин назад";
    const hours = Math.round(min / 60);
    if (hours < 24) return hours + " ч назад";
    const days = Math.round(hours / 24);
    return days + " дн. назад";
  }

  /**
   * kind: "none" | "snapshot" | "local"
   * Snapshot = row from desk_snapshots. Local = this machine's desk, not yet in the cloud.
   */
  function dataSourceCopy(kind, opts) {
    opts = opts || {};
    const age = formatAge(opts.updatedAt, opts.now);
    if (kind === "snapshot") {
      if (opts.stale) {
        return {
          kind: "stale",
          flag: "Снимок устарел",
          line: age
            ? "Это не живые данные: последний снимок из приложения — " +
              age +
              ". Запустите стол на компьютере, чтобы цифры ожили."
            : "Это не живые данные: последний снимок давно не обновлялся. Запустите приложение на компьютере.",
        };
      }
      return {
        kind: "live",
        flag: "Из приложения",
        line: age
          ? "Живые данные из вашего приложения · обновлено " +
            age +
            ". Это режим и учебный журнал, не заявки у брокера."
          : "Живые данные из вашего приложения. Это режим и учебный журнал, не заявки у брокера.",
      };
    }
    if (kind === "local") {
      return {
        kind: "local",
        flag: "С этого компьютера",
        line: "Живые данные с приложения на этом компьютере. С другого устройства их не будет, пока стол не запишет снимок.",
      };
    }
    return {
      kind: "empty",
      flag: "Нет снимка",
      line: "Это не живые данные. Приложение ещё не присылало снимок — блоки пустые, без выдуманного результата.",
    };
  }

  function normalize(row, now) {
    if (!row) {
      return {
        hasRow: false,
        stale: true,
        licenseStatus: "",
        trialDaysLeft: 0,
        trialTotalDays: TRIAL_DAYS,
        trialActive: false,
        liveTrading: false,
        regimeLabel: "UNKNOWN",
        regimeNote: "",
        book: "DAILY",
        realizedPnlRub: null,
        unrealizedPnlRub: null,
        openCount: 0,
        closedCount: 0,
        openSlots: [],
        equityPoints: [],
        updatedAt: null,
      };
    }

    const lic = resolveLicense(row, now);
    const points = asArray(row.equity_points)
      .map(asNumber)
      .filter(function (n) {
        return n != null;
      });
    const slots = asArray(row.open_slots).map(function (s) {
      if (!s || typeof s !== "object") {
        return { pair: "—", book: "DAILY", z: "—", status: "OPEN", size: "—" };
      }
      return {
        id: s.id || "",
        pair: s.pair || [s.tickerY, s.tickerX].filter(Boolean).join(" / ") || "—",
        ticker: s.ticker || s.pair || [s.tickerY, s.tickerX].filter(Boolean).join(" / ") || "—",
        book: s.book || "DAILY",
        z:
          s.z != null
            ? String(s.z)
            : s.markZ != null
              ? Number(s.markZ).toFixed(2)
              : "—",
        status: s.status || "OPEN",
        size: s.size != null ? String(s.size) : "—",
        side: s.side || "",
        entryPrice: asNumber(s.entryPrice),
        exitPrice: asNumber(s.exitPrice),
        exitReason: s.exitReason || "",
        openedAt: s.openedAt || "",
        closedAt: s.closedAt || "",
        qty: asNumber(s.qty),
        pnl: asNumber(s.pnlRub != null ? s.pnlRub : s.pnl),
        mode: s.mode || "",
      };
    });

    return {
      hasRow: true,
      stale: isStale(row.updated_at, now),
      licenseStatus: lic.licenseStatus,
      trialDaysLeft: lic.trialDaysLeft,
      trialTotalDays: TRIAL_DAYS,
      trialActive: lic.trialActive,
      liveTrading: lic.liveTrading,
      regimeLabel: row.regime_label || "UNKNOWN",
      regimeNote: String(row.regime_note || ""),
      book: row.book || "DAILY",
      realizedPnlRub: asNumber(row.realized_pnl_rub),
      unrealizedPnlRub: asNumber(row.unrealized_pnl_rub),
      openCount: asInt(row.open_count, 0),
      closedCount: asInt(row.closed_count, 0),
      openSlots: slots,
      equityPoints: points,
      updatedAt: row.updated_at || null,
    };
  }

  return {
    TRIAL_DAYS: TRIAL_DAYS,
    STALE_MS: STALE_MS,
    isStale: isStale,
    daysLeftFromEnds: daysLeftFromEnds,
    formatAge: formatAge,
    dataSourceCopy: dataSourceCopy,
    licenseCopy: licenseCopy,
    normalize: normalize,
  };
});
