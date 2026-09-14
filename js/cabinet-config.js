/**
 * TRINITY cabinet public config (safe to commit with empty placeholders).
 * Override locally: js/cabinet-config.local.js (gitignored).
 *
 * Auth: Supabase email/password + confirm (see docs/SUPABASE_SETUP.md).
 * NO order placement, NO broker token. Trading stays in IMOEX /view.
 */
window.CABINET_CONFIG = {
  /* Read-only snapshot from the desktop desk lands in Supabase (desk_snapshots).
     imoexBase is a local-dev fallback only — never shown in the UI. */
  imoexBase: null,
  supportEmail: "info@trinity.trading",
  /* Supabase project URL + anon (public) key — fill via .local.js or deploy */
  supabaseUrl: "",
  supabaseAnonKey: "",
};
