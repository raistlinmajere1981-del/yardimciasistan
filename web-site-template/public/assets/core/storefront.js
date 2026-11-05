/* One customer catalog/cart. Account session and server catalogs remain authoritative. */
(() => {
  'use strict';
  const demoLang = window.DemoLanguage || {
    ui: (key, params) => {
      let text = key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return text;
    },
    locale: 'tr-TR'
  };
  const { ui, locale } = demoLang;
  const root = document.querySelector('.ya-storefront');
  if (!root) return;
  const $ = (id) => root.querySelector(`#${id}`);
  // Hosts can set data-api-base; the default follows the module asset, not the page route.
  const script = document.currentScript;
  const apiBase = new URL(script.dataset.apiBase || '/yardimci-asistan/api/', script.src);
  const scope = new URL('../', apiBase).pathname;
  const accountOwner = window.YaAccount;
  let auth = accountOwner?.state || {status:'guest',account:null,generation:0};
  let ownerKey = '', generation = 0, loadSequence = 0, catalogRevision = '';
  let cartKey = '', attemptKey = '', favoritesKey = '', restored = false;
  const identity = state => state.status === 'authenticated' ? `account:${state.account.id}` : 'guest';
  const selected = new Set();
  let localPhoto = '', compareGeneration = 0;
  const filters = {q:'',category:'',brand:'',sku:''};
  let categories = [];
  let favorites = new Set(), favoritesOnly = false, pageNumber = 1;
  const pageSize = 18;
  const parameters = new URLSearchParams(location.search);
  const reorderId = parameters.get('reorder');
  let reorderHandled = false, reordering = false;
  for (const key of Object.keys(filters)) filters[key] = (parameters.get(key) || '').slice(0,180);
  const isPrivate = () => auth.status === 'authenticated' && Boolean(auth.account?.dealer);
  const current = stamp => stamp === generation && auth.status !== 'unavailable';
  // Failure to verify account status must fence private data and checkout,
  // but must not erase the independently authorized public product listing.
  const publicReadOnly = () => auth.status === 'unavailable' && auth.reason === 'unavailable' && !auth.account;
  const catalogCurrent = stamp => stamp === generation && (auth.status !== 'unavailable' || publicReadOnly());
  const units = { piece: ui("adet"), kg: 'kg', g: 'g', l: 'l', ml: 'ml', pack: ui("paket"), box: ui("kutu"), meter: ui("metre"), other: ui("birim") };
  const discrete = (unit) => ['piece', 'pack', 'box'].includes(unit);
  const scale = 10000;
  let catalog = new Map(), catalogStatus = 'loading', loading = false;
  let deliveryMethods = [], deliveryMethod = '';
  const deliveryLabels = { pickup: ui("İşletmeden teslim"), shipping: ui("Kargo ile gönderim") };
  let cart = [], pending = null, busy = false, preparing = false, retryUntil = 0, timer;
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
    return { product_id: raw.product_id, name: raw.name, description: typeof raw.description === 'string' ? raw.description.slice(0, 2000) : '',
      sku: typeof raw.sku === 'string' ? raw.sku.slice(0,80) : '',
      brand: typeof raw.brand === 'string' ? raw.brand.slice(0,180) : '',
      category_id: typeof raw.category_id === 'string' ? raw.category_id.slice(0,180) : '',
      category_name: typeof raw.category_name === 'string' ? raw.category_name.slice(0,180) : '',
      price: raw.price, currency: raw.currency, unit: raw.unit, image_url: cover, image_urls: images, availability: 'available' };
  }
  function quantity(value, unit) {
    if (!/^\d+(?:[.,]\d{1,4})?$/.test(String(value))) return null;
    const n = Number(String(value).replace(',', '.'));
    if (!(n > 0 && n <= 1000) || (discrete(unit) && !Number.isInteger(n))) return null;
    return Math.round(n * scale);
  }
  // Store IDs and quantities only. Private prices, personal fields and whole payloads stay in memory.
  function restoreCart() {
    if (restored) return;
    restored = true;
    const saved = window.YaCartDraft?.read(ownerKey) || read('localStorage',cartKey);
    if (saved?.version === 2 && Array.isArray(saved.items) && saved.items.length <= 50) {
      const seen = new Set();
      for (const item of saved.items) {
        const product = catalog.get(item.productId);
        const q = product ? quantity(item.quantity, product.unit) : null;
        if (q && !seen.has(item.productId)) { cart.push({productId:item.productId,display:product,q}); seen.add(item.productId); }
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
      $('checkout').hidden = false;
      message(ui('Önceki gönderimin sonucu belirsiz. Aynı iletişim ve teslimat bilgileriyle tekrar deneyin. Yeni sipariş göndermeyin.'));
    }
  }
  function persistCart() {
    if (!cartKey) return;
    const items = cart.map(item => ({productId:item.productId,quantity:item.q / scale}));
    if (window.YaCartDraft) window.YaCartDraft.save(ownerKey,items);
    else write('localStorage',cartKey,items.length ? {version:2,items} : null);
  }
  function clearComparison() {
    selected.clear(); compareGeneration++;
    if (localPhoto) URL.revokeObjectURL(localPhoto);
    localPhoto = '';
    $('comparison-panel')?.replaceChildren(); if ($('comparison-panel')) $('comparison-panel').hidden = true;
  }
  function closePrivate(preserveDraft = false) {
    generation++; loadSequence++; loading = false;
    if (cartKey && !preserveDraft) { if (window.YaCartDraft) window.YaCartDraft.clear(ownerKey); else write('localStorage',cartKey,null); }
    catalog.clear(); catalogStatus = 'error'; catalogRevision = ''; categories = []; deliveryMethods = [];
    cart = []; pending = null; busy = false; preparing = false; reordering = false; restored = false;
    favorites.clear(); favoritesOnly = false; pageNumber = 1;
    $('favorites-only').checked = false; $('favorites-only').disabled = true; $('catalog-pagination').hidden = true;
    clearComparison(); $('checkout-form').reset(); $('checkout').hidden = true;
    $('product-detail')?.replaceChildren(); if ($('product-detail')) $('product-detail').hidden = true;
    $('success').hidden = true; $('reference').textContent = '';
    $('store-layout').hidden = false; $('product-grid').replaceChildren();
    $('cart-lines').replaceChildren(); $('subtotal').replaceChildren(); $('cart-count').textContent = '0';
    $('catalog-account').textContent = ''; $('catalog-account').hidden = true;
    $('cart-message').textContent = ''; message('');
    for (const id of ['catalog-category','catalog-brand']) $(id)?.replaceChildren();
    $('catalog-count').textContent = ''; $('compare-open').disabled = true;
    $('catalog-state').hidden = false;
    $('refresh').disabled = false; $('product-grid').setAttribute('aria-busy','false');
    $('catalog-state').textContent = ui('Hesap şu anda doğrulanamıyor. Lütfen yeniden deneyin.');
    updateControls();
  }
  function setOwner(state) {
    const key = identity(state);
    const changed = key !== ownerKey || state.generation !== auth.generation || state.status === 'unavailable';
    const samePublicGuest = key === 'guest' && ownerKey === 'guest' && !auth.account && !state.account
      && !['hidden','pagehide','offline'].includes(state.reason);
    if (changed && ownerKey && !samePublicGuest) closePrivate(['hidden','pagehide'].includes(state.reason) || (!auth.account && state.reason === 'offline'));
    auth = state; ownerKey = key;
    cartKey = `ya:storefront:${scope}:${encodeURIComponent(ownerKey)}:cart:v2`;
    attemptKey = `ya:storefront:${scope}:${encodeURIComponent(ownerKey)}:attempt:v2`;
    favoritesKey = `ya:storefront:${scope}:${encodeURIComponent(ownerKey)}:favorites:v1`;
    if (state.account) {
      $('buyer-name').value = state.account.fullName || ''; $('buyer-email').value = state.account.email || '';
    }
    $('buyer-name').readOnly = Boolean(state.account); $('buyer-email').readOnly = Boolean(state.account);
    if (publicReadOnly()) {
      if (!samePublicGuest || (!restored && !loading)) void loadCatalog();
      if (catalogStatus === 'ready') {
        $('catalog-state').hidden = false;
        $('catalog-state').textContent = ui('Hesap şu anda doğrulanamıyor. Lütfen yeniden deneyin.');
      }
      renderProducts(); renderCart();
    } else if (state.status !== 'unavailable' && ((changed && !samePublicGuest) || (!restored && !loading))) void loadCatalog();
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
      if (url.protocol !== 'https:' || url.hostname.endsWith('.') || url.username || url.password || url.search || url.hash
        || !url.hostname.includes('.') || /^[\d.:[\]]+$/.test(url.hostname) || /\.(local|localhost|internal|test)$/.test(url.hostname)) return '';
      return url.href;
    } catch { return ''; }
  }
  function productUrl(id) {
    const url = new URL(location.pathname,location.origin); url.searchParams.set('page','catalog');
    const language = new URLSearchParams(location.search).get('lang');
    if (language && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language)) url.searchParams.set('lang',language);
    for (const [key,value] of Object.entries(filters)) if (value) url.searchParams.set(key,value);
    if (id) url.searchParams.set('id',id);
    return url.pathname + url.search;
  }
  function accepted(result) {
    forgetAttempt(); cart = []; persistCart(); $('checkout-form').reset(); $('checkout').hidden = true;
    $('reference').textContent = result.order_id; $('success').hidden = false; $('store-layout').hidden = true; $('success').focus();
    message('');
  }
  function renderFilters() {
    for (const [id,rows,label,key] of [
      ['catalog-category',categories,ui('Tüm kategoriler'),'category'],
      ['catalog-brand',[...new Set([...catalog.values()].map(row => row.brand).filter(Boolean))].map(name => ({id:name,name})),ui('Tüm markalar'),'brand']
    ]) {
      const field = $(id); field.replaceChildren(); const all = el('option',label); all.value = ''; field.append(all);
      for (const row of rows) { const option = el('option',row.name); option.value = row.id; field.append(option); }
      field.value = filters[key];
    }
    $('catalog-brand-field').hidden = ![...catalog.values()].some(product => product.brand);
    $('catalog-category').closest('label').hidden = categories.length === 0;
    $('catalog-sku').closest('label').hidden = ![...catalog.values()].some(product => product.sku);
    $('catalog-search').value = filters.q; $('catalog-sku').value = filters.sku;
  }
  function syncFilterUrl() {
    const url = new URL(location.href);
    for (const [key,value] of Object.entries(filters)) { if (value) url.searchParams.set(key,value); else url.searchParams.delete(key); }
    history.replaceState(null,'',url.pathname + url.search + url.hash);
    // The header GET form must follow in-page filters, not its initial PHP snapshot.
    for (const form of document.querySelectorAll('.language-picker')) for (const [key,value] of Object.entries(filters)) {
      let field = form.querySelector(`input[name="${key}"]`);
      if (!value) { field?.remove(); continue; }
      if (!field) { field = document.createElement('input'); field.type = 'hidden'; field.name = key; form.append(field); }
      field.value = value;
    }
  }
  function restoreFavorites() {
    const saved = read('localStorage', favoritesKey);
    favorites = new Set(saved?.version === 1 && Array.isArray(saved.productIds)
      ? saved.productIds.filter(id => typeof id === 'string' && id.length <= 180 && catalog.has(id)) : []);
    $('favorites-only').disabled = catalogStatus !== 'ready' || auth.status === 'unavailable';
  }
  function favoriteButton(product) {
    const saved = favorites.has(product.product_id);
    const node = button(ui(saved ? 'Favorilerimden çıkar' : 'Favorilerime ekle'), () => {
      if (catalogStatus !== 'ready' || auth.status === 'unavailable' || !catalog.has(product.product_id)) return;
      // Re-read IDs so another tab's favorites are not overwritten by an old view.
      restoreFavorites();
      if (favorites.has(product.product_id)) favorites.delete(product.product_id); else favorites.add(product.product_id);
      write('localStorage',favoritesKey,{version:1,productIds:[...favorites]});
      renderProducts(); renderDetail();
    }, 'quiet');
    node.dataset.favoriteToggle = ''; node.dataset.productId = product.product_id;
    node.setAttribute('aria-pressed',String(saved));
    return node;
  }
  function renderDetail() {
    const detail = $('product-detail'), id = new URLSearchParams(location.search).get('id');
    detail.replaceChildren(); detail.hidden = !id;
    if (!id) return;
    const back = el('a',ui('Tüm ürünlere dön')); back.href = productUrl(''); detail.append(back);
    const product = catalog.get(id);
    if (!product) { const title = el('h2',ui('Ürün bulunamadı.')); title.id = 'product-detail-title'; detail.append(title); return; }
    const heading = el('h2',product.name); heading.id = 'product-detail-title'; detail.append(heading);
    if (product.image_url) { const image = el('img'); image.src = product.image_url; image.alt = product.name; image.className = 'product-detail-image'; detail.append(image); }
    if (product.image_urls.length > 1) detail.append(productGallery(product));
    for (const value of [product.sku ? `${ui('Stok kodu')}: ${product.sku}` : '',product.brand,product.category_name,product.description]) if (value) detail.append(el('p',value));
    detail.append(el('p',`${money(product.price,product.currency)} / ${units[product.unit]}`,'price'));
    const add = button(ui('Sepete ekle'),() => addProduct(product),'button');
    add.disabled = !deliveryMethods.length || Boolean(pending) || busy || reordering; detail.append(favoriteButton(product),add);
  }
  function updateComparisonControls() {
    $('compare-open').disabled = selected.size === 0 || catalogStatus !== 'ready';
    for (const input of root.querySelectorAll('.compare-select')) {
      input.checked = selected.has(input.dataset.productId);
      input.disabled = !input.checked && selected.size >= 2;
    }
    // Never leave stale private prices in an open comparison after a publication refresh.
    if (!$('comparison-panel').hidden) showComparison(false);
  }
  function showComparison(focus = true) {
    const panel = $('comparison-panel'); panel.replaceChildren(); panel.hidden = selected.size === 0;
    if (!selected.size) return;
    const heading = el('h2',ui('Ürün karşılaştırma')); heading.id = 'comparison-title'; panel.append(heading);
    panel.append(el('p',ui('Görsel benzerlik teknik uyumluluk onayı değildir.')));
    const close = button(ui('Karşılaştırmayı kapat'),() => { panel.hidden = true; if (localPhoto) URL.revokeObjectURL(localPhoto); localPhoto = ''; },'quiet'); panel.append(close);
    const grid = el('div',undefined,'comparison-grid'); panel.append(grid);
    for (const id of selected) {
      const product = catalog.get(id); if (!product) continue;
      const slot = el('article',undefined,'comparison-slot'); slot.dataset.compareSlot = id;
      slot.append(el('h3',product.name));
      if (product.image_url) {
        const viewport = el('div',undefined,'comparison-viewport'), image = el('img');
        image.src = product.image_url; image.alt = product.name; image.draggable = false;
        viewport.append(image); slot.append(viewport);
        let zoom = 1, x = 0, y = 0, rotation = 0, dragging = null;
        const paint = () => { image.style.transform = `translate(${x}px,${y}px) scale(${zoom}) rotate(${rotation}deg)`; };
        const tools = el('div',undefined,'comparison-tools');
        tools.append(button(ui('Yakınlaştır'),() => { zoom = Math.min(5,zoom + .25); paint(); }),
          button(ui('Uzaklaştır'),() => { zoom = Math.max(1,zoom - .25); paint(); }),
          button(ui('Döndür'),() => { rotation = (rotation + 90) % 360; paint(); }),
          button(ui('Sıfırla'),() => { zoom = 1; x = 0; y = 0; rotation = 0; paint(); }));
        viewport.addEventListener('pointerdown',event => { dragging = {x:event.clientX - x,y:event.clientY - y}; viewport.setPointerCapture(event.pointerId); });
        viewport.addEventListener('pointermove',event => { if (dragging) { x = event.clientX - dragging.x; y = event.clientY - dragging.y; paint(); } });
        for (const event of ['pointerup','pointercancel']) viewport.addEventListener(event,() => { dragging = null; });
        slot.append(tools);
        if (product.image_urls.length > 1) {
          const label = el('label',ui('Fotoğraf')), picker = el('select'); picker.setAttribute('aria-label',ui('Fotoğraf'));
          product.image_urls.forEach((url,index) => { const option = el('option',String(index + 1)); option.value = url; picker.append(option); });
          picker.addEventListener('change',() => { image.src = picker.value; x = 0; y = 0; zoom = 1; paint(); }); label.append(picker); slot.append(label);
        }
      }
      const fields = el('dl');
      for (const [label,value] of [[ui('Stok kodu'),product.sku],[ui('Marka'),product.brand],[ui('Kategori'),product.category_name],[ui('Açıklama'),product.description]]) {
        if (value) fields.append(el('dt',label),el('dd',value));
      }
      fields.append(el('dt',ui('Fiyat')),el('dd',money(product.price,product.currency))); slot.append(fields); grid.append(slot);
    }
    const photoLabel = el('label',ui('Cihaz fotoğrafı seç')), photo = el('input'); photo.type = 'file'; photo.accept = 'image/jpeg,image/png,image/webp';
    photoLabel.append(photo); panel.append(photoLabel,el('p',ui('Fotoğraf yalnız bu tarayıcıda kalır; otomatik yüklenmez.')));
    const local = el('div',undefined,'comparison-local'); panel.append(local);
    const addPhoto = () => { local.replaceChildren(); if (localPhoto) { const image = el('img'); image.src = localPhoto; image.alt = ui('Cihaz fotoğrafı'); local.append(image); } };
    addPhoto();
    photo.addEventListener('change',async () => {
      const file = photo.files?.[0], stamp = generation, revision = ++compareGeneration;
      if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) return;
      const url = URL.createObjectURL(file);
      try {
        const image = new Image(); image.src = url; await image.decode();
        if (!current(stamp) || revision !== compareGeneration || panel.hidden || !panel.isConnected) { URL.revokeObjectURL(url); return; }
        if (localPhoto) URL.revokeObjectURL(localPhoto); localPhoto = url; addPhoto();
      } catch { URL.revokeObjectURL(url); }
    });
    if (focus) panel.focus();
  }
  function productGallery(product) {
    const detail = el('details', undefined, 'product-photo-detail');
    detail.append(el('summary', ui('Fotoğraflar ({0})', {0: product.image_urls.length})));
    const media = el('div', undefined, 'product-photo-preview');
    const image = el('img'); image.referrerPolicy = 'no-referrer'; image.loading = 'lazy';
    const fallback = el('span', ui('Fotoğraf yüklenemedi')); fallback.hidden = true;
    media.append(image, fallback);
    image.addEventListener('error', () => { image.hidden = true; fallback.hidden = false; });
    image.addEventListener('load', () => { image.hidden = false; fallback.hidden = true; });
    const thumbnails = el('div', undefined, 'product-photo-thumbnails');
    thumbnails.setAttribute('role', 'group'); thumbnails.setAttribute('aria-label', ui('Ürün fotoğrafları'));
    const buttons = product.image_urls.map((url, index) => {
      const thumbnail = button('', () => select(index), 'secondary');
      thumbnail.setAttribute('aria-label', ui('{0}. fotoğrafı göster', {0: index + 1}));
      const small = el('img'); small.src = url; small.alt = ''; small.loading = 'lazy'; small.referrerPolicy = 'no-referrer';
      small.addEventListener('error', () => { thumbnail.replaceChildren(String(index + 1)); }, {once: true});
      thumbnail.append(small);
      thumbnail.addEventListener('keydown', event => {
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? product.image_urls.length - 1
          : event.key === 'ArrowRight' ? (index + 1) % product.image_urls.length
          : event.key === 'ArrowLeft' ? (index + product.image_urls.length - 1) % product.image_urls.length : null;
        if (target === null) return;
        event.preventDefault(); select(target); buttons[target].focus();
      });
      return thumbnail;
    });
    function select(index) {
      image.hidden = false; fallback.hidden = true;
      image.alt = ui('{0}, fotoğraf {1}', {0: product.name, 1: index + 1});
      image.src = product.image_urls[index];
      buttons.forEach((node, i) => node.setAttribute('aria-pressed', String(i === index)));
    }
    thumbnails.append(...buttons); select(0); detail.append(media, thumbnails); return detail;
  }
  function renderProducts() {
    $('product-grid').replaceChildren();
    $('catalog-pagination').hidden = true;
    if (catalogStatus !== 'ready') return;
    const fold = value => value.toLocaleLowerCase(locale).normalize('NFKD');
    const products = [...catalog.values()].filter(product => (!filters.q || fold([product.name,product.description,product.sku,product.brand,product.category_name].join(' ')).includes(fold(filters.q)))
      && (!filters.sku || fold(product.sku).includes(fold(filters.sku))) && (!filters.category || product.category_id === filters.category)
      && (!filters.brand || product.brand === filters.brand) && (!favoritesOnly || favorites.has(product.product_id)));
    $('catalog-count').textContent = ui('{0} ürün', {0:products.length});
    const pages = Math.max(1,Math.ceil(products.length / pageSize));
    pageNumber = Math.min(Math.max(1,pageNumber),pages);
    $('catalog-pagination').hidden = pages <= 1;
    $('catalog-prev').disabled = pageNumber === 1; $('catalog-next').disabled = pageNumber === pages;
    $('catalog-page-status').textContent = ui('Sayfa {0} / {1}',{0:pageNumber,1:pages});
    for (const product of products.slice((pageNumber - 1) * pageSize,pageNumber * pageSize)) {
      const card = el('article', undefined, 'product-card');
      card.dataset.productId = product.product_id;
      const media = el('div', undefined, 'product-media');
      const fallback = el('span', ui("Görsel yok")); media.append(fallback);
      const url = safeImage(product.image_url);
      if (url) {
        const image = el('img'); image.alt = product.name; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => { image.remove(); fallback.hidden = false; }, { once: true });
        fallback.hidden = true; image.src = url; media.append(image);
      }
      const body = el('div', undefined, 'product-body');
      const heading = el('h3'), link = el('a',product.name); link.href = productUrl(product.product_id); link.dataset.productLink = '';
      heading.append(link); body.append(heading);
      if (product.sku) body.append(el('p', `${ui('Stok kodu')}: ${product.sku}`, 'product-sku'));
      if (product.brand) body.append(el('p',product.brand));
      if (product.description) body.append(el('p', product.description, 'description'));
      if (product.image_urls.length > 1) body.append(productGallery(product));
      body.append(el('div', `${money(product.price, product.currency)} / ${units[product.unit]}`, 'price'), el('span', ui("Satışta"), 'availability'));
      const add = button(ui("Sepete ekle"), () => addProduct(product), ''); add.disabled = !deliveryMethods.length || Boolean(pending) || busy || reordering || auth.status === 'unavailable';
      const compareLabel = el('label',undefined,'compare-choice'), compare = el('input',undefined,'compare-select');
      compare.type = 'checkbox'; compare.checked = selected.has(product.product_id); compare.dataset.productId = product.product_id;
      compare.disabled = !selected.has(product.product_id) && selected.size >= 2;
      compare.addEventListener('change',() => { if (compare.checked) selected.add(product.product_id); else selected.delete(product.product_id); updateComparisonControls(); });
      compareLabel.append(compare,document.createTextNode(ui('Karşılaştır'))); body.append(compareLabel,favoriteButton(product),add);
      card.append(media, body); $('product-grid').append(card);
    }
    updateComparisonControls();
  }
  function validCart() { return cart.length > 0 && deliveryMethods.length > 0 && catalogStatus === 'ready' && cart.every((item) => catalog.has(item.productId) && quantity(item.q / scale, item.display.unit)); }
  function updateControls() {
    $('clear-cart').disabled = !cart.length || Boolean(pending) || busy || reordering;
    $('open-checkout').disabled = !validCart() || Boolean(pending) || busy || reordering || auth.status === 'unavailable';
    $('buyer-fields').disabled = busy || Boolean(pending?.payload);
    $('delivery-fields').disabled = busy || Boolean(pending?.payload);
    renderDelivery();
    $('submit-order').disabled = busy || reordering || auth.status === 'unavailable' || Boolean(pending?.authorizationChanged || pending?.recoveryFailed) || Date.now() < retryUntil || (!pending && !validCart());
    $('submit-order').textContent = busy ? ui("Gönderiliyor…") : pending ? ui("Aynı siparişi tekrar dene") : ui("Siparişi gönder");
    $('checkout-form').setAttribute('aria-busy', String(busy));
    const detailAdd = $('product-detail')?.querySelector('button.button');
    if (detailAdd) detailAdd.disabled = busy || reordering || Boolean(pending) || !deliveryMethods.length || catalogStatus !== 'ready' || auth.status === 'unavailable';
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
      const remove = button(ui("Kaldır"), () => { if (pending || busy || reordering) return; cart = cart.filter((line) => line !== item); persistCart(); renderCart(); }, 'quiet'); remove.setAttribute('aria-label', ui("{0}: satırı kaldır", {0: product.name}));
      for (const control of [minus, input, plus, remove]) { control.disabled = Boolean(pending) || busy || reordering || auth.status === 'unavailable'; controls.append(control); }
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
    if (pending || busy || reordering || auth.status === 'unavailable') return;
    if (!canChangeQuantity(item, q)) { $('cart-message').textContent = ui("Satır miktarı en fazla 1000, toplam miktar en fazla 10000 olabilir."); return; }
    item.q = q; persistCart(); renderCart();
  }
  function addProduct(product) {
    if (!deliveryMethods.length || catalogStatus !== 'ready' || pending || busy || reordering || auth.status === 'unavailable') return;
    const existing = cart.find((item) => item.productId === product.product_id);
    if (existing) {
      if (!canChangeQuantity(existing, existing.q + scale)) { $('cart-message').textContent = ui("Satır miktarı en fazla 1000, toplam miktar en fazla 10000 olabilir."); return; }
      changeQuantity(existing, existing.q + scale);
    }
    else if (cart.length >= 50 || cart.reduce((sum, item) => sum + item.q, 0) + scale > 10000 * scale) { $('cart-message').textContent = ui("Sepete en fazla 50 farklı ürün ve toplam 10000 birim ekleyebilirsiniz."); return; }
    else { cart.push({ productId: product.product_id, display: product, q: scale }); persistCart(); renderCart(); }
    $('cart-message').textContent = ui("{0} sepetinizde.", {0: product.name});
  }
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
  function consumeReorder() {
    const url = new URL(location.href); url.searchParams.delete('reorder');
    history.replaceState(null,'',url.pathname + url.search + url.hash);
    for (const input of document.querySelectorAll('.language-picker input[name="reorder"]')) input.remove();
  }
  function reorderMessage(text) { $('cart-message').textContent = text; message(text); }
  async function prepareReorder(stamp, blockedByAttempt) {
    if (!reorderId || reorderHandled || !current(stamp)) return;
    reorderHandled = true;
    consumeReorder();
    if (!auth.account || !/^[A-Za-z0-9_-]{1,180}$/.test(reorderId)) {
      reorderMessage(ui('Yeniden sipariş için hesabınızla giriş yapın.')); return;
    }
    if (blockedByAttempt || pending || busy || preparing || window.YaCartDraft?.hasPending(ownerKey) !== false) {
      reorderMessage(ui('Önce sonucu belirsiz siparişinizi kontrol edin.')); return;
    }
    if (catalogStatus !== 'ready' || !deliveryMethods.length) {
      reorderMessage(ui('Mağaza şu anda online sipariş almıyor.')); return;
    }
    reordering = true; renderCart(); renderProducts();
    try {
      // Only an order ID crosses the route. Lines are re-read from this account,
      // and every display/price below comes from the freshly authorized catalog.
      const result = await accountOwner.request('orders');
      if (!current(stamp) || !auth.account || pending || window.YaCartDraft.hasPending(ownerKey)) return;
      const order = result.orders?.find(row => row.order_id === reorderId);
      if (!order || !Array.isArray(order.items)) { reorderMessage(ui('Sipariş bulunamadı.')); return; }
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
      if (added) { cart = items; persistCart(); renderCart(); }
      reorderMessage(ui(!added ? 'Bu siparişin ürünleri artık katalogda yok veya erişilemiyor. Sepetiniz değiştirilmedi.'
        : missing ? '{0} ürün artık katalogda yok veya erişilemiyor; diğer ürünler güncel fiyatlarla sepete eklendi.' : 'Ürünler güncel fiyatlarla sepete eklendi.',{0:missing}));
      $('cart').focus();
    } catch {
      if (current(stamp)) reorderMessage(ui('Ürünler sepete eklenemedi. Güncel kataloğu ve miktar sınırlarını kontrol edin.'));
    } finally { if (current(stamp)) { reordering = false; renderProducts(); renderCart(); } }
  }
  async function loadCatalog() {
    if (loading || (auth.status === 'unavailable' && !publicReadOnly())) return;
    loading = true; const sequence = ++loadSequence, stamp = generation;
    catalogStatus = 'loading'; $('refresh').disabled = true;
    $('catalog-state').hidden = false; $('catalog-state').textContent = ui('Ürünler yükleniyor…'); $('product-grid').setAttribute('aria-busy','true');
    renderProducts(); renderCart();
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
      for (const id of [...selected]) if (!catalog.has(id)) selected.delete(id);
      restoreCart();
      for (const item of cart) if (catalog.has(item.productId)) item.display = catalog.get(item.productId);
      if (!result.enabled) { clearComparison(); if (auth.account) cart = []; }
      persistCart(); renderFilters(); renderDetail();
      $('catalog-account').hidden = !auth.account;
      $('catalog-account').textContent = auth.account?.fullName || '';
      $('catalog-state').textContent = !result.enabled || !deliveryMethods.length ? ui('Mağazamız şu anda online sipariş almıyor.') : !catalog.size ? ui('Şu anda satışta ürün bulunmuyor.') : '';
      $('catalog-state').hidden = result.enabled && deliveryMethods.length > 0 && catalog.size > 0;
      if (publicReadOnly() && catalogStatus === 'ready') {
        $('catalog-state').hidden = false;
        $('catalog-state').textContent = ui('Hesap şu anda doğrulanamıyor. Lütfen yeniden deneyin.');
      }
      const blockedByAttempt = Boolean(pending) || window.YaCartDraft?.hasPending(ownerKey) !== false;
      await recoverAttempt(stamp);
      await prepareReorder(stamp,blockedByAttempt);
    } catch {
      if (!catalogCurrent(stamp) || sequence !== loadSequence) return;
      if (auth.account) { accountOwner?.clear('unavailable'); return; }
      catalog.clear(); clearComparison(); catalogStatus = 'error';
      $('product-detail').replaceChildren(); $('product-detail').hidden = true;
      $('catalog-state').hidden = false; $('catalog-state').textContent = ui('Ürünler şu anda yüklenemiyor. Ürünleri yenile düğmesiyle tekrar deneyin.');
    } finally {
      if (catalogCurrent(stamp) && sequence === loadSequence) {
        loading = false; $('refresh').disabled = false; $('product-grid').setAttribute('aria-busy','false'); renderProducts(); renderCart();
      }
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
    if (busy || preparing || reordering || Date.now() < retryUntil || auth.status === 'unavailable' || pending?.authorizationChanged || pending?.recoveryFailed) return;
    const stamp = generation;
    // An unresolved attempt must replay exactly; no new key or semantic edits.
    if (!pending?.payload) {
      if ((!pending && !validCart()) || root.querySelector('.quantity-controls [aria-invalid="true"]') || !cart.length) { message(ui("Sepetteki ürünleri ve miktarları kontrol edin.")); return; }
      const contact = validateBuyer(); if (!contact) return;
      if (!pending && !deliveryMethods.includes(deliveryMethod)) { message(ui("Teslimat yöntemini kontrol edin.")); return; }
      const delivery = validateDelivery(); if (!delivery) return;
      try {
        const key = pending?.key || newKey();
        const endpoint = pending?.endpoint || (isPrivate() ? 'dealer/order.php' : 'order.php');
        const payload = {idempotencyKey:key,items:cart.map(item => ({productId:item.productId,quantity:item.q / scale})),delivery,
          ...(endpoint === 'dealer/order.php' ? {note:contact.note || '',catalogRevision:pending?.catalogRevision || catalogRevision} : contact)};
        const semantic = {...payload,items:[...payload.items].sort((a,b) => a.productId.localeCompare(b.productId))};
        delete semantic.idempotencyKey; delete semantic.catalogRevision;
        if (auth.account && semantic.buyer) semantic.buyer = {phone:semantic.buyer.phone};
        preparing = true;
        const fingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(semantic))))].map(value => value.toString(16).padStart(2,'0')).join('');
        if (!current(stamp)) return;
        if (pending && fingerprint !== pending.fingerprint) { message(ui('Tekrar deneme bilgileri önceki siparişle eşleşmiyor. Yeni sipariş göndermeyin; önceki bilgileri kontrol edin veya işletmeyle iletişime geçin.')); return; }
        if (new TextEncoder().encode(JSON.stringify(payload)).length > 16384) { message(ui("Sipariş bilgileri çok uzun. Notu veya sepeti kısaltın.")); return; }
        const marker = {version:2,key,method:delivery.method,endpoint,fingerprint,items:payload.items,catalogRevision:payload.catalogRevision || ''};
        write('sessionStorage',attemptKey,marker);
        if (read('sessionStorage',attemptKey)?.fingerprint !== fingerprint || read('sessionStorage',attemptKey)?.key !== key) throw new Error('attempt_storage_unavailable');
        pending = {...marker,payload};
      } catch (error) { message(ui(error?.message === 'attempt_storage_unavailable' ? 'Tekrar deneme bilgileri saklanamadı. Tarayıcı depolamasını açıp yeniden deneyin.' : 'Güvenli sipariş kimliği üretilemedi. Güncel bir tarayıcı ve güvenli bağlantı kullanın.')); return; }
      finally { preparing = false; }
    }
    busy = true; message(''); renderProducts(); renderCart();
    try {
      const response = await fetch(new URL(pending.endpoint,apiBase), {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...(isPrivate() ? {'X-YA-Dealer':'1'} : {})},
        body:JSON.stringify(pending.payload),signal:AbortSignal.timeout(20000)});
      if (!current(stamp)) return;
      if ([401,403].includes(response.status) && auth.account) { accountOwner?.clear('unavailable'); return; }
      const result = await response.json();
      if (!current(stamp)) return;
      if (response.status === 201 && result.ok === true && typeof result.order_id === 'string') {
        accepted(result);
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
      } else if ([400,422].includes(response.status) || (response.status === 409 && result.code === 'customer_link_pending')) {
        forgetAttempt(); message(ui("Sipariş gönderilemedi. Ürünleri, iletişim ve teslimat bilgilerini kontrol edin."));
      } else throw new Error('uncertain_submission');
    } catch {
      if (!current(stamp)) return;
      message(ui("Siparişin sonucu doğrulanamadı. Bilgileriniz ve sepetiniz korunuyor. Aynı siparişi tekrar deneyin; yeni bir sipariş başlatmayın."));
    } finally { if (current(stamp)) { busy = false; renderProducts(); renderCart(); } }
  }
  $('catalog-filters').addEventListener('submit',event => event.preventDefault());
  for (const [id,key,event] of [['catalog-search','q','input'],['catalog-sku','sku','input'],['catalog-category','category','change'],['catalog-brand','brand','change']]) {
    $(id).addEventListener(event,() => { filters[key] = $(id).value; pageNumber = 1; syncFilterUrl(); renderProducts(); });
  }
  $('catalog-reset').addEventListener('click',() => { for (const key of Object.keys(filters)) filters[key] = ''; favoritesOnly = false; $('favorites-only').checked = false; pageNumber = 1; renderFilters(); syncFilterUrl(); renderProducts(); });
  $('favorites-only').addEventListener('change',() => { favoritesOnly = $('favorites-only').checked; pageNumber = 1; renderProducts(); });
  for (const [id,step] of [['catalog-prev',-1],['catalog-next',1]]) $(id).addEventListener('click',() => { pageNumber += step; renderProducts(); });
  window.addEventListener('storage',event => { if (event.key === favoritesKey && catalogStatus === 'ready' && auth.status !== 'unavailable') { restoreFavorites(); renderProducts(); renderDetail(); } });
  $('compare-open').addEventListener('click',() => showComparison());
  $('delivery-method').addEventListener('change', () => { if (pending || busy) return; deliveryMethod = $('delivery-method').value; renderDelivery(); });
  $('refresh').addEventListener('click', async () => { if (accountOwner) await accountOwner.refresh(); await loadCatalog(); });
  $('clear-cart').addEventListener('click', () => { if (pending || busy || reordering) return; cart = []; persistCart(); renderCart(); });
  $('open-checkout').addEventListener('click', () => { if ($('open-checkout').disabled) return; $('checkout').hidden = false; (auth.account ? $('buyer-phone') : $('buyer-name')).focus(); });
  $('checkout-form').addEventListener('submit', submit);
  $('new-order').addEventListener('click', () => { $('success').hidden = true; $('store-layout').hidden = false; loadCatalog(); $('products').focus(); });
  window.addEventListener('beforeunload', (event) => { if (pending) { event.preventDefault(); event.returnValue = ''; } });
  if (accountOwner) { accountOwner.subscribe(setOwner); void accountOwner.ready.then(() => setOwner(accountOwner.state)); }
  else setOwner(auth);
})();
