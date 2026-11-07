/* Shared cart/checkout presentation. YaCommerce alone owns cart, session fencing and submission. */
(() => {
  'use strict';
  const apiBase = document.currentScript.dataset.apiBase;
  const controller = window.YaCommerce.shared({apiBase});
  const {ui, locale} = window.DemoLanguage;
  const money = (minor, currency) => new Intl.NumberFormat(locale,{style:'currency',currency}).format(minor / 100);
  const el = (tag,text,className) => { const node=document.createElement(tag); if(text !== undefined) node.textContent=text; if(className)node.className=className; return node; };
  const url = page => { const target=new URL(location.href); target.search=''; target.searchParams.set('page',page); const lang=new URLSearchParams(location.search).get('lang'); if(lang)target.searchParams.set('lang',lang); target.hash=''; return target.pathname+target.search; };
  const link = (label,page,style='button') => { const node=el('a',ui(label),style); node.href=url(page); return node; };
  const button = (label,action) => { const node=el('button',ui(label)); node.type='button'; node.addEventListener('click',action); return node; };
  const mini=document.getElementById('mini-cart'), flow=document.getElementById('checkout-flow');
  let state, owner='', renderedOwner='', draft={}, savedReceipt=null, reviewGeneration=0, inFlight=false, previousAuth=null;
  const storageKey = () => `ya:checkout:${new URL('../',new URL(apiBase,location.href)).pathname}:${owner}:v2`;
  function save() { try {sessionStorage.setItem(storageKey(),JSON.stringify({draft,receipt:savedReceipt})); return true;} catch {return false;} }
  function readOwner(next) {
    const key=next.auth.account?.id || 'guest';
    if(owner===key)return;
    owner=key; renderedOwner=''; draft={}; savedReceipt=null;
    try { const stored=JSON.parse(sessionStorage.getItem(storageKey())); if(stored && typeof stored.draft==='object') {draft=stored.draft || {};savedReceipt=stored.receipt || null;} } catch { /* empty draft */ }
  }
  function message(text) { const node=document.getElementById('checkout-message'); if(node)node.textContent=text; }
  function renderCart() {
    const focused=document.activeElement?.dataset.cartFocus;
    for(const container of document.querySelectorAll('[data-cart-lines]')) {
      container.replaceChildren();
      if(!state.cart.length) {container.append(el('p',ui(state.loading?'Sepet yükleniyor…':'Sepetiniz henüz boş.'),'shopping-empty')); continue;}
      for(const item of state.cart) {
        const product=item.display, row=el('article',undefined,'shopping-line');
        const available=state.products.some(row=>row.product_id===item.productId);
        const photo=el('div',undefined,'shopping-photo'), src=controller.safeImage(product.image_url);
        if(src){const img=el('img');img.src=src;img.alt='';img.loading='lazy';photo.append(img);}
        const copy=el('div',undefined,'shopping-copy'), title=link(product.name,'catalog','shopping-name');
        const detail=new URL(title.href,location.origin); detail.searchParams.set('id',item.productId); title.href=detail.pathname+detail.search;
        copy.append(title,el('span',available ? money(Math.round(product.price * 100),product.currency)+' / '+state.units[product.unit] : ui('Ürün artık satışta değil. Satırı kaldırın.')));
        const controls=el('div',undefined,'shopping-quantity');
        const step=controller.discrete(product.unit)?1:0.1, qty=item.q/state.scale;
        const minus=button('−',()=>controller.setQuantity(item.productId,Math.max(step,Math.round((qty-step)*10000)/10000)));
        const plus=button('+',()=>controller.setQuantity(item.productId,Math.round((qty+step)*10000)/10000));
        const input=el('input'); input.type='number'; input.min=String(controller.discrete(product.unit)?1:0.0001); input.max='1000'; input.step=controller.discrete(product.unit)?'1':'0.0001'; input.value=String(qty);
        input.setAttribute('aria-label',ui('{0}: miktar',{0:product.name})); input.dataset.cartFocus=item.productId;
        input.addEventListener('change',()=>{if(!controller.setQuantity(item.productId,input.value)) {input.setCustomValidity(ui('Miktarı kontrol edin.'));input.reportValidity();}else input.setCustomValidity('');});
        minus.setAttribute('aria-label',ui('{0}: miktarı azalt',{0:product.name})); plus.setAttribute('aria-label',ui('{0}: miktarı artır',{0:product.name}));
        for(const node of [minus,input,plus]){node.disabled=!state.canEdit || !available;controls.append(node);}
        const remove=button('Kaldır',()=>controller.remove(item.productId)); remove.className='quiet';remove.disabled=!state.canEdit;
        remove.setAttribute('aria-label',ui('{0}: satırı kaldır',{0:product.name}));
        copy.append(controls,remove);row.append(photo,copy);
        if(available)row.append(el('strong',money(Math.round(product.price*qty*100),product.currency),'shopping-line-total'));
        container.append(row);
      }
    }
    for(const node of document.querySelectorAll('[data-cart-total]')) {node.replaceChildren(); for(const total of state.totals) node.append(el('strong',ui('Ara toplam: {0}',{0:money(Math.round(total.amount*100),total.currency)})));}
    for(const node of document.querySelectorAll('[data-cart-message]'))node.textContent=state.cartMessage || state.submissionMessage || (!state.canCheckout && state.cart.length ? ui('Sepeti ve satışta olmayan ürünleri kontrol edin.') : '');
    for(const node of document.querySelectorAll('[data-checkout-link]')){node.setAttribute('aria-disabled',String(!state.canCheckout && !state.pending)); node.classList.toggle('is-disabled',!state.canCheckout && !state.pending);}
    const count=document.getElementById('header-cart-count');if(count){count.textContent=String(state.cart.length);count.hidden=!state.cart.length;}
    if(focused)document.querySelector(`[data-cart-focus="${CSS.escape(focused)}"]`)?.focus();
  }
  for(const node of document.querySelectorAll('[data-cart-open],.header-cart-link'))node.addEventListener('click',event=>{event.preventDefault();if(!mini.open)mini.showModal();});
  mini?.querySelector('[data-cart-close]').addEventListener('click',()=>mini.close());
  mini?.addEventListener('click',event=>{if(event.target===mini){const r=mini.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)mini.close();}});
  document.addEventListener('click',event=>{if(event.target.closest('[data-checkout-link][aria-disabled="true"]'))event.preventDefault();});
  function field(form,name,label,{type='text',required=true,maximum=160,autocomplete=''}={}) {
    const wrapper=el('label',ui(label)), input=el('input');input.name=name;input.type=type;input.required=required;input.maxLength=maximum;if(autocomplete)input.autocomplete=autocomplete;
    const source=name.startsWith('address.')?draft.address?.[name.slice(8)]:draft[name];input.value=typeof source==='string'?source:'';
    wrapper.append(input);form.append(wrapper);return input;
  }
  function persistForm(form) {
    for(const [name,value] of new FormData(form))if(typeof value==='string') {
      if(name.startsWith('address.')){draft.address ||= {};draft.address[name.slice(8)]=value;}else draft[name]=value;
    }
    return save();
  }
  function formShell(body,back,next) {
    const form=el('form',undefined,'shopping-form');body.append(form);
    const footer=el('footer',undefined,'shopping-actions');footer.append(link('Geri',back,'button secondary'));
    const submit=el('button',ui(next || 'Devam et'),'button');submit.type='submit';footer.append(submit);
    form.addEventListener('input',()=>{persistForm(form); if(flow?.dataset.step!=='review')draft.quote=null; save();});
    return {form,footer,submit};
  }
  function advance(form,next,keys) {
    if(!persistForm(form)){message(ui('Tarayıcı depolamasını açıp yeniden deneyin.'));return;}
    const result=controller.validate(draft), errors=Object.entries(result.errors).filter(([key])=>keys(key));
    if(errors.length){message(errors.map(([,text])=>text).join(' '));return;}
    location.assign(url(next));
  }
  function summary(body,quote) {
    const box=el('section',undefined,'shopping-summary');
    for(const line of quote.items)box.append(el('p',`${line.name} × ${line.quantity}`),el('strong',money(line.line_total_minor,quote.currency)));
    box.append(el('p',ui('Ürünler toplamı: {0}',{0:money(quote.subtotal_minor,quote.currency)})),el('p',ui('Teslimat: {0}',{0:money(quote.delivery_fee_minor,quote.currency)})),el('h2',ui('Toplam: {0}',{0:money(quote.total_minor,quote.currency)})));
    body.append(box);
  }
  function bankInstructions(body,receipt) {
    const quote=receipt.checkout;
    if(!quote){body.append(el('p',ui('Sipariş talebiniz alındı. Ödeme koşulları için işletmeyle iletişime geçin.')));return;}
    if(quote.demo)body.append(el('p',ui('DEMO — Banka bilgileri geçersizdir. Gerçek ödeme yapmayın.'),'shopping-demo'));
    body.append(el('h2',receipt.order_number),el('p',ui(({unpaid:'Ödeme bekleniyor. Sipariş oluşturulması ödeme onayı değildir.',verification_pending:'Havale bildiriminiz alındı. İşletme doğrulaması bekleniyor.',paid:'Ödemeniz işletme tarafından doğrulandı.',rejected:'Ödeme bildirimi doğrulanamadı. İşletmeyle iletişime geçin.',refunded:'İşletme havale iadesini kaydetti.'})[receipt.payment_status] || 'Ödeme bekleniyor.')));
    const list=el('dl',undefined,'shopping-bank');
    for(const [label,value] of [['Banka',quote.bank.name],['Hesap sahibi',quote.bank.accountHolder],['IBAN',quote.bank.iban],['Ödenecek tutar',money(quote.total_minor,quote.currency)+' ('+quote.currency+')'],['Havale açıklaması',receipt.order_number]]) {
      list.append(el('dt',ui(label)));const data=el('dd',value), copy=button('Kopyala',async()=>{try{await navigator.clipboard.writeText(value);copy.textContent=ui('Kopyalandı');}catch{message(ui('Kopyalanamadı. Bilgiyi seçerek kopyalayabilirsiniz.'));}});data.append(copy);list.append(data);
    }
    body.append(list);
    const notice=button('Havale yaptım',async()=>{
      notice.disabled=true;
      try{
        const response=await fetch(new URL('order-payment.php',new URL(apiBase,location.href)),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-YA-Account':'1'},
          body:JSON.stringify({action:'report',orderId:receipt.order_id,orderAccessToken:receipt.order_access_token || ''})});
        if([401,403].includes(response.status) && state.auth.account){window.YaAccount?.clear('unavailable');return;}
        const result=await response.json();
        if(!response.ok || result.ok!==true)throw new Error(ui('Havale bildirimi kaydedilemedi.'));
        savedReceipt={...savedReceipt,...result.order};save();void renderFlow();
      }catch(error){message(error.message);notice.disabled=false;}
    });
    notice.className='button';
    notice.disabled=['verification_pending','paid','refunded'].includes(receipt.payment_status) || receipt.status==='cancelled';
    body.append(notice);
  }
  async function renderFlow() {
    if(!flow)return;
    const body=document.getElementById('checkout-body'), step=flow.dataset.step;
    body.replaceChildren();message('');
    if(step==='result'){
      if(!savedReceipt){body.append(el('p',ui('Bu oturumda sipariş sonucu bulunamadı. Hesabınızdan siparişlerinizi kontrol edebilirsiniz.')),link('Hesabım','account'));return;}
      const token=++reviewGeneration;
      try {
        const response=await fetch(new URL('order-payment.php',new URL(apiBase,location.href)),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-YA-Account':'1'},body:JSON.stringify({action:'read',orderId:savedReceipt.order_id,orderAccessToken:savedReceipt.order_access_token || ''})});
        if([401,403].includes(response.status) && state.auth.account){window.YaAccount?.clear('unavailable');return;}
        const result=await response.json();
        if(token!==reviewGeneration || state.auth.status==='unavailable')return;
        if(response.status===404){savedReceipt=null;save();body.append(el('p',ui('Sipariş bulunamadı.')));return;}
        if(response.ok && result.ok===true){savedReceipt={...savedReceipt,...result.order};save();}
        else message(ui('Güncel durum alınamadı. Son kaydedilen talimatlar gösteriliyor.'));
      }catch {message(ui('Güncel durum alınamadı. Son kaydedilen talimatlar gösteriliyor.'));}
      if(token!==reviewGeneration)return;
      bankInstructions(body,savedReceipt);body.append(link('Siparişlerim','account','button secondary'),link('Alışverişe devam et','catalog'));return;
    }
    if(!state.cart.length && !state.pending){body.append(el('p',ui('Sepetiniz henüz boş.')),link('Alışverişe devam et','catalog'));return;}
    if(!state.canCheckout && !state.pending){body.append(el('p',ui('Sepeti ve güncel ürünleri kontrol edin.')),link('Sepete git','cart'));return;}
    if(step==='customer') {
      const {form,footer}=formShell(body,'cart');
      if(!state.auth.account){form.append(el('p',ui('Üye olmadan devam edebilirsiniz.')),link('Giriş yap / Hesap oluştur','account','text-link'));}
      if(state.auth.account){draft.name=state.auth.account.fullName || '';draft.email=state.auth.account.email || '';save();}
      const name=field(form,'name','Ad soyad',{autocomplete:'name'}), email=field(form,'email','E-posta',{type:'email',required:false,maximum:254,autocomplete:'email'});
      if(state.auth.account){name.readOnly=true;email.readOnly=true;}
      field(form,'phone','Telefon',{type:'tel',maximum:40,autocomplete:'tel'});field(form,'note','Sipariş notu',{required:false,maximum:2000});
      form.append(footer);form.addEventListener('submit',event=>{event.preventDefault();advance(form,'checkout-delivery',key=>!key.startsWith('delivery-'));});
    } else if(step==='delivery') {
      const {form,footer}=formShell(body,'checkout-customer');
      const label=el('label',ui('Teslimat yöntemi')), select=el('select');select.name='deliveryMethod';
      for(const method of state.deliveryMethods){const option=el('option',state.deliveryLabels[method]);option.value=method;select.append(option);}
      const chosen=state.deliveryMethods.includes(draft.deliveryMethod)?draft.deliveryMethod:state.deliveryMethod;select.value=chosen;controller.setDelivery(chosen);label.append(select);form.append(label);
      const address=el('fieldset');address.append(el('legend',ui('Teslimat adresi')));form.append(address);
      draft.address ||= {};draft.address.countryCode ||= 'TR';
      for(const [key,label,maximum,autocomplete] of [['recipientName','Teslim alacak kişi',160,'shipping name'],['addressLine1','Adres',300,'shipping address-line1'],['addressLine2','Adres devamı',300,'shipping address-line2'],['district','İlçe',120,'shipping address-level2'],['city','İl',120,'shipping address-level1'],['postalCode','Posta kodu',32,'shipping postal-code'],['countryCode','Ülke kodu',2,'shipping country']])field(address,'address.'+key,label,{maximum,autocomplete,required:!['addressLine2','postalCode'].includes(key)});
      const visibility=()=>{address.hidden=select.value!=='shipping';address.disabled=address.hidden;controller.setDelivery(select.value);draft.deliveryMethod=select.value;draft.quote=null;save();};select.addEventListener('change',visibility);visibility();
      form.append(footer);form.addEventListener('submit',event=>{event.preventDefault();advance(form,'checkout-payment',key=>key.startsWith('delivery-'));});
    } else if(step==='payment') {
      const {form,footer}=formShell(body,'checkout-delivery');
      const bank=el('label',ui('Havale / EFT')), radio=el('input');radio.type='radio';radio.name='paymentMethod';radio.value='bank_transfer';radio.checked=true;bank.prepend(radio);
      const card=el('label',ui('Kredi kartı — Yakında')), disabled=el('input');disabled.type='radio';disabled.disabled=true;card.prepend(disabled);
      form.append(bank,card,footer);form.addEventListener('submit',event=>{event.preventDefault();persistForm(form);location.assign(url('checkout-review'));});
    } else if(step==='review') {
      const token=++reviewGeneration;
      const allErrors=controller.validate(draft).errors;
      if(Object.keys(allErrors).length || draft.paymentMethod!=='bank_transfer'){body.append(el('p',ui('Müşteri, teslimat ve ödeme bilgilerini tamamlayın.')),link('Bilgilerime dön','checkout-customer'));return;}
      message(ui('Güncel toplam doğrulanıyor…'));
      try {
        const quote=state.pending && draft.quote ? draft.quote : await controller.quote(draft);
        if(token!==reviewGeneration || state.auth.status==='unavailable')return;
        draft.quote=quote;save();message('');
        const columns=el('div',undefined,'shopping-columns'), details=el('div');columns.append(details);body.append(columns);
        details.append(el('h2',draft.name),el('p',draft.phone),el('p',draft.email||''),el('p',state.deliveryLabels[state.deliveryMethod]));
        if(state.deliveryMethod==='shipping')details.append(el('p',[draft.address.addressLine1,draft.address.district,draft.address.city,draft.address.countryCode].join(', ')));
        details.append(el('p',ui('Ödeme: Havale / EFT')));
        if(quote.demo)details.append(el('p',ui('DEMO satış akışı. Hukuki metinler ticari kullanıma hazır değildir.'),'shopping-demo'));
        for(const [title,text] of [['Ön bilgilendirme',quote.legal.preliminary],['Satış sözleşmesi',quote.legal.agreement]]){const disclosure=el('details'), summary=el('summary',ui(title));disclosure.append(summary,el('p',text));details.append(disclosure);}
        const {form,footer,submit}=formShell(details,'checkout-payment','Siparişi onayla');
        for(const [name,label,required] of [['preliminary','Ön bilgilendirmeyi okudum ve kabul ediyorum.',true],['agreement','Satış sözleşmesini kabul ediyorum.',true],['marketing','Kampanya e-postaları almak istiyorum (isteğe bağlı).',false]]){const labelNode=el('label',ui(label)), input=el('input');input.type='checkbox';input.name=name;input.required=required;input.checked=draft.consent?.[name]===true;input.disabled=Boolean(state.pending);labelNode.prepend(input);form.append(labelNode);}
        form.append(footer);summary(columns,quote);
        submit.disabled=inFlight;
        form.addEventListener('submit',async event=>{
          event.preventDefault();if(inFlight)return;
          const consent={preliminary:form.elements.preliminary.checked,agreement:form.elements.agreement.checked,marketing:form.elements.marketing.checked};
          draft.consent=consent;save();inFlight=true;submit.disabled=true;
          try {await controller.submit({...draft,paymentMethod:'bank_transfer',quoteId:quote.quote_id,consent});}
          finally{inFlight=false;submit.disabled=false;message(controller.state.submissionMessage);}
        });
      } catch(error){if(token!==reviewGeneration)return;message(error.message || ui('Sipariş toplamı doğrulanamadı.'));body.append(link('Teslimata dön','checkout-delivery'));}
    }
  }
  controller.subscribe((next,reason)=>{
    state=next;
    if(reason==='fence'){
      reviewGeneration++;renderedOwner='';document.getElementById('checkout-body')?.replaceChildren();mini?.close();
      if(previousAuth?.id && next.auth.account?.id!==previousAuth.id && !['hidden','pagehide','offline'].includes(next.auth.reason)) {try{sessionStorage.removeItem(storageKey());}catch{/* storage blocked */}}
    }
    readOwner(next);previousAuth=next.auth.account;
    if(draft.deliveryMethod && next.deliveryMethods.includes(draft.deliveryMethod) && next.deliveryMethod!==draft.deliveryMethod && next.canEdit){controller.setDelivery(draft.deliveryMethod);return;}
    renderCart();
    if(reason==='accepted'){savedReceipt=next.receipt;draft={};save();location.assign(url('checkout-result'));return;}
    if(reason==='quote-changed'){draft.quote=null;save();void renderFlow();return;}
    const renderKey=owner+':'+next.auth.status+':'+next.catalogStatus;
    if(flow && (next.catalogStatus==='ready' || (flow.dataset.step==='result' && next.catalogStatus==='disabled')) && next.auth.status!=='unavailable' && renderedOwner!==renderKey){renderedOwner=renderKey;void renderFlow();}
    if(next.auth.status==='unavailable')message(ui('Oturum şu anda doğrulanamıyor. Lütfen yeniden deneyin.'));
  });
  window.addEventListener('pageshow',event=>{if(event.persisted){renderedOwner='';void renderFlow();}});
  controller.start();
})();
