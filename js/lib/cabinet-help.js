/**
 * Cabinet self-help tree (pure): match a chat line to topics, then steps or next options.
 * Agent persona «Маша» — guided FAQ + wiki blurbs + email escalate (no live LLM).
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
  const AGENT_NAME = "Маша";
  const AGENT_ROLE = "помощник TRINITY";
  const AGENT_AVATAR = "assets/masha-avatar.png";
  /** Minimum score to treat a match as confident. */
  const SCORE_HIT = 3;

  /**
   * Local clock → Russian day greeting.
   * 05–11 Доброе утро · 12–17 Добрый день · 18–20 Добрый вечер · 21–04 Доброй ночи
   * @param {number} [hour] 0–23; defaults to local Date hour
   */
  function dayPartGreeting(hour) {
    const h =
      typeof hour === "number" && Number.isFinite(hour)
        ? ((Math.floor(hour) % 24) + 24) % 24
        : new Date().getHours();
    if (h >= 5 && h < 12) return "Доброе утро";
    if (h >= 12 && h < 18) return "Добрый день";
    if (h >= 18 && h < 21) return "Добрый вечер";
    return "Доброй ночи";
  }

  /** First token of a display name, or empty. */
  function firstNameFrom(displayName) {
    const raw = String(displayName || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) return "";
    const first = raw.split(" ")[0] || "";
    return first.length >= 2 ? first : raw;
  }

  /**
   * Prefer анкета / registration name; else local-part of email (not full address).
   * @param {{ displayName?: string, email?: string }} opts
   */
  function resolveDisplayName(opts) {
    const o = opts || {};
    const fromProfile = firstNameFrom(o.displayName);
    if (fromProfile) return fromProfile;
    const email = String(o.email || "").trim();
    const at = email.indexOf("@");
    if (at < 2) return "";
    const local = email.slice(0, at).replace(/[._+\-]+/g, " ").trim();
    const token = firstNameFrom(local);
    if (!token || /^[0-9]+$/.test(token)) return "";
    return token.charAt(0).toUpperCase() + token.slice(1);
  }

  /**
   * Opening line for Маша.
   * @param {{ hour?: number, name?: string, displayName?: string, email?: string }} opts
   */
  function buildGreeting(opts) {
    const o = opts || {};
    const hello = dayPartGreeting(o.hour);
    const name =
      o.name != null && String(o.name).trim()
        ? firstNameFrom(o.name)
        : resolveDisplayName(o);
    const hi = name ? hello + ", " + name + "." : hello + ".";
    return (
      hi +
      " Я " +
      AGENT_NAME +
      " — " +
      AGENT_ROLE +
      ". Напишите, что случилось или что видите на экране — подберу шаги или короткую выжимку из Wiki. Живого чата нет: если не помогло, человек ответит письмом."
    );
  }

  /* —— FAQ tree (cabinet + desk screens) —— */
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
        "кабинет заблокирован",
        "gate",
      ],
      prompt: "Что именно со входом?",
      children: [
        {
          id: "login-mail",
          title: "Письмо подтверждения не пришло",
          keywords: ["не пришло", "нет письма", "спам", "не приходит письмо", "подтвержден"],
          steps: [
            "Проверьте папку «Спам» и промо — письмо приходит от TRINITY / Supabase.",
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
        {
          id: "login-logout",
          title: "Как выйти и сменить аккаунт",
          keywords: ["выйти", "logout", "сменить аккаунт", "другой email"],
          steps: [
            "В шапке кабинета — кнопка «Выйти».",
            "После выхода снова увидите экран входа: войдите другим email или зарегистрируйте новый.",
          ],
        },
      ],
    },
    {
      id: "instance",
      title: "Не открывается приложение / стол",
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
        "стол",
        "desk",
      ],
      prompt: "Что именно с приложением?",
      children: [
        {
          id: "instance-where",
          title: "Где скачать приложение",
          keywords: ["где скачать", "где приложение", "нет кнопки скачать", "установ"],
          steps: [
            "Кабинет на сайте — аккаунт, обзор и лаборатория. Стол ставится на ваш компьютер (или выдаётся как URL инстанса).",
            "Кнопка «Скачать приложение» в кабинете. Пока установщик собираем — кнопка неактивна.",
            "Когда пакет появится: скачали, запустили — с этого момента идут 5 календарных дней триала.",
            "В триале нет живых заявок у брокера. Автоторги робота включаются после оплаты.",
          ],
        },
        {
          id: "instance-local",
          title: "Приложение на компьютере не отвечает",
          keywords: ["localhost", "8080", "connection refused", "не отвечает", "белый экран"],
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
            "Протухает ключ TRINITY (триал 5 дней), не ключ брокера.",
            "Показать / перевыпустить — в том же блоке «Ключ активации».",
          ],
        },
        {
          id: "instance-view",
          title: "Что такое /view и чем отличается от кабинета",
          keywords: ["/view", "view", "операторка", "дашборд стола", "два экрана"],
          steps: [
            "Кабинет (сайт) — аккаунт, триал, метрики-снимок, лаборатория, ключ.",
            "Оператор /view — рабочий стол: режим, вселенная, спред/Z, paper, брокерская песочница.",
            "Токен брокера и заявки живут только в приложении, не в кабинете.",
          ],
          href: "wiki/how-trinity.html",
          hrefLabel: "Как пользоваться TRINITY",
        },
      ],
    },
    {
      id: "desk",
      title: "Что вижу на столе (/view)",
      keywords: [
        "на столе",
        "на экране",
        "что означает",
        "что значит",
        "дашборд",
        "режим рынка",
        "sideways",
        "trend",
        "arbitrage",
        "вселенная",
        "universe",
        "paper",
        "журнал",
        "слот",
        "plaque",
        "табличка",
        "открыть пару",
        "блок вход",
      ],
      prompt: "Какой блок на столе смотрите?",
      children: [
        {
          id: "desk-regime",
          title: "Режим рынка: SIDEWAYS / TREND / ARBITRAGE",
          keywords: ["режим", "sideways", "trend", "arbitrage", "боковик", "тренд"],
          steps: [
            "Сначала читают режим, потом пары. В TREND новые входы pairs обычно не открывают.",
            "SIDEWAYS — типичная среда для mean reversion по спреду.",
            "ARBITRAGE / календарь — другая книга: фьючерсные сроки, не две акции.",
            "В кабинете режим появляется, когда стол прислал снимок.",
          ],
          href: "wiki/how-trinity.html",
          hrefLabel: "Как пользоваться TRINITY",
        },
        {
          id: "desk-z",
          title: "Спред, Z-score, пороги на графике",
          keywords: ["z-score", "z score", "спред", "порог", "kama", "±2", "график пары"],
          steps: [
            "Спред — разница двух ног (часто A − β·B). Z — на сколько сигм он ушёл от своего среднего.",
            "Малый |Z| — «дома». Около 1.4 — наблюдение. Около 1.8–2+ — зона входа при остальных гейтах.",
            "Возврат Z к нулю — типичный выход, а не «ещё чуть дожмём».",
            "График на столе — техника, не кнопка «купить».",
          ],
          href: "wiki/pairs-moex.html",
          hrefLabel: "Парный трейдинг на MOEX",
        },
        {
          id: "desk-paper",
          title: "Paper-журнал и слоты",
          keywords: ["paper", "журнал", "слот", "открыт", "закрыт", "демо сделка"],
          steps: [
            "Paper — учебный журнал: слот, причина входа/выхода, без обязательной живой заявки.",
            "Сначала научитесь закрывать журнал без стыда, потом увеличивайте размер.",
            "Живые заявки у брокера — только после оплаты и только из приложения.",
          ],
          href: "wiki/how-trinity.html",
          hrefLabel: "Как пользоваться TRINITY",
        },
        {
          id: "desk-volume",
          title: "Стакан, футпринт, объём на экране",
          keywords: ["стакан", "dom", "футпринт", "кластер", "лента", "order flow", "poc", "профиль"],
          steps: [
            "Стакан — очередь намерений, лента — уже совершённые удары, футпринт — объём внутри свечи.",
            "Для пары объём — второй голос: подтверждает ли поток вход по Z или против стоит стена.",
            "POC / value area — где сессия «согласилась» с ценой; не торгуйте «в воздухе».",
          ],
          href: "wiki/volume-dom.html",
          hrefLabel: "Стакан и футпринт",
        },
        {
          id: "desk-calendar",
          title: "Календарный спред на столе",
          keywords: ["календар", "near next", "контанго", "бэквордац", "го", "ролл", "фьючерс"],
          steps: [
            "Календарь — два срока одного актива (near–next), не две разные акции.",
            "Смотрят зазор относительно нормы, ролл/DTE, ГО обеих ног и глубину дальнего контракта.",
            "В кабинете ту же логику гейтов можно крутить руками в лаборатории.",
          ],
          href: "wiki/calendar-spread.html",
          hrefLabel: "Календарный спред",
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
        "автоторг",
      ],
      prompt: "Про брокера — что именно?",
      children: [
        {
          id: "broker-where",
          title: "Куда вводить токен брокера",
          keywords: ["куда ввести", "токен", "api ключ", "настройки брокера"],
          steps: [
            "В кабинете на сайте нет поля ключа брокера и нет кнопки «купить на бирже». Так и задумано.",
            "Ключ брокера — только в приложении на компьютере, в его настройках.",
            "Sandbox T-Invest — тоже только в операторке.",
          ],
        },
        {
          id: "broker-live",
          title: "Когда появятся живые заявки",
          keywords: ["живые заявки", "автоторг", "реальная сделка", "после оплаты"],
          steps: [
            "В триале живых заявок нет — только paper / песочница.",
            "Автоторги робота у брокера включаются после оплаты.",
            "Даже после оплаты ордера идут из приложения, не с сайта кабинета.",
          ],
        },
      ],
    },
    {
      id: "lab",
      title: "Лаборатория: календарный арбитраж",
      keywords: [
        "лаборатор",
        "арбитраж",
        "календар",
        "спред",
        "бабочк",
        "пайплайн",
        "enter",
        "watch",
        "block",
        "вердикт",
        "ролл",
        "eia",
        "го",
        "recede",
        "тумблер",
        "ползунок",
      ],
      prompt: "Что в лаборатории непонятно?",
      children: [
        {
          id: "lab-how",
          title: "Как крутить сценарий",
          keywords: ["как крутить", "тумблер", "ползунок", "сбросить", "сценарий"],
          steps: [
            "Выберите семью и конструкцию (near–next или бабочка), подвигайте |Z| и тумблеры гейтов.",
            "Справа — чеклист и вердикт: можно открыть / подождать / нельзя.",
            "«Сбросить сценарий» возвращает базовые гейты. Стол для этого блока не нужен.",
          ],
        },
        {
          id: "lab-verdict",
          title: "Почему BLOCK / WATCH, а не OPEN",
          keywords: ["block", "watch", "enter", "почему нельзя", "вердикт"],
          steps: [
            "Порядок как у desk-playbook: Z → сессия → ролл → события → кривая → издержки → ГО → разворот.",
            "Любой красный гейт даёт BLOCK; зона наблюдения по Z или ожидание recede — WATCH.",
            "Это учебный сценарий, не автоторговля и не совет открыть сделку сейчас.",
          ],
          href: "wiki/calendar-spread.html",
          hrefLabel: "Календарный спред",
        },
      ],
    },
    {
      id: "invest",
      title: "Инвестиции и защищённый портфель",
      keywords: [
        "инвестиц",
        "портфель",
        "анкет",
        "риск",
        "анализ акций",
        "invest",
        "moex анализ",
        "тикер",
        "отчёт",
      ],
      prompt: "Про защищённый контур — что нужно?",
      children: [
        {
          id: "invest-where",
          title: "Где открыть инвестиции",
          keywords: ["где инвестиции", "защищённый", "портфель кнопка"],
          steps: [
            "В кабинете блок «Инвестиции» → «Открыть защищённый портфель» (invest.html).",
            "Там анкета риска, портфель, автоанализ тикера MOEX и research-отчёт.",
            "Это не стол pairs и не заявки брокера — отдельный контур.",
          ],
          href: "invest.html",
          hrefLabel: "Защищённый портфель",
        },
        {
          id: "invest-vs-trade",
          title: "Инвестиции vs торговля на столе",
          keywords: ["чем отличается", "инвестиции или торговля", "иис", "долгосрок"],
          steps: [
            "Инвестиции — горизонт месяцы/годы, анкета, отчёт по бумаге.",
            "Стол — дни и часы, спреды, paper, режимы, стакан.",
            "Оба пути могут идти через одного брокера, но ожидания лучше не смешивать.",
          ],
          href: "wiki/start-moex.html",
          hrefLabel: "С чего начать на Мосбирже",
        },
      ],
    },
    {
      id: "trial",
      title: "Пробный период, тариф, оплата",
      keywords: [
        "триал",
        "trial",
        "пробн",
        "5",
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
        "7500",
      ],
      prompt: "Про что вопрос?",
      children: [
        {
          id: "trial-days",
          title: "Сколько длится пробный период и нужна ли карта",
          keywords: ["5", "7", "14", "карта", "бесплатн", "дней"],
          steps: [
            "Пробный период — 5 календарных дней с первого запуска (выходные считаются). Карту привязывать не нужно.",
            "В триале нет живых заявок и автоторгов. На 6-й день приложение открывается, но не работает, пока не оплатите.",
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
        {
          id: "trial-price",
          title: "Сколько стоит тариф",
          keywords: ["сколько стоит", "цена", "тариф оператор", "7500"],
          steps: [
            "В обзоре кабинета указан тариф «Оператор» и цена (сейчас ориентир 7 500 ₽/мес).",
            "Точные условия оплаты появятся, когда биллинг подключим. Пока — триал без карты.",
          ],
        },
      ],
    },
    {
      id: "metrics",
      title: "Графики и позиции в кабинете",
      keywords: [
        "график",
        "equity",
        "pnl",
        "слот",
        "метрики",
        "кривая",
        "капитал",
        "аллокац",
        "живые",
        "снимок",
        "из приложения",
        "пустой график",
        "нет данных",
      ],
      prompt: "Что с цифрами в кабинете?",
      children: [
        {
          id: "metrics-empty",
          title: "Пустой график / «нет снимка»",
          keywords: ["пустой", "нет снимка", "нет данных", "не подтягивает"],
          steps: [
            "Пустой график — не ошибка, а отсутствие данных со стола.",
            "Запустите приложение на компьютере: кабинет сам подтянет снимок. Облачного стола нет.",
            "Над обзором видно, живые ли цифры (live / stale / empty).",
          ],
        },
        {
          id: "metrics-read",
          title: "Как читать кривую и разрез по стратегиям",
          keywords: ["кривая", "по стратегиям", "аллокац", "сделки таблица"],
          steps: [
            "Кривая и таблица собирают пары, тренд и календарный арбитраж со снимка.",
            "Разрез «по стратегиям» — закрытые сделки по книгам, не доли тарифа.",
            "Калькулятор капитала — на главной лендинга.",
          ],
          href: "index.html#calculator",
          hrefLabel: "Калькулятор на главной",
        },
      ],
    },
    {
      id: "how",
      title: "Как пользоваться TRINITY с нуля",
      keywords: ["как пользоваться", "с чего начать", "инструкция", "wiki", "шаги", "онбординг", "с нуля"],
      steps: [
        "1) Кабинет: регистрация → письмо → вход.",
        "2) Получить приложение (кнопка в кабинете или URL инстанса).",
        "3) Первый запуск включает 5 календарных дней триала без живых заявок.",
        "4) В /view: режим → пары → Z → paper. После оплаты — автоторги у брокера из приложения.",
        "Подробно — публикация в Wiki.",
      ],
      href: "wiki/how-trinity.html",
      hrefLabel: "Как пользоваться TRINITY",
    },
  ];

  /* —— Wiki blurbs for free-form / screen questions —— */
  const WIKI = [
    {
      id: "wiki-how",
      title: "Как пользоваться TRINITY",
      href: "wiki/how-trinity.html",
      keywords: [
        "как пользоваться",
        "с чего начать trinity",
        "кабинет и стол",
        "две двери",
        "онбординг",
        "unlock",
        "первый сеанс",
        "/view",
      ],
      blurb:
        "Коротко: кабинет на сайте — аккаунт, триал, лаборатория и ключ; рынок смотрят в приложении (/view): режим, пары, Z, paper, брокер. Один email на оба контура. Ордера и токен брокера — только в приложении.",
    },
    {
      id: "wiki-pairs",
      title: "Парный трейдинг и коинтеграция",
      href: "wiki/pairs-moex.html",
      keywords: [
        "парн",
        "pairs",
        "коинтеграц",
        "корреляц",
        "hedge",
        "хедж",
        "mean reversion",
        "две акции",
        "спред акций",
        "z-score",
        "z score",
        "stat arb",
        "статистический арбитраж",
      ],
      blurb:
        "Пара — long одной ноги и short другой, ставка на разницу, а не на «рынок вверх». Коинтеграция даёт смысл Z; корреляция сама по себе слабее. Пороги |Z|, режим рынка и ликвидность решают, вход это или шум.",
    },
    {
      id: "wiki-volume",
      title: "Стакан, футпринт, профиль объёма",
      href: "wiki/volume-dom.html",
      keywords: [
        "стакан",
        "dom",
        "level 2",
        "футпринт",
        "footprint",
        "кластер",
        "лента",
        "tape",
        "order flow",
        "imbalance",
        "айсберг",
        "iceberg",
        "poc",
        "value area",
        "market profile",
        "профиль объёма",
      ],
      blurb:
        "Стакан — очередь лимиток, лента — уже совершённые удары, футпринт — объём внутри свечи. Для пары это фильтр исполнения: подтверждает ли поток идею по Z или против стоит стена.",
    },
    {
      id: "wiki-calendar",
      title: "Календарный спред",
      href: "wiki/calendar-spread.html",
      keywords: [
        "календарн",
        "calendar",
        "near",
        "next",
        "контанго",
        "бэквордац",
        "базис",
        "роллирован",
        "экспирац",
        "два срока",
        "фьючерсный спред",
        "бабочк",
      ],
      blurb:
        "Календарь — два срока одного актива. Контанго/бэквордация, ГО обеих ног, ролл ближнего и тонкий стакан дальнего — бытовые помехи «красивому» зазору. В кабинете гейты можно прокрутить в лаборатории.",
    },
    {
      id: "wiki-start",
      title: "С чего начать на Мосбирже",
      href: "wiki/start-moex.html",
      keywords: [
        "мосбирж",
        "moex",
        "с нуля",
        "новичок",
        "демо счёт",
        "иис",
        "брокерский счёт",
        "как научиться",
        "инвестиции с нуля",
      ],
      blurb:
        "Сначала не смешивайте долгосрок и внутридневную суету. Счёт у брокера → при желании ИИС → демо/paper → мелко на живом рынке. Стакан и пары — отдельные навыки, не «кнопка обогатиться».",
    },
    {
      id: "wiki-index",
      title: "Оглавление Wiki",
      href: "wiki/",
      keywords: ["wiki", "вики", "статьи", "публикации", "база знаний"],
      blurb:
        "В Wiki — how-to по TRINITY, pairs на MOEX, стакан/футпринт, календарный спред и старт на бирже. Ниже ссылка на оглавление.",
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

  function findWikiById(id) {
    for (let i = 0; i < WIKI.length; i++) {
      if (WIKI[i].id === id) return WIKI[i];
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

  function scoreKeywords(keywords, title, query) {
    const q = normalize(query);
    if (!q) return 0;
    const tokens = q.split(" ").filter(function (t) {
      return t.length >= 2;
    });
    let score = 0;
    const hayTitle = normalize(title);
    if (hayTitle && q.indexOf(hayTitle) !== -1) score += 8;
    (keywords || []).forEach(function (kw) {
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

  function scoreNode(node, query) {
    return scoreKeywords(node.keywords, node.title, query);
  }

  function scoreWiki(entry, query) {
    let s = scoreKeywords(entry.keywords, entry.title, query);
    const q = normalize(query);
    const blurb = normalize(entry.blurb);
    q.split(" ").forEach(function (t) {
      if (t.length >= 4 && blurb.indexOf(t) !== -1) s += 1;
    });
    return s;
  }

  function matchQuery(query, limit) {
    const cap = typeof limit === "number" ? limit : 6;
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

  function matchWiki(query, limit) {
    const cap = typeof limit === "number" ? limit : 3;
    const q = normalize(query);
    if (!q) return [];
    const ranked = WIKI.map(function (entry) {
      return { entry: entry, score: scoreWiki(entry, query) };
    })
      .filter(function (row) {
        return row.score > 0;
      })
      .sort(function (a, b) {
        return b.score - a.score;
      });
    return ranked.slice(0, cap).map(function (row) {
      return {
        id: row.entry.id,
        title: row.entry.title,
        href: row.entry.href,
        blurb: row.entry.blurb,
        score: row.score,
      };
    });
  }

  /**
   * Unified answer for Маша: FAQ cards and/or wiki blurb.
   * @returns {{ mode: string, topics: object[], wiki: object|null, wikiAlt: object[] }}
   */
  function resolveHelp(query) {
    const q = normalize(query);
    if (!q) {
      return { mode: "menu", topics: TOPICS.map(card), wiki: null, wikiAlt: [] };
    }
    const topics = matchQuery(query, 6);
    const wikiHits = matchWiki(query, 3);
    const bestTopic = topics.length ? topics[0].score : 0;
    const bestWiki = wikiHits.length ? wikiHits[0].score : 0;

    if (bestTopic >= SCORE_HIT && bestTopic >= bestWiki) {
      return {
        mode: "topics",
        topics: topics,
        wiki: bestWiki >= SCORE_HIT && bestWiki >= bestTopic - 2 ? wikiHits[0] : null,
        wikiAlt: [],
      };
    }
    if (bestWiki >= SCORE_HIT) {
      return {
        mode: "wiki",
        topics: bestTopic > 0 ? topics.slice(0, 3) : [],
        wiki: wikiHits[0],
        wikiAlt: wikiHits.slice(1),
      };
    }
    if (topics.length) {
      return { mode: "topics", topics: topics, wiki: null, wikiAlt: [] };
    }
    if (wikiHits.length) {
      return {
        mode: "wiki",
        topics: [],
        wiki: wikiHits[0],
        wikiAlt: wikiHits.slice(1),
      };
    }
    return { mode: "empty", topics: [], wiki: null, wikiAlt: [] };
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

  /** Strip secrets / truncate for training logs. */
  function sanitizeHelpText(text, maxLen) {
    const cap = typeof maxLen === "number" ? maxLen : 500;
    let s = String(text || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    s = s
      .replace(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
        "[email]"
      )
      .replace(/\b\d{10,16}\b/g, "[digits]")
      .replace(
        /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
        "[jwt]"
      )
      .replace(
        /\b(t\.[a-z0-9_-]{20,}|Bearer\s+\S+|sk-[A-Za-z0-9]{10,}|live_[A-Za-z0-9_-]{16,}|sandbox_[A-Za-z0-9_-]{16,})\b/gi,
        "[token]"
      )
      .replace(
        /(пароль|password|passwd|pwd|токен|token|api[_-]?key|секрет|secret)\s*[:=]\s*\S+/gi,
        "$1=[redacted]"
      )
      .replace(/trinity-[a-z0-9-]{8,}/gi, "[unlock]");
    if (s.length > cap) s = s.slice(0, cap - 1) + "…";
    return s;
  }

  function summarizeResolved(resolved) {
    const r = resolved || {};
    const parts = [];
    if (r.mode) parts.push("mode=" + r.mode);
    if (r.wiki && r.wiki.title) {
      parts.push("wiki:" + r.wiki.title);
      if (r.wiki.blurb) parts.push(r.wiki.blurb);
    }
    (r.topics || []).slice(0, 6).forEach(function (t) {
      parts.push("topic:" + (t.title || t.id));
    });
    (r.wikiAlt || []).forEach(function (w) {
      parts.push("alt:" + (w.title || w.id));
    });
    return sanitizeHelpText(parts.join(" · "), 800);
  }

  function summarizeSolution(node) {
    if (!node) return "";
    const bits = [node.title].concat(node.steps || []);
    if (node.href) bits.push("href:" + node.href);
    return sanitizeHelpText(bits.join(" · "), 800);
  }

  /**
   * Payload for masha_help_logs insert (no user_id — client adds it).
   * @param {object} opts
   */
  function buildHelpLog(opts) {
    const o = opts || {};
    const topicIds = Array.isArray(o.topicIds)
      ? o.topicIds.filter(Boolean).slice(0, 12)
      : [];
    return {
      session_id: String(o.sessionId || "anon").slice(0, 80),
      event_type: o.eventType || "turn",
      user_text: sanitizeHelpText(o.userText, 500) || null,
      reply_mode: o.replyMode ? String(o.replyMode).slice(0, 40) : null,
      reply_summary: sanitizeHelpText(o.replySummary, 800) || null,
      topic_ids: topicIds,
      wiki_id: o.wikiId ? String(o.wikiId).slice(0, 64) : null,
      wiki_href: o.wikiHref ? String(o.wikiHref).slice(0, 200) : null,
      path: o.path ? sanitizeHelpText(o.path, 300) : null,
      feedback: o.feedback ? String(o.feedback).slice(0, 40) : null,
      meta: o.meta && typeof o.meta === "object" ? o.meta : {},
    };
  }

  return {
    TOPICS: TOPICS,
    WIKI: WIKI,
    SCORE_HIT: SCORE_HIT,
    DEFAULT_SUPPORT_EMAIL: DEFAULT_SUPPORT_EMAIL,
    AGENT_NAME: AGENT_NAME,
    AGENT_ROLE: AGENT_ROLE,
    AGENT_AVATAR: AGENT_AVATAR,
    dayPartGreeting: dayPartGreeting,
    firstNameFrom: firstNameFrom,
    resolveDisplayName: resolveDisplayName,
    buildGreeting: buildGreeting,
    normalize: normalize,
    findById: findById,
    findWikiById: findWikiById,
    matchQuery: matchQuery,
    matchWiki: matchWiki,
    resolveHelp: resolveHelp,
    childrenOf: childrenOf,
    card: card,
    composeMailto: composeMailto,
    sanitizeHelpText: sanitizeHelpText,
    summarizeResolved: summarizeResolved,
    summarizeSolution: summarizeSolution,
    buildHelpLog: buildHelpLog,
  };
});
