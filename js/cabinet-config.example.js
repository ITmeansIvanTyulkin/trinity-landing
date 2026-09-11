/**
 * Example cabinet config — copy to cabinet-config.local.js and fill in.
 *
 *   cp js/cabinet-config.example.js js/cabinet-config.local.js
 *
 * Get values: Supabase → Project Settings → API
 * See docs/SUPABASE_SETUP.md
 */
window.CABINET_CONFIG = Object.assign({}, window.CABINET_CONFIG || {}, {
  /* Local Instance — enables regime + paper journal in cabinet / invest chart */
  imoexBase: "http://127.0.0.1:8080",
  /* Optional ISS reverse-proxy. Direct iss.moex.com often TLS-timeouts; default fallback is r.jina.ai */
  /* issBase: "https://iss.moex.com/iss", */
  /* issReader: "https://r.jina.ai/", */
  /* Optional HTML proxy for Smart-Lab / e-disclosure if reader blocked */
  /* fundProxy: "https://your-proxy.example/{url}", */
  /* fundReader: "https://r.jina.ai/", */
  supportEmail: "info@trinity.trading",
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_ANON_PUBLIC_KEY",
});
