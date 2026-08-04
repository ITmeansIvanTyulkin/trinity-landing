(() => {
  /**
   * Supabase email/password auth for TRINITY cabinet.
   * Requires: supabase-js CDN + CABINET_CONFIG.supabaseUrl/AnonKey
   * (optional override: cabinet-config.local.js).
   */
  const TOKEN_KEY = "trinity.supabase.access_token";
  const USER_KEY = "trinity.supabase.user_email";

  function cfg() {
    return window.CABINET_CONFIG || {};
  }

  function isConfigured() {
    const c = cfg();
    return Boolean(c.supabaseUrl && c.supabaseAnonKey);
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (window.__trinitySb) return window.__trinitySb;
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      return null;
    }
    const c = cfg();
    window.__trinitySb = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
      },
    });
    return window.__trinitySb;
  }

  function persistSession(session) {
    try {
      if (session && session.access_token) {
        localStorage.setItem(TOKEN_KEY, session.access_token);
        if (session.user && session.user.email) {
          localStorage.setItem(USER_KEY, session.user.email);
        }
      } else {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    } catch {
      /* ignore */
    }
  }

  function unlockCabinet(email) {
    document.body.classList.remove("cabinet-locked");
    const gate = document.getElementById("cabinet-gate");
    if (gate) gate.hidden = true;
    const label = document.querySelector("[data-cab-user-email]");
    if (label && email) label.textContent = email;
  }

  function lockCabinet() {
    document.body.classList.add("cabinet-locked");
    const gate = document.getElementById("cabinet-gate");
    if (gate) gate.hidden = false;
    const label = document.querySelector("[data-cab-user-email]");
    if (label) label.textContent = "";
  }

  function showPanel(name) {
    document.querySelectorAll("[data-auth-panel]").forEach((el) => {
      el.hidden = el.getAttribute("data-auth-panel") !== name;
    });
    const title = document.getElementById("cabinet-gate-title");
    if (!title) return;
    if (name === "login") title.textContent = "Вход в кабинет";
    else if (name === "register") title.textContent = "Регистрация";
    else if (name === "check-email") title.textContent = "Проверьте почту";
    else if (name === "setup") title.textContent = "Auth не настроен";
  }

  function setError(msg) {
    const err = document.querySelector("[data-gate-error]");
    if (!err) return;
    if (!msg) {
      err.hidden = true;
      err.textContent = "";
      return;
    }
    err.hidden = false;
    err.textContent = msg;
  }

  function setInfo(msg) {
    const info = document.querySelector("[data-gate-info]");
    if (!info) return;
    if (!msg) {
      info.hidden = true;
      info.textContent = "";
      return;
    }
    info.hidden = false;
    info.textContent = msg;
  }

  function mapAuthError(error) {
    if (!error) return "Ошибка аутентификации";
    const m = (error.message || String(error)).toLowerCase();
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

  async function ensureProfileMarketing(user, marketingOptIn) {
    const sb = getClient();
    if (!sb || !user) return;
    try {
      await sb
        .from("profiles")
        .update({
          marketing_opt_in: Boolean(marketingOptIn),
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
    } catch {
      /* trigger may not have fired yet; non-fatal */
    }
  }

  async function loadLocalConfigOverride() {
    try {
      const res = await fetch(
        new URL("js/cabinet-config.local.js", window.location.href).href,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const code = await res.text();
      if (!code || !code.trim()) return;
      const s = document.createElement("script");
      s.textContent = code;
      document.head.appendChild(s);
    } catch {
      /* optional file missing — fine */
    }
  }

  async function setupAuth() {
    await loadLocalConfigOverride();

    const gate = document.getElementById("cabinet-gate");
    const loginForm = document.getElementById("cabinet-login-form");
    const registerForm = document.getElementById("cabinet-register-form");
    const logout = document.querySelector("[data-cab-logout]");

    if (!isConfigured()) {
      document.body.classList.add("cabinet-locked");
      if (gate) gate.hidden = false;
      showPanel("setup");
      setError("");
      setInfo(
        "Заполните supabaseUrl и supabaseAnonKey (js/cabinet-config.local.js). Инструкция: docs/SUPABASE_SETUP.md"
      );
      return { session: null };
    }

    const sb = getClient();
    if (!sb) {
      document.body.classList.add("cabinet-locked");
      if (gate) gate.hidden = false;
      showPanel("setup");
      setError("Не загрузился supabase-js. Проверьте CDN и сеть.");
      return { session: null };
    }

    /* Tab switches */
    document.querySelectorAll("[data-auth-goto]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        setError("");
        setInfo("");
        showPanel(btn.getAttribute("data-auth-goto"));
      });
    });

    /* Session from URL hash (email confirm redirect) or storage */
    const { data: sessionData } = await sb.auth.getSession();
    let session = sessionData && sessionData.session;

    if (session && session.user) {
      persistSession(session);
      unlockCabinet(session.user.email);
      showPanel("login");
    } else {
      lockCabinet();
      showPanel("login");
      const emailInput = document.getElementById("cabinet-login-email");
      if (emailInput) setTimeout(() => emailInput.focus(), 60);
    }

    sb.auth.onAuthStateChange((event, next) => {
      if (event === "SIGNED_IN" && next) {
        persistSession(next);
        unlockCabinet(next.user && next.user.email);
      }
      if (event === "SIGNED_OUT") {
        persistSession(null);
        lockCabinet();
        showPanel("login");
      }
      if (event === "PASSWORD_RECOVERY") {
        setInfo("Можно задать новый пароль через письмо восстановления (Supabase).");
      }
    });

    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setError("");
        const email = (document.getElementById("cabinet-login-email") || {}).value || "";
        const password = (document.getElementById("cabinet-login-pass") || {}).value || "";
        const btn = loginForm.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true;
        const { data, error } = await sb.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (btn) btn.disabled = false;
        if (error) {
          setError(mapAuthError(error));
          return;
        }
        persistSession(data.session);
        unlockCabinet(data.user && data.user.email);
        loginForm.reset();
      });
    }

    if (registerForm) {
      registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setError("");
        setInfo("");
        const email = (document.getElementById("cabinet-reg-email") || {}).value || "";
        const password = (document.getElementById("cabinet-reg-pass") || {}).value || "";
        const name = (document.getElementById("cabinet-reg-name") || {}).value || "";
        const optIn = Boolean(
          (document.getElementById("cabinet-reg-marketing") || {}).checked
        );
        if (password.length < 6) {
          setError("Пароль: минимум 6 символов.");
          return;
        }
        const btn = registerForm.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true;
        const redirectTo = new URL("cabinet.html", window.location.href).href;
        const { data, error } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              display_name: name.trim() || undefined,
              marketing_opt_in: optIn,
              source: "cabinet",
            },
          },
        });
        if (btn) btn.disabled = false;
        if (error) {
          setError(mapAuthError(error));
          return;
        }
        /* If email confirm required, session may be null */
        if (data.session && data.user) {
          await ensureProfileMarketing(data.user, optIn);
          persistSession(data.session);
          unlockCabinet(data.user.email);
        } else {
          const checkEmail = document.querySelector("[data-check-email-addr]");
          if (checkEmail) checkEmail.textContent = email.trim();
          showPanel("check-email");
          setInfo("");
        }
        registerForm.reset();
        const marketing = document.getElementById("cabinet-reg-marketing");
        if (marketing) marketing.checked = true;
      });
    }

    const resendBtn = document.querySelector("[data-auth-resend]");
    if (resendBtn) {
      resendBtn.addEventListener("click", async () => {
        const addr =
          (document.querySelector("[data-check-email-addr]") || {}).textContent ||
          (document.getElementById("cabinet-reg-email") || {}).value ||
          "";
        if (!addr) {
          setError("Укажите email на форме регистрации.");
          showPanel("register");
          return;
        }
        const { error } = await sb.auth.resend({
          type: "signup",
          email: addr.trim(),
          options: {
            emailRedirectTo: new URL("cabinet.html", window.location.href).href,
          },
        });
        if (error) setError(mapAuthError(error));
        else setInfo("Письмо отправлено повторно (если аккаунт ещё не подтверждён).");
      });
    }

    if (logout) {
      logout.addEventListener("click", async () => {
        await sb.auth.signOut();
        persistSession(null);
        lockCabinet();
        showPanel("login");
        setError("");
      });
    }

    return { session };
  }

  window.TrinityCabinetAuth = {
    setupAuth,
    isConfigured,
    getClient,
    tokenKey: TOKEN_KEY,
    userKey: USER_KEY,
  };
})();
