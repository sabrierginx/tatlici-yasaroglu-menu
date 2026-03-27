/**
 * Bu dosyayı kopyalayıp "config.secrets.js" adıyla kaydedin.
 * config.secrets.js Git'e eklenmez (gizli anahtarlar).
 * Supabase: Project Settings → API
 */
(function () {
  var c = window.APP_CONFIG || { supabaseUrl: "", supabaseAnonKey: "" };
  c.supabaseUrl = "https://PROJE_REFERANSI.supabase.co";
  c.supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..._BURAYA_ANON_PUBLIC_KEY";
  window.APP_CONFIG = c;
})();
