# TRINITY Landing

Публичный лендинг продукта **TRINITY** (маркетинг / тарифы / FAQ / кабинет).

Операторское приложение живёт отдельно: репозиторий IMOEX (Spring Boot + `/view`).

## Стек

Статический сайт: HTML + CSS + JS. Без бандлера.
Чистая логика вынесена в `js/lib/*` (UMD) — её покрывают unit-тесты на Node.

Auth кабинета: **Supabase** (email + пароль + confirm). См. [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

## Локальный просмотр

```bash
python3 scripts/dev-server.py
```

- Лендинг: [http://127.0.0.1:5173/](http://127.0.0.1:5173/)
- Кабинет: [http://127.0.0.1:5173/cabinet.html](http://127.0.0.1:5173/cabinet.html)
- Защищённый портфель: [http://127.0.0.1:5173/invest.html](http://127.0.0.1:5173/invest.html) (нужна сессия кабинета)
- Калькулятор капитала: `#calculator` на главной

Auth:

```bash
cp js/cabinet-config.example.js js/cabinet-config.local.js
# впишите supabaseUrl + supabaseAnonKey
```

## Тесты

```bash
npm test
```

Покрывают методы в `js/lib/`: Capital Allocator, Decision Lab, auth errors, product modes, unlock key, invest pipeline, desk snapshot.

## Структура

```
index.html              # лендинг + калькулятор + desk proof
cabinet.html            # кабинет (Supabase gate)
invest.html             # защищённый инвестиционный контур
css/styles.css          # desktop / tablet / mobile
js/lib/                 # чистая логика (тестируется)
js/main.js              # hero / nav / reveal / showcase
js/calc.js              # Capital Allocator UI
js/cabinet-*.js         # кабинет + auth
test/                   # node:test
wiki/                   # публикации + how-to
robots.txt / sitemap.xml
supabase/profiles.sql
supabase/desk_snapshots.sql
supabase/masha_help_logs.sql
docs/SUPABASE_SETUP.md
docs/SEO.md
```

## Продуктовая честность

- **Pairs / DAILY** — live paper (MOEX ISS)
- **Trend BR M5** — fair-paper desk SANDBOX_FAIR (T-Invest tape, DOM)
- **Calendar arb** — fair-paper desk (BR/SI/RI/GD/NG)
- **Live FORTS** у брокера — gated, `broker.enabled: false` по умолчанию
- **Volume ML** — roadmap
- Кабинет не торгует и не хранит токен брокера
- Research / decision-support, не гарантия прибыли

## Деплой (Webnames FTP)

Сайт живёт на **Webnames**. Вместо ручного zip:

- **`main`** → GitHub Action заливает файлы по FTP (прод)
- **`dev`** → только разработка и локальный просмотр, на хостинг **не** деплоится

Workflow: [`.github/workflows/deploy-webnames.yml`](.github/workflows/deploy-webnames.yml)  
(даже ручной Run workflow всегда чекаутит `main`).

В GitHub → Settings → Secrets and variables → Actions добавьте:

| Secret | Пример |
|--------|--------|
| `FTP_HOST` | хост из панели Webnames (часто `ftp.…` или IP) |
| `FTP_USER` | FTP-логин |
| `FTP_PASSWORD` | FTP-пароль |
| `FTP_SERVER_DIR` | каталог сайта **со слэшем в конце**, напр. `./` или `public_html/` |
| `SUPABASE_URL` | `https://….supabase.co` |
| `SUPABASE_ANON_KEY` | anon key |

Перед заливкой CI пишет `js/cabinet-config.js` из `SUPABASE_*` (на сервере ключи не правятся руками).  
Не заливаются: `test/`, `docs/`, `supabase/`, `.github/`, `*.md`, `cabinet-config.local.js`.

Ручной запуск: Actions → **Deploy Webnames** → Run workflow.  
Если FTPS не проходит — в workflow временно поставьте `protocol: ftp` (или согласуйте с поддержкой Webnames).

## SEO

Продакшен-домен: **https://trinity.trading** — см. [`docs/SEO.md`](docs/SEO.md).

В коде: `robots.txt`, `sitemap.xml`, Open Graph, JSON-LD, `favicon.svg`. Кабинет — `noindex`.

**Важно:** теги помогают роботам, но не покупают «1 место» в поиске.

## Лицензия

Код и материалы лендинга — **проприетарные**, все права принадлежат **Ивану Тюлькину (самозанятый)**.
Программный комплекс **TRINITY** имеет государственную регистрацию программы для ЭВМ в **Роспатенте**.
См. [`LICENSE`](LICENSE): использование, копирование, модификация, форки, клонирование, распространение
и коммерческое (и иное) применение **без письменного согласия запрещены**. Разрешено — ничего.
