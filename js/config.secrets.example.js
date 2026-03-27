/**
 * İsteğe bağlı yerel test: kopyalayıp config.secrets.js yapın (.gitignore).
 * Canlı sitede Netlify ortam değişkenleri kullanılır — ADMIN-KURULUM.txt.
 */
(function () {
  var c = window.APP_CONFIG || { supabaseUrl: "", supabaseAnonKey: "" };
  c.supabaseUrl = "https://PROJE_REFERANSI.supabase.co";
  c.supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..._BURAYA_ANON_PUBLIC_KEY";
  window.APP_CONFIG = c;
})();
