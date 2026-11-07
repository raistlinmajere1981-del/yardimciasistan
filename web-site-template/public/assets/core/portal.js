(() => {
  'use strict';
  const {ui, locale} = window.DemoLanguage;
  const owner = window.YaAccount;
  const $ = id => document.getElementById(id);
  const element = (tag, text, className = '') => { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; };
  const statusLabel = status => ui(({awaiting_desktop:'Talep alındı · İşleme alınmayı bekliyor',placed:'Sipariş alındı',confirmed:'Onaylandı',fulfilled:'Tamamlandı',cancelled:'İptal edildi',rejected:'İşlenemedi'})[status] || 'Durum henüz doğrulanamadı');
  const paymentLabel = status => ui(({unpaid:'Ödeme bekleniyor',verification_pending:'Havale bildirildi · doğrulama bekliyor',paid:'Ödeme doğrulandı',rejected:'Ödeme doğrulanamadı',refunded:'Banka iadesi kaydedildi'})[status] || 'Ödeme bekleniyor');
  const deliveryLabel = status => ui(({unfulfilled:'Hazırlanmadı',preparing:'Hazırlanıyor',delivered:'Teslim edildi',cancelled:'İptal edildi',returned:'İade alındı'})[status] || 'Hazırlanmadı');
  let authMode = 'login';
  function renderAuth(available) {
    if (!available) authMode = 'login';
    for (const mode of ['login','register','recover']) {
      $('account-'+mode).hidden = mode !== authMode;
      const button = document.querySelector(`[data-account-mode="${mode}"]`);
      button.hidden = mode !== 'login' && !available;
      button.setAttribute('aria-pressed', String(mode === authMode));
    }
  }
  for (const button of document.querySelectorAll('[data-account-mode]')) button.addEventListener('click', () => {
    authMode = button.dataset.accountMode; renderAuth(config?.passwordRegistration && owner.state.status !== 'unavailable');
    $('account-'+authMode).querySelector('input')?.focus();
  });
  const message = text => { if ($('portal-message')) $('portal-message').textContent = text; };
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  const tokenAction = new URLSearchParams(location.search).get('action');
  const tokenFlow = token && ['verify', 'reset'].includes(tokenAction);
  const orderId = new URLSearchParams(location.search).get('order');
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  let config = null, profileGeneration = -1, orderGeneration = -1, orderRequest = 0, providersSignature = '';
  function clearPrivate() {
    $('account-profile').hidden = true; $('account-profile').reset(); $('account-email').textContent = '';
    $('account-orders').hidden = true; $('account-order-list').replaceChildren(); $('account-order-detail').replaceChildren();
    $('account-dealer-badge').hidden = true; $('logout').hidden = true; $('account-logout-all').hidden = true;
    profileGeneration = -1; orderGeneration = -1; orderRequest += 1;
    $('account-refresh-orders').disabled = false;
  }
  function renderProviders(account) {
    const signature = JSON.stringify([config?.providers, account?.id, account?.methods]);
    if (signature === providersSignature) return;
    providersSignature = signature;
    $('account-providers').replaceChildren();
    if (tokenFlow || !config?.enabled) return;
    for (const provider of config.providers || []) {
      if (account?.methods?.includes(provider)) continue;
      const button = element('button', (provider === 'google' ? 'Google' : 'Facebook') + (account ? ui(' hesabını bağla') : ui(' ile giriş')), 'quiet');
      button.type = 'button';
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { const result = await owner.request('oauth', {provider, link: Boolean(account)}); location.assign(result.url); }
        catch { message(ui('Hesap şu anda doğrulanamıyor. Lütfen yeniden deneyin.')); button.disabled = false; }
      });
      $('account-providers').append(button);
    }
  }
  function orderUrl(id) {
    const url = new URL(location.pathname,location.origin); url.searchParams.set('page', 'account');
    const language = new URLSearchParams(location.search).get('lang');
    if (language && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language)) url.searchParams.set('lang',language);
    if (id) url.searchParams.set('order', id); else url.searchParams.delete('order');
    return url.href;
  }
  function reorderLink(order) {
    const link = element('a', ui('Ürünleri yeniden sepete ekle'), 'button secondary');
    const catalogLink = {href: new URL('?page=catalog',location.href).href};
    if (!catalogLink || !/^[A-Za-z0-9_-]{1,180}$/.test(order.order_id)) return null;
    const url = new URL(catalogLink.href);
    url.searchParams.set('reorder', order.order_id); url.hash = 'cart';
    link.href = url.href; link.dataset.reorderOrder = order.order_id;
    const pending = () => window.YaCartDraft?.hasPending(`account:${owner.state.account?.id}`) !== false;
    link.setAttribute('aria-disabled', String(pending()));
    link.addEventListener('click', event => {
      if (owner.state.status !== 'authenticated' || pending()) {
        event.preventDefault(); message(ui('Önce sonucu belirsiz siparişinizi kontrol edin.'));
      }
    });
    return link;
  }
  async function loadOrders(generation) {
    orderGeneration = generation;
    const request = ++orderRequest;
    $('account-refresh-orders').disabled = true;
    try {
      const result = await owner.request('orders');
      if (request !== orderRequest || owner.state.generation !== generation || owner.state.status !== 'authenticated') return;
      const list = $('account-order-list'), detail = $('account-order-detail');
      list.replaceChildren(); detail.replaceChildren(); list.hidden = Boolean(orderId); detail.hidden = !orderId;
      if (orderId) {
        const back = element('a', ui('Siparişlerime dön')); back.href = orderUrl(null); detail.append(back);
        const order = (result.orders || []).find(row => row.order_id === orderId);
        if (!order) { detail.append(element('p', ui('Sipariş bulunamadı.'))); return; }
        detail.append(element('h3', ui('Sipariş detayı')), element('p', `${order.order_number || order.order_id} · ${statusLabel(order.status)}`));
        if (order.created_at) detail.append(element('p', new Date(order.created_at).toLocaleString(locale)));
        const items = element('ul', '');
        for (const row of order.items || []) items.append(element('li', `${row.name || row.product_id} × ${row.quantity}`));
        detail.append(items);
        if(order.checkout) {
          const quote=order.checkout;
          detail.append(element('p',paymentLabel(order.payment_status)),element('p',deliveryLabel(order.delivery_status)));
          if(quote.demo)detail.append(element('p',ui('DEMO — Banka bilgileri geçersizdir. Gerçek ödeme yapmayın.')));
          const instructions=element('dl','');
          const money = minor => new Intl.NumberFormat(locale,{style:'currency',currency:quote.currency}).format(minor/100);
          detail.append(element('p',ui('Ürünler toplamı: {0}',{0:money(quote.subtotal_minor)})),element('p',ui('Teslimat: {0}',{0:money(quote.delivery_fee_minor)})));
          for(const [label,value] of [['Banka',quote.bank.name],['Hesap sahibi',quote.bank.accountHolder],['IBAN',quote.bank.iban],['Ödenecek tutar',money(quote.total_minor)+' ('+quote.currency+')'],['Havale açıklaması',order.order_number]]){
            const data=element('dd',value),copy=element('button',ui('Kopyala'),'quiet');copy.type='button';
            copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(value);copy.textContent=ui('Kopyalandı');}catch{message(ui('Kopyalanamadı. Bilgiyi seçerek kopyalayabilirsiniz.'));}});
            data.append(copy);instructions.append(element('dt',ui(label)),data);
          }
          detail.append(instructions);
          const report=element('button',ui('Havale yaptım'),'button');report.type='button';
          report.disabled=['verification_pending','paid','refunded'].includes(order.payment_status) || order.status==='cancelled';
          report.addEventListener('click',async()=>{report.disabled=true;try{const base=JSON.parse(document.getElementById('site-context').textContent).apiBasePath;const response=await fetch(base+'/api/order-payment.php',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-YA-Account':'1'},body:JSON.stringify({action:'report',orderId:order.order_id})});if([401,403].includes(response.status)){owner.clear('unavailable');return;}if(!response.ok)throw new Error('payment_notice_failed');message(ui('Havale bildiriminiz alındı. İşletme doğrulaması bekleniyor.'));await loadOrders(generation);}catch{report.disabled=false;message(ui('Havale bildirimi kaydedilemedi.'));}});
          detail.append(report);
        }
        if (Number.isFinite(order.total) && order.currency) detail.append(element('p', new Intl.NumberFormat(locale, {style: 'currency', currency: order.currency}).format(order.total)));
        if (order.items?.length) { const reorder = reorderLink(order); if (reorder) detail.append(reorder); }
      } else {
        if (!(result.orders || []).length) list.append(element('p', ui('Henüz siparişiniz yok.')));
        for (const order of result.orders || []) {
          const row = element('p', '', 'account-order-row'); row.dataset.orderStatus = order.status;
          const link = element('a', `${order.order_number || order.order_id} · ${statusLabel(order.status)}`); link.href = orderUrl(order.order_id); row.append(link);
          if (order.items?.length) { const reorder = reorderLink(order); if (reorder) row.append(reorder); }
          list.append(row);
        }
      }
    } catch (error) {
      if (request === orderRequest && owner.state.generation === generation) { orderGeneration = -1; message(ui('Hesap şu anda doğrulanamıyor. Lütfen yeniden deneyin.')); }
    } finally { if (request === orderRequest) $('account-refresh-orders').disabled = false; }
  }
  function render(state) {
    const account = state.status === 'authenticated' ? state.account : null;
    $('account-forms').hidden = true;
    $('account-token').hidden = !tokenFlow || !config?.enabled;
    $('account-refresh').hidden = state.status !== 'unavailable';
    if (!account) clearPrivate();
    renderProviders(account);
    if (!config) return;
    if (!config.enabled) { message(ui('Online Satış kapalı. Hesap erişimi şu anda kullanılamıyor.')); return; }
    if (tokenFlow) return;
    if (state.status === 'unavailable') {
      $('account-forms').hidden = false; renderAuth(false);
      message(ui('Hesap şu anda doğrulanamıyor. Lütfen yeniden deneyin.')); return;
    }
    if (!account) {
      $('account-forms').hidden = false;
      renderAuth(config.passwordRegistration);
      message(ui(config.passwordRegistration ? 'Müşteri hesabınızla giriş yapın.' : 'E-posta hizmeti hazırlanıyor. Yeni hesap ve şifre yenileme kapalı; misafir alışveriş yapabilirsiniz.')); return;
    }
    $('account-profile').hidden = false; $('account-orders').hidden = false;
    $('logout').hidden = false; $('account-logout-all').hidden = false;
    $('account-dealer-badge').hidden = !account.dealer;
    $('account-email').textContent = account.email;
    if (profileGeneration !== state.generation) { $('account-profile').elements.fullName.value = account.fullName; profileGeneration = state.generation; }
    message('');
    if (orderGeneration !== state.generation) void loadOrders(state.generation);
  }
  if (!owner) { clearPrivate(); message(ui('Hesap şu anda doğrulanamıyor. Lütfen yeniden deneyin.')); return; }
  owner.subscribe(render);
  for (const action of ['login', 'register', 'recover', 'profile', 'token']) {
    const form = $('account-' + action);
    form.addEventListener('submit', async event => {
      event.preventDefault(); const submit = form.querySelector('button'); submit.disabled = true;
      try {
        await owner.request(action === 'token' ? tokenAction : action, {...Object.fromEntries(new FormData(form)), ...(action === 'token' ? {token} : {})});
        for (const password of form.querySelectorAll('input[type="password"]')) password.value = '';
        if (action === 'token') { const destination = new URL(location.href); destination.searchParams.delete('action'); destination.hash = ''; location.assign(destination.href); return; }
        if (action === 'login') { owner.unlock(); await owner.refresh(); }
        else if (action === 'profile') await owner.refresh();
        else message(ui('Hesap mevcutsa doğrulama veya yenileme bağlantısı e-posta kuyruğuna alındı. E-posta kutunuzu kontrol edin.'));
      } catch (error) { if (error.code !== 'account_state_changed') message(error.message); }
      finally { submit.disabled = false; }
    });
  }
  for (const [id, all] of [['logout', false], ['account-logout-all', true]]) $(id).addEventListener('click', async () => {
    try { await owner.logout(all); } catch { message(ui('Yerel görünüm kapatıldı. Sunucudaki çıkışı yeniden deneyin.')); }
  });
  $('account-refresh-orders').addEventListener('click', () => {
    if (owner.state.status === 'authenticated') void loadOrders(owner.state.generation);
  });
  async function initialize() {
    try { config = await owner.request('config'); await owner.ready; render(owner.state); }
    catch { message(ui('Hesap şu anda doğrulanamıyor. Lütfen yeniden deneyin.')); $('account-refresh').hidden = false; }
  }
  $('account-refresh').addEventListener('click', () => { if (!config) void initialize(); else void owner.refresh(); });
  void initialize();
})();
