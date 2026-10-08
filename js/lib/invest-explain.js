/**
 * Investor-facing research report from pipeline gates.
 * Clear business Russian — no slang (“полка”, “нож”, “с плеча”).
 * No internal jargon in the body (no ISS / Excel / MVP / gates).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TrinityInvestExplain = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERDICT_RU = {
    invest: "Покупать",
    watch: "Наблюдать",
    skip: "Не брать",
  };

  const STATUS_RU = {
    Pass: "в порядке",
    Weak: "осторожно",
    Fail: "стоп",
    NoData: "нет данных",
  };

  const LEVEL_RU = {
    conservative: "спокойный",
    moderate: "умеренный",
    aggressive: "агрессивный",
  };

  function pct(n, d) {
    if (n == null || !Number.isFinite(Number(n))) return "нет цифры";
    return (Number(n) * 100).toFixed(d == null ? 1 : d).replace(".", ",") + "%";
  }

  function num(n, d) {
    if (n == null || !Number.isFinite(Number(n))) return "нет цифры";
    return Number(n).toFixed(d == null ? 2 : d).replace(".", ",");
  }

  function rub(n, d) {
    if (n == null || !Number.isFinite(Number(n))) return "нет цены";
    const x = Number(n);
    const digits = d != null ? d : x >= 1000 ? 0 : x >= 100 ? 1 : 2;
    return num(x, digits) + " ₽";
  }

  function g(payload, id) {
    return (payload.gates && payload.gates[id]) || { status: "NoData", detail: "", metrics: {} };
  }

  function para() {
    return Array.prototype.slice.call(arguments).filter(Boolean).join("\n\n");
  }

  function sec(id, title, status, body) {
    return {
      id: id,
      title: title,
      status: status || "NoData",
      statusLabel: STATUS_RU[status] || "нет данных",
      body: body,
    };
  }

  function horizonInfo(profile) {
    const id = profile && (profile.horizon || (profile.answers && profile.answers.horizon));
    if (id === "lt1") return { id: id, label: "до года", kind: "short" };
    if (id === "y1_3") return { id: id, label: "год–три", kind: "mid" };
    if (id === "y3_5") return { id: id, label: "три–пять лет", kind: "long" };
    if (id === "y5") return { id: id, label: "пять лет и дольше", kind: "long" };
    return { id: null, label: null, kind: "mid" };
  }

  function band(lo, hi) {
    if (lo == null || hi == null || !Number.isFinite(Number(lo)) || !Number.isFinite(Number(hi))) return null;
    const a = Math.min(Number(lo), Number(hi));
    const b = Math.max(Number(lo), Number(hi));
    return rub(a) + "–" + rub(b);
  }

  function stretchPct(ind) {
    if (!ind || ind.last == null || ind.smaFast == null || ind.smaFast === 0) return null;
    return (ind.last - ind.smaFast) / ind.smaFast;
  }

  function buildEntry(p) {
    const last = (p.quote && p.quote.last) || (p.indicators && p.indicators.last);
    const cl = p.cluster || {};
    const ranges = (p.fund && p.fund.ranges) || null;
    const h = horizonInfo(p.riskProfile);
    const ind = p.indicators || {};
    const v = p.verdict;
    const rsi = ind.rsi;
    const ext = stretchPct(ind);
    const stretched = (ext != null && ext > 0.03) || (rsi != null && rsi > 65);
    const chase = rsi != null && rsi > 70;
    const fund = g(p, "fund");
    const shelfLow = cl.val != null && cl.poc != null ? Math.min(cl.val, cl.poc) : null;
    const shelfHigh = cl.val != null && cl.poc != null ? Math.max(cl.val, cl.poc) : null;
    const z1 = ranges && ranges.zone1;
    const z2 = ranges && ranges.zone2;
    let primaryLow = shelfLow;
    let primaryHigh = shelfHigh;
    if (primaryLow == null && z1) {
      primaryLow = z1.low;
      primaryHigh = z1.high;
    } else if (primaryLow != null && z1 && h.kind !== "short") {
      primaryLow = Math.min(primaryLow, z1.low);
      primaryHigh = Math.max(Math.min(primaryHigh, z1.high), primaryLow);
    }
    if (stretched && shelfHigh != null) {
      primaryHigh = Math.min(primaryHigh, shelfHigh);
    }
    const addLow = h.kind === "short" ? null : z2 ? z2.low : null;
    const addHigh = h.kind === "short" ? null : z2 ? z2.high : cl.val != null ? cl.val : null;
    const inShelf =
      last != null && primaryLow != null && primaryHigh != null && last >= primaryLow && last <= primaryHigh * 1.01;
    const loc = cl.location;
    let stance = "wait";
    if (v === "skip" || fund.status === "Fail" || chase) stance = "stand";
    else if (v === "invest" && !stretched && (inShelf || loc === "inside" || loc === "below")) stance = "buy";
    else if (v === "invest" && stretched) stance = "wait";
    else if (v === "watch") stance = "wait";

    const lines = [];
    const hz = h.label
      ? "Горизонт из анкеты — " + h.label + ". "
      : "Горизонт в анкете не указан — считаю средним. ";
    if (stance === "buy") {
      lines.push(
        hz +
          "Вердикт: покупать. Разумнее лимитной заявкой в рабочую зону " +
          (band(primaryLow, primaryHigh) || "около текущих цен") +
          (cl.poc != null ? " (точка контроля " + rub(cl.poc) + ")" : "") +
          ", а не рыночной «лишь бы войти»."
      );
      if (inShelf && last != null) {
        lines.push(
          "Цена " + rub(last) + " уже в зоне. Первый объём можно набирать здесь, не догоняя резкий рост."
        );
      } else if (last != null && primaryHigh != null && last > primaryHigh) {
        lines.push(
          "Цена " +
            rub(last) +
            " выше рабочей зоны. Дождитесь отката — иначе покупка идёт с переплатой."
        );
      } else if (last != null) {
        lines.push(
          "Цена " + rub(last) + ". Набор — от текущих уровней вниз к нижней границе зоны, не наоборот."
        );
      }
      if (addLow != null && addHigh != null && h.kind === "long") {
        lines.push(
          "Длинный горизонт: возможная докупка в " +
            band(addLow, addHigh) +
            ". Не усредняйте убыток каждый день назло рынку."
        );
      } else if (h.kind === "short") {
        lines.push(
          "Короткий горизонт: один вход, без наращивания вниз. Не попали в зону — лучше подождать."
        );
      } else {
        lines.push(
          "Средний горизонт: сначала зона входа, затем проверка отчётности. Не открывайте вторую часть позиции, пока первая не в зоне."
        );
      }
    } else if (stance === "wait") {
      lines.push(
        hz +
          "Вердикт: наблюдать. Сейчас вход не готов. Рабочая зона — " +
          (band(primaryLow, primaryHigh) || "ещё не определена") +
          (cl.poc != null ? ", ориентир — точка контроля " + rub(cl.poc) : "") +
          "."
      );
      if (fund.status === "NoData") {
        lines.push(
          "По бизнесу цифр нет. Покупать на отскок без отчётности — лотерея, не рабочий вход."
        );
      } else if (stretched || chase) {
        lines.push(
          "Бумага сильно выросла. Догонять максимумы обычно дорого. Дождитесь возврата в зону, а не покупки на пике."
        );
      } else if (loc === "above") {
        lines.push(
          "Цена выше зоны стоимости — с премией. Имеет смысл ждать возврата в зону."
        );
      } else {
        lines.push(
          "Идея понятна, но вход шаткий. Лучше лимитная заявка в зону, а не рыночная по текущей цене."
        );
      }
      if (addLow != null && h.kind === "long") {
        lines.push(
          "При длинном горизонте, если основная зона так и не появится, смотрите более глубокий диапазон " +
            band(addLow, addHigh) +
            " — и только после свежей отчётности."
        );
      }
    } else {
      lines.push(hz + "Вердикт: не брать. Сейчас лучше оставаться в стороне.");
      if (primaryLow != null) {
        lines.push(
          "Возвращаться имеет смысл не на надежде «должно отскочить», а к зоне " +
            band(primaryLow, primaryHigh) +
            " — и только когда закроется конкретный пробел: отчётность, тонкий оборот или перегрев."
        );
      } else {
        lines.push(
          "Зоны входа пока нет: мало данных по профилю или по бизнесу. Тикер можно оставить в списке наблюдения."
        );
      }
    }
    if (cl.vah != null && last != null && last > cl.vah && stance !== "stand") {
      lines.push(
        "Выше верхней границы зоны стоимости (" +
          rub(cl.vah) +
          ") набор не ведём — это резкий вынос цены, а не спокойная проторговка."
      );
    }
    lines.push(
      "Заявку с этой страницы на биржу не отправляем. Это разбор для вашего решения, не приказ купить."
    );
    return {
      stance: stance,
      horizon: h,
      last: last,
      primaryLow: primaryLow,
      primaryHigh: primaryHigh,
      addLow: addLow,
      addHigh: addHigh,
      poc: cl.poc,
      val: cl.val,
      vah: cl.vah,
      lines: lines,
    };
  }

  function whyLine(p) {
    const v = p.verdict;
    const fund = g(p, "fund");
    const mkt = g(p, "market");
    const cl = p.cluster || {};
    const ind = p.indicators || {};
    if (mkt.status === "Fail") {
      return "Котировку на Мосбирже не подтвердили. Ниже — справочный разбор, не рабочая идея.";
    }
    if (v === "invest") {
      if (cl.poc != null) {
        return (
          "По бизнесу и рынку картина приемлемая. Рабочая зона набора — около точки контроля " +
          rub(cl.poc) +
          ". Это условие для входа, а не обещание роста."
        );
      }
      return "Цена, отчётность и оборот согласуются. Набирать лучше в зоне, а не рыночной заявкой на максимумах.";
    }
    if (v === "skip") {
      if (ind.rsi != null && ind.rsi > 70) {
        return "Бумага перегрета. Сейчас легко купить чужой разгон — лучше дождаться охлаждения.";
      }
      return "Слишком много слабых мест. Лучше пройти мимо.";
    }
    if (fund.status === "NoData") {
      return "Цена есть, данных по бизнесу нет. Покупать вслепую нельзя: сначала отчётность, потом вход.";
    }
    if (fund.status === "Fail") {
      return "По отчётности картина напряжённая. Красивый график сам по себе риск не снимает.";
    }
    if (cl.location === "above") {
      return "Идея понятна, но цена выше зоны стоимости. Дождитесь отката в зону.";
    }
    return "Идея понятна, но вход шаткий. Вердикт — наблюдать.";
  }

  function sectionSummary(p) {
    const name = p.name || p.ticker || "Бумага";
    const ticker = p.ticker || "";
    const v = p.verdict;
    const price = p.quote && p.quote.last;
    const entry = p._entry || buildEntry(p);
    const h = entry.horizon;
    const body = para(
      name + (ticker ? " (" + ticker + ")" : "") + ". Вердикт: «" + (VERDICT_RU[v] || v) + "».",
      whyLine(p),
      price != null ? "Последняя цена — " + rub(price) + "." : "Последней цены нет: рынок не ответил.",
      h.label
        ? "Под вас: горизонт " + h.label + "."
        : "Анкета горизонта пустая — зону считаю как для среднего срока. Лучше заполнить: иначе вход без вашей рамки.",
      entry.primaryLow != null
        ? "Рабочая зона: " + band(entry.primaryLow, entry.primaryHigh) + "."
        : "Рабочей зоны пока нет.",
      "Ниже — обоснование, риски и что делать дальше. Доходность не обещается."
    );
    return sec("summary", "Коротко", v === "skip" ? "Fail" : v === "invest" ? "Pass" : "Weak", body);
  }

  function deltaPhrase(label, value) {
    if (value == null || !Number.isFinite(Number(value))) return null;
    const n = Number(value);
    if (Math.abs(n) < 0.005) return label + " почти не изменилась";
    return label + (n > 0 ? " выросла на " : " снизилась на ") + pct(Math.abs(n));
  }

  function sectionFund(p) {
    const fund = p.fund || {};
    const gate = g(p, "fund");
    let body;
    if (gate.status === "NoData") {
      body = para(
        "Котировка есть, а данных по бизнесу нет: выручка, прибыль, долг, свободный денежный поток.",
        "Без этих цифр эмитент нельзя считать проверенным. Поэтому вердикт «покупать» не ставим — только наблюдение.",
        "Цифры подтягиваются при разборе, если отчётность есть в открытом доступе. Их также можно ввести вручную на экране анализа."
      );
    } else {
      const m = fund.metrics || {};
      const lines = [];
      if (fund.sector === "fin") {
        lines.push(
          "Это банк. Устойчивость — «" +
            (fund.reliabilityLabel || "без ярлыка") +
            "», баллов " +
            (fund.score != null ? fund.score : "—") +
            " из " +
            (fund.scoreMax != null ? fund.scoreMax : "—") +
            "."
        );
        const bits = [
          deltaPhrase("Резервы", m.reservesDelta),
          deltaPhrase("Кредитный портфель", m.loansDelta),
          deltaPhrase("Депозиты", m.depositsDelta),
          deltaPhrase("Чистый операционный доход", m.noiDelta),
        ].filter(Boolean);
        if (bits.length) lines.push("За год: " + bits.join("; ") + ".");
        if (m.car != null) {
          const car = Number(m.car);
          let carNote = "Запас капитала — " + pct(car) + ".";
          if (car < 0.08) carNote += " Ниже восьми процентов — уже тревожная черта.";
          else carNote += " Обычно смотрят, чтобы не таял и не падал ниже восьми.";
          lines.push(carNote);
        }
      } else {
        lines.push(
          "Компания не банк. Устойчивость — «" +
            (fund.reliabilityLabel || "без ярлыка") +
            "»" +
            (fund.score != null ? ", баллов " + fund.score + " из " + (fund.scoreMax || "—") : "") +
            "."
        );
        const bits = [
          deltaPhrase("Выручка", m.revenueDelta),
          deltaPhrase("Прибыль от операций", m.opProfitDelta),
          deltaPhrase("Свободный денежный поток", m.fcfDelta),
          deltaPhrase("Долг", m.debtDelta),
          deltaPhrase("Собственный капитал", m.equityDelta),
        ].filter(Boolean);
        if (bits.length) lines.push("За год: " + bits.join("; ") + ".");
        if (m.debtEbitda != null) {
          const de = Number(m.debtEbitda);
          let debtNote = "Долг — примерно " + num(de, 1) + " годовых прибылей до амортизации.";
          if (de > 4) debtNote += " Рычаг уже тяжёлый.";
          else if (de >= 3) debtNote += " На грани: обычно хотят держаться ниже трёх.";
          else debtNote += " По долгу спокойно.";
          lines.push(debtNote);
        }
      }
      if (fund.ranges && fund.ranges.zone1) {
        lines.push(
          "От нынешних " +
            rub(fund.ranges.basis) +
            " чек-лист даёт две скидки: ближняя " +
            num(fund.ranges.zone1.low) +
            "–" +
            num(fund.ranges.zone1.high) +
            " ₽ и глубокая " +
            num(fund.ranges.zone2.low) +
            "–" +
            num(fund.ranges.zone2.high) +
            " ₽. Цена не обязана туда сходить — это где бумага была бы дешевле спота."
        );
      }
      if (gate.status === "Fail") {
        lines.push("Итог по бизнесу настораживает. Красивый график этого не отменяет.");
      } else if (gate.status === "Weak") {
        lines.push("Итог по бизнесу — не провал, но и не сигнал «покупать». Если заходить, то небольшим объёмом.");
      } else {
        lines.push("По доступным цифрам устойчивость выглядит приемлемой.");
      }
      body = lines.join("\n\n");
    }
    return sec("fundamentals", "Бизнес и долг", gate.status, body);
  }

  function sectionStrategy(p) {
    const gate = g(p, "strategy");
    const ind = p.indicators || {};
    const quote = p.quote || {};
    const h = horizonInfo(p.riskProfile);
    const lines = [
      "Это не сигнал «покупайте». Это рамка: куда смотрит тренд, не перегрета ли бумага и не придётся ли догонять рост.",
    ];
    if (h.label) {
      lines.push(
        h.kind === "short"
          ? "Горизонт короткий (" +
              h.label +
              "): важнее дождаться зоны входа, а не покупать на падении. Резкий вынос цены пересидеть сложно."
          : h.kind === "long"
            ? "Горизонт длинный (" +
              h.label +
              "): краткосрочный перекос менее критичен, чем дыра в отчётности. Всё равно не покупаем сильно выше зоны."
            : "Горизонт " + h.label + ": сначала зона входа, потом размер позиции."
      );
    }
    if (ind.last != null && ind.smaSlow != null) {
      if (ind.last >= ind.smaSlow) {
        lines.push(
          "Цена " +
            rub(ind.last) +
            " не ниже средней за пару месяцев (" +
            rub(ind.smaSlow) +
            "). Фон скорее поддерживающий, чем обвальный."
        );
      } else {
        lines.push(
          "Цена " +
            rub(ind.last) +
            " ниже средней за пару месяцев (" +
            rub(ind.smaSlow) +
            "). Краткосрочно бумага слабее фона — либо скидка, либо продолжение снижения."
        );
      }
    }
    if (ind.rsi != null) {
      const rsi = Number(ind.rsi);
      if (rsi > 70) {
        lines.push(
          "Перекупленность " + num(rsi, 0) + ". Новый набор здесь — вход в уже разогнанное движение."
        );
      } else if (rsi >= 65) {
        lines.push(
          "Бумага уже разогрета (" + num(rsi, 0) + "). Наблюдать можно, догонять каждую свечу незачем."
        );
      } else if (rsi < 30) {
        lines.push(
          "Давление продаж сильное (" +
            num(rsi, 0) +
            "). Это не признак дна. Без зоны входа покупать рано."
        );
      } else {
        lines.push("RSI " + num(rsi, 0) + " — середина диапазона, без крайностей.");
      }
    }
    const ext = stretchPct(ind);
    if (ext != null) {
      if (ext > 0.08) {
        lines.push(
          "Цена ушла вверх от короткой средней больше чем на восемь процентов. Догонять такое обычно дорого."
        );
      } else if (ext > 0.03) {
        lines.push("Небольшой отрыв от короткой средней. Вход уже не самый спокойный.");
      } else if (ext < -0.05) {
        lines.push(
          "Цена заметно ниже короткой средней — либо уступка, либо продолжение слабости."
        );
      } else {
        lines.push("Цена рядом с короткой средней: сильной растяжки сейчас нет.");
      }
    }
    if (quote.listLevel === 1) {
      lines.push("Первый список Мосбиржи: ликвидность обычно лучше, чем у бумаг дальнего эшелона.");
    } else if (quote.listLevel === 2) {
      lines.push("Второй список: торговать можно, но по ликвидности это уже не голубая фишка.");
    } else if (quote.listLevel != null) {
      lines.push(
        "Листинг уровня " + quote.listLevel + " — вход и выход могут быть менее комфортными."
      );
    }
    const fund = g(p, "fund");
    if (fund.status === "NoData") {
      lines.push("Отчётности нет: даже удачный график не делает идею готовой к вложению денег.");
    } else if (fund.status === "Fail") {
      lines.push("График не отменяет слабую отчётность: сначала качество бизнеса, потом вход.");
    }
    return sec("strategy", "Вход и тренд", gate.status, lines.join("\n\n"));
  }

  function sectionIndicators(p) {
    const gate = g(p, "indicators");
    const ind = p.indicators || {};
    const lines = [];
    if (ind.last != null && ind.smaFast != null && ind.smaSlow != null) {
      const up = ind.last > ind.smaFast && ind.smaFast > ind.smaSlow;
      const down = ind.last < ind.smaFast && ind.smaFast < ind.smaSlow;
      if (up) {
        lines.push(
          "Дневной фон вверх: цена " +
            rub(ind.last) +
            " выше средней за двадцать дней (" +
            rub(ind.smaFast) +
            "), а та — выше пятидесятидневной (" +
            rub(ind.smaSlow) +
            ")."
        );
      } else if (down) {
        lines.push(
          "Дневной фон вниз: цена " +
            rub(ind.last) +
            " ниже обеих средних (20 — " +
            rub(ind.smaFast) +
            ", 50 — " +
            rub(ind.smaSlow) +
            ")."
        );
      } else {
        lines.push(
          "Наклон смешанный: цена " +
            rub(ind.last) +
            ", средняя за 20 дней — " +
            rub(ind.smaFast) +
            ", за 50 — " +
            rub(ind.smaSlow) +
            ". Чистой линии нет."
        );
      }
    } else {
      lines.push("Дневных свечей не хватило, чтобы собрать средние. Картина тренда обрывается.");
    }
    if (ind.rsi != null) {
      const rsi = Number(ind.rsi);
      if (rsi > 70) lines.push("RSI " + num(rsi, 0) + " — зона, где новые покупки часто опаздывают.");
      else if (rsi < 30) lines.push("RSI " + num(rsi, 0) + " — тревога, а не знак, что дно уже здесь.");
      else lines.push("RSI " + num(rsi, 0) + " — середина диапазона, без крайности.");
    }
    if (ind.rangePct != null) {
      lines.push("За двадцать сессий бумага прошла примерно " + pct(ind.rangePct) + " от края до края.");
    }
    if (ind.bars != null && ind.bars < 60) {
      lines.push("Истории мало (" + ind.bars + " дней) — средние ещё не устоялись.");
    }
    if (!lines.length) lines.push("По графику сказать почти нечего: свечей недостаточно.");
    return sec("indicators", "Картина на графике", gate.status, lines.join("\n\n"));
  }

  function sectionCluster(p) {
    const gate = g(p, "cluster");
    const cl = p.cluster || {};
    const last = (p.quote && p.quote.last) || (p.indicators && p.indicators.last);
    const vol = (gate.metrics && gate.metrics.volRatio) || (p.indicators && p.indicators.volRatio);
    const lines = [];
    if (cl.poc != null) {
      lines.push(
        "Профиль построен по дневкам, " +
          (cl.lookback || cl.bars || "сотни") +
          " торговых дней. Для среднего и длинного горизонта внутридневные уровни сюда не подмешиваем."
      );
      lines.push(
        "Точка контроля — " +
          rub(cl.poc) +
          ". Зона стоимости — " +
          band(cl.val, cl.vah) +
          ". Это не «магический уровень», а область, где за период прошёл наибольший объём."
      );
      if (cl.hvns && cl.hvns.length) {
        lines.push(
          "Дополнительные узлы объёма: " + cl.hvns.map((x) => rub(x)).join(", ") + "."
        );
      }
      if (cl.location === "inside") {
        lines.push(
          (last != null ? "Цена " + rub(last) + " " : "Цена ") +
            "внутри зоны. Идёт проторговка — для набора это плюс."
        );
      } else if (cl.location === "above") {
        lines.push(
          (last != null ? "Цена " + rub(last) + " " : "Цена ") +
            "выше зоны стоимости. Покупка здесь — с премией к зоне."
        );
      } else if (cl.location === "below") {
        lines.push(
          (last != null ? "Цена " + rub(last) + " " : "Цена ") +
            "ниже зоны. Либо скидка, либо зона уже сдана. Без достаточного оборота вход рискованный."
        );
      }
    } else {
      lines.push(
        "Профиль не собрался: мало свечей с объёмом. Без зоны стоимости точку входа ставить не из чего."
      );
    }
    if (vol == null) {
      lines.push("Оборота по последней свече нет — не видно, активный рынок или тонкий.");
    } else if (vol < 0.5) {
      lines.push(
        "Оборот очень низкий: " +
          num(vol, 2) +
          " от обычного. В такой тишине и вход, и выход менее предсказуемы."
      );
    } else if (vol > 2.5) {
      lines.push(
        "Оборот резко вырос: примерно в " +
          num(vol, 1) +
          " раза выше обычного. Так бывает на новостях и перекладках. Не принимайте всплеск за начало тренда."
      );
    } else {
      lines.push(
        "Оборот около " + num(vol, 2) + " от среднего — по бумаге рынок достаточно активный."
      );
    }
    if (cl.tailDelta != null && cl.poc != null) {
      const tail = cl.tailBars || 20;
      if (cl.tailDelta > 0) {
        lines.push(
          "По последним " +
            tail +
            " дневкам закрытия ближе к максимумам: дельта в плюсе. Скорее преобладал спрос. Читаем дневные свечи, не ленту сделок."
        );
      } else if (cl.tailDelta < 0) {
        lines.push(
          "По последним " +
            tail +
            " дневкам закрытия ближе к минимумам: дельта в минусе. Давление продаж. Пока нет возврата к проторговке в зоне — вход рано."
        );
      } else {
        lines.push(
          "Дельта последних " + tail + " дней около нуля: явного перекоса спроса или предложения нет."
        );
      }
    }
    lines.push(
      "Минутный футпринт — для короткого горизонта. Здесь горизонт инвестиционный: точка входа считается по дневкам, где за месяцы прошёл объём — там зона стоимости."
    );
    return sec("cluster", "Профиль и дельта", gate.status, lines.join("\n\n"));
  }

  function sectionRisk(p) {
    const profile = p.riskProfile;
    const ind = p.indicators || {};
    const h = horizonInfo(profile);
    let status = "NoData";
    let body;
    if (!profile || !profile.risk_level) {
      body = para(
        "Анкета ещё не заполнена. Без неё нельзя понять, насколько колебания бумаги вам подходят.",
        "Укажите горизонт, запас и реакцию на просадку — иначе зона входа будет общей, а не под ваш срок."
      );
    } else {
      const warn = Number(profile.warn_drawdown_pct);
      const range = ind.rangePct != null ? ind.rangePct * 100 : null;
      if (range != null && range > warn * 1.3) status = "Fail";
      else if (range != null && range > warn) status = "Weak";
      else status = "Pass";
      if (p.verdict === "invest" && profile.risk_level === "conservative" && status !== "Pass") {
        status = "Weak";
      }
      const swing = range == null ? "нет цифры" : range.toFixed(1).replace(".", ",") + "%";
      let fit;
      if (status === "Fail") {
        fit =
          "За месяц бумага уже колебалась шире, чем вам комфортно. Даже если идея нравится — размер лучше маленький или ноль.";
      } else if (status === "Weak") {
        fit =
          "Колебания близки к вашей границе. Наблюдать можно; входить «как обычно» уже спорно.";
      } else {
        fit =
          "Недавние колебания не выходят за просадку, которую вы сами отметили как предупреждение.";
      }
      body = para(
        "Профиль — " +
          (LEVEL_RU[profile.risk_level] || profile.risk_level) +
          (h.label ? ", горизонт " + h.label : "") +
          ". Просадка около " +
          warn +
          "% для вас — повод пересмотреть тезис, а не автоматически ставить биржевой стоп.",
        "За двадцать дней бумага прошла примерно " + swing + ". " + fit,
        p.verdict === "invest" && profile.risk_level === "conservative"
          ? "Для спокойного профиля «покупать» значит небольшим объёмом, не всей доступной суммой."
          : h.kind === "short"
            ? "Короткий горизонт плохо переносит догоняние цены. Только зона входа и лимитная заявка."
            : null
      );
    }
    return sec("risk_fit", "Под вас", status, body);
  }

  function sectionScenarios(p) {
    const fund = g(p, "fund");
    const name = p.name || p.ticker || "Компания";
    const status = fund.status === "Fail" ? "Fail" : fund.status === "NoData" ? "NoData" : "Weak";
    const m = (p.fund && p.fund.metrics) || {};
    let base;
    let opt;
    let risk;
    if (fund.status === "NoData") {
      base =
        "База. " +
        name +
        " торгуется, а показатели бизнеса неизвестны. Разумный ход — ничего не решать, пока не появятся цифры.";
      opt = "Оптимистичный сценарий без отчётности строить незачем: нет опоры в прибыли и долге.";
      risk =
        "Главный риск — купить вслепую и узнать о долге уже после входа. Это основной пробел разбора.";
    } else if (fund.status === "Fail") {
      base =
        "База. " +
        name +
        " по отчётности выглядит напряжённо. Рабочий ход — не наращивать позицию, ждать более спокойной цены или лучших цифр.";
      opt =
        "Оптимистичный сценарий — только если операционные показатели развернутся. Пока это надежда, не основание.";
      risk =
        "Риск — долговая нагрузка не удержится. Тогда просадка будет не обычным колебанием рынка, а переоценкой самого бизнеса.";
    } else {
      const rel = (p.fund && p.fund.reliabilityLabel) || "без ярлыка";
      base =
        "База. " +
        name +
        " оценивается как «" +
        rel +
        "». Компания может работать дальше примерно в том же режиме — без обещания роста котировки.";
      if (m.revenueDelta > 0 || m.fcfDelta > 0 || m.noiDelta > 0) {
        opt =
          "Оптимистичный сценарий: нынешний темп — выручка, денежный поток или банковский доход — удержится, долг не размоет историю.";
      } else {
        opt = "Оптимистичный сценарий ограничен: по годовым темпам почти не на что опереться.";
      }
      risk =
        "Риск: темпы замедлятся, долг вырастет, или колебания бумаги выйдут за рамку анкеты. Тогда тезис закрывают — а не усредняют убыток назло рынку.";
    }
    return sec(
      "scenarios",
      "Три сценария",
      status,
      para("Это не прогноз цены и не три цели. Три способа думать о бумаге на ближайшие кварталы.", base, opt, risk)
    );
  }

  function sectionRisks(p) {
    const items = [];
    const fund = g(p, "fund");
    const mkt = g(p, "market");
    const ind = p.indicators || {};
    const cl = p.cluster || {};
    if (mkt.status === "Fail")
      items.push("Бумагу не подтвердили на Мосбирже — любой вывод о цене сейчас ненадёжен.");
    if (fund.status === "NoData")
      items.push("Нет отчётности: неизвестны долг, прибыль и запас прочности. Главный пробел.");
    if (fund.status === "Fail")
      items.push("По цифрам бизнес выглядит ненадёжно. График этого не исправляет.");
    if (ind.rsi != null && ind.rsi > 70)
      items.push("Бумага растянута вверх: вход в разогнанное движение легко приводит к просадке.");
    if (ind.rsi != null && ind.rsi < 30)
      items.push("Продажи сильны. Сильное давление — не признак, что дно уже близко.");
    if (ind.volRatio != null && ind.volRatio > 3)
      items.push("Всплеск оборота часто связан с новостями. Сверьте календарь событий.");
    if (ind.volRatio != null && ind.volRatio < 0.5)
      items.push("Низкий оборот: сложнее войти и выйти по спокойной цене.");
    if (cl.location === "above")
      items.push("Цена выше зоны стоимости. Покупка здесь — с премией к зоне.");
    if (cl.location === "below" && fund.status !== "Pass") {
      items.push(
        "Цена ниже зоны стоимости, а бизнес не выглядит устойчивым. Риск купить на продолжении снижения."
      );
    }
    if (!p.riskProfile || !p.riskProfile.risk_level) {
      items.push("Нет анкеты — нет вашей личной границы, какая просадка уже слишком велика.");
    }
    const ext = stretchPct(ind);
    if (ext != null && ext > 0.08)
      items.push("Цена далеко от короткой средней. Догонять её обычно плохая сделка.");
    if (!items.length)
      items.push(
        "Явных красных флагов в этом разборе нет. Это не гарантия безопасности, а отсутствие явных противоречий."
      );
    items.push(
      "Тезис стоит пересматривать, когда выйдет новая отчётность, резко сменится оборот или вы измените горизонт."
    );
    const status = fund.status === "Fail" || mkt.status === "Fail" ? "Fail" : items.length >= 4 ? "Weak" : "Pass";
    return sec("risks", "Основные риски", status, items.join("\n\n"));
  }

  function sectionNext(p) {
    const v = p.verdict;
    const entry = p._entry || buildEntry(p);
    const status = v === "invest" ? "Pass" : v === "skip" ? "Fail" : "Weak";
    return sec("next", "Что делать", status, entry.lines.join("\n\n"));
  }

  function buildExplanation(payload) {
    const p = payload || {};
    p._entry = buildEntry(p);
    const sections = [
      sectionSummary(p),
      sectionFund(p),
      sectionStrategy(p),
      sectionIndicators(p),
      sectionCluster(p),
      sectionRisk(p),
      sectionScenarios(p),
      sectionRisks(p),
      sectionNext(p),
    ];
    const entry = p._entry;
    return {
      ticker: p.ticker,
      verdict: p.verdict,
      verdictLabel: VERDICT_RU[p.verdict] || p.verdict,
      lead: whyLine(p),
      entry: entry,
      generatedAt: new Date().toISOString(),
      disclaimer: "Исследование для решения. Не индивидуальная рекомендация, не оферта и не обещание прибыли.",
      sections: sections,
    };
  }

  return {
    VERDICT_RU: VERDICT_RU,
    STATUS_RU: STATUS_RU,
    buildExplanation: buildExplanation,
    buildEntry: buildEntry,
  };
});
