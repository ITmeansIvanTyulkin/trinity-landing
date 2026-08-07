/**
 * Supabase / auth error mapping (pure).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TrinityAuthErrors = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function mapAuthError(error) {
    if (!error) return "Ошибка аутентификации";
    const m = (error.message || String(error)).toLowerCase();
    if (
      m.includes("load failed") ||
      m.includes("failed to fetch") ||
      m.includes("networkerror") ||
      m.includes("network request failed")
    ) {
      return "Сеть: не удалось связаться с Supabase. Проверьте supabaseUrl (Project URL) и интернет.";
    }
    if (m.includes("email not confirmed")) {
      return "Email ещё не подтверждён. Откройте письмо и перейдите по ссылке.";
    }
    if (m.includes("invalid login credentials")) {
      return "Неверный email или пароль.";
    }
    if (m.includes("user already registered")) {
      return "Этот email уже зарегистрирован — войдите или сбросьте пароль в письме.";
    }
    if (m.includes("password")) {
      return "Пароль слишком короткий (минимум 6 символов).";
    }
    return error.message || "Ошибка аутентификации";
  }

  function isAuthConfigured(config) {
    const c = config || {};
    return Boolean(c.supabaseUrl && c.supabaseAnonKey);
  }

  function panelTitle(name) {
    if (name === "login") return "Вход в кабинет";
    if (name === "register") return "Регистрация";
    if (name === "check-email") return "Проверьте почту";
    if (name === "setup") return "Auth не настроен";
    return "Кабинет";
  }

  return {
    mapAuthError: mapAuthError,
    isAuthConfigured: isAuthConfigured,
    panelTitle: panelTitle,
  };
});
