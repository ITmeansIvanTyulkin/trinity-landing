/**
 * Investor-facing research report from pipeline gates.
 * Literary Russian, no internal jargon in the body.
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
    invest: "Можно рассматривать",
    watch: "Пока — наблюдение",
    skip: "Пока лучше отойти",
  };

  const STATUS_RU = {
    Pass: "спокойно",
    Weak: "с оговоркой",
    Fail: "настораживает",
    NoData: "мало данных",
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
    return num(n, d) + " ₽";
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
      statusLabel: STATUS_RU[status] || "мало данных",
      body: body,
    };
  }

  function whyLine(p) {
    const v = p.verdict;
    const fund = g(p, "fund");
    const mkt = g(p, "market");
    const strat = g(p, "strategy");
    const ind = p.indicators || {};
    if (mkt.status === "Fail") {
      return "Бумагу не удалось подтвердить на Мосбирже. Дальше — лишь справка, не рабочая идея.";
    }
    if (v === "invest") {
      return "Цена, отчётность и движение на графике не спорят друг с другом. Это ещё не приглашение покупать — лишь право идеи лечь на стол.";
    }
    if (v === "skip") {
      if (strat.status === "Fail" || (ind.rsi != null && ind.rsi > 70)) {
        return "Сейчас легко войти в уже разогнанное движение. Спокойнее дождаться более тихой цены.";
      }
      return "Слабых мест слишком много, чтобы держать тикер в фокусе как готовую мысль.";
    }
    if (fund.status === "NoData") {
      return "Котировку видно; чем живёт компания — нет. Пока неизвестны долг и прибыль, слово «можно рассматривать» было бы нечестным.";
    }
    if (fund.status === "Fail") {
      return "По отчётности дело выглядит напряжённо: долг или устойчивость. Смотреть можно, наращивать — рано.";
    }
    return "Мысль не закрыта, но ей чего-то недостаёт: либо вход неспокоен, либо отчётность не даёт согласия.";
  }

  function sectionSummary(p) {
    const name = p.name || p.ticker || "Бумага";
    const ticker = p.ticker || "";
    const v = p.verdict;
    const price = p.quote && p.quote.last;
    const body = para(
      name + (ticker ? " (" + ticker + ")" : "") + ". Вердикт: «" + (VERDICT_RU[v] || v) + "».",
      whyLine(p),
      price != null
        ? "Последняя цена на Мосбирже — " + rub(price) + "."
        : "Последней цены в разборе нет: рынок не ответил.",
      "Ниже — зачем так решили, где можно ошибиться и что сделать руками. Заявки отсюда не уходят, доходность не обещается."
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
        "Видна котировка — и не видно, как живёт сам бизнес: выручка, прибыль, долг, свободные деньги.",
        "Пока этих цифр нет, нельзя притвориться, что эмитент уже проверен. Поэтому вердикт не поднимается до «можно рассматривать»: только наблюдение.",
        "Цифры подтягиваются при автоанализе, если отчётность есть в открытом доступе. Их можно и вставить вручную на экране разбора."
      );
    } else {
      const m = fund.metrics || {};
      const lines = [];
      if (fund.sector === "fin") {
        lines.push(
          "Это банк. Оценка устойчивости — «" +
            (fund.reliabilityLabel || "нет ярлыка") +
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
          else carNote += " Обычно смотрят, чтобы он не опускался ниже восьми и не таял год от года.";
          lines.push(carNote);
        }
      } else {
        lines.push(
          "Компания не банк. Оценка устойчивости — «" +
            (fund.reliabilityLabel || "нет ярлыка") +
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
          else debtNote += " По долгу картина спокойная.";
          lines.push(debtNote);
        }
      }
      if (fund.ranges && fund.ranges.zone1) {
        const spot = fund.ranges.basis;
        lines.push(
          "Если отталкиваться от нынешних " +
            rub(spot) +
            ", более тихие зоны для входа лежат около " +
            num(fund.ranges.zone1.low) +
            "–" +
            num(fund.ranges.zone1.high) +
            " ₽ и глубже — " +
            num(fund.ranges.zone2.low) +
            "–" +
            num(fund.ranges.zone2.high) +
            " ₽. Цена не обязана туда сходить: это лишь где бумага была бы дешевле сегодняшнего спота."
        );
      }
      if (gate.status === "Fail") {
        lines.push("Итог по бизнесу настораживает. Красивый график этого не отменяет.");
      } else if (gate.status === "Weak") {
        lines.push("Итог по бизнесу — не провал и не согласие. Если заводить, то скромно.");
      } else {
        lines.push("Итог по бизнесу: по доступным цифрам устойчивость не выглядит сломанной.");
      }
      body = lines.join("\n\n");
    }
    return sec("fundamentals", "Бизнес и долг", gate.status, body);
  }

  function stretchPct(ind) {
    if (!ind || ind.last == null || ind.smaFast == null || ind.smaFast === 0) return null;
    return (ind.last - ind.smaFast) / ind.smaFast;
  }

  function sectionStrategy(p) {
    const gate = g(p, "strategy");
    const ind = p.indicators || {};
    const quote = p.quote || {};
    const lines = [
      "Здесь нет приказа купить или продать — только рамка: куда смотрит фон, не разогрета ли бумага, не придётся ли догонять цену.",
    ];
    if (ind.last != null && ind.smaSlow != null) {
      if (ind.last >= ind.smaSlow) {
        lines.push(
          "Цена " +
            rub(ind.last) +
            " держится не ниже средней за пару месяцев (" +
            rub(ind.smaSlow) +
            "). Фон скорее рабочий, чем обвальный."
        );
      } else {
        lines.push(
          "Цена " +
            rub(ind.last) +
            " ниже средней за пару месяцев (" +
            rub(ind.smaSlow) +
            "). Краткосрочно бумага слабее своего фона."
        );
      }
    }
    if (ind.rsi != null) {
      const rsi = Number(ind.rsi);
      if (rsi > 70) {
        lines.push(
          "Перекупленность высока (" +
            num(rsi, 0) +
            " по шкале 0–100). Новый набор здесь легко становится входом в уже разогнанное движение."
        );
      } else if (rsi >= 65) {
        lines.push("Бумага уже разогрета (" + num(rsi, 0) + " по той же шкале). Смотреть можно — догонять каждую свечу незачем.");
      } else if (rsi < 30) {
        lines.push(
          "Давление продаж сильное (" +
            num(rsi, 0) +
            "). Это ещё не дно и не повод торопиться: лишь знак, что рынок неспокоен."
        );
      } else {
        lines.push("Перекупленность обычная (" + num(rsi, 0) + "). По этому признаку бумага не зовёт и не гонит.");
      }
    }
    const ext = stretchPct(ind);
    if (ext != null) {
      if (ext > 0.08) {
        lines.push("Цена ушла вверх от короткой средней больше чем на восемь процентов. Догонять такое обычно дорого.");
      } else if (ext > 0.03) {
        lines.push("Небольшой отрыв от короткой средней. Вход уже не самый тихий.");
      } else if (ext < -0.05) {
        lines.push("Цена заметно ниже короткой средней — либо уступка, либо продолжение слабости. Без отчётности не различить.");
      } else {
        lines.push("Цена живёт рядом с короткой средней: догонять растяжку сейчас не нужно.");
      }
    }
    if (quote.listLevel === 1) {
      lines.push("Первый котировальный список Мосбиржи: ликвидность и раскрытие обычно лучше, чем у дальнего эшелона.");
    } else if (quote.listLevel === 2) {
      lines.push("Второй список Мосбиржи: торговать можно, но это уже не голубая фишка по ликвидности и раскрытию.");
    } else if (quote.listLevel != null) {
      lines.push("Уровень листинга " + quote.listLevel + " — не самый ликвидный эшелон; вход и выход могут быть рваными.");
    }
    const fund = g(p, "fund");
    if (fund.status === "NoData") {
      lines.push("Отчётности нет, и даже удачный график не делает идею готовой к деньгам.");
    } else if (fund.status === "Fail") {
      lines.push("График не отменяет слабую отчётность: сначала дело компании, потом вход.");
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
          "Дневной фон направлен вверх: цена " +
            rub(ind.last) +
            " выше средней за двадцать дней (" +
            rub(ind.smaFast) +
            "), а та — выше средней за пятьдесят (" +
            rub(ind.smaSlow) +
            ")."
        );
      } else if (down) {
        lines.push(
          "Дневной фон направлен вниз: цена " +
            rub(ind.last) +
            " ниже обеих средних (двадцать дней — " +
            rub(ind.smaFast) +
            ", пятьдесят — " +
            rub(ind.smaSlow) +
            ")."
        );
      } else {
        lines.push(
          "Наклон смешанный: цена " +
            rub(ind.last) +
            ", средняя за двадцать дней — " +
            rub(ind.smaFast) +
            ", за пятьдесят — " +
            rub(ind.smaSlow) +
            ". Чистой линии нет."
        );
      }
    } else {
      lines.push("Дневных свечей не хватило, чтобы собрать средние. Картина тренда обрывается.");
    }
    if (ind.rsi != null) {
      const rsi = Number(ind.rsi);
      if (rsi > 70) {
        lines.push("Индикатор перекупленности — " + num(rsi, 0) + ": зона, где новые покупки часто опаздывают.");
      } else if (rsi < 30) {
        lines.push("Индикатор перекупленности — " + num(rsi, 0) + ": зона тревоги, а не знак, что дно уже здесь.");
      } else {
        lines.push("Индикатор перекупленности — " + num(rsi, 0) + ": середина диапазона, без крайности.");
      }
    }
    if (ind.rangePct != null) {
      lines.push("За последние двадцать торговых дней бумага прошла примерно " + pct(ind.rangePct) + " от края до края.");
    }
    if (ind.bars != null && ind.bars < 60) {
      lines.push("Истории мало (" + ind.bars + " дней) — средние ещё не устоялись.");
    }
    if (!lines.length) {
      lines.push("По графику сказать почти нечего: свечей недостаточно.");
    }
    return sec("indicators", "Картина на графике", gate.status, lines.join("\n\n"));
  }

  function sectionCluster(p) {
    const gate = g(p, "cluster");
    const ratio = gate.metrics && gate.metrics.volRatio;
    const v = ratio != null ? Number(ratio) : null;
    let body;
    if (v == null) {
      body = para(
        "Оборота по дневным свечам нет — не видно, жив ли сейчас рынок по бумаге или пуст.",
        "Без оборота движение цены легко оказывается тонким: красиво на графике и плохо при исполнении."
      );
    } else if (v < 0.5) {
      body = para(
        "Оборот очень тих: примерно " + num(v, 2) + " от обычного за последние недели.",
        "В такой тишине и вход, и выход могут быть рваными. Это не набор крупного игрока — просто мало сделок."
      );
    } else if (v > 2.5) {
      body = para(
        "Оборот вспыхнул: примерно в " + num(v, 1) + " раза выше обычного.",
        "Так бывает на новостях, отсечках и перекладках. Имеет смысл сверить календарь, а не принимать вспышку за начало пути."
      );
    } else if (v >= 0.85 && v <= 1.2) {
      body = para(
        "Оборот сейчас почти как в последние недели.",
        "Рынок по бумаге живой: ни тишины, ни истерики. Это нейтрально — ни подтверждение мысли, ни её отмена."
      );
    } else {
      body = para(
        "Оборот около " + num(v, 1) + " от среднего за последние недели — в пределах нормы.",
        "Рынок по бумаге живой. Это нейтрально: ни подтверждение мысли, ни её отмена."
      );
    }
    return sec("cluster", "Оборот", gate.status, body);
  }

  function sectionRisk(p) {
    const profile = p.riskProfile;
    const ind = p.indicators || {};
    let status = "NoData";
    let body;
    if (!profile || !profile.risk_level) {
      body = para(
        "Анкета риска ещё не заполнена. Без неё нельзя сказать, не слишком ли эта бумага качается именно для вас.",
        "Имеет смысл пройти её до решения о размере: горизонт, подушка, как вы себя ведёте на просадке. Пять минут, не экзамен."
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
          "За месяц бумага уже ходила шире, чем вам спокойно. Даже если мысль нравится, размер должен быть мал — или нулевым.";
      } else if (status === "Weak") {
        fit = "Качка бумаги близка к вашей черте. Смотреть можно; закладывать «как всегда» — уже спорно.";
      } else {
        fit = "Недавняя качка не выходит за ту просадку, которую вы сами отметили как предупреждение.";
      }
      body = para(
        "Ваш профиль — " +
          (LEVEL_RU[profile.risk_level] || profile.risk_level) +
          ". Просадка около " +
          warn +
          "% для вас — уже повод перечитать тезис, а не биржевой стоп.",
        "За двадцать дней бумага прошла примерно " + swing + ". " + fit,
        p.verdict === "invest" && profile.risk_level === "conservative"
          ? "Для спокойного профиля «можно рассматривать» значит маленьким шагом, не всей кассой."
          : null
      );
    }
    return sec("risk_fit", "Подходит ли вам", status, body);
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
        " торгуется, а чем живёт дело — неизвестно. Честный основной ход — ничего не решать, пока не появятся цифры.";
      opt = "Оптимиста без отчётности рисовать незачем: нет опоры в прибыли и долге. Светлая картина здесь была бы выдумкой.";
      risk = "Риск — купить вслепую и узнать про долг или дыру в деньгах уже на своей позиции. Это главный пробел всего разбора.";
    } else if (fund.status === "Fail") {
      base =
        "База. " +
        name +
        " по отчётности выглядит напряжённо. Рабочий ход — не наращивать, ждать либо более тихой цены, либо лучших цифр.";
      opt =
        "Оптимист возможен, лишь если операционка развернётся: долг начнёт убывать, прибыль — расти. Пока это надежда, не основание.";
      risk = "Риск — рычаг или устойчивость не удержатся. Тогда просадка будет не качкой рынка, а переоценкой самого дела.";
    } else {
      const rel = (p.fund && p.fund.reliabilityLabel) || "без ярлыка";
      base =
        "База. " +
        name +
        " оценивается как «" +
        rel +
        "». Компания может жить дальше примерно как теперь — без обещания, что котировка вырастет.";
      if (m.revenueDelta > 0 || m.fcfDelta > 0 || m.noiDelta > 0) {
        opt = "Оптимист: нынешний темп — выручка, деньги или банковский доход — удержится, долг не разъест историю.";
      } else {
        opt = "Оптимист ограничен: по годовым темпам опереться почти не на что. Выше — только если развернётся само дело.";
      }
      risk =
        "Риск: темпы сдуются, долг вырастет, или бумага уйдёт в просадку шире вашей анкеты. Тогда тезис закрывают — а не усредняют назло рынку.";
    }
    const body = para(
      "Это не прогноз цены и не три цели. Три способа думать о бумаге на ближайшие кварталы.",
      base,
      opt,
      risk
    );
    return sec("scenarios", "Три сценария", status, body);
  }

  function sectionRisks(p) {
    const items = [];
    const fund = g(p, "fund");
    const mkt = g(p, "market");
    const ind = p.indicators || {};
    if (mkt.status === "Fail") items.push("Бумагу не подтвердили на Мосбирже — любой вывод о цене сейчас шаток.");
    if (fund.status === "NoData") items.push("Нет отчётности: неизвестны долг, прибыль и запас прочности. Это главный пробел.");
    if (fund.status === "Fail") items.push("По цифрам дело выглядит ненадёжно. График этого не лечит.");
    if (ind.rsi != null && ind.rsi > 70) {
      items.push("Бумага растянута вверх: вход в разогнанное движение легко сажает в просадку.");
    }
    if (ind.rsi != null && ind.rsi < 30) items.push("Продажи сильны. Тревога не равна дну.");
    if (ind.volRatio != null && ind.volRatio > 3) {
      items.push("Всплеск оборота часто значит новости. Сверьте календарь, прежде чем решать.");
    }
    if (ind.volRatio != null && ind.volRatio < 0.5) {
      items.push("Тихий оборот: сложнее войти и выйти по спокойной цене.");
    }
    if (!p.riskProfile || !p.riskProfile.risk_level) {
      items.push("Нет анкеты — нет вашей личной черты, какая просадка уже слишком велика.");
    }
    const ext = stretchPct(ind);
    if (ext != null && ext > 0.08) items.push("Цена далеко от короткой средней. Догонять её обычно плохая сделка.");
    if (!items.length) {
      items.push("Явных красных знаков в этом разборе нет. Это не безопасность, а отсутствие крика.");
    }
    items.push(
      "Тезис стоит перечитывать, когда выйдет новая отчётность, резко сменится оборот или вы сами измените горизонт и подушку."
    );
    const status = fund.status === "Fail" || mkt.status === "Fail" ? "Fail" : items.length >= 4 ? "Weak" : "Pass";
    return sec("risks", "Где можно обжечься", status, items.join("\n\n"));
  }

  function sectionNext(p) {
    const v = p.verdict;
    const fund = g(p, "fund");
    let status = v === "invest" ? "Pass" : v === "skip" ? "Fail" : "Weak";
    let body;
    if (v === "invest") {
      body = para(
        "Если мысль ваша — внесите размер в портфель вручную и поставьте дату пересмотра: отчётность или квартал.",
        "Не докупайте, если цена уйдёт ещё выше или выйдет слабый отчёт. Заявка на биржу отсюда не уходит — только учёт.",
        "Перед следующим шагом взгляните на график ниже: живая картина важнее любого абзаца."
      );
    } else if (v === "watch") {
      const wait = [];
      if (fund.status === "NoData") {
        wait.push("появится отчётность — долг, прибыль, деньги");
      }
      if (p.indicators && p.indicators.rsi != null && p.indicators.rsi > 65) {
        wait.push("перегрев спадёт, и цена перестанет быть входом в разогнанное движение");
      }
      if (!p.riskProfile || !p.riskProfile.risk_level) {
        wait.push("будет заполнена анкета, чтобы понять, ваш ли это размер качки");
      }
      if (!wait.length) {
        wait.push("либо более тихая цена, либо более сильные цифры по делу компании");
      }
      body = para(
        "Сейчас это не «почти можно рассматривать». Это пауза.",
        "Имеет смысл держать тикер в поле зрения, пока " + wait.join("; ") + ".",
        "Кнопка списка наблюдения запоминает интерес без суммы. Это не позиция и не обещание когда-нибудь купить. Список можно обновлять, пока не настанет более спокойный вход."
      );
    } else {
      body = para(
        "Сейчас мысль не рабочая: либо рынок не подтвердился, либо слабых мест слишком много.",
        "Возвращаться стоит лишь когда исчезнет конкретный пробел — отчётность, растяжка, тишина в обороте, — а не потому что «должно отскочить».",
        "Тикер можно оставить в списке наблюдения как напоминание. На вердикт это не влияет."
      );
    }
    return sec("next", "Что делать", status, body);
  }

  function buildExplanation(payload) {
    const p = payload || {};
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
    return {
      ticker: p.ticker,
      verdict: p.verdict,
      verdictLabel: VERDICT_RU[p.verdict] || p.verdict,
      lead: whyLine(p),
      generatedAt: new Date().toISOString(),
      disclaimer: "Исследование для решения. Не индивидуальная рекомендация, не оферта и не обещание прибыли.",
      sections: sections,
    };
  }

  return {
    VERDICT_RU: VERDICT_RU,
    STATUS_RU: STATUS_RU,
    buildExplanation: buildExplanation,
  };
});
