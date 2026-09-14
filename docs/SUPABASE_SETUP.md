# Supabase setup (TRINITY cabinet auth)

Единый IdP для кабинета лендинга (Phase 1) и позже дашборда IMOEX (Phase 2).

## 1. Создайте проект

1. [supabase.com](https://supabase.com) → New project
2. Authentication → Providers → **Email** включён
3. Authentication → Providers → Email → **Confirm email** = ON
4. Authentication → URL Configuration:
   - Site URL: `http://127.0.0.1:5173/cabinet.html` (dev) или прод-URL кабинета
   - Redirect URLs: добавьте
     - `http://127.0.0.1:5173/cabinet.html`
     - `http://localhost:5173/cabinet.html`
     - `http://127.0.0.1:5173/invest.html`
     - `http://localhost:5173/invest.html`
     - ваш прод `https://…/cabinet.html`
     - ваш прод `https://…/invest.html`

## 2. SQL

В SQL Editor по очереди:

1. [`supabase/profiles.sql`](../supabase/profiles.sql)
2. [`supabase/desk_snapshots.sql`](../supabase/desk_snapshots.sql) — снимок стола с компьютера пользователя (режим, paper, дни триала). Без токена брокера.

Можно повторно: колонки добавляются через `ADD COLUMN IF NOT EXISTS`.

Поля профиля при регистрации: имя, телефон, пол, возраст, опыт торговли,
`pdn_consent`, отдельно `marketing_opt_in`. Политика: [`privacy.html`](../privacy.html).

## 3. Ключи в лендинг

Project Settings → API:

- Project URL → `supabaseUrl`
- `anon` `public` key → `supabaseAnonKey`

```bash
cp js/cabinet-config.example.js js/cabinet-config.local.js
# отредактируйте url + anon key
```

`cabinet-config.local.js` в `.gitignore`. Закоммиченный [`js/cabinet-config.js`](../js/cabinet-config.js) — пустые плейсхолдеры.

На статическом хосте без local-файла: подставьте значения прямо в `cabinet-config.js` на CI/деплое (anon key публичен; защиту даёт RLS).

## 4. Письма

По умолчанию Supabase шлёт с их SMTP (лимиты). Для продакшена: Project Settings → Authentication → SMTP (Resend / свой).

## 5. Инвестиционный контур (`invest.html`)

После профилей выполните в SQL Editor [`supabase/invest.sql`](../supabase/invest.sql)
(идемпотентно). Таблицы:

- `invest_risk_profiles` — анкета риска, UNIQUE(`user_id`)
- `invest_positions` — ручные активы/пассивы (`value` = капитал, `income_monthly` = доход или платёж в месяц, `yield_annual_pct` = ставка или доходность годовых, если указана)
- `invest_analysis_runs` — прогоны автоанализа (гейты, вердикт, explanation JSON)

RLS: `auth.uid() = user_id` на select/insert/update/delete. Анонимный ключ в клиенте
тот же, что у кабинета (`cabinet-config.local.js` не коммитить).

Страница `invest.html` без сессии редиректит на `cabinet.html`. Email-confirm
может вернуть пользователя на cabinet — это нормально; после входа открывается
лаунчер «Открыть защищённый портфель».

## 6. Стол на компьютере (IMOEX)

Облачного инстанса нет. Человек скачивает приложение; триал **7 дней с первого запуска**, без живых заявок. После оплаты — автоторги роботом у брокера (токен только в приложении).

Тот же project URL + **JWT Secret** (Settings → API → JWT Secret) в `application-local.yml`:

```yaml
imoex:
  auth:
    supabase:
      enabled: true
      url: https://YOUR_PROJECT.supabase.co
      jwt-secret: "YOUR_JWT_SECRET"
```

Приложение логинится тем же email, что кабинет, и пишет в `desk_snapshots` **только рынок** (режим, paper). Поля лицензии (`license_status`, `live_trading`, даты триала) пользовательским JWT не меняются: триггер в SQL их замораживает. Оплату (`active`) выставляет только `service_role` — вы руками или позже webhook Stripe.

Кабинет строку только читает. Контракт: [`supabase/desk_snapshots.sql`](../supabase/desk_snapshots.sql).

См. репозиторий IMOEX: `docs/AUTH_SUPABASE.md`.
