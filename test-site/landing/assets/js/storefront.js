/* Public display/cart draft only. Catalog and order API remain authoritative. */
(() => {
  'use strict';
  const { ui, locale } = window.DemoLanguage;
  const root = document.querySelector('.ya-storefront');
  const $ = (id) => root.querySelector(`#${id}`);
  // Hosts can set data-api-base; the default follows the module asset, not the page route.
  const script = document.currentScript;
  const apiBase = new URL(script.dataset.apiBase || '/yardimci-asistan/api/', script.src);
  const scope = new URL('../', apiBase).pathname;
  const cartKey = `ya:storefront:${scope}:cart:v1`;
  const attemptKey = `ya:storefront:${scope}:attempt:v1`;
  const units = { piece: ui("adet"), kg: 'kg', g: 'g', l: 'l', ml: 'ml', pack: ui("paket"), box: ui("kutu"), meter: ui("metre"), other: ui("birim") };
  const discrete = (unit) => ['piece', 'pack', 'box'].includes(unit);
  const scale = 10000;
  let catalog = new Map(), catalogStatus = 'loading', loading = false;
  let deliveryMethods = [], deliveryMethod = '';
  const deliveryLabels = { pickup: ui("İşletmeden teslim"), shipping: ui("Kargo ile gönderim") };
  let cart = [], pending = null, busy = false, retryUntil = 0, timer;
  function read(storage, key) { try { return JSON.parse(window[storage].getItem(key)); } catch { return null; } }
  function write(storage, key, value) {
    try {
      if (value === null) window[storage].removeItem(key);
      else window[storage].setItem(key, JSON.stringify(value));
    } catch { /* storage may be blocked */ }
  }
  function snapshot(raw) {
    if (!raw || typeof raw.product_id !== 'string' || !raw.product_id.trim() || raw.product_id.length > 180
      || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 360
      || !Number.isFinite(raw.price) || raw.price < 0 || raw.price > Number.MAX_SAFE_INTEGER / 10000 || !/^[A-Z]{3}$/.test(raw.currency) || !Object.hasOwn(units, raw.unit)
      || raw.availability !== 'available') throw new Error('invalid_catalog');
    return { product_id: raw.product_id, name: raw.name, description: typeof raw.description === 'string' ? raw.description.slice(0, 2000) : '',
      price: raw.price, currency: raw.currency, unit: raw.unit, image_url: typeof raw.image_url === 'string' ? raw.image_url : '', availability: 'available' };
  }
  function quantity(value, unit) {
    if (!/^\d+(?:[.,]\d{1,4})?$/.test(String(value))) return null;
    const n = Number(String(value).replace(',', '.'));
    if (!(n > 0 && n <= 1000) || (discrete(unit) && !Number.isInteger(n))) return null;
    return Math.round(n * scale);
  }
  // Browser storage is untrusted; restore only the explicit display/cart allowlist.
  try {
    const saved = read('localStorage', cartKey);
    if (saved?.version === 1 && Array.isArray(saved.items) && saved.items.length <= 50) {
      const seen = new Set();
      for (const item of saved.items) {
        const product = snapshot(item.display), q = quantity(item.quantity, product.unit);
        if (q && !seen.has(product.product_id)) { cart.push({ productId: product.product_id, display: product, q }); seen.add(product.product_id); }
      }
      if (cart.reduce((sum, item) => sum + item.q, 0) > 10000 * scale) cart = [];
    }
    const savedAttempt = read('sessionStorage', attemptKey);
    if (savedAttempt?.version === 1 && /^[A-Za-z0-9_-]{16,128}$/.test(savedAttempt.key)) {
      pending = { key: savedAttempt.key, method: savedAttempt.method, payload: null };
      if (Object.hasOwn(deliveryLabels, savedAttempt.method)) deliveryMethod = savedAttempt.method;
      $('checkout').hidden = false;
      message(ui("Önceki gönderimin sonucu belirsiz. Aynı iletişim ve teslimat bilgileriyle tekrar deneyin. Yeni sipariş göndermeyin."));
    }
  } catch { /* browser storage may be unavailable */ }
  function persistCart() {
    write('localStorage', cartKey, cart.length ? { version: 1, items: cart.map((item) => ({ productId: item.productId, display: item.display, quantity: item.q / scale })) } : null);
  }
  function forgetAttempt() { pending = null; write('sessionStorage', attemptKey, null); }
  function message(text) { $('submission-message').textContent = text; }
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(text, action, className = 'secondary') {
    const node = el('button', text, className); node.type = 'button'; node.addEventListener('click', action); return node;
  }
  function money(value, currency) { return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value); }
  function safeImage(value) {
    try {
      if (!value || value.length > 2048) return '';
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
        || !url.hostname.includes('.') || /^[\d.:[\]]+$/.test(url.hostname) || /\.(local|localhost|internal|test)$/.test(url.hostname)) return '';
      return url.href;
    } catch { return ''; }
  }
  function renderProducts() {
    $('product-grid').replaceChildren();
    if (catalogStatus !== 'ready') return;
    for (const product of catalog.values()) {
      const card = el('article', undefined, 'product-card');
      const media = el('div', undefined, 'product-media');
      const fallback = el('span', ui("Görsel yok")); media.append(fallback);
      const url = safeImage(product.image_url);
      if (url) {
        const image = el('img'); image.alt = product.name; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => { image.remove(); fallback.hidden = false; }, { once: true });
        fallback.hidden = true; image.src = url; media.append(image);
      }
      const body = el('div', undefined, 'product-body'); body.append(el('h3', product.name));
      if (product.description) body.append(el('p', product.description, 'description'));
      body.append(el('div', `${money(product.price, product.currency)} / ${units[product.unit]}`, 'price'), el('span', ui("Satışta"), 'availability'));
      const add = button(ui("Sepete ekle"), () => addProduct(product), ''); add.disabled = !deliveryMethods.length || Boolean(pending) || busy;
      body.append(add); card.append(media, body); $('product-grid').append(card);
    }
  }
  function validCart() { return cart.length > 0 && deliveryMethods.length > 0 && catalogStatus === 'ready' && cart.every((item) => catalog.has(item.productId) && quantity(item.q / scale, item.display.unit)); }
  function updateControls() {
    $('clear-cart').disabled = !cart.length || Boolean(pending) || busy;
    $('open-checkout').disabled = !validCart() || Boolean(pending) || busy;
    $('buyer-fields').disabled = busy || Boolean(pending?.payload);
    $('delivery-fields').disabled = busy || Boolean(pending?.payload);
    renderDelivery();
    $('submit-order').disabled = busy || Date.now() < retryUntil || (!pending && !validCart());
    $('submit-order').textContent = busy ? ui("Gönderiliyor…") : pending ? ui("Aynı siparişi tekrar dene") : ui("Siparişi gönder");
    $('checkout-form').setAttribute('aria-busy', String(busy));
  }
  function renderCart() {
    const focusedLabel = document.activeElement?.closest('.quantity-controls') ? document.activeElement.getAttribute('aria-label') : null;
    $('cart-lines').replaceChildren();
    $('cart-count').textContent = String(cart.length);
    const totals = new Map();
    if (!cart.length) $('cart-lines').append(el('li', ui("Sepetiniz henüz boş.")));
    cart.forEach((item, index) => {
      const product = item.display, row = el('li', undefined, 'cart-line');
      row.append(el('strong', product.name), el('p', `${money(product.price, product.currency)} / ${units[product.unit]}`));
      const available = catalogStatus === 'ready' && catalog.has(item.productId);
      if (!available || !quantity(item.q / scale, product.unit)) row.append(el('p', catalogStatus === 'loading' ? ui("Ürün kontrol ediliyor…") : !available ? ui("Artık satışta değil veya katalog doğrulanamadı. Satırı kaldırın ya da ürünleri yenileyin.") : ui("Bu ürünün birimi değişti. Miktarı güncelleyin."), 'unavailable'));
      const controls = el('div', undefined, 'quantity-controls');
      const step = ['kg', 'l', 'meter', 'other'].includes(product.unit) ? 1000 : scale;
      const minus = button('−', () => changeQuantity(item, Math.max(discrete(product.unit) ? scale : 1, item.q - step)));
      minus.setAttribute('aria-label', ui("{0}: miktarı azalt", {0: product.name}));
      const input = el('input'); input.type = 'text'; input.inputMode = discrete(product.unit) ? 'numeric' : 'decimal'; input.value = String(item.q / scale);
      input.setAttribute('aria-label', ui("{0}: miktar ({1})", {0: product.name, 1: units[product.unit]}));
      const error = el('p', '', 'field-error'); error.id = `quantity-error-${index}`; input.setAttribute('aria-describedby', error.id);
      input.addEventListener('change', () => {
        const q = quantity(input.value, product.unit);
        if (!q || !canChangeQuantity(item, q)) {
          error.textContent = ui("Pozitif, en fazla 1000 {0} girin{1}. Toplam miktar 10000'i aşamaz.", {0: units[product.unit], 1: discrete(product.unit) ? ui(" (tam sayı)") : ui(" (en fazla 4 ondalık)")});
          input.setAttribute('aria-invalid', 'true'); $('submit-order').disabled = true; $('open-checkout').disabled = true;
        } else { changeQuantity(item, q); }
      });
      const plus = button('+', () => changeQuantity(item, item.q + step)); plus.setAttribute('aria-label', ui("{0}: miktarı artır", {0: product.name}));
      const remove = button(ui("Kaldır"), () => { cart = cart.filter((line) => line !== item); persistCart(); renderCart(); }, 'quiet'); remove.setAttribute('aria-label', ui("{0}: satırı kaldır", {0: product.name}));
      for (const control of [minus, input, plus, remove]) { control.disabled = Boolean(pending) || busy; controls.append(control); }
      row.append(controls, error); $('cart-lines').append(row);
      // Integer arithmetic for quantity and line subtotal, rounded to currency cents.
      const scaledPrice = BigInt(product.price.toFixed(4).replace('.', ''));
      const cents = (scaledPrice * BigInt(item.q) + 500000n) / 1000000n;
      totals.set(product.currency, (totals.get(product.currency) || 0n) + cents);
    });
    $('subtotal').replaceChildren();
    for (const [currency, cents] of totals) $('subtotal').append(el('p', ui("Ara toplam: {0}", {0: money(Number(cents) / 100, currency)})));
    if (!cart.length && !pending) $('checkout').hidden = true;
    updateControls();
    if (focusedLabel) Array.from($('cart-lines').querySelectorAll('[aria-label]')).find((node) => node.getAttribute('aria-label') === focusedLabel)?.focus();
  }
  function canChangeQuantity(item, q) { return q > 0 && q <= 1000 * scale && cart.reduce((sum, line) => sum + (line === item ? q : line.q), 0) <= 10000 * scale; }
  function changeQuantity(item, q) {
    if (pending || busy) return;
    if (!canChangeQuantity(item, q)) { $('cart-message').textContent = ui("Satır miktarı en fazla 1000, toplam miktar en fazla 10000 olabilir."); return; }
    item.q = q; persistCart(); renderCart();
  }
  function addProduct(product) {
    if (!deliveryMethods.length || catalogStatus !== 'ready' || pending || busy) return;
    const existing = cart.find((item) => item.productId === product.product_id);
    if (existing) {
      if (!canChangeQuantity(existing, existing.q + scale)) { $('cart-message').textContent = ui("Satır miktarı en fazla 1000, toplam miktar en fazla 10000 olabilir."); return; }
      changeQuantity(existing, existing.q + scale);
    }
    else if (cart.length >= 50 || cart.reduce((sum, item) => sum + item.q, 0) + scale > 10000 * scale) { $('cart-message').textContent = ui("Sepete en fazla 50 farklı ürün ve toplam 10000 birim ekleyebilirsiniz."); return; }
    else { cart.push({ productId: product.product_id, display: product, q: scale }); persistCart(); renderCart(); }
    $('cart-message').textContent = ui("{0} sepetinizde.", {0: product.name});
  }
  async function loadCatalog() {
    if (loading) return;
    loading = true; catalogStatus = 'loading'; $('refresh').disabled = true;
    $('catalog-state').hidden = false; $('catalog-state').textContent = ui("Ürünler yükleniyor…"); $('product-grid').setAttribute('aria-busy', 'true');
    renderProducts(); renderCart();
    try {
      const response = await fetch(new URL('catalog.php', apiBase), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const source = await response.json();
      const result = window.DemoLanguage?.localize(source, "online_catalog") ?? source;
      if (!response.ok || result.ok !== true || typeof result.enabled !== 'boolean' || !Array.isArray(result.products)
          || !Array.isArray(result.delivery_methods) || (result.enabled && (result.delivery_methods.length > 2
          || new Set(result.delivery_methods).size !== result.delivery_methods.length || result.delivery_methods.some((method) => !Object.hasOwn(deliveryLabels, method))))) throw new Error('catalog_unavailable');
      const products = result.enabled ? result.products.map(snapshot) : [];
      deliveryMethods = result.enabled ? result.delivery_methods : [];
      catalog = new Map(products.map((product) => [product.product_id, product]));
      catalogStatus = !result.enabled ? 'disabled' : 'ready';
      // A pending payload never changes; display snapshots can reflect current catalog.
      for (const item of cart) if (catalog.has(item.productId)) item.display = catalog.get(item.productId);
      persistCart();
      $('catalog-state').textContent = !result.enabled || !deliveryMethods.length ? ui("Mağazamız şu anda online sipariş almıyor.") : !catalog.size ? ui("Şu anda satışta ürün bulunmuyor.") : '';
      $('catalog-state').hidden = result.enabled && deliveryMethods.length > 0 && catalog.size > 0;
    } catch {
      catalogStatus = 'error'; $('catalog-state').textContent = ui("Ürünler şu anda yüklenemiyor. Ürünleri yenile düğmesiyle tekrar deneyin.");
    } finally {
      loading = false; $('refresh').disabled = false; $('product-grid').setAttribute('aria-busy', 'false'); renderProducts(); renderCart();
    }
  }
  function renderDelivery() {
    if (pending) deliveryMethod = pending.payload?.delivery.method || pending.method || deliveryMethod;
    else if (!deliveryMethods.includes(deliveryMethod)) deliveryMethod = deliveryMethods[0] || '';
    $('delivery-choice').hidden = deliveryMethods.length < 2 || Boolean(pending);
    $('delivery-summary').textContent = deliveryLabels[deliveryMethod] || ui("Teslimat yöntemleri katalogla birlikte yüklenir.");
    for (const option of $('delivery-method').options) option.hidden = !deliveryMethods.includes(option.value);
    $('delivery-method').value = deliveryMethod;
    $('shipping-fields').hidden = deliveryMethod !== 'shipping';
  }
  function validateDelivery() {
    if (deliveryMethod === 'pickup') return { method: 'pickup' };
    if (deliveryMethod !== 'shipping') { message(ui("Teslimat yöntemini kontrol edin.")); return null; }
    const address = {}, errors = [];
    const limits = { recipientName: 160, addressLine1: 300, addressLine2: 300, district: 120, city: 120, postalCode: 32, countryCode: 2, note: 500 };
    for (const [key, maximum] of Object.entries(limits)) {
      const input = $(`delivery-${key}`);
      let value = input.value.trim();
      if (key === 'countryCode') value = value.toUpperCase();
      const required = ['recipientName', 'addressLine1', 'district', 'city', 'countryCode'].includes(key);
      const controls = key === 'note' ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/;
      const invalid = (required && !value) || [...value].length > maximum || controls.test(value) || (key === 'countryCode' && !/^[A-Za-z]{2}$/.test(input.value.trim()));
      $(`delivery-${key}-error`).textContent = invalid ? (key === 'countryCode' ? ui("İki harfli ülke kodunu yazın (TR, GB gibi).") : ui("Bu alanı kontrol edin (en fazla {0} karakter).", {0: maximum})) : '';
      input.setAttribute('aria-invalid', String(invalid));
      if (invalid) errors.push(input);
      else if (value) address[key] = value;
    }
    if (errors.length) { errors[0].focus(); return null; }
    return { method: 'shipping', address };
  }
  function validateBuyer() {
    const values = { name: $('buyer-name').value.trim(), phone: $('buyer-phone').value.trim(), email: $('buyer-email').value.trim(), note: $('order-note').value.trim() };
    const errors = {};
    const length = (value) => [...value].length;
    const controls = /[\x00-\x1f\x7f]/;
    if (!values.name || length(values.name) > 160 || controls.test(values.name)) errors.name = ui("Adınızı yazın (en fazla 160 karakter).");
    const digits = values.phone.replace(/\D/g, '');
    if (length(values.phone) > 40 || !/^\+?[0-9 ()./-]+$/.test(values.phone) || digits.length < 7 || digits.length > 15) errors.phone = ui("7–15 rakam içeren geçerli bir telefon yazın. Uluslararası numaralar kabul edilir.");
    if (length(values.email) > 254 || controls.test(values.email) || (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))) errors.email = ui("Geçerli bir e-posta yazın veya alanı boş bırakın.");
    if (length(values.note) > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(values.note)) errors.note = ui("Not en fazla 2000 karakter olabilir.");
    for (const name of ['name', 'phone', 'email', 'note']) {
      $(`${name}-error`).textContent = errors[name] || '';
      $(name === 'note' ? 'order-note' : `buyer-${name}`).setAttribute('aria-invalid', String(Boolean(errors[name])));
    }
    const first = Object.keys(errors)[0];
    if (first) { $(first === 'note' ? 'order-note' : `buyer-${first}`).focus(); return null; }
    return { buyer: { name: values.name, phone: values.phone, ...(values.email ? { email: values.email } : {}) }, ...(values.note ? { note: values.note } : {}) };
  }
  function newKey() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) => n.toString(16).padStart(2, '0')).join('');
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || Date.now() < retryUntil) return;
    // An unresolved attempt must replay exactly; no new key or semantic edits.
    if (!pending?.payload) {
      if ((!pending && !validCart()) || root.querySelector('.quantity-controls [aria-invalid="true"]') || !cart.length) { message(ui("Sepetteki ürünleri ve miktarları kontrol edin.")); return; }
      const contact = validateBuyer(); if (!contact) return;
      if (!pending && !deliveryMethods.includes(deliveryMethod)) { message(ui("Teslimat yöntemini kontrol edin.")); return; }
      const delivery = validateDelivery(); if (!delivery) return;
      try {
        const key = pending?.key || newKey();
        const payload = { idempotencyKey: key, items: cart.map((item) => ({ productId: item.productId, quantity: item.q / scale })), delivery, ...contact };
        if (new TextEncoder().encode(JSON.stringify(payload)).length > 16384) { message(ui("Sipariş bilgileri çok uzun. Notu veya sepeti kısaltın.")); return; }
        pending = { key, method: delivery.method, payload };
        write('sessionStorage', attemptKey, { version: 1, key, method: delivery.method });
      } catch { message(ui("Güvenli sipariş kimliği üretilemedi. Güncel bir tarayıcı ve güvenli bağlantı kullanın.")); return; }
    }
    busy = true; message(''); renderProducts(); renderCart();
    try {
      const response = await fetch(new URL('order.php', apiBase), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending.payload), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (response.status === 201 && result.ok === true && typeof result.order_id === 'string') {
        forgetAttempt(); cart = []; persistCart(); $('checkout-form').reset(); $('checkout').hidden = true;
        $('reference').textContent = result.order_id; $('success').hidden = false; $('store-layout').hidden = true; $('success').focus();
      } else if (response.status === 409 && result.code === 'idempotency_conflict') {
        // No automatic new key: the original order may already have been accepted.
        message(ui("Tekrar deneme bilgileri önceki siparişle eşleşmiyor. Yeni sipariş göndermeyin; önceki bilgileri kontrol edin veya işletmeyle iletişime geçin."));
        pending.payload = null;
      } else if (response.status === 403 && result.code === 'online_sales_disabled') {
        forgetAttempt(); catalogStatus = 'disabled'; catalog.clear(); $('catalog-state').hidden = false;
        $('catalog-state').textContent = ui("Mağazamız şu anda online sipariş almıyor."); message(ui("Mağaza sipariş almayı durdurdu. Sepetiniz korunuyor."));
      } else if (response.status === 403 && result.code === 'online_ordering_disabled') {
        forgetAttempt(); await loadCatalog(); message(ui("Mağaza şu anda online sipariş almıyor. Sepetiniz korunuyor."));
      } else if (response.status === 422 && result.code === 'product_not_published') {
        forgetAttempt(); await loadCatalog(); message(ui("Ürünlerden biri artık satışta değil. Sepetinizi kontrol edip ilgili satırı kaldırın."));
      } else if (response.status === 422 && result.code === 'delivery_method_unavailable') {
        forgetAttempt(); await loadCatalog(); message(ui("Seçilen teslimat yöntemi artık sunulmuyor. Güncel yöntemle siparişinizi tekrar gönderebilirsiniz."));
      } else if (response.status === 429) {
        const header = response.headers.get('Retry-After');
        const seconds = /^\d+$/.test(header || '') ? Number(header) : header && Number.isFinite(Date.parse(header)) ? Math.max(1, Math.ceil((Date.parse(header) - Date.now()) / 1000)) : Number(result.retry_after_seconds) || 60;
        retryUntil = Date.now() + Math.min(Math.max(seconds, 1), 86400) * 1000;
        message(ui("Çok kısa sürede fazla istek gönderildi. {0} saniye sonra aynı siparişi tekrar deneyebilirsiniz.", {0: Math.ceil((retryUntil - Date.now()) / 1000)}));
        clearTimeout(timer); timer = setTimeout(() => { message(ui("Bekleme süresi doldu. Aynı siparişi tekrar deneyebilirsiniz.")); updateControls(); }, retryUntil - Date.now());
      } else if (response.status >= 400 && response.status < 500) {
        forgetAttempt(); message(ui("Sipariş gönderilemedi. Ürünleri, iletişim ve teslimat bilgilerini kontrol edin."));
      } else throw new Error('uncertain_submission');
    } catch {
      message(ui("Siparişin sonucu doğrulanamadı. Bilgileriniz ve sepetiniz korunuyor. Aynı siparişi tekrar deneyin; yeni bir sipariş başlatmayın."));
    } finally { busy = false; renderProducts(); renderCart(); }
  }
  $('delivery-method').addEventListener('change', () => { if (pending || busy) return; deliveryMethod = $('delivery-method').value; renderDelivery(); });
  $('refresh').addEventListener('click', loadCatalog);
  $('clear-cart').addEventListener('click', () => { if (pending || busy) return; cart = []; persistCart(); renderCart(); });
  $('open-checkout').addEventListener('click', () => { if ($('open-checkout').disabled) return; $('checkout').hidden = false; $('buyer-name').focus(); });
  $('checkout-form').addEventListener('submit', submit);
  $('new-order').addEventListener('click', () => { $('success').hidden = true; $('store-layout').hidden = false; loadCatalog(); $('products').focus(); });
  window.addEventListener('beforeunload', (event) => { if (pending) { event.preventDefault(); event.returnValue = ''; } });
  loadCatalog();
})();
