# TRINITY Landing

Публичный лендинг продукта **TRINITY** (маркетинг / тарифы / FAQ).

Операторское приложение живёт отдельно: репозиторий IMOEX (Spring Boot + `/view`).

## Стек

Статический сайт: HTML + CSS + JS. Без сборки и без Node.

## Локальный просмотр

Из корня репозитория:

```bash
# Python
python3 -m http.server 5173

# или PHP
php -S localhost:5173
```

Откройте [http://localhost:5173](http://localhost:5173).

Либо просто откройте `index.html` в браузере.

## Структура

```
index.html      # страница
css/styles.css  # стили
js/main.js      # режим рынка, меню, калькулятор, reveal
```

## Продуктовая честность

Лендинг следует тону промпта, но не выдумывает PnL:

- **Pairs / DAILY** — live paper
- **Trend / Arbitrage** — early access / roadmap (Full Core)
- **Volume ML** — roadmap после валидации paper
- Дисклеймер: research / decision-support, не гарантия прибыли

## Деплой

Любой static host: GitHub Pages, Cloudflare Pages, Netlify.

Для GitHub Pages: Settings → Pages → Deploy from branch `main` / root.
