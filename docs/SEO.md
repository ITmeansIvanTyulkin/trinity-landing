# SEO для публикации TRINITY landing

Технические теги **не гарантируют 1 место** в Яндексе/Google. Они дают роботам корректный сниппет, индексацию и соцпревью. Ранжирование = контент + ссылки + поведение + конкуренция по запросу.

## Перед деплоем (обязательно)

Замените плейсхолдер `https://YOUR-TRINITY-DOMAIN` (без `/` в конце) в файлах:

1. [`js/site-origin.js`](../js/site-origin.js)
2. [`robots.txt`](../robots.txt) — строка `Sitemap:`
3. [`sitemap.xml`](../sitemap.xml) — все `<loc>`
4. [`index.html`](../index.html) — `canonical`, `og:url`, JSON-LD `@id` / `url`

Пример для GitHub Pages:

```text
https://itmeansivantyulkin.github.io/trinity-landing
```

## После деплоя

1. [Google Search Console](https://search.google.com/search-console) — добавить ресурс, отправить `sitemap.xml`
2. [Яндекс.Вебмастер](https://webmaster.yandex.ru/) — то же
3. Проверить Open Graph: [opengraph.xyz](https://www.opengraph.xyz/) или отладчик VK/Telegram
4. Убедиться, что `https://…/robots.txt` и `https://…/sitemap.xml` открываются

## Что уже в коде

- `title` / `description` / `robots` / `theme-color`
- Open Graph + Twitter Card
- JSON-LD: `Organization`, `WebSite`, `SoftwareApplication`, `FAQPage`
- `robots.txt` (кабинет `noindex` через Disallow + meta на `cabinet.html`)
- `sitemap.xml`, `favicon.svg`, `site.webmanifest`

## Честные ограничения

- Не спамить keywords и не покупать накрутку — риск фильтра
- Кабинет за логином не нужно пушить в топ — он закрыт от индекса
- Сильные коммерческие запросы («ATAS», «Tiger.trade», «коинтеграция MOEX») требуют времени и внешних упоминаний
