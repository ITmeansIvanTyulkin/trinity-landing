# TRINITY Landing

Публичный лендинг продукта **TRINITY** (маркетинг / тарифы / FAQ / кабинет).

Операторское приложение живёт отдельно: репозиторий IMOEX (Spring Boot + `/view`).

## Стек

Статический сайт: HTML + CSS + JS. Без сборки и без Node.

Auth кабинета: **Supabase** (email + пароль + confirm). См. [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

## Локальный просмотр

```bash
python3 -m http.server 5173
```

- Лендинг: [http://127.0.0.1:5173/](http://127.0.0.1:5173/)
- Кабинет: [http://127.0.0.1:5173/cabinet.html](http://127.0.0.1:5173/cabinet.html)
- Калькулятор капитала: `#calculator` на главной

Auth:

```bash
cp js/cabinet-config.example.js js/cabinet-config.local.js
# впишите supabaseUrl + supabaseAnonKey
```

## Структура

```
index.html              # лендинг + калькулятор
cabinet.html            # кабинет (Supabase gate)
css/styles.css
js/main.js              # hero / nav / reveal
js/calc.js              # Capital Allocator сценарий
js/cabinet-*.js         # кабинет + auth
robots.txt / sitemap.xml
supabase/profiles.sql
docs/SUPABASE_SETUP.md
docs/SEO.md
```

## Продуктовая честность

- **Pairs / DAILY** — live paper
- **Trend / Arbitrage** — early access / roadmap (Full Core)
- **Volume ML** — roadmap
- Кабинет не торгует и не хранит токен брокера
- Research / decision-support, не гарантия прибыли

## Деплой

Любой static host: GitHub Pages, Cloudflare Pages, Netlify.

На деплое подставьте Supabase URL/anon в `js/cabinet-config.js` (или сгенерируйте файл в CI).

## SEO

Перед публикацией замените `YOUR-TRINITY-DOMAIN` — см. [docs/SEO.md](docs/SEO.md).

В коде: `robots.txt`, `sitemap.xml`, Open Graph, JSON-LD, `favicon.svg`. Кабинет — `noindex`.

**Важно:** теги помогают роботам, но не покупают «1 место» в поиске.
