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
     - ваш прод `https://…/cabinet.html`

## 2. SQL

В SQL Editor выполните [`supabase/profiles.sql`](../supabase/profiles.sql).

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

## 5. Phase 2 (IMOEX)

Тот же project URL + **JWT Secret** (Settings → API → JWT Secret) в `application-local.yml`:

```yaml
imoex:
  auth:
    supabase:
      enabled: true
      url: https://YOUR_PROJECT.supabase.co
      jwt-secret: "YOUR_JWT_SECRET"
```

См. репозиторий IMOEX: `docs/AUTH_SUPABASE.md`.
