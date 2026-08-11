(function () {
  "use strict";

  var ROOT = "#yardimci-asistan-widget";
  var STYLE_ID = "yardimci-asistan-direct-request-style";
  var submitting = false;
  var script = document.currentScript;
  var config = {
    businessName: script && script.dataset.businessName || "Yardımcı Asistan",
    whatsappPhone: script && script.dataset.whatsappPhone || "",
    apiBaseUrl: script && script.dataset.apiBaseUrl || ""
  };

  installStyles();
  wrapInit();
  queueMicrotask(wrapInit);
  document.addEventListener("submit", interceptSubmit, true);

  var root = document.querySelector(ROOT);
  if (root) {
    observe(root);
    enhance(root);
  }

  function wrapInit() {
    var widget = window.YardimciAsistanWidget;
    if (!widget || typeof widget.init !== "function" || widget.__directRequestInitWrapped) return;
    var original = widget.init.bind(widget);
    widget.init = function (next) {
      next = next || {};
      if (typeof next.businessName === "string" && next.businessName.trim()) config.businessName = next.businessName;
      if (typeof next.whatsappPhone === "string" && next.whatsappPhone.trim()) config.whatsappPhone = next.whatsappPhone;
      if (typeof next.apiBaseUrl === "string" && next.apiBaseUrl.trim()) config.apiBaseUrl = next.apiBaseUrl;
      original(next);
      var currentRoot = document.querySelector(ROOT);
      if (currentRoot) {
        observe(currentRoot);
        queueMicrotask(function () { enhance(currentRoot); });
      }
    };
    widget.__directRequestInitWrapped = true;
  }

  function observe(rootElement) {
    if (rootElement.dataset.yaDirectRequestObserved === "1") return;
    rootElement.dataset.yaDirectRequestObserved = "1";
    new MutationObserver(function () { enhance(rootElement); }).observe(rootElement, { childList: true, subtree: true });
  }

  function enhance(rootElement) {
    var form = rootElement.querySelector(".ya-widget-form[data-ya-form]");
    if (!form) return;
    var intro = form.closest(".ya-widget-subview");
    var introText = intro && intro.querySelector(".ya-widget-subview-intro p");
    if (introText && introText.textContent !== "Bilgileri işletmeye doğrudan iletin. Son onayı işletme yapar.") {
      introText.textContent = "Bilgileri işletmeye doğrudan iletin. Son onayı işletme yapar.";
    }
    var submit = form.querySelector('button[type="submit"]');
    if (submit && submit.dataset.yaDirectRequestButton !== "1") {
      submit.dataset.yaDirectRequestButton = "1";
      submit.innerHTML = sendIcon() + "<span>Talebi Gönder</span>";
    }
    var note = form.querySelector(".ya-widget-form-note");
    if (note && note.dataset.yaDirectRequestNote !== "1") {
      note.dataset.yaDirectRequestNote = "1";
      note.innerHTML = shieldIcon() + "<span>Talebiniz doğrudan işletmeye kaydedilir. WhatsApp kullanmak zorunlu değildir.</span>";
    }
  }

  function interceptSubmit(event) {
    var form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form || !form.matches(".ya-widget-form[data-ya-form]")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!submitting) submitRequest(form);
  }

  async function submitRequest(form) {
    var data = new FormData(form);
    var phone = String(data.get("customer_phone") || "").trim();
    if (!normalizePhone(phone)) {
      showStatus("Telefon numarası Türkiye cep telefonu formatında olmalı. Örnek: 05xx xxx xx xx");
      var phoneInput = form.querySelector('input[name="customer_phone"]');
      if (phoneInput) phoneInput.focus();
      return;
    }
    var requestType = String(data.get("request_type") || "pension_reservation");
    if (requestType !== "pension_reservation" && requestType !== "restaurant_reservation") {
      showStatus("Talep türü geçerli değil. Lütfen yeniden deneyin.");
      return;
    }
    var payload = {
      request_type: requestType,
      customer_name: String(data.get("customer_name") || "").trim(),
      customer_phone: phone,
      date_text: String(data.get("date_text") || "").trim(),
      start_date: String(data.get("date_iso") || "").trim(),
      guest_count: Number(data.get("guest_count") || 1),
      message: String(data.get("message") || "").trim(),
      source: "web_form",
      whatsapp_message: ""
    };
    if (!payload.customer_name || (!payload.date_text && !payload.start_date) || !Number.isFinite(payload.guest_count) || payload.guest_count < 1) {
      showStatus("Lütfen gerekli alanları kontrol edin.");
      return;
    }
    payload.whatsapp_message = buildMessage(payload);
    if (!config.apiBaseUrl.trim()) {
      showStatus("Web talep bağlantısı bu sitede etkin değil. İsterseniz WhatsApp üzerinden yazabilirsiniz.");
      addFallback(form, payload.whatsapp_message);
      return;
    }

    submitting = true;
    setBusy(form, true);
    showStatus("Talebiniz işletmeye iletiliyor...");
    try {
      var response = await fetch(config.apiBaseUrl.trim().replace(/\/$/, "") + "/api/request.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      var result = await response.json().catch(function () { return null; });
      if (!response.ok || !result || result.ok !== true || !result.request_id) {
        throw new Error(result && result.message || "Talep işletmeye iletilemedi.");
      }
      hideStatus();
      renderSuccess(form, result.whatsapp_message || payload.whatsapp_message);
    } catch (error) {
      var message = error && error.message && error.message !== "Failed to fetch"
        ? error.message
        : "Talep işletmeye iletilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.";
      showStatus(message);
      addFallback(form, payload.whatsapp_message);
      setBusy(form, false);
    } finally {
      submitting = false;
    }
  }

  function renderSuccess(form, whatsappMessage) {
    var subview = form.closest(".ya-widget-subview");
    var intro = subview && subview.querySelector(".ya-widget-subview-intro");
    var title = intro && intro.querySelector("h2");
    var description = intro && intro.querySelector("p");
    if (title) title.textContent = "Talebiniz işletmeye iletildi";
    if (description) description.textContent = "İşletme talebinizi inceleyip sizinle iletişime geçecek.";

    var success = document.createElement("div");
    success.className = "ya-widget-request-success";
    var card = document.createElement("div");
    card.className = "ya-widget-request-success-card";
    card.innerHTML = checkIcon() + "<div><strong>Talebiniz kaydedildi.</strong><span>WhatsApp üzerinden ayrıca yazmanız gerekmez.</span></div>";
    success.appendChild(card);

    var actions = document.createElement("div");
    actions.className = "ya-widget-request-success-actions";
    if (config.whatsappPhone.trim()) {
      var whatsapp = document.createElement("button");
      whatsapp.type = "button";
      whatsapp.className = "ya-widget-secondary-action";
      whatsapp.dataset.yaRequestWhatsapp = "1";
      whatsapp.innerHTML = whatsappIcon() + "<span>WhatsApp'tan da yaz</span>";
      whatsapp.addEventListener("click", function () { openWhatsApp(whatsappMessage); });
      actions.appendChild(whatsapp);
    }
    var done = document.createElement("button");
    done.type = "button";
    done.className = "ya-widget-primary-action";
    done.dataset.yaRequestDone = "1";
    done.innerHTML = checkIcon() + "<span>Tamam</span>";
    done.addEventListener("click", function () {
      var back = subview && subview.querySelector('[data-ya-view="home"]');
      if (back) back.click();
    });
    actions.appendChild(done);
    success.appendChild(actions);
    form.replaceWith(success);
  }

  function addFallback(form, message) {
    if (!config.whatsappPhone.trim() || form.querySelector("[data-ya-request-fallback]")) return;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "ya-widget-secondary-action ya-widget-request-fallback";
    button.dataset.yaRequestFallback = "1";
    button.innerHTML = whatsappIcon() + "<span>WhatsApp'tan Yaz</span>";
    button.addEventListener("click", function () { openWhatsApp(message); });
    var submit = form.querySelector('button[type="submit"]');
    if (submit) submit.insertAdjacentElement("afterend", button);
  }

  function openWhatsApp(message) {
    var digits = config.whatsappPhone.replace(/\D/g, "");
    if (digits.startsWith("0") && digits.length === 11) digits = "90" + digits.slice(1);
    if (digits.length === 10 && digits.startsWith("5")) digits = "90" + digits;
    if (!digits) return;
    window.open("https://wa.me/" + digits + "?text=" + encodeURIComponent(message), "_blank", "noopener,noreferrer");
  }

  function normalizePhone(value) {
    var digits = value.trim().replace(/[^\d+]/g, "").replace(/^00/, "+");
    var national = null;
    if (digits.startsWith("+90")) national = digits.slice(3);
    else if (digits.startsWith("90") && digits.length === 12) national = digits.slice(2);
    else if (digits.startsWith("0") && digits.length === 11) national = digits.slice(1);
    else if (digits.length === 10) national = digits;
    return national && /^5\d{9}$/.test(national);
  }

  function buildMessage(payload) {
    var label = payload.request_type === "restaurant_reservation" ? "Masa rezervasyonu" : "Pansiyon rezervasyonu";
    var lines = [
      "Merhaba, " + (config.businessName || "İşletme") + " için talep oluşturmak istiyorum.",
      "Talep türü: " + label,
      "Ad soyad: " + payload.customer_name,
      "Telefon: " + payload.customer_phone,
      "Tarih: " + (payload.date_text || payload.start_date),
      "Kişi sayısı: " + payload.guest_count
    ];
    if (payload.message) lines.push("Not: " + payload.message);
    lines.push("Lütfen bilgileri kontrol edip gönder tuşuna basın.");
    return lines.join("\n");
  }

  function setBusy(form, busy) {
    var button = form.querySelector('button[type="submit"]');
    if (!button) return;
    button.disabled = busy;
    button.innerHTML = sendIcon() + "<span>" + (busy ? "Talep gönderiliyor..." : "Talebi Gönder") + "</span>";
  }

  function showStatus(message) {
    var status = document.querySelector(ROOT + " [data-ya-status]");
    if (!status) return;
    status.textContent = message;
    status.hidden = false;
  }

  function hideStatus() {
    var status = document.querySelector(ROOT + " [data-ya-status]");
    if (!status) return;
    status.textContent = "";
    status.hidden = true;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = ROOT + " .ya-widget-request-success{display:grid;gap:12px}" +
      ROOT + " .ya-widget-request-success-card{display:flex;align-items:flex-start;gap:10px;padding:13px;border:1px solid rgba(47,111,94,.2);border-radius:15px;background:#edf5ec}" +
      ROOT + " .ya-widget-request-success-card>.ya-widget-icon{color:#2F6F5E}" +
      ROOT + " .ya-widget-request-success-card div{display:grid;gap:3px}" +
      ROOT + " .ya-widget-request-success-card strong{color:#172033;font-size:13px}" +
      ROOT + " .ya-widget-request-success-card span{color:#5d6670;font-size:11px;line-height:1.45}" +
      ROOT + " .ya-widget-request-success-actions{display:grid;gap:8px}" +
      ROOT + " .ya-widget-request-fallback{margin-top:-4px}";
    document.head.appendChild(style);
  }

  function icon(path) { return '<svg class="ya-widget-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + path + "</svg>"; }
  function sendIcon() { return icon('<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>'); }
  function shieldIcon() { return icon('<path d="M12 3 5 6v5c0 4.5 2.8 7.8 7 10 4.2-2.2 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>'); }
  function whatsappIcon() { return icon('<path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5Z"/><path d="M9 8.7c.5 2.5 2 4 4.5 4.8l1-1"/>'); }
  function checkIcon() { return icon('<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>'); }
})();
