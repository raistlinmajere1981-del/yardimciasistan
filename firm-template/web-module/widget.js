var YardimciAsistanWidget=(function(d){"use strict";const T={pension_reservation:"Pansiyon rezervasyonu",restaurant_reservation:"Masa rezervasyonu",general_info:"Bilgi talebi"},z=/^5\d{9}$/,A="Telefon numarası Türkiye cep telefonu formatında olmalı. Örnek: 05xx xxx xx xx";function S(e,t){const n=h(e);if(!n.ok)return{ok:!1,mode:"wa_link",code:"invalid_phone",message:n.error};const i=t.trim();if(!i)return{ok:!1,mode:"wa_link",code:"empty_message",message:"WhatsApp mesajı boş olmamalı."};const l=encodeURIComponent(i);return{ok:!0,mode:"wa_link",url:`https://wa.me/${n.whatsapp}?text=${l}`,whatsappPhone:n.whatsapp,phoneDisplay:n.display,message:i,encodedMessage:l}}function E(e,t){const n=S(e,t);return n.ok?n.url:""}function P(e,t){const n=T[e.request_type]??"Bilgi talebi";return[`Merhaba, ${t} için talep oluşturmak istiyorum.`,`Talep türü: ${n}`,`Ad soyad: ${e.customer_name}`,`Telefon: ${e.customer_phone}`,`Tarih: ${e.date_text}`,e.time_text?`Saat: ${e.time_text}`:"",`Kişi sayısı: ${e.guest_count}`,e.message?`Not: ${e.message}`:"","Lütfen bilgileri kontrol edip gönder tuşuna basın."].filter(Boolean).join(`
`)}function h(e){const t=b(e);return t.ok?{ok:!0,whatsapp:t.whatsapp,e164:t.e164,national:t.national,display:L(e)}:{ok:!1,error:t.error}}function b(e){const n=e.trim().replace(/[^\d+]/g,"").replace(/^00/,"+"),i=M(n);return!i||!z.test(i)?{ok:!1,error:A}:{ok:!0,e164:`+90${i}`,national:i,whatsapp:`90${i}`}}function L(e){const t=b(e);if(!t.ok)return e.trim();const n=t.national.slice(0,3),i=t.national.slice(3,6),l=t.national.slice(6,8),s=t.national.slice(8,10);return`+90 ${n} ${i} ${l} ${s}`}function M(e){return e.startsWith("+90")?e.slice(3):e.startsWith("90")&&e.length===12?e.slice(2):e.startsWith("0")&&e.length===11?e.slice(1):e.length===10?e:null}const c="yardimci-asistan-widget",w="yardimci-asistan-widget-style",x={businessName:"Yardımcı Asistan",whatsappPhone:"",apiBaseUrl:"",menuUrl:"",logoUrl:"",primaryColor:"#2F6F5E",accentColor:"#E47863"};let r={...x},a={isOpen:!1,view:"home",status:"",aiAnswer:"",aiLoading:!1};function m(e={}){r={...x,...F(),...e},D(r),o()}function f(){a={...a,isOpen:!0},o()}function y(){a={...a,isOpen:!1,view:"home",status:"",aiLoading:!1},o()}function g(e,t){return E(e,t)}function k(e,t=r.businessName){return P(e,t)}function _(e){const t=h(e);return t.ok?{ok:!0,whatsapp:t.whatsapp}:{ok:!1,error:t.error}}function o(){const e=I();e.innerHTML=a.isOpen?O():U(),j(e)}function U(){return`
    <button class="ya-widget-button" type="button" data-ya-open aria-label="Yardımcı Asistan'ı aç">
      ${$()}
      <strong>Yardımcı Asistan</strong>
    </button>
  `}function O(){return`
    <section class="ya-widget-panel" aria-label="Yardımcı Asistan">
      <header class="ya-widget-header">
        <div>
          ${$()}
          <strong>${p(r.businessName)}</strong>
        </div>
        <button type="button" data-ya-close aria-label="Kapat">x</button>
      </header>
      ${a.view==="home"?q():""}
      ${a.view==="form"?C():""}
      ${a.view==="info"?W():""}
      ${a.status?`<p class="ya-widget-status">${p(a.status)}</p>`:""}
    </section>
  `}function $(){return r.logoUrl?`<img class="ya-widget-mark" src="${v(r.logoUrl)}" alt="" aria-hidden="true" />`:'<span class="ya-widget-mark ya-widget-mark-fallback">YA</span>'}function q(){return`
    <div class="ya-widget-home">
      <button type="button" data-ya-view="form">
        <strong>Rezervasyon Talebi</strong>
        <span>Oda veya masa için kısa talep bırakın.</span>
      </button>
      <button type="button" data-ya-view="info">
        <strong>Bilgi Al</strong>
        <span>Telefon, adres ve çalışma saatlerini görün.</span>
      </button>
      <a href="${g(r.whatsappPhone,"Merhaba, bilgi almak istiyorum.")}" target="_blank" rel="noreferrer">
        <strong>WhatsApp'tan Yaz</strong>
        <span>Mesajınız hazır açılsın.</span>
      </a>
      ${r.menuUrl?`<a class="ya-widget-menu-link" href="${v(r.menuUrl)}" target="_blank" rel="noreferrer">Menüyü Gör</a>`:""}
    </div>
  `}function C(){return`
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
  `}function W(){return`
    <div class="ya-widget-info">
      <p><strong>${p(r.businessName)}</strong></p>
      ${r.whatsappPhone?`<p>${p(r.whatsappPhone)}</p>`:""}
      ${B()}
      <a href="${g(r.whatsappPhone,"Merhaba, bilgi almak istiyorum.")}" target="_blank" rel="noreferrer">WhatsApp'tan Yaz</a>
      <button type="button" class="ya-widget-back" data-ya-view="home">Geri</button>
    </div>
  `}function B(){return r.apiBaseUrl?`
    <form class="ya-widget-ai" data-ya-ai-form>
      <label>
        Kısa soru
        <textarea name="message" required maxlength="1200" placeholder="Örn. Bu akşam 4 kişilik masa var mı?"></textarea>
      </label>
      <button type="submit" ${a.aiLoading?"disabled":""}>${a.aiLoading?"Yanıt Hazırlanıyor":"AI Yardımcıya Sor"}</button>
    </form>
    ${a.aiAnswer?`<p class="ya-widget-ai-answer"><strong>AI Yardımcı</strong><span>${p(a.aiAnswer)}</span></p>`:""}
  `:""}function j(e){e.querySelector("[data-ya-open]")?.addEventListener("click",f),e.querySelector("[data-ya-close]")?.addEventListener("click",y),e.querySelectorAll("[data-ya-view]").forEach(t=>{t.addEventListener("click",()=>{a={...a,isOpen:!0,view:t.dataset.yaView,status:"",aiLoading:!1},o()})}),e.querySelector("[data-ya-form]")?.addEventListener("submit",R),e.querySelector("[data-ya-ai-form]")?.addEventListener("submit",Y)}function R(e){e.preventDefault();const t=e.currentTarget,n=new FormData(t),i=String(n.get("customer_phone")??""),l=_(i);if(!l.ok){a={...a,status:l.error},o();return}const s={request_type:String(n.get("request_type")??"general_info"),customer_name:String(n.get("customer_name")??"").trim(),customer_phone:i.trim(),date_text:String(n.get("date_text")??"").trim(),guest_count:Number(n.get("guest_count")??1),message:String(n.get("message")??"").trim(),source:"web_form",whatsapp_message:""};if(!s.customer_name||!s.date_text||!s.guest_count){a={...a,status:"Lütfen gerekli alanları doldurun."},o();return}s.whatsapp_message=k(s),N(s),window.open(g(r.whatsappPhone,s.whatsapp_message),"_blank","noopener,noreferrer"),a={...a,status:"WhatsApp mesajı hazırlandı. Bilgileri kontrol edip gönder tuşuna basın."},o()}async function N(e){if(r.apiBaseUrl)try{const t=`${r.apiBaseUrl.replace(/\/$/,"")}/api/request.php`;if(!(await fetch(t,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e),keepalive:!0})).ok)throw new Error("request_failed")}catch{a={...a,status:"Talep kaydı sırasında sorun oldu. WhatsApp mesajınız hazırlandı."},o()}}async function Y(e){e.preventDefault();const t=e.currentTarget,n=new FormData(t),i=String(n.get("message")??"").trim();if(!i){a={...a,status:"Lütfen kısa sorunuzu yazın."},o();return}a={...a,status:"Yanıt hazırlanıyor.",aiLoading:!0},o();try{const l=`${r.apiBaseUrl.replace(/\/$/,"")}/api/chat.php`,s=await fetch(l,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:i})}),u=await s.json().catch(()=>null);if(!s.ok||!u?.ok||!u.answer)throw new Error(u?.message||"ai_failed");a={...a,aiAnswer:u.answer,aiLoading:!1,status:u.fallback?"AI kapalıyken güvenli yanıt gösterildi.":""},o()}catch{a={...a,aiLoading:!1,status:"AI yanıtı alınamadı. WhatsApp üzerinden yazabilirsiniz."},o()}}function I(){const e=document.getElementById(c);if(e)return e;const t=document.createElement("div");return t.id=c,document.body.appendChild(t),t}function D(e){if(document.getElementById(w))return;const t=document.createElement("style");t.id=w,t.textContent=`
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
  `,document.head.appendChild(t)}function F(){const t=document.currentScript?.dataset??{};return H({businessName:t.businessName,whatsappPhone:t.whatsappPhone,apiBaseUrl:t.apiBaseUrl,menuUrl:t.menuUrl,logoUrl:t.logoUrl,primaryColor:t.primaryColor,accentColor:t.accentColor})}function H(e){return Object.fromEntries(Object.entries(e).filter(([,t])=>typeof t=="string"&&t.length>0))}function p(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}function v(e){return p(e).replace(/`/g,"&#096;")}return window.YardimciAsistanWidget={init:m,open:f,close:y},document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>m(),{once:!0}):m(),d.buildWhatsAppMessage=k,d.close=y,d.createWhatsAppLink=g,d.init=m,d.normalizeTRMobilePhone=_,d.open=f,Object.defineProperty(d,Symbol.toStringTag,{value:"Module"}),d})({});
