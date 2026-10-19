/* Market Pilot owns presentation. Only public HTTP projections supply business data. */
(() => {
  'use strict';
  const config = JSON.parse(document.getElementById('market-config').textContent);
  const one = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  const api = '/yardimci-asistan/api/';
  const params = new URLSearchParams(location.search);
  const pageSize = 24;
  let language = 'tr', business = null, catalog = null, marketing = null, generation = 0;
  let page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
  const t = source => language === 'en' ? (config.english[source] ?? source) : source;
  const locale = () => language === 'en' ? 'en-GB' : 'tr-TR';
  const number = value => new Intl.NumberFormat(locale()).format(value);
  const englishEnabled = payload => payload?.localization?.version === 1
    && payload.localization.source_language === 'tr' && payload.localization.target_languages?.includes('en') === true;
  const localized = (payload, kind, id, record, field) => {
    const value = language === 'en' && englishEnabled(payload)
      ? payload.localization.translations?.[kind]?.[id]?.en?.[field] : undefined;
    return typeof value === 'string' && value.trim() ? value : String(record?.[field] ?? '');
  };
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const href = (path, extra = {}) => {
    const url = new URL(path, location.origin);
    url.searchParams.set('lang', language);
    for (const [key, value] of Object.entries(extra)) if (value !== '') url.searchParams.set(key, value);
    return url.pathname + url.search + url.hash;
  };
  async function read(name) {
    const response = await fetch(api + name + '.php', {cache: 'no-store', signal: AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('public_api_unavailable');
    const payload = await response.json();
    if (payload.ok !== true) throw new Error('public_api_unavailable');
    return payload;
  }
  const catalogEnabled = () => catalog?.enabled === true && business?.business?.public_surfaces?.includes('store') === true;
  const products = () => catalogEnabled() && Array.isArray(catalog.products) ? catalog.products : [];
  const categories = () => catalogEnabled() && Array.isArray(catalog.categories) ? catalog.categories : [];
  const productText = (p, field) => localized(catalog, 'catalog_product', p.product_id, p, field);
  function image(url, title, publishedMedia = false) {
    const box = el('div', undefined, 'product-media');
    box.append(el('span', t('Fotoğraf bulunmuyor')));
    if (typeof url !== 'string' || !url) return box;
    try {
      const parsed = new URL(url, location.origin);
      if (publishedMedia ? parsed.origin !== location.origin || !parsed.pathname.startsWith('/yardimci-asistan/media/') : parsed.protocol !== 'https:') return box;
      const img = el('img');
      img.alt = title; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
      img.addEventListener('load', () => {box.firstChild.hidden = true;});
      img.addEventListener('error', () => {img.remove(); box.firstChild.hidden = false;});
      img.src = parsed.href; box.append(img);
    } catch { /* Invalid media remains an honest missing-photo state. */ }
    return box;
  }
  function productCard(p, detail = false) {
    const card = el('article', undefined, 'product-card');
    const name = productText(p, 'name');
    card.append(image(p.image_url, name));
    card.append(el(detail ? 'h1' : 'h2', name));
    if (detail) card.append(el('p', productText(p, 'description'), 'product-description'));
    let price;
    try { price = new Intl.NumberFormat(locale(), {style: 'currency', currency: p.currency}).format(p.price); }
    catch { price = `${number(p.price)} ${p.currency}`; }
    card.append(el('p', price, 'price'));
    const units = {piece:'adet',kg:'kg',g:'g',l:'l',ml:'ml',pack:'paket',box:'kutu',meter:'metre',other:'birim'};
    card.append(el('p', t('Birim') + ': ' + t(units[p.unit] ?? p.unit), 'unit'));
    if (detail && p.sku) card.append(el('p', 'SKU: ' + p.sku));
    if (!detail) {
      const link = el('a', t('Ürünü incele'), 'button subtle');
      const filters = one('[data-filter-form]');
      const productHref = () => href('/magaza/urun/', {id:p.product_id, q:filters?.elements.q.value ?? '', category:filters?.elements.category.value ?? '', page:String(page)});
      link.href = productHref();
      link.addEventListener('click', () => {link.href = productHref();});
      card.append(link);
    }
    return card;
  }
  function updateLanguage() {
    language = config.requestedLanguage === 'en' && englishEnabled(business) ? 'en' : 'tr';
    document.documentElement.lang = language;
    all('[data-ui]').forEach(node => {node.textContent = t(node.dataset.ui);});
    all('[data-ui-aria]').forEach(node => {node.setAttribute('aria-label', t(node.dataset.uiAria));});
    one('[data-language-picker]').hidden = !englishEnabled(business);
    const trigger = one('.flag-language__trigger');
    trigger.setAttribute('aria-label', t('Dil değiştir')); trigger.title = t('Dil değiştir');
    one('.flag-language__choices').setAttribute('aria-label', t('Dil değiştir'));
    const flag = one('.flag-language__cloth--active img'); flag.src = '/assets/flags/' + language + '.svg';
    all('.flag-language__choice').forEach(button => {
      button.classList.toggle('is-current', button.value === language);
      button.setAttribute('aria-pressed', String(button.value === language));
    });
    all('a[href^="/"]').forEach(link => {
      const url = new URL(link.href); url.searchParams.set('lang', language); link.href = url.pathname + url.search + url.hash;
    });
  }
  function renderBusiness() {
    const b = business?.business;
    all('[data-business-name]').forEach(node => {node.textContent = b?.display_name || 'Market Pilot';});
    document.title = (b?.display_name || 'Market Pilot') + ' · ' + t(document.body.dataset.page === 'home' ? 'Günlük alışveriş' : 'Ürün kataloğu');
    const businessId = Object.keys(business?.localization?.translations?.business ?? {})[0] ?? '';
    const description = one('[data-business-description]');
    if (description) description.textContent = localized(business, 'business', businessId, b, 'description');
    const about = one('[data-business-about]');
    if (about) about.textContent = localized(business, 'business', businessId, b, 'about_text');
    const contact = one('[data-contact]');
    if (contact) {
      contact.replaceChildren();
      if (b?.address) {const detail = el('div', undefined, 'detail'); detail.append(el('span', t('Adres')), el('strong', b.address)); contact.append(detail);}
      const digits = String(b?.phone ?? '').replace(/[^+0-9]/g, '');
      if (/^\+?\d{7,15}$/.test(digits)) {
        const detail = el('div', undefined, 'detail'), link = el('a', b.phone); link.href = 'tel:' + digits;
        detail.append(el('span', t('Telefon')), link); contact.append(detail);
      }
      if (!contact.children.length) contact.append(el('p', t(b ? 'Henüz yayınlanmış iletişim bilgisi bulunmuyor.' : 'İşletme bilgilerine şu anda ulaşılamıyor.')));
    }
    all('[data-catalog-link]').forEach(link => {link.hidden = !catalogEnabled();});
    one('[data-chat-form]').hidden = b?.ai_enabled !== true;
    one('[data-chat-state]').textContent = b?.ai_enabled === true ? t('Ürünler ve işletme hakkında sorabilirsiniz.') : t(b ? 'Asistan şu anda kapalı. İletişim bilgilerimizi kullanabilirsiniz.' : 'Asistana şu anda ulaşılamıyor. Lütfen yeniden deneyin.');
  }
  const catalogState = () => !catalog || !business ? 'Kataloğa şu anda ulaşılamıyor. Lütfen yeniden deneyin.'
    : !catalogEnabled() ? 'Ürün kataloğu şu anda yayında değil.' : !products().length ? 'Henüz yayınlanmış ürün bulunmuyor.' : '';
  function renderHome() {
    const grid = one('[data-category-grid]');
    if (!grid) return;
    grid.replaceChildren();
    for (const category of categories()) {
      const link = el('a', undefined, 'category-card');
      link.href = href('/magaza/', {category:category.id});
      link.append(el('h3', localized(catalog, 'catalog_category', category.id, category, 'name'))); grid.append(link);
    }
    one('[data-category-state]').textContent = t(catalogState() || (categories().length ? '' : 'Ürünleri katalogda inceleyebilirsiniz.'));
    const campaigns = one('[data-marketing-grid]'); campaigns.replaceChildren();
    for (const item of marketing?.publications ?? []) {
      const card = el('article', undefined, 'category-card');
      for (const media of item.images ?? []) if (media.url) card.append(image(media.url, localized(marketing,'marketing',item.id,item,'title'), true));
      card.append(el('h3', localized(marketing,'marketing',item.id,item,'title')), el('p',localized(marketing,'marketing',item.id,item,'text')));
      campaigns.append(card);
    }
    one('[data-marketing-section]').hidden = !campaigns.children.length;
  }
  function renderCatalog() {
    const grid = one('[data-product-grid]');
    if (!grid) return;
    const form = one('[data-filter-form]');
    const select = form.elements.category, selected = select.value || params.get('category') || '';
    select.replaceChildren(new Option(t('Tüm kategoriler'), ''));
    for (const category of categories()) select.add(new Option(localized(catalog,'catalog_category',category.id,category,'name'), category.id));
    select.value = categories().some(c => c.id === selected) ? selected : '';
    const query = form.elements.q.value.trim().toLocaleLowerCase(locale());
    const matches = products().filter(p => (!select.value || p.category_id === select.value)
      && [productText(p,'name'), productText(p,'description'), p.name, p.description, p.sku].join(' ').toLocaleLowerCase(locale()).includes(query));
    const pages = Math.max(1, Math.ceil(matches.length / pageSize)); page = Math.min(page, pages);
    grid.replaceChildren(...matches.slice((page-1)*pageSize, page*pageSize).map(p => productCard(p)));
    one('[data-catalog-state]').textContent = t(catalogState() || (!matches.length ? 'Aramanızla eşleşen ürün bulunamadı.' : '')) || (matches.length === 1 ? t('1 ürün') : `${number(matches.length)} ${t('ürün')}`);
    one('[data-pagination]').hidden = pages <= 1;
    one('[data-page-number]').textContent = `${number(page)} / ${number(pages)}`;
    one('[data-previous]').disabled = page <= 1; one('[data-next]').disabled = page >= pages;
    const url = new URL(location.href);
    for (const [key,value] of Object.entries({q:form.elements.q.value, category:select.value, page:page > 1 ? String(page) : ''})) {
      if (value) url.searchParams.set(key,value); else url.searchParams.delete(key);
      if (value) params.set(key,value); else params.delete(key);
    }
    history.replaceState(null,'',url);
  }
  function renderDetail() {
    const root = one('[data-product-detail]'); if (!root) return;
    const product = products().find(p => p.product_id === params.get('id'));
    root.replaceChildren(...(product ? [productCard(product,true)] : []));
    one('[data-detail-state]').textContent = product ? '' : t(catalogState() || 'Bu ürün artık yayında değil veya bulunamadı.');
    const back = one('main a'); back.href = href('/magaza/', {q:params.get('q') ?? '', category:params.get('category') ?? '', page:params.get('page') ?? ''});
  }
  async function load() {
    const current = ++generation;
    const reload = one('[data-reload]'); if (reload) reload.disabled = true;
    const results = await Promise.allSettled(['business','catalog','marketing'].map(read));
    if (current !== generation) return;
    [business,catalog,marketing] = results.map(result => result.status === 'fulfilled' ? result.value : null);
    updateLanguage(); renderBusiness(); renderHome(); renderCatalog(); renderDetail();
    if (reload) reload.disabled = false;
  }
  const form = one('[data-filter-form]');
  if (form) {
    form.elements.q.value = params.get('q') ?? '';
    form.addEventListener('submit', event => {event.preventDefault(); page=1; renderCatalog();});
    let timer;
    form.elements.q.addEventListener('input', () => {clearTimeout(timer); timer=setTimeout(() => {page=1; renderCatalog();},150);});
    form.elements.category.addEventListener('change', () => {page=1; params.delete('category'); renderCatalog();});
    one('[data-previous]').addEventListener('click', () => {page--; renderCatalog();});
    one('[data-next]').addEventListener('click', () => {page++; renderCatalog();});
    one('[data-reload]').addEventListener('click', load);
  }
  let chatBusy = false;
  const chat = one('[data-chat-form]'), message = chat.elements.message;
  message.addEventListener('input', () => message.setCustomValidity(''));
  message.addEventListener('invalid', () => {message.setCustomValidity(t('Lütfen sorunuzu yazın (en fazla 1200 karakter).'));});
  chat.addEventListener('submit', async event => {
    event.preventDefault(); if (chatBusy || business?.business?.ai_enabled !== true) return;
    if (!message.value.trim()) {message.setCustomValidity(t('Lütfen sorunuzu yazın (en fazla 1200 karakter).')); message.reportValidity(); return;}
    chatBusy = true; chat.querySelector('button').disabled = true;
    one('[data-chat-state]').textContent = t('Yanıt hazırlanıyor…'); one('[data-chat-answer]').textContent = '';
    try {
      const response = await fetch(api+'chat.php', {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:message.value, source:'web', response_language:language}), signal:AbortSignal.timeout(45000)});
      const result = await response.json();
      if (!response.ok || result.ok !== true || result.fallback === true || typeof result.answer !== 'string' || !result.answer.trim()) throw new Error('chat_unavailable');
      one('[data-chat-answer]').textContent = result.answer;
      one('[data-chat-state]').textContent = t('Yanıt bilgilendirme amaçlıdır; sipariş veya ödeme onayı değildir.');
    } catch {one('[data-chat-state]').textContent = t('Asistana şu anda ulaşılamıyor. Lütfen yeniden deneyin.');}
    finally {chatBusy = false; chat.querySelector('button').disabled = false;}
  });
  load();
})();
