var YardimciAsistanWidget=(function(e){Object.defineProperty(e,Symbol.toStringTag,{value:`Module`});var t=document.getElementById(`site-context`),n=t?JSON.parse(t.textContent||`{}`):{},r=n.language?.code||`tr`,i=n.language?.locale||`tr-TR`;function a(e,t={}){let r=n.sourceKeys?.[e];return(r&&n.language?.messages?.[r]||e).replace(/\{(\w+)\}/g,(e,n)=>Object.hasOwn(t,n)?String(t[n]):e)}function o(e){return a(e).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}var s=`#yardimci-asistan-widget`,c=!1,l=!1,u=``,d=[],f={apiBaseUrl:``};function p(){c||(c=!0,f={...f,...ae()},m(),queueMicrotask(m),document.addEventListener(`submit`,h,!0))}function m(){let e=window.YardimciAsistanWidget;if(!e||typeof e.init!=`function`||e.__availabilityInitWrapped===!0)return;let t=e.init.bind(e);e.init=(e={})=>{f={...f,...oe(e)},t(e)},e.__availabilityInitWrapped=!0}function h(e){let t=e.target instanceof HTMLFormElement?e.target:null;if(!t?.matches(`.ya-widget-ai[data-ya-ai-form]`))return;if(t.dataset.yaAvailabilityBypass===`1`){delete t.dataset.yaAvailabilityBypass;return}let n=new FormData(t),r=String(n.get(`message`)??``).trim();if(!r)return;let i=u!==``&&te(r,d),a=ee(r);!i&&!a?ne():(e.preventDefault(),e.stopImmediatePropagation(),l||g(t,r,i))}async function g(e,t,n){let r=f.apiBaseUrl.trim().replace(/\/$/,``);if(!r){_(e);return}let i=n?`${u} ${t}`.trim():t;l=!0,y(e,!0),re(a(`Canlı müsaitlik kontrol ediliyor...`));try{let t=await(await fetch(`${r}/api/availability.php`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({message:i})})).json().catch(()=>null);if(t?.handled!==!0||!t.answer){ne(),_(e);return}t.complete===!1?(u=i,d=Array.isArray(t.missing)?t.missing.filter(e=>typeof e==`string`):[]):ne(),e.isConnected&&(v(e,t.answer,t.live===!0),ie(),y(e,!1))}catch{ne(),_(e)}finally{l=!1}}function _(e){e.isConnected&&(ie(),y(e,!1),e.dataset.yaAvailabilityBypass=`1`,queueMicrotask(()=>{e.isConnected&&e.requestSubmit()}))}function v(e,t,n){let r=e.closest(`.ya-widget-subview`);if(!r)return;let i=r.querySelector(`.ya-widget-ai-answer`);i||(i=document.createElement(`div`),i.className=`ya-widget-ai-answer`,e.insertAdjacentElement(`afterend`,i)),i.dataset.yaAvailabilityAnswer=`1`,i.replaceChildren();let o=document.createElement(`p`),s=document.createElement(`strong`);s.textContent=a(n?`Canlı Müsaitlik`:`Müsaitlik Kontrolü`);let c=document.createElement(`span`);c.textContent=t,o.append(s,c),i.append(o);let l=r.querySelector(`.ya-widget-inline-trust`);l&&(l.textContent=a(`Müsaitlik sorgusu rezervasyon oluşturmaz; son onay işletmeye aittir.`))}function y(e,t){let n=e.querySelector(`button[type="submit"]`);if(!n)return;n.disabled=t;let r=n.querySelector(`span`);r&&(r.textContent=a(t?`Müsaitlik kontrol ediliyor`:`AI Yardımcıya Sor`))}function ee(e){let t=e.toLocaleLowerCase(`tr-TR`),n=/\b(?:oda(?:lar)?|otel|pansiyon|konaklama)(?:mız|miz|muz|müz|ımız|imiz|umuz|ümüz|nız|niz|nuz|nüz|ınız|iniz|unuz|ünüz)?(?:da|de|ta|te|dan|den|tan|ten|ya|ye|yı|yi|yu|yü|nın|nin|nun|nün)?\b/u.test(t),r=/(müsait|musait|boş|bos|yer\s+var|rezervasyon)/u.test(t)||/\b(?:oda(?:lar)?|otel|pansiyon|konaklama)(?:mız|miz|muz|müz|ımız|imiz|umuz|ümüz|nız|niz|nuz|nüz|ınız|iniz|unuz|ünüz)?(?:da|de|ta|te|dan|den|tan|ten|ya|ye|yı|yi|yu|yü|nın|nin|nun|nün)?\s+var(?:\s*m[ıiuü])?\b/u.test(t);return n&&r}function te(e,t){let n=e.toLocaleLowerCase(`tr-TR`).trim();return!!(t.includes(`guest_count`)&&(/^\d{1,2}$/.test(n)||/\b\d{1,2}\s*(kişi|kisi|kişilik|kisilik|yetişkin|yetiskin|çocuk|cocuk)\b/u.test(n))||t.includes(`date_range`)&&(/\b20\d{2}-\d{2}-\d{2}\b/.test(n)||/\b\d{1,2}[./]\d{1,2}(?:[./]20\d{2})?\b/.test(n)||/\b\d{1,2}\s*(?:-|–|—|ile)\s*\d{1,2}\b/u.test(n)||/\b(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik|bugün|bugun|yarın|yarin)\b/u.test(n)))}function ne(){u=``,d=[]}function re(e){let t=document.querySelector(`${s} [data-ya-status]`);t&&(t.textContent=e,t.hidden=!1)}function ie(){let e=document.querySelector(`${s} [data-ya-status]`);e&&(e.textContent=``,e.hidden=!0)}function ae(){let e=Array.from(document.scripts).reverse(),t=document.currentScript??e.find(e=>e.dataset.apiBaseUrl!==void 0||/widget\.js(?:$|\?)/.test(e.src));return oe({...t?.dataset.apiBaseUrl===void 0?{}:{apiBaseUrl:t.dataset.apiBaseUrl}})}function oe(e){let t={};return typeof e.apiBaseUrl==`string`&&e.apiBaseUrl.trim()&&(t.apiBaseUrl=e.apiBaseUrl),t}var se={pension_reservation:`Pansiyon rezervasyonu`,restaurant_reservation:`Masa rezervasyonu`,general_info:`Bilgi talebi`},ce=/^\+[1-9]\d{6,14}$/,le=/^5\d{9}$/,ue=`Telefon numarası geçerli formatta olmalı. Yurt dışı numaralarında ülke kodunu ekleyin. Örnek: +90 532 123 45 67 veya +44 7911 123456`;function de(e,t){let n=me(e);if(!n.ok)return{ok:!1,mode:`wa_link`,code:`invalid_phone`,message:n.error};let r=t.trim();if(!r)return{ok:!1,mode:`wa_link`,code:`empty_message`,message:`WhatsApp mesajı boş olmamalı.`};let i=encodeURIComponent(r);return{ok:!0,mode:`wa_link`,url:`https://wa.me/${n.whatsapp}?text=${i}`,whatsappPhone:n.whatsapp,phoneDisplay:n.display,message:r,encodedMessage:i}}function fe(e,t){let n=de(e,t);return n.ok?n.url:``}function pe(e,t){let n=se[e.request_type]??`Bilgi talebi`;return[`Merhaba, ${t} için talep oluşturmak istiyorum.`,`Talep türü: ${n}`,`Ad soyad: ${e.customer_name}`,`Telefon: ${e.customer_phone}`,`Tarih: ${e.date_text}`,e.time_text?`Saat: ${e.time_text}`:``,`Kişi sayısı: ${e.guest_count}`,e.message?`Not: ${e.message}`:``,`Lütfen bilgileri kontrol edip gönder tuşuna basın.`].filter(Boolean).join(`
`)}function me(e){let t=he(e);return t.ok?{ok:!0,whatsapp:t.whatsapp,e164:t.e164,national:t.national,display:ge(e)}:{ok:!1,error:t.error}}function he(e){let t=_e(e.trim()),n=``;if(t.startsWith(`+`)){if(!ce.test(t)||t.startsWith(`+90`)&&!le.test(t.slice(3)))return{ok:!1,error:ue};n=t}else{let e=ve(t);if(!e||!le.test(e))return{ok:!1,error:ue};n=`+90${e}`}let r=n.slice(1);return{ok:!0,e164:n,national:n.startsWith(`+90`)?n.slice(3):r,whatsapp:r}}function ge(e){let t=he(e);return t.ok?t.e164.startsWith(`+90`)&&t.national.length===10?`+90 ${t.national.slice(0,3)} ${t.national.slice(3,6)} ${t.national.slice(6,8)} ${t.national.slice(8,10)}`:t.e164:e.trim()}function _e(e){if(!e||!/^[+\d\s()./-]+$/.test(e))return``;let t=e.replace(/[\s()./-]/g,``);return t.startsWith(`00`)?`+${t.slice(2)}`:t}function ve(e){return e.startsWith(`90`)&&e.length===12?e.slice(2):e.startsWith(`0`)&&e.length===11?e.slice(1):e.length===10?e:null}function ye(e,t){if(i===`tr-TR`)return pe(e,t);let n=e.request_type===`pension_reservation`?a(`Rezervasyon talebi`):e.request_type===`restaurant_reservation`?a(`Masa talebi`):a(`Bilgi talebi`);return[a(`Merhaba, {0} için talep oluşturmak istiyorum.`,{0:t}),a(`Talep türü: {0}`,{0:n}),a(`Ad soyad: {0}`,{0:e.customer_name}),a(`Telefon: {0}`,{0:e.customer_phone}),a(`Tarih: {0}`,{0:e.date_text}),e.time_text?a(`Saat: {0}`,{0:e.time_text}):``,a(`Kişi sayısı: {0}`,{0:new Intl.NumberFormat(i).format(Number(e.guest_count))}),e.message?a(`Not: {0}`,{0:e.message}):``,a(`Lütfen bilgileri kontrol edip gönder tuşuna basın.`)].filter(Boolean).join(`
`)}var b={CUSTOMERS:`core.customers`,REQUESTS:`customer.requests`,TASKS:`core.tasks`,CALENDAR:`core.calendar`,NOTIFICATIONS:`core.notifications`,FINANCE:`core.finance`,REPORTS:`core.reports`,WEB:`core.web`,SYNC:`core.sync`,BACKUPS:`core.backups`,DEVICES:`core.devices`,PRINTING:`document.printing`,WHATSAPP:`service.whatsapp`,MARKETING_STUDIO:`marketing.studio`,MESSAGING_CAMPAIGNS:`messaging.campaigns`,AI:`service.ai`,ANDROID:`service.android`,ACCOMMODATION_ROOMS:`accommodation.rooms`,ACCOMMODATION_RESERVATIONS:`accommodation.reservations`,ACCOMMODATION_STAYS:`accommodation.stays`,ACCOMMODATION_FOLIO:`accommodation.folio`,FOOD_TABLES:`food_service.tables`,FOOD_RESERVATIONS:`food_service.reservations`,FOOD_ORDERS:`food_service.orders`,FOOD_MENU:`food_service.menu`,QR_MENU:`channel.qr_menu`,CATALOG:`commerce.catalog`,INVENTORY:`commerce.inventory`,SALES:`commerce.sales`,ORDERS:`commerce.orders`,ONLINE_SALES:`channel.online_sales`,WHOLESALE:`commerce.wholesale`,CUSTOMER_CREDIT:`commerce.customer_credit`,COMMERCE_BENEFITS:`commerce.benefits`,RETAIL_BARCODE:`retail.barcode`,RETAIL_PURCHASING:`retail.purchasing`,RETAIL_SUPPLIERS:`retail.suppliers`,RETAIL_LABELS:`retail.labels`},x=b,be={[x.REQUESTS]:[x.CUSTOMERS],[x.MESSAGING_CAMPAIGNS]:[x.CUSTOMERS,x.MARKETING_STUDIO],[x.ACCOMMODATION_RESERVATIONS]:[x.ACCOMMODATION_ROOMS],[x.ACCOMMODATION_STAYS]:[x.ACCOMMODATION_ROOMS],[x.ACCOMMODATION_FOLIO]:[x.ACCOMMODATION_ROOMS,x.ACCOMMODATION_STAYS,x.FINANCE],[x.FOOD_RESERVATIONS]:[x.FOOD_TABLES],[x.FOOD_MENU]:[x.CATALOG],[x.FOOD_ORDERS]:[x.FOOD_TABLES,x.FOOD_MENU],[x.QR_MENU]:[x.FOOD_MENU],[x.INVENTORY]:[x.CATALOG],[x.SALES]:[x.CATALOG],[x.ORDERS]:[x.CATALOG],[x.ONLINE_SALES]:[x.ORDERS],[x.WHOLESALE]:[x.CUSTOMERS,x.ORDERS],[x.CUSTOMER_CREDIT]:[x.CUSTOMERS,x.SALES,x.FINANCE],[x.COMMERCE_BENEFITS]:[x.CATALOG,x.CUSTOMERS],[x.RETAIL_BARCODE]:[x.CATALOG],[x.RETAIL_PURCHASING]:[x.CATALOG,x.INVENTORY],[x.RETAIL_SUPPLIERS]:[x.RETAIL_PURCHASING],[x.RETAIL_LABELS]:[x.CATALOG]},xe=[x.CUSTOMERS,x.TASKS,x.CALENDAR,x.NOTIFICATIONS,x.FINANCE,x.REPORTS,x.WEB,x.SYNC,x.BACKUPS,x.DEVICES],Se=[x.REQUESTS,x.MESSAGING_CAMPAIGNS,x.MARKETING_STUDIO,x.PRINTING],Ce=[x.REQUESTS],we=[x.ACCOMMODATION_ROOMS,x.ACCOMMODATION_STAYS,x.ACCOMMODATION_FOLIO],Te=[x.ACCOMMODATION_RESERVATIONS],Ee=[x.ACCOMMODATION_RESERVATIONS],De=[x.FOOD_TABLES,x.FOOD_ORDERS,x.FOOD_MENU,x.CATALOG,x.SALES],Oe=[x.FOOD_RESERVATIONS,x.QR_MENU,x.INVENTORY,x.ONLINE_SALES,x.COMMERCE_BENEFITS],ke=[x.FOOD_RESERVATIONS,x.QR_MENU,x.INVENTORY],Ae=[x.CATALOG,x.INVENTORY,x.SALES,x.RETAIL_BARCODE],je=[x.RETAIL_PURCHASING,x.RETAIL_SUPPLIERS,x.RETAIL_LABELS,x.CUSTOMER_CREDIT,x.WHOLESALE,x.ONLINE_SALES,x.COMMERCE_BENEFITS],Me=[x.RETAIL_PURCHASING,x.RETAIL_SUPPLIERS];function S(...e){return[...new Set(e.flat())]}function Ne(e,t,n,r,i,a){let o=new Set(i),s=a.filter(e=>o.has(e)),c=Fe(S(xe,r,s));return{id:e,label:t,description:n,requiredCapabilities:[...r],optionalCapabilities:[...i],defaultOptionalCapabilities:[...s],defaultCapabilities:c}}function Pe(e){return be[e]??[]}function Fe(e){let t=new Set(e),n=[...t];for(;n.length>0;){let e=n.pop();if(e)for(let r of Pe(e))t.has(r)||(t.add(r),n.push(r))}return[...t]}Ne(`pension_restaurant`,`Pansiyon + Restoran/Kafe`,`Konaklama ve yiyecek-içecek operasyonları aynı işletme omurgasında çalışır.`,S(we,De),S(Se,Te,Oe),S(Ce,Ee,ke)),Ne(`pension`,`Pansiyon`,`Konaklama, müşteri, finans, web ve saha operasyonları için hazır profil.`,we,S(Se,Te),S(Ce,Ee)),Ne(`restaurant`,`Restoran / Kafe`,`Masa, sipariş, menü, stok, satış ve saha operasyonları için hazır profil.`,De,S(Se,Oe),S(Ce,ke)),Ne(`market`,`Market / Perakende / Toptan`,`Ürün, barkod, stok, hızlı satış, tedarikçi, etiket ve opsiyonel bayi/toptan operasyonları için hazır profil.`,Ae,S(Se,je),Me);var Ie=[{id:`facebook`,label:`Facebook`,hosts:[`facebook.com`,`fb.com`]},{id:`instagram`,label:`Instagram`,hosts:[`instagram.com`]},{id:`youtube`,label:`YouTube`,hosts:[`youtube.com`,`youtu.be`]},{id:`tiktok`,label:`TikTok`,hosts:[`tiktok.com`]},{id:`x`,label:`X`,hosts:[`x.com`,`twitter.com`]}];new Set(Ie.map(e=>e.id));var Le=[{id:`wifi`,label:`Wi-Fi`,group:`connectivity`},{id:`parking`,label:`Otopark`,group:`transport`},{id:`pet_friendly`,label:`Evcil hayvan kabul edilir`,group:`policy`},{id:`family_friendly`,label:`Çocuklu ailelere uygun`,group:`policy`},{id:`wheelchair_access`,label:`Tekerlekli sandalye erişimine uygun`,group:`accessibility`},{id:`step_free_access`,label:`Basamaksız erişim`,group:`accessibility`},{id:`garden`,label:`Bahçe`,group:`outdoor`},{id:`terrace`,label:`Teras`,group:`outdoor`},{id:`luggage_storage`,label:`Bagaj emaneti`,group:`service`},{id:`airport_transfer`,label:`Havalimanı transferi`,group:`transport`}];Le.length,Ie.length;function Re(e){if(typeof e!=`string`)return``;let t=e.trim();if(!t||t.length>4096||/[<>\\\s]/.test(t))return``;try{let e=new URL(t);return e.protocol!==`https:`||e.username||e.password||e.port||e.hash||![`google.com`,`www.google.com`].includes(e.hostname)||e.pathname!==`/maps/embed`||!e.searchParams.get(`pb`)?``:e.toString()}catch{return``}}new Set(Le.map(e=>e.id)),new Map(Le.map(e=>[e.id,e.label])),b.ACCOMMODATION_ROOMS,b.FOOD_TABLES,b.FOOD_MENU,b.FOOD_ORDERS,b.FOOD_TABLES,b.FOOD_MENU,b.ACCOMMODATION_ROOMS,b.FOOD_TABLES,b.FOOD_MENU,b.FOOD_ORDERS,b.CATALOG,b.CUSTOMERS,b.CUSTOMERS,b.WHATSAPP,b.DEVICES,b.CUSTOMERS,b.MESSAGING_CAMPAIGNS,b.MARKETING_STUDIO,b.ONLINE_SALES,b.WHOLESALE,b.ONLINE_SALES,b.WHOLESALE,b.WHOLESALE,b.RETAIL_BARCODE,b.ACCOMMODATION_STAYS,b.ACCOMMODATION_ROOMS;var C=b;C.WHOLESALE,C.ACCOMMODATION_RESERVATIONS,C.FOOD_RESERVATIONS,C.FOOD_RESERVATIONS,C.QR_MENU,{aras:{id:`aras`,name:`Aras Kargo`}}.aras;var ze=[{id:`air_conditioning`,label:`Klima`,group:`comfort`},{id:`wifi`,label:`Wi-Fi`,group:`connectivity`},{id:`private_bathroom`,label:`Özel banyo`,group:`bathroom`},{id:`balcony`,label:`Balkon`,group:`outdoor`},{id:`terrace`,label:`Teras`,group:`outdoor`},{id:`sea_view`,label:`Deniz manzarası`,group:`view`},{id:`garden_view`,label:`Bahçe manzarası`,group:`view`},{id:`mountain_view`,label:`Dağ manzarası`,group:`view`},{id:`tv`,label:`TV`,group:`comfort`},{id:`mini_fridge`,label:`Mini buzdolabı`,group:`comfort`},{id:`heating`,label:`Isıtma`,group:`comfort`},{id:`work_desk`,label:`Çalışma masası`,group:`comfort`},{id:`kitchenette`,label:`Mini mutfak`,group:`comfort`},{id:`step_free_access`,label:`Basamaksız erişim`,group:`accessibility`},{id:`wheelchair_friendly`,label:`Tekerlekli sandalye erişimine uygun`,group:`accessibility`},{id:`non_smoking`,label:`Sigara içilmeyen oda`,group:`policy`}];ze.length,new Set(ze.map(e=>e.id)),new Map(ze.map(e=>[e.id,e.label]));var Be=[{id:`indoor`,label:`İç mekân`,group:`location`},{id:`outdoor`,label:`Açık alan`,group:`location`},{id:`terrace`,label:`Teras / veranda`,group:`location`},{id:`window_side`,label:`Cam kenarı`,group:`location`},{id:`sea_view`,label:`Deniz manzarası`,group:`view`},{id:`garden_view`,label:`Bahçe manzarası`,group:`view`},{id:`quiet_area`,label:`Sakin bölüm`,group:`experience`},{id:`wheelchair_friendly`,label:`Tekerlekli sandalye erişimine uygun`,group:`accessibility`}];Be.length,new Set(Be.map(e=>e.id)),new Map(Be.map(e=>[e.id,e.label]));function Ve(e,t){let n=t.state&&(e.runtime.stateAliases[t.state]??t.state),r=e.assets.find(e=>e.usage===t.usage&&(t.width===void 0||e.dimensions.width===t.width)&&(n===void 0||e.state===n)&&(t.theme===void 0||e.theme===t.theme));if(!r)throw Error(`Nexa asset missing: ${JSON.stringify(t)}`);return r}var He={ready:``,thinking:`Düşünüyorum…`,listening:`Dinliyorum…`,speaking:`Yanıt hazır.`,pleased:`Tamamlandı.`,concerned:`Bir sorun oldu.`};function Ue(e,t={}){let n=`ready`,r=0,i=`cancel`,a,o=!1,s=new Set,c=new Set,l=new Set;function u(){a!==void 0&&(e.cancel(a),a=void 0)}function d(e){if(n!==e){n=e;for(let e of l)e()}}function f(n){if(u(),c.size)d(`listening`);else if(n===`error`){if(!o&&t.error!==void 0){d(`ready`);return}d(`concerned`),o&&t.error!==void 0&&(a=e.schedule(()=>{a=void 0,d(`ready`)},t.error))}else!o||n===`cancel`?d(`ready`):(d(n===`success`?`pleased`:`speaking`),a=e.schedule(()=>{a=void 0,d(`ready`)},n===`success`?t.success??900:t.response??700))}return{getState:()=>n,subscribe(e){return l.add(e),()=>{l.delete(e)}},setActive(e){o=e,o||(u(),(n===`speaking`||n===`pleased`||n===`concerned`&&t.error!==void 0)&&d(`ready`))},beginListening(){u();let e=Symbol();return c.add(e),s.size||d(`listening`),()=>{c.delete(e)&&!s.size&&!c.size&&d(`ready`)}},begin(){u();let e=++r;i=`cancel`,s.add(e),d(`thinking`);let t=!1;return n=>{t||(t=!0,s.delete(e)&&(e===r&&(i=n),s.size||f(i)))}},reset(){u(),s.clear(),c.clear(),r++,i=`cancel`,d(`ready`)}}}var We=()=>({gazeX:0,gazeY:0,tilt:0,nod:0,blink:0,surprise:0,smile:0}),Ge=[`left`,`right`,`up`,`down`,`curious-left`,`curious-right`];function Ke(e=Math.random){let t=(t,n)=>t+e()*(n-t),n=t(2800,4800),r=-1/0,i=!1,a=t(3e3,6500),o=-1/0,s=0,c=`left`,l,u=!1,d=-1/0;function f(){r=o=d=-1/0,n=t(2800,4800),a=t(3e3,6500),s=0,u=!1}return{reset:f,react(e,n,r){r!==`ready`||n-d<2200&&(e!==`press`||c===`press`)||(c=e,o=n,s=e===`press`?1200:1e3,d=n,a=n+s+t(6e3,14e3))},sample(d,f){let p=We();d>=n&&(r=d,i=e()<.23,n=d+t(3600,9500));let m=d-r,h=e=>e>=0&&e<=180?Math.sin(e/180*Math.PI):0;if(p.blink=Math.max(h(m),i?h(m-310):0),f!==`ready`)return p;if(d>=a){let n=Ge.filter(e=>e!==l);c=n[Math.floor(e()*n.length)],l=c,o=d,s=t(1400,2400);let r=!u&&e()<.2;a=d+s+(r?t(400,900):e()<.2?t(22e3,32e3):t(6e3,18e3)),u=r}let g=(d-o)/s;if(!(g>=0&&g<=1))return p;let _=Math.sin(g*Math.PI)**2;return(c===`left`||c===`curious-left`||c===`hover`)&&(p.gazeX=-3*_),(c===`right`||c===`curious-right`)&&(p.gazeX=3*_),c===`up`&&(p.gazeY=-2.5*_),c===`down`&&(p.gazeY=2*_),(c===`curious-left`||c===`hover`)&&(p.tilt=-2.5*_),c===`curious-right`&&(p.tilt=2.5*_),c===`press`&&(p.surprise=g<.25?Math.sin(g/.25*Math.PI):0,p.nod=g>=.25?Math.sin((g-.25)/.75*Math.PI*2)*_*2:0,p.smile=_),p}}}var qe={idle:`Sakin`,thinking:`Düşünen`,speaking:`Konuşan`,success:`Sevinen`,concerned:`Dikkatli`,listening:`Dinleyen`};function Je(e){switch(e){case`thinking`:return`thinking`;case`speaking`:return`speaking`;case`pleased`:return`success`;case`concerned`:return`concerned`;case`listening`:return`listening`;case`ready`:case`sleep`:return`idle`}}var Ye=0;function Xe(e){return`<svg xmlns="http://www.w3.org/2000/svg" id="${e}" data-nexa-rig="" style="display:block;width:100%;height:100%;overflow:visible;transform:none;animation:none" viewBox="0 0 200 200" role="img" aria-label="Nexa">
      <style>
        #${e} *{animation:none;transition:none}
        #${e} .nexa-rig-edge{fill:none;stroke-linecap:round;stroke-linejoin:round}
        #${e} .nexa-rig-brow{fill:none;stroke:#153c63;stroke-width:3.5;stroke-linecap:round}
        #${e} .nexa-rig-lid-edge{fill:none;stroke:#234969;stroke-width:1.4;stroke-linecap:round}
        #${e} .nexa-rig-mouth-line{fill:none;stroke:#103859;stroke-width:3;stroke-linecap:round}
        #${e} .nexa-rig-thinking-light,#${e} .nexa-rig-success-highlight{opacity:0}
        #${e}[data-expression="thinking"] .nexa-rig-thinking-light{opacity:.8}
        #${e}[data-expression="success"] .nexa-rig-success-highlight{opacity:.8}
        #${e}[data-size="small"] .nexa-rig-micro-hide{display:none}
        #${e}[data-size="small"] .nexa-rig-brow{stroke-width:4.3}
        #${e}[data-size="small"] .nexa-rig-mouth-line{stroke-width:4}
        #${e} .nexa-rig-eye-spark{fill:#fff}
        #${e} .nexa-rig-mouth-fill{fill:#103859;stroke:#1a5172;stroke-width:1}
      </style>
      <defs>
        <linearGradient id="${e}-body" x1=".13" y1=".1" x2=".85" y2=".95" gradientUnits="objectBoundingBox"><stop stop-color="#9becf3" style="stop-color:#9becf3"/><stop offset=".25" stop-color="#51c7df" style="stop-color:#51c7df"/><stop offset=".58" stop-color="#248ac5" style="stop-color:#248ac5"/><stop offset=".86" stop-color="#15508f" style="stop-color:#15508f"/><stop offset="1" stop-color="#11385f" style="stop-color:#11385f"/></linearGradient>
        <radialGradient id="${e}-glass" cx=".33" cy=".25" r=".83"><stop stop-color="#defafa" style="stop-color:#defafa"/><stop offset=".4" stop-color="#9ee7ef" style="stop-color:#9ee7ef"/><stop offset=".72" stop-color="#64c6df" style="stop-color:#64c6df"/><stop offset="1" stop-color="#2f80ad" style="stop-color:#2f80ad"/></radialGradient>
        <linearGradient id="${e}-fin" x1=".2" y1="0" x2=".7" y2="1"><stop stop-color="#b9ffff" stop-opacity=".9" style="stop-color:#b9ffff;stop-opacity:.9"/><stop offset=".38" stop-color="#5bd2e8" stop-opacity=".75" style="stop-color:#5bd2e8;stop-opacity:.75"/><stop offset=".75" stop-color="#268bbb" stop-opacity=".7" style="stop-color:#268bbb;stop-opacity:.7"/><stop offset="1" stop-color="#1d4f8b" stop-opacity=".9" style="stop-color:#1d4f8b;stop-opacity:.9"/></linearGradient>
        <linearGradient id="${e}-ribbon" x1="0" y1="0" x2="1" y2=".65"><stop stop-color="#96f3f2" style="stop-color:#96f3f2"/><stop offset=".3" stop-color="#50dce8" style="stop-color:#50dce8"/><stop offset=".62" stop-color="#29aace" style="stop-color:#29aace"/><stop offset="1" stop-color="#225d9a" style="stop-color:#225d9a"/></linearGradient>
        <linearGradient id="${e}-edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e6ffff" stop-opacity=".96" style="stop-color:#e6ffff;stop-opacity:.96"/><stop offset=".48" stop-color="#a9f7fa" stop-opacity=".7" style="stop-color:#a9f7fa;stop-opacity:.7"/><stop offset="1" stop-color="#67bfed" stop-opacity=".1" style="stop-color:#67bfed;stop-opacity:.1"/></linearGradient>
        <linearGradient id="${e}-crest" x1=".8" y1="0" x2=".2" y2="1"><stop stop-color="#d1ffff" style="stop-color:#d1ffff"/><stop offset=".32" stop-color="#64dbe9" style="stop-color:#64dbe9"/><stop offset=".8" stop-color="#258bc0" style="stop-color:#258bc0"/><stop offset="1" stop-color="#175080" style="stop-color:#175080"/></linearGradient>
        <radialGradient id="${e}-pupil"><stop stop-color="#164c73" style="stop-color:#164c73"/><stop offset=".65" stop-color="#123353" style="stop-color:#123353"/><stop offset="1" stop-color="#0a263f" style="stop-color:#0a263f"/></radialGradient>
        <clipPath id="${e}-eye-l"><path data-eye-clip="left"/></clipPath><clipPath id="${e}-eye-r"><path data-eye-clip="right"/></clipPath>
      </defs>
      <g data-part="tail">
        <path d="M87 134 C107 136 130 139 144 156 C154 173 137 183 110 190 C124 175 114 170 100 166 C83 160 75 149 87 134Z" fill="url(#${e}-fin)" stroke="#48b7d4" stroke-opacity=".5" stroke-width="1" style="fill:url(#${e}-fin);stroke:#48b7d4;stroke-opacity:.5;stroke-width:1"/>
        <path class="nexa-rig-edge" d="M118 149 C151 164 141 177 121 184" stroke="url(#${e}-edge)" stroke-width="1.3" style="stroke:url(#${e}-edge);stroke-width:1.3"/>
        <path class="nexa-rig-edge nexa-rig-micro-hide" d="M106 150Q131 161 126 177" stroke="#8fe7ef" stroke-opacity=".32" stroke-width="1" style="stroke:#8fe7ef;stroke-opacity:.32;stroke-width:1"/>
      </g>
      <g data-part="far-fin"><path d="M58 91C42 97 29 110 24 127C39 124 51 124 65 113Z" fill="url(#${e}-fin)" stroke="#68c6df" stroke-opacity=".5" style="fill:url(#${e}-fin);stroke:#68c6df;stroke-opacity:.5"/><path class="nexa-rig-edge" d="M27 123Q43 103 57 101" stroke="url(#${e}-edge)" stroke-width="1.1" style="stroke:url(#${e}-edge);stroke-width:1.1"/></g>
      <g data-part="side-fin">
        <path d="M135 94 C159 110 170 91 182 89 C180 109 163 137 138 136 C132 122 128 108 135 94Z" fill="url(#${e}-fin)" stroke="#72d5e5" stroke-opacity=".4" stroke-width="1" style="fill:url(#${e}-fin);stroke:#72d5e5;stroke-opacity:.4;stroke-width:1"/>
        <path class="nexa-rig-edge" d="M144 111C158 116 174 102 180 93" stroke="url(#${e}-edge)" stroke-width="1.7" style="stroke:url(#${e}-edge);stroke-width:1.7"/>
        <path class="nexa-rig-edge nexa-rig-micro-hide" d="M144 119Q162 118 172 108" stroke="#8cdae9" stroke-opacity=".4" stroke-width="1" style="stroke:#8cdae9;stroke-opacity:.4;stroke-width:1"/>
      </g>
      <g data-part="body">
        <path d="M68 48C90 37 124 45 141 66C154 84 156 112 145 134C133 156 111 166 91 161C78 158 72 150 60 146C44 140 39 126 41 110C40 83 48 61 68 48Z" fill="url(#${e}-body)" stroke="#246f9d" stroke-width="1.4" style="fill:url(#${e}-body);stroke:#246f9d;stroke-width:1.4"/>
        <path d="M49 107C46 129 65 139 77 146C91 154 103 151 110 153C102 164 87 160 79 154C64 144 42 145 41 123Z" fill="#153d7b" fill-opacity=".22" style="fill:#153d7b;fill-opacity:.22"/>
        <path d="M124 55C146 68 153 95 148 113C144 128 135 138 124 146C134 128 138 117 140 95C140 76 131 64 124 55Z" fill="#0c427d" fill-opacity=".26" style="fill:#0c427d;fill-opacity:.26"/>
        <path class="nexa-rig-edge" d="M47 101C45 78 52 61 70 51C88 41 107 44 119 49" stroke="url(#${e}-edge)" stroke-width="2" style="stroke:url(#${e}-edge);stroke-width:2"/>
        <path class="nexa-rig-edge nexa-rig-micro-hide" d="M139 118Q132 144 111 151" stroke="#6ccbe3" stroke-opacity=".54" stroke-width="1.5" style="stroke:#6ccbe3;stroke-opacity:.54;stroke-width:1.5"/>
      </g>
      <g data-part="crown">
        <path d="M61 62C54 49 58 34 72 31C92 29 105 33 122 23C134 17 149 13 166 13C159 28 149 43 132 49C112 54 100 45 83 48C73 50 67 55 61 62Z" fill="url(#${e}-crest)" stroke="#66c6de" stroke-width="1" style="fill:url(#${e}-crest);stroke:#66c6de;stroke-width:1"/>
        <path d="M61 57C75 31 99 50 119 39C137 30 150 20 165 14C151 41 139 48 121 49C101 51 82 40 61 57Z" fill="#2289bc" fill-opacity=".42" style="fill:#2289bc;fill-opacity:.42"/>
        <path class="nexa-rig-edge" d="M61 51C64 31 82 32 98 33C124 35 137 14 165 13" stroke="url(#${e}-edge)" stroke-width="2.2" style="stroke:url(#${e}-edge);stroke-width:2.2"/>
        <path class="nexa-rig-edge nexa-rig-micro-hide" d="M79 39C104 43 121 31 143 24" stroke="#b4f7fb" stroke-opacity=".55" stroke-width="1" style="stroke:#b4f7fb;stroke-opacity:.55;stroke-width:1"/>
        <path class="nexa-rig-edge" d="M140 31L151 25" stroke="#dbffff" stroke-width="2" stroke-opacity=".7" style="stroke:#dbffff;stroke-opacity:.7;stroke-width:2"/>
      </g>
      <g data-part="face">
        <path d="M69 63C89 52 116 55 131 70C146 85 146 110 129 125C114 137 86 139 66 124C50 112 49 87 58 74C61 69 65 66 69 63Z" fill="#0b5786" fill-opacity=".25" style="fill:#0b5786;fill-opacity:.25"/>
        <path d="M68 65C88 54 115 58 129 72C142 86 141 108 126 121C110 135 84 133 67 120C54 110 52 91 60 76C62 71 65 68 68 65Z" fill="url(#${e}-glass)" stroke="#c0fbf8" stroke-opacity=".43" stroke-width="1.4" style="fill:url(#${e}-glass);stroke:#c0fbf8;stroke-opacity:.43;stroke-width:1.4"/>
        <path class="nexa-rig-edge nexa-rig-micro-hide" d="M65 73C81 58 107 60 122 69" stroke="#f0ffff" stroke-opacity=".56" stroke-width="2.7" style="stroke:#f0ffff;stroke-opacity:.56;stroke-width:2.7"/>
        <path class="nexa-rig-edge nexa-rig-micro-hide" d="M59 106Q59 114 65 118" stroke="#ddffff" stroke-opacity=".7" stroke-width="2" style="stroke:#ddffff;stroke-opacity:.7;stroke-width:2"/>
        <g data-part="brows"><path class="nexa-rig-brow" data-brow="left"/><path class="nexa-rig-brow" data-brow="right"/></g>
        <g data-part="eyes">
          <g data-eye="left"><path data-eye-white="left" fill="#e9ffff" stroke="#2a6685" stroke-width="1" style="fill:#e9ffff;stroke:#2a6685;stroke-width:1"/><g clip-path="url(#${e}-eye-l)"><g data-pupil="left"><ellipse cx="77" cy="94" rx="6.2" ry="7.8" fill="url(#${e}-pupil)" style="fill:url(#${e}-pupil)"/><circle class="nexa-rig-eye-spark" cx="75" cy="91" r="1.8"/><circle cx="80" cy="97" r=".8" fill="#83dced" style="fill:#83dced"/></g></g><path class="nexa-rig-lid-edge" data-lid="left"/></g>
          <g data-eye="right"><path data-eye-white="right" fill="#e9ffff" stroke="#2a6685" stroke-width="1" style="fill:#e9ffff;stroke:#2a6685;stroke-width:1"/><g clip-path="url(#${e}-eye-r)"><g data-pupil="right"><ellipse cx="114" cy="92" rx="6.2" ry="7.8" fill="url(#${e}-pupil)" style="fill:url(#${e}-pupil)"/><circle class="nexa-rig-eye-spark" cx="112" cy="89" r="1.8"/><circle cx="117" cy="95" r=".8" fill="#83dced" style="fill:#83dced"/></g></g><path class="nexa-rig-lid-edge" data-lid="right"/></g>
        </g>
        <g data-part="muzzle"><path d="M87 102Q96 105 104 101" fill="none" stroke="#e5ffff" stroke-opacity=".33" stroke-width="1.5" stroke-linecap="round" style="fill:none;stroke:#e5ffff;stroke-opacity:.33;stroke-width:1.5;stroke-linecap:round"/><path data-mouth="" class="nexa-rig-mouth-fill"/><path data-mouth-line="" class="nexa-rig-mouth-line"/><path data-mouth-light="" fill="#8adee8" style="fill:#8adee8"/></g>
        <g class="nexa-rig-success-highlight" data-part="cheeks"><path d="M63 105L71 108M122 105L129 101" class="nexa-rig-edge" stroke="#e0ffff" stroke-width="2.4" style="stroke:#e0ffff;stroke-width:2.4"/></g>
      </g>
      <g data-part="ribbon">
        <path d="M41 114C52 132 66 139 91 134C117 130 138 123 157 129C143 129 145 149 130 156C113 165 87 154 67 147C52 144 38 133 41 114Z" fill="url(#${e}-ribbon)" stroke="#4cc2db" stroke-opacity=".7" stroke-width="1" style="fill:url(#${e}-ribbon);stroke:#4cc2db;stroke-opacity:.7;stroke-width:1"/>
        <path d="M44 123C65 146 84 140 107 135C124 131 144 126 155 129C134 136 142 148 125 152C101 155 80 146 67 143C55 140 47 133 44 123Z" fill="#41c4da" fill-opacity=".32" style="fill:#41c4da;fill-opacity:.32"/>
        <path class="nexa-rig-edge" d="M42 116C55 140 76 140 97 135C117 130 139 124 156 129" stroke="url(#${e}-edge)" stroke-width="2.2" style="stroke:url(#${e}-edge);stroke-width:2.2"/>
        <path class="nexa-rig-edge nexa-rig-micro-hide" d="M78 149C106 157 127 160 137 146" stroke="#95e6ee" stroke-opacity=".45" stroke-width="1" style="stroke:#95e6ee;stroke-opacity:.45;stroke-width:1"/>
      </g>
      <g data-part="lights"><circle class="nexa-rig-thinking-light" data-light="one" cx="138" cy="49" r="2.1" fill="#d2ffff" style="fill:#d2ffff"/><circle class="nexa-rig-thinking-light" data-light="two" cx="164" cy="114" r="1.4" fill="#acf5ff" style="fill:#acf5ff"/><path class="nexa-rig-success-highlight nexa-rig-edge" data-success-light="" d="M155 57L159 47M161 61L168 57" stroke="#b6f9f8" stroke-width="2" style="stroke:#b6f9f8;stroke-width:2"/></g>
    </svg>`}var w=(e,t,n)=>e.setAttribute(t,String(n)),T=(e,t,n=0)=>Math.sin(e/t*Math.PI*2+n);function Ze(e,t=!1){let n=t?0:e.elapsed/1e3,r=Je(e.state);w(e.svg,`data-expression`,r),w(e.svg,`data-nexa-state`,e.state),w(e.svg,`aria-label`,`Nexa · ${qe[r]}`);let i=+!t,a=e.natural&&!t&&e.state!==`sleep`?e.behavior.sample(e.elapsed,e.state):null,o=r===`success`&&!t&&n<.9?Math.sin(n/.9*Math.PI*2)*1.8:0;if(e.natural){let t=r===`idle`||r===`listening`,s=i*T(n,9.7,e.phase)*(t?1.4:.5)+(a?.nod??0)+o,c=(a?.tilt??0)+(r===`listening`?2:0),l=1+i*T(n,6.8,e.phase+1)*.003;w(e.presence,`transform`,`translate(0 ${s.toFixed(3)}) rotate(${c.toFixed(3)} 100 110) translate(100 110) scale(${l.toFixed(4)}) translate(-100 -110)`)}else e.presence.removeAttribute(`transform`);let s=r===`success`?t?.55:n<.9?.55+.45*Math.sin(n/.9*Math.PI):.55:0,c=+(r===`thinking`),l=+(r===`speaking`),u=-3*c-7*s+i*T(n,c?4.7:7.1,e.phase)*(c?2.8:1.6),d=-21*s-4*c+i*(T(n,6.3,e.phase+1)*2+l*Math.max(0,T(n,3.6))*-7);w(e.parts.crown,`transform`,`rotate(${u.toFixed(3)} 75 52)`),w(e.parts[`side-fin`],`transform`,`rotate(${d.toFixed(3)} 137 109)`),w(e.parts[`far-fin`],`transform`,`rotate(${(s*11+i*T(n,8,2)*1.5).toFixed(3)} 57 110)`),w(e.parts.tail,`transform`,`rotate(${(i*T(n,8.4,e.phase+2)*2.8-s*3).toFixed(3)} 98 146)`),w(e.parts.ribbon,`transform`,`rotate(${(i*T(n,6.8,e.phase+4)*1.6-s*2).toFixed(3)} 62 136)`);let f=c?-2.4:+!!l,p=c?-2.5:0;if(e.natural)f+=a?.gazeX??0,p+=a?.gazeY??0,r===`listening`&&(f=1.5);else if(!t&&r!==`success`){let t=(n+e.phase)%8.6,r=t>3.1&&t<4.8?Math.sin((t-3.1)/1.7*Math.PI):0;f+=r*(c?3:l?-2.8:2.4),p-=r*(c?.7:.25)}let m=(n+e.phase*.45)%7.1,h=e.natural?a?.blink??0:!t&&r!==`success`&&m>5.9&&m<6.12?Math.sin((m-5.9)/.22*Math.PI):0;e.eyes.forEach((t,o)=>{let s=o?114:77,c=o?92:94,u=13.5,d=e.state===`sleep`?.15:r===`concerned`?5.8:r===`thinking`?o?4.4:5.7:r===`speaking`?o?8.5:7.5:r===`success`?3:o?7.2:7.7;d+=(a?.surprise??0)*2.2,d=Math.max(.15,d*(1-h));let m=r===`success`,g=m?c-5.5-d:c-d*1.5,_=m?c-5.5+d:c+d*1.55,v=`M${s-u} ${c}Q${s} ${g.toFixed(3)} ${s+u} ${c}Q${s} ${_.toFixed(3)} ${s-u} ${c}Z`;w(t.white,`d`,v),w(t.clip,`d`,v),w(t.lid,`d`,`M${s-u} ${c}Q${s} ${g.toFixed(3)} ${s+u} ${c}`),w(t.pupil,`transform`,`translate(${f.toFixed(3)} ${(p+(m?-2:0)).toFixed(3)})`);let y;y=r===`concerned`?o?`M103 78Q114 74 125 71`:`M65 73Q76 74 86 80`:r===`thinking`?o?`M103 77Q114 72 125 75`:`M65 76Q76 76 86 82`:r===`speaking`?o?`M104 73Q114 67 124 72`:`M66 78Q76 74 86 76`:m?o?`M103 76Q114 68 125 74`:`M65 77Q76 70 87 76`:o?`M104 76Q114 73 124 76`:`M66 79Q76 76 86 79`,w(t.brow,`d`,y),w(t.brow,`transform`,`translate(0 ${(i*l*T(n,4.2,o)*.7).toFixed(3)})`)});let g=``,_=``,v=``;if(r===`concerned`)_=`M88 118Q96 110 105 118`;else if(r===`idle`||r===`listening`)_=`M88 113Q96 ${(121+(a?.smile??0)*3).toFixed(3)} 104 112`;else if(r===`thinking`)_=`M94 116Q100 113 107 114`;else if(r===`success`)g=`M83 110Q96 117 109 108Q107 125 97 126Q87 127 83 110Z`,v=`M90 122Q98 118 105 120Q98 128 90 122Z`;else{let e=t?0:Math.floor(n*3.4)%8;e===3||e===7?_=`M88 113Q96 119 105 112`:e===2||e===5?(g=`M93 111C101 108 105 114 102 121C99 128 91 122 91 117Q91 114 93 111Z`,v=`M94 121Q98 117 102 120Q98 125 94 121Z`):e===1||e===4?g=`M87 113Q98 119 108 112Q105 121 98 121Q91 122 87 113Z`:(g=`M86 111Q96 117 108 110Q107 124 98 125Q88 125 86 111Z`,v=`M92 122Q99 118 105 120Q99 126 92 122Z`)}w(e.mouth,`d`,g),w(e.mouthLine,`d`,_),w(e.mouthLight,`d`,v),w(e.lightOne,`transform`,`translate(${(i*T(n,4.6)*4).toFixed(3)} ${(-i*(1+T(n,4.6,1))*3).toFixed(3)})`),w(e.lightTwo,`transform`,`translate(${(-i*T(n,5.4)*3).toFixed(3)} ${(i*T(n,5.4,2)*5).toFixed(3)})`),e.successLight.style.opacity=String(r===`success`?t?.65:Math.min(1,s*1.3):0)}function Qe(e,t){let n=e.ownerDocument,r=n.defaultView;if(!r)throw Error(`Nexa rig requires a browser document`);let i;do i=`nexa-rig-${++Ye}`;while(n.getElementById(i));e.innerHTML=Xe(i);let a=e.querySelector(`svg`);if(!a||typeof a.createSVGRect!=`function`)throw e.replaceChildren(),Error(`Nexa SVG rendering unavailable`);let o=e=>{let t=a.querySelector(e);if(!t)throw Error(`Missing Nexa rig part: ${e}`);return t},s=e=>o(`[data-part="${e}"]`),c=n.createElementNS(`http://www.w3.org/2000/svg`,`g`);c.dataset.part=`presence`;for(let e of[...a.children])e.tagName.toLowerCase()===`g`&&c.append(e);a.append(c);let l={svg:a,state:t.state,elapsed:0,phase:0,parts:{crown:s(`crown`),"side-fin":s(`side-fin`),"far-fin":s(`far-fin`),tail:s(`tail`),ribbon:s(`ribbon`)},eyes:[`left`,`right`].map(e=>({white:o(`[data-eye-white="${e}"]`),clip:o(`[data-eye-clip="${e}"]`),lid:o(`[data-lid="${e}"]`),pupil:o(`[data-pupil="${e}"]`),brow:o(`[data-brow="${e}"]`)})),mouth:o(`[data-mouth]`),mouthLine:o(`[data-mouth-line]`),mouthLight:o(`[data-mouth-light]`),lightOne:o(`[data-light="one"]`),lightTwo:o(`[data-light="two"]`),successLight:o(`[data-success-light]`),presence:c,natural:t.natural??!1,behavior:Ke()},u=t,d=0,f=0,p=!1,m=r.matchMedia(`(prefers-reduced-motion: reduce)`),h=!1,g=()=>!p&&(l.state!==`pleased`||l.elapsed<900)&&(!l.natural||l.state!==`concerned`||l.elapsed<1200)&&u.motion&&l.state!==`sleep`&&h&&e.isConnected&&n.visibilityState===`visible`&&n.hasFocus()&&!m.matches;function _(e){d=0,g()?(l.natural&&f&&e-f<32||(l.elapsed+=f?Math.min(e-f,80):0,f=e,Ze(l)),d=r.requestAnimationFrame(_)):v()}function v(){if(p)return;d&&r.cancelAnimationFrame(d),d=0,f=0;let e=g();a.dataset.motionActive=String(e),a.dataset.size=u.size<=40?`small`:`full`,Ze(l,!e),e&&(d=r.requestAnimationFrame(_))}let y=new r.IntersectionObserver(([e])=>{h=e?.isIntersecting??!1,v()});return y.observe(e),m.addEventListener(`change`,v),n.addEventListener(`visibilitychange`,v),r.addEventListener(`focus`,v),r.addEventListener(`blur`,v),v(),{update(e){if(p)return;e.state!==l.state&&(l.state=e.state,l.elapsed=0,l.behavior.reset());let t=u.motion!==e.motion||u.size!==e.size||u.natural!==e.natural||a.dataset.nexaState!==e.state;l.natural=e.natural??!1,u=e,t&&v()},react(e){l.natural&&g()&&l.state===`ready`&&l.behavior.react(e,l.elapsed,l.state)},unmount(){p||(p=!0,d&&r.cancelAnimationFrame(d),a.dataset.motionActive=`false`,y.disconnect(),m.removeEventListener(`change`,v),n.removeEventListener(`visibilitychange`,v),r.removeEventListener(`focus`,v),r.removeEventListener(`blur`,v),a.remove())}}}b.SALES,b.FOOD_ORDERS,b.ACCOMMODATION_STAYS,b.RETAIL_LABELS,b.CUSTOMER_CREDIT,b.ORDERS,b.FOOD_ORDERS;var $e={schemaVersion:1,character:`Nexa`,defaultState:`ready`,pathBase:`repository-root`,states:[`sleep`,`ready`,`listening`,`thinking`,`speaking`,`success`,`warning`],stateLabels:{sleep:`UYKU`,ready:`HAZIR`,listening:`DİNLİYOR`,thinking:`DÜŞÜNÜYOR`,speaking:`KONUŞUYOR`,success:`BAŞARILI`,warning:`UYARI`},themePolicy:`Same character pixels for light and dark. Only separate habitat and contact-shadow assets vary.`,motion:{static:!0,motionSafe:!0,bakedAnimation:!1},registration:{canvas:`square`,contentHeightRatio:.88,crop:[134,130,1178,1174],sharedBodyAlpha:!0,stateChanges:`inner-face-only`,edgeTreatment:`Detached alpha specks removed; nearest opaque RGB extended beneath common alpha fringe.`},opticalPolicy:{stateSizes:[32,48],source:`master/nexa-optical-source-1254.png`,changes:[`broad internal color masses`,`no thin internal ribbons`,`solid navy facial features`,`no tiny eye highlights`]},webPolicy:{conversationAvatarPlacement:`header-only`,perMessageAvatar:!1},assets:[{id:`master.nexa-ready-512`,state:`ready`,usage:`master`,dimensions:{width:512,height:512},assetPath:`assets/nexa/master/nexa-ready-512.png`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/png`,bytes:182850,sha256:`6ee4f84534e134cf6fc311f3170e3f21d44354c1b874ed95696e0f44dcd7f724`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`master.nexa-optical-512`,state:`ready`,usage:`optical-master`,dimensions:{width:512,height:512},assetPath:`assets/nexa/master/nexa-optical-512.png`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/png`,bytes:153559,sha256:`a9155d49612714c3dc4c679eae86c453416cf587e7d4eaca914a812d3a0c5dae`,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`states.nexa-sleep-512`,state:`sleep`,usage:`state`,dimensions:{width:512,height:512},assetPath:`assets/nexa/states/nexa-sleep-512.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:123104,sha256:`ed617e1d97059abf06a16c5f0cfd83fa06bf37bbc454b18086d6fdbe05ecb62e`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-sleep-expression.png`}},{id:`states.nexa-sleep-256`,state:`sleep`,usage:`state`,dimensions:{width:256,height:256},assetPath:`assets/nexa/states/nexa-sleep-256.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:37600,sha256:`9fbdae465719965ee8e2843a856309ac1f05b681647787c4264edbccea27a527`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-sleep-expression.png`}},{id:`states.nexa-sleep-128`,state:`sleep`,usage:`state`,dimensions:{width:128,height:128},assetPath:`assets/nexa/states/nexa-sleep-128.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:14310,sha256:`ebf69a9d3c6cb19e5094b85036689cdf6aa7de86a0884b0cb318497f57d01239`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-sleep-expression.png`}},{id:`states.nexa-sleep-96`,state:`sleep`,usage:`state`,dimensions:{width:96,height:96},assetPath:`assets/nexa/states/nexa-sleep-96.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:9112,sha256:`621c40cd2b6a5f9c8ad224c736d456597e7d6e867aa9c34245264d7e9a7931f7`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-sleep-expression.png`}},{id:`states.nexa-sleep-64`,state:`sleep`,usage:`state`,dimensions:{width:64,height:64},assetPath:`assets/nexa/states/nexa-sleep-64.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:5092,sha256:`a594bf7e5944c282c7b36be4f3d71ffbf1c5c70b2bce29c7fab71e2fb55b42a5`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-sleep-expression.png`}},{id:`states.nexa-sleep-48`,state:`sleep`,usage:`state`,dimensions:{width:48,height:48},assetPath:`assets/nexa/states/nexa-sleep-48.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:3054,sha256:`e3b3f79d840effad774ab0145589a35494b05b474d8fe3ab0ee1a226ecb222ba`,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-sleep-expression.png`}},{id:`states.nexa-sleep-32`,state:`sleep`,usage:`state`,dimensions:{width:32,height:32},assetPath:`assets/nexa/states/nexa-sleep-32.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:1840,sha256:`2d892998bb2f5651a93f673c5c3704f22d53611193da3b3701b8642340a7c68f`,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-sleep-expression.png`}},{id:`states.nexa-ready-512`,state:`ready`,usage:`state`,dimensions:{width:512,height:512},assetPath:`assets/nexa/states/nexa-ready-512.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:124244,sha256:`5db60cd69c0478808ec22c3fbfcf59660d5f225db975e05aa6ef76f44059f9e0`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`states.nexa-ready-256`,state:`ready`,usage:`state`,dimensions:{width:256,height:256},assetPath:`assets/nexa/states/nexa-ready-256.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:38084,sha256:`c8f4bd7222065c359b040afcd3adcf08162d7e1b417dfc0851d9d23f193e3f89`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`states.nexa-ready-128`,state:`ready`,usage:`state`,dimensions:{width:128,height:128},assetPath:`assets/nexa/states/nexa-ready-128.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:14470,sha256:`96a14c90617dc9dd8527d498698657a830a51b761989bb663c170815ae5d5a25`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`states.nexa-ready-96`,state:`ready`,usage:`state`,dimensions:{width:96,height:96},assetPath:`assets/nexa/states/nexa-ready-96.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:9202,sha256:`91d19941bbc1f844b296b288069a2719e6c19d8d7ecfc932fd72925788081c7c`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`states.nexa-ready-64`,state:`ready`,usage:`state`,dimensions:{width:64,height:64},assetPath:`assets/nexa/states/nexa-ready-64.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:5148,sha256:`4904b78fdba27ef56c526a17e9570439e235ece751fabd6790a62b15fd108d72`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`states.nexa-ready-48`,state:`ready`,usage:`state`,dimensions:{width:48,height:48},assetPath:`assets/nexa/states/nexa-ready-48.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:3128,sha256:`3ece597954adb08cafd95a9db46f8ce99bf3298f9c4c59ed2928658aa9cbd014`,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`states.nexa-ready-32`,state:`ready`,usage:`state`,dimensions:{width:32,height:32},assetPath:`assets/nexa/states/nexa-ready-32.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:1874,sha256:`9cdecfa7336d9fdfcd704ef1bbc07d105c89aacfde8a7e9de2159fa6f2652014`,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`states.nexa-listening-512`,state:`listening`,usage:`state`,dimensions:{width:512,height:512},assetPath:`assets/nexa/states/nexa-listening-512.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:124206,sha256:`fe06476a36dadcece221b1612289419f038c25cdd6f6f3546933a1c450ed0bca`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-listening-expression.png`}},{id:`states.nexa-listening-256`,state:`listening`,usage:`state`,dimensions:{width:256,height:256},assetPath:`assets/nexa/states/nexa-listening-256.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:38100,sha256:`7143f8d8e6972c251b3cfe4491af1368d15ff62b201952a36927e4339af7423a`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-listening-expression.png`}},{id:`states.nexa-listening-128`,state:`listening`,usage:`state`,dimensions:{width:128,height:128},assetPath:`assets/nexa/states/nexa-listening-128.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:14570,sha256:`6076c5646044e14b70f4df191c3112037a53d2dae585de0515e40f87ec627e08`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-listening-expression.png`}},{id:`states.nexa-listening-96`,state:`listening`,usage:`state`,dimensions:{width:96,height:96},assetPath:`assets/nexa/states/nexa-listening-96.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:9274,sha256:`6a1a508295dddc3303535d1a3f38f55505b9ef541a39a83627b40452b0c61db7`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-listening-expression.png`}},{id:`states.nexa-listening-64`,state:`listening`,usage:`state`,dimensions:{width:64,height:64},assetPath:`assets/nexa/states/nexa-listening-64.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:5174,sha256:`1570bcf5f3869ed3cc18e5f818cccf6dee0da56e6e6e8ea371d8ae4cfd63dc2f`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-listening-expression.png`}},{id:`states.nexa-listening-48`,state:`listening`,usage:`state`,dimensions:{width:48,height:48},assetPath:`assets/nexa/states/nexa-listening-48.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:3120,sha256:`37e0f6e4d1e3085a74c77fb5b920875e2dbc722a8bb6ac64510945b372ec8ad2`,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-listening-expression.png`}},{id:`states.nexa-listening-32`,state:`listening`,usage:`state`,dimensions:{width:32,height:32},assetPath:`assets/nexa/states/nexa-listening-32.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:1866,sha256:`cbecb57b37ad0c80b996d15452fc1cfd942f7bfd910072c3ef02c00dcabb2dc4`,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-listening-expression.png`}},{id:`states.nexa-thinking-512`,state:`thinking`,usage:`state`,dimensions:{width:512,height:512},assetPath:`assets/nexa/states/nexa-thinking-512.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:124118,sha256:`34fc6b9d86a3fd9c39ff6cab03a7e50a3903a32eef30a3cadda01bf9b6f7789e`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-thinking-expression.png`}},{id:`states.nexa-thinking-256`,state:`thinking`,usage:`state`,dimensions:{width:256,height:256},assetPath:`assets/nexa/states/nexa-thinking-256.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:38136,sha256:`e619f121b336b2cc6f6fd8c49575d518ec5f8eec242ce8ebc0db4ee0afd0ec49`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-thinking-expression.png`}},{id:`states.nexa-thinking-128`,state:`thinking`,usage:`state`,dimensions:{width:128,height:128},assetPath:`assets/nexa/states/nexa-thinking-128.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:14518,sha256:`da3e3fe6773bccbd0a87b9bef747e9716a2fa830e39635d352c633ec47ca1583`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-thinking-expression.png`}},{id:`states.nexa-thinking-96`,state:`thinking`,usage:`state`,dimensions:{width:96,height:96},assetPath:`assets/nexa/states/nexa-thinking-96.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:9242,sha256:`c3a5acd2fb5ef7ab5a854b1c5f81c34dfb63491e0934cca5e142da0a89844076`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-thinking-expression.png`}},{id:`states.nexa-thinking-64`,state:`thinking`,usage:`state`,dimensions:{width:64,height:64},assetPath:`assets/nexa/states/nexa-thinking-64.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:5164,sha256:`e75cfa7efd7b9b9cea157c4da8fae73b780d96deaadd84992888c0c06b1b12a7`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-thinking-expression.png`}},{id:`states.nexa-thinking-48`,state:`thinking`,usage:`state`,dimensions:{width:48,height:48},assetPath:`assets/nexa/states/nexa-thinking-48.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:3074,sha256:`a6a9e54f76a106d705cb2bbb51615c719c308b1f9b57fafa2724d1fab2a63f9f`,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-thinking-expression.png`}},{id:`states.nexa-thinking-32`,state:`thinking`,usage:`state`,dimensions:{width:32,height:32},assetPath:`assets/nexa/states/nexa-thinking-32.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:1866,sha256:`fb39bea7021be1c45d75ce46a3d641bb25b5ec4aec375c119cca43eb3a63a0cd`,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-thinking-expression.png`}},{id:`states.nexa-speaking-512`,state:`speaking`,usage:`state`,dimensions:{width:512,height:512},assetPath:`assets/nexa/states/nexa-speaking-512.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:124414,sha256:`5502d6840142fea2b02f032d187d7f6bb7d8aa477130868e02c756ee347c05e6`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-speaking-expression.png`}},{id:`states.nexa-speaking-256`,state:`speaking`,usage:`state`,dimensions:{width:256,height:256},assetPath:`assets/nexa/states/nexa-speaking-256.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:38300,sha256:`ed84bd8cea354af587169326305ed521c818049ea893317073111dccaa8ad50e`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-speaking-expression.png`}},{id:`states.nexa-speaking-128`,state:`speaking`,usage:`state`,dimensions:{width:128,height:128},assetPath:`assets/nexa/states/nexa-speaking-128.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:14584,sha256:`09770add79a1cb9b96f1cd17a64fe1dbec0b37a3e0d9aaed91f9f67bdaa13d83`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-speaking-expression.png`}},{id:`states.nexa-speaking-96`,state:`speaking`,usage:`state`,dimensions:{width:96,height:96},assetPath:`assets/nexa/states/nexa-speaking-96.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:9352,sha256:`0be48d62c1c09a4853cf794ab97f960e3e3d0431f18c0d064e48a090584ec99f`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-speaking-expression.png`}},{id:`states.nexa-speaking-64`,state:`speaking`,usage:`state`,dimensions:{width:64,height:64},assetPath:`assets/nexa/states/nexa-speaking-64.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:5190,sha256:`bf2715144b02b7ba4e255eb35381d26043511e9ef339597eebd58f328dd8fd68`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-speaking-expression.png`}},{id:`states.nexa-speaking-48`,state:`speaking`,usage:`state`,dimensions:{width:48,height:48},assetPath:`assets/nexa/states/nexa-speaking-48.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:3104,sha256:`9becd9f6dd3e2b4d9890509e2c2eb771a4ce8aa979527a327bae220b841c08df`,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-speaking-expression.png`}},{id:`states.nexa-speaking-32`,state:`speaking`,usage:`state`,dimensions:{width:32,height:32},assetPath:`assets/nexa/states/nexa-speaking-32.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:1874,sha256:`998477a58fb1ff12477975bc38a5a627ab81e9a165869125af395d7b7971d389`,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-speaking-expression.png`}},{id:`states.nexa-success-512`,state:`success`,usage:`state`,dimensions:{width:512,height:512},assetPath:`assets/nexa/states/nexa-success-512.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:124328,sha256:`b124543ad87ce5d0c59f20d6ead57d09ca11aa87601aac35ad160e57be38ab54`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-success-expression.png`}},{id:`states.nexa-success-256`,state:`success`,usage:`state`,dimensions:{width:256,height:256},assetPath:`assets/nexa/states/nexa-success-256.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:38078,sha256:`c29a7545577a6d5f334e1c978a54f61d04a8ecad1321adcf807125de94bcaf97`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-success-expression.png`}},{id:`states.nexa-success-128`,state:`success`,usage:`state`,dimensions:{width:128,height:128},assetPath:`assets/nexa/states/nexa-success-128.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:14524,sha256:`a99bebe6dd53c28a3242d11138b774aef5bbf9727ac3bb5efa369a8dfd0eb3e7`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-success-expression.png`}},{id:`states.nexa-success-96`,state:`success`,usage:`state`,dimensions:{width:96,height:96},assetPath:`assets/nexa/states/nexa-success-96.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:9236,sha256:`7fb8a120d30f4bd19b9f881c09652201e69d0146cafdd8b7f5c337a501acbcd5`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-success-expression.png`}},{id:`states.nexa-success-64`,state:`success`,usage:`state`,dimensions:{width:64,height:64},assetPath:`assets/nexa/states/nexa-success-64.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:5158,sha256:`46a40c63c2bd110d2eae84c2c9aaa19978db3093b021f23648d1f1a36878a150`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-success-expression.png`}},{id:`states.nexa-success-48`,state:`success`,usage:`state`,dimensions:{width:48,height:48},assetPath:`assets/nexa/states/nexa-success-48.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:3068,sha256:`4d417672752a489386604a630eb98e848fb1d71d6373516c8f753ebaf0564e6b`,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-success-expression.png`}},{id:`states.nexa-success-32`,state:`success`,usage:`state`,dimensions:{width:32,height:32},assetPath:`assets/nexa/states/nexa-success-32.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:1868,sha256:`60d9c7cf797ca9af341ef9f26e937b70e3a65cf106771c0e0c9f398bc89d6a6a`,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-success-expression.png`}},{id:`states.nexa-warning-512`,state:`warning`,usage:`state`,dimensions:{width:512,height:512},assetPath:`assets/nexa/states/nexa-warning-512.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:124034,sha256:`b29ea8b23fc90736c503aec043474ed6636fafa67961da98861d1bdec283f763`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-warning-expression.png`}},{id:`states.nexa-warning-256`,state:`warning`,usage:`state`,dimensions:{width:256,height:256},assetPath:`assets/nexa/states/nexa-warning-256.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:38028,sha256:`f9773fe7a439e1b19984a7b53043729ee65faac9e16ddb8d0d5d86d3bc4e087a`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-warning-expression.png`}},{id:`states.nexa-warning-128`,state:`warning`,usage:`state`,dimensions:{width:128,height:128},assetPath:`assets/nexa/states/nexa-warning-128.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:14484,sha256:`d85a6d9087938fff667d89ef0f2d52ff5d2cc77a9cfa432cc6f75f6bf644ff71`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-warning-expression.png`}},{id:`states.nexa-warning-96`,state:`warning`,usage:`state`,dimensions:{width:96,height:96},assetPath:`assets/nexa/states/nexa-warning-96.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:9230,sha256:`70f5a9020967183796dcfc9a3d38dd3fe899fb83e83df019c8ccaf6f495456b2`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-warning-expression.png`}},{id:`states.nexa-warning-64`,state:`warning`,usage:`state`,dimensions:{width:64,height:64},assetPath:`assets/nexa/states/nexa-warning-64.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:5118,sha256:`65a9c940e498b4a432dcdd35439924cdfdd70dfdf93f4e4fcfeb5cd400e64012`,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-warning-expression.png`}},{id:`states.nexa-warning-48`,state:`warning`,usage:`state`,dimensions:{width:48,height:48},assetPath:`assets/nexa/states/nexa-warning-48.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:3082,sha256:`0f44663e9efffd04c7abafa822105327b9f19d61cc3df4a52d8a7580220c7581`,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-warning-expression.png`}},{id:`states.nexa-warning-32`,state:`warning`,usage:`state`,dimensions:{width:32,height:32},assetPath:`assets/nexa/states/nexa-warning-32.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:1870,sha256:`60eaddba12e1ea4c53af4f0ca544b8f3073ff22110ffe662d6829e1a211debfe`,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-warning-expression.png`}},{id:`desktop.nexa-desktop-wide`,state:`ready`,usage:`desktop-wide`,dimensions:{width:256,height:256},assetPath:`assets/nexa/states/nexa-ready-256.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:38084,sha256:`c8f4bd7222065c359b040afcd3adcf08162d7e1b417dfc0851d9d23f193e3f89`,recommendedDisplayDimensions:{width:128,height:128},pixelRatio:2,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`desktop.nexa-desktop-compact`,state:`ready`,usage:`desktop-compact`,dimensions:{width:128,height:128},assetPath:`assets/nexa/desktop/nexa-desktop-compact.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:11444,sha256:`590c7c0f4475271cd2e722573859ec4bdc8181e97b2e6cb2c7a2762b79aaea7c`,recommendedDisplayDimensions:{width:64,height:64},pixelRatio:2,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`desktop.nexa-desktop-micro`,state:`ready`,usage:`desktop-micro`,dimensions:{width:40,height:40},assetPath:`assets/nexa/desktop/nexa-desktop-micro.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:2560,sha256:`a7675b5183bf19c4db4a46d53544b084b45857a0b7235a035d6c568d8c9872c9`,recommendedDisplayDimensions:{width:40,height:40},pixelRatio:1,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`web.nexa-web-launcher`,state:`ready`,usage:`web-launcher`,dimensions:{width:96,height:96},assetPath:`assets/nexa/web/nexa-web-launcher.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:7690,sha256:`941d9cffd2fe6e3f5fcfc7b75a28943e10995c558f69b2499285e96f68d669c6`,recommendedDisplayDimensions:{width:48,height:48},pixelRatio:2,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`web.nexa-web-welcome`,state:`ready`,usage:`web-welcome`,dimensions:{width:256,height:256},assetPath:`assets/nexa/states/nexa-ready-256.webp`,detail:`full`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:38084,sha256:`c8f4bd7222065c359b040afcd3adcf08162d7e1b417dfc0851d9d23f193e3f89`,recommendedDisplayDimensions:{width:128,height:128},pixelRatio:2,source:{body:`assets/nexa/master/nexa-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`web.nexa-web-compact-header`,state:`ready`,usage:`web-compact-header`,dimensions:{width:64,height:64},assetPath:`assets/nexa/web/nexa-web-compact-header.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:4578,sha256:`7a09913c80c5c24a303ff56d7224d89daf09c971290117827c5fd8e0abf60b82`,recommendedDisplayDimensions:{width:32,height:32},pixelRatio:2,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`web.nexa-web-thinking-header`,state:`thinking`,usage:`web-thinking-header`,dimensions:{width:64,height:64},assetPath:`assets/nexa/web/nexa-web-thinking-header.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:4518,sha256:`7cc28fa304d87f26411de3a2442ddd1e878025ece77cd358e5d3cacf4e430611`,recommendedDisplayDimensions:{width:32,height:32},pixelRatio:2,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-thinking-expression.png`}},{id:`web.nexa-web-speaking-header`,state:`speaking`,usage:`web-speaking-header`,dimensions:{width:64,height:64},assetPath:`assets/nexa/web/nexa-web-speaking-header.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:4502,sha256:`4f430efa94d60e20f121e24d0604331691c6ced4dd1e24f65584bbf3f2780ef0`,recommendedDisplayDimensions:{width:32,height:32},pixelRatio:2,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-speaking-expression.png`}},{id:`desktop.nexa-desktop-micro-36`,state:`ready`,usage:`desktop-micro`,dimensions:{width:36,height:36},assetPath:`assets/nexa/desktop/nexa-desktop-micro-36.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:2256,sha256:`34cf2bf81cd388b6cf59f8dd12cbd0020cb13312d84cc0199da968467475653a`,recommendedDisplayDimensions:{width:36,height:36},pixelRatio:1,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`desktop.nexa-desktop-micro-44`,state:`ready`,usage:`desktop-micro`,dimensions:{width:44,height:44},assetPath:`assets/nexa/desktop/nexa-desktop-micro-44.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:2968,sha256:`bb43de6be93f792d135ffbb5789f2a1c67a8432f74bf4c050e5b2a27bb442c3e`,recommendedDisplayDimensions:{width:44,height:44},pixelRatio:1,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`desktop.nexa-desktop-micro-72`,state:`ready`,usage:`desktop-micro`,dimensions:{width:72,height:72},assetPath:`assets/nexa/desktop/nexa-desktop-micro-72.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:5296,sha256:`dfe06f69e67064f7384b679db867ba59a46375df6333e2ad79c5ddef2bc439d7`,recommendedDisplayDimensions:{width:36,height:36},pixelRatio:2,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`desktop.nexa-desktop-micro-80`,state:`ready`,usage:`desktop-micro`,dimensions:{width:80,height:80},assetPath:`assets/nexa/desktop/nexa-desktop-micro-80.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:6036,sha256:`5c89e9eb2376331c9c7b71fb2a926e245f808369adf609b35a05cd9bd72025d9`,recommendedDisplayDimensions:{width:40,height:40},pixelRatio:2,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`desktop.nexa-desktop-micro-88`,state:`ready`,usage:`desktop-micro`,dimensions:{width:88,height:88},assetPath:`assets/nexa/desktop/nexa-desktop-micro-88.webp`,detail:`optical`,theme:`independent`,static:!0,motionSafe:!0,animated:!1,format:`image/webp`,bytes:6792,sha256:`8d22f8447f6c19e17ae94f757ee91633049386f61e67e0337aefd3e6980d47d5`,recommendedDisplayDimensions:{width:44,height:44},pixelRatio:2,source:{body:`assets/nexa/master/nexa-optical-body-source-1254.png`,expression:`assets/nexa/master/expressions/nexa-ready-expression.png`}},{id:`habitat.nexa-habitat-wide-light`,state:null,usage:`habitat-wide`,dimensions:{width:256,height:144},assetPath:`assets/nexa/habitat/nexa-habitat-wide-light.svg`,detail:`habitat`,theme:`light`,static:!0,motionSafe:!0,animated:!1,format:`image/svg+xml`,bytes:535,sha256:`2efa2524def42eebd3f37f3e3713dd874df3de29f938255661278593f90f6d2b`,vectorSource:`assets/nexa/habitat/nexa-habitat-wide-light.svg`},{id:`habitat.nexa-habitat-compact-light`,state:null,usage:`habitat-compact`,dimensions:{width:192,height:80},assetPath:`assets/nexa/habitat/nexa-habitat-compact-light.svg`,detail:`habitat`,theme:`light`,static:!0,motionSafe:!0,animated:!1,format:`image/svg+xml`,bytes:522,sha256:`eca2d4bf697bda37db5ab2e2d05df9943c5c84ff05b8b357ae8bbef061925ec6`,vectorSource:`assets/nexa/habitat/nexa-habitat-compact-light.svg`},{id:`habitat.nexa-contact-shadow-light`,state:null,usage:`contact-shadow`,dimensions:{width:128,height:24},assetPath:`assets/nexa/habitat/nexa-contact-shadow-light.svg`,detail:`shadow`,theme:`light`,static:!0,motionSafe:!0,animated:!1,format:`image/svg+xml`,bytes:316,sha256:`dfaacc2c2f3ff978ee8491e15e9ac0c5e4e663909dee85f26a7c370fee043030`,vectorSource:`assets/nexa/habitat/nexa-contact-shadow-light.svg`},{id:`habitat.nexa-micro-shadow-light`,state:null,usage:`micro-shadow`,dimensions:{width:48,height:12},assetPath:`assets/nexa/habitat/nexa-micro-shadow-light.svg`,detail:`shadow`,theme:`light`,static:!0,motionSafe:!0,animated:!1,format:`image/svg+xml`,bytes:312,sha256:`470bb94144f0a7b77215969e0d94396cf27fe93720e6a28778ca1082ea6c6045`,vectorSource:`assets/nexa/habitat/nexa-micro-shadow-light.svg`},{id:`habitat.nexa-habitat-wide-dark`,state:null,usage:`habitat-wide`,dimensions:{width:256,height:144},assetPath:`assets/nexa/habitat/nexa-habitat-wide-dark.svg`,detail:`habitat`,theme:`dark`,static:!0,motionSafe:!0,animated:!1,format:`image/svg+xml`,bytes:535,sha256:`00b7a358aa64e7d0e7c9e1790f6928b3e74439b0e42ded8aca73ff86bb7712d2`,vectorSource:`assets/nexa/habitat/nexa-habitat-wide-dark.svg`},{id:`habitat.nexa-habitat-compact-dark`,state:null,usage:`habitat-compact`,dimensions:{width:192,height:80},assetPath:`assets/nexa/habitat/nexa-habitat-compact-dark.svg`,detail:`habitat`,theme:`dark`,static:!0,motionSafe:!0,animated:!1,format:`image/svg+xml`,bytes:522,sha256:`a7a6ebff446a1e97fad63ce62c64efbf26f03dba91e7298e3c23eea6ef7e9309`,vectorSource:`assets/nexa/habitat/nexa-habitat-compact-dark.svg`},{id:`habitat.nexa-contact-shadow-dark`,state:null,usage:`contact-shadow`,dimensions:{width:128,height:24},assetPath:`assets/nexa/habitat/nexa-contact-shadow-dark.svg`,detail:`shadow`,theme:`dark`,static:!0,motionSafe:!0,animated:!1,format:`image/svg+xml`,bytes:316,sha256:`baf462e0d1cc505f94a3ce25278f3ecdc622c2d136e96b6c79c91942880cb92a`,vectorSource:`assets/nexa/habitat/nexa-contact-shadow-dark.svg`},{id:`habitat.nexa-micro-shadow-dark`,state:null,usage:`micro-shadow`,dimensions:{width:48,height:12},assetPath:`assets/nexa/habitat/nexa-micro-shadow-dark.svg`,detail:`shadow`,theme:`dark`,static:!0,motionSafe:!0,animated:!1,format:`image/svg+xml`,bytes:312,sha256:`1b93e18755393d157c7addaa419593c03363c5be1bba7f959c09ae1c9b00b554`,vectorSource:`assets/nexa/habitat/nexa-micro-shadow-dark.svg`}],sources:{body:`assets/nexa/master/nexa-body-source-1254.png`,opticalBody:`assets/nexa/master/nexa-optical-body-source-1254.png`,expressionMask:`assets/nexa/master/nexa-expression-mask-1254.png`,readyHighResolution:`assets/nexa/master/nexa-ready-source-1254.png`,opticalHighResolution:`assets/nexa/master/nexa-optical-source-1254.png`,expressions:{sleep:`assets/nexa/master/expressions/nexa-sleep-expression.png`,ready:`assets/nexa/master/expressions/nexa-ready-expression.png`,listening:`assets/nexa/master/expressions/nexa-listening-expression.png`,thinking:`assets/nexa/master/expressions/nexa-thinking-expression.png`,speaking:`assets/nexa/master/expressions/nexa-speaking-expression.png`,success:`assets/nexa/master/expressions/nexa-success-expression.png`,warning:`assets/nexa/master/expressions/nexa-warning-expression.png`},generationPrompts:`assets/nexa/master/generation-prompts.json`,lineage:`assets/nexa/master/source-lineage.json`},runtime:{stateAliases:{pleased:`success`,concerned:`warning`},desktop:{wide:{usage:`state`,width:256,displaySize:112},compact:{usage:`state`,width:96,displaySize:56},micro:{usage:`state`,width:48,displaySize:40}},web:{launcher:{usage:`web-launcher`},welcome:{usage:`web-welcome`},ready:{usage:`web-compact-header`},thinking:{usage:`web-thinking-header`},speaking:{usage:`web-speaking-header`},concerned:{usage:`state`,state:`warning`,width:48}},fallbackPolicy:`WebP supported by target Electron and modern browsers; no redundant runtime PNG fallback. Source masters remain PNG.`}},et=document.currentScript instanceof HTMLScriptElement?document.currentScript.src:``,E=Ue({schedule:(e,t)=>window.setTimeout(e,t),cancel:e=>window.clearTimeout(e)},{response:1400,success:1600,error:2800});function tt(e,t,n){let r=e===`header`?t===`thinking`||t===`speaking`||t===`concerned`?t:`ready`:e,i=Ve($e,$e.runtime.web[r]);return et?new URL(i.assetPath,new URL(`.`,et)).href:n?`${n.replace(/\/$/,``)}/${i.assetPath}`:i.assetPath}var nt={launcher:48,welcome:112,header:32},rt=[],it=[];function at(){for(let{controller:e,removeHover:t}of rt)t(),e.unmount();rt=[],it=[]}function ot(e,t){for(let n of e.querySelectorAll(`[data-nexa-role]`)){let r=n.dataset.nexaRole;try{let e=Qe(n,{state:E.getState(),motion:!1,natural:!0,size:nt[r]}),t=()=>e.react(`hover`);n.addEventListener(`pointerenter`,t),rt.push({role:r,controller:e,removeHover:()=>n.removeEventListener(`pointerenter`,t)})}catch{let i=e.ownerDocument.createElement(`img`);i.alt=``,i.className=`ya-widget-nexa-fallback`,i.src=tt(r,E.getState(),t),n.replaceChildren(i),it.push({role:r,image:i})}}}function st(e,t){let n=E.getState();for(let{role:t,controller:r}of rt)r.update({state:n,motion:e&&t!==`launcher`,natural:!0,size:nt[t]});for(let{role:e,image:r}of it){let i=tt(e,n,t);r.src!==i&&(r.src=i)}let r=document.querySelector(`[data-ya-nexa-speech-slot]`),i=r?.querySelector(`[data-ya-nexa-speech]`);if(!r||!i||r.dataset.state===n)return;r.dataset.state=n;let o=a(He[n]);if(r.hidden=!o,i.setAttribute(`aria-label`,o),i.textContent=o,n===`thinking`){i.textContent=o.replace(/…$/,``);let e=document.createElement(`span`);e.className=`ya-nexa-speech-dots`,e.setAttribute(`aria-hidden`,`true`);for(let t=0;t<3;t++){let t=document.createElement(`i`);t.textContent=`.`,e.append(t)}i.append(e)}}var D=`#yardimci-asistan-widget`,ct=`yardimci-asistan-direct-request-style`,lt=new WeakMap,ut=!1,dt=!1,O={businessName:`Yardımcı Asistan`,whatsappPhone:``,apiBaseUrl:``};function ft(){if(ut)return;ut=!0,O={...O,...Tt()},Dt(),pt(),queueMicrotask(pt),document.addEventListener(`submit`,gt,!0);let e=document.querySelector(D);e&&(mt(e),ht(e))}function pt(){let e=window.YardimciAsistanWidget;if(!e||typeof e.init!=`function`||e.__directRequestInitWrapped===!0)return;let t=e.init.bind(e);e.init=(e={})=>{O={...O,...Et(e)},t(e);let n=document.querySelector(D);n&&(mt(n),queueMicrotask(()=>ht(n)))},e.__directRequestInitWrapped=!0}function mt(e){e.dataset.yaDirectRequestObserved!==`1`&&(e.dataset.yaDirectRequestObserved=`1`,new MutationObserver(()=>ht(e)).observe(e,{childList:!0,subtree:!0}))}function ht(e){let t=e.querySelector(`.ya-widget-form[data-ya-form]`);if(!t)return;let n=t.querySelector(`button[type="submit"]`);n&&n.dataset.yaDirectRequestButton!==`1`&&(n.dataset.yaDirectRequestButton=`1`,n.innerHTML=`${kt()}<span>${o(`Talebi Gönder`)}</span>`)}function gt(e){let t=e.target instanceof HTMLFormElement?e.target:null;t?.matches(`.ya-widget-form[data-ya-form]`)&&(e.preventDefault(),e.stopImmediatePropagation(),dt||_t(t))}async function _t(e){if(!e.reportValidity())return;let t=new FormData(e),n=String(t.get(`customer_phone`)??``).trim(),r=me(n);if(!r.ok){k(a(r.error)),e.querySelector(`input[name="customer_phone"]`)?.focus();return}let i=String(t.get(`request_type`)??`pension_reservation`);if(i!==`pension_reservation`&&i!==`restaurant_reservation`&&i!==`general_info`){k(a(`Talep türü geçerli değil. Lütfen yeniden deneyin.`));return}let o={request_type:i,customer_name:String(t.get(`customer_name`)??``).trim(),customer_phone:n,date_text:String(t.get(`date_text`)??``).trim(),start_date:String(t.get(`start_date`)??``).trim(),end_date:String(t.get(`end_date`)??``).trim(),time:String(t.get(`time`)??``).trim(),guest_count:Number(t.get(`guest_count`)??1),message:vt(String(t.get(`message`)??``).trim(),String(t.get(`context_resource_type`)??``).trim(),String(t.get(`context_resource_name`)??``).trim()),source:`web_form`,whatsapp_message:``,context:{resourceType:String(t.get(`context_resource_type`)??``).trim(),resourceId:String(t.get(`context_resource_id`)??``).trim(),resourceName:String(t.get(`context_resource_name`)??``).trim(),sourcePath:String(t.get(`context_source_path`)??``).trim()}},s=yt(o);if(!o.customer_name||s||!Number.isFinite(o.guest_count)||o.guest_count<1){k(s||a(`Lütfen gerekli alanları kontrol edin.`));return}if(o.whatsapp_message=ye({...o,time_text:o.time},O.businessName||a(`İşletme`)),!O.apiBaseUrl.trim()){k(a(`Web talep bağlantısı bu sitede etkin değil. İsterseniz WhatsApp üzerinden yazabilirsiniz.`)),xt(e,o.whatsapp_message);return}let c=JSON.stringify({...o,customer_phone:r.e164,whatsapp_message:``}),l=lt.get(e),u=l?.intent===c?l.key:Array.from(crypto.getRandomValues(new Uint8Array(16)),e=>e.toString(16).padStart(2,`0`)).join(``);lt.set(e,{intent:c,key:u}),o.idempotency_key=u,dt=!0,wt(),Ct(e,!0);let d=E.begin(),f=a(`Talep işletmeye iletilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.`);try{let t=await fetch(`${O.apiBaseUrl.trim().replace(/\/$/,``)}/api/request.php`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(o)}),n=await t.json().catch(()=>null);if(!t.ok||n?.ok!==!0||!n.request_id)throw f=t.status===429?a(`Çok fazla istek gönderildi. Biraz sonra aynı talebi tekrar deneyin.`):t.status>=400&&t.status<500?a(`İstek işlenemedi. Lütfen bilgileri kontrol edip tekrar deneyin.`):a(`Talep işletmeye iletilemedi.`),Error(`request_failed`);d(e.isConnected?`success`:`cancel`),lt.delete(e),wt(),bt(e,n.whatsapp_message||o.whatsapp_message)}catch{d(e.isConnected?`error`:`cancel`),k(f),xt(e,o.whatsapp_message),Ct(e,!1)}finally{dt=!1}}function vt(e,t,n){return n?[`${a(t===`room`?`İlgili oda`:t===`table`?`İlgili masa`:t===`product`?`İlgili ürün`:`İlgili kayıt`)}: ${n}`,e].filter(Boolean).join(`
`):e}function yt(e){return e.request_type===`general_info`?``:e.request_type===`pension_reservation`?!e.start_date||!e.end_date?a(`Lütfen giriş ve çıkış tarihlerini seçin.`):e.end_date<=e.start_date?a(`Çıkış tarihi giriş tarihinden sonra olmalı.`):``:e.start_date?e.time?``:a(`Lütfen rezervasyon saatini seçin.`):a(`Lütfen rezervasyon tarihini seçin.`)}function bt(e,t){let n=e.closest(`.ya-widget-subview`),r=n?.querySelector(`.ya-widget-subview-intro`),i=r?.querySelector(`h2`),s=r?.querySelector(`p`);i&&(i.textContent=a(`Talebiniz işletmeye iletildi`)),s&&(s.textContent=a(`İşletme talebinizi inceleyip sizinle iletişime geçecek.`));let c=document.createElement(`div`);c.className=`ya-widget-request-success`;let l=document.createElement(`div`);l.className=`ya-widget-request-success-card`,l.innerHTML=`${jt()}<div><strong>${o(`Talebiniz kaydedildi.`)}</strong></div>`,c.appendChild(l);let u=document.createElement(`div`);if(u.className=`ya-widget-request-success-actions`,St()){let e=document.createElement(`button`);e.type=`button`,e.className=`ya-widget-secondary-action`,e.dataset.yaRequestWhatsapp=`1`,e.innerHTML=`${At()}<span>${o(`WhatsApp'tan da yaz`)}</span>`,e.addEventListener(`click`,()=>{let e=fe(O.whatsappPhone,t);e&&window.open(e,`_blank`,`noopener,noreferrer`)}),u.appendChild(e)}let d=document.createElement(`button`);d.type=`button`,d.className=`ya-widget-primary-action`,d.dataset.yaRequestDone=`1`,d.innerHTML=`${jt()}<span>${o(`Tamam`)}</span>`,d.addEventListener(`click`,()=>{n?.querySelector(`[data-ya-view="home"]`)?.click()}),u.appendChild(d),c.appendChild(u),e.replaceWith(c)}function xt(e,t){if(!St()||e.querySelector(`[data-ya-request-fallback]`))return;let n=document.createElement(`button`);n.type=`button`,n.className=`ya-widget-secondary-action ya-widget-request-fallback`,n.dataset.yaRequestFallback=`1`,n.innerHTML=`${At()}<span>${o(`WhatsApp'tan Yaz`)}</span>`,n.addEventListener(`click`,()=>{let e=fe(O.whatsappPhone,t);e&&window.open(e,`_blank`,`noopener,noreferrer`)}),e.querySelector(`button[type="submit"]`)?.insertAdjacentElement(`afterend`,n)}function St(){return document.querySelector(D)?.dataset.yaWhatsappEnabled!==`0`&&O.whatsappPhone.trim()!==``}function Ct(e,t){let n=e.querySelector(`button[type="submit"]`);n&&(n.disabled=t,n.classList.toggle(`is-loading`,t),n.innerHTML=t?`<span class="ya-widget-spinner" aria-hidden="true"></span><span>${o(`Talep gönderiliyor…`)}</span>`:`${kt()}<span>${o(`Talebi Gönder`)}</span>`)}function k(e){let t=document.querySelector(`${D} [data-ya-status]`),n=t?.querySelector(`[data-ya-status-text]`);t&&n&&(n.textContent=e,t.hidden=!1)}function wt(){let e=document.querySelector(`${D} [data-ya-status]`),t=e?.querySelector(`[data-ya-status-text]`);e&&t&&(t.textContent=``,e.hidden=!0)}function Tt(){let e=Array.from(document.scripts).reverse(),t=(document.currentScript??e.find(e=>e.dataset.apiBaseUrl!==void 0||/widget\.js(?:$|\?)/.test(e.src)))?.dataset;return Et({...t?.businessName===void 0?{}:{businessName:t.businessName},...t?.whatsappPhone===void 0?{}:{whatsappPhone:t.whatsappPhone},...t?.apiBaseUrl===void 0?{}:{apiBaseUrl:t.apiBaseUrl}})}function Et(e){let t={};return typeof e.businessName==`string`&&e.businessName.trim()&&(t.businessName=e.businessName),typeof e.whatsappPhone==`string`&&e.whatsappPhone.trim()&&(t.whatsappPhone=e.whatsappPhone),typeof e.apiBaseUrl==`string`&&e.apiBaseUrl.trim()&&(t.apiBaseUrl=e.apiBaseUrl),t}function Dt(){if(document.getElementById(ct))return;let e=document.createElement(`style`);e.id=ct,e.textContent=`
    ${D} .ya-widget-request-success { display: grid; gap: 12px; }
    ${D} .ya-widget-request-success-card {
      display: flex; align-items: flex-start; gap: 10px; padding: 13px;
      border: 1px solid rgba(47,111,94,.2); border-radius: 15px; background: #edf5ec;
    }
    ${D} .ya-widget-request-success-card > .ya-widget-icon { color: #2F6F5E; }
    ${D} .ya-widget-request-success-card div { display: grid; gap: 3px; }
    ${D} .ya-widget-request-success-card strong { color: #172033; font-size: 13px; }
    ${D} .ya-widget-request-success-actions { display: grid; gap: 8px; }
    ${D} .ya-widget-request-fallback { margin-top: -4px; }
  `,document.head.appendChild(e)}function Ot(e){return`<svg class="ya-widget-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${e}</svg>`}function kt(){return Ot(`<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>`)}function At(){return Ot(`<path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5Z"/><path d="M9 8.7c.5 2.5 2 4 4.5 4.8l1-1"/>`)}function jt(){return Ot(`<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>`)}var Mt={tax_certificate:`Vergi levhası`,activity_certificate:`Faaliyet belgesi`,authorization:`Yetki belgesi`,other:`Diğer belgeler`},Nt={requests_disabled:`Talep alma özelliği bu işletmede etkin değil.`,dealer_application_disabled:`Online bayi başvurusu kapalı.`,request_type_disabled:`Bu talep türü işletmede etkin değil.`,invalid_idempotency_key:`Tekrar deneme kimliği gerekli veya geçersiz.`,idempotency_conflict:`Tekrar deneme kimliği farklı bir talep için kullanılmış.`},Pt=new Set([...Object.values(Nt),`Lütfen bilgileri kontrol edin.`,`En fazla 5 belge ekleyin.`,`Belge yüklenemedi. Dosyayı yeniden seçin.`,`Her belge en fazla 10 MB olabilir.`,`Yalnız PDF, JPG ve PNG belgeleri yüklenebilir.`,`PDF belgesi okunamadı.`,`Belge türü geçersiz.`,`Bu talebe belge eklenemez.`,`Talep kaydedilemedi. Lütfen biraz sonra tekrar deneyin.`,`Gönderilen bilgiler okunamadı.`,`Form bilgileri alınamadı.`]);function Ft(e){let t=typeof e.code==`string`&&Object.hasOwn(Nt,e.code)?Nt[e.code]:void 0;return t?a(t):typeof e.message==`string`&&Pt.has(e.message)?a(e.message):a(`Başvuru sonucu doğrulanamadı. Aynı başvuruyu yeniden deneyin.`)}function It(){return`<div class="ya-widget-subview"><button type="button" data-ya-view="home">${o(`Geri`)}</button>
    <h2 class="ya-widget-view-title" tabindex="-1">${o(`Bayi Başvurusu`)}</h2>
    <form class="ya-widget-form" data-dealer-application>
      ${[[`company_name`,`Firma / unvan`,`text`],[`authorized_person`,`Yetkili adı soyadı`,`text`],[`customer_phone`,`Telefon`,`tel`],[`email`,`E-posta`,`email`],[`tax_office`,`Vergi dairesi (isteğe bağlı)`,`text`],[`tax_number`,`Vergi numarası (isteğe bağlı)`,`text`]].map(([e,t,n])=>`<label class="ya-widget-field"><span>${o(t)}</span><input name="${e}" type="${n}" maxlength="${e===`tax_number`?32:e===`authorized_person`?160:e===`email`?254:e===`tax_office`?120:180}" ${e.startsWith(`tax_`)?``:`required`} /></label>`).join(``)}
      <label class="ya-widget-field"><span>${o(`Başvuru notu (isteğe bağlı)`)}</span><textarea name="message" maxlength="3000" rows="2"></textarea></label>
      <fieldset><legend>${o(`Belgeler (isteğe bağlı)`)}</legend>
        <label class="ya-widget-field"><span>${o(`Belge türü`)}</span><select name="document_kind">${Object.entries(Mt).map(([e,t])=>`<option value="${e}">${o(t)}</option>`).join(``)}</select></label>
        <label class="ya-widget-field"><span>${o(`Dosya seç · PDF, JPG, PNG · En fazla 5 dosya, dosya başına 10 MB`)}</span><input data-document-picker type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" multiple /></label>
        <div data-document-list></div>
      </fieldset>
      <progress data-upload-progress max="100" value="0" hidden aria-label="${o(`Belge yükleme ilerlemesi`)}"></progress>
      <p data-application-status role="status"></p><button class="ya-widget-primary-action" type="submit">${o(`Başvuruyu Gönder`)}</button>
    </form></div>`}function Lt(e,t){let n=e.querySelector(`[data-dealer-application]`);if(!n)return;let r=n,i=[],o=r.querySelector(`[data-application-status]`),s=r.querySelector(`[data-document-list]`),c=r.querySelector(`[data-document-picker]`),l=r.querySelector(`[data-upload-progress]`),u=null,d=!1;function f(){s.replaceChildren(),i.forEach((e,t)=>{let n=document.createElement(`div`),r=document.createElement(`span`);r.textContent=`${a(Mt[e.kind])} · ${e.file.name}`;let o=document.createElement(`button`);o.type=`button`,o.textContent=a(`Kaldır`),o.addEventListener(`click`,()=>{d||(i.splice(t,1),f())}),n.append(r,o),s.append(n)})}c.addEventListener(`change`,()=>{o.textContent=``;let e=Array.from(c.files??[]);if(i.length+e.length>5)o.textContent=a(`En fazla 5 dosya ekleyebilirsiniz.`);else if(e.some(e=>!e.size||e.size>10485760||!/\.(pdf|jpe?g|png)$/i.test(e.name)))o.textContent=a(`PDF, JPG veya PNG seçin. Her dosya en fazla 10 MB olabilir.`);else{let t=r.elements.namedItem(`document_kind`).value;i.push(...e.map(e=>({file:e,kind:t}))),f()}c.value=``}),r.addEventListener(`submit`,e=>{p(e)});async function p(e){if(e.preventDefault(),!d&&r.reportValidity()){d=!0,o.textContent=a(`Başvuru ve belgeler gönderiliyor…`),l.hidden=!1;try{let e=new FormData(r);e.delete(`document_kind`),e.set(`request_type`,`dealer_application`),e.set(`customer_name`,String(e.get(`authorized_person`))),e.set(`guest_count`,`1`);let n=await Promise.all(i.map(async({file:e,kind:t})=>({name:e.name,kind:t,hash:Array.from(new Uint8Array(await crypto.subtle.digest(`SHA-256`,await e.arrayBuffer())),e=>e.toString(16).padStart(2,`0`)).join(``)}))),s=JSON.stringify({fields:Array.from(e.entries()),files:n});(!u||u.intent!==s)&&(u={intent:s,key:crypto.randomUUID()}),e.set(`idempotency_key`,u.key),i.forEach(({file:t,kind:n})=>{e.append(`documents[]`,t),e.append(`document_kinds[]`,n)}),r.querySelectorAll(`input,button,select,textarea`).forEach(e=>e.disabled=!0);let c=await new Promise(n=>{let r=new XMLHttpRequest;r.open(`POST`,`${t.replace(/\/$/,``)}/api/request.php`),r.timeout=12e4,r.upload.onprogress=e=>{e.lengthComputable&&(l.value=e.loaded/e.total*100)},r.onload=()=>{try{let e=JSON.parse(r.responseText),t=e&&typeof e==`object`?e:{};n(r.status>=200&&r.status<300&&t.ok===!0&&typeof t.request_id==`string`&&/^[A-Za-z0-9_-]{1,180}$/.test(t.request_id)?{ok:!0}:{ok:!1,message:Ft(t)})}catch{n({ok:!1,message:a(`Sunucu yanıtı okunamadı. Aynı başvuruyu yeniden deneyin.`)})}},r.onerror=r.ontimeout=()=>n({ok:!1,message:a(`Yükleme tamamlanamadı. Aynı başvuruyu yeniden deneyin.`)}),r.send(e)});c.ok?(u=null,r.reset(),i.length=0,f(),o.textContent=a(`Başvurunuz alındı. İşletmenin değerlendirmesi bekleniyor.`)):o.textContent=c.message||a(`Başvuru gönderilemedi.`)}catch{o.textContent=a(`Başvuru gönderilemedi. Yeniden deneyin.`)}finally{d=!1,l.hidden=!0,r.querySelectorAll(`input,button,select,textarea`).forEach(e=>e.disabled=!1)}}}}function Rt(e,t){return`
    #${e} {
      position: fixed;
      right: 18px;
      bottom: var(--ya-widget-bottom, 18px);
      z-index: 2147483000;
      color: #172033;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.4;
      transition: bottom 180ms ease;
    }

    #${e} * {
      box-sizing: border-box;
    }

    #${e} button,
    #${e} input,
    #${e} select,
    #${e} textarea {
      font: inherit;
    }

    #${e} button:focus-visible,
    #${e} a:focus-visible,
    #${e} input:focus-visible,
    #${e} select:focus-visible,
    #${e} textarea:focus-visible {
      outline: 3px solid rgba(255, 184, 146, 0.72);
      outline-offset: 2px;
    }

    #${e}[hidden],
    #${e} [hidden] {
      display: none !important;
    }

    #${e} .ya-widget-icon {
      width: 18px;
      height: 18px;
      flex: 0 0 auto;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.9;
    }

    .ya-widget-button {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 58px;
      padding: 5px 14px 5px 6px;
      border: 1px solid #d7e4eb;
      border-radius: 20px;
      color: #172f4a;
      background: #f8fbfd;
      box-shadow: 0 6px 20px rgba(18, 45, 70, .12);
      cursor: pointer;
      transition: background-color 180ms ease;
    }
    .ya-widget-button:hover { background: #eef6fa; }
    #${e} .ya-widget-launcher-avatar { display: grid; width: 48px; height: 48px; flex: 0 0 auto; place-items: center; }
    .ya-widget-launcher-copy { display: grid; min-width: 0; text-align: left; }
    .ya-widget-launcher-copy strong { font-size: 14px; }
    .ya-widget-launcher-copy small { color: #5e7384; font-size: 11px; }
    #${e} .ya-widget-nexa,
    #${e} .ya-widget-nexa-fallback { display: block; width: 100%; height: 100%; object-fit: contain; }
    #${e} .ya-widget-nexa-welcome { display: block; width: 112px; height: 132px; padding-bottom: 20px; flex: 0 0 auto; position: relative; }
    #${e} .ya-widget-nexa-welcome::after { content: ""; position: absolute; width: 68px; height: 7px; left: 22px; top: 120px; border-radius: 50%; background: radial-gradient(ellipse, rgba(18,45,70,.16), transparent 70%); }
    #${e} .ya-widget-business-mark { display: inline-flex; vertical-align: middle; margin-right: 6px; }
    #${e} .ya-widget-business-mark .ya-widget-mark { width: 20px; height: 20px; border-radius: 4px; }
    #${e} .ya-widget-business-mark .ya-widget-mark-fallback { font-size: 8px; }
    @media (prefers-color-scheme: dark) {
      .ya-widget-button { background: #1d2e40; color: #eef6fb; border-color: #415668; }
      .ya-widget-button:hover { background: #263d50; }
      .ya-widget-launcher-copy small { color: #c0d2df; }
    }

    .ya-widget-mark {
      width: 34px;
      height: 34px;
      object-fit: contain;
      border-radius: 10px;
    }

    .ya-widget-mark-fallback {
      display: grid;
      place-items: center;
      color: ${t.primaryColor};
      background: #ffffff;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.04em;
    }

    .ya-widget-panel {
      display: flex;
      width: 410px;
      max-width: calc(100vw - 28px);
      max-height: min(710px, calc(100dvh - 36px));
      overflow: hidden;
      flex-direction: column;
      border: 1px solid rgba(47, 111, 94, 0.24);
      border-radius: 24px;
      background: #fff9ef;
      box-shadow: 0 28px 80px rgba(23, 32, 51, 0.26), 0 0 0 5px rgba(47, 111, 94, 0.07);
      transform-origin: right bottom;
    }

    .ya-widget-panel.is-opening {
      animation: ya-widget-panel-in 210ms cubic-bezier(.2,.8,.2,1) both;
    }

    .ya-widget-panel.is-closing {
      animation: ya-widget-panel-out 150ms ease-in both;
      pointer-events: none;
    }

    @keyframes ya-widget-panel-in {
      from { opacity: 0; transform: translateY(14px) scale(.975); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes ya-widget-panel-out {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to { opacity: 0; transform: translateY(10px) scale(.985); }
    }

    .ya-widget-header {
      position: relative;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 64px;
      padding: 14px;
      overflow: hidden;
      color: #ffffff;
      background: linear-gradient(135deg, ${t.primaryColor}, #18564e 56%, #123d3a);
      isolation: isolate;
    }

    #${e} .ya-widget-nexa-speech-slot { flex: 1 0 100%; min-width: 0; padding-bottom: 4px; }
    #${e} .ya-widget-nexa-speech {
      position: relative; display: inline-block; max-width: 100%; padding: 6px 10px;
      border: 1px solid rgba(255,255,255,.35); border-radius: 12px;
      background: #f8fbfd; color: #172f4a; box-shadow: 0 2px 6px rgba(18,45,70,.1);
      font-size: 12px; line-height: 1.4; overflow-wrap: anywhere;
      animation: ya-nexa-speech-in 180ms ease-out both;
    }
    #${e} .ya-widget-nexa-speech::after {
      content: ""; position: absolute; top: 100%; left: 12px; width: 7px; height: 7px;
      background: inherit; border-right: inherit; border-bottom: inherit;
      transform: translateY(-3px) rotate(45deg);
    }
    #${e} .ya-nexa-speech-dots i { display: inline-block; font-style: normal; animation: ya-nexa-speech-dot 1400ms ease-in-out infinite; }
    #${e} .ya-nexa-speech-dots i:nth-child(2) { animation-delay: 160ms; }
    #${e} .ya-nexa-speech-dots i:nth-child(3) { animation-delay: 320ms; }
    #${e}[data-nexa-motion-active="false"] .ya-nexa-speech-dots i { animation: none; }
    @keyframes ya-nexa-speech-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes ya-nexa-speech-dot { 0%, 70%, 100% { opacity: .4; transform: translateY(0); } 35% { opacity: 1; transform: translateY(-2px); } }
    @media (prefers-color-scheme: dark) {
      #${e} .ya-widget-nexa-speech { background: #1d2e40; color: #eef6fb; border-color: #526b7c; }
    }

    .ya-widget-header::after {
      position: absolute;
      top: -75px;
      right: -45px;
      width: 190px;
      height: 190px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 255, 255, 0.18), transparent 64%);
      content: "";
      z-index: -1;
    }

    .ya-widget-identity {
      display: flex;
      align-items: center;
      gap: 11px;
      min-width: 0;
    }

    #${e} .ya-widget-avatar { display: grid; width: 32px; height: 32px; flex: 0 0 auto; place-items: center; }
    .ya-widget-title-copy {
      display: grid;
      min-width: 0;
      gap: 3px;
    }

    .ya-widget-title-copy strong {
      overflow: hidden;
      font-size: 15px;
      line-height: 1.25;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ya-widget-title-copy small {
      max-width: 260px;
      color: rgba(255, 255, 255, 0.78);
      font-size: 11px;
      line-height: 1.35;
    }

    .ya-widget-close {
      display: grid;
      width: 44px;
      height: 44px;
      flex: 0 0 auto;
      place-items: center;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.24);
      border-radius: 14px;
      color: #ffffff;
      background: rgba(255, 255, 255, 0.08);
      cursor: pointer;
    }

    .ya-widget-close:hover {
      background: rgba(255, 255, 255, 0.16);
    }

    .ya-widget-close span {
      font-size: 25px;
      line-height: 1;
      transform: translateY(-1px);
    }

    .ya-widget-notice {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 9px 13px;
      border-bottom: 1px solid rgba(185, 112, 25, 0.18);
      color: #6c4719;
      background: #fff4df;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.4;
      animation: ya-widget-notice-in 150ms ease-out both;
    }

    .ya-widget-notice-icon {
      display: grid;
      width: 20px;
      height: 20px;
      flex: 0 0 auto;
      place-items: center;
      border-radius: 7px;
      color: #8b5b1c;
      background: rgba(255,255,255,.72);
    }

    .ya-widget-notice-icon .ya-widget-icon { width: 13px !important; height: 13px !important; }

    @keyframes ya-widget-notice-in {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .ya-widget-content {
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-color: rgba(47, 111, 94, 0.32) transparent;
    }

    .ya-widget-home,
    .ya-widget-subview {
      display: grid;
      gap: 14px;
      padding: 16px;
      animation: ya-widget-view-in 170ms ease-out both;
    }

    @keyframes ya-widget-view-in {
      from { opacity: 0; transform: translateX(7px); }
      to { opacity: 1; transform: translateX(0); }
    }

    .ya-widget-welcome,
    .ya-widget-subview-intro {
      display: flex;
      align-items: flex-start;
      gap: 11px;
    }

    .ya-widget-welcome {
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 13px;
      border: 1px solid rgba(47, 111, 94, 0.13);
      border-radius: 17px 17px 17px 5px;
      background: linear-gradient(135deg, rgba(231, 240, 230, 0.78), rgba(255, 255, 255, 0.88));
    }

    .ya-widget-subview-intro > span {
      display: grid;
      width: 38px;
      height: 38px;
      flex: 0 0 auto;
      place-items: center;
      border-radius: 13px;
      color: ${t.primaryColor};
      background: #ffffff;
      box-shadow: inset 0 0 0 1px rgba(47, 111, 94, 0.15), 0 5px 14px rgba(23, 32, 51, 0.06);
    }

    .ya-widget-kicker {
      color: ${t.primaryColor};
      font-size: 10px;
      font-weight: 850;
      letter-spacing: 0.055em;
      text-transform: uppercase;
    }

    .ya-widget-welcome h2,
    .ya-widget-subview-intro h2 {
      margin: 3px 0 3px;
      color: #172033;
      font-size: 17px;
      line-height: 1.25;
    }

    .ya-widget-welcome p,
    .ya-widget-subview-intro p {
      margin: 0;
      color: #626875;
      font-size: 12px;
      line-height: 1.45;
    }

    .ya-widget-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .ya-widget-action-card {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) 16px;
      align-items: center;
      gap: 8px;
      min-width: 0;
      min-height: 72px;
      padding: 10px;
      border: 1px solid rgba(47, 111, 94, 0.14);
      border-radius: 15px;
      color: #24313a;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 5px 16px rgba(23, 32, 51, 0.04);
      text-align: left;
      cursor: pointer;
      transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
    }

    .ya-widget-action-card:hover {
      transform: translateY(-2px);
      border-color: rgba(47, 111, 94, 0.36);
      box-shadow: 0 8px 20px rgba(23, 32, 51, 0.07);
    }

    .ya-widget-action-card:active { transform: translateY(0) scale(.985); }

    .ya-widget-action-icon {
      display: grid;
      width: 34px;
      height: 34px;
      place-items: center;
      border-radius: 11px;
      color: ${t.primaryColor};
      background: #edf6ec;
    }

    .ya-widget-action-copy { display: grid; min-width: 0; gap: 2px; }
    .ya-widget-action-copy strong { color: #172033; font-size: 11px; font-weight: 850; }

    .ya-widget-action-copy small {
      display: -webkit-box;
      overflow: hidden;
      color: #6d737c;
      font-size: 9px;
      font-weight: 600;
      line-height: 1.3;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .ya-widget-action-arrow { display: grid; place-items: center; color: #8b918f; }
    .ya-widget-action-arrow .ya-widget-icon { width: 14px !important; height: 14px !important; }

    .ya-widget-suggestions button,
    .ya-widget-topic-chips button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      min-height: 40px;
      padding: 8px 11px;
      border: 1px solid #ddd9d0;
      border-radius: 999px;
      color: #24313a;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 5px 16px rgba(23, 32, 51, 0.04);
      font-size: 11px;
      font-weight: 750;
      cursor: pointer;
      transition: transform 150ms ease, border-color 150ms ease, background 150ms ease;
    }

    .ya-widget-suggestions button:hover,
    .ya-widget-topic-chips button:hover {
      transform: translateY(-1px);
      border-color: rgba(47, 111, 94, 0.42);
    }

    .ya-widget-context-card,
    .ya-widget-location-card {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      padding: 10px;
      border: 1px solid rgba(47, 111, 94, 0.14);
      border-radius: 14px;
      background: #f7faf5;
    }

    .ya-widget-context-card img,
    .ya-widget-context-icon {
      width: 48px;
      height: 42px;
      flex: 0 0 auto;
      border-radius: 10px;
      object-fit: cover;
    }

    .ya-widget-context-icon,
    .ya-widget-location-card > span {
      display: grid;
      place-items: center;
      color: ${t.primaryColor};
      background: #ffffff;
      box-shadow: inset 0 0 0 1px rgba(47, 111, 94, 0.14);
    }

    .ya-widget-context-card > div,
    .ya-widget-location-card > div { display: grid; min-width: 0; gap: 2px; }

    .ya-widget-context-card small {
      color: ${t.primaryColor};
      font-size: 9px;
      font-weight: 850;
      text-transform: uppercase;
    }

    .ya-widget-context-card strong,
    .ya-widget-location-card strong {
      overflow: hidden;
      color: #172033;
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ya-widget-location-card > span {
      width: 38px;
      height: 38px;
      flex: 0 0 auto;
      border-radius: 12px;
    }

    .ya-widget-location-card p { margin: 0; color: #626875; font-size: 11px; line-height: 1.4; }
    .ya-widget-directions .ya-widget-primary-action { text-decoration: none; }

    .ya-widget-trust,
    .ya-widget-form-note {
      display: flex;
      align-items: flex-start;
      gap: 7px;
      margin: 0;
      color: #69707b;
      font-size: 11px;
      line-height: 1.45;
    }

    .ya-widget-trust .ya-widget-icon,
    .ya-widget-form-note .ya-widget-icon {
      width: 15px !important;
      height: 15px !important;
      color: ${t.primaryColor};
    }

    .ya-widget-subview-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .ya-widget-subview-nav > button {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: 40px;
      padding: 7px 9px;
      border: 0;
      border-radius: 11px;
      color: #58606f;
      background: transparent;
      font-size: 12px;
      font-weight: 750;
      cursor: pointer;
    }

    .ya-widget-subview-nav > button:hover {
      color: #172033;
      background: rgba(255, 255, 255, 0.76);
    }

    .ya-widget-active-flow {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 34px;
      padding: 6px 10px;
      border: 1px solid rgba(47, 111, 94, 0.16);
      border-radius: 999px;
      color: ${t.primaryColor};
      background: #eef6ed;
      font-size: 11px;
      font-weight: 800;
    }

    .ya-widget-active-flow .ya-widget-icon {
      width: 15px !important;
      height: 15px !important;
    }

    .ya-widget-subview-intro {
      padding: 0 2px;
    }

    .ya-widget-form,
    .ya-widget-ai,
    .ya-widget-direct-whatsapp {
      display: grid;
      gap: 12px;
    }

    .ya-widget-field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .ya-widget-field {
      display: grid;
      min-width: 0;
      gap: 6px;
      color: #172033;
      font-size: 12px;
      font-weight: 800;
    }

    .ya-widget-field small {
      color: #777d87;
      font-size: 10px;
      font-weight: 600;
    }

    .ya-widget-field input,
    .ya-widget-field textarea {
      width: 100%;
      min-height: 44px;
      padding: 10px 11px;
      border: 1px solid #dcd7cf;
      border-radius: 12px;
      color: #172033;
      background: rgba(255, 255, 255, 0.94);
      font-size: 13px !important;
      font-weight: 500;
    }

    .ya-widget-field textarea {
      min-height: 64px;
      resize: vertical;
    }

    .ya-widget-field input::placeholder,
    .ya-widget-field textarea::placeholder {
      color: #777d87;
      opacity: 1;
    }

    .ya-widget-date-group,
    .ya-widget-guest-group {
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }

    .ya-widget-date-group {
      position: relative;
      padding: 11px;
      border: 1px solid rgba(47, 111, 94, 0.14);
      border-radius: 15px;
      background: linear-gradient(135deg, rgba(231, 240, 230, 0.75), rgba(255, 255, 255, 0.78));
    }

    .ya-widget-date-group legend,
    .ya-widget-guest-group legend {
      margin-bottom: 7px;
      padding: 0;
      color: #172033;
      font-size: 12px;
      font-weight: 850;
    }

    .ya-widget-date-options {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }

    .ya-widget-date-options > button,
    .ya-widget-date-custom {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      min-width: 0;
      min-height: 42px;
      padding: 7px 5px;
      overflow: hidden;
      border: 1px solid #dcd7cf;
      border-radius: 10px;
      color: #334048;
      background: rgba(255, 255, 255, 0.9);
      font-size: 10px;
      font-weight: 800;
      text-align: center;
      cursor: pointer;
    }

    .ya-widget-date-options > button.is-active,
    .ya-widget-date-custom.is-active {
      color: ${t.primaryColor};
      border-color: rgba(47, 111, 94, 0.5);
      background: #e7f1e6;
      box-shadow: inset 0 0 0 1px rgba(47, 111, 94, 0.07);
    }

    .ya-widget-date-custom .ya-widget-icon,
    .ya-widget-date-picker .ya-widget-icon {
      width: 14px !important;
      height: 14px !important;
    }

    .ya-widget-date-range {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .ya-widget-date-range-single {
      grid-template-columns: 1fr;
    }

    .ya-widget-schedule-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: end;
      gap: 8px;
    }

    .ya-widget-schedule-row .ya-widget-time-field {
      margin-top: 0;
    }

    .ya-widget-date-picker {
      position: relative;
      display: grid;
      gap: 5px;
      min-width: 0;
    }

    .ya-widget-date-picker > span,
    .ya-widget-time-field > span {
      color: #5f6872;
      font-size: 10px;
      font-weight: 800;
    }

    .ya-widget-date-picker > button {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
      min-height: 44px;
      padding: 9px 10px;
      border: 1px solid #dcd7cf;
      border-radius: 11px;
      color: #334048;
      background: rgba(255, 255, 255, 0.94);
      cursor: pointer;
      text-align: left;
    }

    .ya-widget-date-picker > button strong {
      min-width: 0;
      overflow: hidden;
      font-size: 11px;
      font-weight: 800;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ya-widget-calendar {
      position: absolute;
      top: 69px;
      right: 10px;
      left: 10px;
      z-index: 24;
      display: grid;
      gap: 8px;
      padding: 11px;
      border: 1px solid rgba(47, 111, 94, 0.2);
      border-radius: 14px;
      background: #fffdf8;
      box-shadow: 0 18px 44px rgba(23, 32, 51, 0.2);
    }

    .ya-widget-calendar[hidden] { display: none; }

    .ya-widget-calendar-head {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) 34px 30px;
      align-items: center;
      gap: 6px;
    }

    .ya-widget-calendar-head > button {
      display: grid;
      width: 34px;
      height: 34px;
      place-items: center;
      padding: 0;
      border: 1px solid #e1ddd5;
      border-radius: 10px;
      color: #334048;
      background: #ffffff;
      cursor: pointer;
    }

    .ya-widget-calendar-head > button:disabled { cursor: not-allowed; opacity: .35; }

    .ya-widget-calendar-head > .ya-widget-calendar-close {
      width: 30px;
      height: 30px;
      border-color: transparent;
      color: #6d737c;
      background: #f6f3ed;
      font-size: 19px;
      line-height: 1;
    }

    .ya-widget-calendar-head > .ya-widget-calendar-close:hover {
      color: #172033;
      background: #ece8df;
    }

    .ya-widget-calendar-title { color: #172033; font-size: 12px; font-weight: 850; text-align: center; }

    .ya-widget-calendar-shortcuts {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }

    .ya-widget-calendar-shortcuts button {
      min-height: 28px;
      padding: 5px 8px;
      border: 1px solid rgba(47, 111, 94, 0.14);
      border-radius: 999px;
      color: #52605c;
      background: #f5faf4;
      font-size: 9px;
      font-weight: 800;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease;
    }

    .ya-widget-calendar-shortcuts button:first-child { color: #7a6557; background: #fff8ef; }
    .ya-widget-calendar-shortcuts button:hover:not(:disabled) { transform: translateY(-1px); border-color: rgba(47, 111, 94, 0.34); }
    .ya-widget-calendar-shortcuts button:disabled { cursor: not-allowed; opacity: .38; }

    .ya-widget-calendar-weekdays,
    .ya-widget-calendar-days {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 4px;
    }

    .ya-widget-calendar-weekdays span {
      color: #7a8089;
      font-size: 9px;
      font-weight: 800;
      text-align: center;
    }

    .ya-widget-calendar-days button,
    .ya-widget-calendar-empty { aspect-ratio: 1; min-width: 0; }

    .ya-widget-calendar-days button {
      display: grid;
      place-items: center;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 9px;
      color: #334048;
      background: transparent;
      font-size: 10px;
      font-weight: 800;
      cursor: pointer;
    }

    .ya-widget-calendar-days button:hover:not(:disabled) { border-color: rgba(47, 111, 94, 0.28); background: #f1f7f0; }
    .ya-widget-calendar-days button.is-today { border-color: rgba(47, 111, 94, 0.3); }
    .ya-widget-calendar-days button.is-in-range { border-radius: 7px; background: rgba(47, 111, 94, 0.10); }

    .ya-widget-calendar-days button.is-range-edge,
    .ya-widget-calendar-days button.is-selected {
      color: #ffffff;
      border-color: transparent;
      background: ${t.primaryColor};
    }

    .ya-widget-calendar-days button:disabled { color: #c4c5c7; cursor: not-allowed; }

    .ya-widget-time-field {
      position: relative;
      display: grid;
      gap: 5px;
      margin-top: 9px;
    }

    .ya-widget-time-trigger {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) 16px;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 42px;
      padding: 8px 10px;
      border: 1px solid #dcd7cf;
      border-radius: 10px;
      color: #334048;
      background: rgba(255, 255, 255, 0.94);
      text-align: left;
      cursor: pointer;
      transition: border-color 130ms ease, box-shadow 130ms ease;
    }

    .ya-widget-time-trigger:hover,
    .ya-widget-time-trigger[aria-expanded="true"] {
      border-color: rgba(47, 111, 94, 0.44);
      box-shadow: 0 0 0 3px rgba(47, 111, 94, 0.08);
    }

    .ya-widget-time-trigger strong {
      font-size: 12px;
      font-weight: 800;
    }

    .ya-widget-time-trigger .ya-widget-icon {
      width: 15px !important;
      height: 15px !important;
      color: ${t.primaryColor};
    }

    .ya-widget-time-trigger .ya-widget-icon:last-child {
      justify-self: end;
      color: #8b918f;
      transform: rotate(90deg);
    }

    .ya-widget-time-popover {
      position: absolute;
      top: 66px;
      right: 0;
      z-index: 25;
      width: min(220px, calc(200% + 8px));
      padding: 10px;
      border: 1px solid rgba(47, 111, 94, 0.2);
      border-radius: 14px;
      background: #fffdf8;
      box-shadow: 0 18px 44px rgba(23, 32, 51, 0.2);
      animation: ya-widget-result-in 150ms ease-out both;
    }

    .ya-widget-time-popover[hidden] { display: none; }

    .ya-widget-time-popover-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }

    .ya-widget-time-popover-head > div {
      display: flex;
      align-items: baseline;
      gap: 7px;
    }

    .ya-widget-time-popover-head small {
      color: #777d87;
      font-size: 9px;
      font-weight: 750;
    }

    .ya-widget-time-popover-head strong {
      color: ${t.primaryColor};
      font-size: 15px;
      font-weight: 900;
    }

    .ya-widget-time-popover-actions {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .ya-widget-time-popover-actions button {
      min-height: 28px;
      border: 0;
      border-radius: 9px;
      cursor: pointer;
    }

    .ya-widget-time-clear {
      padding: 0 8px;
      color: #6f6258;
      background: #f8f1e8;
      font-size: 9px;
      font-weight: 800;
    }

    .ya-widget-time-clear:disabled {
      cursor: default;
      opacity: .4;
    }

    .ya-widget-time-close {
      display: grid;
      width: 28px;
      place-items: center;
      padding: 0;
      color: #6d737c;
      background: #f3efe7;
      font-size: 19px;
      line-height: 1;
    }

    .ya-widget-time-columns {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 62px;
      gap: 8px;
    }

    .ya-widget-time-column {
      display: grid;
      gap: 5px;
      min-width: 0;
    }

    .ya-widget-time-column > span {
      color: #6b727c;
      font-size: 9px;
      font-weight: 800;
      text-align: center;
    }

    .ya-widget-time-scroll {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px;
      max-height: 128px;
      padding: 2px;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: rgba(47, 111, 94, 0.25) transparent;
    }

    .ya-widget-time-minutes {
      grid-template-columns: 1fr;
    }

    .ya-widget-time-scroll button {
      min-height: 32px;
      padding: 4px;
      border: 1px solid transparent;
      border-radius: 8px;
      color: #36444b;
      background: #f5f7f3;
      font-size: 10px;
      font-weight: 800;
      cursor: pointer;
    }

    .ya-widget-time-scroll button:hover {
      border-color: rgba(47, 111, 94, 0.24);
      background: #eef5ec;
    }

    .ya-widget-time-scroll button.is-selected {
      color: #ffffff;
      border-color: transparent;
      background: ${t.primaryColor};
      box-shadow: 0 4px 10px rgba(47, 111, 94, 0.18);
    }

    .ya-widget-date-options > input[type="hidden"] {
      display: none;
    }

    .ya-widget-stepper {
      display: grid;
      grid-template-columns: 44px 64px 44px;
      width: max-content;
      overflow: hidden;
      border: 1px solid #dcd7cf;
      border-radius: 12px;
      background: #ffffff;
    }

    .ya-widget-stepper button {
      display: grid;
      min-width: 44px;
      min-height: 44px;
      place-items: center;
      padding: 0;
      border: 0;
      color: ${t.primaryColor};
      background: transparent;
      cursor: pointer;
    }

    .ya-widget-stepper button:first-child {
      border-right: 1px solid #e2ddd5;
    }

    .ya-widget-stepper button:last-child {
      border-left: 1px solid #e2ddd5;
    }

    .ya-widget-stepper button:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }

    .ya-widget-stepper input {
      width: 64px;
      min-width: 0;
      border: 0;
      color: #172033;
      background: transparent;
      text-align: center;
      font-size: 14px !important;
      font-weight: 850;
      appearance: textfield;
    }

    .ya-widget-stepper input::-webkit-inner-spin-button,
    .ya-widget-stepper input::-webkit-outer-spin-button {
      margin: 0;
      appearance: none;
    }

    .ya-widget-primary-action,
    .ya-widget-secondary-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      min-height: 46px;
      padding: 10px 13px;
      border-radius: 13px;
      font-size: 12px;
      font-weight: 850;
      cursor: pointer;
    }

    .ya-widget-primary-action {
      border: 1px solid transparent;
      color: #ffffff;
      background: linear-gradient(135deg, ${t.primaryColor}, #1b5a50);
      box-shadow: 0 9px 22px rgba(47, 111, 94, 0.2);
    }

    .ya-widget-secondary-action {
      border: 1px solid rgba(47, 111, 94, 0.24);
      color: ${t.primaryColor};
      background: #ffffff;
    }

    .ya-widget-primary-action:disabled {
      cursor: wait;
      opacity: 0.7;
    }

    .ya-widget-suggestions,
    .ya-widget-topic-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .ya-widget-suggestions button,
    .ya-widget-topic-chips button {
      min-height: 40px;
      padding: 7px 10px;
      font-size: 11px;
      box-shadow: none;
    }

    .ya-widget-suggestions button.is-active,
    .ya-widget-topic-chips button.is-active {
      color: ${t.primaryColor};
      border-color: rgba(47, 111, 94, 0.44);
      background: #e9f3e8;
    }

    .ya-widget-ai-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .ya-widget-ai-answer {
      display: flex;
      align-items: flex-start;
      gap: 9px;
      padding: 12px;
      border: 1px solid rgba(47, 111, 94, 0.16);
      border-radius: 16px 16px 16px 5px;
      background: linear-gradient(135deg, #edf5ec, #ffffff);
    }

    .ya-widget-ai-answer p {
      display: grid;
      gap: 3px;
      margin: 0;
      min-width: 0;
    }

    .ya-widget-ai-answer strong {
      color: #172033;
      font-size: 11px;
    }

    .ya-widget-ai-answer p span {
      color: #555e68;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .ya-widget-inline-trust {
      padding-top: 2px;
    }

    .ya-widget-primary-action,
    .ya-widget-secondary-action {
      transition: transform 140ms ease, filter 140ms ease, opacity 140ms ease;
    }

    .ya-widget-primary-action:active:not(:disabled),
    .ya-widget-secondary-action:active:not(:disabled) { transform: scale(.985); }

    .ya-widget-primary-action.is-loading { cursor: wait; }

    .ya-widget-spinner {
      width: 16px;
      height: 16px;
      flex: 0 0 auto;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: ya-widget-spin 700ms linear infinite;
    }

    @keyframes ya-widget-spin { to { transform: rotate(360deg); } }

    .ya-widget-ai-answer,
    .ya-widget-request-success { animation: ya-widget-result-in 190ms ease-out both; }

    @keyframes ya-widget-result-in {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .ya-widget-message-preview {
      padding: 11px;
      border: 1px solid rgba(47, 111, 94, 0.14);
      border-radius: 14px 14px 4px 14px;
      background: #edf5ec;
    }

    .ya-widget-message-preview > span {
      color: ${t.primaryColor};
      font-size: 10px;
      font-weight: 850;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .ya-widget-message-preview p {
      margin: 5px 0 0;
      color: #36444b;
      font-size: 11px;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .ya-widget-status {
      margin: 0 16px 16px;
      padding: 10px 11px;
      border: 1px solid rgba(228, 120, 99, 0.26);
      border-radius: 12px;
      color: #8b4133;
      background: #fff0e7;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.45;
    }

    @media (max-width: 520px) {
      #${e} {
        right: 0;
        bottom: 0;
        left: 0;
        display: flex;
        align-items: flex-end;
        justify-content: flex-end;
        pointer-events: none;
      }

      #${e} > * {
        pointer-events: auto;
      }

      .ya-widget-button {
        margin: 0 12px max(12px, env(safe-area-inset-bottom));
      }

      .ya-widget-panel {
        width: 100%;
        max-width: none;
        max-height: min(92dvh, 760px);
        border-right: 0;
        border-bottom: 0;
        border-left: 0;
        border-radius: 24px 24px 0 0;
        box-shadow: 0 -18px 60px rgba(23, 32, 51, 0.28);
      }

      .ya-widget-content {
        padding-bottom: env(safe-area-inset-bottom);
      }
    }

    @media (max-width: 430px) {
      .ya-widget-header {
        min-height: 86px;
        padding: 12px;
      }

      .ya-widget-title-copy small {
        max-width: 235px;
      }

      .ya-widget-home,
      .ya-widget-subview {
        padding: 14px;
      }

      .ya-widget-field-grid {
        grid-template-columns: 1fr;
      }

      .ya-widget-date-options,
      .ya-widget-date-range {
        grid-template-columns: 1fr 1fr;
      }

      .ya-widget-ai-actions {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 350px) {
      .ya-widget-launcher-copy,
      .ya-widget-launcher-sparkle {
        display: none;
      }

      .ya-widget-button {
        min-width: 58px;
        padding-right: 8px;
      }

      .ya-widget-title-copy small {
        display: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ya-widget-button,
      .ya-widget-action-card,
      .ya-widget-suggestions button,
      .ya-widget-topic-chips button,
      .ya-widget-primary-action,
      .ya-widget-secondary-action {
        transition: none;
      }

      #${e} .ya-widget-launcher-avatar,
      #${e} .ya-widget-avatar,
      .ya-widget-panel.is-opening,
      .ya-widget-panel.is-closing,
      .ya-widget-home,
      .ya-widget-subview,
      .ya-widget-notice,
      .ya-widget-ai-answer,
      .ya-widget-request-success,
      .ya-widget-spinner {
        animation: none;
      }
      #${e} .ya-widget-nexa-speech,
      #${e} .ya-nexa-speech-dots i { animation: none; }
      #${e} .ya-widget-launcher-avatar { transition: none; }
    }
  `}var zt={sparkles:`<path d="m12 3-1.4 3.5L7 8l3.6 1.4L12 13l1.4-3.6L17 8l-3.6-1.5L12 3Z"/><path d="m5 15-.8 2-2.2.8 2.2.9L5 21l.8-2.3 2.2-.9-2.2-.8L5 15Z"/>`,bot:`<rect x="5" y="7" width="14" height="11" rx="4"/><path d="M12 4v3M9 12h.01M15 12h.01M9 15h6"/>`,calendar:`<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 9h16M8 13h.01M12 13h.01M16 13h.01"/>`,clock:`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,table:`<path d="M4 10h16M6 10l-1 10M18 10l1 10M8 6h8a2 2 0 0 1 2 2v2H6V8a2 2 0 0 1 2-2Z"/>`,bed:`<path d="M3 18v-7M21 18v-5a2 2 0 0 0-2-2H9a3 3 0 0 0-3 3v1M3 15h18M7 11V8h5a2 2 0 0 1 2 2v1"/>`,pin:`<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>`,info:`<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>`,search:`<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>`,"chevron-left":`<path d="m15 18-6-6 6-6"/>`,"chevron-right":`<path d="m9 18 6-6-6-6"/>`,help:`<circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-.9.8-.9 1.6M12 17h.01"/>`,whatsapp:`<path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5Z"/><path d="M9 8.7c.5 2.5 2 4 4.5 4.8l1-1"/>`,shield:`<path d="M12 3 5 6v5c0 4.5 2.8 7.8 7 10 4.2-2.2 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>`,"arrow-left":`<path d="m15 18-6-6 6-6M9 12h10"/>`,minus:`<path d="M5 12h14"/>`,plus:`<path d="M12 5v14M5 12h14"/>`,send:`<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>`};function A(e,t=``){return`<svg class="ya-widget-icon${t?` ${t}`:``}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${zt[e]}</svg>`}function Bt(){let e=document.currentScript?.dataset??{},t=Vt({...e.businessName===void 0?{}:{businessName:e.businessName},...e.whatsappPhone===void 0?{}:{whatsappPhone:e.whatsappPhone},...e.apiBaseUrl===void 0?{}:{apiBaseUrl:e.apiBaseUrl},...e.logoUrl===void 0?{}:{logoUrl:e.logoUrl},...e.primaryColor===void 0?{}:{primaryColor:e.primaryColor},...e.accentColor===void 0?{}:{accentColor:e.accentColor},...e.address===void 0?{}:{address:e.address},...e.mapUrl===void 0?{}:{mapUrl:e.mapUrl}}),n=Ht(e.profileId);n&&(t.profileId=n),(e.aiEnabled===`true`||e.aiEnabled===`false`)&&(t.aiEnabled=e.aiEnabled===`true`),(e.whatsappEnabled===`true`||e.whatsappEnabled===`false`)&&(t.whatsappEnabled=e.whatsappEnabled===`true`),(e.requestsEnabled===`true`||e.requestsEnabled===`false`)&&(t.requestsEnabled=e.requestsEnabled===`true`),(e.forceVisible===`true`||e.forceVisible===`false`)&&(t.forceVisible=e.forceVisible===`true`);for(let[n,r]of[[`publicSurfaces`,`publicSurfaces`],[`requestTypes`,`requestTypes`]])if(e[n]!==void 0)try{let i=JSON.parse(e[n]);r===`publicSurfaces`?t.publicSurfaces=Ut(i):t.requestTypes=M(i)}catch{r===`publicSurfaces`?t.publicSurfaces=[]:t.requestTypes=[]}return t}function Vt(e){return Object.fromEntries(Object.entries(e).filter(([,e])=>typeof e==`string`&&e.length>0))}function Ht(e){let t=String(e??``).trim();return[`pension_restaurant`,`pension`,`restaurant`,`market`].includes(t)?t:``}function Ut(e){if(!Array.isArray(e))return[];let t=new Set([`accommodation`,`food_service`,`menu`,`qr_menu`,`catalog`,`directions`]);return[...new Set(e.map(e=>{let t=String(e??``).trim();return{rooms:`accommodation`,restaurant:`food_service`,tables:`food_service`,store:`catalog`,online_sales:`catalog`}[t]??t}).filter(e=>t.has(e)))]}function j(e){return new Set(Ut(e.publicSurfaces))}function M(e){let t=new Set([`pension_reservation`,`restaurant_reservation`,`general_info`,`dealer_application`]);return Array.isArray(e)?[...new Set(e.filter(e=>typeof e==`string`&&t.has(e)))]:[]}function Wt(e){return e.whatsappEnabled&&e.whatsappPhone.trim()!==``}function N(e,t){if(!e.requestsEnabled||!M(e.requestTypes).includes(t))return!1;if(t===`dealer_application`)return e.dealerApplicationEnabled===!0;let n=j(e);return t===`pension_reservation`?n.has(`accommodation`):t!==`restaurant_reservation`||n.has(`food_service`)}function P(e){return j(e).has(`directions`)&&(e.address.trim()!==``||e.mapUrl.trim()!==``)}function Gt(e){return e.aiEnabled||Wt(e)||P(e)||M(e.requestTypes).some(t=>N(e,t))}function Kt(e){let t=j(e),n=[];return t.has(`accommodation`)&&n.push(a(`Oda fiyatları`),a(`Oda müsaitliği`),a(`Kahvaltı saatleri`)),t.has(`food_service`)&&n.push(a(`Masa var mı?`),a(`Menü hakkında bilgi`),a(`Çocuklar için uygun mu?`)),t.has(`catalog`)&&n.push(a(`Ürün stokta mı?`),a(`Ürün fiyatı`),a(`Çalışma saatleri`)),t.has(`directions`)&&n.push(a(`Konum ve yol tarifi`)),n.length===0&&n.push(a(`Çalışma saatleri`),a(`İletişim`),a(`Konum`)),[...new Set(n)].slice(0,6)}function qt(e){let t=j(e),n=[];return t.has(`accommodation`)&&n.push({key:`reservation`,label:a(`Rezervasyon soracağım`),message:a(`Merhaba, {0} için oda müsaitliği ve rezervasyon hakkında bilgi almak istiyorum.`,{0:e.businessName})}),t.has(`food_service`)&&n.push({key:`table`,label:a(`Masa soracağım`),message:a(`Merhaba, {0} için masa müsaitliği hakkında bilgi almak istiyorum.`,{0:e.businessName})}),t.has(`menu`)&&n.push({key:`menu`,label:a(`Menü hakkında soracağım`),message:a(`Merhaba, {0} menüsü hakkında bilgi almak istiyorum.`,{0:e.businessName})}),t.has(`catalog`)&&n.push({key:`product`,label:a(`Ürün / stok soracağım`),message:a(`Merhaba, {0} için ürün ve stok bilgisi almak istiyorum.`,{0:e.businessName})}),n.push({key:`custom`,label:a(`Kendi mesajımı yazacağım`),message:``}),n}function Jt(e){let t=Number(e);return Number.isFinite(t)&&t>=1?Math.min(30,Math.floor(t)):1}function F(e,t){let n=new Date(e.getFullYear(),e.getMonth(),e.getDate());return n.setDate(n.getDate()+t),n}function I(e){return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,`0`)}-${String(e.getDate()).padStart(2,`0`)}`}function L(e){let[t,n,r]=e.split(`-`).map(Number);if(!t||!n||!r)return null;let i=new Date(t,n-1,r);return Number.isNaN(i.getTime())?null:i}function Yt(e){return new Intl.DateTimeFormat(i,{month:`long`,year:`numeric`}).format(e).replace(/^./u,e=>e.toLocaleUpperCase(i))}function R(e){let t=L(e);if(!t)return a(`Tarih seç`);let n=t.getFullYear()!==new Date().getFullYear();return new Intl.DateTimeFormat(i,{day:`numeric`,month:`long`,...n?{year:`numeric`}:{}}).format(t)}function Xt(e,t){let n=R(e);return t===`today`?a(`Bugün, {0}`,{0:n}):t===`tomorrow`?a(`Yarın, {0}`,{0:n}):n}function Zt(e,t){let n=e.intent??`home`,r=Qt(e.context);if(n===`accommodation.reserve`)return N(t,`pension_reservation`)?{view:`form`,requestType:`pension_reservation`,context:r,questionDraft:``}:z();if(n===`food.reserve`)return N(t,`restaurant_reservation`)?{view:`form`,requestType:`restaurant_reservation`,context:r,questionDraft:``}:z();if(n===`contact.whatsapp`)return Wt(t)?{view:`whatsapp`,context:r,questionDraft:``}:z();if(n===`request.general`)return N(t,`general_info`)?{view:`form`,requestType:`general_info`,context:r,questionDraft:``}:z();if(n===`directions`)return P(t)?{view:`directions`,context:r,questionDraft:r?.question??``}:z();if(n===`accommodation.info`||n===`info`){if(!t.aiEnabled)return z();let e=String(r?.resourceName??``).trim();return{view:`info`,context:r,questionDraft:String(r?.question??``).trim()||(e?a(`{0} hakkında bilgi almak istiyorum.`,{0:e}):``)}}return{view:`home`,context:r,questionDraft:``}}function Qt(e){if(!e)return null;let t={resourceType:String(e.resourceType??``).trim(),resourceId:String(e.resourceId??``).trim(),resourceName:String(e.resourceName??``).trim(),imageUrl:String(e.imageUrl??``).trim(),sourcePath:String(e.sourcePath??``).trim()||window.location.pathname,question:String(e.question??``).trim(),address:String(e.address??``).trim(),mapUrl:String(e.mapUrl??``).trim()};return Object.values(t).some(Boolean)?t:null}function $t(e){let t=String(e??``).trim();return[`home`,`accommodation.reserve`,`accommodation.info`,`food.reserve`,`contact.whatsapp`,`request.general`,`info`,`directions`].includes(t)?t:null}function en(e){return e?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e)}`:``}function z(){return{view:`home`,context:null,questionDraft:``}}var B=`yardimci-asistan-widget`,tn=`yardimci-asistan-widget-style`,nn={businessName:`Yardımcı Asistan`,whatsappPhone:``,apiBaseUrl:``,logoUrl:``,primaryColor:`#2F6F5E`,accentColor:`#E47863`,profileId:``,publicSurfaces:[],aiEnabled:!1,whatsappEnabled:!1,requestsEnabled:!1,requestTypes:[],dealerApplicationEnabled:!1,address:``,mapUrl:``},rn=Bt(),V={...nn},H={isOpen:!1,view:`home`,requestType:`pension_reservation`,status:``,aiAnswer:``,aiLoading:!1,questionDraft:``,whatsappDraft:``,whatsappTopic:``,context:null},an=!1,U=0,on=!1,sn=0,cn=!1;function ln(e){return`<span class="ya-widget-nexa" data-nexa-role="${e}" aria-hidden="true"></span>`}function W(){let e=document.getElementById(B),t=H.isOpen&&!U&&document.visibilityState===`visible`&&document.hasFocus();if(E.setActive(t),!e)return;let n=t&&!window.matchMedia(`(prefers-reduced-motion: reduce)`).matches;e.dataset.nexaMotionActive=String(n),e.dataset.nexaState=E.getState(),st(n,V.apiBaseUrl)}function un(){cn||(cn=!0,E.subscribe(W),document.addEventListener(`visibilitychange`,W),window.addEventListener(`focus`,W),window.addEventListener(`blur`,W),window.matchMedia(`(prefers-reduced-motion: reduce)`).addEventListener(`change`,W))}function dn(e={}){E.reset(),un();let t={...nn,...rn,...Bt(),...e};V={...t,profileId:Ht(t.profileId),publicSurfaces:Ut(t.publicSurfaces),requestTypes:M(t.requestTypes)},tr(V),cr(),G(),sr(++sn)}function fn(e={}){E.reset(),on=!H.isOpen,U&&=(window.clearTimeout(U),0),H={...H,...Zt(e,V),isOpen:!0,status:``,aiLoading:!1,aiAnswer:``},G(),Z(`.ya-widget-view-title, [data-ya-close]`)}function pn(){let e=document.querySelector(`#${B} .ya-widget-panel`),t=window.matchMedia?.(`(prefers-reduced-motion: reduce)`).matches===!0;e&&!t?(e.classList.add(`is-closing`),U&&window.clearTimeout(U),U=window.setTimeout(()=>{U=0,mn()},150),W()):mn()}function mn(){E.reset(),E.setActive(!1),H={...H,isOpen:!1,view:`home`,status:``,aiLoading:!1,aiAnswer:``,questionDraft:``,context:null},G(),Z(`[data-ya-open]`)}function hn(e,t){return fe(e,t)}function gn(e,t=V.businessName){return ye({...e,time_text:e.time},t)}function _n(e){let t=me(e);return t.ok?{ok:!0,whatsapp:t.whatsapp}:{ok:!1,error:a(t.error)}}function G(){let e=er();e.hidden=!V.forceVisible&&!Gt(V),e.dataset.yaWhatsappEnabled=V.whatsappEnabled?`1`:`0`,at(),e.innerHTML=H.isOpen?yn():vn(),ot(e,V.apiBaseUrl),H.isOpen&&(on=!1),Pn(e),W()}function vn(){return`
    <button class="ya-widget-button" type="button" data-ya-open aria-label="${o(`Yardımcı Asistan'ı aç`)}">
      <span class="ya-widget-launcher-avatar">
        ${ln(`launcher`)}
      </span>
      <span class="ya-widget-launcher-copy">
        <strong>${o(`Yardımcı`)}</strong>
        <small>${o(`Asistan`)}</small>
      </span>
    </button>
  `}function yn(){return`
    <section class="ya-widget-panel${on?` is-opening`:``}" role="dialog" aria-labelledby="ya-widget-title">
      <header class="ya-widget-header">
        ${H.view===`home`?``:`<div class="ya-widget-nexa-speech-slot" data-ya-nexa-speech-slot hidden><span class="ya-widget-nexa-speech" data-ya-nexa-speech role="status" aria-atomic="true"></span></div>`}
        <div class="ya-widget-identity">
          ${H.view===`home`?``:`<span class="ya-widget-avatar">${ln(`header`)}</span>`}
          <span class="ya-widget-title-copy">
            <strong id="ya-widget-title">${H.view===`home`&&V.logoUrl?`<span class="ya-widget-business-mark">${bn()}</span>`:``}${Q($n())}</strong>
            <small>${Q(Qn())}</small>
          </span>
        </div>
        <button class="ya-widget-close" type="button" data-ya-close aria-label="${o(`Asistanı kapat`)}">
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div class="ya-widget-notice" data-ya-status role="status" ${H.status?``:`hidden`}>
        <span class="ya-widget-notice-icon" aria-hidden="true">${A(`info`)}</span>
        <span data-ya-status-text>${Q(H.status)}</span>
      </div>
      <div class="ya-widget-content">
        ${H.view===`home`?xn():``}
        ${H.view===`form`?Sn():``}
        ${H.view===`info`?On():``}
        ${H.view===`whatsapp`?kn():``}
        ${H.view===`directions`?An():``}
      </div>
    </section>
  `}function bn(){return V.logoUrl?`<img class="ya-widget-mark" src="${$(V.logoUrl)}" alt="" aria-hidden="true" />`:``}function xn(){let e=nr(),t=[];return X(`pension_reservation`)&&t.push(K({requestType:`pension_reservation`,icon:`calendar`,title:a(`Rezervasyon yap`),description:a(`Tarih ve kişi bilgilerini iletin`)})),X(`restaurant_reservation`)&&t.push(K({requestType:`restaurant_reservation`,icon:`table`,title:a(`Masa sor`),description:a(`Tarih, saat ve kişi sayısını seçin`)})),X(`dealer_application`)&&t.push(K({requestType:`dealer_application`,icon:`send`,title:a(`Bayi Başvurusu`),description:a(`Firma bilgilerinizi iletin`)})),X(`general_info`)&&t.push(K({requestType:`general_info`,icon:`send`,title:a(`Bilgi talebi oluştur`),description:a(`Sorunuzu ve iletişim bilgilerinizi iletin`)})),V.aiEnabled&&e.has(`catalog`)&&t.push(K({view:`info`,icon:`search`,title:a(`Ürün / stok sor`),description:a(`Ürün ve stok bilgisini hızlıca öğrenin`)})),V.aiEnabled&&t.push(K({view:`info`,icon:`sparkles`,title:a(`Asistana sor`),description:a(`İşletme hakkında kısa bir soru sorun`)})),P(V)&&t.push(K({view:`directions`,icon:`pin`,title:a(`Yol tarifi`),description:a(`Konumu açın veya ulaşımı sorun`)})),V.whatsappEnabled&&V.whatsappPhone.trim()&&t.push(K({view:`whatsapp`,icon:`whatsapp`,title:`WhatsApp`,description:a(`Hazır bir mesaj oluşturun`)})),`
    <div class="ya-widget-home">
      <div class="ya-widget-welcome">
        <span class="ya-widget-nexa-welcome">${ln(`welcome`)}</span>
        <div>
          <span class="ya-widget-kicker">${o(`İşletme yardımcısı`)}</span>
          <h2 class="ya-widget-view-title" tabindex="-1">${o(`Merhaba, ben Nexa.`)}</h2>
          <p>${o(`İşlemi seçin; gerekli alanı doğrudan açayım.`)}</p>
        </div>
      </div>
      <div class="ya-widget-actions" role="group" aria-label="${o(`Hızlı asistan seçenekleri`)}">
        ${t.length?t.join(``):`<p role="status">${o(`Şu anda kullanılabilir bir asistan işlemi yok.`)} ${o(`İletişim bilgilerini sitenin iletişim bölümünde bulabilirsiniz.`)}</p>`}
      </div>
    </div>
  `}function K(e){return`
    <button class="ya-widget-action-card" type="button" ${e.requestType?`data-ya-request-type="${e.requestType}"`:`data-ya-view="${e.view??`home`}"`}>
      <span class="ya-widget-action-icon" aria-hidden="true">${A(e.icon)}</span>
      <span class="ya-widget-action-copy">
        <strong>${Q(e.title)}</strong>
        <small>${Q(e.description)}</small>
      </span>
      <span class="ya-widget-action-arrow" aria-hidden="true">${A(`chevron-right`)}</span>
    </button>
  `}function Sn(){if(H.requestType===`dealer_application`)return It();let e=H.requestType===`restaurant_reservation`,t=H.requestType===`general_info`,n=a(t?`Bilgi talebi`:e?`Masa talebi`:`Rezervasyon talebi`),r=a(t?`Bilgi talebinizi hazırlayalım`:e?`Masa talebinizi hazırlayalım`:`Rezervasyonunuzu hazırlayalım`),i=t?``:e?wn():Cn();return`
    <div class="ya-widget-subview">
      ${Nn(n,e?`table`:`calendar`)}
      <div class="ya-widget-subview-intro">
        <span aria-hidden="true">${A(`sparkles`)}</span>
        <div>
          <h2 class="ya-widget-view-title" tabindex="-1">${r}</h2>
          <p>${o(t?`Sorunuzu ve iletişim bilgilerinizi ekleyin.`:`Tarih ve iletişim bilgilerinizi ekleyin.`)}</p>
        </div>
      </div>
      ${jn()}
      <form class="ya-widget-form" data-ya-form>
        <input type="hidden" name="request_type" value="${H.requestType}" />
        ${Mn()}
        ${i}
        <div class="ya-widget-field-grid">
          <label class="ya-widget-field">
            <span>${o(`Ad soyad`)}</span>
            <input name="customer_name" required autocomplete="name" placeholder="${o(`Adınız soyadınız`)}" />
          </label>
          <label class="ya-widget-field">
            <span>${o(`Telefon`)}</span>
            <input name="customer_phone" required inputmode="tel" autocomplete="tel" placeholder="+90 5xx… / +44…" />
          </label>
        </div>
        ${t?`<input type="hidden" name="guest_count" value="1" />`:Dn()}
        <label class="ya-widget-field">
          <span>${t?o(`Sorunuz`):`${o(`Kısa not`)} <small>${o(`(isteğe bağlı)`)}</small>`}</span>
          <textarea name="message" rows="2" maxlength="3000" ${t?`required`:``} placeholder="${o(t?`İşletmeye iletmek istediğiniz soruyu yazın`:`Tercihiniz veya eklemek istediğiniz kısa not`)}"></textarea>
        </label>
        <button class="ya-widget-primary-action" type="submit">
          ${A(`send`)}
          <span>${o(`Talebi Gönder`)}</span>
        </button>
      </form>
    </div>
  `}function Cn(){let e=I(new Date),t=I(F(new Date,1));return`
    <fieldset class="ya-widget-date-group" data-ya-accommodation-dates>
      <legend>${o(`Konaklama tarihleri`)}</legend>
      <div class="ya-widget-date-range">
        ${En(`start_date`,a(`Giriş`),a(`Giriş tarihi`),e)}
        ${En(`end_date`,a(`Çıkış`),a(`Çıkış tarihi`),t)}
      </div>
      <input name="date_text" type="hidden" />
      <div class="ya-widget-calendar" data-ya-calendar hidden></div>
    </fieldset>
  `}function wn(){let e=I(new Date);return`
    <fieldset class="ya-widget-date-group" data-ya-restaurant-date>
      <legend>${o(`Tarih ve saat`)}</legend>
      <div class="ya-widget-schedule-row">
        ${En(`start_date`,a(`Tarih`),a(`Tarih seç`),e)}
        ${Tn()}
      </div>
      <input name="date_text" type="hidden" />
      <div class="ya-widget-calendar" data-ya-calendar hidden></div>
    </fieldset>
  `}function Tn(){return`
    <div class="ya-widget-time-field">
      <span>${o(`Saat`)}</span>
      <button class="ya-widget-time-trigger" type="button" data-ya-open-time-picker aria-expanded="false">
        ${A(`clock`)}
        <strong data-ya-time-label>${o(`Saat seç`)}</strong>
        ${A(`chevron-right`)}
      </button>
      <input name="time" type="hidden" />
      <div class="ya-widget-time-popover" data-ya-time-popover hidden></div>
    </div>
  `}function En(e,t,n,r){return`
    <div class="ya-widget-date-picker" data-ya-date-picker-control="${e}">
      <span>${t}</span>
      <button type="button" data-ya-open-date-picker="${e}">
        ${A(`calendar`)}
        <strong data-ya-date-label="${e}">${n}</strong>
      </button>
      <input name="${e}" type="hidden" data-ya-date-value-input min="${r}" />
    </div>
  `}function Dn(){return`
    <fieldset class="ya-widget-guest-group">
      <legend>${o(`Kişi sayısı`)}</legend>
      <div class="ya-widget-stepper">
        <button type="button" data-ya-guest-step="-1" aria-label="${o(`Kişi sayısını azalt`)}" disabled>${A(`minus`)}</button>
        <input name="guest_count" required type="number" min="1" max="30" value="2" inputmode="numeric" aria-label="${o(`Kişi sayısı`)}" />
        <button type="button" data-ya-guest-step="1" aria-label="${o(`Kişi sayısını artır`)}">${A(`plus`)}</button>
      </div>
    </fieldset>
  `}function On(){let e=ir();return`
    <div class="ya-widget-subview ya-widget-info">
      ${Nn(a(`Bilgi al`),`help`)}
      <div class="ya-widget-subview-intro">
        <span aria-hidden="true">${A(`bot`)}</span>
        <div>
          <h2 class="ya-widget-view-title" tabindex="-1">${o(`Merak ettiğiniz şeyi sorun`)}</h2>
          <p>${o(`Kısa sorunuzu yazın veya sık sorulanlardan birini seçin.`)}</p>
        </div>
      </div>
      ${jn()}
      <div class="ya-widget-suggestions" role="group" aria-label="${o(`Sık sorulan sorular`)}">
        ${e.map(e=>`<button type="button" data-ya-question-suggestion="${$(e)}">${Q(e)}</button>`).join(``)}
      </div>
      <form class="ya-widget-ai" data-ya-ai-form>
        <label class="ya-widget-field">
          <span>${o(`Kısa soru`)}</span>
          <textarea name="message" required maxlength="1200" rows="3" placeholder="${o(`Örn. Bu akşam 4 kişilik masa var mı?`)}">${Q(H.questionDraft)}</textarea>
        </label>
        <div class="ya-widget-ai-actions">
          <button class="ya-widget-primary-action ${H.aiLoading?`is-loading`:``}" type="submit" ${H.aiLoading?`disabled`:``}>
            ${H.aiLoading?`<span class="ya-widget-spinner" aria-hidden="true"></span>`:A(`sparkles`)}
            <span>${H.aiLoading?a(`Yanıt hazırlanıyor…`):a(`AI Yardımcıya Sor`)}</span>
          </button>
          ${V.whatsappEnabled&&V.whatsappPhone.trim()?`<button class="ya-widget-secondary-action" type="button" data-ya-ai-whatsapp>
                ${A(`whatsapp`)}
                <span>${o(`WhatsApp'tan Yaz`)}</span>
              </button>`:``}
        </div>
      </form>
      ${H.aiAnswer?`<div class="ya-widget-ai-answer">
              <p><strong>${o(`AI Yardımcı`)}</strong><span>${Q(H.aiAnswer)}</span></p>
            </div>`:``}
    </div>
  `}function kn(){let e=ar();return`
    <div class="ya-widget-subview ya-widget-whatsapp-view">
      ${Nn(`WhatsApp`,`whatsapp`)}
      <div class="ya-widget-subview-intro">
        <span aria-hidden="true">${A(`whatsapp`)}</span>
        <div>
          <h2 class="ya-widget-view-title" tabindex="-1">${o(`Mesajınızı birlikte hazırlayalım`)}</h2>
          <p>${o(`Konuyu seçin; metni isterseniz göndermeden önce düzenleyin.`)}</p>
        </div>
      </div>
      <div class="ya-widget-topic-chips" role="group" aria-label="${o(`WhatsApp mesaj konusu`)}">
        ${e.map(e=>`
              <button
                type="button"
                data-ya-whatsapp-topic="${e.key}"
                data-ya-whatsapp-message="${$(e.message)}"
                aria-pressed="${H.whatsappTopic===e.key?`true`:`false`}"
                class="${H.whatsappTopic===e.key?`is-active`:``}"
              >${Q(e.label)}</button>
            `).join(``)}
      </div>
      <form class="ya-widget-direct-whatsapp" data-ya-whatsapp-form>
        <label class="ya-widget-field">
          <span>${o(`Mesajınız`)}</span>
          <textarea name="message" required rows="3" maxlength="1200" placeholder="${o(`Kısa mesajınızı yazın`)}">${Q(H.whatsappDraft)}</textarea>
        </label>
        <div class="ya-widget-message-preview">
          <span>${o(`Hazır mesaj`)}</span>
          <p data-ya-message-preview>${H.whatsappDraft?Q(H.whatsappDraft):a(`Bir konu seçtiğinizde mesajınız burada görünecek.`)}</p>
        </div>
        <button class="ya-widget-primary-action" type="submit">
          ${A(`send`)}
          <span>${o(`WhatsApp'ta Aç`)}</span>
        </button>
      </form>
    </div>
  `}function An(){let e=String(H.context?.address||V.address||``).trim(),t=String(H.context?.mapUrl||V.mapUrl||en(e)).trim();return`
    <div class="ya-widget-subview ya-widget-directions">
      ${Nn(a(`Yol tarifi`),`pin`)}
      <div class="ya-widget-subview-intro">
        <span aria-hidden="true">${A(`pin`)}</span>
        <div>
          <h2 class="ya-widget-view-title" tabindex="-1">${o(`Bize nasıl ulaşabilirsiniz?`)}</h2>
          <p>${o(`Konumu açabilir veya ulaşım hakkında kısa bir soru sorabilirsiniz.`)}</p>
        </div>
      </div>
      ${jn()}
      <div class="ya-widget-location-card">
        <span>${A(`pin`)}</span>
        <div>
          <strong>${Q(V.businessName)}</strong>
          <p>${Q(e||a(`Adres bilgisi site tarafından iletilmedi.`))}</p>
        </div>
      </div>
      <div class="ya-widget-ai-actions">
        ${t?`<a class="ya-widget-primary-action" href="${$(t)}" target="_blank" rel="noopener noreferrer">${A(`pin`)}<span>${o(`Haritada Aç`)}</span></a>`:``}
        ${V.aiEnabled?`<button class="ya-widget-secondary-action" type="button" data-ya-directions-question>
          ${A(`help`)}<span>${o(`Yol Tarifi Sor`)}</span>
        </button>`:``}
      </div>
    </div>
  `}function jn(){let e=H.context,t=String(e?.resourceName??``).trim();if(!t)return``;let n=String(e?.resourceType??``).trim(),r=a(n===`room`?`Seçili oda`:n===`table`?`Seçili masa`:n===`product`?`Seçili ürün`:`Sayfa bağlamı`),i=String(e?.imageUrl??``).trim();return`
    <div class="ya-widget-context-card" data-ya-context-card>
      ${i?`<img src="${$(i)}" alt="" />`:`<span class="ya-widget-context-icon">${A(n===`room`?`bed`:`sparkles`)}</span>`}
      <div>
        <small>${Q(r)}</small>
        <strong>${Q(t)}</strong>
      </div>
    </div>
  `}function Mn(){let e=H.context??{};return`
    <input type="hidden" name="context_resource_type" value="${$(String(e.resourceType??``))}" />
    <input type="hidden" name="context_resource_id" value="${$(String(e.resourceId??``))}" />
    <input type="hidden" name="context_resource_name" value="${$(String(e.resourceName??``))}" />
    <input type="hidden" name="context_source_path" value="${$(String(e.sourcePath??``))}" />
  `}function Nn(e,t){return`
    <div class="ya-widget-subview-nav">
      <button type="button" data-ya-view="home">${A(`arrow-left`)}<span>${o(`Geri`)}</span></button>
      <span class="ya-widget-active-flow">${A(t)} ${Q(e)}</span>
    </div>
  `}function Pn(e){Lt(e,V.apiBaseUrl),e.querySelector(`[data-ya-open]`)?.addEventListener(`click`,()=>fn()),e.querySelector(`[data-ya-close]`)?.addEventListener(`click`,pn),e.querySelectorAll(`[data-ya-view]`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.yaView;H={...H,isOpen:!0,view:t,status:``,aiLoading:!1,context:t===`home`?null:H.context,questionDraft:t===`home`?``:H.questionDraft},G(),Z(`.ya-widget-view-title`)})}),e.querySelectorAll(`[data-ya-request-type]`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.yaRequestType;X(t)?(H={...H,view:`form`,requestType:t,status:``},G(),Z(`.ya-widget-view-title`)):Y(a(`Bu işlem işletmenin etkin web seçeneklerinde kullanılamıyor.`))})}),Fn(e),Hn(e),Gn(e),Kn(e),Jn(e),qn(e),e.querySelector(`[data-ya-ai-form]`)?.addEventListener(`submit`,e=>void Yn(e)),e.querySelector(`[data-ya-whatsapp-form]`)?.addEventListener(`submit`,Xn),e.onkeydown=e=>{e.key===`Escape`&&H.isOpen&&(e.preventDefault(),pn())}}function Fn(e){e.querySelectorAll(`[data-ya-open-date-picker]`).forEach(t=>{t.addEventListener(`click`,()=>In(e,String(t.dataset.yaOpenDatePicker??``)))});let t=e.querySelector(`[data-ya-calendar]`);t?.addEventListener(`click`,n=>{let r=n.target instanceof Element?n.target.closest(`button`):null;if(!r||r.disabled)return;if(r.dataset.yaCalendarClose===`1`){q(e);return}if(r.dataset.yaCalendarShortcut){Rn(e,String(r.dataset.yaCalendarShortcut),t);return}if(r.dataset.yaCalendarShift){let n=Number(r.dataset.yaCalendarShift),i=L(String(t.dataset.yaCalendarMonth??``));if(!i||!Number.isFinite(n))return;t.dataset.yaCalendarMonth=I(new Date(i.getFullYear(),i.getMonth()+n,1)),Ln(e);return}let i=String(r.dataset.yaCalendarDay??``),a=e.querySelector(`input[name="${String(t.dataset.yaCalendarTarget??``)}"]`);i&&a&&(a.value=i,a.dispatchEvent(new Event(`change`,{bubbles:!0})),q(e))});let n=e.querySelector(`input[name="start_date"]`),r=e.querySelector(`input[name="end_date"]`);n?.addEventListener(`change`,()=>{e.querySelector(`[data-ya-accommodation-dates]`)?Bn(e):Vn(e,`custom`,n.value)}),r?.addEventListener(`change`,()=>Bn(e))}function In(e,t){J(e);let n=e.querySelector(`[data-ya-calendar]`),r=e.querySelector(`input[name="${t}"]`);if(!n||!r)return;let i=L(r.value)??L(r.min)??new Date;n.dataset.yaCalendarTarget=t,n.dataset.yaCalendarMonth=I(new Date(i.getFullYear(),i.getMonth(),1)),n.hidden=!1,Ln(e)}function q(e){let t=e.querySelector(`[data-ya-calendar]`);t&&(t.hidden=!0)}function Ln(e){let t=e.querySelector(`[data-ya-calendar]`);if(!t)return;let n=String(t.dataset.yaCalendarTarget??``),r=e.querySelector(`input[name="${n}"]`),i=L(String(t.dataset.yaCalendarMonth??``));if(!r||!i)return;let s=i.getFullYear(),c=i.getMonth(),l=new Date(s,c,1),u=new Date(s,c+1,0),d=(l.getDay()+6)%7,f=r.min||I(new Date),p=r.value,m=I(new Date),h=e.querySelector(`input[name="start_date"]`)?.value??``,g=e.querySelector(`input[name="end_date"]`)?.value??``,_=!!e.querySelector(`[data-ya-accommodation-dates]`),v=[];for(let e=0;e<d;e+=1)v.push(`<span class="ya-widget-calendar-empty" aria-hidden="true"></span>`);for(let e=1;e<=u.getDate();e+=1){let t=I(new Date(s,c,e)),n=t<f,r=[t===p?`is-selected`:``,t===m?`is-today`:``,_&&h&&g&&t>h&&t<g?`is-in-range`:``,_&&(t===h||t===g)?`is-range-edge`:``].filter(Boolean).join(` `);v.push(`<button type="button" data-ya-calendar-day="${t}" class="${r}" ${n?`disabled`:``} aria-label="${$(R(t))}">${e}</button>`)}let y=_?n===`end_date`?[[`clear`,a(`Temizle`),!g],[`day1`,a(`1 gün`),!h],[`day2`,a(`2 gün`),!h],[`day7`,a(`7 gün`),!h],[`day10`,a(`10 gün`),!h]]:[[`clear`,a(`Temizle`),!h],[`today`,a(`Bugün`),!1],[`tomorrow`,a(`Yarın`),!1]]:[[`clear`,a(`Temizle`),!p],[`today`,a(`Bugün`),!1],[`tomorrow`,a(`Yarın`),!1]],ee=I(new Date(s,c,0));t.innerHTML=`
    <div class="ya-widget-calendar-head">
      <button type="button" data-ya-calendar-shift="-1" aria-label="${o(`Önceki ay`)}" ${ee<f?`disabled`:``}>${A(`chevron-left`)}</button>
      <strong class="ya-widget-calendar-title">${Q(Yt(i))}</strong>
      <button type="button" data-ya-calendar-shift="1" aria-label="${o(`Sonraki ay`)}">${A(`chevron-right`)}</button>
      <button class="ya-widget-calendar-close" type="button" data-ya-calendar-close="1" aria-label="${o(`Takvimi kapat`)}">×</button>
    </div>
    <div class="ya-widget-calendar-shortcuts">
      ${y.map(([e,t,n])=>`<button type="button" data-ya-calendar-shortcut="${e}" ${n?`disabled`:``}>${t}</button>`).join(``)}
    </div>
    <div class="ya-widget-calendar-weekdays" aria-hidden="true"><span>${o(`Pzt`)}</span><span>${o(`Sal`)}</span><span>${o(`Çar`)}</span><span>${o(`Per`)}</span><span>${o(`Cum`)}</span><span>${o(`Cmt`)}</span><span>${o(`Paz`)}</span></div>
    <div class="ya-widget-calendar-days">${v.join(``)}</div>
  `}function Rn(e,t,n){let r=String(n.dataset.yaCalendarTarget??``),i=e.querySelector(`input[name="${r}"]`);if(!i)return;let a=!!e.querySelector(`[data-ya-accommodation-dates]`),o=new Date;if(t===`clear`){zn(e,r),q(e);return}let s=/^day(1|2|7|10)$/.exec(t);if(s){let t=Number(s[1]),n=e.querySelector(`input[name="start_date"]`),i=e.querySelector(`input[name="end_date"]`),o=n?L(n.value):null;if(!a||r!==`end_date`||!n||!i||!o)return;i.value=I(F(o,t)),i.dispatchEvent(new Event(`change`,{bubbles:!0})),q(e);return}let c=I(t===`tomorrow`?F(o,1):o);i.min&&c<i.min||(i.value=c,a?i.dispatchEvent(new Event(`change`,{bubbles:!0})):Vn(e,t===`tomorrow`?`tomorrow`:`today`,c),q(e))}function zn(e,t){let n=e.querySelector(`input[name="${t}"]`);if(!n)return;let r=!!e.querySelector(`[data-ya-accommodation-dates]`);if(n.value=``,r){let n=e.querySelector(`input[name="start_date"]`),r=e.querySelector(`input[name="end_date"]`);t===`start_date`&&n&&r&&(r.value=``,r.min=I(F(new Date,1))),Bn(e);return}let i=e.querySelector(`input[name="date_text"]`),o=e.querySelector(`[data-ya-date-label="start_date"]`);i&&(i.value=``),o&&(o.textContent=a(`Tarih seç`)),e.querySelector(`[data-ya-open-date-picker]`)?.classList.remove(`is-active`)}function Bn(e){let t=e.querySelector(`input[name="start_date"]`),n=e.querySelector(`input[name="end_date"]`),r=e.querySelector(`input[name="date_text"]`);if(!t||!n||!r)return;if(t.value){let e=L(t.value);e&&(n.min=I(F(e,1)),n.value&&n.value<=t.value&&(n.value=``))}let i=e.querySelector(`[data-ya-date-label="start_date"]`),o=e.querySelector(`[data-ya-date-label="end_date"]`);i&&(i.textContent=t.value?R(t.value):a(`Giriş tarihi`)),o&&(o.textContent=n.value?R(n.value):a(`Çıkış tarihi`)),r.value=t.value&&n.value?`${R(t.value)} – ${R(n.value)}`:``}function Vn(e,t,n){let r=e.querySelector(`input[name="start_date"]`),i=e.querySelector(`input[name="date_text"]`),a=e.querySelector(`[data-ya-open-date-picker]`),o=e.querySelector(`[data-ya-date-label="start_date"]`);if(!r||!i||!n)return;let s=Xt(n,t);r.value=n,i.value=s,e.querySelectorAll(`[data-ya-date-preset]`).forEach(e=>{let n=e.dataset.yaDatePreset===t;e.classList.toggle(`is-active`,n),e.setAttribute(`aria-pressed`,String(n))}),a?.classList.add(`is-active`),o&&(o.textContent=R(n))}function Hn(e){let t=e.querySelector(`[data-ya-open-time-picker]`),n=e.querySelector(`[data-ya-time-popover]`),r=e.querySelector(`input[name="time"]`);t&&n&&r&&(t.addEventListener(`click`,()=>{q(e);let r=n.hidden;r&&Un(e),n.hidden=!r,t.setAttribute(`aria-expanded`,String(r))}),n.addEventListener(`click`,t=>{let a=t.target instanceof Element?t.target.closest(`button`):null;if(!a||a.disabled)return;if(a.dataset.yaTimeClose===`1`){J(e);return}if(a.dataset.yaTimeClear===`1`){Wn(e),J(e);return}let o=a.dataset.yaTimeHour,s=a.dataset.yaTimeMinute;o!==void 0&&(n.dataset.yaSelectedHour=o),s!==void 0&&(n.dataset.yaSelectedMinute=s);let c=String(n.dataset.yaSelectedHour??``),l=String(n.dataset.yaSelectedMinute??``);if(c&&l){r.value=`${c}:${l}`;let t=e.querySelector(`[data-ya-time-label]`);t&&(t.textContent=new Intl.DateTimeFormat(i,{hour:`2-digit`,minute:`2-digit`}).format(new Date(2e3,0,1,Number(c),Number(l))))}Un(e),s!==void 0&&c&&l&&J(e)}))}function Un(e){let t=e.querySelector(`[data-ya-time-popover]`),n=e.querySelector(`input[name="time"]`);if(!t||!n)return;let r=/^([01]\\d|2[0-3]):([0-5]\\d)$/.exec(n.value);r&&(t.dataset.yaSelectedHour=r[1],t.dataset.yaSelectedMinute=r[2]);let i=String(t.dataset.yaSelectedHour??``),a=String(t.dataset.yaSelectedMinute??``),s=Array.from({length:24},(e,t)=>String(t).padStart(2,`0`));t.innerHTML=`
    <div class="ya-widget-time-popover-head">
      <div>
        <small>${o(`Saat seçimi`)}</small>
        <strong>${i||`--`}:${a||`--`}</strong>
      </div>
      <div class="ya-widget-time-popover-actions">
        <button class="ya-widget-time-clear" type="button" data-ya-time-clear="1" ${n.value?``:`disabled`}>${o(`Temizle`)}</button>
        <button class="ya-widget-time-close" type="button" data-ya-time-close="1" aria-label="${o(`Saat seçimini kapat`)}">×</button>
      </div>
    </div>
    <div class="ya-widget-time-columns">
      <div class="ya-widget-time-column" aria-label="${o(`Saatler`)}">
        <span>${o(`Saat`)}</span>
        <div class="ya-widget-time-scroll">
          ${s.map(e=>`<button type="button" data-ya-time-hour="${e}" class="${i===e?`is-selected`:``}">${e}</button>`).join(``)}
        </div>
      </div>
      <div class="ya-widget-time-column" aria-label="${o(`Dakikalar`)}">
        <span>${o(`Dakika`)}</span>
        <div class="ya-widget-time-scroll ya-widget-time-minutes">
          ${[`00`,`15`,`30`,`45`].map(e=>`<button type="button" data-ya-time-minute="${e}" class="${a===e?`is-selected`:``}">${e}</button>`).join(``)}
        </div>
      </div>
    </div>
  `,window.requestAnimationFrame(()=>{t.querySelector(`.ya-widget-time-scroll .is-selected`)?.scrollIntoView({block:`center`})})}function Wn(e){let t=e.querySelector(`[data-ya-time-popover]`),n=e.querySelector(`input[name="time"]`),r=e.querySelector(`[data-ya-time-label]`);n&&(n.value=``),r&&(r.textContent=a(`Saat seç`)),t&&(delete t.dataset.yaSelectedHour,delete t.dataset.yaSelectedMinute)}function J(e){let t=e.querySelector(`[data-ya-time-popover]`),n=e.querySelector(`[data-ya-open-time-picker]`);t&&(t.hidden=!0),n?.setAttribute(`aria-expanded`,`false`)}function Gn(e){let t=e.querySelector(`input[name="guest_count"]`);if(!t)return;let n=()=>{let n=Jt(t.value);e.querySelectorAll(`[data-ya-guest-step]`).forEach(e=>{let t=Number(e.dataset.yaGuestStep??0);e.disabled=t<0&&n<=1||t>0&&n>=30})};e.querySelectorAll(`[data-ya-guest-step]`).forEach(e=>{e.addEventListener(`click`,()=>{let r=Number(e.dataset.yaGuestStep??0);t.value=String(Math.min(30,Math.max(1,Jt(t.value)+r))),n()})}),t.addEventListener(`input`,n),n()}function Kn(e){let t=e.querySelector(`.ya-widget-ai textarea`);t&&(t.addEventListener(`input`,()=>{H.questionDraft=t.value}),e.querySelectorAll(`[data-ya-question-suggestion]`).forEach(n=>{n.addEventListener(`click`,()=>{let r=String(n.dataset.yaQuestionSuggestion??``);t.value=r,H.questionDraft=r,e.querySelectorAll(`[data-ya-question-suggestion]`).forEach(e=>e.classList.remove(`is-active`)),n.classList.add(`is-active`),t.focus()})}),e.querySelector(`[data-ya-ai-whatsapp]`)?.addEventListener(`click`,()=>{let e=t.value.trim()||a(`Bilgi almak istiyorum.`);H.questionDraft=t.value;let n=a(`Merhaba, {0} hakkında bilgi almak istiyorum. Sorum: {1}`,{0:V.businessName,1:e});window.open(hn(V.whatsappPhone,n),`_blank`,`noopener,noreferrer`),Y(``)}))}function qn(e){e.querySelector(`[data-ya-directions-question]`)?.addEventListener(`click`,()=>{let e=String(H.context?.address||V.address||``).trim();H={...H,view:`info`,questionDraft:H.context?.question?.trim()||(e?a(`{0} adresine nasıl gelebilirim?`,{0:e}):a(`İşletmenize nasıl gelebilirim?`)),status:``},G(),Z(`.ya-widget-ai textarea`)})}function Jn(e){let t=e.querySelector(`.ya-widget-direct-whatsapp textarea`),n=e.querySelector(`[data-ya-message-preview]`);if(!t||!n)return;let r=()=>{H.whatsappDraft=t.value,n.textContent=t.value.trim()||a(`Mesajınızı yazdığınızda burada görünecek.`)};t.addEventListener(`input`,()=>{H.whatsappTopic=`custom`,e.querySelectorAll(`[data-ya-whatsapp-topic]`).forEach(e=>{let t=e.dataset.yaWhatsappTopic===`custom`;e.classList.toggle(`is-active`,t),e.setAttribute(`aria-pressed`,String(t))}),r()}),e.querySelectorAll(`[data-ya-whatsapp-topic]`).forEach(n=>{n.addEventListener(`click`,()=>{let i=String(n.dataset.yaWhatsappTopic??``),a=String(n.dataset.yaWhatsappMessage??``);H.whatsappTopic=i,t.value=a,r(),e.querySelectorAll(`[data-ya-whatsapp-topic]`).forEach(e=>{let t=e===n;e.classList.toggle(`is-active`,t),e.setAttribute(`aria-pressed`,String(t))}),t.focus()})})}async function Yn(e){if(e.preventDefault(),!V.aiEnabled){H={...H,view:`home`,status:``,aiLoading:!1,aiAnswer:``},G();return}let t=e.currentTarget,n=new FormData(t),i=String(n.get(`message`)??``).trim();if(!i){Y(a(`Lütfen kısa sorunuzu yazın.`));return}if(!V.apiBaseUrl){Y(a(`AI bağlantısı bu sitede etkin değil. Sorunuzu WhatsApp'tan iletebilirsiniz.`));return}H={...H,questionDraft:i,status:``,aiLoading:!0};let o=E.begin();G();let s=``;try{let e=`${V.apiBaseUrl.replace(/\/$/,``)}/api/chat.php`,t=await fetch(e,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({message:i,...r===`tr`?{}:{response_language:r}})}),n=await t.json().catch(()=>null);if(!t.ok||!n?.ok||!n.answer)throw s=Zn(n?.error,n?.message),Error(`ai_failed`);H={...H,aiAnswer:n.answer,aiLoading:!1,status:n.fallback?Zn(n.error):``},o(n.fallback?`error`:`response`),G()}catch{o(`error`),H={...H,aiLoading:!1,status:s||a(`AI servisine ulaşılamadı. İnternet veya sunucu bağlantısını kontrol edin. Hata kodu: widget_connection_failed.`)},G()}}function Xn(e){e.preventDefault();let t=e.currentTarget,n=new FormData(t),r=String(n.get(`message`)??``).trim();r?(H.whatsappDraft=r,window.open(hn(V.whatsappPhone,r),`_blank`,`noopener,noreferrer`),Y(``)):Y(a(`Lütfen bir konu seçin veya kısa mesajınızı yazın.`))}function Y(e){H.status=e;let t=document.querySelector(`#${B} [data-ya-status]`),n=t?.querySelector(`[data-ya-status-text]`);t&&n&&(n.textContent=e,t.hidden=!e)}function Zn(e,t=``){let n=i===`en-GB`?a(`AI hizmeti şu anda kullanılamıyor. Lütfen tekrar deneyin.`):String(e?.message||t||a(`AI yanıtı alınamadı.`)).trim(),r=String(e?.code||`unknown_ai_error`).trim(),o=Number(e?.provider_status||0);return a(`{0} Hata kodu: {1}{2}.{3}`,{0:n,1:r,2:o>0?` (HTTP ${o})`:``,3:e?.retryable===!0?a(` Biraz sonra yeniden deneyebilirsiniz.`):``})}function Qn(){let e=nr();return e.has(`accommodation`)&&e.has(`food_service`)?a(`Rezervasyon, masa ve bilgi taleplerinizi hızlıca hazırlayayım.`):e.has(`accommodation`)?a(`Oda, rezervasyon ve konaklama sorularınızda yardımcı olayım.`):e.has(`food_service`)?a(`Masa, menü ve restoran sorularınızda yardımcı olayım.`):e.has(`catalog`)?a(`Ürün, stok ve işletme bilgileri için yardımcı olayım.`):a(`İşletme hakkında bilgi ve iletişim taleplerinizde yardımcı olayım.`)}function $n(){let e=(V.businessName.trim()||a(`Yardımcı`)).replace(/\s+(?:Pansiyon|Otel|Butik Otel|Restoran|Kafe)(?:\s*(?:&|\/)\s*(?:Pansiyon|Otel|Restoran|Kafe))*\s*$/i,``).trim();return`${e&&e.toLocaleLowerCase(`tr-TR`)!==`yardımcı asistan`?e:a(`Yardımcı`)} ${V.aiEnabled?a(`AI Asistanı`):a(`Yardımcısı`)}`}function er(){let e=document.getElementById(B);if(e)return e;let t=document.createElement(`div`);return t.id=B,document.body.appendChild(t),t}function tr(e){let t=document.getElementById(tn);t||(t=document.createElement(`style`),t.id=tn,document.head.appendChild(t)),t.textContent=Rt(B,e)}function nr(){return j(V)}function rr(){return Wt(V)}function X(e){return N(V,e)}function ir(){return Kt(V)}function ar(){return qt(V)}function or(e){if(e.mapDisplayMode===`manual`){let t=e.latitude,n=e.longitude;return typeof t!=`number`||typeof n!=`number`||!Number.isFinite(t)||!Number.isFinite(n)||Math.abs(t)>90||Math.abs(n)>180?``:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${t},${n}`)}`}let t=typeof e.map_url==`string`?e.map_url.trim():``;try{let e=new URL(t);if(e.protocol===`https:`&&!e.username&&!e.password)return e.toString()}catch{}return e.mapDisplayMode===`google_maps_embed`?Re(e.googleMapsEmbedUrl):``}async function sr(e){let t=V.apiBaseUrl.trim().replace(/\/$/,``);if(t)try{let n=await fetch(`${t}/api/business.php`,{method:`GET`,headers:{Accept:`application/json`}}),r=await n.json().catch(()=>null);if(e!==sn||!n.ok||r?.ok!==!0||!r.business)return;let i=r.business,a=Ht(i.profile_id),o=Ut(i.public_surfaces);V={...V,businessName:String(i.display_name??``).trim()||V.businessName,whatsappPhone:typeof i.whatsapp==`string`?i.whatsapp.trim():V.whatsappPhone,primaryColor:String(i.primary_color??``).trim()||V.primaryColor,accentColor:String(i.accent_color??``).trim()||V.accentColor,address:typeof i.address==`string`?i.address.trim():V.address,mapUrl:or(i),aiEnabled:i.ai_enabled===!0,whatsappEnabled:i.whatsapp_enabled===!0,dealerApplicationEnabled:i.dealer_application_enabled===!0,requestsEnabled:i.requests_enabled===!0,requestTypes:M(i.request_types),profileId:a||V.profileId,publicSurfaces:o},(H.view===`form`&&!X(H.requestType)||H.view===`info`&&!V.aiEnabled||H.view===`whatsapp`&&!rr()||H.view===`directions`&&!P(V))&&(H={...H,view:`home`,status:``,aiLoading:!1,aiAnswer:``,questionDraft:``}),tr(V),G()}catch{}}function cr(){an||(an=!0,document.addEventListener(`click`,e=>{let t=e.target instanceof Element?e.target.closest(`[data-ya-action]`):null;if(!t||t.closest(`#${B}`))return;let n=$t(t.dataset.yaAction);n&&(e.preventDefault(),fn({intent:n,context:{...t.dataset.yaResourceType===void 0?{}:{resourceType:t.dataset.yaResourceType},...t.dataset.yaResourceId===void 0?{}:{resourceId:t.dataset.yaResourceId},...t.dataset.yaResourceName===void 0?{}:{resourceName:t.dataset.yaResourceName},...t.dataset.yaImageUrl===void 0?{}:{imageUrl:t.dataset.yaImageUrl},sourcePath:t.dataset.yaSourcePath||window.location.pathname,...t.dataset.yaQuestion===void 0?{}:{question:t.dataset.yaQuestion},...t.dataset.yaAddress===void 0?{}:{address:t.dataset.yaAddress},...t.dataset.yaMapUrl===void 0?{}:{mapUrl:t.dataset.yaMapUrl}}}))}))}function Z(e){window.requestAnimationFrame(()=>{document.querySelector(`#${B} ${e}`)?.focus()})}function Q(e){return e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#039;`)}function $(e){return Q(e).replace(/`/g,`&#096;`)}return window.YardimciAsistanWidget={init:dn,open:fn,close:pn},document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,()=>dn(),{once:!0}):dn(),ft(),p(),e.buildWhatsAppMessage=gn,e.close=pn,e.createWhatsAppLink=hn,e.init=dn,e.normalizeInternationalPhone=_n,e.open=fn,e})({});