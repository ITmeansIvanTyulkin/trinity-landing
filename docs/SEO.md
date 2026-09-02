# SEO для публикации TRINITY landing

Технические теги **не гарантируют 1 место** в Яндексе/Google. Они дают роботам корректный сниппет, индексацию и соцпревью. Ранжирование = контент + ссылки + поведение + конкуренция по запросу.

## Перед деплоем

Продакшен-origin: **`https://trinity.trading`** (без `/` в конце). Проверьте совпадение в:

1. [`js/site-origin.js`](../js/site-origin.js)
2. [`robots.txt`](../robots.txt) — строка `Sitemap:`
3. [`sitemap.xml`](../sitemap.xml) — все `<loc>`
4. [`index.html`](../index.html) — `canonical`, `og:url`, JSON-LD `@id` / `url`

Для staging на GitHub Pages можно временно подставить другой origin — не забудьте вернуть `trinity.trading` перед продом.

## После деплоя

1. [Google Search Console](https://search.google.com/search-console) — добавить ресурс, отправить `sitemap.xml`
2. [Яндекс.Вебмастер](https://webmaster.yandex.ru/) — то же
3. Проверить Open Graph: [opengraph.xyz](https://www.opengraph.xyz/) или отладчик VK/Telegram
4. Убедиться, что `https://…/robots.txt` и `https://…/sitemap.xml` открываются

## Wiki

Отдельные URL в [`wiki/`](../wiki/): публикации и how-to, в шапке лендинга — одна строка «Wiki». Sitemap включает хаб и статьи с priority ниже, чем у главной. How-to: [`wiki/how-trinity.html`](../wiki/how-trinity.html).

## Указатель запросов `/topics/`

Не в меню продукта. Роботы находят через `sitemap.xml` и JSON-LD `hasPart`. Страница `index, follow`, текст видимый — `display:none` поисковики почти не считают. Это слабее, чем wiki-статьи: облако ключей без смысла могут пометить как doorway. Поэтому каждый блок ссылается на статью wiki или продукт.

## Что уже в коде

- `title` / `description` / `robots` / `theme-color`
- Open Graph + Twitter Card
- JSON-LD: `Organization`, `WebSite`, `SoftwareApplication`, `FAQPage`
- `robots.txt` (кабинет `noindex` через Disallow + meta на `cabinet.html`)
- `sitemap.xml`, `favicon.svg`, `site.webmanifest`
- Семантика: [`docs/KEYWORDS.md`](KEYWORDS.md) + опечатки/раскладка [`docs/KEYWORDS-TYPOS.md`](KEYWORDS-TYPOS.md)

## Честные ограничения

- `meta keywords` читает в основном Яндекс; Google почти игнорирует — для людей тексты в FAQ и [`wiki/`](../wiki/)
- Не прятать простыню ключей через `display:none` — риск фильтра и почти нулевой вес
- Кабинет за логином не нужно пушить в топ — он закрыт от индекса
- Сильные коммерческие запросы («ATAS скачать», «Tiger.trade») требуют времени; мы отвечаем честно: это не установка ATAS
