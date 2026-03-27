/**
 * Netlify build: ortam değişkenlerinden js/config.generated.js üretir.
 * Netlify → Site configuration → Environment variables:
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 */
const fs = require("fs");
const path = require("path");

function normalizeSupabaseUrl(raw) {
  let s = String(raw || "")
    .trim()
    .replace(/\/+$/, "");
  if (!s) return "";
  if (
    !/^https?:\/\//i.test(s) &&
    /^[a-z0-9-]+\.supabase\.(co|com)$/i.test(s)
  ) {
    s = "https://" + s;
  }
  try {
    const p = new URL(s);
    const h = p.hostname.toLowerCase();
    if (!/^[a-z0-9-]+\.supabase\.(co|com)$/.test(h)) return "";
    return "https://" + h;
  } catch {
    return "";
  }
}

const url = normalizeSupabaseUrl(process.env.SUPABASE_URL || "");
const key = (process.env.SUPABASE_ANON_KEY || "").trim();

const outPath = path.join(__dirname, "js", "config.generated.js");
const body =
  "/* Netlify build — elle düzenlemeyin; Site → Environment variables */\n" +
  "(function () {\n" +
  "  var c = window.APP_CONFIG || { supabaseUrl: '', supabaseAnonKey: '' };\n" +
  "  c.supabaseUrl = " +
  JSON.stringify(url) +
  ";\n" +
  "  c.supabaseAnonKey = " +
  JSON.stringify(key) +
  ";\n" +
  "  window.APP_CONFIG = c;\n" +
  "})();\n";

fs.writeFileSync(outPath, body, "utf8");
console.log("build-inject: config.generated.js yazıldı, SUPABASE_URL tanımlı:", !!url);
