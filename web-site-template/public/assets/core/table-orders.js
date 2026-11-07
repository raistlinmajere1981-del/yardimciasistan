/* QR table-order guest surface. No pricing or table identity is trusted by the server. */
(() => {
  'use strict';
  const root = document.querySelector('[data-table-order]');
  if (!root) return;
  const token = root.dataset.tableToken || '';
  // Presentation-only demonstration. This branch never issues guest HTTP
  // requests and cannot authorize an order or enter the desktop adisyon.
  const simulated = root.dataset.demoSimulation === 'true';
  const apiBase = JSON.parse(document.getElementById('site-context').textContent).apiBasePath;
  const endpoint = apiBase + '/api/table-order.php';
  const ui = window.DemoLanguage.ui;
  const locale = window.DemoLanguage.locale;
  const status = root.querySelector('[data-table-order-status]');
  const cartView = root.querySelector('[data-table-order-cart]');
  const totalView = root.querySelector('[data-table-order-total]');
  const send = root.querySelector('[data-table-order-submit]');
  const orderNote = root.querySelector('[data-table-order-note]');
  if (simulated) send.textContent = ui('Simülasyonu tamamla');
  const storageKey = 'ya-qr-order:' + token;
  const cart = new Map();
  let enabled = false;
  let busy = false;
  let operationKey = crypto.randomUUID();

  const formatMoney = (amount, currency) => {
    try { return new Intl.NumberFormat(locale, {style:'currency', currency}).format(amount); }
    catch { return amount + ' ' + currency; }
  };
  const element = (tag, label) => {
    const node = document.createElement(tag);
    if (label !== undefined) node.textContent = label;
    return node;
  };
  const makeButton = (label, action) => {
    const button = element('button', label);
    button.type = 'button';
    button.addEventListener('click', () => { if (!busy) action(); });
    return button;
  };
  const save = (changed = true) => {
    if (changed) operationKey = crypto.randomUUID();
    try { sessionStorage.setItem(storageKey, JSON.stringify({items:[...cart.values()], note:orderNote.value, operationKey})); }
    catch { /* storage is optional */ }
  };
  try {
    const restored = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
    if (typeof restored.operationKey === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(restored.operationKey)) operationKey = restored.operationKey;
    if (Array.isArray(restored.items)) for (const item of restored.items) {
      if (typeof item.id !== 'string' || item.id.length > 180
        || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 20
        || typeof item.name !== 'string' || typeof item.currency !== 'string'
        || !Number.isFinite(item.price) || item.price < 0) continue;
      cart.set(item.id, {...item, note:String(item.note || '').slice(0,300)});
    }
    orderNote.value = String(restored.note || '').slice(0,500);
  } catch { /* malformed draft: ignore */ }

  function render() {
    cartView.replaceChildren();
    let total = 0;
    let currency = '';
    for (const item of cart.values()) {
      const row = element('div');
      row.className = 'table-order-cart-row';
      const title = element('strong', item.name);
      const controls = element('div');
      controls.className = 'table-order-cart-actions';
      const less = makeButton('−', () => {
        item.quantity -= 1;
        if (item.quantity < 1) cart.delete(item.id);
        save(); render();
      });
      less.setAttribute('aria-label', item.name + ' ' + ui('Adet') + ' −');
      const quantity = element('span', String(item.quantity));
      const more = makeButton('+', () => {
        if (item.quantity >= 20) return;
        item.quantity += 1; save(); render();
      });
      more.setAttribute('aria-label', item.name + ' ' + ui('Adet') + ' +');
      const remove = makeButton(ui('Sil'), () => { cart.delete(item.id); save(); render(); });
      controls.append(less, quantity, more, remove);
      const note = element('input');
      note.type = 'text'; note.maxLength = 300; note.value = item.note; note.disabled = busy;
      note.placeholder = ui('Ürün notu'); note.setAttribute('aria-label', item.name + ' ' + ui('Ürün notu'));
      note.addEventListener('input', () => { item.note = note.value; save(); });
      row.append(title, element('span', formatMoney(item.quantity * item.price, item.currency)), controls, note);
      cartView.append(row);
      total += item.quantity * item.price;
      currency = currency || item.currency;
    }
    if (!cart.size) cartView.append(element('p', ui('Henüz ürün eklenmedi.')));
    totalView.textContent = cart.size ? ui('Toplam') + ': ' + formatMoney(total, currency) : '';
    send.disabled = !enabled || busy || cart.size === 0;
    orderNote.disabled = busy;
    for (const add of document.querySelectorAll('.table-order-add')) add.disabled = busy;
  }
  orderNote.addEventListener('input', () => save());

  async function resolveTable() {
    status.textContent = simulated ? ui('Demo Masa B3 · Sipariş simülasyonu') : ui('Masa doğrulanıyor…');
    try {
      let tableName = 'Demo Masa B3';
      if (!simulated) {
        const response = await fetch(endpoint + '?table=' + encodeURIComponent(token), {cache:'no-store'});
        const result = await response.json();
        if (!response.ok || !result.ok) throw Error(result.message || '');
        tableName = result.table.name;
      }
      enabled = true;
      status.textContent = simulated ? ui('Demo Masa B3 · Sipariş simülasyonu')
        : ui('{name} için sipariş hazırlanıyor.', {name:tableName});
      for (const row of document.querySelectorAll('[data-menu-entry-id]')) {
        if (!row.dataset.menuPrice) continue;
        const price = Number(row.dataset.menuPrice);
        const currency = row.dataset.menuCurrency || '';
        const id = row.dataset.menuEntryId || '';
        if (!id || !Number.isFinite(price) || price < 0 || !/^[A-Z]{3}$/.test(currency)) continue;
        const add = makeButton(ui('Sepete ekle'), () => {
          const currentCurrency = [...cart.values()][0]?.currency;
          if (currentCurrency && currentCurrency !== currency) {
            status.textContent = ui('Aynı siparişte farklı para birimleri kullanılamaz.');
            return;
          }
          const current = cart.get(id);
          if (current) current.quantity = Math.min(20, current.quantity + 1);
          else cart.set(id, {id, name:row.dataset.menuName || id, quantity:1, price, currency, note:''});
          save(); render();
        });
        add.className = 'table-order-add';
        row.append(add);
      }
      render();
    } catch {
      enabled = false;
      status.textContent = ui('Masa QR kodu geçersiz veya sipariş kapalı.');
      send.disabled = true;
    }
  }

  send.addEventListener('click', async () => {
    if (busy || !enabled || !cart.size) return;
    busy = true; render();
    if (simulated) {
      cart.clear(); orderNote.value = ''; save();
      busy = false; render();
      status.textContent = ui('Demo tamamlandı. Gerçek sipariş veya talep gönderilmedi.');
      return;
    }
    status.textContent = ui('Sipariş gönderiliyor…');
    try {
      const response = await fetch(endpoint, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          table_token:token, idempotency_key:operationKey, note:orderNote.value,
          items:[...cart.values()].map(item => ({id:item.id,quantity:item.quantity,note:item.note}))
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw Error(result.message || ui('Sipariş gönderilemedi. Tekrar deneyin.'));
      cart.clear(); orderNote.value = ''; save(); render();
      status.textContent = ui('Sipariş talebiniz alındı. İşletme onayı bekleniyor. Referans: {id}', {id:result.request_id});
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : ui('Sipariş gönderilemedi. Tekrar deneyin.');
    } finally { busy = false; render(); }
  });
  void resolveTable();
  render();
})();
