var YardimciAsistanWidget=(function($){"use strict";const ke="#yardimci-asistan-widget";let Ae=!1,X=!1,U="",ee=[],D={apiBaseUrl:""};function ha(){Ae||(Ae=!0,D={...D,...Aa()},_e(),queueMicrotask(_e),document.addEventListener("submit",ya,!0))}function _e(){const e=window.YardimciAsistanWidget;if(!e||typeof e.init!="function"||e.__availabilityInitWrapped===!0)return;const a=e.init.bind(e);e.init=(t={})=>{D={...D,...Te(t)},a(t)},e.__availabilityInitWrapped=!0}function ya(e){const a=e.target instanceof HTMLFormElement?e.target:null;if(!a?.matches(".ya-widget-ai[data-ya-ai-form]"))return;if(a.dataset.yaAvailabilityBypass==="1"){delete a.dataset.yaAvailabilityBypass;return}const t=new FormData(a),s=String(t.get("message")??"").trim();if(!s)return;const i=U!==""&&Sa(s,ee),n=va(s);if(!i&&!n){F();return}e.preventDefault(),e.stopImmediatePropagation(),X||xa(a,s,i)}async function xa(e,a,t){const s=D.apiBaseUrl.trim().replace(/\/$/,"");if(!s){ae(e);return}const i=t?`${U} ${a}`.trim():a;X=!0,te(e,!0),ka("Canlı müsaitlik kontrol ediliyor...");try{const d=await(await fetch(`${s}/api/availability.php`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:i})})).json().catch(()=>null);if(d?.handled!==!0||!d.answer){F(),ae(e);return}d.complete===!1?(U=i,ee=Array.isArray(d.missing)?d.missing.filter(p=>typeof p=="string"):[]):F(),e.isConnected&&(wa(e,d.answer,d.live===!0),Ee(),te(e,!1))}catch{F(),ae(e)}finally{X=!1}}function ae(e){e.isConnected&&(Ee(),te(e,!1),e.dataset.yaAvailabilityBypass="1",queueMicrotask(()=>{e.isConnected&&e.requestSubmit()}))}function wa(e,a,t){const s=e.closest(".ya-widget-subview");if(!s)return;let i=s.querySelector(".ya-widget-ai-answer");i||(i=document.createElement("div"),i.className="ya-widget-ai-answer",e.insertAdjacentElement("afterend",i)),i.dataset.yaAvailabilityAnswer="1",i.replaceChildren();const n=document.createElement("p"),d=document.createElement("strong");d.textContent=t?"Canlı Müsaitlik":"Müsaitlik Kontrolü";const p=document.createElement("span");p.textContent=a,n.append(d,p),i.append(n);const c=s.querySelector(".ya-widget-inline-trust");c&&(c.textContent="Müsaitlik sorgusu rezervasyon oluşturmaz; son onay işletmeye aittir.")}function te(e,a){const t=e.querySelector('button[type="submit"]');if(!t)return;t.disabled=a;const s=t.querySelector("span");s&&(s.textContent=a?"Müsaitlik kontrol ediliyor":"AI Yardımcıya Sor")}function va(e){const a=e.toLocaleLowerCase("tr-TR"),t=/\b(?:oda(?:lar)?|otel|pansiyon|konaklama)(?:mız|miz|muz|müz|ımız|imiz|umuz|ümüz|nız|niz|nuz|nüz|ınız|iniz|unuz|ünüz)?(?:da|de|ta|te|dan|den|tan|ten|ya|ye|yı|yi|yu|yü|nın|nin|nun|nün)?\b/u.test(a),s=/(müsait|musait|boş|bos|yer\s+var|rezervasyon)/u.test(a)||/\b(?:oda(?:lar)?|otel|pansiyon|konaklama)(?:mız|miz|muz|müz|ımız|imiz|umuz|ümüz|nız|niz|nuz|nüz|ınız|iniz|unuz|ünüz)?(?:da|de|ta|te|dan|den|tan|ten|ya|ye|yı|yi|yu|yü|nın|nin|nun|nün)?\s+var(?:\s*m[ıiuü])?\b/u.test(a);return t&&s}function Sa(e,a){const t=e.toLocaleLowerCase("tr-TR").trim();return!!(a.includes("guest_count")&&(/^\d{1,2}$/.test(t)||/\b\d{1,2}\s*(kişi|kisi|kişilik|kisilik|yetişkin|yetiskin|çocuk|cocuk)\b/u.test(t))||a.includes("date_range")&&(/\b20\d{2}-\d{2}-\d{2}\b/.test(t)||/\b\d{1,2}[./]\d{1,2}(?:[./]20\d{2})?\b/.test(t)||/\b\d{1,2}\s*(?:-|–|—|ile)\s*\d{1,2}\b/u.test(t)||/\b(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik|bugün|bugun|yarın|yarin)\b/u.test(t)))}function F(){U="",ee=[]}function ka(e){const a=document.querySelector(`${ke} [data-ya-status]`);a&&(a.textContent=e,a.hidden=!1)}function Ee(){const e=document.querySelector(`${ke} [data-ya-status]`);e&&(e.textContent="",e.hidden=!0)}function Aa(){const e=Array.from(document.scripts).reverse(),a=document.currentScript??e.find(t=>t.dataset.apiBaseUrl!==void 0||/widget(?:-core)?\.js(?:$|\?)/.test(t.src));return Te({apiBaseUrl:a?.dataset.apiBaseUrl})}function Te(e){const a={};return typeof e.apiBaseUrl=="string"&&e.apiBaseUrl.trim()&&(a.apiBaseUrl=e.apiBaseUrl),a}const _a={pension_reservation:"Pansiyon rezervasyonu",restaurant_reservation:"Masa rezervasyonu",general_info:"Bilgi talebi"},Ea=/^\+[1-9]\d{6,14}$/,$e=/^5\d{9}$/,se="Telefon numarası geçerli formatta olmalı. Yurt dışı numaralarında ülke kodunu ekleyin. Örnek: +90 532 123 45 67 veya +44 7911 123456";function Ta(e,a){const t=ne(e);if(!t.ok)return{ok:!1,mode:"wa_link",code:"invalid_phone",message:t.error};const s=a.trim();if(!s)return{ok:!1,mode:"wa_link",code:"empty_message",message:"WhatsApp mesajı boş olmamalı."};const i=encodeURIComponent(s);return{ok:!0,mode:"wa_link",url:`https://wa.me/${t.whatsapp}?text=${i}`,whatsappPhone:t.whatsapp,phoneDisplay:t.display,message:s,encodedMessage:i}}function ie(e,a){const t=Ta(e,a);return t.ok?t.url:""}function Oe(e,a){const t=_a[e.request_type]??"Bilgi talebi";return[`Merhaba, ${a} için talep oluşturmak istiyorum.`,`Talep türü: ${t}`,`Ad soyad: ${e.customer_name}`,`Telefon: ${e.customer_phone}`,`Tarih: ${e.date_text}`,e.time_text?`Saat: ${e.time_text}`:"",`Kişi sayısı: ${e.guest_count}`,e.message?`Not: ${e.message}`:"","Lütfen bilgileri kontrol edip gönder tuşuna basın."].filter(Boolean).join(`
`)}function ne(e){const a=Ce(e);return a.ok?{ok:!0,whatsapp:a.whatsapp,e164:a.e164,national:a.national,display:$a(e)}:{ok:!1,error:a.error}}function Ce(e){const a=e.trim(),t=Oa(a);let s="";if(t.startsWith("+")){if(!Ea.test(t))return{ok:!1,error:se};if(t.startsWith("+90")&&!$e.test(t.slice(3)))return{ok:!1,error:se};s=t}else{const n=Ca(t);if(!n||!$e.test(n))return{ok:!1,error:se};s=`+90${n}`}const i=s.slice(1);return{ok:!0,e164:s,national:s.startsWith("+90")?s.slice(3):i,whatsapp:i}}function $a(e){const a=Ce(e);if(!a.ok)return e.trim();if(a.e164.startsWith("+90")&&a.national.length===10){const t=a.national.slice(0,3),s=a.national.slice(3,6),i=a.national.slice(6,8),n=a.national.slice(8,10);return`+90 ${t} ${s} ${i} ${n}`}return a.e164}function Oa(e){if(!e||!/^[+\d\s()./-]+$/.test(e))return"";const a=e.replace(/[\s()./-]/g,"");return a.startsWith("00")?`+${a.slice(2)}`:a}function Ca(e){return e.startsWith("90")&&e.length===12?e.slice(2):e.startsWith("0")&&e.length===11?e.slice(1):e.length===10?e:null}const x="#yardimci-asistan-widget",Ie="yardimci-asistan-direct-request-style",re=new WeakMap;let qe=!1,oe=!1,k={businessName:"Yardımcı Asistan",whatsappPhone:"",apiBaseUrl:""};function Ia(){if(qe)return;qe=!0,k={...k,...Da()},Ra(),Le(),queueMicrotask(Le),document.addEventListener("submit",qa,!0);const e=document.querySelector(x);e&&(ze(e),de(e))}function Le(){const e=window.YardimciAsistanWidget;if(!e||typeof e.init!="function"||e.__directRequestInitWrapped===!0)return;const a=e.init.bind(e);e.init=(t={})=>{k={...k,...Ne(t)},a(t);const s=document.querySelector(x);s&&(ze(s),queueMicrotask(()=>de(s)))},e.__directRequestInitWrapped=!0}function ze(e){if(e.dataset.yaDirectRequestObserved==="1")return;e.dataset.yaDirectRequestObserved="1",new MutationObserver(()=>de(e)).observe(e,{childList:!0,subtree:!0})}function de(e){const a=e.querySelector(".ya-widget-form[data-ya-form]");if(!a)return;const t=a.querySelector('button[type="submit"]');t&&t.dataset.yaDirectRequestButton!=="1"&&(t.dataset.yaDirectRequestButton="1",t.innerHTML=`${Be()}<span>Talebi Gönder</span>`)}function qa(e){const a=e.target instanceof HTMLFormElement?e.target:null;a?.matches(".ya-widget-form[data-ya-form]")&&(e.preventDefault(),e.stopImmediatePropagation(),oe||La(a))}async function La(e){const a=new FormData(e),t=String(a.get("customer_phone")??"").trim(),s=ne(t);if(!s.ok){R(s.error),e.querySelector('input[name="customer_phone"]')?.focus();return}const i=String(a.get("request_type")??"pension_reservation");if(i!=="pension_reservation"&&i!=="restaurant_reservation"){R("Talep türü geçerli değil. Lütfen yeniden deneyin.");return}const n={request_type:i,customer_name:String(a.get("customer_name")??"").trim(),customer_phone:t,date_text:String(a.get("date_text")??"").trim(),start_date:String(a.get("start_date")??"").trim(),end_date:String(a.get("end_date")??"").trim(),time:String(a.get("time")??"").trim(),guest_count:Number(a.get("guest_count")??1),message:za(String(a.get("message")??"").trim(),String(a.get("context_resource_type")??"").trim(),String(a.get("context_resource_name")??"").trim()),source:"web_form",whatsapp_message:"",context:{resourceType:String(a.get("context_resource_type")??"").trim(),resourceId:String(a.get("context_resource_id")??"").trim(),resourceName:String(a.get("context_resource_name")??"").trim(),sourcePath:String(a.get("context_source_path")??"").trim()}},d=Ma(n);if(!n.customer_name||d||!Number.isFinite(n.guest_count)||n.guest_count<1){R(d||"Lütfen gerekli alanları kontrol edin.");return}if(n.whatsapp_message=Oe({...n,time_text:n.time},k.businessName||"İşletme"),!k.apiBaseUrl.trim()){R("Web talep bağlantısı bu sitede etkin değil. İsterseniz WhatsApp üzerinden yazabilirsiniz."),Me(e,n.whatsapp_message);return}const p=JSON.stringify({...n,customer_phone:s.e164,whatsapp_message:""}),c=re.get(e),u=c?.intent===p?c.key:Array.from(crypto.getRandomValues(new Uint8Array(16)),g=>g.toString(16).padStart(2,"0")).join("");re.set(e,{intent:p,key:u}),n.idempotency_key=u,oe=!0,Re(),De(e,!0);try{const g=await fetch(`${k.apiBaseUrl.trim().replace(/\/$/,"")}/api/request.php`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)}),m=await g.json().catch(()=>null);if(!g.ok||m?.ok!==!0||!m.request_id)throw new Error(m?.message||"Talep işletmeye iletilemedi.");re.delete(e),Re(),Pa(e,m.whatsapp_message||n.whatsapp_message)}catch(g){const m=g instanceof Error&&g.message&&g.message!=="Failed to fetch"?g.message:"Talep işletmeye iletilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.";R(m),Me(e,n.whatsapp_message),De(e,!1)}finally{oe=!1}}function za(e,a,t){return t?[`${a==="room"?"İlgili oda":a==="table"?"İlgili masa":a==="product"?"İlgili ürün":"İlgili kayıt"}: ${t}`,e].filter(Boolean).join(`
`):e}function Ma(e){return e.request_type==="pension_reservation"?!e.start_date||!e.end_date?"Lütfen giriş ve çıkış tarihlerini seçin.":e.end_date<=e.start_date?"Çıkış tarihi giriş tarihinden sonra olmalı.":"":e.start_date?e.time?"":"Lütfen rezervasyon saatini seçin.":"Lütfen rezervasyon tarihini seçin."}function Pa(e,a){const t=e.closest(".ya-widget-subview"),s=t?.querySelector(".ya-widget-subview-intro"),i=s?.querySelector("h2"),n=s?.querySelector("p");i&&(i.textContent="Talebiniz işletmeye iletildi"),n&&(n.textContent="İşletme talebinizi inceleyip sizinle iletişime geçecek.");const d=document.createElement("div");d.className="ya-widget-request-success";const p=document.createElement("div");p.className="ya-widget-request-success-card",p.innerHTML=`${Fe()}<div><strong>Talebiniz kaydedildi.</strong></div>`,d.appendChild(p);const c=document.createElement("div");if(c.className="ya-widget-request-success-actions",Pe()){const g=document.createElement("button");g.type="button",g.className="ya-widget-secondary-action",g.dataset.yaRequestWhatsapp="1",g.innerHTML=`${Ue()}<span>WhatsApp'tan da yaz</span>`,g.addEventListener("click",()=>{const m=ie(k.whatsappPhone,a);m&&window.open(m,"_blank","noopener,noreferrer")}),c.appendChild(g)}const u=document.createElement("button");u.type="button",u.className="ya-widget-primary-action",u.dataset.yaRequestDone="1",u.innerHTML=`${Fe()}<span>Tamam</span>`,u.addEventListener("click",()=>{t?.querySelector('[data-ya-view="home"]')?.click()}),c.appendChild(u),d.appendChild(c),e.replaceWith(d)}function Me(e,a){if(!Pe()||e.querySelector("[data-ya-request-fallback]"))return;const t=document.createElement("button");t.type="button",t.className="ya-widget-secondary-action ya-widget-request-fallback",t.dataset.yaRequestFallback="1",t.innerHTML=`${Ue()}<span>WhatsApp'tan Yaz</span>`,t.addEventListener("click",()=>{const s=ie(k.whatsappPhone,a);s&&window.open(s,"_blank","noopener,noreferrer")}),e.querySelector('button[type="submit"]')?.insertAdjacentElement("afterend",t)}function Pe(){return document.querySelector(x)?.dataset.yaWhatsappEnabled!=="0"&&k.whatsappPhone.trim()!==""}function De(e,a){const t=e.querySelector('button[type="submit"]');t&&(t.disabled=a,t.classList.toggle("is-loading",a),t.innerHTML=a?'<span class="ya-widget-spinner" aria-hidden="true"></span><span>Talep gönderiliyor…</span>':`${Be()}<span>Talebi Gönder</span>`)}function R(e){const a=document.querySelector(`${x} [data-ya-status]`),t=a?.querySelector("[data-ya-status-text]");!a||!t||(t.textContent=e,a.hidden=!1)}function Re(){const e=document.querySelector(`${x} [data-ya-status]`),a=e?.querySelector("[data-ya-status-text]");!e||!a||(a.textContent="",e.hidden=!0)}function Da(){const e=Array.from(document.scripts).reverse(),a=document.currentScript??e.find(t=>t.dataset.apiBaseUrl!==void 0||/widget(?:-core)?\.js(?:$|\?)/.test(t.src));return Ne({businessName:a?.dataset.businessName,whatsappPhone:a?.dataset.whatsappPhone,apiBaseUrl:a?.dataset.apiBaseUrl})}function Ne(e){const a={};return typeof e.businessName=="string"&&e.businessName.trim()&&(a.businessName=e.businessName),typeof e.whatsappPhone=="string"&&e.whatsappPhone.trim()&&(a.whatsappPhone=e.whatsappPhone),typeof e.apiBaseUrl=="string"&&e.apiBaseUrl.trim()&&(a.apiBaseUrl=e.apiBaseUrl),a}function Ra(){if(document.getElementById(Ie))return;const e=document.createElement("style");e.id=Ie,e.textContent=`
    ${x} .ya-widget-request-success { display: grid; gap: 12px; }
    ${x} .ya-widget-request-success-card {
      display: flex; align-items: flex-start; gap: 10px; padding: 13px;
      border: 1px solid rgba(47,111,94,.2); border-radius: 15px; background: #edf5ec;
    }
    ${x} .ya-widget-request-success-card > .ya-widget-icon { color: #2F6F5E; }
    ${x} .ya-widget-request-success-card div { display: grid; gap: 3px; }
    ${x} .ya-widget-request-success-card strong { color: #172033; font-size: 13px; }
    ${x} .ya-widget-request-success-actions { display: grid; gap: 8px; }
    ${x} .ya-widget-request-fallback { margin-top: -4px; }
  `,document.head.appendChild(e)}function ce(e){return`<svg class="ya-widget-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${e}</svg>`}function Be(){return ce('<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>')}function Ue(){return ce('<path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5Z"/><path d="M9 8.7c.5 2.5 2 4 4.5 4.8l1-1"/>')}function Fe(){return ce('<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>')}function Na(e,a){return`
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
    .ya-widget-launcher-avatar { display: grid; width: 48px; height: 48px; flex: 0 0 auto; place-items: center; }
    .ya-widget-launcher-copy { display: grid; min-width: 0; text-align: left; }
    .ya-widget-launcher-copy strong { font-size: 14px; }
    .ya-widget-launcher-copy small { color: #5e7384; font-size: 11px; }
    .ya-widget-nexa { display: block; width: 100%; height: 100%; object-fit: contain; }
    .ya-widget-nexa-welcome { display: block; width: 112px; height: 112px; flex: 0 0 auto; }
    .ya-widget-business-mark { display: inline-flex; vertical-align: middle; margin-right: 6px; }
    .ya-widget-business-mark .ya-widget-mark { width: 20px; height: 20px; border-radius: 4px; }
    .ya-widget-business-mark .ya-widget-mark-fallback { font-size: 8px; }
    .ya-widget-nexa.is-nexa-changing { animation: ya-nexa-state-in 180ms ease-out both; }
    #${e}[data-nexa-motion-active="true"] [data-nexa-role="header"] { animation: ya-nexa-state-in 180ms ease-out both; }
    #${e}[data-nexa-motion-active="false"] .ya-widget-nexa { animation: none; }
    @keyframes ya-nexa-state-in { from { opacity: .65; transform: translateY(1px); } to { opacity: 1; transform: translateY(0); } }
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
      color: ${a.primaryColor};
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
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 64px;
      padding: 14px;
      overflow: hidden;
      color: #ffffff;
      background: linear-gradient(135deg, ${a.primaryColor}, #18564e 56%, #123d3a);
      isolation: isolate;
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

    .ya-widget-avatar { display: grid; width: 32px; height: 32px; flex: 0 0 auto; place-items: center; }

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
      color: ${a.primaryColor};
      background: #ffffff;
      box-shadow: inset 0 0 0 1px rgba(47, 111, 94, 0.15), 0 5px 14px rgba(23, 32, 51, 0.06);
    }

    .ya-widget-kicker {
      color: ${a.primaryColor};
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
      color: ${a.primaryColor};
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
      color: ${a.primaryColor};
      background: #ffffff;
      box-shadow: inset 0 0 0 1px rgba(47, 111, 94, 0.14);
    }

    .ya-widget-context-card > div,
    .ya-widget-location-card > div { display: grid; min-width: 0; gap: 2px; }

    .ya-widget-context-card small {
      color: ${a.primaryColor};
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
      color: ${a.primaryColor};
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
      color: ${a.primaryColor};
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
      color: ${a.primaryColor};
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
      background: ${a.primaryColor};
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
      color: ${a.primaryColor};
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
      color: ${a.primaryColor};
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
      background: ${a.primaryColor};
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
      color: ${a.primaryColor};
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
      background: linear-gradient(135deg, ${a.primaryColor}, #1b5a50);
      box-shadow: 0 9px 22px rgba(47, 111, 94, 0.2);
    }

    .ya-widget-secondary-action {
      border: 1px solid rgba(47, 111, 94, 0.24);
      color: ${a.primaryColor};
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
      color: ${a.primaryColor};
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
      color: ${a.primaryColor};
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

      .ya-widget-nexa.is-nexa-changing,
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
    }
  `}const r={CUSTOMERS:"core.customers",REQUESTS:"customer.requests",TASKS:"core.tasks",CALENDAR:"core.calendar",NOTIFICATIONS:"core.notifications",FINANCE:"core.finance",REPORTS:"core.reports",WEB:"core.web",SYNC:"core.sync",BACKUPS:"core.backups",DEVICES:"core.devices",MARKETING_STUDIO:"marketing.studio",MESSAGING_CAMPAIGNS:"messaging.campaigns",ACCOMMODATION_ROOMS:"accommodation.rooms",ACCOMMODATION_RESERVATIONS:"accommodation.reservations",ACCOMMODATION_STAYS:"accommodation.stays",ACCOMMODATION_FOLIO:"accommodation.folio",FOOD_TABLES:"food_service.tables",FOOD_RESERVATIONS:"food_service.reservations",FOOD_ORDERS:"food_service.orders",FOOD_MENU:"food_service.menu",QR_MENU:"channel.qr_menu",CATALOG:"commerce.catalog",INVENTORY:"commerce.inventory",SALES:"commerce.sales",ORDERS:"commerce.orders",ONLINE_SALES:"channel.online_sales",WHOLESALE:"commerce.wholesale",CUSTOMER_CREDIT:"commerce.customer_credit",RETAIL_BARCODE:"retail.barcode",RETAIL_PURCHASING:"retail.purchasing",RETAIL_SUPPLIERS:"retail.suppliers",RETAIL_LABELS:"retail.labels"},Ba={[r.REQUESTS]:[r.CUSTOMERS],[r.MESSAGING_CAMPAIGNS]:[r.CUSTOMERS],[r.ACCOMMODATION_RESERVATIONS]:[r.ACCOMMODATION_ROOMS],[r.ACCOMMODATION_STAYS]:[r.ACCOMMODATION_ROOMS],[r.ACCOMMODATION_FOLIO]:[r.ACCOMMODATION_ROOMS,r.ACCOMMODATION_STAYS,r.FINANCE],[r.FOOD_RESERVATIONS]:[r.FOOD_TABLES],[r.FOOD_ORDERS]:[r.FOOD_TABLES,r.FOOD_MENU],[r.QR_MENU]:[r.FOOD_MENU],[r.INVENTORY]:[r.CATALOG],[r.SALES]:[r.CATALOG],[r.ORDERS]:[r.CATALOG],[r.ONLINE_SALES]:[r.ORDERS],[r.WHOLESALE]:[r.CUSTOMERS,r.ORDERS],[r.CUSTOMER_CREDIT]:[r.CUSTOMERS,r.SALES,r.FINANCE],[r.RETAIL_BARCODE]:[r.CATALOG],[r.RETAIL_PURCHASING]:[r.CATALOG,r.INVENTORY],[r.RETAIL_LABELS]:[r.CATALOG]},Ua=[r.CUSTOMERS,r.TASKS,r.CALENDAR,r.NOTIFICATIONS,r.FINANCE,r.REPORTS,r.WEB,r.SYNC,r.BACKUPS,r.DEVICES],Y=[r.REQUESTS,r.MESSAGING_CAMPAIGNS,r.MARKETING_STUDIO],le=[r.REQUESTS],Ye=[r.ACCOMMODATION_ROOMS,r.ACCOMMODATION_STAYS,r.ACCOMMODATION_FOLIO],We=[r.ACCOMMODATION_RESERVATIONS],je=[r.ACCOMMODATION_RESERVATIONS],Ge=[r.FOOD_TABLES,r.FOOD_ORDERS,r.FOOD_MENU,r.CATALOG,r.SALES],He=[r.FOOD_RESERVATIONS,r.QR_MENU,r.INVENTORY],Ke=[r.FOOD_RESERVATIONS,r.QR_MENU,r.INVENTORY],Fa=[r.CATALOG,r.INVENTORY,r.SALES,r.RETAIL_BARCODE],Ya=[r.RETAIL_PURCHASING,r.RETAIL_SUPPLIERS,r.RETAIL_LABELS,r.CUSTOMER_CREDIT,r.WHOLESALE,r.ONLINE_SALES],Wa=[r.RETAIL_PURCHASING,r.RETAIL_SUPPLIERS];function _(...e){return[...new Set(e.flat())]}function W(e,a,t,s,i,n){const d=new Set(i),p=n.filter(c=>d.has(c));return{id:e,label:a,description:t,requiredCapabilities:[...s],optionalCapabilities:[...i],defaultOptionalCapabilities:[...p],defaultCapabilities:Ga(_(Ua,s,p))}}function ja(e){return Ba[e]??[]}function Ga(e){const a=new Set(e),t=[...a];for(;t.length>0;){const s=t.pop();if(s)for(const i of ja(s))a.has(i)||(a.add(i),t.push(i))}return[...a]}W("pension_restaurant","Pansiyon + Restoran/Kafe","Konaklama ve yiyecek-içecek operasyonları aynı işletme omurgasında çalışır.",_(Ye,Ge),_(Y,We,He),_(le,je,Ke)),W("pension","Pansiyon","Konaklama, müşteri, finans, web ve saha operasyonları için hazır profil.",Ye,_(Y,We),_(le,je)),W("restaurant","Restoran / Kafe","Masa, sipariş, menü, stok, satış ve saha operasyonları için hazır profil.",Ge,_(Y,He),_(le,Ke)),W("market","Market / Perakende / Toptan","Ürün, barkod, stok, hızlı satış, tedarikçi, etiket ve opsiyonel bayi/toptan operasyonları için hazır profil.",Fa,_(Y,Ya),Wa);const Ha=[{id:"facebook",label:"Facebook",hosts:["facebook.com","fb.com"]},{id:"instagram",label:"Instagram",hosts:["instagram.com"]},{id:"youtube",label:"YouTube",hosts:["youtube.com","youtu.be"]},{id:"tiktok",label:"TikTok",hosts:["tiktok.com"]},{id:"x",label:"X",hosts:["x.com","twitter.com"]}];new Set(Ha.map(e=>e.id));const Ve=[{id:"wifi",label:"Wi-Fi",group:"connectivity"},{id:"parking",label:"Otopark",group:"transport"},{id:"pet_friendly",label:"Evcil hayvan kabul edilir",group:"policy"},{id:"family_friendly",label:"Çocuklu ailelere uygun",group:"policy"},{id:"wheelchair_access",label:"Tekerlekli sandalye erişimine uygun",group:"accessibility"},{id:"step_free_access",label:"Basamaksız erişim",group:"accessibility"},{id:"garden",label:"Bahçe",group:"outdoor"},{id:"terrace",label:"Teras",group:"outdoor"},{id:"luggage_storage",label:"Bagaj emaneti",group:"service"},{id:"airport_transfer",label:"Havalimanı transferi",group:"transport"}];new Set(Ve.map(e=>e.id)),new Map(Ve.map(e=>[e.id,e.label]));const Qe=[{id:"air_conditioning",label:"Klima",group:"comfort"},{id:"wifi",label:"Wi-Fi",group:"connectivity"},{id:"private_bathroom",label:"Özel banyo",group:"bathroom"},{id:"balcony",label:"Balkon",group:"outdoor"},{id:"terrace",label:"Teras",group:"outdoor"},{id:"sea_view",label:"Deniz manzarası",group:"view"},{id:"garden_view",label:"Bahçe manzarası",group:"view"},{id:"mountain_view",label:"Dağ manzarası",group:"view"},{id:"tv",label:"TV",group:"comfort"},{id:"mini_fridge",label:"Mini buzdolabı",group:"comfort"},{id:"heating",label:"Isıtma",group:"comfort"},{id:"work_desk",label:"Çalışma masası",group:"comfort"},{id:"kitchenette",label:"Mini mutfak",group:"comfort"},{id:"step_free_access",label:"Basamaksız erişim",group:"accessibility"},{id:"wheelchair_friendly",label:"Tekerlekli sandalye erişimine uygun",group:"accessibility"},{id:"non_smoking",label:"Sigara içilmeyen oda",group:"policy"}];new Set(Qe.map(e=>e.id)),new Map(Qe.map(e=>[e.id,e.label]));const Ze=[{id:"indoor",label:"İç mekân",group:"location"},{id:"outdoor",label:"Açık alan",group:"location"},{id:"terrace",label:"Teras / veranda",group:"location"},{id:"window_side",label:"Cam kenarı",group:"location"},{id:"sea_view",label:"Deniz manzarası",group:"view"},{id:"garden_view",label:"Bahçe manzarası",group:"view"},{id:"quiet_area",label:"Sakin bölüm",group:"experience"},{id:"wheelchair_friendly",label:"Tekerlekli sandalye erişimine uygun",group:"accessibility"}],Ka=["unspecified","non_smoking","smoking_allowed","outdoor_only"];new Set(Ze.map(e=>e.id)),new Map(Ze.map(e=>[e.id,e.label])),new Set(Ka);function Va(e,a){const t=a.state&&(e.runtime.stateAliases[a.state]??a.state),s=e.assets.find(i=>i.usage===a.usage&&(a.width===void 0||i.dimensions.width===a.width)&&(t===void 0||i.state===t)&&(a.theme===void 0||i.theme===a.theme));if(!s)throw new Error(`Nexa asset missing: ${JSON.stringify(a)}`);return s}function Qa(e){let a="ready",t=0,s="cancel",i,n=!1;const d=new Set,p=new Set;function c(){i!==void 0&&(e.cancel(i),i=void 0)}function u(m){if(a!==m){a=m;for(const A of p)A()}}function g(m){if(c(),m==="error"){u("concerned");return}if(!n||m==="cancel"){u("ready");return}u(m==="success"?"pleased":"speaking"),i=e.schedule(()=>{i=void 0,u("ready")},m==="success"?900:700)}return{getState:()=>a,subscribe(m){return p.add(m),()=>{p.delete(m)}},setActive(m){n=m,n||(c(),(a==="speaking"||a==="pleased")&&u("ready"))},begin(){c();const m=++t;s="cancel",d.add(m),u("thinking");let A=!1;return y=>{A||(A=!0,d.delete(m)&&(m===t&&(s=y),d.size||g(s)))}},reset(){c(),d.clear(),t++,s="cancel",u("ready")}}}const Je={assets:JSON.parse('[{"id":"master.nexa-ready-512","state":"ready","usage":"master","dimensions":{"width":512,"height":512},"assetPath":"assets/nexa/master/nexa-ready-512.png","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/png","bytes":182850,"sha256":"6ee4f84534e134cf6fc311f3170e3f21d44354c1b874ed95696e0f44dcd7f724","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"master.nexa-optical-512","state":"ready","usage":"optical-master","dimensions":{"width":512,"height":512},"assetPath":"assets/nexa/master/nexa-optical-512.png","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/png","bytes":153559,"sha256":"a9155d49612714c3dc4c679eae86c453416cf587e7d4eaca914a812d3a0c5dae","source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"states.nexa-sleep-512","state":"sleep","usage":"state","dimensions":{"width":512,"height":512},"assetPath":"assets/nexa/states/nexa-sleep-512.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":123104,"sha256":"ed617e1d97059abf06a16c5f0cfd83fa06bf37bbc454b18086d6fdbe05ecb62e","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-sleep-expression.png"}},{"id":"states.nexa-sleep-256","state":"sleep","usage":"state","dimensions":{"width":256,"height":256},"assetPath":"assets/nexa/states/nexa-sleep-256.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":37600,"sha256":"9fbdae465719965ee8e2843a856309ac1f05b681647787c4264edbccea27a527","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-sleep-expression.png"}},{"id":"states.nexa-sleep-128","state":"sleep","usage":"state","dimensions":{"width":128,"height":128},"assetPath":"assets/nexa/states/nexa-sleep-128.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":14310,"sha256":"ebf69a9d3c6cb19e5094b85036689cdf6aa7de86a0884b0cb318497f57d01239","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-sleep-expression.png"}},{"id":"states.nexa-sleep-96","state":"sleep","usage":"state","dimensions":{"width":96,"height":96},"assetPath":"assets/nexa/states/nexa-sleep-96.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":9112,"sha256":"621c40cd2b6a5f9c8ad224c736d456597e7d6e867aa9c34245264d7e9a7931f7","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-sleep-expression.png"}},{"id":"states.nexa-sleep-64","state":"sleep","usage":"state","dimensions":{"width":64,"height":64},"assetPath":"assets/nexa/states/nexa-sleep-64.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":5092,"sha256":"a594bf7e5944c282c7b36be4f3d71ffbf1c5c70b2bce29c7fab71e2fb55b42a5","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-sleep-expression.png"}},{"id":"states.nexa-sleep-48","state":"sleep","usage":"state","dimensions":{"width":48,"height":48},"assetPath":"assets/nexa/states/nexa-sleep-48.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":3054,"sha256":"e3b3f79d840effad774ab0145589a35494b05b474d8fe3ab0ee1a226ecb222ba","source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-sleep-expression.png"}},{"id":"states.nexa-sleep-32","state":"sleep","usage":"state","dimensions":{"width":32,"height":32},"assetPath":"assets/nexa/states/nexa-sleep-32.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":1840,"sha256":"2d892998bb2f5651a93f673c5c3704f22d53611193da3b3701b8642340a7c68f","source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-sleep-expression.png"}},{"id":"states.nexa-ready-512","state":"ready","usage":"state","dimensions":{"width":512,"height":512},"assetPath":"assets/nexa/states/nexa-ready-512.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":124244,"sha256":"5db60cd69c0478808ec22c3fbfcf59660d5f225db975e05aa6ef76f44059f9e0","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"states.nexa-ready-256","state":"ready","usage":"state","dimensions":{"width":256,"height":256},"assetPath":"assets/nexa/states/nexa-ready-256.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":38084,"sha256":"c8f4bd7222065c359b040afcd3adcf08162d7e1b417dfc0851d9d23f193e3f89","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"states.nexa-ready-128","state":"ready","usage":"state","dimensions":{"width":128,"height":128},"assetPath":"assets/nexa/states/nexa-ready-128.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":14470,"sha256":"96a14c90617dc9dd8527d498698657a830a51b761989bb663c170815ae5d5a25","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"states.nexa-ready-96","state":"ready","usage":"state","dimensions":{"width":96,"height":96},"assetPath":"assets/nexa/states/nexa-ready-96.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":9202,"sha256":"91d19941bbc1f844b296b288069a2719e6c19d8d7ecfc932fd72925788081c7c","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"states.nexa-ready-64","state":"ready","usage":"state","dimensions":{"width":64,"height":64},"assetPath":"assets/nexa/states/nexa-ready-64.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":5148,"sha256":"4904b78fdba27ef56c526a17e9570439e235ece751fabd6790a62b15fd108d72","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"states.nexa-ready-48","state":"ready","usage":"state","dimensions":{"width":48,"height":48},"assetPath":"assets/nexa/states/nexa-ready-48.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":3128,"sha256":"3ece597954adb08cafd95a9db46f8ce99bf3298f9c4c59ed2928658aa9cbd014","source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"states.nexa-ready-32","state":"ready","usage":"state","dimensions":{"width":32,"height":32},"assetPath":"assets/nexa/states/nexa-ready-32.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":1874,"sha256":"9cdecfa7336d9fdfcd704ef1bbc07d105c89aacfde8a7e9de2159fa6f2652014","source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"states.nexa-listening-512","state":"listening","usage":"state","dimensions":{"width":512,"height":512},"assetPath":"assets/nexa/states/nexa-listening-512.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":124206,"sha256":"fe06476a36dadcece221b1612289419f038c25cdd6f6f3546933a1c450ed0bca","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-listening-expression.png"}},{"id":"states.nexa-listening-256","state":"listening","usage":"state","dimensions":{"width":256,"height":256},"assetPath":"assets/nexa/states/nexa-listening-256.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":38100,"sha256":"7143f8d8e6972c251b3cfe4491af1368d15ff62b201952a36927e4339af7423a","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-listening-expression.png"}},{"id":"states.nexa-listening-128","state":"listening","usage":"state","dimensions":{"width":128,"height":128},"assetPath":"assets/nexa/states/nexa-listening-128.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":14570,"sha256":"6076c5646044e14b70f4df191c3112037a53d2dae585de0515e40f87ec627e08","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-listening-expression.png"}},{"id":"states.nexa-listening-96","state":"listening","usage":"state","dimensions":{"width":96,"height":96},"assetPath":"assets/nexa/states/nexa-listening-96.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":9274,"sha256":"6a1a508295dddc3303535d1a3f38f55505b9ef541a39a83627b40452b0c61db7","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-listening-expression.png"}},{"id":"states.nexa-listening-64","state":"listening","usage":"state","dimensions":{"width":64,"height":64},"assetPath":"assets/nexa/states/nexa-listening-64.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":5174,"sha256":"1570bcf5f3869ed3cc18e5f818cccf6dee0da56e6e6e8ea371d8ae4cfd63dc2f","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-listening-expression.png"}},{"id":"states.nexa-listening-48","state":"listening","usage":"state","dimensions":{"width":48,"height":48},"assetPath":"assets/nexa/states/nexa-listening-48.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":3120,"sha256":"37e0f6e4d1e3085a74c77fb5b920875e2dbc722a8bb6ac64510945b372ec8ad2","source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-listening-expression.png"}},{"id":"states.nexa-listening-32","state":"listening","usage":"state","dimensions":{"width":32,"height":32},"assetPath":"assets/nexa/states/nexa-listening-32.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":1866,"sha256":"cbecb57b37ad0c80b996d15452fc1cfd942f7bfd910072c3ef02c00dcabb2dc4","source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-listening-expression.png"}},{"id":"states.nexa-thinking-512","state":"thinking","usage":"state","dimensions":{"width":512,"height":512},"assetPath":"assets/nexa/states/nexa-thinking-512.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":124118,"sha256":"34fc6b9d86a3fd9c39ff6cab03a7e50a3903a32eef30a3cadda01bf9b6f7789e","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-thinking-expression.png"}},{"id":"states.nexa-thinking-256","state":"thinking","usage":"state","dimensions":{"width":256,"height":256},"assetPath":"assets/nexa/states/nexa-thinking-256.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":38136,"sha256":"e619f121b336b2cc6f6fd8c49575d518ec5f8eec242ce8ebc0db4ee0afd0ec49","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-thinking-expression.png"}},{"id":"states.nexa-thinking-128","state":"thinking","usage":"state","dimensions":{"width":128,"height":128},"assetPath":"assets/nexa/states/nexa-thinking-128.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":14518,"sha256":"da3e3fe6773bccbd0a87b9bef747e9716a2fa830e39635d352c633ec47ca1583","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-thinking-expression.png"}},{"id":"states.nexa-thinking-96","state":"thinking","usage":"state","dimensions":{"width":96,"height":96},"assetPath":"assets/nexa/states/nexa-thinking-96.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":9242,"sha256":"c3a5acd2fb5ef7ab5a854b1c5f81c34dfb63491e0934cca5e142da0a89844076","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-thinking-expression.png"}},{"id":"states.nexa-thinking-64","state":"thinking","usage":"state","dimensions":{"width":64,"height":64},"assetPath":"assets/nexa/states/nexa-thinking-64.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":5164,"sha256":"e75cfa7efd7b9b9cea157c4da8fae73b780d96deaadd84992888c0c06b1b12a7","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-thinking-expression.png"}},{"id":"states.nexa-thinking-48","state":"thinking","usage":"state","dimensions":{"width":48,"height":48},"assetPath":"assets/nexa/states/nexa-thinking-48.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":3074,"sha256":"a6a9e54f76a106d705cb2bbb51615c719c308b1f9b57fafa2724d1fab2a63f9f","source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-thinking-expression.png"}},{"id":"states.nexa-thinking-32","state":"thinking","usage":"state","dimensions":{"width":32,"height":32},"assetPath":"assets/nexa/states/nexa-thinking-32.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":1866,"sha256":"fb39bea7021be1c45d75ce46a3d641bb25b5ec4aec375c119cca43eb3a63a0cd","source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-thinking-expression.png"}},{"id":"states.nexa-speaking-512","state":"speaking","usage":"state","dimensions":{"width":512,"height":512},"assetPath":"assets/nexa/states/nexa-speaking-512.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":124414,"sha256":"5502d6840142fea2b02f032d187d7f6bb7d8aa477130868e02c756ee347c05e6","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-speaking-expression.png"}},{"id":"states.nexa-speaking-256","state":"speaking","usage":"state","dimensions":{"width":256,"height":256},"assetPath":"assets/nexa/states/nexa-speaking-256.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":38300,"sha256":"ed84bd8cea354af587169326305ed521c818049ea893317073111dccaa8ad50e","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-speaking-expression.png"}},{"id":"states.nexa-speaking-128","state":"speaking","usage":"state","dimensions":{"width":128,"height":128},"assetPath":"assets/nexa/states/nexa-speaking-128.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":14584,"sha256":"09770add79a1cb9b96f1cd17a64fe1dbec0b37a3e0d9aaed91f9f67bdaa13d83","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-speaking-expression.png"}},{"id":"states.nexa-speaking-96","state":"speaking","usage":"state","dimensions":{"width":96,"height":96},"assetPath":"assets/nexa/states/nexa-speaking-96.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":9352,"sha256":"0be48d62c1c09a4853cf794ab97f960e3e3d0431f18c0d064e48a090584ec99f","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-speaking-expression.png"}},{"id":"states.nexa-speaking-64","state":"speaking","usage":"state","dimensions":{"width":64,"height":64},"assetPath":"assets/nexa/states/nexa-speaking-64.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":5190,"sha256":"bf2715144b02b7ba4e255eb35381d26043511e9ef339597eebd58f328dd8fd68","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-speaking-expression.png"}},{"id":"states.nexa-speaking-48","state":"speaking","usage":"state","dimensions":{"width":48,"height":48},"assetPath":"assets/nexa/states/nexa-speaking-48.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":3104,"sha256":"9becd9f6dd3e2b4d9890509e2c2eb771a4ce8aa979527a327bae220b841c08df","source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-speaking-expression.png"}},{"id":"states.nexa-speaking-32","state":"speaking","usage":"state","dimensions":{"width":32,"height":32},"assetPath":"assets/nexa/states/nexa-speaking-32.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":1874,"sha256":"998477a58fb1ff12477975bc38a5a627ab81e9a165869125af395d7b7971d389","source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-speaking-expression.png"}},{"id":"states.nexa-success-512","state":"success","usage":"state","dimensions":{"width":512,"height":512},"assetPath":"assets/nexa/states/nexa-success-512.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":124328,"sha256":"b124543ad87ce5d0c59f20d6ead57d09ca11aa87601aac35ad160e57be38ab54","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-success-expression.png"}},{"id":"states.nexa-success-256","state":"success","usage":"state","dimensions":{"width":256,"height":256},"assetPath":"assets/nexa/states/nexa-success-256.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":38078,"sha256":"c29a7545577a6d5f334e1c978a54f61d04a8ecad1321adcf807125de94bcaf97","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-success-expression.png"}},{"id":"states.nexa-success-128","state":"success","usage":"state","dimensions":{"width":128,"height":128},"assetPath":"assets/nexa/states/nexa-success-128.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":14524,"sha256":"a99bebe6dd53c28a3242d11138b774aef5bbf9727ac3bb5efa369a8dfd0eb3e7","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-success-expression.png"}},{"id":"states.nexa-success-96","state":"success","usage":"state","dimensions":{"width":96,"height":96},"assetPath":"assets/nexa/states/nexa-success-96.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":9236,"sha256":"7fb8a120d30f4bd19b9f881c09652201e69d0146cafdd8b7f5c337a501acbcd5","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-success-expression.png"}},{"id":"states.nexa-success-64","state":"success","usage":"state","dimensions":{"width":64,"height":64},"assetPath":"assets/nexa/states/nexa-success-64.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":5158,"sha256":"46a40c63c2bd110d2eae84c2c9aaa19978db3093b021f23648d1f1a36878a150","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-success-expression.png"}},{"id":"states.nexa-success-48","state":"success","usage":"state","dimensions":{"width":48,"height":48},"assetPath":"assets/nexa/states/nexa-success-48.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":3068,"sha256":"4d417672752a489386604a630eb98e848fb1d71d6373516c8f753ebaf0564e6b","source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-success-expression.png"}},{"id":"states.nexa-success-32","state":"success","usage":"state","dimensions":{"width":32,"height":32},"assetPath":"assets/nexa/states/nexa-success-32.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":1868,"sha256":"60d9c7cf797ca9af341ef9f26e937b70e3a65cf106771c0e0c9f398bc89d6a6a","source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-success-expression.png"}},{"id":"states.nexa-warning-512","state":"warning","usage":"state","dimensions":{"width":512,"height":512},"assetPath":"assets/nexa/states/nexa-warning-512.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":124034,"sha256":"b29ea8b23fc90736c503aec043474ed6636fafa67961da98861d1bdec283f763","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-warning-expression.png"}},{"id":"states.nexa-warning-256","state":"warning","usage":"state","dimensions":{"width":256,"height":256},"assetPath":"assets/nexa/states/nexa-warning-256.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":38028,"sha256":"f9773fe7a439e1b19984a7b53043729ee65faac9e16ddb8d0d5d86d3bc4e087a","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-warning-expression.png"}},{"id":"states.nexa-warning-128","state":"warning","usage":"state","dimensions":{"width":128,"height":128},"assetPath":"assets/nexa/states/nexa-warning-128.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":14484,"sha256":"d85a6d9087938fff667d89ef0f2d52ff5d2cc77a9cfa432cc6f75f6bf644ff71","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-warning-expression.png"}},{"id":"states.nexa-warning-96","state":"warning","usage":"state","dimensions":{"width":96,"height":96},"assetPath":"assets/nexa/states/nexa-warning-96.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":9230,"sha256":"70f5a9020967183796dcfc9a3d38dd3fe899fb83e83df019c8ccaf6f495456b2","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-warning-expression.png"}},{"id":"states.nexa-warning-64","state":"warning","usage":"state","dimensions":{"width":64,"height":64},"assetPath":"assets/nexa/states/nexa-warning-64.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":5118,"sha256":"65a9c940e498b4a432dcdd35439924cdfdd70dfdf93f4e4fcfeb5cd400e64012","source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-warning-expression.png"}},{"id":"states.nexa-warning-48","state":"warning","usage":"state","dimensions":{"width":48,"height":48},"assetPath":"assets/nexa/states/nexa-warning-48.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":3082,"sha256":"0f44663e9efffd04c7abafa822105327b9f19d61cc3df4a52d8a7580220c7581","source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-warning-expression.png"}},{"id":"states.nexa-warning-32","state":"warning","usage":"state","dimensions":{"width":32,"height":32},"assetPath":"assets/nexa/states/nexa-warning-32.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":1870,"sha256":"60eaddba12e1ea4c53af4f0ca544b8f3073ff22110ffe662d6829e1a211debfe","source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-warning-expression.png"}},{"id":"desktop.nexa-desktop-wide","state":"ready","usage":"desktop-wide","dimensions":{"width":256,"height":256},"assetPath":"assets/nexa/states/nexa-ready-256.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":38084,"sha256":"c8f4bd7222065c359b040afcd3adcf08162d7e1b417dfc0851d9d23f193e3f89","recommendedDisplayDimensions":{"width":128,"height":128},"pixelRatio":2,"source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"desktop.nexa-desktop-compact","state":"ready","usage":"desktop-compact","dimensions":{"width":128,"height":128},"assetPath":"assets/nexa/desktop/nexa-desktop-compact.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":11444,"sha256":"590c7c0f4475271cd2e722573859ec4bdc8181e97b2e6cb2c7a2762b79aaea7c","recommendedDisplayDimensions":{"width":64,"height":64},"pixelRatio":2,"source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"desktop.nexa-desktop-micro","state":"ready","usage":"desktop-micro","dimensions":{"width":40,"height":40},"assetPath":"assets/nexa/desktop/nexa-desktop-micro.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":2560,"sha256":"a7675b5183bf19c4db4a46d53544b084b45857a0b7235a035d6c568d8c9872c9","recommendedDisplayDimensions":{"width":40,"height":40},"pixelRatio":1,"source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"web.nexa-web-launcher","state":"ready","usage":"web-launcher","dimensions":{"width":96,"height":96},"assetPath":"assets/nexa/web/nexa-web-launcher.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":7690,"sha256":"941d9cffd2fe6e3f5fcfc7b75a28943e10995c558f69b2499285e96f68d669c6","recommendedDisplayDimensions":{"width":48,"height":48},"pixelRatio":2,"source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"web.nexa-web-welcome","state":"ready","usage":"web-welcome","dimensions":{"width":256,"height":256},"assetPath":"assets/nexa/states/nexa-ready-256.webp","detail":"full","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":38084,"sha256":"c8f4bd7222065c359b040afcd3adcf08162d7e1b417dfc0851d9d23f193e3f89","recommendedDisplayDimensions":{"width":128,"height":128},"pixelRatio":2,"source":{"body":"assets/nexa/master/nexa-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"web.nexa-web-compact-header","state":"ready","usage":"web-compact-header","dimensions":{"width":64,"height":64},"assetPath":"assets/nexa/web/nexa-web-compact-header.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":4578,"sha256":"7a09913c80c5c24a303ff56d7224d89daf09c971290117827c5fd8e0abf60b82","recommendedDisplayDimensions":{"width":32,"height":32},"pixelRatio":2,"source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"web.nexa-web-thinking-header","state":"thinking","usage":"web-thinking-header","dimensions":{"width":64,"height":64},"assetPath":"assets/nexa/web/nexa-web-thinking-header.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":4518,"sha256":"7cc28fa304d87f26411de3a2442ddd1e878025ece77cd358e5d3cacf4e430611","recommendedDisplayDimensions":{"width":32,"height":32},"pixelRatio":2,"source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-thinking-expression.png"}},{"id":"web.nexa-web-speaking-header","state":"speaking","usage":"web-speaking-header","dimensions":{"width":64,"height":64},"assetPath":"assets/nexa/web/nexa-web-speaking-header.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":4502,"sha256":"4f430efa94d60e20f121e24d0604331691c6ced4dd1e24f65584bbf3f2780ef0","recommendedDisplayDimensions":{"width":32,"height":32},"pixelRatio":2,"source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-speaking-expression.png"}},{"id":"desktop.nexa-desktop-micro-36","state":"ready","usage":"desktop-micro","dimensions":{"width":36,"height":36},"assetPath":"assets/nexa/desktop/nexa-desktop-micro-36.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":2256,"sha256":"34cf2bf81cd388b6cf59f8dd12cbd0020cb13312d84cc0199da968467475653a","recommendedDisplayDimensions":{"width":36,"height":36},"pixelRatio":1,"source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"desktop.nexa-desktop-micro-44","state":"ready","usage":"desktop-micro","dimensions":{"width":44,"height":44},"assetPath":"assets/nexa/desktop/nexa-desktop-micro-44.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":2968,"sha256":"bb43de6be93f792d135ffbb5789f2a1c67a8432f74bf4c050e5b2a27bb442c3e","recommendedDisplayDimensions":{"width":44,"height":44},"pixelRatio":1,"source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"desktop.nexa-desktop-micro-72","state":"ready","usage":"desktop-micro","dimensions":{"width":72,"height":72},"assetPath":"assets/nexa/desktop/nexa-desktop-micro-72.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":5296,"sha256":"dfe06f69e67064f7384b679db867ba59a46375df6333e2ad79c5ddef2bc439d7","recommendedDisplayDimensions":{"width":36,"height":36},"pixelRatio":2,"source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"desktop.nexa-desktop-micro-80","state":"ready","usage":"desktop-micro","dimensions":{"width":80,"height":80},"assetPath":"assets/nexa/desktop/nexa-desktop-micro-80.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":6036,"sha256":"5c89e9eb2376331c9c7b71fb2a926e245f808369adf609b35a05cd9bd72025d9","recommendedDisplayDimensions":{"width":40,"height":40},"pixelRatio":2,"source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"desktop.nexa-desktop-micro-88","state":"ready","usage":"desktop-micro","dimensions":{"width":88,"height":88},"assetPath":"assets/nexa/desktop/nexa-desktop-micro-88.webp","detail":"optical","theme":"independent","static":true,"motionSafe":true,"animated":false,"format":"image/webp","bytes":6792,"sha256":"8d22f8447f6c19e17ae94f757ee91633049386f61e67e0337aefd3e6980d47d5","recommendedDisplayDimensions":{"width":44,"height":44},"pixelRatio":2,"source":{"body":"assets/nexa/master/nexa-optical-body-source-1254.png","expression":"assets/nexa/master/expressions/nexa-ready-expression.png"}},{"id":"habitat.nexa-habitat-wide-light","state":null,"usage":"habitat-wide","dimensions":{"width":256,"height":144},"assetPath":"assets/nexa/habitat/nexa-habitat-wide-light.svg","detail":"habitat","theme":"light","static":true,"motionSafe":true,"animated":false,"format":"image/svg+xml","bytes":535,"sha256":"2efa2524def42eebd3f37f3e3713dd874df3de29f938255661278593f90f6d2b","vectorSource":"assets/nexa/habitat/nexa-habitat-wide-light.svg"},{"id":"habitat.nexa-habitat-compact-light","state":null,"usage":"habitat-compact","dimensions":{"width":192,"height":80},"assetPath":"assets/nexa/habitat/nexa-habitat-compact-light.svg","detail":"habitat","theme":"light","static":true,"motionSafe":true,"animated":false,"format":"image/svg+xml","bytes":522,"sha256":"eca2d4bf697bda37db5ab2e2d05df9943c5c84ff05b8b357ae8bbef061925ec6","vectorSource":"assets/nexa/habitat/nexa-habitat-compact-light.svg"},{"id":"habitat.nexa-contact-shadow-light","state":null,"usage":"contact-shadow","dimensions":{"width":128,"height":24},"assetPath":"assets/nexa/habitat/nexa-contact-shadow-light.svg","detail":"shadow","theme":"light","static":true,"motionSafe":true,"animated":false,"format":"image/svg+xml","bytes":316,"sha256":"dfaacc2c2f3ff978ee8491e15e9ac0c5e4e663909dee85f26a7c370fee043030","vectorSource":"assets/nexa/habitat/nexa-contact-shadow-light.svg"},{"id":"habitat.nexa-micro-shadow-light","state":null,"usage":"micro-shadow","dimensions":{"width":48,"height":12},"assetPath":"assets/nexa/habitat/nexa-micro-shadow-light.svg","detail":"shadow","theme":"light","static":true,"motionSafe":true,"animated":false,"format":"image/svg+xml","bytes":312,"sha256":"470bb94144f0a7b77215969e0d94396cf27fe93720e6a28778ca1082ea6c6045","vectorSource":"assets/nexa/habitat/nexa-micro-shadow-light.svg"},{"id":"habitat.nexa-habitat-wide-dark","state":null,"usage":"habitat-wide","dimensions":{"width":256,"height":144},"assetPath":"assets/nexa/habitat/nexa-habitat-wide-dark.svg","detail":"habitat","theme":"dark","static":true,"motionSafe":true,"animated":false,"format":"image/svg+xml","bytes":535,"sha256":"00b7a358aa64e7d0e7c9e1790f6928b3e74439b0e42ded8aca73ff86bb7712d2","vectorSource":"assets/nexa/habitat/nexa-habitat-wide-dark.svg"},{"id":"habitat.nexa-habitat-compact-dark","state":null,"usage":"habitat-compact","dimensions":{"width":192,"height":80},"assetPath":"assets/nexa/habitat/nexa-habitat-compact-dark.svg","detail":"habitat","theme":"dark","static":true,"motionSafe":true,"animated":false,"format":"image/svg+xml","bytes":522,"sha256":"a7a6ebff446a1e97fad63ce62c64efbf26f03dba91e7298e3c23eea6ef7e9309","vectorSource":"assets/nexa/habitat/nexa-habitat-compact-dark.svg"},{"id":"habitat.nexa-contact-shadow-dark","state":null,"usage":"contact-shadow","dimensions":{"width":128,"height":24},"assetPath":"assets/nexa/habitat/nexa-contact-shadow-dark.svg","detail":"shadow","theme":"dark","static":true,"motionSafe":true,"animated":false,"format":"image/svg+xml","bytes":316,"sha256":"baf462e0d1cc505f94a3ce25278f3ecdc622c2d136e96b6c79c91942880cb92a","vectorSource":"assets/nexa/habitat/nexa-contact-shadow-dark.svg"},{"id":"habitat.nexa-micro-shadow-dark","state":null,"usage":"micro-shadow","dimensions":{"width":48,"height":12},"assetPath":"assets/nexa/habitat/nexa-micro-shadow-dark.svg","detail":"shadow","theme":"dark","static":true,"motionSafe":true,"animated":false,"format":"image/svg+xml","bytes":312,"sha256":"1b93e18755393d157c7addaa419593c03363c5be1bba7f959c09ae1c9b00b554","vectorSource":"assets/nexa/habitat/nexa-micro-shadow-dark.svg"}]'),runtime:{stateAliases:{pleased:"success",concerned:"warning"},desktop:{wide:{usage:"state",width:256,displaySize:112},compact:{usage:"state",width:96,displaySize:56},micro:{usage:"state",width:48,displaySize:40}},web:{launcher:{usage:"web-launcher"},welcome:{usage:"web-welcome"},ready:{usage:"web-compact-header"},thinking:{usage:"web-thinking-header"},speaking:{usage:"web-speaking-header"},concerned:{usage:"state",state:"warning",width:48}},fallbackPolicy:"WebP supported by target Electron and modern browsers; no redundant runtime PNG fallback. Source masters remain PNG."}},Xe=document.currentScript instanceof HTMLScriptElement?document.currentScript.src:"",E=Qa({schedule:(e,a)=>window.setTimeout(e,a),cancel:e=>window.clearTimeout(e)});function ea(e,a,t){const s=e!=="header"?e:a==="thinking"||a==="speaking"||a==="concerned"?a:"ready",i=Va(Je,Je.runtime.web[s]);return Xe?new URL(i.assetPath,new URL(".",Xe)).href:t?`${t.replace(/\/$/,"")}/${i.assetPath}`:i.assetPath}const Za={sparkles:'<path d="m12 3-1.4 3.5L7 8l3.6 1.4L12 13l1.4-3.6L17 8l-3.6-1.5L12 3Z"/><path d="m5 15-.8 2-2.2.8 2.2.9L5 21l.8-2.3 2.2-.9-2.2-.8L5 15Z"/>',bot:'<rect x="5" y="7" width="14" height="11" rx="4"/><path d="M12 4v3M9 12h.01M15 12h.01M9 15h6"/>',calendar:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 9h16M8 13h.01M12 13h.01M16 13h.01"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',table:'<path d="M4 10h16M6 10l-1 10M18 10l1 10M8 6h8a2 2 0 0 1 2 2v2H6V8a2 2 0 0 1 2-2Z"/>',bed:'<path d="M3 18v-7M21 18v-5a2 2 0 0 0-2-2H9a3 3 0 0 0-3 3v1M3 15h18M7 11V8h5a2 2 0 0 1 2 2v1"/>',pin:'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',search:'<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',"chevron-left":'<path d="m15 18-6-6 6-6"/>',"chevron-right":'<path d="m9 18 6-6-6-6"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-.9.8-.9 1.6M12 17h.01"/>',whatsapp:'<path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5Z"/><path d="M9 8.7c.5 2.5 2 4 4.5 4.8l1-1"/>',shield:'<path d="M12 3 5 6v5c0 4.5 2.8 7.8 7 10 4.2-2.2 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',"arrow-left":'<path d="m15 18-6-6 6-6M9 12h10"/>',minus:'<path d="M5 12h14"/>',plus:'<path d="M12 5v14M5 12h14"/>',send:'<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>'};function f(e,a=""){return`<svg class="ya-widget-icon${a?` ${a}`:""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${Za[e]}</svg>`}function aa(){const a=document.currentScript?.dataset??{},t=Ja({businessName:a.businessName,whatsappPhone:a.whatsappPhone,apiBaseUrl:a.apiBaseUrl,logoUrl:a.logoUrl,primaryColor:a.primaryColor,accentColor:a.accentColor,address:a.address,mapUrl:a.mapUrl}),s=pe(a.profileId);return s&&(t.profileId=s),(a.aiEnabled==="true"||a.aiEnabled==="false")&&(t.aiEnabled=a.aiEnabled==="true"),(a.whatsappEnabled==="true"||a.whatsappEnabled==="false")&&(t.whatsappEnabled=a.whatsappEnabled==="true"),t}function Ja(e){return Object.fromEntries(Object.entries(e).filter(([,a])=>typeof a=="string"&&a.length>0))}function pe(e){const a=String(e??"").trim();return["pension_restaurant","pension","restaurant","market"].includes(a)?a:""}function ue(e){if(!Array.isArray(e))return[];const a=new Set(["accommodation","food_service","menu","qr_menu","catalog","directions"]);return[...new Set(e.map(t=>String(t??"").trim()).filter(t=>a.has(t)))]}function j(e){const a=ue(e.publicSurfaces);return new Set(a.length>0?a:at(e.profileId))}function ta(e){return e.whatsappEnabled&&e.whatsappPhone.trim()!==""}function me(e,a){if(!e.requestsEnabled)return!1;const t=j(e);return a==="pension_reservation"?t.has("accommodation"):a==="restaurant_reservation"?t.has("food_service"):!0}function Xa(e){const a=j(e),t=[];return a.has("accommodation")&&t.push("Oda fiyatları","Oda müsaitliği","Kahvaltı saatleri"),a.has("food_service")&&t.push("Masa var mı?","Menü hakkında bilgi","Çocuklar için uygun mu?"),a.has("catalog")&&t.push("Ürün stokta mı?","Ürün fiyatı","Çalışma saatleri"),a.has("directions")&&t.push("Konum ve yol tarifi"),t.length===0&&t.push("Çalışma saatleri","İletişim","Konum"),[...new Set(t)].slice(0,6)}function et(e){const a=j(e),t=[];return a.has("accommodation")&&t.push({key:"reservation",label:"Rezervasyon soracağım",message:`Merhaba, ${e.businessName} için oda müsaitliği ve rezervasyon hakkında bilgi almak istiyorum.`}),a.has("food_service")&&t.push({key:"table",label:"Masa soracağım",message:`Merhaba, ${e.businessName} için masa müsaitliği hakkında bilgi almak istiyorum.`}),a.has("menu")&&t.push({key:"menu",label:"Menü hakkında soracağım",message:`Merhaba, ${e.businessName} menüsü hakkında bilgi almak istiyorum.`}),a.has("catalog")&&t.push({key:"product",label:"Ürün / stok soracağım",message:`Merhaba, ${e.businessName} için ürün ve stok bilgisi almak istiyorum.`}),t.push({key:"custom",label:"Kendi mesajımı yazacağım",message:""}),t}function at(e){return e==="pension_restaurant"?["accommodation","food_service","menu","qr_menu","directions"]:e==="pension"?["accommodation","directions"]:e==="restaurant"?["food_service","menu","qr_menu","directions"]:e==="market"?["catalog","directions"]:[]}function sa(e){const a=Number(e);return Number.isFinite(a)&&a>=1?Math.min(30,Math.floor(a)):1}function N(e,a){const t=new Date(e.getFullYear(),e.getMonth(),e.getDate());return t.setDate(t.getDate()+a),t}function h(e){const a=e.getFullYear(),t=String(e.getMonth()+1).padStart(2,"0"),s=String(e.getDate()).padStart(2,"0");return`${a}-${t}-${s}`}function C(e){const[a,t,s]=e.split("-").map(Number);if(!a||!t||!s)return null;const i=new Date(a,t-1,s);return Number.isNaN(i.getTime())?null:i}function tt(e){return new Intl.DateTimeFormat("tr-TR",{month:"long",year:"numeric"}).format(e).replace(/^./u,a=>a.toLocaleUpperCase("tr-TR"))}function I(e){const a=C(e);if(!a)return"Tarih seç";const t=a.getFullYear()!==new Date().getFullYear();return new Intl.DateTimeFormat("tr-TR",{day:"numeric",month:"long",...t?{year:"numeric"}:{}}).format(a)}function st(e,a){const t=I(e);return a==="today"?`Bugün, ${t}`:a==="tomorrow"?`Yarın, ${t}`:t}function it(e,a){const t=e.intent??"home",s=nt(e.context);if(t==="accommodation.reserve")return me(a,"pension_reservation")?{view:"form",requestType:"pension_reservation",context:s,questionDraft:""}:G();if(t==="food.reserve")return me(a,"restaurant_reservation")?{view:"form",requestType:"restaurant_reservation",context:s,questionDraft:""}:G();if(t==="contact.whatsapp")return ta(a)?{view:"whatsapp",context:s,questionDraft:""}:G();if(t==="directions")return{view:"directions",context:s,questionDraft:s?.question??""};if(t==="accommodation.info"||t==="info"){if(!a.aiEnabled)return G();const i=String(s?.resourceName??"").trim(),n=String(s?.question??"").trim()||(i?`${i} hakkında bilgi almak istiyorum.`:"");return{view:"info",context:s,questionDraft:n}}return{view:"home",context:s,questionDraft:""}}function nt(e){if(!e)return null;const a={resourceType:String(e.resourceType??"").trim(),resourceId:String(e.resourceId??"").trim(),resourceName:String(e.resourceName??"").trim(),imageUrl:String(e.imageUrl??"").trim(),sourcePath:String(e.sourcePath??"").trim()||window.location.pathname,question:String(e.question??"").trim(),address:String(e.address??"").trim(),mapUrl:String(e.mapUrl??"").trim()};return Object.values(a).some(Boolean)?a:null}function rt(e){const a=String(e??"").trim();return["home","accommodation.reserve","accommodation.info","food.reserve","contact.whatsapp","info","directions"].includes(a)?a:null}function ot(e){return e?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e)}`:""}function G(){return{view:"home",context:null,questionDraft:""}}const O="yardimci-asistan-widget",ia="yardimci-asistan-widget-style",na={businessName:"Yardımcı Asistan",whatsappPhone:"",apiBaseUrl:"",logoUrl:"",primaryColor:"#2F6F5E",accentColor:"#E47863",profileId:"",publicSurfaces:[],aiEnabled:!0,whatsappEnabled:!0,requestsEnabled:!0,address:"",mapUrl:""},dt=aa();let l={...na},o={isOpen:!1,view:"home",requestType:"pension_reservation",status:"",aiAnswer:"",aiLoading:!1,questionDraft:"",whatsappDraft:"",whatsappTopic:"",context:null},ra=!1,q=0,ge=!1,oa=0,da=!1;function fe(e){return`<img class="ya-widget-nexa" data-nexa-role="${e}" src="${v(ea(e,E.getState(),l.apiBaseUrl))}" alt="" aria-hidden="true" decoding="async" />`}function L(){const e=document.getElementById(O),a=o.isOpen&&document.visibilityState==="visible"&&document.hasFocus();if(E.setActive(a),!e)return;e.dataset.nexaMotionActive=String(a&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches);const t=E.getState();if(e.dataset.nexaState===t)return;e.dataset.nexaState=t;const s=e.querySelector('[data-nexa-role="header"]');s&&(s.src=ea("header",t,l.apiBaseUrl),s.classList.remove("is-nexa-changing"),e.dataset.nexaMotionActive==="true"&&(s.offsetWidth,s.classList.add("is-nexa-changing")))}function ct(){da||(da=!0,E.subscribe(L),document.addEventListener("visibilitychange",L),window.addEventListener("focus",L),window.addEventListener("blur",L),window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change",L))}function H(e={}){E.reset(),ct();const a={...na,...dt,...aa(),...e};l={...a,profileId:pe(a.profileId),publicSurfaces:ue(a.publicSurfaces)},ga(l),jt(),w();const t=++oa;Wt(t)}function K(e={}){E.reset(),ge=!o.isOpen,q&&(window.clearTimeout(q),q=0),o={...o,...it(e,l),isOpen:!0,status:"",aiLoading:!1,aiAnswer:""},w(),B(".ya-widget-view-title, [data-ya-close]")}function V(){const e=document.querySelector(`#${O} .ya-widget-panel`),a=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches===!0;if(e&&!a){e.classList.add("is-closing"),q&&window.clearTimeout(q),q=window.setTimeout(()=>{q=0,ca()},150);return}ca()}function ca(){E.reset(),E.setActive(!1),o={...o,isOpen:!1,view:"home",status:"",aiLoading:!1,aiAnswer:"",questionDraft:"",context:null},w(),B("[data-ya-open]")}function be(e,a){return ie(e,a)}function lt(e,a=l.businessName){return Oe({...e,time_text:e.time},a)}function pt(e){const a=ne(e);return a.ok?{ok:!0,whatsapp:a.whatsapp}:{ok:!1,error:a.error}}function w(){const e=Bt();e.dataset.yaWhatsappEnabled=l.whatsappEnabled?"1":"0",e.innerHTML=o.isOpen?mt():ut(),o.isOpen&&(ge=!1),_t(e),L()}function ut(){return`
    <button class="ya-widget-button" type="button" data-ya-open aria-label="Yardımcı Asistan'ı aç">
      <span class="ya-widget-launcher-avatar">
        ${fe("launcher")}
      </span>
      <span class="ya-widget-launcher-copy">
        <strong>Nexa</strong>
        <small>Yardımcı Asistan</small>
      </span>
    </button>
  `}function mt(){return`
    <section class="ya-widget-panel${ge?" is-opening":""}" role="dialog" aria-labelledby="ya-widget-title">
      <header class="ya-widget-header">
        <div class="ya-widget-identity">
          ${o.view==="home"?"":`<span class="ya-widget-avatar">${fe("header")}</span>`}
          <span class="ya-widget-title-copy">
            <strong id="ya-widget-title"><span class="ya-widget-business-mark">${gt()}</span>${b(Nt())}</strong>
            <small>${b(Rt())}</small>
          </span>
        </div>
        <button class="ya-widget-close" type="button" data-ya-close aria-label="Asistanı kapat">
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div class="ya-widget-notice" data-ya-status role="status" ${o.status?"":"hidden"}>
        <span class="ya-widget-notice-icon" aria-hidden="true">${f("info")}</span>
        <span data-ya-status-text>${b(o.status)}</span>
      </div>
      <div class="ya-widget-content">
        ${o.view==="home"?ft():""}
        ${o.view==="form"?bt():""}
        ${o.view==="info"?vt():""}
        ${o.view==="whatsapp"?St():""}
        ${o.view==="directions"?kt():""}
      </div>
    </section>
  `}function gt(){return l.logoUrl?`<img class="ya-widget-mark" src="${v(l.logoUrl)}" alt="" aria-hidden="true" />`:""}function ft(){const e=fa(),a=[];return l.requestsEnabled&&e.has("accommodation")&&a.push(z({requestType:"pension_reservation",icon:"calendar",title:"Rezervasyon yap",description:"Tarih ve kişi bilgilerini iletin"})),l.requestsEnabled&&e.has("food_service")&&a.push(z({requestType:"restaurant_reservation",icon:"table",title:"Masa sor",description:"Tarih, saat ve kişi sayısını seçin"})),l.aiEnabled&&e.has("catalog")&&a.push(z({view:"info",icon:"search",title:"Ürün / stok sor",description:"Ürün ve stok bilgisini hızlıca öğrenin"})),l.aiEnabled&&a.push(z({view:"info",icon:"sparkles",title:"Asistana sor",description:"İşletme hakkında kısa bir soru sorun"})),e.has("directions")&&a.push(z({view:"directions",icon:"pin",title:"Yol tarifi",description:"Konumu açın veya ulaşımı sorun"})),l.whatsappEnabled&&l.whatsappPhone.trim()&&a.push(z({view:"whatsapp",icon:"whatsapp",title:"WhatsApp",description:"Hazır bir mesaj oluşturun"})),`
    <div class="ya-widget-home">
      <div class="ya-widget-welcome">
        <span class="ya-widget-nexa-welcome">${fe("welcome")}</span>
        <div>
          <span class="ya-widget-kicker">İşletme yardımcısı</span>
          <h2 class="ya-widget-view-title" tabindex="-1">Merhaba, ben Nexa.</h2>
          <p>İşlemi seçin; gerekli alanı doğrudan açayım.</p>
        </div>
      </div>
      <div class="ya-widget-actions" role="group" aria-label="Hızlı asistan seçenekleri">
        ${a.join("")}
      </div>
    </div>
  `}function z(e){return`
    <button class="ya-widget-action-card" type="button" ${e.requestType?`data-ya-request-type="${e.requestType}"`:`data-ya-view="${e.view??"home"}"`}>
      <span class="ya-widget-action-icon" aria-hidden="true">${f(e.icon)}</span>
      <span class="ya-widget-action-copy">
        <strong>${b(e.title)}</strong>
        <small>${b(e.description)}</small>
      </span>
      <span class="ya-widget-action-arrow" aria-hidden="true">${f("chevron-right")}</span>
    </button>
  `}function bt(){const e=o.requestType==="restaurant_reservation",a=e?"Masa talebi":"Rezervasyon talebi",t=e?"Masa talebinizi hazırlayalım":"Rezervasyonunuzu hazırlayalım",s=e?yt():ht();return`
    <div class="ya-widget-subview">
      ${Q(a,e?"table":"calendar")}
      <div class="ya-widget-subview-intro">
        <span aria-hidden="true">${f("sparkles")}</span>
        <div>
          <h2 class="ya-widget-view-title" tabindex="-1">${t}</h2>
          <p>Tarih ve iletişim bilgilerinizi ekleyin.</p>
        </div>
      </div>
      ${ye()}
      <form class="ya-widget-form" data-ya-form>
        <input type="hidden" name="request_type" value="${o.requestType}" />
        ${At()}
        ${s}
        <div class="ya-widget-field-grid">
          <label class="ya-widget-field">
            <span>Ad soyad</span>
            <input name="customer_name" required autocomplete="name" placeholder="Adınız soyadınız" />
          </label>
          <label class="ya-widget-field">
            <span>Telefon</span>
            <input name="customer_phone" required inputmode="tel" autocomplete="tel" placeholder="+90 5xx… / +44…" />
          </label>
        </div>
        ${wt()}
        <label class="ya-widget-field">
          <span>Kısa not <small>(isteğe bağlı)</small></span>
          <textarea name="message" rows="2" placeholder="Tercihiniz veya eklemek istediğiniz kısa not"></textarea>
        </label>
        <button class="ya-widget-primary-action" type="submit">
          ${f("send")}
          <span>Talebi Gönder</span>
        </button>
      </form>
    </div>
  `}function ht(){const e=h(new Date),a=h(N(new Date,1));return`
    <fieldset class="ya-widget-date-group" data-ya-accommodation-dates>
      <legend>Konaklama tarihleri</legend>
      <div class="ya-widget-date-range">
        ${he("start_date","Giriş","Giriş tarihi",e)}
        ${he("end_date","Çıkış","Çıkış tarihi",a)}
      </div>
      <input name="date_text" type="hidden" />
      <div class="ya-widget-calendar" data-ya-calendar hidden></div>
    </fieldset>
  `}function yt(){const e=h(new Date);return`
    <fieldset class="ya-widget-date-group" data-ya-restaurant-date>
      <legend>Tarih ve saat</legend>
      <div class="ya-widget-schedule-row">
        ${he("start_date","Tarih","Tarih seç",e)}
        ${xt()}
      </div>
      <input name="date_text" type="hidden" />
      <div class="ya-widget-calendar" data-ya-calendar hidden></div>
    </fieldset>
  `}function xt(){return`
    <div class="ya-widget-time-field">
      <span>Saat</span>
      <button class="ya-widget-time-trigger" type="button" data-ya-open-time-picker aria-expanded="false">
        ${f("clock")}
        <strong data-ya-time-label>Saat seç</strong>
        ${f("chevron-right")}
      </button>
      <input name="time" type="hidden" />
      <div class="ya-widget-time-popover" data-ya-time-popover hidden></div>
    </div>
  `}function he(e,a,t,s){return`
    <div class="ya-widget-date-picker" data-ya-date-picker-control="${e}">
      <span>${a}</span>
      <button type="button" data-ya-open-date-picker="${e}">
        ${f("calendar")}
        <strong data-ya-date-label="${e}">${t}</strong>
      </button>
      <input name="${e}" type="hidden" data-ya-date-value-input min="${s}" />
    </div>
  `}function wt(){return`
    <fieldset class="ya-widget-guest-group">
      <legend>Kişi sayısı</legend>
      <div class="ya-widget-stepper">
        <button type="button" data-ya-guest-step="-1" aria-label="Kişi sayısını azalt" disabled>${f("minus")}</button>
        <input name="guest_count" required type="number" min="1" max="30" value="2" inputmode="numeric" aria-label="Kişi sayısı" />
        <button type="button" data-ya-guest-step="1" aria-label="Kişi sayısını artır">${f("plus")}</button>
      </div>
    </fieldset>
  `}function vt(){const e=Ft();return`
    <div class="ya-widget-subview ya-widget-info">
      ${Q("Bilgi al","help")}
      <div class="ya-widget-subview-intro">
        <span aria-hidden="true">${f("bot")}</span>
        <div>
          <h2 class="ya-widget-view-title" tabindex="-1">Merak ettiğiniz şeyi sorun</h2>
          <p>Kısa sorunuzu yazın veya sık sorulanlardan birini seçin.</p>
        </div>
      </div>
      ${ye()}
      <div class="ya-widget-suggestions" role="group" aria-label="Sık sorulan sorular">
        ${e.map(a=>`<button type="button" data-ya-question-suggestion="${v(a)}">${b(a)}</button>`).join("")}
      </div>
      <form class="ya-widget-ai" data-ya-ai-form>
        <label class="ya-widget-field">
          <span>Kısa soru</span>
          <textarea name="message" required maxlength="1200" rows="3" placeholder="Örn. Bu akşam 4 kişilik masa var mı?">${b(o.questionDraft)}</textarea>
        </label>
        <div class="ya-widget-ai-actions">
          <button class="ya-widget-primary-action ${o.aiLoading?"is-loading":""}" type="submit" ${o.aiLoading?"disabled":""}>
            ${o.aiLoading?'<span class="ya-widget-spinner" aria-hidden="true"></span>':f("sparkles")}
            <span>${o.aiLoading?"Yanıt hazırlanıyor…":"AI Yardımcıya Sor"}</span>
          </button>
          ${l.whatsappEnabled&&l.whatsappPhone.trim()?`<button class="ya-widget-secondary-action" type="button" data-ya-ai-whatsapp>
                ${f("whatsapp")}
                <span>WhatsApp'tan Yaz</span>
              </button>`:""}
        </div>
      </form>
      ${o.aiAnswer?`<div class="ya-widget-ai-answer">
              <p><strong>AI Yardımcı</strong><span>${b(o.aiAnswer)}</span></p>
            </div>`:""}
    </div>
  `}function St(){const e=Yt();return`
    <div class="ya-widget-subview ya-widget-whatsapp-view">
      ${Q("WhatsApp","whatsapp")}
      <div class="ya-widget-subview-intro">
        <span aria-hidden="true">${f("whatsapp")}</span>
        <div>
          <h2 class="ya-widget-view-title" tabindex="-1">Mesajınızı birlikte hazırlayalım</h2>
          <p>Konuyu seçin; metni isterseniz göndermeden önce düzenleyin.</p>
        </div>
      </div>
      <div class="ya-widget-topic-chips" role="group" aria-label="WhatsApp mesaj konusu">
        ${e.map(a=>`
              <button
                type="button"
                data-ya-whatsapp-topic="${a.key}"
                data-ya-whatsapp-message="${v(a.message)}"
                aria-pressed="${o.whatsappTopic===a.key?"true":"false"}"
                class="${o.whatsappTopic===a.key?"is-active":""}"
              >${b(a.label)}</button>
            `).join("")}
      </div>
      <form class="ya-widget-direct-whatsapp" data-ya-whatsapp-form>
        <label class="ya-widget-field">
          <span>Mesajınız</span>
          <textarea name="message" required rows="3" maxlength="1200" placeholder="Kısa mesajınızı yazın">${b(o.whatsappDraft)}</textarea>
        </label>
        <div class="ya-widget-message-preview">
          <span>Hazır mesaj</span>
          <p data-ya-message-preview>${o.whatsappDraft?b(o.whatsappDraft):"Bir konu seçtiğinizde mesajınız burada görünecek."}</p>
        </div>
        <button class="ya-widget-primary-action" type="submit">
          ${f("send")}
          <span>WhatsApp'ta Aç</span>
        </button>
      </form>
    </div>
  `}function kt(){const e=String(o.context?.address||l.address||"").trim(),a=String(o.context?.mapUrl||l.mapUrl||ot(e)).trim();return`
    <div class="ya-widget-subview ya-widget-directions">
      ${Q("Yol tarifi","pin")}
      <div class="ya-widget-subview-intro">
        <span aria-hidden="true">${f("pin")}</span>
        <div>
          <h2 class="ya-widget-view-title" tabindex="-1">Bize nasıl ulaşabilirsiniz?</h2>
          <p>Konumu açabilir veya ulaşım hakkında kısa bir soru sorabilirsiniz.</p>
        </div>
      </div>
      ${ye()}
      <div class="ya-widget-location-card">
        <span>${f("pin")}</span>
        <div>
          <strong>${b(l.businessName)}</strong>
          <p>${b(e||"Adres bilgisi site tarafından iletilmedi.")}</p>
        </div>
      </div>
      <div class="ya-widget-ai-actions">
        ${a?`<a class="ya-widget-primary-action" href="${v(a)}" target="_blank" rel="noopener noreferrer">${f("pin")}<span>Haritada Aç</span></a>`:""}
        ${l.aiEnabled?`<button class="ya-widget-secondary-action" type="button" data-ya-directions-question>
          ${f("help")}<span>Yol Tarifi Sor</span>
        </button>`:""}
      </div>
    </div>
  `}function ye(){const e=o.context,a=String(e?.resourceName??"").trim();if(!a)return"";const t=String(e?.resourceType??"").trim(),s=t==="room"?"Seçili oda":t==="table"?"Seçili masa":t==="product"?"Seçili ürün":"Sayfa bağlamı",i=String(e?.imageUrl??"").trim();return`
    <div class="ya-widget-context-card" data-ya-context-card>
      ${i?`<img src="${v(i)}" alt="" />`:`<span class="ya-widget-context-icon">${f(t==="room"?"bed":"sparkles")}</span>`}
      <div>
        <small>${b(s)}</small>
        <strong>${b(a)}</strong>
      </div>
    </div>
  `}function At(){const e=o.context??{};return`
    <input type="hidden" name="context_resource_type" value="${v(String(e.resourceType??""))}" />
    <input type="hidden" name="context_resource_id" value="${v(String(e.resourceId??""))}" />
    <input type="hidden" name="context_resource_name" value="${v(String(e.resourceName??""))}" />
    <input type="hidden" name="context_source_path" value="${v(String(e.sourcePath??""))}" />
  `}function Q(e,a){return`
    <div class="ya-widget-subview-nav">
      <button type="button" data-ya-view="home">${f("arrow-left")}<span>Geri</span></button>
      <span class="ya-widget-active-flow">${f(a)} ${b(e)}</span>
    </div>
  `}function _t(e){e.querySelector("[data-ya-open]")?.addEventListener("click",()=>K()),e.querySelector("[data-ya-close]")?.addEventListener("click",V),e.querySelectorAll("[data-ya-view]").forEach(a=>{a.addEventListener("click",()=>{const t=a.dataset.yaView;o={...o,isOpen:!0,view:t,status:"",aiLoading:!1,context:t==="home"?null:o.context,questionDraft:t==="home"?"":o.questionDraft},w(),B(".ya-widget-view-title")})}),e.querySelectorAll("[data-ya-request-type]").forEach(a=>{a.addEventListener("click",()=>{const t=a.dataset.yaRequestType;if(!ba(t)){P("Bu işlem işletmenin etkin web seçeneklerinde kullanılamıyor.");return}o={...o,view:"form",requestType:t,status:""},w(),B(".ya-widget-view-title")})}),Et(e),Ct(e),qt(e),Lt(e),Mt(e),zt(e),e.querySelector("[data-ya-ai-form]")?.addEventListener("submit",Pt),e.querySelector("[data-ya-whatsapp-form]")?.addEventListener("submit",Dt),e.onkeydown=a=>{a.key==="Escape"&&o.isOpen&&(a.preventDefault(),V())}}function Et(e){e.querySelectorAll("[data-ya-open-date-picker]").forEach(i=>{i.addEventListener("click",()=>Tt(e,String(i.dataset.yaOpenDatePicker??"")))});const a=e.querySelector("[data-ya-calendar]");a?.addEventListener("click",i=>{const n=i.target instanceof Element?i.target.closest("button"):null;if(!n||n.disabled)return;if(n.dataset.yaCalendarClose==="1"){M(e);return}if(n.dataset.yaCalendarShortcut){$t(e,String(n.dataset.yaCalendarShortcut),a);return}if(n.dataset.yaCalendarShift){const c=Number(n.dataset.yaCalendarShift),u=C(String(a.dataset.yaCalendarMonth??""));if(!u||!Number.isFinite(c))return;a.dataset.yaCalendarMonth=h(new Date(u.getFullYear(),u.getMonth()+c,1)),la(e);return}const d=String(n.dataset.yaCalendarDay??""),p=e.querySelector(`input[name="${String(a.dataset.yaCalendarTarget??"")}"]`);!d||!p||(p.value=d,p.dispatchEvent(new Event("change",{bubbles:!0})),M(e))});const t=e.querySelector('input[name="start_date"]'),s=e.querySelector('input[name="end_date"]');t?.addEventListener("change",()=>{e.querySelector("[data-ya-accommodation-dates]")?xe(e):pa(e,"custom",t.value)}),s?.addEventListener("change",()=>xe(e))}function Tt(e,a){Z(e);const t=e.querySelector("[data-ya-calendar]"),s=e.querySelector(`input[name="${a}"]`);if(!t||!s)return;const i=C(s.value)??C(s.min)??new Date;t.dataset.yaCalendarTarget=a,t.dataset.yaCalendarMonth=h(new Date(i.getFullYear(),i.getMonth(),1)),t.hidden=!1,la(e)}function M(e){const a=e.querySelector("[data-ya-calendar]");a&&(a.hidden=!0)}function la(e){const a=e.querySelector("[data-ya-calendar]");if(!a)return;const t=String(a.dataset.yaCalendarTarget??""),s=e.querySelector(`input[name="${t}"]`),i=C(String(a.dataset.yaCalendarMonth??""));if(!s||!i)return;const n=i.getFullYear(),d=i.getMonth(),p=new Date(n,d,1),c=new Date(n,d+1,0),u=(p.getDay()+6)%7,g=s.min||h(new Date),m=s.value,A=h(new Date),y=e.querySelector('input[name="start_date"]')?.value??"",J=e.querySelector('input[name="end_date"]')?.value??"",we=!!e.querySelector("[data-ya-accommodation-dates]"),ve=[];for(let T=0;T<u;T+=1)ve.push('<span class="ya-widget-calendar-empty" aria-hidden="true"></span>');for(let T=1;T<=c.getDate();T+=1){const S=h(new Date(n,d,T)),Se=S<g,Kt=!!(we&&y&&J&&S>y&&S<J),Vt=[S===m?"is-selected":"",S===A?"is-today":"",Kt?"is-in-range":"",!!(we&&(S===y||S===J))?"is-range-edge":""].filter(Boolean).join(" ");ve.push(`<button type="button" data-ya-calendar-day="${S}" class="${Vt}" ${Se?"disabled":""} aria-label="${v(I(S))}">${T}</button>`)}const Gt=we?t==="end_date"?[["clear","Temizle",!J],["day1","1 gün",!y],["day2","2 gün",!y],["day7","7 gün",!y],["day10","10 gün",!y]]:[["clear","Temizle",!y],["today","Bugün",!1],["tomorrow","Yarın",!1]]:[["clear","Temizle",!m],["today","Bugün",!1],["tomorrow","Yarın",!1]],Ht=h(new Date(n,d,0));a.innerHTML=`
    <div class="ya-widget-calendar-head">
      <button type="button" data-ya-calendar-shift="-1" aria-label="Önceki ay" ${Ht<g?"disabled":""}>${f("chevron-left")}</button>
      <strong class="ya-widget-calendar-title">${b(tt(i))}</strong>
      <button type="button" data-ya-calendar-shift="1" aria-label="Sonraki ay">${f("chevron-right")}</button>
      <button class="ya-widget-calendar-close" type="button" data-ya-calendar-close="1" aria-label="Takvimi kapat">×</button>
    </div>
    <div class="ya-widget-calendar-shortcuts">
      ${Gt.map(([T,S,Se])=>`<button type="button" data-ya-calendar-shortcut="${T}" ${Se?"disabled":""}>${S}</button>`).join("")}
    </div>
    <div class="ya-widget-calendar-weekdays" aria-hidden="true"><span>Pzt</span><span>Sal</span><span>Çar</span><span>Per</span><span>Cum</span><span>Cmt</span><span>Paz</span></div>
    <div class="ya-widget-calendar-days">${ve.join("")}</div>
  `}function $t(e,a,t){const s=String(t.dataset.yaCalendarTarget??""),i=e.querySelector(`input[name="${s}"]`);if(!i)return;const n=!!e.querySelector("[data-ya-accommodation-dates]"),d=new Date;if(a==="clear"){Ot(e,s),M(e);return}const p=/^day(1|2|7|10)$/.exec(a);if(p){const g=Number(p[1]),m=e.querySelector('input[name="start_date"]'),A=e.querySelector('input[name="end_date"]'),y=m?C(m.value):null;if(!n||s!=="end_date"||!m||!A||!y)return;A.value=h(N(y,g)),A.dispatchEvent(new Event("change",{bubbles:!0})),M(e);return}const c=a==="tomorrow"?N(d,1):d,u=h(c);i.min&&u<i.min||(i.value=u,n?i.dispatchEvent(new Event("change",{bubbles:!0})):pa(e,a==="tomorrow"?"tomorrow":"today",u),M(e))}function Ot(e,a){const t=e.querySelector(`input[name="${a}"]`);if(!t)return;const s=!!e.querySelector("[data-ya-accommodation-dates]");if(t.value="",s){const d=e.querySelector('input[name="start_date"]'),p=e.querySelector('input[name="end_date"]');a==="start_date"&&d&&p&&(p.value="",p.min=h(N(new Date,1))),xe(e);return}const i=e.querySelector('input[name="date_text"]'),n=e.querySelector('[data-ya-date-label="start_date"]');i&&(i.value=""),n&&(n.textContent="Tarih seç"),e.querySelector("[data-ya-open-date-picker]")?.classList.remove("is-active")}function xe(e){const a=e.querySelector('input[name="start_date"]'),t=e.querySelector('input[name="end_date"]'),s=e.querySelector('input[name="date_text"]');if(!a||!t||!s)return;if(a.value){const d=C(a.value);d&&(t.min=h(N(d,1)),t.value&&t.value<=a.value&&(t.value=""))}const i=e.querySelector('[data-ya-date-label="start_date"]'),n=e.querySelector('[data-ya-date-label="end_date"]');if(i&&(i.textContent=a.value?I(a.value):"Giriş tarihi"),n&&(n.textContent=t.value?I(t.value):"Çıkış tarihi"),a.value&&t.value){const d=`${I(a.value)} – ${I(t.value)}`;s.value=d;return}s.value=""}function pa(e,a,t){const s=e.querySelector('input[name="start_date"]'),i=e.querySelector('input[name="date_text"]'),n=e.querySelector("[data-ya-open-date-picker]"),d=e.querySelector('[data-ya-date-label="start_date"]');if(!s||!i||!t)return;const p=st(t,a);s.value=t,i.value=p,e.querySelectorAll("[data-ya-date-preset]").forEach(c=>{const u=c.dataset.yaDatePreset===a;c.classList.toggle("is-active",u),c.setAttribute("aria-pressed",String(u))}),n?.classList.add("is-active"),d&&(d.textContent=I(t))}function Ct(e){const a=e.querySelector("[data-ya-open-time-picker]"),t=e.querySelector("[data-ya-time-popover]"),s=e.querySelector('input[name="time"]');!a||!t||!s||(a.addEventListener("click",()=>{M(e);const i=t.hidden;i&&ua(e),t.hidden=!i,a.setAttribute("aria-expanded",String(i))}),t.addEventListener("click",i=>{const n=i.target instanceof Element?i.target.closest("button"):null;if(!n||n.disabled)return;if(n.dataset.yaTimeClose==="1"){Z(e);return}if(n.dataset.yaTimeClear==="1"){It(e),Z(e);return}const d=n.dataset.yaTimeHour,p=n.dataset.yaTimeMinute;d!==void 0&&(t.dataset.yaSelectedHour=d),p!==void 0&&(t.dataset.yaSelectedMinute=p);const c=String(t.dataset.yaSelectedHour??""),u=String(t.dataset.yaSelectedMinute??"");if(c&&u){s.value=`${c}:${u}`;const g=e.querySelector("[data-ya-time-label]");g&&(g.textContent=s.value)}ua(e),p!==void 0&&c&&u&&Z(e)}))}function ua(e){const a=e.querySelector("[data-ya-time-popover]"),t=e.querySelector('input[name="time"]');if(!a||!t)return;const s=/^([01]\\d|2[0-3]):([0-5]\\d)$/.exec(t.value);s&&(a.dataset.yaSelectedHour=s[1],a.dataset.yaSelectedMinute=s[2]);const i=String(a.dataset.yaSelectedHour??""),n=String(a.dataset.yaSelectedMinute??""),d=Array.from({length:24},(c,u)=>String(u).padStart(2,"0")),p=["00","15","30","45"];a.innerHTML=`
    <div class="ya-widget-time-popover-head">
      <div>
        <small>Saat seçimi</small>
        <strong>${i||"--"}:${n||"--"}</strong>
      </div>
      <div class="ya-widget-time-popover-actions">
        <button class="ya-widget-time-clear" type="button" data-ya-time-clear="1" ${t.value?"":"disabled"}>Temizle</button>
        <button class="ya-widget-time-close" type="button" data-ya-time-close="1" aria-label="Saat seçimini kapat">×</button>
      </div>
    </div>
    <div class="ya-widget-time-columns">
      <div class="ya-widget-time-column" aria-label="Saatler">
        <span>Saat</span>
        <div class="ya-widget-time-scroll">
          ${d.map(c=>`<button type="button" data-ya-time-hour="${c}" class="${i===c?"is-selected":""}">${c}</button>`).join("")}
        </div>
      </div>
      <div class="ya-widget-time-column" aria-label="Dakikalar">
        <span>Dakika</span>
        <div class="ya-widget-time-scroll ya-widget-time-minutes">
          ${p.map(c=>`<button type="button" data-ya-time-minute="${c}" class="${n===c?"is-selected":""}">${c}</button>`).join("")}
        </div>
      </div>
    </div>
  `,window.requestAnimationFrame(()=>{a.querySelector(".ya-widget-time-scroll .is-selected")?.scrollIntoView({block:"center"})})}function It(e){const a=e.querySelector("[data-ya-time-popover]"),t=e.querySelector('input[name="time"]'),s=e.querySelector("[data-ya-time-label]");t&&(t.value=""),s&&(s.textContent="Saat seç"),a&&(delete a.dataset.yaSelectedHour,delete a.dataset.yaSelectedMinute)}function Z(e){const a=e.querySelector("[data-ya-time-popover]"),t=e.querySelector("[data-ya-open-time-picker]");a&&(a.hidden=!0),t?.setAttribute("aria-expanded","false")}function qt(e){const a=e.querySelector('input[name="guest_count"]');if(!a)return;const t=()=>{const s=sa(a.value);e.querySelectorAll("[data-ya-guest-step]").forEach(i=>{const n=Number(i.dataset.yaGuestStep??0);i.disabled=n<0&&s<=1||n>0&&s>=30})};e.querySelectorAll("[data-ya-guest-step]").forEach(s=>{s.addEventListener("click",()=>{const i=Number(s.dataset.yaGuestStep??0);a.value=String(Math.min(30,Math.max(1,sa(a.value)+i))),t()})}),a.addEventListener("input",t),t()}function Lt(e){const a=e.querySelector(".ya-widget-ai textarea");a&&(a.addEventListener("input",()=>{o.questionDraft=a.value}),e.querySelectorAll("[data-ya-question-suggestion]").forEach(t=>{t.addEventListener("click",()=>{const s=String(t.dataset.yaQuestionSuggestion??"");a.value=s,o.questionDraft=s,e.querySelectorAll("[data-ya-question-suggestion]").forEach(i=>i.classList.remove("is-active")),t.classList.add("is-active"),a.focus()})}),e.querySelector("[data-ya-ai-whatsapp]")?.addEventListener("click",()=>{const t=a.value.trim()||"Bilgi almak istiyorum.";o.questionDraft=a.value;const s=`Merhaba, ${l.businessName} hakkında bilgi almak istiyorum. Sorum: ${t}`;window.open(be(l.whatsappPhone,s),"_blank","noopener,noreferrer"),P("")}))}function zt(e){e.querySelector("[data-ya-directions-question]")?.addEventListener("click",()=>{const a=String(o.context?.address||l.address||"").trim();o={...o,view:"info",questionDraft:o.context?.question?.trim()||(a?`${a} adresine nasıl gelebilirim?`:"İşletmenize nasıl gelebilirim?"),status:""},w(),B(".ya-widget-ai textarea")})}function Mt(e){const a=e.querySelector(".ya-widget-direct-whatsapp textarea"),t=e.querySelector("[data-ya-message-preview]");if(!a||!t)return;const s=()=>{o.whatsappDraft=a.value,t.textContent=a.value.trim()||"Mesajınızı yazdığınızda burada görünecek."};a.addEventListener("input",()=>{o.whatsappTopic="custom",e.querySelectorAll("[data-ya-whatsapp-topic]").forEach(i=>{const n=i.dataset.yaWhatsappTopic==="custom";i.classList.toggle("is-active",n),i.setAttribute("aria-pressed",String(n))}),s()}),e.querySelectorAll("[data-ya-whatsapp-topic]").forEach(i=>{i.addEventListener("click",()=>{const n=String(i.dataset.yaWhatsappTopic??""),d=String(i.dataset.yaWhatsappMessage??"");o.whatsappTopic=n,a.value=d,s(),e.querySelectorAll("[data-ya-whatsapp-topic]").forEach(p=>{const c=p===i;p.classList.toggle("is-active",c),p.setAttribute("aria-pressed",String(c))}),a.focus()})})}async function Pt(e){if(e.preventDefault(),!l.aiEnabled){o={...o,view:"home",status:"",aiLoading:!1,aiAnswer:""},w();return}const a=e.currentTarget,t=new FormData(a),s=String(t.get("message")??"").trim();if(!s){P("Lütfen kısa sorunuzu yazın.");return}if(!l.apiBaseUrl){P("AI bağlantısı bu sitede etkin değil. Sorunuzu WhatsApp'tan iletebilirsiniz.");return}o={...o,questionDraft:s,status:"",aiLoading:!0};const i=E.begin();w();let n="";try{const d=`${l.apiBaseUrl.replace(/\/$/,"")}/api/chat.php`,p=await fetch(d,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:s})}),c=await p.json().catch(()=>null);if(!p.ok||!c?.ok||!c.answer)throw n=ma(c?.error,c?.message),new Error("ai_failed");o={...o,aiAnswer:c.answer,aiLoading:!1,status:c.fallback?ma(c.error):""},i(c.fallback?"error":"response"),w()}catch{i("error"),o={...o,aiLoading:!1,status:n||"AI servisine ulaşılamadı. İnternet veya sunucu bağlantısını kontrol edin. Hata kodu: widget_connection_failed."},w()}}function Dt(e){e.preventDefault();const a=e.currentTarget,t=new FormData(a),s=String(t.get("message")??"").trim();if(!s){P("Lütfen bir konu seçin veya kısa mesajınızı yazın.");return}o.whatsappDraft=s,window.open(be(l.whatsappPhone,s),"_blank","noopener,noreferrer"),P("")}function P(e){o.status=e;const a=document.querySelector(`#${O} [data-ya-status]`),t=a?.querySelector("[data-ya-status-text]");!a||!t||(t.textContent=e,a.hidden=!e)}function ma(e,a=""){const t=String(e?.message||a||"AI yanıtı alınamadı.").trim(),s=String(e?.code||"unknown_ai_error").trim(),i=Number(e?.provider_status||0),n=i>0?` (HTTP ${i})`:"",d=e?.retryable===!0?" Biraz sonra yeniden deneyebilirsiniz.":"";return`${t} Hata kodu: ${s}${n}.${d}`}function Rt(){const e=fa();return e.has("accommodation")&&e.has("food_service")?"Rezervasyon, masa ve bilgi taleplerinizi hızlıca hazırlayayım.":e.has("accommodation")?"Oda, rezervasyon ve konaklama sorularınızda yardımcı olayım.":e.has("food_service")?"Masa, menü ve restoran sorularınızda yardımcı olayım.":e.has("catalog")?"Ürün, stok ve işletme bilgileri için yardımcı olayım.":"İşletme hakkında bilgi ve iletişim taleplerinizde yardımcı olayım."}function Nt(){const a=(l.businessName.trim()||"Yardımcı").replace(/\s+(?:Pansiyon|Otel|Butik Otel|Restoran|Kafe)(?:\s*(?:&|\/)\s*(?:Pansiyon|Otel|Restoran|Kafe))*\s*$/i,"").trim();return`${a&&a.toLocaleLowerCase("tr-TR")!=="yardımcı asistan"?a:"Yardımcı"} ${l.aiEnabled?"AI Asistanı":"Yardımcısı"}`}function Bt(){const e=document.getElementById(O);if(e)return e;const a=document.createElement("div");return a.id=O,document.body.appendChild(a),a}function ga(e){let a=document.getElementById(ia);a||(a=document.createElement("style"),a.id=ia,document.head.appendChild(a)),a.textContent=Na(O,e)}function fa(){return j(l)}function Ut(){return ta(l)}function ba(e){return me(l,e)}function Ft(){return Xa(l)}function Yt(){return et(l)}async function Wt(e){const a=l.apiBaseUrl.trim().replace(/\/$/,"");if(a)try{const t=await fetch(`${a}/api/business.php`,{method:"GET",headers:{Accept:"application/json"}}),s=await t.json().catch(()=>null);if(e!==oa||!t.ok||s?.ok!==!0||!s.business)return;const i=s.business,n=pe(i.profile_id),d=ue(i.public_surfaces);l={...l,businessName:String(i.display_name??"").trim()||l.businessName,whatsappPhone:String(i.whatsapp??"").trim()||l.whatsappPhone,primaryColor:String(i.primary_color??"").trim()||l.primaryColor,accentColor:String(i.accent_color??"").trim()||l.accentColor,address:String(i.address??"").trim()||l.address,mapUrl:String(i.map_url??"").trim()||l.mapUrl,aiEnabled:typeof i.ai_enabled=="boolean"?i.ai_enabled:l.aiEnabled,whatsappEnabled:typeof i.whatsapp_enabled=="boolean"?i.whatsapp_enabled:l.whatsappEnabled,requestsEnabled:typeof i.requests_enabled=="boolean"?i.requests_enabled:l.requestsEnabled,profileId:n||l.profileId,publicSurfaces:d.length>0?d:l.publicSurfaces},(o.view==="form"&&!ba(o.requestType)||o.view==="info"&&!l.aiEnabled||o.view==="whatsapp"&&!Ut())&&(o={...o,view:"home",status:"",aiLoading:!1,aiAnswer:"",questionDraft:""}),ga(l),w()}catch{}}function jt(){ra||(ra=!0,document.addEventListener("click",e=>{const a=e.target instanceof Element?e.target.closest("[data-ya-action]"):null;if(!a||a.closest(`#${O}`))return;const t=rt(a.dataset.yaAction);t&&(e.preventDefault(),K({intent:t,context:{resourceType:a.dataset.yaResourceType,resourceId:a.dataset.yaResourceId,resourceName:a.dataset.yaResourceName,imageUrl:a.dataset.yaImageUrl,sourcePath:a.dataset.yaSourcePath||window.location.pathname,question:a.dataset.yaQuestion,address:a.dataset.yaAddress,mapUrl:a.dataset.yaMapUrl}}))}))}function B(e){window.requestAnimationFrame(()=>{document.querySelector(`#${O} ${e}`)?.focus()})}function b(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}function v(e){return b(e).replace(/`/g,"&#096;")}return window.YardimciAsistanWidget={init:H,open:K,close:V},document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>H(),{once:!0}):H(),Ia(),ha(),$.buildWhatsAppMessage=lt,$.close=V,$.createWhatsAppLink=be,$.init=H,$.normalizeInternationalPhone=pt,$.open=K,Object.defineProperty($,Symbol.toStringTag,{value:"Module"}),$})({});
