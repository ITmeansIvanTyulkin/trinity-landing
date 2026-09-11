/**
 * Cabinet self-help tree (pure): match a chat line to topics, then steps or next options.
 * No live first-line chat — escalate by email.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TrinityCabinetHelp = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_SUPPORT_EMAIL = "info@trinity.trading";

  const TOPICS = [
    {
      id: "login",
      title: "Вход и регистрация",
      keywords: [
        "войти",
        "вход",
        "логин",
        "пароль",
        "регистрац",
        "аккаунт",
        "почта",
        "email",
        "емейл",
        "письмо",
        "подтвержд",
        "создать аккаунт",
        "не пускает",
      ],
      prompt: "Что именно со входом?",
      children: [
        {
          id: "login-mail",
          title: "Письмо подтверждения не пришло",
          keywords: ["не пришло", "нет письма", "спам", "не приходит письмо", "подтвержден"],
          steps: [
            "Проверьте папку «Спам» и промо — письмо идёт от Supabase / TRINITY.",
            "На экране входа нажмите «Отправить письмо ещё раз» (нужен тот же email).",
            "Подождите 2–3 минуты: у бесплатного SMTP бывают задержки.",
            "Если письма нет — напишите человеку: укажите email, с которого регистрировались.",
          ],
        },
        {
          id: "login-link",
          title: "Ссылка из письма не открывает кабинет",
          keywords: ["ссылка", "confirm", "редирект", "битая ссылка"],
          steps: [
            "Откройте ссылку в том же браузере, где регистрировались (не в приложении почты, если оно режет редирект).",
            "Скопируйте ссылку в адресную строку Chrome / Safari.",
            "После перехода вернитесь на страницу кабинета и нажмите «Войти» с паролем.",
          ],
        },
        {
          id: "login-pass",
          title: "Неверный пароль или не помню пароль",
          keywords: ["неверный пароль", "забыл пароль", "сброс", "не подходит пароль"],
          steps: [
            "Пароль при регистрации — не короче 6 символов, раскладка EN/RU часто путается.",
            "Сброса пароля в кабинете пока нет: напишите человеку с email аккаунта — ответ придёт письмом, не в этот чат.",
          ],
        },
      ],
    },
    {
      id: "instance",
      title: "Не открывается приложение /view",
      keywords: [
        "view",
        "инстанс",
        "instance",
        "оператор",
        "приложение",
        "скачать",
        "8080",
        "localhost",
        "imoex",
        "дашборд",
        "не открывается",
        "не грузится",
      ],
      prompt: "Как вы заходите в операторку?",
      children: [
        {
          id: "instance-where",
          title: "Не понятно, где само приложение",
          keywords: ["где скачать", "где приложение", "нет кнопки скачать"],
          steps: [
            "Кабинет на сайте — аккаунт, триал, лаборатория. Рынок смотрят в операторском приложении IMOEX.",
            "Установщика «как у брокера» нет: вам выдают URL облачного инстанса или вы поднимаете свой и открываете /view.",
            "Пока URL не выдан — /view на localhost:8080 откроется только если IMOEX запущен у вас локально.",
            "Полный маршрут — статья «Как пользоваться TRINITY» в Wiki.",
          ],
          href: "wiki/how-trinity.html",
          hrefLabel: "Открыть инструкцию",
        },
        {
          id: "instance-local",
          title: "localhost:8080 не отвечает",
          keywords: ["localhost", "8080", "connection refused", "не отвечает"],
          steps: [
            "Это адрес локального инстанса. Если IMOEX не запущен, браузер покажет «отказано в соединении» — кабинет при этом может работать.",
            "Запустите операторское приложение и снова откройте http://localhost:8080/view",
            "Если у вас облачный инстанс — используйте выданный HTTPS-адрес, не localhost.",
          ],
        },
        {
          id: "instance-key",
          title: "Инстанс просит ключ активации",
          keywords: ["ключ", "unlock", "активац", "trinity-"],
          steps: [
            "Ключ лежит в кабинете → Аккаунт → Unlock-ключ. «Показать», скопируйте, вставьте в операторку.",
            "«Перевыпустить» сбрасывает старый ключ — после этого в инстансе нужен новый.",
          ],
        },
      ],
    },
    {
      id: "broker",
      title: "Брокер, токен, ордера",
      keywords: [
        "брокер",
        "токен",
        "тинькофф",
        "tinkoff",
        "t-invest",
        "ордер",
        "заявк",
        "песочниц",
        "sandbox",
        "api",
      ],
      steps: [
        "В кабинете на сайте нет поля токена и нет кнопки «купить на бирже». Так и задумано.",
        "Токен T-Invest и песочница — только в операторке: /view → настройки брокера.",
        "Если поля нет и в /view — инстанс ещё не открыт или открыт не тот URL.",
      ],
    },
    {
      id: "lab",
      title: "Лаборатория: ENTER / WATCH / BLOCK",
      keywords: [
        "лаборатор",
        "пайплайн",
        "enter",
        "watch",
        "block",
        "вердикт",
        "z-score",
        "z score",
        "режим",
        "trend",
        "sideways",
      ],
      steps: [
        "Лаборатория в кабинете — песочница гейтов, не живой ордер.",
        "Потяните Z, смените режим на TREND — новые pairs-входы обычно BLOCK. SIDEWAYS + высокий Z + cluster + FA pass → PAPER OPEN.",
        "Живой разбор пары: в инстансе «Анализ + paper», итог — в журнале Paper.",
      ],
    },
    {
      id: "trial",
      title: "Триал, тариф, оплата",
      keywords: [
        "триал",
        "trial",
        "тариф",
        "оплат",
        "карта",
        "списан",
        "биллинг",
        "платеж",
        "чек",
        "подписк",
      ],
      prompt: "Про что вопрос?",
      children: [
        {
          id: "trial-days",
          title: "Сколько длится триал и нужна ли карта",
          keywords: ["14", "карта", "бесплатн", "дней"],
          steps: [
            "Триал — 14 дней, карту привязывать не нужно.",
            "Счётчик дней виден в блоке «Обзор» кабинета.",
          ],
        },
        {
          id: "trial-pay",
          title: "Оплата и чеки",
          keywords: ["оплат", "чек", "счёт", "карта не проходит"],
          steps: [
            "Таблица платежей в кабинете сейчас демонстрационная, пока биллинг не подключён.",
            "Если списали деньги или чек не пришёл — это как раз случай для письма человеку. Опишите дату и сумму.",
          ],
        },
      ],
    },
    {
      id: "metrics",
      title: "Графики и слоты в кабинете",
      keywords: ["график", "equity", "pnl", "слот", "метрики", "кривая", "капитал", "аллокац"],
      steps: [
        "Equity, аллокация и таблица слотов в кабинете — демо-картинка логики продукта.",
        "Живой журнал paper — в операторском /view, когда инстанс запущен.",
        "Калькулятор капитала — на главной лендинга, раздел «Калькулятор».",
      ],
      href: "index.html#calculator",
      hrefLabel: "Калькулятор на главной",
    },
    {
      id: "how",
      title: "Как пользоваться TRINITY с нуля",
      keywords: ["как пользоваться", "с чего начать", "инструкция", "wiki", "шаги", "онбординг"],
      steps: [
        "1) Кабинет: регистрация → письмо → вход.",
        "2) Получить URL инстанса или поднять IMOEX.",
        "3) /view: режим рынка → вселенная пар → спред → Анализ + paper.",
        "Подробно — публикация в Wiki.",
      ],
      href: "wiki/how-trinity.html",
      hrefLabel: "Как пользоваться TRINITY",
    },
  ];

  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^a-zа-я0-9/.-]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function walk(nodes, fn, parent) {
    (nodes || []).forEach(function (node) {
      fn(node, parent);
      if (node.children) walk(node.children, fn, node);
    });
  }

  function findById(id, nodes) {
    const list = nodes || TOPICS;
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
      const hit = findById(id, list[i].children || []);
      if (hit) return hit;
    }
    return null;
  }

  function card(node) {
    return {
      id: node.id,
      title: node.title,
      hasChildren: Boolean(node.children && node.children.length),
    };
  }

  function scoreNode(node, query) {
    const q = normalize(query);
    if (!q) return 0;
    const tokens = q.split(" ").filter(function (t) {
      return t.length >= 2;
    });
    let score = 0;
    const hayTitle = normalize(node.title);
    if (hayTitle && q.indexOf(hayTitle) !== -1) score += 8;
    (node.keywords || []).forEach(function (kw) {
      const k = normalize(kw);
      if (!k) return;
      if (q.indexOf(k) !== -1) score += 4;
      else if (k.indexOf(q) !== -1 && q.length >= 4) score += 3;
      tokens.forEach(function (t) {
        if (k.indexOf(t) !== -1) score += 1;
      });
    });
    tokens.forEach(function (t) {
      if (hayTitle.indexOf(t) !== -1) score += 2;
    });
    return score;
  }

  function matchQuery(query, limit) {
    const cap = typeof limit === "number" ? limit : 5;
    const q = normalize(query);
    if (!q) {
      return TOPICS.map(card);
    }
    const ranked = [];
    walk(TOPICS, function (node) {
      const s = scoreNode(node, query);
      if (s > 0) ranked.push({ node: node, score: s });
    });
    ranked.sort(function (a, b) {
      return b.score - a.score;
    });
    const seen = {};
    const out = [];
    ranked.forEach(function (row) {
      if (seen[row.node.id] || out.length >= cap) return;
      seen[row.node.id] = true;
      const c = card(row.node);
      c.score = row.score;
      out.push(c);
    });
    return out;
  }

  function childrenOf(id) {
    const node = findById(id);
    if (!node || !node.children) return [];
    return node.children.map(card);
  }

  function composeMailto(opts) {
    const o = opts || {};
    const to = o.to || DEFAULT_SUPPORT_EMAIL;
    const subject = o.subject || "TRINITY: помощь из кабинета";
    const lines = [
      "Email: " + (o.email || "—"),
      "Тема из помощника: " + (o.topicTitle || "—"),
      "Запрос: " + (o.query || "—"),
      "Путь: " + (o.path || "—"),
      "",
      o.body || "",
    ];
    return (
      "mailto:" +
      to +
      "?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(lines.join("\n"))
    );
  }

  return {
    TOPICS: TOPICS,
    DEFAULT_SUPPORT_EMAIL: DEFAULT_SUPPORT_EMAIL,
    normalize: normalize,
    findById: findById,
    matchQuery: matchQuery,
    childrenOf: childrenOf,
    card: card,
    composeMailto: composeMailto,
  };
});
