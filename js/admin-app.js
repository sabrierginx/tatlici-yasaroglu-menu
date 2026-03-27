import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm";

const cfg = window.APP_CONFIG || {};

/** Protokolsüz veya http ile girilen Supabase Project URL’lerini https + kök adrese çevirir. */
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

function isCloudConfigured(c) {
  const u = normalizeSupabaseUrl(c.supabaseUrl || "");
  const k = (c.supabaseAnonKey || "").trim();
  if (!u || !k) return false;
  const okKey =
    (k.startsWith("eyJ") && k.length >= 80) ||
    (k.startsWith("sb_publishable_") && k.length >= 30);
  return okKey;
}

const hasCloud = isCloudConfigured(cfg);

let supabase = null;
let offlineMode = false;
let workingPayload = null;

const $ = (id) => document.getElementById(id);

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
  const r = await fetch("data/menu.json");
  if (!r.ok) throw new Error("menu.json okunamadı");
  return r.json();
}

function showLogin() {
  $("login-wrap").classList.remove("hidden");
  $("editor-wrap").classList.add("hidden");
  $("btn-reload").classList.add("hidden");
  $("btn-logout").classList.add("hidden");
  $("btn-save-cloud").classList.add("hidden");
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
}

function uid() {
  return "x" + Math.random().toString(36).slice(2, 11);
}

function collectPayload() {
  const shop = {
    badge: $("shop-badge").value.trim(),
    name: $("shop-name").value.trim(),
    tagline: $("shop-tagline").value.trim(),
    footerLead: $("footer-lead").value.trim(),
    footerStrong: $("footer-strong").value.trim()
  };
  const sections = [];
  $("sections-mount").querySelectorAll("[data-section-idx]").forEach((el) => {
    const idx = parseInt(el.getAttribute("data-section-idx"), 10);
    const title = el.querySelector(".sec-title").value.trim();
    const kind = el.querySelector(".sec-kind").value;
    const sid = el.getAttribute("data-section-id") || uid();
    if (kind === "dondurma") {
      const sec = {
        id: sid,
        title: title || "Dondurma",
        kind: "dondurma",
        topPrice: el.querySelector(".sec-top-price").value.trim() || "—",
        portionPrice: el.querySelector(".sec-portion-price").value.trim() || "—",
        items: []
      };
      el.querySelectorAll("[data-item-row]").forEach((row) => {
        const name = row.querySelector(".item-name").value.trim();
        if (!name) return;
        sec.items.push({
          name,
          image: row.querySelector(".item-image-url").value.trim() || ""
        });
      });
      sections.push(sec);
    } else {
      const sec = {
        id: sid,
        title: title || "Menü",
        kind: "priced",
        items: []
      };
      el.querySelectorAll("[data-item-row]").forEach((row) => {
        const name = row.querySelector(".item-name").value.trim();
        if (!name) return;
        sec.items.push({
          name,
          price: row.querySelector(".item-price").value.trim() || "—",
          note: row.querySelector(".item-note").value.trim(),
          image: row.querySelector(".item-image-url").value.trim() || ""
        });
      });
      sections.push(sec);
    }
  });
  return { shop, sections };
}

function renderItemRowPriced(item, mount, onRemove) {
  const row = document.createElement("div");
  row.className = "item-row";
  row.setAttribute("data-item-row", "1");
  row.innerHTML =
    '<div class="thumb-cell">' +
    '<img class="thumb-preview" alt="" />' +
    '<input type="file" accept="image/*" class="item-file" />' +
    '<label style="margin-top:0.35rem">Görsel URL</label>' +
    '<input type="text" class="item-image-url" placeholder="https://..." />' +
    "</div>" +
    "<div><label>Ürün adı</label><input type=\"text\" class=\"item-name\" /></div>" +
    "<div><label>Fiyat</label><input type=\"text\" class=\"item-price\" placeholder=\"₺100\" /></div>" +
    "<div><label>Not (isteğe bağlı)</label><input type=\"text\" class=\"item-note\" /></div>" +
    '<div><button type="button" class="btn-danger btn-remove-item">Sil</button></div>';
  row.querySelector(".item-name").value = item.name || "";
  row.querySelector(".item-price").value = item.price || "";
  row.querySelector(".item-note").value = item.note || "";
  const urlInput = row.querySelector(".item-image-url");
  urlInput.value = item.image || "";
  const img = row.querySelector(".thumb-preview");
  if (item.image) {
    img.src = item.image;
    img.style.display = "block";
  } else {
    img.style.display = "none";
  }
  row.querySelector(".btn-remove-item").addEventListener("click", () => {
    row.remove();
    onRemove();
  });
  row.querySelector(".item-file").addEventListener("change", async (ev) => {
    const f = ev.target.files[0];
    if (!f || !supabase || offlineMode) {
      if (offlineMode && f) {
        alert("Görsel yüklemek için Supabase ayarlayın veya görseli başka yere yükleyip URL’yi yapıştırın.");
      }
      ev.target.value = "";
      return;
    }
    const path = "p/" + Date.now() + "-" + f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { error } = await supabase.storage.from("menu-images").upload(path, f, {
      upsert: true,
      contentType: f.type || undefined
    });
    if (error) {
      alert("Yükleme hatası: " + error.message);
      return;
    }
    const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
    const pub = data.publicUrl;
    urlInput.value = pub;
    img.src = pub;
    img.style.display = "block";
    ev.target.value = "";
  });
  mount.appendChild(row);
}

function renderItemRowDondurma(item, mount, onRemove) {
  const row = document.createElement("div");
  row.className = "item-row dondurma";
  row.setAttribute("data-item-row", "1");
  row.innerHTML =
    '<div class="thumb-cell">' +
    '<img class="thumb-preview" alt="" />' +
    '<input type="file" accept="image/*" class="item-file" />' +
    '<label style="margin-top:0.35rem">Görsel URL</label>' +
    '<input type="text" class="item-image-url" placeholder="https://..." />' +
    "</div>" +
    "<div><label>Çeşit adı</label><input type=\"text\" class=\"item-name\" /></div>" +
    '<div><button type="button" class="btn-danger btn-remove-item">Sil</button></div>';
  row.querySelector(".item-name").value = item.name || "";
  const urlInput = row.querySelector(".item-image-url");
  urlInput.value = item.image || "";
  const img = row.querySelector(".thumb-preview");
  if (item.image) {
    img.src = item.image;
    img.style.display = "block";
  } else {
    img.style.display = "none";
  }
  row.querySelector(".btn-remove-item").addEventListener("click", () => {
    row.remove();
    onRemove();
  });
  row.querySelector(".item-file").addEventListener("change", async (ev) => {
    const f = ev.target.files[0];
    if (!f || !supabase || offlineMode) {
      if (offlineMode && f) {
        alert("Görsel yüklemek için Supabase ayarlayın veya URL kullanın.");
      }
      ev.target.value = "";
      return;
    }
    const path = "p/" + Date.now() + "-" + f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { error } = await supabase.storage.from("menu-images").upload(path, f, {
      upsert: true,
      contentType: f.type || undefined
    });
    if (error) {
      alert("Yükleme hatası: " + error.message);
      return;
    }
    const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
    urlInput.value = data.publicUrl;
    img.src = data.publicUrl;
    img.style.display = "block";
    ev.target.value = "";
  });
  mount.appendChild(row);
}

function renderSectionEditor(sec, index) {
  const wrap = document.createElement("div");
  wrap.className = "section-editor";
  wrap.setAttribute("data-section-idx", String(index));
  wrap.setAttribute("data-section-id", sec.id || uid());
  const isD = sec.kind === "dondurma";
  wrap.innerHTML =
    '<div class="section-head">' +
    "<div><label>Bölüm başlığı</label><input type=\"text\" class=\"sec-title\" /></div>" +
    '<div><label>Tür</label><select class="sec-kind">' +
    '<option value="priced">Fiyatlı liste (baklava, içecek vb.)</option>' +
    '<option value="dondurma">Dondurma (top / porsiyon + çeşitler)</option>' +
    "</select></div>" +
    '<div><button type="button" class="btn-danger btn-remove-section">Bölümü sil</button></div>' +
    "</div>" +
    '<div class="dondurma-prices row2 hidden">' +
    "<div><label>Top fiyat</label><input type=\"text\" class=\"sec-top-price\" /></div>" +
    "<div><label>Porsiyon fiyat</label><input type=\"text\" class=\"sec-portion-price\" /></div>" +
    "</div>" +
    '<div class="items-mount"></div>' +
    '<button type="button" class="btn btn-add-item">+ Ürün / çeşit ekle</button>';
  wrap.querySelector(".sec-title").value = sec.title || "";
  wrap.querySelector(".sec-kind").value = isD ? "dondurma" : "priced";
  const dp = wrap.querySelector(".dondurma-prices");
  const kindSel = wrap.querySelector(".sec-kind");
  const itemsMount = wrap.querySelector(".items-mount");

  kindSel.addEventListener("change", () => {
    sec.kind = kindSel.value === "dondurma" ? "dondurma" : "priced";
    itemsMount.innerHTML = "";
    const d = kindSel.value === "dondurma";
    dp.classList.toggle("hidden", !d);
    if (d) {
      wrap.querySelector(".sec-top-price").value = "";
      wrap.querySelector(".sec-portion-price").value = "";
      renderItemRowDondurma({ name: "" }, itemsMount, () => {});
    } else {
      renderItemRowPriced({ name: "" }, itemsMount, () => {});
    }
  });

  wrap.querySelector(".btn-remove-section").addEventListener("click", () => {
    if (confirm("Bu bölüm silinsin mi?")) wrap.remove();
  });

  wrap.querySelector(".btn-add-item").addEventListener("click", () => {
    if (kindSel.value === "dondurma") {
      renderItemRowDondurma({ name: "" }, itemsMount, () => {});
    } else {
      renderItemRowPriced({ name: "" }, itemsMount, () => {});
    }
  });

  if (isD) {
    dp.classList.remove("hidden");
    wrap.querySelector(".sec-top-price").value = sec.topPrice || "";
    wrap.querySelector(".sec-portion-price").value = sec.portionPrice || "";
  }
  (sec.items || (isD ? [{ name: "" }] : [{ name: "" }])).forEach((it) => {
    if (isD) {
      renderItemRowDondurma(it, itemsMount, () => {});
    } else {
      renderItemRowPriced(it, itemsMount, () => {});
    }
  });
  if (!itemsMount.children.length) {
    if (isD) renderItemRowDondurma({ name: "" }, itemsMount, () => {});
    else renderItemRowPriced({ name: "" }, itemsMount, () => {});
  }

  return wrap;
}

function renderAllSections() {
  const mount = $("sections-mount");
  mount.innerHTML = "";
  (workingPayload.sections || []).forEach((sec, i) => {
    mount.appendChild(renderSectionEditor(sec, i));
  });
}

function fillShopForm() {
  const s = workingPayload.shop || {};
  $("shop-badge").value = s.badge || "";
  $("shop-name").value = s.name || "";
  $("shop-tagline").value = s.tagline || "";
  $("footer-lead").value = s.footerLead || "";
  $("footer-strong").value = s.footerStrong || "";
}

async function loadPayloadIntoEditor() {
  if (offlineMode || !hasCloud) {
    workingPayload = await fetchLocalJson();
  } else {
    const { data, error } = await supabase
      .from("menu_data")
      .select("payload")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    if (
      data &&
      data.payload &&
      Array.isArray(data.payload.sections) &&
      data.payload.sections.length > 0
    ) {
      workingPayload = data.payload;
    } else {
      workingPayload = await fetchLocalJson();
    }
  }
  fillShopForm();
  renderAllSections();
}

function downloadJson() {
  const payload = collectPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const a = document.createElement("a");
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
  const payload = collectPayload();
  const { error } = await supabase.from("menu_data").upsert(
    {
      id: 1,
      payload,
      updated_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );
  if (error) {
    alert("Kayıt hatası: " + error.message);
    return;
  }
  workingPayload = payload;
  $("editor-msg").textContent = "Menü Supabase’e kaydedildi. Ana sayfa birkaç saniye içinde güncel veriyi çeker.";
  $("editor-msg").classList.remove("hidden");
}

function startOfflineEditor() {
  offlineMode = true;
  $("no-cloud-msg").classList.remove("hidden");
  $("auth-status").textContent = "Yerel düzenleme (JSON indir)";
  showEditor();
  loadPayloadIntoEditor().catch((e) => {
    alert(String(e.message || e));
  });
}

$("btn-offline").addEventListener("click", () => {
  startOfflineEditor();
});

$("btn-add-section").addEventListener("click", () => {
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
$("btn-save-cloud").addEventListener("click", saveCloud);

$("btn-reload").addEventListener("click", () => {
  loadPayloadIntoEditor().catch((e) => alert(String(e.message || e)));
});

$("btn-logout").addEventListener("click", async () => {
  if (supabase) await supabase.auth.signOut();
  offlineMode = false;
  showLogin();
});

function loginErrorTr(msg) {
  const m = (msg || "").toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid_credentials"))
    return "E-posta veya şifre hatalı. Supabase’de kullanıcı oluşturduğunuzdan emin olun (admin-giris-bilgileri.txt).";
  if (m.includes("email not confirmed"))
    return "E-posta doğrulanmamış. Supabase → Authentication → Providers → Email veya gelen kutunuzdaki onay linki.";
  if (m.includes("fetch") || m.includes("network"))
    return "Ağ hatası. Supabase URL’sini ve interneti kontrol edin.";
  return msg || "Bilinmeyen hata";
}

$("form-login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!hasCloud) {
    alert(
      "Supabase bağlı değil.\n\nNetlify → Site configuration → Environment variables:\n• SUPABASE_URL\n• SUPABASE_ANON_KEY\n\ndeğerlerini ekleyip Deploy triggers → Clear cache and deploy site yapın.\n\nDetay: NETLIFY-SUPABASE.txt"
    );
    return;
  }
  const email = $("email").value.trim();
  const password = $("password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    alert("Giriş başarısız: " + loginErrorTr(error.message));
    return;
  }
  offlineMode = false;
  $("auth-status").textContent = "Giriş yapıldı";
  showEditor();
  try {
    await loadPayloadIntoEditor();
  } catch (e) {
    alert(String(e.message || e));
  }
});

if (!hasCloud) {
  $("no-cloud-msg").classList.remove("hidden");
  $("auth-status").textContent = "Supabase yapılandırılmadı";
}

const supabaseUrlNorm = normalizeSupabaseUrl(cfg.supabaseUrl || "");
supabase = hasCloud
  ? createClient(supabaseUrlNorm, cfg.supabaseAnonKey.trim(), {
      auth: { persistSession: true, autoRefreshToken: true }
    })
  : null;

if (supabase) {
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session && !offlineMode) {
      $("auth-status").textContent = session.user.email || "Oturum açık";
      showEditor();
      try {
        await loadPayloadIntoEditor();
      } catch (e) {
        console.error(e);
      }
    }
  });
  const { data: { session } } = await supabase.auth.getSession();
  if (session && !offlineMode) {
    $("auth-status").textContent = session.user.email || "Oturum açık";
    showEditor();
    loadPayloadIntoEditor().catch(console.error);
  }
}
