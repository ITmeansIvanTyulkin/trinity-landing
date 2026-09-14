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
            "Проверьте папку «Спам» и промо — письмо приходит от TRINITY.",
            "На экране входа нажмите «Отправить письмо ещё раз» (нужен тот же email).",
            "Подождите 2–3 минуты: иногда письмо задерживается.",
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
      title: "Не открывается приложение",
      keywords: [
        "view",
        "инстанс",
        "instance",
        "оператор",
        "приложение",
        "скачать",
        "установ",
        "8080",
        "localhost",
        "imoex",
        "дашборд",
        "не открывается",
        "не грузится",
      ],
      prompt: "Что именно с приложением?",
      children: [
        {
          id: "instance-where",
          title: "Где скачать приложение",
          keywords: ["где скачать", "где приложение", "нет кнопки скачать", "установ"],
          steps: [
            "Кабинет на сайте — аккаунт, обзор и лаборатория. Стол ставится на ваш компьютер.",
            "Кнопка «Скачать приложение» в кабинете. Пока установщик собираем — кнопка неактивна.",
            "Когда пакет появится: скачали, запустили — с этого момента идут 7 дней триала.",
            "В триале нет живых заявок у брокера. Автоторги робота включаются после оплаты.",
          ],
        },
        {
          id: "instance-local",
          title: "Приложение на компьютере не отвечает",
          keywords: ["localhost", "8080", "connection refused", "не отвечает"],
          steps: [
            "Кабинет на сайте не открывает стол сам. Запустите скачанное приложение на этом компьютере.",
            "Если вы разработчик и поднимаете стол вручную, в браузере на той же машине иногда открывают локальный адрес — это не продукт для клиента.",
            "Цифры в кабинете появятся, когда приложение пришлёт снимок. Облачного стола нет.",
          ],
        },
        {
          id: "instance-key",
          title: "Приложение просит ключ активации",
          keywords: ["ключ", "unlock", "активац", "trinity-"],
          steps: [
            "Ключ будет в кабинете → Аккаунт, когда приложение начнёт писать снимок.",
            "Протухает ключ TRINITY (триал 7 дней), не ключ брокера.",
          ],
        },
      ],
    },
    {
      id: "broker",
      title: "Брокер и заявки",
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
        "В кабинете на сайте нет поля ключа брокера и нет кнопки «купить на бирже». Так и задумано.",
        "Ключ брокера — только в приложении на компьютере, в его настройках.",
        "В триале живых заявок нет. Автоторги робота у брокера — после оплаты.",
      ],
    },
    {
      id: "lab",
      title: "Лаборатория: вход, наблюдение, блок",
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
        "Лаборатория берёт пары, режим и сектор со стола. Щелчки — сценарий «а что, если», не заявка.",
        "Потяните расхождение или смените режим на тренд — новые входы в пары обычно нельзя. Кнопка «Как на столе» возвращает живые гейты.",
        "Живой разбор пары — в торговом приложении; итог смотрите в списке сделок.",
      ],
    },
    {
      id: "trial",
      title: "Пробный период, тариф, оплата",
      keywords: [
        "триал",
        "trial",
        "пробн",
        "7",
        "семь",
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
          title: "Сколько длится пробный период и нужна ли карта",
          keywords: ["7", "14", "карта", "бесплатн", "дней"],
          steps: [
            "Пробный период — 7 дней с первого запуска приложения. Карту привязывать не нужно.",
            "В триале нет живых заявок и автоторгов. На 8-й день приложение открывается, но не работает, пока не оплатите.",
            "Счётчик дней виден в блоке «Обзор», когда приложение прислало снимок.",
          ],
        },
        {
          id: "trial-pay",
          title: "Оплата и чеки",
          keywords: ["оплат", "чек", "счёт", "карта не проходит"],
          steps: [
            "Таблица платежей пустая: оплата ещё не подключена.",
            "Если списали деньги или чек не пришёл — это как раз случай для письма человеку. Опишите дату и сумму.",
          ],
        },
      ],
    },
    {
      id: "metrics",
      title: "Графики и позиции в кабинете",
      keywords: ["график", "equity", "pnl", "слот", "метрики", "кривая", "капитал", "аллокац", "живые", "снимок", "из приложения"],
      steps: [
        "Над обзором и на карточке пар видно, живые ли цифры. Статусы под обзором — с роботов стола: ресёрч, сканирует, сессия закрыта, в сделке. «На столе» больше не пишем: это не статус.",
        "Кривая и таблица собирают пары, тренд по нефти и календарный арбитраж. Рядом — разрез закрытых сделок по стратегиям, не доли тарифа.",
        "Запустите стол на компьютере: кабинет сам подтянет цифры. Облачного стола нет.",
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
        "2) Скачать приложение на компьютер (кнопка в кабинете; пакет ещё собираем).",
        "3) Первый запуск включает 7 дней триала без живых заявок.",
        "4) После оплаты в приложении включаются автоторги роботом у брокера.",
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
