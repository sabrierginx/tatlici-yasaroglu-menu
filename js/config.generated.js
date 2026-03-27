/* Yerel / boş şablon. Netlify her yayında build-inject.js ile üzerine yazar. */
(function () {
  var c = window.APP_CONFIG || { supabaseUrl: "", supabaseAnonKey: "" };
  c.supabaseUrl = c.supabaseUrl || "";
  c.supabaseAnonKey = c.supabaseAnonKey || "";
  window.APP_CONFIG = c;
})();
