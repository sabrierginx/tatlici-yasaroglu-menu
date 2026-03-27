(function () {
  function normalizeSupabaseUrl(raw) {
    var s = String(raw || "")
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
      var p = new URL(s);
      var h = p.hostname.toLowerCase();
      if (!/^[a-z0-9-]+\.supabase\.(co|com)$/.test(h)) return "";
      return "https://" + h;
    } catch (e) {
      return "";
    }
  }

  function escapeHtml(str) {
    if (str == null || str === "") return "";
    var d = document.createElement("div");
    d.textContent = String(str);
    return d.innerHTML;
  }

  function escapeAttr(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function applyShop(shop) {
    if (!shop) return;
    var badge = document.getElementById("shop-badge");
    var name = document.getElementById("shop-name");
    var tag = document.getElementById("shop-tagline");
    var lead = document.getElementById("footer-lead");
    var strong = document.getElementById("footer-strong");
    if (badge) badge.textContent = shop.badge || "QR Menü";
    if (name) name.textContent = shop.name || "";
    if (tag) tag.textContent = shop.tagline || "";
    if (lead) lead.textContent = shop.footerLead || "";
    if (strong) strong.textContent = shop.footerStrong || "";
    if (shop.name) document.title = shop.name + " — Menü";
  }

  function renderPricedItem(item) {
    var img = item.image
      ? '<img class="item-thumb" src="' +
        escapeAttr(item.image) +
        '" alt="" width="52" height="52" loading="lazy" decoding="async" />'
      : "";
    var note = item.note
      ? '<span class="item-note">' + escapeHtml(item.note) + "</span>"
      : "";
    return (
      '<li class="item">' +
      img +
      '<div class="item-body"><span class="item-name">' +
      escapeHtml(item.name) +
      "</span>" +
      note +
      "</div>" +
      '<span class="item-price">' +
      escapeHtml(item.price || "—") +
      "</span></li>"
    );
  }

  function renderFlavorItem(item) {
    var img = item.image
      ? '<img class="item-thumb" src="' +
        escapeAttr(item.image) +
        '" alt="" width="52" height="52" loading="lazy" decoding="async" />'
      : "";
    return (
      '<li class="item item--flavor">' +
      img +
      '<div class="item-body"><span class="item-name">' +
      escapeHtml(item.name) +
      "</span></div></li>"
    );
  }

  function renderSection(sec, index) {
    var id = "sec-" + escapeAttr(sec.id || "s" + index);
    var title = escapeHtml(sec.title || "Bölüm");
    var inner = "";

    if (sec.kind === "dondurma") {
      inner +=
        '<p class="dondurma-fiyatlar">Top <strong>' +
        escapeHtml(sec.topPrice || "—") +
        '</strong><span class="sep">·</span>Porsiyon <strong>' +
        escapeHtml(sec.portionPrice || "—") +
        "</strong></p>";
      inner += '<ul class="menu">';
      (sec.items || []).forEach(function (it) {
        inner += renderFlavorItem(it);
      });
      inner += "</ul>";
    } else {
      inner += '<ul class="menu">';
      (sec.items || []).forEach(function (it) {
        inner += renderPricedItem({
          name: it.name,
          price: it.price,
          note: it.note,
          image: it.image
        });
      });
      inner += "</ul>";
    }

    return (
      '<section aria-labelledby="' +
      id +
      '"><h2 id="' +
      id +
      '">' +
      title +
      "</h2>" +
      inner +
      "</section>"
    );
  }

  function renderSections(sections, mount) {
    if (!mount) return;
    var html = "";
    (sections || []).forEach(function (sec, i) {
      html += renderSection(sec, i);
    });
    mount.innerHTML = html;
  }

  async function loadPayload() {
    var cfg = window.APP_CONFIG || {};
    var url = normalizeSupabaseUrl(cfg.supabaseUrl || "");
    var key = (cfg.supabaseAnonKey || "").trim();
    var keyOk =
      (key.indexOf("eyJ") === 0 && key.length >= 80) ||
      (key.indexOf("sb_publishable_") === 0 && key.length >= 30);
    var cloudOk = url && keyOk;
    if (cloudOk) {
      var rest = url + "/rest/v1/menu_data?id=eq.1&select=payload";
      var r = await fetch(rest, {
        headers: {
          apikey: key,
          Authorization: "Bearer " + key
        }
      });
      if (r.ok) {
        var rows = await r.json();
        var pl = rows && rows[0] && rows[0].payload;
        if (
          pl &&
          Array.isArray(pl.sections) &&
          pl.sections.length > 0
        ) {
          return pl;
        }
      }
    }
    var jsonHref =
      window.location.protocol === "file:"
        ? new URL("data/menu.json", window.location.href).href
        : new URL("/data/menu.json", window.location.origin).href;
    var r2 = await fetch(jsonHref);
    if (!r2.ok) throw new Error("menu.json");
    return r2.json();
  }

  async function init() {
    var mount = document.getElementById("menu-sections");
    if (!mount) return;
    try {
      var payload = await loadPayload();
      applyShop(payload.shop);
      renderSections(payload.sections, mount);
    } catch (e) {
      console.error(e);
      mount.innerHTML =
        '<p class="menu-error" style="text-align:center;color:#8b2942;padding:1rem;">Menü yüklenemedi. <code>data/menu.json</code> veya Supabase bağlantısını kontrol edin.</p>';
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
