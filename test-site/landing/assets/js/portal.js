(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const endpoint = file => new URL(`/yardimci-asistan/api/dealer/${file}.php`, window.location.origin);
  const headers = { "Content-Type": "application/json", "X-YA-Dealer": "1" };
  let invite = "", accessId = "", catalog = null, cart = [], pending = null, busy = false, retryUntil = 0, timer, generation = 0;
  const cartKey = () => `ya:dealer:${window.location.pathname}:${accessId}:cart:v1`;
  const attemptKey = () => `${cartKey()}:attempt`;
  const read = (storage, key) => { try { return JSON.parse(window[storage].getItem(key)); } catch { return null; } };
  const write = (storage, key, value) => { try { if (value === null) window[storage].removeItem(key); else window[storage].setItem(key, JSON.stringify(value)); } catch { /* storage is optional */ } };
  const money = (value, currency) => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value);
  const element = (tag, text, className = "") => { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; };
  const button = (text, action) => { const node = element("button", text, "quiet"); node.type = "button"; node.addEventListener("click", action); return node; };
  function captureInvite() {
    if (!window.location.hash) return;
    invite = new URLSearchParams(window.location.hash.slice(1)).get("invite") || "";
    window.history.replaceState(null, "", window.location.pathname);
  }
  function clearPrivateState() {
    generation += 1;
    if (accessId) { write("localStorage", cartKey(), null); write("sessionStorage", attemptKey(), null); }
    catalog = null; cart = []; pending = null; accessId = "";
    $("checkout-form").reset(); $("product-grid").replaceChildren(); $("cart-lines").replaceChildren();
    $("dealer-store").hidden = true; $("success").hidden = true; $("reference").textContent = "";
    $("dealer-name").textContent = ""; $("dealer-name").hidden = true; $("logout").hidden = true;
    $("portal-title").textContent = "Bayi erişimi gerekli";
  }
  function restoreCart() {
    const stored = read("localStorage", cartKey());
    cart = Array.isArray(stored) ? stored.filter(row => row && typeof row.productId === "string" && Number.isFinite(row.quantity) && row.quantity > 0 && row.quantity <= 1000).slice(0, 50)
      .filter((row, index, rows) => rows.findIndex(other => other.productId === row.productId) === index)
      .map(row => ({ productId: row.productId, quantity: Math.round(row.quantity * 10000) / 10000 })).filter(row => row.quantity > 0) : [];
    const attempt = read("sessionStorage", attemptKey());
    pending = attempt && typeof attempt.key === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(attempt.key) && ["pickup", "shipping"].includes(attempt.method) ? { key: attempt.key, method: attempt.method, payload: null } : null;
    if (pending) $("submission-message").textContent = "Önceki siparişin sonucunu doğrulamak için aynı teslimat ve not bilgilerini tekrar girin.";
  }
  function persistCart() { write("localStorage", cartKey(), cart.length ? cart : null); }
  function validCart() {
    if (!catalog || !cart.length || cart.reduce((sum, row) => sum + row.quantity, 0) > 10000) return false;
    const products = cart.map(row => catalog.products.find(product => product.product_id === row.productId));
    return products.every(Boolean) && new Set(products.map(product => product.currency)).size === 1;
  }
  function controls() {
    $("checkout-fields").disabled = busy || Boolean(pending?.payload) || !catalog;
    $("submit-order").disabled = busy || Date.now() < retryUntil || (!pending && !validCart());
    $("submit-order").textContent = busy ? "Gönderiliyor…" : pending ? "Aynı siparişi tekrar dene" : "Siparişi gönder";
    $("clear-cart").disabled = !cart.length || busy || Boolean(pending);
    $("refresh").disabled = busy; $("logout").disabled = busy;
  }
  function render() {
    $("product-grid").replaceChildren(); $("cart-lines").replaceChildren();
    if (!catalog) { controls(); return; }
    for (const product of catalog.products) {
      const card = element("article", "", "product-card");
      if (product.image_url) {
        const media = element("div", "", "product-media"); const image = document.createElement("img");
        image.src = product.image_url; image.alt = ""; image.loading = "lazy"; image.referrerPolicy = "no-referrer"; media.append(image); card.append(media);
      }
      const body = element("div", "", "product-body"); body.append(element("h3", product.name), element("p", product.description, "description"), element("p", `${money(product.price, product.currency)} / ${product.unit}`, "price"));
      const add = button("Sepete ekle", () => change(product.product_id, (cart.find(row => row.productId === product.product_id)?.quantity || 0) + 1));
      add.disabled = busy || Boolean(pending); body.append(add); card.append(body); $("product-grid").append(card);
    }
    let total = 0, currency = "TRY";
    for (const row of cart) {
      const product = catalog.products.find(product => product.product_id === row.productId);
      const line = element("li", "", "cart-line"); line.append(element("strong", product?.name || "Artık sunulmayan ürün"));
      const quantities = element("div", "", "quantity-controls");
      const input = document.createElement("input"); input.type = "number"; input.min = "0.0001"; input.max = "1000"; input.step = "0.0001";
      input.value = row.quantity; input.setAttribute("aria-label", `${product?.name || "Ürün"} miktarı`);
      input.addEventListener("change", () => change(row.productId, Number(input.value)));
      const minus = button("−", () => change(row.productId, Math.max(0, row.quantity - 1))); minus.setAttribute("aria-label", `${product?.name || "Ürün"} miktarını azalt`);
      const plus = button("+", () => change(row.productId, row.quantity + 1)); plus.setAttribute("aria-label", `${product?.name || "Ürün"} miktarını artır`);
      const remove = button("Kaldır", () => change(row.productId, 0));
      for (const node of [minus, input, plus, remove]) { node.disabled = busy || Boolean(pending); quantities.append(node); }
      if (product) { const subtotal = Math.round(product.price * row.quantity * 100) / 100; total += subtotal; currency = product.currency; line.append(element("p", money(subtotal, currency))); }
      line.append(quantities); $("cart-lines").append(line);
    }
    $("subtotal").textContent = cart.length ? validCart() ? `Sepet toplamı: ${money(total, currency)}` : "Sepetteki ürünleri ve para birimlerini kontrol edin." : "Sepetiniz boş.";
    $("catalog-state").textContent = catalog.products.length ? "" : "Henüz bayi ürünü bulunmuyor.";
    controls();
  }
  function change(productId, quantity) {
    if (pending || busy) return;
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1000) { render(); return; }
    quantity = Math.round(quantity * 10000) / 10000;
    const remaining = cart.filter(row => row.productId !== productId);
    if (quantity > 0 && remaining.length < 50) remaining.push({ productId, quantity });
    cart = remaining; persistCart(); render();
  }
  function deliveryControls() {
    const shipping = $("delivery-method").value === "shipping";
    $("shipping-fields").hidden = !shipping;
    for (const key of ["recipientName", "addressLine1", "district", "city", "countryCode"]) $("delivery-" + key).required = shipping;
  }
  async function loadCatalog() {
    const started = generation; const owner = accessId;
    try {
      const response = await fetch(endpoint("catalog"), { cache: "no-store", credentials: "same-origin" });
      if (started !== generation || owner !== accessId) return;
      if (response.status === 401) { clearPrivateState(); $("portal-message").textContent = "Bayi erişimi gerekli."; return; }
      const result = await response.json(); if (!response.ok) throw new Error("unavailable");
      if (started !== generation || owner !== accessId) return;
      catalog = result.catalog;
      const selected = pending?.method || $("delivery-method").value;
      $("delivery-method").replaceChildren();
      const methods = pending && !catalog.delivery_methods.includes(pending.method) ? [...catalog.delivery_methods, pending.method] : catalog.delivery_methods;
      for (const method of methods) { const option = element("option", method === "shipping" ? "Kargo ile gönderim" : "İşletmeden teslim"); option.value = method; $("delivery-method").append(option); }
      if (methods.includes(selected)) $("delivery-method").value = selected;
      deliveryControls(); $("dealer-store").hidden = !$("success").hidden;
      render();
    } catch { if (started === generation) $("portal-message").textContent = "Bayi kataloğu alınamadı. Lütfen yeniden deneyin."; }
  }
  async function session() {
    const started = generation;
    try {
      const response = await fetch(endpoint("session"), { cache: "no-store", credentials: "same-origin" });
      if (response.status !== 401 && !response.ok) throw new Error("unavailable");
      const data = await response.json();
      if (started !== generation) return;
      if (data.authenticated === true && data.dealer) {
        if (accessId && accessId !== data.dealer.access_id) clearPrivateState();
        accessId = data.dealer.access_id; restoreCart();
        $("portal-title").textContent = "Bayi paneli"; $("dealer-name").textContent = data.dealer.display_name;
        $("dealer-name").hidden = false; $("logout").hidden = false; $("claim").hidden = true;
        $("portal-message").textContent = "Bayi panelinize hoş geldiniz."; $("dealer-store").hidden = false; render(); await loadCatalog();
      } else {
        clearPrivateState(); $("claim").hidden = !invite;
        $("portal-message").textContent = invite ? "Tek kullanımlık davetinizi kullanarak giriş yapın." : "İşletmeden bayi davet bağlantısı isteyin.";
      }
    } catch { $("portal-message").textContent = "Erişim durumu alınamadı. Lütfen yeniden deneyin."; }
  }
  $("claim").addEventListener("click", async () => {
    $("claim").disabled = true;
    try {
      const response = await fetch(endpoint("claim"), { method: "POST", credentials: "same-origin", headers, body: JSON.stringify({ invite_token: invite }) });
      invite = ""; $("claim").hidden = true;
      if (!response.ok) { $("portal-message").textContent = "Bağlantı geçersiz veya süresi dolmuş."; return; }
      await session();
    } catch { $("portal-message").textContent = "İşlem tamamlanamadı. Lütfen yeniden deneyin."; }
    finally { $("claim").disabled = false; }
  });
  $("logout").addEventListener("click", async () => {
    $("logout").disabled = true;
    try {
      const response = await fetch(endpoint("logout"), { method: "POST", credentials: "same-origin", headers, body: "{}" });
      if (!response.ok) throw new Error("unavailable");
      invite = ""; clearPrivateState(); await session();
    } catch { $("portal-message").textContent = "Oturum kapatılamadı. Lütfen yeniden deneyin."; }
    finally { $("logout").disabled = false; }
  });
  $("checkout-form").addEventListener("submit", async event => {
    event.preventDefault(); if (busy || Date.now() < retryUntil || !accessId) return;
    if (!pending?.payload) {
      if ((!pending && !validCart()) || !cart.length || !$("checkout-form").reportValidity()) return;
      const delivery = { method: $("delivery-method").value, address: null };
      if (delivery.method === "shipping") {
        const address = {};
        for (const key of ["recipientName", "addressLine1", "addressLine2", "district", "city", "postalCode", "countryCode", "note"]) {
          const value = $("delivery-" + key).value.trim(); if (value) address[key] = key === "countryCode" ? value.toUpperCase() : value;
        }
        if (!/^[A-Z]{2}$/.test(address.countryCode || "")) { $("submission-message").textContent = "İki harfli ülke kodu girin."; return; }
        delivery.address = address;
      }
      const key = pending?.key || crypto.randomUUID();
      const payload = { idempotencyKey: key, items: cart.map(row => ({ productId: row.productId, quantity: row.quantity })), delivery, note: $("order-note").value.trim(), catalogRevision: catalog.catalog_revision };
      pending = { key, method: delivery.method, payload }; write("sessionStorage", attemptKey(), { key, method: delivery.method });
    }
    busy = true; render();
    try {
      const response = await fetch(endpoint("order"), { method: "POST", credentials: "same-origin", headers, body: JSON.stringify(pending.payload), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (response.ok && result.ok && typeof result.order_id === "string") {
        pending = null; write("sessionStorage", attemptKey(), null); cart = []; persistCart(); $("checkout-form").reset();
        $("reference").textContent = result.order_id; $("success").hidden = false; $("dealer-store").hidden = true; $("success").focus(); $("submission-message").textContent = "";
      } else if (response.status === 401) { clearPrivateState(); $("portal-message").textContent = "Bayi erişimi gerekli."; }
      else if ([400, 403, 409, 422].includes(response.status)) {
        $("submission-message").textContent = result.message || "Sipariş bilgilerini kontrol edin.";
        if (response.status === 409) pending.payload = null;
        else { pending = null; write("sessionStorage", attemptKey(), null); }
      } else if (response.status === 429) {
        const seconds = Number(response.headers.get("retry-after")) || 120;
        retryUntil = Date.now() + Math.min(Math.max(seconds, 1), 86400) * 1000;
        $("submission-message").textContent = "Çok kısa sürede fazla istek gönderildi. Bekleme süresi sonunda aynı siparişi tekrar deneyin.";
        clearTimeout(timer); timer = setTimeout(controls, retryUntil - Date.now());
      } else throw new Error("uncertain_submission");
    } catch { $("submission-message").textContent = "Sipariş sonucu doğrulanamadı. Aynı siparişi tekrar deneyin."; }
    finally { busy = false; render(); }
  });
  $("delivery-method").addEventListener("change", deliveryControls);
  $("refresh").addEventListener("click", () => { void loadCatalog(); });
  $("clear-cart").addEventListener("click", () => { if (!pending && !busy) { cart = []; persistCart(); render(); } });
  $("new-order").addEventListener("click", () => { $("success").hidden = true; $("dealer-store").hidden = false; void loadCatalog(); });
  window.addEventListener("beforeunload", event => { if (pending) { event.preventDefault(); event.returnValue = ""; } });
  window.addEventListener("hashchange", () => { captureInvite(); if (!busy) void session(); });
  captureInvite(); void session();
})();
