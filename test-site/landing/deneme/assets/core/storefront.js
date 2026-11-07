/* Optional generic renderer. A site/catalog.js override replaces this entire view. */
(() => {
  'use strict';
  const root = document.querySelector('[data-commerce]');
  if (!root) return;
  const $ = name => root.querySelector(`[data-commerce-${name}]`);
  const {ui,locale} = window.DemoLanguage;
  const controller = window.YaCommerce.shared({apiBase:document.currentScript.dataset.apiBase});
  let reorderHandled = false;
  const parameters = new URLSearchParams(location.search);
  const money = (value,currency) => new Intl.NumberFormat(locale,{style:'currency',currency}).format(value);
  function el(tag,text) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; }
  function button(text,action) { const node = el('button',text); node.type = 'button'; node.addEventListener('click',action); return node; }
  controller.subscribe((state,reason) => {
    $('status').textContent = state.catalogMessage;
    $('products').replaceChildren(); $('products').setAttribute('aria-busy',String(state.loading));
    if (state.catalogStatus === 'ready') for (const product of state.products) {
      if (parameters.get('id') && parameters.get('id') !== product.product_id) continue;
      const row = el('article'); row.className = 'content-card';
      row.append(el('h2',product.name),el('p',product.description),el('p',money(product.price,product.currency)));
      const add = button(ui('Sepete ekle'),() => controller.add(product.product_id));
      add.disabled = !state.canEdit || !state.deliveryMethods.length; row.append(add); $('products').append(row);
    }
    if (reason === 'catalog' && !reorderHandled && parameters.get('reorder')) {
      reorderHandled = true; const url = new URL(location.href); url.searchParams.delete('reorder'); history.replaceState(null,'',url.pathname + url.search + url.hash);
      for (const field of document.querySelectorAll('.language-picker input[name="reorder"]')) field.remove();
      void controller.reorder(parameters.get('reorder'));
    }
  });
  controller.start();
})();
