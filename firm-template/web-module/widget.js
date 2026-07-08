var YardimciAsistanWidget=(function(s){"use strict";const _={pension_reservation:"Pansiyon rezervasyonu",restaurant_reservation:"Masa rezervasyonu",general_info:"Bilgi talebi"},$=/^5\d{9}$/,v="Telefon numarası Türkiye cep telefonu formatında olmalı. Örnek: 05xx xxx xx xx";function T(e,t){const a=h(e);if(!a.ok)return{ok:!1,mode:"wa_link",code:"invalid_phone",message:a.error};const o=t.trim();if(!o)return{ok:!1,mode:"wa_link",code:"empty_message",message:"WhatsApp mesajı boş olmamalı."};const p=encodeURIComponent(o);return{ok:!0,mode:"wa_link",url:`https://wa.me/${a.whatsapp}?text=${p}`,whatsappPhone:a.whatsapp,phoneDisplay:a.display,message:o,encodedMessage:p}}function z(e,t){const a=T(e,t);return a.ok?a.url:""}function A(e,t){const a=_[e.request_type]??"Bilgi talebi";return[`Merhaba, ${t} için talep oluşturmak istiyorum.`,`Talep türü: ${a}`,`Ad soyad: ${e.customer_name}`,`Telefon: ${e.customer_phone}`,`Tarih: ${e.date_text}`,e.time_text?`Saat: ${e.time_text}`:"",`Kişi sayısı: ${e.guest_count}`,e.message?`Not: ${e.message}`:"","Lütfen bilgileri kontrol edip gönder tuşuna basın."].filter(Boolean).join(`
`)}function h(e){const t=y(e);return t.ok?{ok:!0,whatsapp:t.whatsapp,e164:t.e164,national:t.national,display:E(e)}:{ok:!1,error:t.error}}function y(e){const a=e.trim().replace(/[^\d+]/g,"").replace(/^00/,"+"),o=P(a);return!o||!$.test(o)?{ok:!1,error:v}:{ok:!0,e164:`+90${o}`,national:o,whatsapp:`90${o}`}}function E(e){const t=y(e);if(!t.ok)return e.trim();const a=t.national.slice(0,3),o=t.national.slice(3,6),p=t.national.slice(6,8),i=t.national.slice(8,10);return`+90 ${a} ${o} ${p} ${i}`}function P(e){return e.startsWith("+90")?e.slice(3):e.startsWith("90")&&e.length===12?e.slice(2):e.startsWith("0")&&e.length===11?e.slice(1):e.length===10?e:null}const d="yardimci-asistan-widget",b="yardimci-asistan-widget-style",w={businessName:"Yardımcı Asistan",whatsappPhone:"",apiBaseUrl:"",menuUrl:"",primaryColor:"#2F6F5E",accentColor:"#E47863"};let r={...w},n={isOpen:!1,view:"home",status:""};function u(e={}){r={...w,...N(),...e},L(r),l()}function g(){n={...n,isOpen:!0},l()}function f(){n={...n,isOpen:!1,view:"home",status:""},l()}function m(e,t){return z(e,t)}function x(e,t=r.businessName){return A(e,t)}function k(e){const t=h(e);return t.ok?{ok:!0,whatsapp:t.whatsapp}:{ok:!1,error:t.error}}function l(){const e=j();e.innerHTML=n.isOpen?M():S(),C(e)}function S(){return`
    <button class="ya-widget-button" type="button" data-ya-open aria-label="Yardımcı Asistan'ı aç">
      <span>YA</span>
      <strong>Yardımcı Asistan</strong>
    </button>
  `}function M(){return`
    <section class="ya-widget-panel" aria-label="Yardımcı Asistan">
      <header class="ya-widget-header">
        <div>
          <span>YA</span>
          <strong>${c(r.businessName)}</strong>
        </div>
        <button type="button" data-ya-close aria-label="Kapat">x</button>
      </header>
      ${n.view==="home"?O():""}
      ${n.view==="form"?W():""}
      ${n.view==="info"?q():""}
      ${n.status?`<p class="ya-widget-status">${c(n.status)}</p>`:""}
    </section>
  `}function O(){return`
    <div class="ya-widget-home">
      <button type="button" data-ya-view="form">
        <strong>Rezervasyon Talebi</strong>
        <span>Oda veya masa için kısa talep bırakın.</span>
      </button>
      <button type="button" data-ya-view="info">
        <strong>Bilgi Al</strong>
        <span>Telefon, adres ve çalışma saatlerini görün.</span>
      </button>
      <a href="${m(r.whatsappPhone,"Merhaba, bilgi almak istiyorum.")}" target="_blank" rel="noreferrer">
        <strong>WhatsApp'tan Yaz</strong>
        <span>Mesajınız hazır açılsın.</span>
      </a>
      ${r.menuUrl?`<a class="ya-widget-menu-link" href="${Y(r.menuUrl)}" target="_blank" rel="noreferrer">Menüyü Gör</a>`:""}
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
  `}function q(){return`
    <div class="ya-widget-info">
      <p><strong>${c(r.businessName)}</strong></p>
      ${r.whatsappPhone?`<p>${c(r.whatsappPhone)}</p>`:""}
      <a href="${m(r.whatsappPhone,"Merhaba, bilgi almak istiyorum.")}" target="_blank" rel="noreferrer">WhatsApp'tan Yaz</a>
      <button type="button" class="ya-widget-back" data-ya-view="home">Geri</button>
    </div>
  `}function C(e){e.querySelector("[data-ya-open]")?.addEventListener("click",g),e.querySelector("[data-ya-close]")?.addEventListener("click",f),e.querySelectorAll("[data-ya-view]").forEach(t=>{t.addEventListener("click",()=>{n={...n,isOpen:!0,view:t.dataset.yaView,status:""},l()})}),e.querySelector("[data-ya-form]")?.addEventListener("submit",R)}function R(e){e.preventDefault();const t=e.currentTarget,a=new FormData(t),o=String(a.get("customer_phone")??""),p=k(o);if(!p.ok){n={...n,status:p.error},l();return}const i={request_type:String(a.get("request_type")??"general_info"),customer_name:String(a.get("customer_name")??"").trim(),customer_phone:o.trim(),date_text:String(a.get("date_text")??"").trim(),guest_count:Number(a.get("guest_count")??1),message:String(a.get("message")??"").trim(),source:"web_form",whatsapp_message:""};if(!i.customer_name||!i.date_text||!i.guest_count){n={...n,status:"Lütfen gerekli alanları doldurun."},l();return}i.whatsapp_message=x(i),B(i),window.open(m(r.whatsappPhone,i.whatsapp_message),"_blank","noopener,noreferrer"),n={...n,status:"WhatsApp mesajı hazırlandı. Bilgileri kontrol edip gönder tuşuna basın."},l()}async function B(e){if(r.apiBaseUrl)try{const t=`${r.apiBaseUrl.replace(/\/$/,"")}/api/request.php`;if(!(await fetch(t,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e),keepalive:!0})).ok)throw new Error("request_failed")}catch{n={...n,status:"Talep kaydı sırasında sorun oldu. WhatsApp mesajınız hazırlandı."},l()}}function j(){const e=document.getElementById(d);if(e)return e;const t=document.createElement("div");return t.id=d,document.body.appendChild(t),t}function L(e){if(document.getElementById(b))return;const t=document.createElement("style");t.id=b,t.textContent=`
    #${d} {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483000;
      color: #172033;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #${d} * {
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

    .ya-widget-button span,
    .ya-widget-header span {
      display: grid;
      width: 36px;
      height: 36px;
      place-items: center;
      border-radius: 8px;
      color: ${e.primaryColor};
      background: #ffffff;
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
    .ya-widget-form {
      display: grid;
      gap: 10px;
      padding: 12px;
    }

    .ya-widget-home button,
    .ya-widget-home a,
    .ya-widget-info a,
    .ya-widget-form button {
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

    .ya-widget-form label {
      display: grid;
      gap: 5px;
      color: #172033;
      font-size: 13px;
      font-weight: 800;
    }

    .ya-widget-form input,
    .ya-widget-form select,
    .ya-widget-form textarea {
      width: 100%;
      min-height: 40px;
      padding: 9px 10px;
      border: 1px solid #ded8ce;
      border-radius: 8px;
      color: #172033;
      background: #ffffff;
      font: inherit;
    }

    .ya-widget-form textarea {
      min-height: 76px;
      resize: vertical;
    }

    .ya-widget-form button[type="submit"],
    .ya-widget-info a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      background: ${e.primaryColor};
      text-align: center;
      font-weight: 800;
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
      #${d} {
        right: 10px;
        bottom: 10px;
      }

      .ya-widget-button strong {
        display: none;
      }
    }
  `,document.head.appendChild(t)}function N(){const t=document.currentScript?.dataset??{};return U({businessName:t.businessName,whatsappPhone:t.whatsappPhone,apiBaseUrl:t.apiBaseUrl,menuUrl:t.menuUrl,primaryColor:t.primaryColor,accentColor:t.accentColor})}function U(e){return Object.fromEntries(Object.entries(e).filter(([,t])=>typeof t=="string"&&t.length>0))}function c(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}function Y(e){return c(e).replace(/`/g,"&#096;")}return window.YardimciAsistanWidget={init:u,open:g,close:f},document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>u(),{once:!0}):u(),s.buildWhatsAppMessage=x,s.close=f,s.createWhatsAppLink=m,s.init=u,s.normalizeTRMobilePhone=k,s.open=g,Object.defineProperty(s,Symbol.toStringTag,{value:"Module"}),s})({});
