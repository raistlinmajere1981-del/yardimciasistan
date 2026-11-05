/* Optional generic renderer. A site/catalog.js override replaces this entire view. */
(() => {
  'use strict';
  const root = document.querySelector('[data-commerce]');
  if (!root) return;
  const $ = name => root.querySelector(`[data-commerce-${name}]`);
  const {ui,locale} = window.DemoLanguage;
  const controller = window.YaCommerce.create({apiBase:document.currentScript.dataset.apiBase});
  const form = $('form');
  let checkoutOpen = false, reorderHandled = false;
  const parameters = new URLSearchParams(location.search);
  const money = (value,currency) => new Intl.NumberFormat(locale,{style:'currency',currency}).format(value);
  function el(tag,text) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; }
  function button(text,action) { const node = el('button',text); node.type = 'button'; node.addEventListener('click',action); return node; }
  controller.subscribe((state,reason) => {
    if (reason === 'fence' || reason === 'accepted') { form.reset(); checkoutOpen = false; }
    if (reason === 'owner' || reason === 'new-order') {
      for (const [name,value] of [['name',state.auth.account?.fullName],['email',state.auth.account?.email]]) {
        form.elements.namedItem(name).value = value || ''; form.elements.namedItem(name).readOnly = Boolean(state.auth.account);
      }
    }
    $('status').textContent = state.catalogMessage;
    $('message').textContent = state.submissionMessage; $('cart-message').textContent = state.cartMessage;
    $('products').replaceChildren(); $('products').setAttribute('aria-busy',String(state.loading));
    if (state.catalogStatus === 'ready') for (const product of state.products) {
      if (parameters.get('id') && parameters.get('id') !== product.product_id) continue;
      const row = el('article'); row.className = 'content-card';
      row.append(el('h2',product.name),el('p',product.description),el('p',money(product.price,product.currency)));
      const add = button(ui('Sepete ekle'),() => controller.add(product.product_id));
      add.disabled = !state.canEdit || !state.deliveryMethods.length; row.append(add); $('products').append(row);
    }
    const focusedName = document.activeElement?.getAttribute('data-commerce-quantity');
    $('lines').replaceChildren();
    if (!state.cart.length) $('lines').append(el('li',ui('Sepetiniz henüz boş.')));
    for (const item of state.cart) {
      const row = el('li'), input = el('input'); input.type = 'text'; input.inputMode = 'decimal'; input.value = String(item.q / state.scale);
      input.dataset.commerceQuantity = item.productId; input.setAttribute('aria-label',ui('{0}: miktar ({1})',{0:item.display.name,1:state.units[item.display.unit]}));
      input.disabled = !state.canEdit;
      input.addEventListener('change',() => { input.setAttribute('aria-invalid',String(!controller.setQuantity(item.productId,input.value))); });
      const remove = button(ui('Kaldır'),() => controller.remove(item.productId)); remove.disabled = !state.canEdit;
      row.append(el('strong',item.display.name),el('p',money(item.display.price,item.display.currency)),input,remove); $('lines').append(row);
    }
    if (focusedName) [...root.querySelectorAll('[data-commerce-quantity]')].find(node => node.dataset.commerceQuantity === focusedName)?.focus();
    $('totals').replaceChildren(...state.totals.map(total => el('p',ui('Ara toplam: {0}',{0:money(total.amount,total.currency)}))));
    $('checkout').disabled = !state.canCheckout;
    form.hidden = !checkoutOpen && !state.pending;
    $('buyer').disabled = state.busy || Boolean(state.pending?.hasPayload);
    $('delivery').disabled = state.busy || Boolean(state.pending?.hasPayload);
    for (const option of $('method').options) option.hidden = !state.deliveryMethods.includes(option.value);
    $('method').value = state.deliveryMethod; $('method').disabled = Boolean(state.pending);
    $('address').hidden = state.deliveryMethod !== 'shipping';
    $('submit').disabled = !state.canSubmit;
    $('submit').textContent = ui(state.busy ? 'Gönderiliyor…' : state.pending ? 'Aynı siparişi tekrar dene' : 'Siparişi gönder');
    $('success').hidden = !state.receipt; $('reference').textContent = state.receipt?.order_id || '';
    if (reason === 'accepted') { form.hidden = true; $('success').focus(); }
    if (reason === 'catalog' && !reorderHandled && parameters.get('reorder')) {
      reorderHandled = true; const url = new URL(location.href); url.searchParams.delete('reorder'); history.replaceState(null,'',url.pathname + url.search + url.hash);
      for (const field of document.querySelectorAll('.language-picker input[name="reorder"]')) field.remove();
      void controller.reorder(parameters.get('reorder'));
    }
  });
  $('checkout').addEventListener('click',() => { if (!controller.state.canCheckout) return; checkoutOpen = true; form.hidden = false; form.elements.namedItem(controller.state.auth.account ? 'phone' : 'name').focus(); });
  $('method').addEventListener('change',() => controller.setDelivery($('method').value));
  form.addEventListener('submit',async event => {
    event.preventDefault(); if (root.querySelector('[data-commerce-quantity][aria-invalid="true"]')) return;
    const input = Object.fromEntries(new FormData(form));
    input.address = Object.fromEntries(Object.entries(input).filter(([key]) => key.startsWith('delivery-')).map(([key,value]) => [key.slice(9),value]));
    const result = await controller.submit(input); let first;
    for (const error of root.querySelectorAll('[data-commerce-error]')) {
      const key = error.dataset.commerceError, field = form.elements.namedItem(key), text = result?.errors?.[key] || '';
      error.textContent = text; field.setAttribute('aria-invalid',String(Boolean(text))); if (text && !first) first = field;
    }
    first?.focus();
  });
  $('new').addEventListener('click',() => controller.newOrder());
  controller.start();
})();
