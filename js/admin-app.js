/**
 * Admin panel — klasik script (ES modül değil). Supabase UMD önce yüklenir.
 */
(function () {
  "use strict";

  var cfg = window.APP_CONFIG || {};

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

  function isCloudConfigured(c) {
    var u = normalizeSupabaseUrl(c.supabaseUrl || "");
    var k = (c.supabaseAnonKey || "").trim();
    if (!u || !k) return false;
    return (
      (k.indexOf("eyJ") === 0 && k.length >= 80) ||
      (k.indexOf("sb_publishable_") === 0 && k.length >= 30)
    );
  }

  var hasCloud = isCloudConfigured(cfg);

  var supabase = null;
  var offlineMode = false;
  var workingPayload = null;

  function $(id) {
    return document.getElementById(id);
  }

  function defaultPayload() {
    return {
      shop: {
        badge: "QR Menü",
        name: "",
        tagline: "",
        footerLead: "",
        footerStrong: ""
      },
      sections: []
    };
  }

  async function fetchLocalJson() {
    var urls = [];
    if (window.location.protocol === "file:") {
      urls.push(new URL("data/menu.json", window.location.href).href);
    } else {
      var o = window.location.origin;
      urls.push(new URL("/data/menu.json", o).href);
      urls.push(new URL("/js/menu-fallback.json", o).href);
      var path = window.location.pathname || "/";
      var dir = path.replace(/[^/]*$/, "");
      urls.push(new URL("data/menu.json", o + (dir || "/")).href);
    }
    var lastErr = null;
    for (var i = 0; i < urls.length; i++) {
      try {
        var r = await fetch(urls[i], { cache: "no-store" });
        if (r.ok) return await r.json();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("menu.json yüklenemedi");
  }

  function payloadHasMenuSections(p) {
    return (
      p &&
      typeof p === "object" &&
      Array.isArray(p.sections) &&
      p.sections.length > 0
    );
  }

  function normalizeRemotePayload(raw) {
    if (raw == null) return null;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }
    return typeof raw === "object" ? raw : null;
  }

  function showBoot(on) {
    var el = $("boot-screen");
    if (!el) return;
    el.classList.toggle("hidden", !on);
  }

  function showLogin() {
    $("login-wrap").classList.remove("hidden");
    $("editor-wrap").classList.add("hidden");
    $("btn-reload").classList.add("hidden");
    $("btn-logout").classList.add("hidden");
    $("btn-save-cloud").classList.add("hidden");
    showBoot(false);
  }

  function showEditor() {
    $("login-wrap").classList.add("hidden");
    $("editor-wrap").classList.remove("hidden");
    $("btn-reload").classList.remove("hidden");
    if (hasCloud && !offlineMode) {
      $("btn-logout").classList.remove("hidden");
      $("btn-save-cloud").classList.remove("hidden");
    } else {
      $("btn-logout").classList.add("hidden");
      $("btn-save-cloud").classList.add("hidden");
    }
    showBoot(false);
  }

  function uid() {
    return "x" + Math.random().toString(36).slice(2, 11);
  }

  function collectPayload() {
    var shop = {
      badge: $("shop-badge").value.trim(),
      name: $("shop-name").value.trim(),
      tagline: $("shop-tagline").value.trim(),
      footerLead: $("footer-lead").value.trim(),
      footerStrong: $("footer-strong").value.trim()
    };
    var sections = [];
    $("sections-mount").querySelectorAll("[data-section-idx]").forEach(function (el) {
      var title = el.querySelector(".sec-title").value.trim();
      var kind = el.querySelector(".sec-kind").value;
      var sid = el.getAttribute("data-section-id") || uid();
      if (kind === "dondurma") {
        var sec = {
          id: sid,
          title: title || "Dondurma",
          kind: "dondurma",
          topPrice: el.querySelector(".sec-top-price").value.trim() || "—",
          portionPrice: el.querySelector(".sec-portion-price").value.trim() || "—",
          items: []
        };
        el.querySelectorAll("[data-item-row]").forEach(function (row) {
          var name = row.querySelector(".item-name").value.trim();
          if (!name) return;
          sec.items.push({
            name: name,
            image: row.querySelector(".item-image-url").value.trim() || ""
          });
        });
        sections.push(sec);
      } else {
        var sec2 = {
          id: sid,
          title: title || "Menü",
          kind: "priced",
          items: []
        };
        el.querySelectorAll("[data-item-row]").forEach(function (row) {
          var name2 = row.querySelector(".item-name").value.trim();
          if (!name2) return;
          sec2.items.push({
            name: name2,
            price: row.querySelector(".item-price").value.trim() || "—",
            note: row.querySelector(".item-note").value.trim(),
            image: row.querySelector(".item-image-url").value.trim() || ""
          });
        });
        sections.push(sec2);
      }
    });
    return { shop: shop, sections: sections };
  }

  function renderItemRowPriced(item, mount, onRemove) {
    var row = document.createElement("div");
    row.className = "item-row";
    row.setAttribute("data-item-row", "1");
    row.innerHTML =
      '<div class="thumb-cell">' +
      '<img class="thumb-preview" alt="" />' +
      '<input type="file" accept="image/*" class="item-file" />' +
      '<label style="margin-top:0.35rem">Görsel URL</label>' +
      '<input type="text" class="item-image-url" placeholder="https://..." />' +
      "</div>" +
      '<div><label>Ürün adı</label><input type="text" class="item-name" /></div>' +
      '<div><label>Fiyat</label><input type="text" class="item-price" inputmode="decimal" autocomplete="off" placeholder="örn. ₺85" /></div>' +
      '<div><label>Not (isteğe bağlı)</label><input type="text" class="item-note" /></div>' +
      '<div><button type="button" class="btn-danger btn-remove-item">Sil</button></div>';
    row.querySelector(".item-name").value = item.name || "";
    row.querySelector(".item-price").value = item.price || "";
    row.querySelector(".item-note").value = item.note || "";
    var urlInput = row.querySelector(".item-image-url");
    urlInput.value = item.image || "";
    var img = row.querySelector(".thumb-preview");
    if (item.image) {
      img.src = item.image;
      img.style.display = "block";
    } else {
      img.style.display = "none";
    }
    row.querySelector(".btn-remove-item").addEventListener("click", function () {
      row.remove();
      onRemove();
    });
    row.querySelector(".item-file").addEventListener("change", function (ev) {
      var f = ev.target.files[0];
      if (!f || !supabase || offlineMode) {
        if (offlineMode && f) {
          alert(
            "Görsel yüklemek için Supabase ayarlayın veya görseli başka yere yükleyip URL’yi yapıştırın."
          );
        }
        ev.target.value = "";
        return;
      }
      (async function () {
        var path =
          "p/" + Date.now() + "-" + f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        var up = await supabase.storage.from("menu-images").upload(path, f, {
          upsert: true,
          contentType: f.type || undefined
        });
        if (up.error) {
          alert("Yükleme hatası: " + up.error.message);
          return;
        }
        var pub = supabase.storage.from("menu-images").getPublicUrl(path);
        urlInput.value = pub.data.publicUrl;
        img.src = pub.data.publicUrl;
        img.style.display = "block";
        ev.target.value = "";
      })();
    });
    mount.appendChild(row);
  }

  function renderItemRowDondurma(item, mount, onRemove) {
    var row = document.createElement("div");
    row.className = "item-row dondurma";
    row.setAttribute("data-item-row", "1");
    row.innerHTML =
      '<div class="thumb-cell">' +
      '<img class="thumb-preview" alt="" />' +
      '<input type="file" accept="image/*" class="item-file" />' +
      '<label style="margin-top:0.35rem">Görsel URL</label>' +
      '<input type="text" class="item-image-url" placeholder="https://..." />' +
      "</div>" +
      '<div><label>Çeşit adı</label><input type="text" class="item-name" /></div>' +
      '<div><button type="button" class="btn-danger btn-remove-item">Sil</button></div>';
    row.querySelector(".item-name").value = item.name || "";
    var urlInput = row.querySelector(".item-image-url");
    urlInput.value = item.image || "";
    var img = row.querySelector(".thumb-preview");
    if (item.image) {
      img.src = item.image;
      img.style.display = "block";
    } else {
      img.style.display = "none";
    }
    row.querySelector(".btn-remove-item").addEventListener("click", function () {
      row.remove();
      onRemove();
    });
    row.querySelector(".item-file").addEventListener("change", function (ev) {
      var f = ev.target.files[0];
      if (!f || !supabase || offlineMode) {
        if (offlineMode && f) {
          alert("Görsel yüklemek için Supabase ayarlayın veya URL kullanın.");
        }
        ev.target.value = "";
        return;
      }
      (async function () {
        var path =
          "p/" + Date.now() + "-" + f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        var up = await supabase.storage.from("menu-images").upload(path, f, {
          upsert: true,
          contentType: f.type || undefined
        });
        if (up.error) {
          alert("Yükleme hatası: " + up.error.message);
          return;
        }
        var pub = supabase.storage.from("menu-images").getPublicUrl(path);
        urlInput.value = pub.data.publicUrl;
        img.src = pub.data.publicUrl;
        img.style.display = "block";
        ev.target.value = "";
      })();
    });
    mount.appendChild(row);
  }

  function renderSectionEditor(sec, index) {
    var wrap = document.createElement("div");
    wrap.className = "section-editor";
    wrap.setAttribute("data-section-idx", String(index));
    wrap.setAttribute("data-section-id", sec.id || uid());
    var isD = sec.kind === "dondurma";
    wrap.innerHTML =
      '<div class="section-head">' +
      '<div><label>Bölüm başlığı</label><input type="text" class="sec-title" /></div>' +
      '<div><label>Tür</label><select class="sec-kind">' +
      '<option value="priced">Fiyatlı liste (baklava, içecek vb.)</option>' +
      '<option value="dondurma">Dondurma (top / porsiyon + çeşitler)</option>' +
      "</select></div>" +
      '<div><button type="button" class="btn-danger btn-remove-section">Bölümü sil</button></div>' +
      "</div>" +
      '<div class="dondurma-prices row2 hidden">' +
      '<div><label>Top fiyat</label><input type="text" class="sec-top-price" /></div>' +
      '<div><label>Porsiyon fiyat</label><input type="text" class="sec-portion-price" /></div>' +
      "</div>" +
      '<div class="items-mount"></div>' +
      '<button type="button" class="btn btn-add-item">+ Ürün / çeşit ekle</button>';
    wrap.querySelector(".sec-title").value = sec.title || "";
    wrap.querySelector(".sec-kind").value = isD ? "dondurma" : "priced";
    var dp = wrap.querySelector(".dondurma-prices");
    var kindSel = wrap.querySelector(".sec-kind");
    var itemsMount = wrap.querySelector(".items-mount");

    kindSel.addEventListener("change", function () {
      sec.kind = kindSel.value === "dondurma" ? "dondurma" : "priced";
      itemsMount.innerHTML = "";
      var d = kindSel.value === "dondurma";
      dp.classList.toggle("hidden", !d);
      if (d) {
        wrap.querySelector(".sec-top-price").value = "";
        wrap.querySelector(".sec-portion-price").value = "";
        renderItemRowDondurma({ name: "" }, itemsMount, function () {});
      } else {
        renderItemRowPriced({ name: "" }, itemsMount, function () {});
      }
    });

    wrap.querySelector(".btn-remove-section").addEventListener("click", function () {
      if (confirm("Bu bölüm silinsin mi?")) wrap.remove();
    });

    wrap.querySelector(".btn-add-item").addEventListener("click", function () {
      if (kindSel.value === "dondurma") {
        renderItemRowDondurma({ name: "" }, itemsMount, function () {});
      } else {
        renderItemRowPriced({ name: "" }, itemsMount, function () {});
      }
    });

    if (isD) {
      dp.classList.remove("hidden");
      wrap.querySelector(".sec-top-price").value = sec.topPrice || "";
      wrap.querySelector(".sec-portion-price").value = sec.portionPrice || "";
    }
    (sec.items || (isD ? [{ name: "" }] : [{ name: "" }])).forEach(function (it) {
      if (isD) {
        renderItemRowDondurma(it, itemsMount, function () {});
      } else {
        renderItemRowPriced(it, itemsMount, function () {});
      }
    });
    if (!itemsMount.children.length) {
      if (isD) renderItemRowDondurma({ name: "" }, itemsMount, function () {});
      else renderItemRowPriced({ name: "" }, itemsMount, function () {});
    }

    return wrap;
  }

  function renderAllSections() {
    var mount = $("sections-mount");
    mount.innerHTML = "";
    if (!workingPayload) workingPayload = defaultPayload();
    (workingPayload.sections || []).forEach(function (sec, i) {
      mount.appendChild(renderSectionEditor(sec, i));
    });
  }

  function fillShopForm() {
    if (!workingPayload) workingPayload = defaultPayload();
    var s = workingPayload.shop || {};
    $("shop-badge").value = s.badge || "";
    $("shop-name").value = s.name || "";
    $("shop-tagline").value = s.tagline || "";
    $("footer-lead").value = s.footerLead || "";
    $("footer-strong").value = s.footerStrong || "";
  }

  async function loadPayloadIntoEditor() {
    var localSeed;
    try {
      localSeed = await fetchLocalJson();
    } catch (e) {
      console.warn("menu.json:", e);
      localSeed = defaultPayload();
    }

    try {
      if (offlineMode || !hasCloud) {
        workingPayload = localSeed;
      } else {
        var res = await supabase
          .from("menu_data")
          .select("payload")
          .eq("id", 1)
          .maybeSingle();
        if (res.error) throw res.error;
        var remote = normalizeRemotePayload(res.data && res.data.payload);
        if (payloadHasMenuSections(remote)) {
          workingPayload = remote;
        } else {
          workingPayload = {
            shop: Object.assign(
              {},
              localSeed.shop || {},
              remote && typeof remote.shop === "object" ? remote.shop : {}
            ),
            sections: localSeed.sections || []
          };
        }
      }
    } catch (e) {
      console.error(e);
      workingPayload = localSeed;
      alert(
        "Supabase’ten menü okunamadı; yerel şablon kullanılıyor.\n\n" +
          (e && e.message ? e.message : String(e))
      );
    }

    fillShopForm();
    renderAllSections();
  }

  function downloadJson() {
    var payload = collectPayload();
    var blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "menu.json";
    a.click();
    URL.revokeObjectURL(a.href);
    $("editor-msg").textContent =
      "menu.json indirildi. Supabase kullanmıyorsanız bu dosyayı projede data/menu.json ile değiştirip siteyi yeniden yayınlayın.";
    $("editor-msg").classList.remove("hidden");
  }

  async function saveCloud() {
    if (!supabase || offlineMode) return;
    var payload = collectPayload();
    var res = await supabase.from("menu_data").upsert(
      {
        id: 1,
        payload: payload,
        updated_at: new Date().toISOString()
      },
      { onConflict: "id" }
    );
    if (res.error) {
      alert("Kayıt hatası: " + res.error.message);
      return;
    }
    workingPayload = payload;
    $("editor-msg").textContent =
      "Menü Supabase’e kaydedildi. Ana sayfa birkaç saniye içinde güncel veriyi çeker.";
    $("editor-msg").classList.remove("hidden");
  }

  function startOfflineEditor() {
    offlineMode = true;
    $("no-cloud-msg").classList.remove("hidden");
    $("auth-status").textContent = "Yerel düzenleme (JSON indir)";
    showEditor();
    loadPayloadIntoEditor().catch(function (e) {
      alert(String(e.message || e));
    });
  }

  function loginErrorTr(msg) {
    var m = (msg || "").toLowerCase();
    if (m.indexOf("invalid login") !== -1 || m.indexOf("invalid_credentials") !== -1)
      return "E-posta veya şifre hatalı. Supabase’de kullanıcı oluşturduğunuzdan emin olun.";
    if (m.indexOf("email not confirmed") !== -1)
      return "E-posta doğrulanmamış. Supabase → Authentication → Email.";
    if (m.indexOf("fetch") !== -1 || m.indexOf("network") !== -1)
      return "Ağ hatası. Supabase URL’sini ve interneti kontrol edin.";
    return msg || "Bilinmeyen hata";
  }

  function bindUi() {
    $("btn-offline").addEventListener("click", function () {
      startOfflineEditor();
    });

    $("btn-add-section").addEventListener("click", function () {
      if (!workingPayload) workingPayload = defaultPayload();
      if (!workingPayload.sections) workingPayload.sections = [];
      workingPayload.sections.push({
        id: uid(),
        title: "Yeni bölüm",
        kind: "priced",
        items: [{ name: "", price: "", note: "", image: "" }]
      });
      renderAllSections();
    });

    $("btn-download-json").addEventListener("click", downloadJson);
    $("btn-save-cloud").addEventListener("click", function () {
      saveCloud();
    });

    $("btn-reload").addEventListener("click", function () {
      loadPayloadIntoEditor().catch(function (e) {
        alert(String(e.message || e));
      });
    });

    $("btn-logout").addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      (async function () {
        try {
          if (supabase) await supabase.auth.signOut({ scope: "local" });
        } catch (err) {
          console.error(err);
        }
        offlineMode = false;
        showLogin();
      })();
    });

    $("form-login").addEventListener("submit", async function (ev) {
      ev.preventDefault();
      if (!hasCloud) {
        alert(
          "Supabase bağlı değil.\n\nNetlify → Environment variables:\nSUPABASE_URL ve SUPABASE_ANON_KEY ekleyip yeniden yayınlayın."
        );
        return;
      }
      var email = $("email").value.trim();
      var password = $("password").value;
      var sign = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });
      if (sign.error) {
        alert("Giriş başarısız: " + loginErrorTr(sign.error.message));
        return;
      }
      offlineMode = false;
      $("auth-status").textContent = "Giriş yapıldı";
      showEditor();
      try {
        await loadPayloadIntoEditor();
      } catch (err) {
        alert(String(err.message || err));
      }
    });
  }

  async function applySession(session) {
    if (session && !offlineMode) {
      $("auth-status").textContent = session.user.email || "Oturum açık";
      showEditor();
      try {
        await loadPayloadIntoEditor();
      } catch (e) {
        console.error(e);
        alert("Menü yüklenemedi: " + (e && e.message ? e.message : String(e)));
      }
    } else {
      showLogin();
    }
  }

  async function boot() {
    bindUi();

    if (!hasCloud) {
      $("no-cloud-msg").classList.remove("hidden");
      $("auth-status").textContent = "Supabase yapılandırılmadı";
      return;
    }

    var mod;
    try {
      mod = await import(
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm"
      );
    } catch (err) {
      console.error(err);
      alert(
        "Supabase kütüphanesi yüklenemedi. Ağ veya reklam engelleyiciyi kontrol edin."
      );
      showLogin();
      return;
    }
    var createClient = mod.createClient;
    if (!createClient) {
      showLogin();
      return;
    }

    var supabaseUrlNorm = normalizeSupabaseUrl(cfg.supabaseUrl || "");
    supabase = createClient(supabaseUrlNorm, cfg.supabaseAnonKey.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: window.localStorage
      }
    });

    showBoot(true);
    $("login-wrap").classList.add("hidden");
    $("editor-wrap").classList.add("hidden");

    supabase.auth.onAuthStateChange(function (event, session) {
      if (event === "SIGNED_OUT") {
        offlineMode = false;
        showLogin();
        return;
      }
      if (event === "SIGNED_IN" && session && !offlineMode) {
        applySession(session);
      }
    });

    var sessRes = await supabase.auth.getSession();
    var session = sessRes.data && sessRes.data.session;
    await applySession(session);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      boot().catch(function (e) {
        console.error(e);
        showBoot(false);
        showLogin();
        alert("Başlatma hatası: " + (e && e.message ? e.message : String(e)));
      });
    });
  } else {
    boot().catch(function (e) {
      console.error(e);
      showBoot(false);
      showLogin();
      alert("Başlatma hatası: " + (e && e.message ? e.message : String(e)));
    });
  }
})();
