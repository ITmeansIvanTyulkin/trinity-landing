/**
 * Example cabinet config — copy to cabinet-config.local.js and fill in.
 *
 *   cp js/cabinet-config.example.js js/cabinet-config.local.js
 *
 * Get values: Supabase → Project Settings → API
 * See docs/SUPABASE_SETUP.md
 */
window.CABINET_CONFIG = Object.assign({}, window.CABINET_CONFIG || {}, {
  imoexBase: null,
  supportEmail: "hello@trinity.local",
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_ANON_PUBLIC_KEY",
});
