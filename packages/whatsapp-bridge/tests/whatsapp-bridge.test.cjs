const assert = require("node:assert/strict");
const test = require("node:test");

const bridgePromise = import("../dist/index.js");

test("createWhatsAppLink normalizes Turkey mobile phone and encodes message", async () => {
  const { createWhatsAppLink } = await bridgePromise;
  const result = createWhatsAppLink("0532 123 45 67", "Merhaba, bilgi almak istiyorum.\nTeşekkürler.");

  assert.equal(result.ok, true);
  assert.equal(result.whatsappPhone, "905321234567");
  assert.equal(result.phoneDisplay, "+90 532 123 45 67");
  assert.equal(result.url, "https://wa.me/905321234567?text=Merhaba%2C%20bilgi%20almak%20istiyorum.%0ATe%C5%9Fekk%C3%BCrler.");
});

test("createWhatsAppLink accepts international phone numbers", async () => {
  const { createWhatsAppLink } = await bridgePromise;
  const result = createWhatsAppLink("+44 7911 123456", "Hello");
  assert.equal(result.ok, true);
  assert.equal(result.whatsappPhone, "447911123456");
  assert.equal(result.phoneDisplay, "+447911123456");
  assert.equal(result.url, "https://wa.me/447911123456?text=Hello");
});

test("createWhatsAppLink reports invalid phone and empty messages without throwing", async () => {
  const { createWhatsAppLink, createWhatsAppUrl } = await bridgePromise;
  const invalidPhone = createWhatsAppLink("123", "Merhaba");
  const emptyMessage = createWhatsAppLink("0532 123 45 67", "   ");

  assert.equal(invalidPhone.ok, false);
  assert.equal(invalidPhone.code, "invalid_phone");
  assert.equal(emptyMessage.ok, false);
  assert.equal(emptyMessage.code, "empty_message");
  assert.equal(createWhatsAppUrl("123", "Merhaba"), "");
});

test("manual copy mode prepares copy text even when link opening is not used", async () => {
  const { createManualCopyPayload } = await bridgePromise;
  const payload = createManualCopyPayload("+90 532 123 45 67", "Hazır cevap");

  assert.equal(payload.ok, true);
  assert.equal(payload.mode, "manual_copy");
  assert.equal(payload.whatsappPhone, "905321234567");
  assert.equal(payload.message, "Hazır cevap");
});

test("web URL targets WhatsApp Web without invoking the installed application", async () => {
  const { createWhatsAppWebUrl, WHATSAPP_WEB_HOME_URL } = await bridgePromise;

  assert.equal(WHATSAPP_WEB_HOME_URL, "https://web.whatsapp.com/");
  assert.equal(
    createWhatsAppWebUrl("0532 123 45 67", "Merhaba, bilgi alabilir miyim?"),
    "https://web.whatsapp.com/send?phone=905321234567&text=Merhaba%2C%20bilgi%20alabilir%20miyim%3F"
  );
});

test("webview mode returns a connectable target and a manual fallback", async () => {
  const { prepareWhatsAppAction } = await bridgePromise;
  const action = prepareWhatsAppAction({
    phone: "00905321234567",
    message: "Merhaba",
    preferredMode: "webview"
  });

  assert.equal(action.ok, true);
  assert.equal(action.mode, "webview");
  assert.equal(action.homeUrl, "https://web.whatsapp.com/");
  assert.equal(action.webviewTarget.customerPhone, "905321234567");
  assert.equal(action.webviewTarget.homeUrl, "https://web.whatsapp.com/");
  assert.equal(action.webviewTarget.url, "https://web.whatsapp.com/send?phone=905321234567&text=Merhaba");
  assert.equal(action.fallback.mode, "manual_copy");
});

test("official API future mode exposes an intentional fallback", async () => {
  const { prepareWhatsAppAction } = await bridgePromise;
  const action = prepareWhatsAppAction({
    phone: "0532 123 45 67",
    message: "Merhaba",
    preferredMode: "official_api"
  });

  assert.equal(action.ok, false);
  assert.equal(action.mode, "official_api_future");
  assert.equal(action.code, "unsupported_mode");
  assert.equal(action.fallback.mode, "manual_copy");
});

test("request and reply messages keep the expected Turkish business wording", async () => {
  const { buildCustomerRequestWhatsAppMessage, buildOwnerReplyWhatsAppMessage } = await bridgePromise;
  const requestMessage = buildCustomerRequestWhatsAppMessage(
    {
      request_type: "restaurant_reservation",
      customer_name: "Ada Deniz",
      customer_phone: "0532 123 45 67",
      date_text: "2026-07-12",
      time_text: "20:00",
      guest_count: 4,
      message: "Bahçe masası olursa seviniriz."
    },
    "Demo Pansiyon"
  );

  assert.match(requestMessage, /Talep türü: Masa rezervasyonu/);
  assert.match(requestMessage, /Saat: 20:00/);
  assert.match(requestMessage, /Not: Bahçe masası/);
  assert.equal(buildOwnerReplyWhatsAppMessage(""), "Merhaba, talebiniz için teşekkür ederiz. Size en kısa sürede dönüş yapacağız.");
});

test("normalizeInternationalPhone exposes bridge-friendly display and whatsapp fields", async () => {
  const { normalizeInternationalPhone } = await bridgePromise;
  const result = normalizeInternationalPhone("+44 7911 123456");
  assert.equal(result.ok, true);
  assert.equal(result.whatsapp, "447911123456");
  assert.equal(result.e164, "+447911123456");
  assert.equal(result.display, "+447911123456");
});
