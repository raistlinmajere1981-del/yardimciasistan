/* Headless commerce controller. Hosting owns authorization, prices and order acceptance.
 * No selectors, markup or filter widgets. A site subscribes synchronously and paints its own view.
 */
(() => {
  'use strict';
  function create({apiBase, account = window.YaAccount, language = window.DemoLanguage} = {}) {
    apiBase = new URL(apiBase || '/yardimci-asistan/api/', window.location.href);
    if (apiBase.origin !== window.location.origin || apiBase.search || apiBase.hash) throw new Error('same_origin_api_required');
    const demoLang = language || {ui:(text, params = {}) => text.replace(/\{(\w+)\}/g, (match,key) => params[key] ?? match)};
    const {ui} = demoLang, accountOwner = account;
    const scope = new URL('../', apiBase).pathname;
    const listeners = new Set();
    let auth = accountOwner?.state || {status:'guest',account:null,generation:0};
    let ownerKey = '', generation = 0, loadSequence = 0, catalogRevision = '';
    let cartKey = '', attemptKey = '', favoritesKey = '', restored = false, started = false, destroyed = false, unsubscribe;
    const identity = state => state.status === 'authenticated' ? `account:${state.account.id}` : 'guest';
    const isPrivate = () => auth.status === 'authenticated' && Boolean(auth.account?.dealer);
    const current = stamp => !destroyed && stamp === generation && auth.status !== 'unavailable';
    const publicReadOnly = () => auth.status === 'unavailable' && auth.reason === 'unavailable' && !auth.account;
    const catalogCurrent = stamp => !destroyed && stamp === generation && (auth.status !== 'unavailable' || publicReadOnly());
    const units = {piece:ui('adet'),kg:'kg',g:'g',l:'l',ml:'ml',pack:ui('paket'),box:ui('kutu'),meter:ui('metre'),other:ui('birim')};
    const discrete = unit => ['piece','pack','box'].includes(unit), scale = 10000;
    const deliveryLabels = {pickup:ui('İşletmeden teslim'),shipping:ui('Kargo ile gönderim')};
    let catalog = new Map(), catalogStatus = 'loading', loading = false, categories = [], favorites = new Set();
    let deliveryMethods = [], deliveryMethod = '', cart = [], pending = null, busy = false, preparing = false, reordering = false;
    let retryUntil = 0, timer, receipt = null, reorderBlocked = false, catalogMessage = '', submissionMessage = '', cartMessage = '';
    function state() {
      const totals = new Map();
      for (const item of cart) {
        if (!catalog.has(item.productId)) continue;
        const price = BigInt(item.display.price.toFixed(4).replace('.', ''));
        const cents = (price * BigInt(item.q) + 500000n) / 1000000n;
        totals.set(item.display.currency,(totals.get(item.display.currency) || 0n) + cents);
      }
      // A renderer cannot mutate controller state or obtain a stored buyer/pending payload.
      return structuredClone({auth,ownerKey,generation,catalogStatus,loading,products:[...catalog.values()],categories,
        favorites:[...favorites],cart,deliveryMethods,deliveryMethod,units,deliveryLabels,scale,receipt,
        pending:pending ? {hasPayload:Boolean(pending.payload),authorizationChanged:pending.authorizationChanged,recoveryFailed:pending.recoveryFailed} : null,
        busy,preparing,reordering,retryUntil,catalogMessage,submissionMessage,cartMessage,
        totals:[...totals].map(([currency,cents]) => ({currency,amount:Number(cents) / 100})),
        canEdit:!destroyed && catalogStatus === 'ready' && auth.status !== 'unavailable' && !pending && !busy && !preparing && !reordering,
        canCheckout:!destroyed && validCart() && auth.status !== 'unavailable' && !pending && !busy && !preparing && !reordering,
        canSubmit:!destroyed && auth.status !== 'unavailable' && !busy && !preparing && !reordering && !pending?.authorizationChanged && !pending?.recoveryFailed && Date.now() >= retryUntil && Boolean(pending || validCart())});
    }
    function emit(reason = 'change') {
      if (!destroyed) for (const listener of listeners) {
        try { listener(state(),reason); } catch { /* One observer cannot prevent other private views closing. */ }
      }
    }
    function message(value) { submissionMessage = value; }
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
      const cover = safeImage(raw.image_url);
      const urls = raw.image_urls === undefined ? (cover ? [cover] : []) : raw.image_urls;
      if (!Array.isArray(urls) || urls.length > 12 || urls.some(url => !safeImage(url))) throw new Error('invalid_product_images');
      const images = [...new Set(urls.map(safeImage))];
      if ((images[0] || '') !== cover) throw new Error('invalid_product_image_cover');
      if (raw.is_featured !== undefined && typeof raw.is_featured !== 'boolean') throw new Error('invalid_featured_product');
      if (raw.featured_order !== undefined && (!Number.isSafeInteger(raw.featured_order)
        || raw.featured_order < 0 || raw.featured_order > 1000000)) throw new Error('invalid_featured_product');

      return { product_id: raw.product_id, name: raw.name, description: typeof raw.description === 'string' ? raw.description.slice(0, 2000) : '',
        sku: typeof raw.sku === 'string' ? raw.sku.slice(0,80) : '',
        brand: typeof raw.brand === 'string' ? raw.brand.slice(0,180) : '',
        category_id: typeof raw.category_id === 'string' ? raw.category_id.slice(0,180) : '',
        category_name: typeof raw.category_name === 'string' ? raw.category_name.slice(0,180) : '',
        price: raw.price, currency: raw.currency, unit: raw.unit, image_url: cover, image_urls: images,
        availability: 'available', is_featured: raw.is_featured === true,
        featured_order: raw.featured_order ?? 0 };
    }
    function quantity(value, unit) {
      if (!/^\d+(?:[.,]\d{1,4})?$/.test(String(value))) return null;
      const n = Number(String(value).replace(',', '.'));
      if (!(n > 0 && n <= 1000) || (discrete(unit) && !Number.isInteger(n))) return null;
      return Math.round(n * scale);
    }
    function safeImage(value) {
      try {
        if (!value || value.length > 2048) return '';
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.hostname.endsWith('.') || url.username || url.password || url.search || url.hash
          || !url.hostname.includes('.') || /^[\d.:[\]]+$/.test(url.hostname) || /\.(local|localhost|internal|test)$/.test(url.hostname)) return '';
        return url.href;
      } catch { return ''; }
    }
    function restoreCart() {
      if (restored) return;
      restored = true;
      const saved = window.YaCartDraft?.read(ownerKey) || read('localStorage',cartKey);
      if (saved?.version === 2 && Array.isArray(saved.items) && saved.items.length <= 50) {
        const seen = new Set();
        for (const item of saved.items) {
          const product = catalog.get(item.productId);
          const q = quantity(item.quantity, product?.unit || 'other');
          if (q && typeof item.productId === 'string' && item.productId.length <= 180 && !seen.has(item.productId)) {
            cart.push({productId:item.productId,display:product || {product_id:item.productId,name:ui('Ürün artık satışta değil'),price:0,currency:'TRY',unit:'other',image_url:''},q}); seen.add(item.productId);
          }
        }
        if (cart.reduce((sum,item) => sum + item.q,0) > 10000 * scale) cart = [];
      }
      const attempt = read('sessionStorage', attemptKey);
      if (attempt?.version === 2 && /^[A-Za-z0-9_-]{16,128}$/.test(attempt.key) && Object.hasOwn(deliveryLabels,attempt.method)
          && /^[a-f0-9]{64}$/.test(attempt.fingerprint) && ['order.php','dealer/order.php'].includes(attempt.endpoint)
          && Array.isArray(attempt.items) && attempt.items.length <= 50) {
        pending = {...attempt,payload:null}; deliveryMethod = attempt.method;
        // An unresolved attempt is scoped recovery evidence, never a second editable cart.
        cart = attempt.items.flatMap(item => {
          const product = catalog.get(item.productId), q = product ? quantity(item.quantity,product.unit) : null;
          return q ? [{productId:item.productId,display:product,q}] : [];
        });
        message(ui('Önceki gönderimin sonucu belirsiz. Aynı iletişim ve teslimat bilgileriyle tekrar deneyin. Yeni sipariş göndermeyin.'));
      }
    }
    function persistCart() {
      if (!cartKey) return;
      const items = cart.map(item => ({productId:item.productId,quantity:item.q / scale}));
      if (window.YaCartDraft) window.YaCartDraft.save(ownerKey,items);
      else write('localStorage',cartKey,items.length ? {version:2,items} : null);
    }
    function closePrivate(preserveDraft = false) {
      generation++; loadSequence++; loading = false; clearTimeout(timer); retryUntil = 0;
      if (cartKey && !preserveDraft) { if (window.YaCartDraft) window.YaCartDraft.clear(ownerKey); else write('localStorage',cartKey,null); }
      catalog.clear(); catalogStatus = 'error'; catalogRevision = ''; categories = []; deliveryMethods = []; deliveryMethod = '';
      cart = []; pending = null; busy = false; preparing = false; reordering = false; restored = false;
      favorites.clear(); receipt = null; reorderBlocked = false; submissionMessage = ''; cartMessage = '';
      catalogMessage = ui('Hesap şu anda doğrulanamıyor. Lütfen yeniden deneyin.');
      // Synchronous notification is the presentation's private-data erase boundary.
      emit('fence');
    }
    function setOwner(next) {
      if (destroyed) return;
      const previousStatus = auth.status;
      const key = identity(next);
      const changed = key !== ownerKey || next.generation !== auth.generation || next.status === 'unavailable';
      const samePublicGuest = key === 'guest' && ownerKey === 'guest' && !auth.account && !next.account
        && !['hidden','pagehide','offline'].includes(next.reason);
      const preserveDraft = ['hidden','pagehide'].includes(next.reason) || (!auth.account && next.reason === 'offline');
      auth = next;
      if (changed && ownerKey && !samePublicGuest) closePrivate(preserveDraft);
      ownerKey = key;
      cartKey = `ya:storefront:${scope}:${encodeURIComponent(ownerKey)}:cart:v2`;
      attemptKey = `ya:storefront:${scope}:${encodeURIComponent(ownerKey)}:attempt:v2`;
      favoritesKey = `ya:storefront:${scope}:${encodeURIComponent(ownerKey)}:favorites:v1`;
      if (publicReadOnly()) {
        if (!samePublicGuest || (!restored && !loading)) void loadCatalog();
        if (catalogStatus === 'ready') catalogMessage = ui('Hesap şu anda doğrulanamıyor. Lütfen yeniden deneyin.');
        emit('owner');
      } else if (next.status !== 'unavailable' && ((changed && !samePublicGuest) || (!restored && !loading))) {
        emit('owner'); void loadCatalog();
      } else if (previousStatus !== next.status) {
        if (catalogStatus === 'ready') catalogMessage = !deliveryMethods.length ? ui('Mağazamız şu anda online sipariş almıyor.') : !catalog.size ? ui('Şu anda satışta ürün bulunmuyor.') : '';
        emit('owner');
      }
    }
    function accepted(result) {
      forgetAttempt(); cart = []; persistCart(); receipt = structuredClone(result); message(''); emit('accepted');
    }
    function restoreFavorites() {
      const saved = read('localStorage', favoritesKey);
      favorites = new Set(saved?.version === 1 && Array.isArray(saved.productIds)
        ? saved.productIds.filter(id => typeof id === 'string' && id.length <= 180 && catalog.has(id)) : []);
    }
    function canEdit() { return !destroyed && catalogStatus === 'ready' && auth.status !== 'unavailable' && !pending && !busy && !preparing && !reordering; }
    function toggleFavorite(id) {
      if (!canEdit() || !catalog.has(id)) return;
      restoreFavorites();
      if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
      write('localStorage',favoritesKey,{version:1,productIds:[...favorites]}); emit();
    }
    function forgetAttempt() { pending = null; write('sessionStorage', attemptKey, null); }
    function validCart() { return cart.length > 0 && deliveryMethods.length > 0 && catalogStatus === 'ready' && cart.every((item) => catalog.has(item.productId) && quantity(item.q / scale, item.display.unit)); }
    function canChangeQuantity(item, q) { return q > 0 && q <= 1000 * scale && cart.reduce((sum, line) => sum + (line === item ? q : line.q), 0) <= 10000 * scale; }
    function setQuantity(id, value) {
      if (!canEdit()) return false;
      const item = cart.find(line => line.productId === id);
      const q = item ? quantity(value,item.display.unit) : null;
      if (!q || !canChangeQuantity(item,q)) return false;
      item.q = q; persistCart(); emit(); return true;
    }
    function add(id) {
      if (!canEdit() || !deliveryMethods.length) return;
      const product = catalog.get(id); if (!product) return;
      const existing = cart.find(item => item.productId === id);
      if (existing) { if (!setQuantity(id,(existing.q + scale) / scale)) return; }
      else if (cart.length >= 50 || cart.reduce((sum,item) => sum + item.q,0) + scale > 10000 * scale) {
        cartMessage = ui('Sepete en fazla 50 farklı ürün ve toplam 10000 birim ekleyebilirsiniz.'); emit(); return;
      } else { cart.push({productId:id,display:product,q:scale}); persistCart(); }
      cartMessage = ui('{0} sepetinizde.',{0:product.name}); emit();
    }
    function remove(id) { if (canEdit()) { cart = cart.filter(item => item.productId !== id); persistCart(); emit(); } }
    function clearCart() { if (canEdit()) { cart = []; persistCart(); emit(); } }
    function reorderMessage(value) { cartMessage = value; message(value); }
    async function recoverAttempt(stamp) {
      if (!pending || !auth.account) return;
      const key = pending.key;
      try {
        const response = await fetch(new URL('account/receipt.php',apiBase), {method:'POST',credentials:'same-origin',cache:'no-store',
          headers:{'Content-Type':'application/json','X-YA-Account':'1'},body:JSON.stringify({idempotencyKey:key}),signal:AbortSignal.timeout(15000)});
        if (!current(stamp) || pending?.key !== key) return;
        if ([401,403].includes(response.status)) { accountOwner?.clear('unavailable'); return; }
        const result = await response.json();
        if (!current(stamp) || pending?.key !== key) return;
        if (!response.ok || result.ok !== true) throw new Error('receipt_unavailable');
        if (result.receipt?.ok === true && typeof result.receipt.order_id === 'string') accepted(result.receipt);
        else if (pending.endpoint !== (isPrivate() ? 'dealer/order.php' : 'order.php')) {
          pending.authorizationChanged = true; message(ui('Önceki siparişin sonucu doğrulanmalı. Sipariş geçmişinizi kontrol edin.'));
        }
      } catch { if (current(stamp)) { pending.recoveryFailed = true; message(ui('Önceki siparişin sonucu doğrulanmalı. Sipariş geçmişinizi kontrol edin.')); } }
    }
    async function prepareReorder(id, stamp = generation) {
      if (!id || !current(stamp)) return;
      const reorderId = id;
      if (!auth.account || !/^[A-Za-z0-9_-]{1,180}$/.test(reorderId)) {
        reorderMessage(ui('Yeniden sipariş için hesabınızla giriş yapın.')); emit(); return;
      }
      if (reorderBlocked || pending || busy || preparing || reordering || window.YaCartDraft?.hasPending(ownerKey) !== false) {
        reorderMessage(ui('Önce sonucu belirsiz siparişinizi kontrol edin.')); emit(); return;
      }
      if (catalogStatus !== 'ready' || !deliveryMethods.length) {
        reorderMessage(ui('Mağaza şu anda online sipariş almıyor.')); emit(); return;
      }
      reordering = true; emit();
      try {
        // Only an order ID crosses the route. Lines are re-read from this account,
        // and every display/price below comes from the freshly authorized catalog.
        const result = await accountOwner.request('orders');
        if (!current(stamp) || !auth.account || pending || window.YaCartDraft.hasPending(ownerKey)) return;
        const order = result.orders?.find(row => row.order_id === reorderId);
        if (!order || !Array.isArray(order.items)) { reorderMessage(ui('Sipariş bulunamadı.')); emit(); return; }
        const merged = new Map();
        for (const item of cart) {
          const product = catalog.get(item.productId);
          if (!product || !quantity(item.q / scale,product.unit)) throw new Error('invalid_reorder');
          merged.set(item.productId,{productId:item.productId,display:product,q:item.q});
        }
        let missing = 0, added = 0;
        for (const line of order.items) {
          const product = catalog.get(line.product_id);
          if (!product) { missing++; continue; }
          const q = quantity(line.quantity,product.unit);
          if (q === null) throw new Error('invalid_reorder');
          const previous = merged.get(product.product_id);
          merged.set(product.product_id,{productId:product.product_id,display:product,q:(previous?.q || 0) + q});
          added++;
        }
        const items = [...merged.values()];
        if (items.length > 50 || items.some(item => item.q > 1000 * scale) || items.reduce((total,item) => total + item.q,0) > 10000 * scale) throw new Error('invalid_reorder');
        // Commit the whole merge only after validation; never submit from this action.
        if (added) { cart = items; persistCart(); }
        reorderMessage(ui(!added ? 'Bu siparişin ürünleri artık katalogda yok veya erişilemiyor. Sepetiniz değiştirilmedi.'
          : missing ? '{0} ürün artık katalogda yok veya erişilemiyor; diğer ürünler güncel fiyatlarla sepete eklendi.' : 'Ürünler güncel fiyatlarla sepete eklendi.',{0:missing}));
        emit('reorder');
      } catch {
        if (current(stamp)) reorderMessage(ui('Ürünler sepete eklenemedi. Güncel kataloğu ve miktar sınırlarını kontrol edin.'));
      } finally { if (current(stamp)) { reordering = false; emit(); } }
    }
    async function loadCatalog() {
      if (destroyed || loading || (auth.status === 'unavailable' && !publicReadOnly())) return;
      loading = true; const sequence = ++loadSequence, stamp = generation;
      catalogStatus = 'loading';
      catalogMessage = ui('Ürünler yükleniyor…'); emit('loading');
      try {
        const response = await fetch(new URL(isPrivate() ? 'dealer/catalog.php' : 'catalog.php',apiBase), {cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(15000)});
        if (!catalogCurrent(stamp) || sequence !== loadSequence) return;
        if ([401,403].includes(response.status) && auth.account) { accountOwner?.clear('unavailable'); return; }
        const source = await response.json();
        if (!catalogCurrent(stamp) || sequence !== loadSequence) return;
        const result = isPrivate() ? {ok:source.ok,enabled:true,...source.catalog} : (demoLang.localize?.(source,'online_catalog') || source);
        if (!response.ok || result.ok !== true || typeof result.enabled !== 'boolean' || !Array.isArray(result.products)
            || !Array.isArray(result.delivery_methods) || result.delivery_methods.length > 2
            || new Set(result.delivery_methods).size !== result.delivery_methods.length || result.delivery_methods.some(method => !Object.hasOwn(deliveryLabels,method))) throw new Error('catalog_unavailable');
        if (isPrivate() && (result.access_id !== auth.account.dealer.access_id || !/^[a-f0-9]{64}$/.test(result.catalog_revision))) throw new Error('catalog_owner_mismatch');
        const products = result.enabled ? result.products.filter(product => !['published','is_active','active','visible','is_available'].some(key => Object.hasOwn(product,key) && product[key] !== true)).map(snapshot) : [];
        if (new Set(products.map(product => product.product_id)).size !== products.length) throw new Error('duplicate_product');
        deliveryMethods = result.enabled ? result.delivery_methods : [];
        catalogRevision = isPrivate() ? result.catalog_revision : '';
        catalog = new Map(products.map(product => [product.product_id,product])); catalogStatus = result.enabled ? 'ready' : 'disabled';
        restoreFavorites();
        // Private category names come only from the authorized catalog, never public menu data.
        categories = Array.isArray(result.categories) ? result.categories.filter(row => row && typeof row.id === 'string' && typeof row.name === 'string' && products.some(product => product.category_id === row.id)) : [];
        if (isPrivate()) for (const product of products) if (product.category_id && product.category_name && !categories.some(row => row.id === product.category_id)) categories.push({id:product.category_id,name:product.category_name});
        for (const product of products) if (!product.category_name) product.category_name = categories.find(row => row.id === product.category_id)?.name || '';
        restoreCart();
        for (const item of cart) if (catalog.has(item.productId)) item.display = catalog.get(item.productId);
        if (!result.enabled && auth.account) cart = [];
        persistCart(); syncDelivery();
        catalogMessage = !result.enabled || !deliveryMethods.length ? ui('Mağazamız şu anda online sipariş almıyor.') : !catalog.size ? ui('Şu anda satışta ürün bulunmuyor.') : '';
        if (publicReadOnly() && catalogStatus === 'ready') {
          catalogMessage = ui('Hesap şu anda doğrulanamıyor. Lütfen yeniden deneyin.');
        }
        // Recovering an acceptance must not turn a queued reorder URL into a new cart.
        reorderBlocked = Boolean(pending) || window.YaCartDraft?.hasPending(ownerKey) !== false;
        await recoverAttempt(stamp);

      } catch {
        if (!catalogCurrent(stamp) || sequence !== loadSequence) return;
        if (auth.account) { accountOwner?.clear('unavailable'); return; }
        catalog.clear(); catalogStatus = 'error';
        catalogMessage = ui('Ürünler şu anda yüklenemiyor. Ürünleri yenile düğmesiyle tekrar deneyin.');
      } finally {
        if (catalogCurrent(stamp) && sequence === loadSequence) {
          loading = false; emit('catalog');
        }
      }
    }
    function syncDelivery() {
      if (pending) deliveryMethod = pending.payload?.delivery.method || pending.method || deliveryMethod;
      else if (!deliveryMethods.includes(deliveryMethod)) deliveryMethod = deliveryMethods[0] || '';
    }
    function setDelivery(method) {
      if (!canEdit() || !deliveryMethods.includes(method)) return;
      deliveryMethod = method; emit();
    }
    function validate(input) {
      const values = Object.fromEntries(['name','phone','email','note'].map(key => [key,typeof input?.[key] === 'string' ? input[key].trim() : '']));
      // Verified identity replaces editable names/emails; the server still decides the account.
      if (auth.account) { values.name = auth.account.fullName || ''; values.email = auth.account.email || ''; }
      const errors = {}, length = value => [...value].length, controls = /[\x00-\x1f\x7f]/;
      if (!values.name || length(values.name) > 160 || controls.test(values.name)) errors.name = ui('Adınızı yazın (en fazla 160 karakter).');
      const digits = values.phone.replace(/\D/g,'');
      if (length(values.phone) > 40 || !/^\+?[0-9 ()./-]+$/.test(values.phone) || digits.length < 7 || digits.length > 15) errors.phone = ui('7–15 rakam içeren geçerli bir telefon yazın. Uluslararası numaralar kabul edilir.');
      if (length(values.email) > 254 || controls.test(values.email) || (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))) errors.email = ui('Geçerli bir e-posta yazın veya alanı boş bırakın.');
      if (length(values.note) > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(values.note)) errors.note = ui('Not en fazla 2000 karakter olabilir.');
      const contact = {buyer:{name:values.name,phone:values.phone,...(values.email ? {email:values.email} : {})},...(values.note ? {note:values.note} : {})};
      const delivery = {method:deliveryMethod};
      if (deliveryMethod === 'shipping') {
        delivery.address = {};
        const limits = {recipientName:160,addressLine1:300,addressLine2:300,district:120,city:120,postalCode:32,countryCode:2,note:500};
        for (const [key,maximum] of Object.entries(limits)) {
          let value = typeof input?.address?.[key] === 'string' ? input.address[key].trim() : '';
          if (key === 'countryCode') value = value.toUpperCase();
          const required = ['recipientName','addressLine1','district','city','countryCode'].includes(key);
          const invalid = (required && !value) || length(value) > maximum || (key === 'note' ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : controls).test(value) || (key === 'countryCode' && !/^[A-Z]{2}$/.test(value));
          if (invalid) errors['delivery-' + key] = key === 'countryCode' ? ui('İki harfli ülke kodunu yazın (TR, GB gibi).') : ui('Bu alanı kontrol edin (en fazla {0} karakter).',{0:maximum});
          else if (value) delivery.address[key] = value;
        }
      }
      return {errors,contact,delivery};
    }
    function newKey() {
      if (crypto.randomUUID) return crypto.randomUUID();
      return Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) => n.toString(16).padStart(2, '0')).join('');
    }
    async function submit(input) {
      if (destroyed || busy || preparing || reordering || Date.now() < retryUntil || auth.status === 'unavailable' || pending?.authorizationChanged || pending?.recoveryFailed) return;
      const stamp = generation;
      // An unresolved attempt must replay exactly; no new key or semantic edits.
      if (!pending?.payload) {
        if ((!pending && !validCart()) || !cart.length) { message(ui("Sepetteki ürünleri ve miktarları kontrol edin.")); emit(); return; }
        const {errors,contact,delivery} = validate(input);
        if (Object.keys(errors).length) return {errors};
        if (!pending && !deliveryMethods.includes(deliveryMethod)) { message(ui("Teslimat yöntemini kontrol edin.")); emit(); return; }
        if (!['pickup','shipping'].includes(deliveryMethod)) { message(ui('Teslimat yöntemini kontrol edin.')); emit(); return; }
        try {
          const key = pending?.key || newKey();
          const endpoint = pending?.endpoint || (isPrivate() ? 'dealer/order.php' : 'order.php');
          const payload = {idempotencyKey:key,items:cart.map(item => ({productId:item.productId,quantity:item.q / scale})),delivery,
            paymentMethod:input?.paymentMethod, quoteId:input?.quoteId, consent:input?.consent,
            ...(endpoint === 'dealer/order.php' ? {note:contact.note || '',catalogRevision:pending?.catalogRevision || catalogRevision} : contact)};
          const semantic = {...payload,items:[...payload.items].sort((a,b) => a.productId.localeCompare(b.productId))};
          delete semantic.idempotencyKey; delete semantic.catalogRevision;
          if (auth.account && semantic.buyer) semantic.buyer = {phone:semantic.buyer.phone};
          preparing = true; emit();
          const fingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(semantic))))].map(value => value.toString(16).padStart(2,'0')).join('');
          if (!current(stamp)) return;
          if (pending && fingerprint !== pending.fingerprint) { message(ui('Tekrar deneme bilgileri önceki siparişle eşleşmiyor. Yeni sipariş göndermeyin; önceki bilgileri kontrol edin veya işletmeyle iletişime geçin.')); return; }
          if (new TextEncoder().encode(JSON.stringify(payload)).length > 16384) { message(ui("Sipariş bilgileri çok uzun. Notu veya sepeti kısaltın.")); return; }
          const marker = {version:2,key,method:delivery.method,endpoint,fingerprint,items:payload.items,catalogRevision:payload.catalogRevision || ''};
          write('sessionStorage',attemptKey,marker);
          if (read('sessionStorage',attemptKey)?.fingerprint !== fingerprint || read('sessionStorage',attemptKey)?.key !== key) throw new Error('attempt_storage_unavailable');
          pending = {...marker,payload};
        } catch (error) { message(ui(error?.message === 'attempt_storage_unavailable' ? 'Tekrar deneme bilgileri saklanamadı. Tarayıcı depolamasını açıp yeniden deneyin.' : 'Güvenli sipariş kimliği üretilemedi. Güncel bir tarayıcı ve güvenli bağlantı kullanın.')); return; }
        finally { if (stamp === generation) { preparing = false; emit(); } }
      }
      if (!current(stamp) || !pending?.payload) return;
      busy = true; message(''); emit();
      try {
        const response = await fetch(new URL(pending.endpoint,apiBase), {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...(isPrivate() ? {'X-YA-Dealer':'1'} : {})},
          body:JSON.stringify(pending.payload),signal:AbortSignal.timeout(20000)});
        if (!current(stamp)) return;
        if ([401,403].includes(response.status) && auth.account) { accountOwner?.clear('unavailable'); return; }
        const result = await response.json();
        if (!current(stamp)) return;
        if (response.status === 201 && result.ok === true && typeof result.order_id === 'string') {
          accepted(result);
        } else if (response.status === 409 && ['quote_changed','checkout_unconfigured','shipping_fee_unconfigured'].includes(result.code)) {
          forgetAttempt(); message(result.message || ui('Sipariş özetini yeniden inceleyin.')); emit('quote-changed');
        } else if (response.status === 409 && result.code === 'idempotency_conflict') {
          // No automatic new key: the original order may already have been accepted.
          message(ui("Tekrar deneme bilgileri önceki siparişle eşleşmiyor. Yeni sipariş göndermeyin; önceki bilgileri kontrol edin veya işletmeyle iletişime geçin."));
          pending.payload = null;
        } else if (response.status === 403 && result.code === 'online_sales_disabled') {
          forgetAttempt(); catalogStatus = 'disabled'; catalog.clear();
          catalogMessage = ui("Mağazamız şu anda online sipariş almıyor."); message(ui("Mağaza sipariş almayı durdurdu. Sepetiniz korunuyor."));
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
          clearTimeout(timer); timer = setTimeout(() => { message(ui("Bekleme süresi doldu. Aynı siparişi tekrar deneyebilirsiniz.")); emit(); }, retryUntil - Date.now());
        } else if ([400,422].includes(response.status) || (response.status === 409 && result.code === 'customer_link_pending')) {
          forgetAttempt(); message(ui("Sipariş gönderilemedi. Ürünleri, iletişim ve teslimat bilgilerini kontrol edin."));
        } else throw new Error('uncertain_submission');
      } catch {
        if (!current(stamp)) return;
        message(ui("Siparişin sonucu doğrulanamadı. Bilgileriniz ve sepetiniz korunuyor. Aynı siparişi tekrar deneyin; yeni bir sipariş başlatmayın."));
      } finally { if (current(stamp)) { busy = false; emit(); } }
    }
    function onStorage(event) {
      if (event.key === favoritesKey && catalogStatus === 'ready' && auth.status !== 'unavailable') { restoreFavorites(); emit(); }
    }
    function beforeUnload(event) { if (pending) { event.preventDefault(); event.returnValue = ''; } }
    return Object.freeze({
      get state() { return state(); },
      subscribe(listener) { listeners.add(listener); listener(state(),'initial'); return () => listeners.delete(listener); },
      start() {
        if (started || destroyed) return; started = true;
        window.addEventListener('storage',onStorage); window.addEventListener('beforeunload',beforeUnload);
        if (accountOwner) { unsubscribe = accountOwner.subscribe(setOwner); void accountOwner.ready.then(() => { if (!destroyed) setOwner(accountOwner.state); }); }
        else setOwner(auth);
      },
      async refresh() { if (destroyed) return; if (accountOwner) await accountOwner.refresh(); await loadCatalog(); },
      add,remove,clearCart,setQuantity,setDelivery,toggleFavorite,submit,validate,
      async quote(input) {
        if (!validCart() || auth.status === 'unavailable') throw new Error(ui('Sepetinizi kontrol edin.'));
        const stamp = generation, {delivery, errors} = validate(input);
        if (Object.keys(errors).some(key => key.startsWith('delivery-'))) throw new Error(ui('Teslimat adresini kontrol edin.'));
        const response = await fetch(new URL(isPrivate() ? 'dealer/checkout-quote.php' : 'checkout-quote.php',apiBase), {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-YA-Account':'1'},
          body:JSON.stringify({items:cart.map(item => ({productId:item.productId,quantity:item.q / scale})),delivery}),signal:AbortSignal.timeout(15000)});
        if ([401,403].includes(response.status) && auth.account) {accountOwner?.clear('unavailable');throw new Error(ui('Oturum değişti.'));}
        const result = await response.json();
        if (!current(stamp)) throw new Error(ui('Oturum değişti.'));
        if (!response.ok || result.ok !== true) throw new Error(result.message || ui('Sipariş toplamı doğrulanamadı.'));
        return result.quote;
      },
      reorder(id) { return prepareReorder(id); },
      newOrder() { if (!receipt || pending || busy) return; receipt = null; reorderBlocked = false; emit('new-order'); void loadCatalog(); },
      destroy() { if (destroyed) return; closePrivate(true); destroyed = true; unsubscribe?.(); listeners.clear(); window.removeEventListener('storage',onStorage); window.removeEventListener('beforeunload',beforeUnload); },
      quantity,discrete,safeImage
    });
  }
  const shared = new Map();
  window.YaCommerce = Object.freeze({create, shared(options = {}) {
    const key = new URL(options.apiBase || '/yardimci-asistan/api/',location.href).href;
    if (!shared.has(key)) shared.set(key,create(options));
    return shared.get(key);
  }});
})();
