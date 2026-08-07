const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Auth = require("../js/lib/auth-errors.js");

describe("TrinityAuthErrors", () => {
  it("mapAuthError: null / generic", () => {
    assert.equal(Auth.mapAuthError(null), "Ошибка аутентификации");
    assert.equal(Auth.mapAuthError({ message: "weird" }), "weird");
  });

  it("mapAuthError: network variants", () => {
    for (const msg of [
      "Load failed",
      "Failed to fetch",
      "NetworkError when attempting",
      "Network request failed",
    ]) {
      assert.match(Auth.mapAuthError({ message: msg }), /Сеть/);
    }
  });

  it("mapAuthError: auth-specific messages", () => {
    assert.match(
      Auth.mapAuthError({ message: "Email not confirmed" }),
      /не подтверждён/
    );
    assert.match(
      Auth.mapAuthError({ message: "Invalid login credentials" }),
      /Неверный email/
    );
    assert.match(
      Auth.mapAuthError({ message: "User already registered" }),
      /уже зарегистрирован/
    );
    assert.match(
      Auth.mapAuthError({ message: "Password should be at least 6 characters" }),
      /Пароль/
    );
  });

  it("isAuthConfigured requires url + anon key", () => {
    assert.equal(Auth.isAuthConfigured({}), false);
    assert.equal(
      Auth.isAuthConfigured({ supabaseUrl: "https://x.supabase.co" }),
      false
    );
    assert.equal(
      Auth.isAuthConfigured({
        supabaseUrl: "https://x.supabase.co",
        supabaseAnonKey: "anon",
      }),
      true
    );
  });

  it("panelTitle covers gate panels", () => {
    assert.equal(Auth.panelTitle("login"), "Вход в кабинет");
    assert.equal(Auth.panelTitle("register"), "Регистрация");
    assert.equal(Auth.panelTitle("check-email"), "Проверьте почту");
    assert.equal(Auth.panelTitle("setup"), "Auth не настроен");
    assert.equal(Auth.panelTitle("other"), "Кабинет");
  });
});
