var YardimciAsistanWidget=(function(y){"use strict";const R={pension_reservation:"Pansiyon rezervasyonu",restaurant_reservation:"Masa rezervasyonu",general_info:"Bilgi talebi"},I=/^5\d{9}$/,O="Telefon numarası Türkiye cep telefonu formatında olmalı. Örnek: 05xx xxx xx xx";function Y(e,a){const t=T(e);if(!t.ok)return{ok:!1,mode:"wa_link",code:"invalid_phone",message:t.error};const i=a.trim();if(!i)return{ok:!1,mode:"wa_link",code:"empty_message",message:"WhatsApp mesajı boş olmamalı."};const r=encodeURIComponent(i);return{ok:!0,mode:"wa_link",url:`https://wa.me/${t.whatsapp}?text=${r}`,whatsappPhone:t.whatsapp,phoneDisplay:t.display,message:i,encodedMessage:r}}function U(e,a){const t=Y(e,a);return t.ok?t.url:""}function F(e,a){const t=R[e.request_type]??"Bilgi talebi";return[`Merhaba, ${a} için talep oluşturmak istiyorum.`,`Talep türü: ${t}`,`Ad soyad: ${e.customer_name}`,`Telefon: ${e.customer_phone}`,`Tarih: ${e.date_text}`,e.time_text?`Saat: ${e.time_text}`:"",`Kişi sayısı: ${e.guest_count}`,e.message?`Not: ${e.message}`:"","Lütfen bilgileri kontrol edip gönder tuşuna basın."].filter(Boolean).join(`
`)}function T(e){const a=A(e);return a.ok?{ok:!0,whatsapp:a.whatsapp,e164:a.e164,national:a.national,display:K(e)}:{ok:!1,error:a.error}}function A(e){const t=e.trim().replace(/[^\d+]/g,"").replace(/^00/,"+"),i=H(t);return!i||!I.test(i)?{ok:!1,error:O}:{ok:!0,e164:`+90${i}`,national:i,whatsapp:`90${i}`}}function K(e){const a=A(e);if(!a.ok)return e.trim();const t=a.national.slice(0,3),i=a.national.slice(3,6),r=a.national.slice(6,8),s=a.national.slice(8,10);return`+90 ${t} ${i} ${r} ${s}`}function H(e){return e.startsWith("+90")?e.slice(3):e.startsWith("90")&&e.length===12?e.slice(2):e.startsWith("0")&&e.length===11?e.slice(1):e.length===10?e:null}const p="yardimci-asistan-widget",q="yardimci-asistan-widget-style",_={businessName:"Yardımcı Asistan",whatsappPhone:"",apiBaseUrl:"",menuUrl:"",logoUrl:"",primaryColor:"#2F6F5E",accentColor:"#E47863"},Z=C();let d={..._},n={isOpen:!1,view:"home",requestType:"pension_reservation",status:"",aiAnswer:"",aiLoading:!1,questionDraft:"",whatsappDraft:"",whatsappTopic:""};function w(e={}){d={..._,...Z,...C(),...e},ye(d),m()}function k(){n={...n,isOpen:!0,status:""},m(),x("[data-ya-close]")}function f(){n={...n,isOpen:!1,view:"home",status:"",aiLoading:!1,aiAnswer:""},m(),x("[data-ya-open]")}function b(e,a){return U(e,a)}function M(e,a=d.businessName){return F(e,a)}function L(e){const a=T(e);return a.ok?{ok:!0,whatsapp:a.whatsapp}:{ok:!1,error:a.error}}function m(){const e=ge();e.innerHTML=n.isOpen?V():G(),ie(e)}function G(){return`
    <button class="ya-widget-button" type="button" data-ya-open aria-label="Yardımcı Asistan'ı aç">
      <span class="ya-widget-launcher-avatar">
        ${D()}
        <span class="ya-widget-online-dot" aria-hidden="true"></span>
      </span>
      <span class="ya-widget-launcher-copy">
        <strong>AI Asistan</strong>
        <small>Size yardımcı olayım</small>
      </span>
      ${o("sparkles","ya-widget-launcher-sparkle")}
    </button>
  `}function V(){return`
    <section class="ya-widget-panel" role="dialog" aria-labelledby="ya-widget-title">
      <header class="ya-widget-header">
        <div class="ya-widget-identity">
          <span class="ya-widget-avatar">
            ${D()}
            <span class="ya-widget-avatar-spark" aria-hidden="true">${o("sparkles")}</span>
          </span>
          <span class="ya-widget-title-copy">
            <strong id="ya-widget-title">${c(ue())}</strong>
            <small>Rezervasyon, masa ve bilgi taleplerinizi hızlıca hazırlayayım.</small>
          </span>
        </div>
        <button class="ya-widget-close" type="button" data-ya-close aria-label="Asistanı kapat">
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div class="ya-widget-content">
        ${n.view==="home"?J():""}
        ${n.view==="form"?Q():""}
        ${n.view==="info"?ae():""}
        ${n.view==="whatsapp"?te():""}
        <p class="ya-widget-status" data-ya-status role="status" ${n.status?"":"hidden"}>${c(n.status)}</p>
      </div>
    </section>
  `}function D(){return d.logoUrl?`<img class="ya-widget-mark" src="${v(d.logoUrl)}" alt="" aria-hidden="true" />`:'<span class="ya-widget-mark ya-widget-mark-fallback">AI</span>'}function J(){return`
    <div class="ya-widget-home">
      <div class="ya-widget-welcome">
        <span class="ya-widget-bot-bubble" aria-hidden="true">${o("bot")}</span>
        <div>
          <span class="ya-widget-kicker">AI destekli hızlı yardımcı</span>
          <h2 class="ya-widget-view-title" tabindex="-1">Size nasıl yardımcı olayım?</h2>
          <p>İhtiyacınızı seçin, gerekli adımları birlikte tamamlayalım.</p>
        </div>
      </div>
      <div class="ya-widget-actions" role="group" aria-label="Hızlı asistan seçenekleri">
        <button type="button" data-ya-request-type="pension_reservation">
          ${o("calendar")}
          <span>Rezervasyon yap</span>
        </button>
        <button type="button" data-ya-request-type="restaurant_reservation">
          ${o("table")}
          <span>Masa sor</span>
        </button>
        <button type="button" data-ya-view="info">
          ${o("help")}
          <span>Bilgi al</span>
        </button>
        <button type="button" data-ya-view="whatsapp">
          ${o("whatsapp")}
          <span>WhatsApp mesajı hazırla</span>
        </button>
        ${d.menuUrl?`<a class="ya-widget-menu-link" href="${v(d.menuUrl)}" target="_blank" rel="noreferrer">
                ${o("menu")}
                <span>Menüyü gör</span>
              </a>`:""}
      </div>
      <p class="ya-widget-trust">
        ${o("shield")}
        <span>Bilgileriniz işletmeye iletilir, son onayı işletme yapar.</span>
      </p>
    </div>
  `}function Q(){const e=n.requestType==="restaurant_reservation",a=e?"Masa talebi":"Rezervasyon talebi",t=e?"Masa talebinizi hazırlayalım":"Rezervasyonunuzu hazırlayalım";return`
    <div class="ya-widget-subview">
      ${$(a,e?"table":"calendar")}
      <div class="ya-widget-subview-intro">
        <span aria-hidden="true">${o("sparkles")}</span>
        <div>
          <h2 class="ya-widget-view-title" tabindex="-1">${t}</h2>
          <p>Sadece gerekli bilgileri ekleyin; mesajınız WhatsApp'ta hazır açılsın.</p>
        </div>
      </div>
      <form class="ya-widget-form" data-ya-form>
        <input type="hidden" name="request_type" value="${n.requestType}" />
        ${X()}
        <div class="ya-widget-field-grid">
          <label class="ya-widget-field">
            <span>Ad soyad</span>
            <input name="customer_name" required autocomplete="name" placeholder="Adınız soyadınız" />
          </label>
          <label class="ya-widget-field">
            <span>Telefon</span>
            <input name="customer_phone" required inputmode="tel" autocomplete="tel" placeholder="05xx xxx xx xx" />
          </label>
        </div>
        ${ee()}
        <label class="ya-widget-field">
          <span>Kısa not <small>(isteğe bağlı)</small></span>
          <textarea name="message" rows="2" placeholder="Tercihiniz veya eklemek istediğiniz kısa not"></textarea>
        </label>
        <button class="ya-widget-primary-action" type="submit">
          ${o("whatsapp")}
          <span>WhatsApp mesajını hazırla</span>
        </button>
        <p class="ya-widget-form-note">${o("shield")} Bilgileriniz yalnızca talebinize dönüş yapılması için kullanılır.</p>
      </form>
    </div>
  `}function X(){const e=new Date,a=z(e),t=z(W(e,1)),i=z(fe(e));return`
    <fieldset class="ya-widget-date-group">
      <legend>Ne zaman?</legend>
      <div class="ya-widget-date-options">
        <button type="button" data-ya-date-preset="today" data-ya-date-value="${a}" aria-pressed="false">Bugün</button>
        <button type="button" data-ya-date-preset="tomorrow" data-ya-date-value="${t}" aria-pressed="false">Yarın</button>
        <button type="button" data-ya-date-preset="weekend" data-ya-date-value="${i}" aria-pressed="false">Hafta sonu</button>
        <label class="ya-widget-date-custom" data-ya-date-custom>
          ${o("calendar")}
          <span data-ya-custom-date-label>Tarih seç</span>
          <input name="date_iso" type="date" min="${a}" required aria-label="Tarih seç" />
        </label>
        <input name="date_text" type="hidden" />
      </div>
      <p data-ya-selected-date aria-live="polite">Tarih seçiminizi yukarıdan yapın.</p>
    </fieldset>
  `}function ee(){return`
    <fieldset class="ya-widget-guest-group">
      <legend>Kişi sayısı</legend>
      <div class="ya-widget-stepper">
        <button type="button" data-ya-guest-step="-1" aria-label="Kişi sayısını azalt" disabled>${o("minus")}</button>
        <input name="guest_count" required type="number" min="1" max="30" value="2" inputmode="numeric" aria-label="Kişi sayısı" />
        <button type="button" data-ya-guest-step="1" aria-label="Kişi sayısını artır">${o("plus")}</button>
      </div>
    </fieldset>
  `}function ae(){const e=["Oda fiyatları","Kahvaltı saatleri","Konum","Masa var mı?","Çocuk uygun mu?"];return`
    <div class="ya-widget-subview ya-widget-info">
      ${$("Bilgi al","help")}
      <div class="ya-widget-subview-intro">
        <span aria-hidden="true">${o("bot")}</span>
        <div>
          <h2 class="ya-widget-view-title" tabindex="-1">Merak ettiğiniz şeyi sorun</h2>
          <p>Kısa sorunuzu yazın veya sık sorulanlardan birini seçin.</p>
        </div>
      </div>
      <div class="ya-widget-suggestions" role="group" aria-label="Sık sorulan sorular">
        ${e.map(a=>`<button type="button" data-ya-question-suggestion="${v(a)}">${c(a)}</button>`).join("")}
      </div>
      <form class="ya-widget-ai" data-ya-ai-form>
        <label class="ya-widget-field">
          <span>Kısa soru</span>
          <textarea name="message" required maxlength="1200" rows="3" placeholder="Örn. Bu akşam 4 kişilik masa var mı?">${c(n.questionDraft)}</textarea>
        </label>
        <div class="ya-widget-ai-actions">
          <button class="ya-widget-primary-action" type="submit" ${n.aiLoading?"disabled":""}>
            ${o("sparkles")}
            <span>${n.aiLoading?"Yanıt hazırlanıyor":"AI Yardımcıya Sor"}</span>
          </button>
          <button class="ya-widget-secondary-action" type="button" data-ya-ai-whatsapp>
            ${o("whatsapp")}
            <span>WhatsApp'tan Yaz</span>
          </button>
        </div>
      </form>
      ${n.aiAnswer?`<div class="ya-widget-ai-answer">
              <span class="ya-widget-answer-avatar" aria-hidden="true">${o("sparkles")}</span>
              <p><strong>AI Yardımcı</strong><span>${c(n.aiAnswer)}</span></p>
            </div>`:""}
      <p class="ya-widget-trust ya-widget-inline-trust">${o("shield")} Kesin fiyat ve müsaitlik bilgisini işletme onaylar.</p>
    </div>
  `}function te(){const e=[{key:"reservation",label:"Rezervasyon soracağım",message:`Merhaba, ${d.businessName} için oda müsaitliği ve rezervasyon hakkında bilgi almak istiyorum.`},{key:"table",label:"Masa soracağım",message:`Merhaba, ${d.businessName} için masa müsaitliği hakkında bilgi almak istiyorum.`},{key:"menu",label:"Menü hakkında soracağım",message:`Merhaba, ${d.businessName} menüsü hakkında bilgi almak istiyorum.`},{key:"custom",label:"Kendi mesajımı yazacağım",message:""}];return`
    <div class="ya-widget-subview ya-widget-whatsapp-view">
      ${$("WhatsApp","whatsapp")}
      <div class="ya-widget-subview-intro">
        <span aria-hidden="true">${o("whatsapp")}</span>
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
                aria-pressed="${n.whatsappTopic===a.key?"true":"false"}"
                class="${n.whatsappTopic===a.key?"is-active":""}"
              >${c(a.label)}</button>
            `).join("")}
      </div>
      <form class="ya-widget-direct-whatsapp" data-ya-whatsapp-form>
        <label class="ya-widget-field">
          <span>Mesajınız</span>
          <textarea name="message" required rows="3" maxlength="1200" placeholder="Kısa mesajınızı yazın">${c(n.whatsappDraft)}</textarea>
        </label>
        <div class="ya-widget-message-preview">
          <span>Hazır mesaj</span>
          <p data-ya-message-preview>${n.whatsappDraft?c(n.whatsappDraft):"Bir konu seçtiğinizde mesajınız burada görünecek."}</p>
        </div>
        <button class="ya-widget-primary-action" type="submit">
          ${o("send")}
          <span>WhatsApp'ta Aç</span>
        </button>
      </form>
    </div>
  `}function $(e,a){return`
    <div class="ya-widget-subview-nav">
      <button type="button" data-ya-view="home">${o("arrow-left")}<span>Geri</span></button>
      <span class="ya-widget-active-flow">${o(a)} ${c(e)}</span>
    </div>
  `}function ie(e){e.querySelector("[data-ya-open]")?.addEventListener("click",k),e.querySelector("[data-ya-close]")?.addEventListener("click",f),e.querySelectorAll("[data-ya-view]").forEach(a=>{a.addEventListener("click",()=>{n={...n,isOpen:!0,view:a.dataset.yaView,status:"",aiLoading:!1},m(),x(".ya-widget-view-title")})}),e.querySelectorAll("[data-ya-request-type]").forEach(a=>{a.addEventListener("click",()=>{n={...n,view:"form",requestType:a.dataset.yaRequestType,status:""},m(),x(".ya-widget-view-title")})}),ne(e),re(e),se(e),oe(e),e.querySelector("[data-ya-form]")?.addEventListener("submit",de),e.querySelector("[data-ya-ai-form]")?.addEventListener("submit",le),e.querySelector("[data-ya-whatsapp-form]")?.addEventListener("submit",ce),e.onkeydown=a=>{a.key==="Escape"&&n.isOpen&&(a.preventDefault(),f())}}function ne(e){e.querySelectorAll("[data-ya-date-preset]").forEach(a=>{a.addEventListener("click",()=>{const t=a.dataset.yaDatePreset,i=String(a.dataset.yaDateValue??"");E(e,t,i)})}),e.querySelector('input[name="date_iso"]')?.addEventListener("change",a=>{const t=a.currentTarget;E(e,"custom",t.value)})}function E(e,a,t){const i=e.querySelector('input[name="date_iso"]'),r=e.querySelector('input[name="date_text"]'),s=e.querySelector("[data-ya-date-custom]"),g=e.querySelector("[data-ya-custom-date-label]"),l=e.querySelector("[data-ya-selected-date]");if(!i||!r||!t)return;const h=xe(t,a);i.value=t,r.value=h,e.querySelectorAll("[data-ya-date-preset]").forEach(S=>{const B=S.dataset.yaDatePreset===a;S.classList.toggle("is-active",B),S.setAttribute("aria-pressed",String(B))}),s?.classList.toggle("is-active",a==="custom"),g&&(g.textContent=a==="custom"?P(t):"Tarih seç"),l&&(l.textContent=`Seçilen tarih: ${h}`)}function re(e){const a=e.querySelector('input[name="guest_count"]');if(!a)return;const t=()=>{const i=N(a.value);e.querySelectorAll("[data-ya-guest-step]").forEach(r=>{const s=Number(r.dataset.yaGuestStep??0);r.disabled=s<0&&i<=1||s>0&&i>=30})};e.querySelectorAll("[data-ya-guest-step]").forEach(i=>{i.addEventListener("click",()=>{const r=Number(i.dataset.yaGuestStep??0);a.value=String(Math.min(30,Math.max(1,N(a.value)+r))),t()})}),a.addEventListener("input",t),t()}function se(e){const a=e.querySelector(".ya-widget-ai textarea");a&&(a.addEventListener("input",()=>{n.questionDraft=a.value}),e.querySelectorAll("[data-ya-question-suggestion]").forEach(t=>{t.addEventListener("click",()=>{const i=String(t.dataset.yaQuestionSuggestion??"");a.value=i,n.questionDraft=i,e.querySelectorAll("[data-ya-question-suggestion]").forEach(r=>r.classList.remove("is-active")),t.classList.add("is-active"),a.focus()})}),e.querySelector("[data-ya-ai-whatsapp]")?.addEventListener("click",()=>{const t=a.value.trim()||"Bilgi almak istiyorum.";n.questionDraft=a.value;const i=`Merhaba, ${d.businessName} hakkında bilgi almak istiyorum. Sorum: ${t}`;window.open(b(d.whatsappPhone,i),"_blank","noopener,noreferrer"),u("Sorunuz WhatsApp mesajı olarak hazırlandı.")}))}function oe(e){const a=e.querySelector(".ya-widget-direct-whatsapp textarea"),t=e.querySelector("[data-ya-message-preview]");if(!a||!t)return;const i=()=>{n.whatsappDraft=a.value,t.textContent=a.value.trim()||"Mesajınızı yazdığınızda burada görünecek."};a.addEventListener("input",()=>{n.whatsappTopic="custom",e.querySelectorAll("[data-ya-whatsapp-topic]").forEach(r=>{const s=r.dataset.yaWhatsappTopic==="custom";r.classList.toggle("is-active",s),r.setAttribute("aria-pressed",String(s))}),i()}),e.querySelectorAll("[data-ya-whatsapp-topic]").forEach(r=>{r.addEventListener("click",()=>{const s=String(r.dataset.yaWhatsappTopic??""),g=String(r.dataset.yaWhatsappMessage??"");n.whatsappTopic=s,a.value=g,i(),e.querySelectorAll("[data-ya-whatsapp-topic]").forEach(l=>{const h=l===r;l.classList.toggle("is-active",h),l.setAttribute("aria-pressed",String(h))}),a.focus()})})}function de(e){e.preventDefault();const a=e.currentTarget,t=new FormData(a),i=String(t.get("customer_phone")??""),r=L(i);if(!r.ok){u(r.error),a.querySelector('input[name="customer_phone"]')?.focus();return}const s={request_type:String(t.get("request_type")??n.requestType),customer_name:String(t.get("customer_name")??"").trim(),customer_phone:i.trim(),date_text:String(t.get("date_text")??"").trim(),start_date:String(t.get("date_iso")??"").trim(),guest_count:Number(t.get("guest_count")??1),message:String(t.get("message")??"").trim(),source:"web_form",whatsapp_message:""};if(!s.customer_name||!s.date_text&&!s.start_date||!Number.isFinite(s.guest_count)||s.guest_count<1){u("Lütfen gerekli alanları kontrol edin.");return}s.whatsapp_message=M(s),pe(s),window.open(b(d.whatsappPhone,s.whatsapp_message),"_blank","noopener,noreferrer"),u("WhatsApp mesajı hazırlandı. Bilgileri kontrol edip gönder tuşuna basın.")}async function pe(e){if(d.apiBaseUrl)try{const a=`${d.apiBaseUrl.replace(/\/$/,"")}/api/request.php`;if(!(await fetch(a,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e),keepalive:!0})).ok)throw new Error("request_failed")}catch{u("Talep kaydı sırasında sorun oldu. WhatsApp mesajınız yine de hazırlandı.")}}async function le(e){e.preventDefault();const a=e.currentTarget,t=new FormData(a),i=String(t.get("message")??"").trim();if(!i){u("Lütfen kısa sorunuzu yazın.");return}if(!d.apiBaseUrl){u("AI bağlantısı bu sitede etkin değil. Sorunuzu WhatsApp'tan iletebilirsiniz.");return}n={...n,questionDraft:i,status:"Yanıt hazırlanıyor.",aiLoading:!0},m();let r="";try{const s=`${d.apiBaseUrl.replace(/\/$/,"")}/api/chat.php`,g=await fetch(s,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:i})}),l=await g.json().catch(()=>null);if(!g.ok||!l?.ok||!l.answer)throw r=j(l?.error,l?.message),new Error("ai_failed");n={...n,aiAnswer:l.answer,aiLoading:!1,status:l.fallback?j(l.error):""},m()}catch{n={...n,aiLoading:!1,status:r||"AI servisine ulaşılamadı. İnternet veya sunucu bağlantısını kontrol edin. Hata kodu: widget_connection_failed."},m()}}function ce(e){e.preventDefault();const a=e.currentTarget,t=new FormData(a),i=String(t.get("message")??"").trim();if(!i){u("Lütfen bir konu seçin veya kısa mesajınızı yazın.");return}n.whatsappDraft=i,window.open(b(d.whatsappPhone,i),"_blank","noopener,noreferrer"),u("Mesajınız WhatsApp'ta hazırlandı.")}function u(e){n.status=e;const a=document.querySelector(`#${p} [data-ya-status]`);a&&(a.textContent=e,a.hidden=!e)}function j(e,a=""){const t=String(e?.message||a||"AI yanıtı alınamadı.").trim(),i=String(e?.code||"unknown_ai_error").trim(),r=Number(e?.provider_status||0),s=r>0?` (HTTP ${r})`:"",g=e?.retryable===!0?" Biraz sonra yeniden deneyebilirsiniz.":"";return`${t} Hata kodu: ${i}${s}.${g}`}function ue(){const a=(d.businessName.trim()||"Yardımcı").replace(/\s+(?:Pansiyon|Otel|Butik Otel|Restoran|Kafe)(?:\s*(?:&|\/)\s*(?:Pansiyon|Otel|Restoran|Kafe))*\s*$/i,"").trim();return`${a&&a.toLocaleLowerCase("tr-TR")!=="yardımcı asistan"?a:"Yardımcı"} AI Asistanı`}function ge(){const e=document.getElementById(p);if(e)return e;const a=document.createElement("div");return a.id=p,document.body.appendChild(a),a}function ye(e){let a=document.getElementById(q);a||(a=document.createElement("style"),a.id=q,document.head.appendChild(a)),a.textContent=me(e)}function me(e){return`
    #${p} {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483000;
      color: #172033;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.4;
    }

    #${p} * {
      box-sizing: border-box;
    }

    #${p} button,
    #${p} input,
    #${p} textarea {
      font: inherit;
    }

    #${p} button:focus-visible,
    #${p} a:focus-visible,
    #${p} input:focus-visible,
    #${p} textarea:focus-visible {
      outline: 3px solid rgba(255, 184, 146, 0.72);
      outline-offset: 2px;
    }

    #${p} [hidden] {
      display: none !important;
    }

    #${p} .ya-widget-icon {
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
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 58px;
      padding: 8px 14px 8px 8px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 18px;
      color: #ffffff;
      background: linear-gradient(135deg, ${e.primaryColor}, #174c44 78%);
      box-shadow: 0 18px 44px rgba(18, 59, 54, 0.3), 0 0 0 5px rgba(47, 111, 94, 0.08);
      cursor: pointer;
      isolation: isolate;
      transition: transform 180ms ease, box-shadow 180ms ease;
    }

    .ya-widget-button::before {
      position: absolute;
      inset: -100% 40% auto -30%;
      height: 140px;
      background: radial-gradient(circle, rgba(255, 255, 255, 0.28), transparent 64%);
      content: "";
      z-index: -1;
    }

    .ya-widget-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 22px 52px rgba(18, 59, 54, 0.34), 0 0 0 6px rgba(47, 111, 94, 0.09);
    }

    .ya-widget-launcher-avatar {
      position: relative;
      display: grid;
      width: 42px;
      height: 42px;
      flex: 0 0 auto;
      place-items: center;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 5px 14px rgba(18, 59, 54, 0.2);
    }

    .ya-widget-online-dot {
      position: absolute;
      right: -1px;
      bottom: -1px;
      width: 11px;
      height: 11px;
      border: 2px solid #ffffff;
      border-radius: 50%;
      background: #62d39a;
      box-shadow: 0 0 0 3px rgba(98, 211, 154, 0.18);
    }

    .ya-widget-launcher-copy {
      display: grid;
      min-width: 108px;
      text-align: left;
    }

    .ya-widget-launcher-copy strong {
      font-size: 14px;
      letter-spacing: 0.01em;
    }

    .ya-widget-launcher-copy small {
      color: rgba(255, 255, 255, 0.78);
      font-size: 11px;
    }

    .ya-widget-launcher-sparkle {
      width: 17px !important;
      height: 17px !important;
      color: #ffd4bd;
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
      color: ${e.primaryColor};
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
    }

    .ya-widget-header {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 92px;
      padding: 14px;
      overflow: hidden;
      color: #ffffff;
      background: linear-gradient(135deg, ${e.primaryColor}, #18564e 56%, #123d3a);
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

    .ya-widget-avatar {
      position: relative;
      display: grid;
      width: 48px;
      height: 48px;
      flex: 0 0 auto;
      place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.34);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 8px 24px rgba(10, 44, 40, 0.24);
    }

    .ya-widget-avatar-spark {
      position: absolute;
      top: -5px;
      right: -5px;
      display: grid;
      width: 19px;
      height: 19px;
      place-items: center;
      border: 2px solid ${e.primaryColor};
      border-radius: 50%;
      color: ${e.primaryColor};
      background: #ffe4d3;
    }

    .ya-widget-avatar-spark .ya-widget-icon {
      width: 11px !important;
      height: 11px !important;
    }

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
    }

    .ya-widget-welcome,
    .ya-widget-subview-intro {
      display: flex;
      align-items: flex-start;
      gap: 11px;
    }

    .ya-widget-welcome {
      padding: 13px;
      border: 1px solid rgba(47, 111, 94, 0.13);
      border-radius: 17px 17px 17px 5px;
      background: linear-gradient(135deg, rgba(231, 240, 230, 0.78), rgba(255, 255, 255, 0.88));
    }

    .ya-widget-bot-bubble,
    .ya-widget-subview-intro > span,
    .ya-widget-answer-avatar {
      display: grid;
      width: 38px;
      height: 38px;
      flex: 0 0 auto;
      place-items: center;
      border-radius: 13px;
      color: ${e.primaryColor};
      background: #ffffff;
      box-shadow: inset 0 0 0 1px rgba(47, 111, 94, 0.15), 0 5px 14px rgba(23, 32, 51, 0.06);
    }

    .ya-widget-kicker {
      color: ${e.primaryColor};
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
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .ya-widget-actions button,
    .ya-widget-actions a,
    .ya-widget-suggestions button,
    .ya-widget-topic-chips button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      min-height: 44px;
      padding: 9px 12px;
      border: 1px solid #ddd9d0;
      border-radius: 999px;
      color: #24313a;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 5px 16px rgba(23, 32, 51, 0.04);
      font-size: 12px;
      font-weight: 750;
      text-decoration: none;
      cursor: pointer;
      transition: transform 150ms ease, border-color 150ms ease, background 150ms ease;
    }

    .ya-widget-actions button:hover,
    .ya-widget-actions a:hover,
    .ya-widget-suggestions button:hover,
    .ya-widget-topic-chips button:hover {
      transform: translateY(-1px);
      border-color: rgba(47, 111, 94, 0.42);
    }

    .ya-widget-actions button:nth-child(1),
    .ya-widget-actions button:nth-child(2) {
      color: ${e.primaryColor};
      border-color: rgba(47, 111, 94, 0.2);
      background: #f5faf5;
    }

    .ya-widget-menu-link {
      color: ${e.primaryColor} !important;
      border-color: rgba(47, 111, 94, 0.2) !important;
    }

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
      color: ${e.primaryColor};
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
      color: ${e.primaryColor};
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
      color: ${e.primaryColor};
      border-color: rgba(47, 111, 94, 0.5);
      background: #e7f1e6;
      box-shadow: inset 0 0 0 1px rgba(47, 111, 94, 0.07);
    }

    .ya-widget-date-custom .ya-widget-icon {
      width: 14px !important;
      height: 14px !important;
    }

    .ya-widget-date-custom input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      padding: 0;
      border: 0;
      opacity: 0;
      cursor: pointer;
    }

    .ya-widget-date-custom:focus-within {
      outline: 3px solid rgba(255, 184, 146, 0.72);
      outline-offset: 2px;
    }

    .ya-widget-date-options > input[type="hidden"] {
      display: none;
    }

    .ya-widget-date-group > p {
      margin: 7px 1px 0;
      color: #6b727c;
      font-size: 10px;
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
      color: ${e.primaryColor};
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
      background: linear-gradient(135deg, ${e.primaryColor}, #1b5a50);
      box-shadow: 0 9px 22px rgba(47, 111, 94, 0.2);
    }

    .ya-widget-secondary-action {
      border: 1px solid rgba(47, 111, 94, 0.24);
      color: ${e.primaryColor};
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
      color: ${e.primaryColor};
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

    .ya-widget-answer-avatar {
      width: 32px;
      height: 32px;
      border-radius: 11px;
    }

    .ya-widget-answer-avatar .ya-widget-icon {
      width: 15px !important;
      height: 15px !important;
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

    .ya-widget-message-preview {
      padding: 11px;
      border: 1px solid rgba(47, 111, 94, 0.14);
      border-radius: 14px 14px 4px 14px;
      background: #edf5ec;
    }

    .ya-widget-message-preview > span {
      color: ${e.primaryColor};
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
      #${p} {
        right: 0;
        bottom: 0;
        left: 0;
        display: flex;
        align-items: flex-end;
        justify-content: flex-end;
        pointer-events: none;
      }

      #${p} > * {
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

      .ya-widget-date-options {
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
      .ya-widget-actions button,
      .ya-widget-actions a,
      .ya-widget-suggestions button,
      .ya-widget-topic-chips button {
        transition: none;
      }
    }
  `}const he={sparkles:'<path d="m12 3-1.4 3.5L7 8l3.6 1.4L12 13l1.4-3.6L17 8l-3.6-1.5L12 3Z"/><path d="m5 15-.8 2-2.2.8 2.2.9L5 21l.8-2.3 2.2-.9-2.2-.8L5 15Z"/>',bot:'<rect x="5" y="7" width="14" height="11" rx="4"/><path d="M12 4v3M9 12h.01M15 12h.01M9 15h6"/>',calendar:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 9h16M8 13h.01M12 13h.01M16 13h.01"/>',table:'<path d="M4 10h16M6 10l-1 10M18 10l1 10M8 6h8a2 2 0 0 1 2 2v2H6V8a2 2 0 0 1 2-2Z"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-.9.8-.9 1.6M12 17h.01"/>',whatsapp:'<path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5Z"/><path d="M9 8.7c.5 2.5 2 4 4.5 4.8l1-1"/>',menu:'<path d="M5 7h14M5 12h14M5 17h14"/>',shield:'<path d="M12 3 5 6v5c0 4.5 2.8 7.8 7 10 4.2-2.2 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',"arrow-left":'<path d="m15 18-6-6 6-6M9 12h10"/>',minus:'<path d="M5 12h14"/>',plus:'<path d="M12 5v14M5 12h14"/>',send:'<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>'};function o(e,a=""){return`<svg class="ya-widget-icon${a?` ${a}`:""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${he[e]}</svg>`}function C(){const a=document.currentScript?.dataset??{};return we({businessName:a.businessName,whatsappPhone:a.whatsappPhone,apiBaseUrl:a.apiBaseUrl,menuUrl:a.menuUrl,logoUrl:a.logoUrl,primaryColor:a.primaryColor,accentColor:a.accentColor})}function we(e){return Object.fromEntries(Object.entries(e).filter(([,a])=>typeof a=="string"&&a.length>0))}function x(e){window.requestAnimationFrame(()=>{document.querySelector(`#${p} ${e}`)?.focus()})}function N(e){const a=Number(e);return Number.isFinite(a)&&a>=1?Math.min(30,Math.floor(a)):1}function W(e,a){const t=new Date(e.getFullYear(),e.getMonth(),e.getDate());return t.setDate(t.getDate()+a),t}function fe(e){const a=e.getDay();return W(e,a===0||a===6?0:6-a)}function z(e){const a=e.getFullYear(),t=String(e.getMonth()+1).padStart(2,"0"),i=String(e.getDate()).padStart(2,"0");return`${a}-${t}-${i}`}function be(e){const[a,t,i]=e.split("-").map(Number);if(!a||!t||!i)return null;const r=new Date(a,t-1,i);return Number.isNaN(r.getTime())?null:r}function P(e){const a=be(e);if(!a)return"Tarih seç";const t=a.getFullYear()!==new Date().getFullYear();return new Intl.DateTimeFormat("tr-TR",{day:"numeric",month:"long",...t?{year:"numeric"}:{}}).format(a)}function xe(e,a){const t=P(e);return a==="today"?`Bugün, ${t}`:a==="tomorrow"?`Yarın, ${t}`:a==="weekend"?`Hafta sonu, ${t}`:t}function c(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}function v(e){return c(e).replace(/`/g,"&#096;")}return window.YardimciAsistanWidget={init:w,open:k,close:f},document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>w(),{once:!0}):w(),y.buildWhatsAppMessage=M,y.close=f,y.createWhatsAppLink=b,y.init=w,y.normalizeTRMobilePhone=L,y.open=k,Object.defineProperty(y,Symbol.toStringTag,{value:"Module"}),y})({});
