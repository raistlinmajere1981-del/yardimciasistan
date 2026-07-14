var YardimciAsistanWidget=(function(d){"use strict";const A={pension_reservation:"Pansiyon rezervasyonu",restaurant_reservation:"Masa rezervasyonu",general_info:"Bilgi talebi"},S=/^5\d{9}$/,E="Telefon numarası Türkiye cep telefonu formatında olmalı. Örnek: 05xx xxx xx xx";function P(e,t){const n=b(e);if(!n.ok)return{ok:!1,mode:"wa_link",code:"invalid_phone",message:n.error};const r=t.trim();if(!r)return{ok:!1,mode:"wa_link",code:"empty_message",message:"WhatsApp mesajı boş olmamalı."};const o=encodeURIComponent(r);return{ok:!0,mode:"wa_link",url:`https://wa.me/${n.whatsapp}?text=${o}`,whatsappPhone:n.whatsapp,phoneDisplay:n.display,message:r,encodedMessage:o}}function L(e,t){const n=P(e,t);return n.ok?n.url:""}function M(e,t){const n=A[e.request_type]??"Bilgi talebi";return[`Merhaba, ${t} için talep oluşturmak istiyorum.`,`Talep türü: ${n}`,`Ad soyad: ${e.customer_name}`,`Telefon: ${e.customer_phone}`,`Tarih: ${e.date_text}`,e.time_text?`Saat: ${e.time_text}`:"",`Kişi sayısı: ${e.guest_count}`,e.message?`Not: ${e.message}`:"","Lütfen bilgileri kontrol edip gönder tuşuna basın."].filter(Boolean).join(`
`)}function b(e){const t=w(e);return t.ok?{ok:!0,whatsapp:t.whatsapp,e164:t.e164,national:t.national,display:U(e)}:{ok:!1,error:t.error}}function w(e){const n=e.trim().replace(/[^\d+]/g,"").replace(/^00/,"+"),r=O(n);return!r||!S.test(r)?{ok:!1,error:E}:{ok:!0,e164:`+90${r}`,national:r,whatsapp:`90${r}`}}function U(e){const t=w(e);if(!t.ok)return e.trim();const n=t.national.slice(0,3),r=t.national.slice(3,6),o=t.national.slice(6,8),s=t.national.slice(8,10);return`+90 ${n} ${r} ${o} ${s}`}function O(e){return e.startsWith("+90")?e.slice(3):e.startsWith("90")&&e.length===12?e.slice(2):e.startsWith("0")&&e.length===11?e.slice(1):e.length===10?e:null}const c="yardimci-asistan-widget",x="yardimci-asistan-widget-style",k={businessName:"Yardımcı Asistan",whatsappPhone:"",apiBaseUrl:"",menuUrl:"",logoUrl:"",primaryColor:"#2F6F5E",accentColor:"#E47863"};let i={...k},a={isOpen:!1,view:"home",status:"",aiAnswer:"",aiLoading:!1};function m(e={}){i={...k,...K(),...e},H(i),l()}function y(){a={...a,isOpen:!0},l()}function h(){a={...a,isOpen:!1,view:"home",status:"",aiLoading:!1},l()}function g(e,t){return L(e,t)}function _(e,t=i.businessName){return M(e,t)}function $(e){const t=b(e);return t.ok?{ok:!0,whatsapp:t.whatsapp}:{ok:!1,error:t.error}}function l(){const e=F();e.innerHTML=a.isOpen?B():q(),N(e)}function q(){return`
    <button class="ya-widget-button" type="button" data-ya-open aria-label="Yardımcı Asistan'ı aç">
      ${v()}
      <strong>Yardımcı Asistan</strong>
    </button>
  `}function B(){return`
    <section class="ya-widget-panel" aria-label="Yardımcı Asistan">
      <header class="ya-widget-header">
        <div>
          ${v()}
          <strong>${u(i.businessName)}</strong>
        </div>
        <button type="button" data-ya-close aria-label="Kapat">x</button>
      </header>
      ${a.view==="home"?C():""}
      ${a.view==="form"?W():""}
      ${a.view==="info"?j():""}
      ${a.status?`<p class="ya-widget-status">${u(a.status)}</p>`:""}
    </section>
  `}function v(){return i.logoUrl?`<img class="ya-widget-mark" src="${z(i.logoUrl)}" alt="" aria-hidden="true" />`:'<span class="ya-widget-mark ya-widget-mark-fallback">YA</span>'}function C(){return`
    <div class="ya-widget-home">
      <button type="button" data-ya-view="form">
        <strong>Rezervasyon Talebi</strong>
        <span>Oda veya masa için kısa talep bırakın.</span>
      </button>
      <button type="button" data-ya-view="info">
        <strong>Bilgi Al</strong>
        <span>Telefon, adres ve çalışma saatlerini görün.</span>
      </button>
      <a href="${g(i.whatsappPhone,"Merhaba, bilgi almak istiyorum.")}" target="_blank" rel="noreferrer">
        <strong>WhatsApp'tan Yaz</strong>
        <span>Mesajınız hazır açılsın.</span>
      </a>
      ${i.menuUrl?`<a class="ya-widget-menu-link" href="${z(i.menuUrl)}" target="_blank" rel="noreferrer">Menüyü Gör</a>`:""}
    </div>
  `}function W(){return`
    <form class="ya-widget-form" data-ya-form>
      <label>
        Talep türü
        <select name="request_type">
          <option value="pension_reservation">Pansiyon rezervasyonu</option>
          <option value="restaurant_reservation">Masa rezervasyonu</option>
          <option value="general_info">Bilgi talebi</option>
        </select>
      </label>
      <label>
        Ad soyad
        <input name="customer_name" required autocomplete="name" placeholder="Adınız soyadınız" />
      </label>
      <label>
        Telefon
        <input name="customer_phone" required inputmode="tel" autocomplete="tel" placeholder="05xx xxx xx xx" />
      </label>
      <label>
        Tarih
        <input name="date_text" required placeholder="Örn. 12 Temmuz" />
      </label>
      <label>
        Kişi sayısı
        <input name="guest_count" required type="number" min="1" value="2" />
      </label>
      <label>
        Not
        <textarea name="message" placeholder="Kısa notunuz"></textarea>
      </label>
      <p>Formdaki bilgileriniz talebinize dönüş yapılması amacıyla işletmeye iletilir.</p>
      <button type="submit">WhatsApp Mesajını Hazırla</button>
      <button type="button" class="ya-widget-back" data-ya-view="home">Geri</button>
    </form>
  `}function j(){return`
    <div class="ya-widget-info">
      <p><strong>${u(i.businessName)}</strong></p>
      ${i.whatsappPhone?`<p>${u(i.whatsappPhone)}</p>`:""}
      ${R()}
      <a href="${g(i.whatsappPhone,"Merhaba, bilgi almak istiyorum.")}" target="_blank" rel="noreferrer">WhatsApp'tan Yaz</a>
      <button type="button" class="ya-widget-back" data-ya-view="home">Geri</button>
    </div>
  `}function R(){return i.apiBaseUrl?`
    <form class="ya-widget-ai" data-ya-ai-form>
      <label>
        Kısa soru
        <textarea name="message" required maxlength="1200" placeholder="Örn. Bu akşam 4 kişilik masa var mı?"></textarea>
      </label>
      <button type="submit" ${a.aiLoading?"disabled":""}>${a.aiLoading?"Yanıt Hazırlanıyor":"AI Yardımcıya Sor"}</button>
    </form>
    ${a.aiAnswer?`<p class="ya-widget-ai-answer"><strong>AI Yardımcı</strong><span>${u(a.aiAnswer)}</span></p>`:""}
  `:""}function N(e){e.querySelector("[data-ya-open]")?.addEventListener("click",y),e.querySelector("[data-ya-close]")?.addEventListener("click",h),e.querySelectorAll("[data-ya-view]").forEach(t=>{t.addEventListener("click",()=>{a={...a,isOpen:!0,view:t.dataset.yaView,status:"",aiLoading:!1},l()})}),e.querySelector("[data-ya-form]")?.addEventListener("submit",Y),e.querySelector("[data-ya-ai-form]")?.addEventListener("submit",D)}function Y(e){e.preventDefault();const t=e.currentTarget,n=new FormData(t),r=String(n.get("customer_phone")??""),o=$(r);if(!o.ok){a={...a,status:o.error},l();return}const s={request_type:String(n.get("request_type")??"general_info"),customer_name:String(n.get("customer_name")??"").trim(),customer_phone:r.trim(),date_text:String(n.get("date_text")??"").trim(),guest_count:Number(n.get("guest_count")??1),message:String(n.get("message")??"").trim(),source:"web_form",whatsapp_message:""};if(!s.customer_name||!s.date_text||!s.guest_count){a={...a,status:"Lütfen gerekli alanları doldurun."},l();return}s.whatsapp_message=_(s),I(s),window.open(g(i.whatsappPhone,s.whatsapp_message),"_blank","noopener,noreferrer"),a={...a,status:"WhatsApp mesajı hazırlandı. Bilgileri kontrol edip gönder tuşuna basın."},l()}async function I(e){if(i.apiBaseUrl)try{const t=`${i.apiBaseUrl.replace(/\/$/,"")}/api/request.php`;if(!(await fetch(t,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e),keepalive:!0})).ok)throw new Error("request_failed")}catch{a={...a,status:"Talep kaydı sırasında sorun oldu. WhatsApp mesajınız hazırlandı."},l()}}async function D(e){e.preventDefault();const t=e.currentTarget,n=new FormData(t),r=String(n.get("message")??"").trim();if(!r){a={...a,status:"Lütfen kısa sorunuzu yazın."},l();return}a={...a,status:"Yanıt hazırlanıyor.",aiLoading:!0},l();let o="";try{const s=`${i.apiBaseUrl.replace(/\/$/,"")}/api/chat.php`,f=await fetch(s,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:r})}),p=await f.json().catch(()=>null);if(!f.ok||!p?.ok||!p.answer)throw o=T(p?.error,p?.message),new Error("ai_failed");a={...a,aiAnswer:p.answer,aiLoading:!1,status:p.fallback?T(p.error):""},l()}catch{a={...a,aiLoading:!1,status:o||"AI servisine ulaşılamadı. İnternet veya sunucu bağlantısını kontrol edin. Hata kodu: widget_connection_failed."},l()}}function T(e,t=""){const n=String(e?.message||t||"AI yanıtı alınamadı.").trim(),r=String(e?.code||"unknown_ai_error").trim(),o=Number(e?.provider_status||0),s=o>0?` (HTTP ${o})`:"",f=e?.retryable===!0?" Biraz sonra yeniden deneyebilirsiniz.":"";return`${n} Hata kodu: ${r}${s}.${f}`}function F(){const e=document.getElementById(c);if(e)return e;const t=document.createElement("div");return t.id=c,document.body.appendChild(t),t}function H(e){if(document.getElementById(x))return;const t=document.createElement("style");t.id=x,t.textContent=`
    #${c} {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483000;
      color: #172033;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #${c} * {
      box-sizing: border-box;
    }

    .ya-widget-button {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 54px;
      padding: 8px 14px 8px 8px;
      border: 0;
      border-radius: 8px;
      color: #ffffff;
      background: ${e.primaryColor};
      box-shadow: 0 16px 42px rgba(23, 32, 51, 0.24);
      cursor: pointer;
    }

    .ya-widget-mark {
      width: 36px;
      height: 36px;
      flex: 0 0 auto;
      object-fit: contain;
      border-radius: 8px;
      background: #ffffff;
    }

    .ya-widget-mark-fallback {
      display: grid;
      place-items: center;
      color: ${e.primaryColor};
      font-weight: 800;
    }

    .ya-widget-panel {
      width: min(360px, calc(100vw - 28px));
      overflow: hidden;
      border: 1px solid #ded8ce;
      border-radius: 8px;
      background: #fff8ee;
      box-shadow: 0 18px 52px rgba(23, 32, 51, 0.24);
    }

    .ya-widget-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px;
      color: #ffffff;
      background: ${e.primaryColor};
    }

    .ya-widget-header div {
      display: flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
    }

    .ya-widget-header strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ya-widget-header button {
      width: 34px;
      height: 34px;
      border: 1px solid rgba(255, 255, 255, 0.28);
      border-radius: 8px;
      color: #ffffff;
      background: transparent;
      cursor: pointer;
      font-size: 22px;
      line-height: 1;
    }

    .ya-widget-home,
    .ya-widget-info,
    .ya-widget-form,
    .ya-widget-ai {
      display: grid;
      gap: 10px;
      padding: 12px;
    }

    .ya-widget-home button,
    .ya-widget-home a,
    .ya-widget-info a,
    .ya-widget-form button,
    .ya-widget-ai button {
      display: grid;
      gap: 4px;
      width: 100%;
      min-height: 52px;
      padding: 12px;
      border: 1px solid #ded8ce;
      border-radius: 8px;
      color: #172033;
      background: #ffffff;
      text-align: left;
      text-decoration: none;
      cursor: pointer;
    }

    .ya-widget-home span,
    .ya-widget-form p,
    .ya-widget-info p,
    .ya-widget-ai-answer span,
    .ya-widget-status {
      margin: 0;
      color: #58606f;
      font-size: 13px;
      line-height: 1.45;
    }

    .ya-widget-menu-link {
      min-height: 40px !important;
      place-items: center;
      color: ${e.primaryColor} !important;
      font-weight: 800;
    }

    .ya-widget-form label,
    .ya-widget-ai label {
      display: grid;
      gap: 5px;
      color: #172033;
      font-size: 13px;
      font-weight: 800;
    }

    .ya-widget-form input,
    .ya-widget-form select,
    .ya-widget-form textarea,
    .ya-widget-ai textarea {
      width: 100%;
      min-height: 40px;
      padding: 9px 10px;
      border: 1px solid #ded8ce;
      border-radius: 8px;
      color: #172033;
      background: #ffffff;
      font: inherit;
    }

    .ya-widget-form textarea,
    .ya-widget-ai textarea {
      min-height: 76px;
      resize: vertical;
    }

    .ya-widget-form button[type="submit"],
    .ya-widget-ai button[type="submit"],
    .ya-widget-info a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      background: ${e.primaryColor};
      text-align: center;
      font-weight: 800;
    }

    .ya-widget-ai button[disabled] {
      cursor: wait;
      opacity: 0.72;
    }

    .ya-widget-ai-answer {
      display: grid;
      gap: 5px;
      margin: 0;
      padding: 10px;
      border: 1px solid #ded8ce;
      border-radius: 8px;
      background: #ffffff;
    }

    .ya-widget-ai-answer strong {
      color: #172033;
      font-size: 13px;
    }

    .ya-widget-form .ya-widget-back,
    .ya-widget-info .ya-widget-back {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      background: transparent;
      text-align: center;
    }

    .ya-widget-status {
      padding: 0 12px 12px;
      color: ${e.accentColor};
      font-weight: 700;
    }

    @media (max-width: 520px) {
      #${c} {
        right: 10px;
        bottom: 10px;
      }

      .ya-widget-button strong {
        display: none;
      }
    }
  `,document.head.appendChild(t)}function K(){const t=document.currentScript?.dataset??{};return G({businessName:t.businessName,whatsappPhone:t.whatsappPhone,apiBaseUrl:t.apiBaseUrl,menuUrl:t.menuUrl,logoUrl:t.logoUrl,primaryColor:t.primaryColor,accentColor:t.accentColor})}function G(e){return Object.fromEntries(Object.entries(e).filter(([,t])=>typeof t=="string"&&t.length>0))}function u(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}function z(e){return u(e).replace(/`/g,"&#096;")}return window.YardimciAsistanWidget={init:m,open:y,close:h},document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>m(),{once:!0}):m(),d.buildWhatsAppMessage=_,d.close=h,d.createWhatsAppLink=g,d.init=m,d.normalizeTRMobilePhone=$,d.open=y,Object.defineProperty(d,Symbol.toStringTag,{value:"Module"}),d})({});
