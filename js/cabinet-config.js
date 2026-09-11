/**
 * TRINITY cabinet public config (safe to commit with empty placeholders).
 * Override locally: js/cabinet-config.local.js (gitignored).
 *
 * Auth: Supabase email/password + confirm (see docs/SUPABASE_SETUP.md).
 * NO order placement, NO broker token. Trading stays in IMOEX /view.
 */
window.CABINET_CONFIG = {
  /* Read-only IMOEX: journal + regime (CORS on Instance for landing origins) */
  imoexBase: null,
  supportEmail: "info@trinity.trading",
  /* Supabase project URL + anon (public) key — fill via .local.js or deploy */
  supabaseUrl: "",
  supabaseAnonKey: "",
};
