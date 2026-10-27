/* ID-only cart drafts: one storage owner across catalog and account routes. */
(() => {
  'use strict';
  let modulePath = '/yardimci-asistan';
  try { modulePath = JSON.parse(document.getElementById('site-context').textContent).apiBasePath || modulePath; } catch {}
  const scope = modulePath.replace(/\/$/,'') + '/';
  const prefix = `ya:storefront:${scope}:`;
  const key = owner => `${prefix}${encodeURIComponent(owner)}:cart:v2`;
  function read(owner) {
    try { return JSON.parse(localStorage.getItem(key(owner))); } catch { return null; }
  }
  function save(owner,items) {
    try {
      if (!items.length) localStorage.removeItem(key(owner));
      else localStorage.setItem(key(owner),JSON.stringify({version:2,items:items.map(item => ({productId:item.productId,quantity:item.quantity}))}));
    } catch { /* Draft storage is optional; submitting an attempt has a separate durable gate. */ }
  }
  function clear(owner) { try { localStorage.removeItem(key(owner)); } catch {} }
  function hasPending(owner) {
    // Recovery metadata belongs to the same cart owner, including on account routes.
    try { return sessionStorage.getItem(`${prefix}${encodeURIComponent(owner)}:attempt:v2`) !== null; }
    catch { return true; }
  }
  function reconcile(state) {
    if (['hidden','pagehide'].includes(state.reason)) return;
    const allowed = state.status === 'authenticated' ? key(`account:${state.account.id}`) : key('guest');
    try {
      for (const name of Object.keys(localStorage)) {
        if (!name.startsWith(prefix) || !name.endsWith(':cart:v2')) continue;
        if (name !== allowed) localStorage.removeItem(name);
      }
    } catch {}
  }
  window.YaCartDraft = Object.freeze({read,save,clear,hasPending});
  const account = window.YaAccount;
  if (account) { account.subscribe(reconcile); void account.ready.then(() => reconcile(account.state)); }
})();
