(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const endpoint = file => new URL(`/yardimci-asistan/api/dealer/${file}.php`, window.location.origin);
  const headers = { "Content-Type": "application/json", "X-YA-Dealer": "1" };
  let accessId = "", catalog = null, cart = [], pending = null, busy = false, retryUntil = 0, timer, generation = 0;
  const cartKey = () => `ya:dealer:${window.location.pathname}:${accessId}:cart:v1`;
  const attemptKey = () => `${cartKey()}:attempt`;
  const read = (storage, key) => { try { return JSON.parse(window[storage].getItem(key)); } catch { return null; } };
  const write = (storage, key, value) => { try { if (value === null) window[storage].removeItem(key); else window[storage].setItem(key, JSON.stringify(value)); } catch { /* storage is optional */ } };
  const money = (value, currency) => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value);
  const element = (tag, text, className = "") => { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; };
  const button = (text, action) => { const node = element("button", text, "quiet"); node.type = "button"; node.addEventListener("click", action); return node; };
  function clearPrivateState() {
    generation += 1;
    if (accessId) { write("localStorage", cartKey(), null); write("sessionStorage", attemptKey(), null); }
    catalog = null; cart = []; pending = null; accessId = "";
    $("checkout-form").reset(); $("product-grid").replaceChildren(); $("cart-lines").replaceChildren();
    $("dealer-store").hidden = true; $("success").hidden = true; $("reference").textContent = "";
    $("dealer-name").textContent = ""; $("dealer-name").hidden = true; $("logout").hidden = true;
    $("portal-title").textContent = "Hesabım";
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
      if ((response.status === 401 || response.status === 403)) { clearPrivateState(); $("portal-message").textContent = "Bayi erişimi gerekli."; return; }
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
  const accountEndpoint = file => new URL(`/yardimci-asistan/api/account/${file}.php`, window.location.origin);
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
  const tokenAction = new URLSearchParams(window.location.search).get("action");
  if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  let account = null;
  async function accountRequest(file, body) {
    const response = await fetch(accountEndpoint(file), {cache:"no-store", credentials:"same-origin", ...(body === undefined ? {} : {method:"POST",headers:{"Content-Type":"application/json","X-YA-Account":"1"},body:JSON.stringify(body)})});
    const value = await response.json();
    if (!response.ok) { const error = new Error(value.code || "account_unavailable"); error.status = response.status; throw error; }
    return value;
  }
  async function session() {
    const started = generation;
    try {
      const config = await accountRequest("config");
      if (started !== generation) return;
      $("account-forms").hidden = true; $("account-profile").hidden = true; $("account-orders").hidden = true; $("account-logout-all").hidden = true; $("account-providers").replaceChildren();
      if (!config.enabled) { clearPrivateState(); $("logout").hidden = false; $("portal-message").textContent = "Online Satış kapalı. Hesap erişimi şu anda kullanılamıyor."; return; }
      if (token && ["verify","reset"].includes(tokenAction)) { $("account-token").hidden=false; return; }
      try { account = (await accountRequest("session")).account; }
      catch(error) { if(error.status!==401)throw error; try { await accountRequest("refresh",{}); account=(await accountRequest("session")).account; } catch {account=null;} }
      if (started !== generation) return;
      for (const provider of config.providers || []) {
        if (account?.methods.includes(provider)) continue;
        const social = button((provider === "google" ? "Google" : "Facebook") + (account ? " hesabını bağla" : " ile giriş"), async () => {
          try { const value = await accountRequest("oauth",{provider,link:Boolean(account)}); location.assign(value.url); } catch(error) { $("portal-message").textContent=error.message; }
        }); $("account-providers").append(social);
      }
      if (account) {
        $("logout").hidden=false; $("account-logout-all").hidden=false; $("account-profile").hidden=false;
        $("account-email").textContent=account.email; $("account-profile").elements.fullName.value=account.fullName;
        $("account-orders").hidden=false; $("account-order-list").replaceChildren();
        const history=await accountRequest("orders");
        for(const order of history.orders || []) $("account-order-list").append(element("p",order.order_id+" · "+order.status));
        if(account.dealer) {
          if(accessId && accessId !== account.dealer.access_id) clearPrivateState();
          accessId=account.dealer.access_id;restoreCart();
          $("portal-title").textContent="Bayi paneli"; $("dealer-name").textContent=account.dealer.display_name; $("dealer-name").hidden=false;
          $("portal-message").textContent="Bayi panelinize hoş geldiniz."; await loadCatalog();
        } else {clearPrivateState(); $("logout").hidden=false; $("portal-message").textContent="Normal müşteri hesabınız açık. Bayi yetkisi için işletmeyle iletişime geçin.";}
      } else {
        clearPrivateState(); $("account-forms").hidden=false; $("account-register").hidden=!config.passwordRegistration; $("account-recover").hidden=!config.passwordRegistration;
        $("portal-message").textContent="Müşteri hesabınızla giriş yapın.";
      }
    } catch(error) {clearPrivateState(); $("portal-message").textContent=error.message;}
  }
  for(const action of ["login","register","recover","profile","token"]) $("account-"+action).addEventListener("submit", async event => {
    event.preventDefault(); const form=event.currentTarget,submit=form.querySelector("button");submit.disabled=true;
    try {
      await accountRequest(action==="token"?tokenAction:action,{...Object.fromEntries(new FormData(form)),...(action==="token"?{token}:{})});
      for(const password of form.querySelectorAll('input[type="password"]')) password.value="";
      if(action==="token"){location.assign(location.pathname);return;}
      if(["login","profile"].includes(action)) await session();
      else $("portal-message").textContent="Hesap mevcutsa doğrulama veya yenileme bağlantısı gönderildi. E-posta kutunuzu kontrol edin.";
    } catch(error){$("portal-message").textContent=error.message;}
    finally{submit.disabled=false;}
  });
  $("logout").addEventListener("click",async()=>{clearPrivateState();account=null;try{await accountRequest("logout",{});await session();}catch{$("portal-message").textContent="Yerel görünüm kapatıldı. Sunucudaki çıkışı yeniden deneyin.";}});
  $("account-logout-all").addEventListener("click",async()=>{try{await accountRequest("logout-all",{});account=null;clearPrivateState();await session();}catch(error){$("portal-message").textContent=error.message;}});
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
      } else if ((response.status === 401 || response.status === 403)) { clearPrivateState(); $("portal-message").textContent = "Bayi erişimi gerekli."; }
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
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !busy) void session(); });
  setInterval(() => { if (!document.hidden && !busy) void session(); },30000);
  void session();
})();
