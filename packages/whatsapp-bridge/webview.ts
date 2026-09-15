export interface WhatsAppDomResult {
  ok: boolean;
  code: string;
  message: string;
  chatTitle?: string;
  composerText?: string;
  targetVerified?: boolean;
}

export function createWhatsAppInspectionScript(expectedMessage: string, expectedPhone = ""): string {
  return `(() => {
    const expectedMessage = ${JSON.stringify(expectedMessage.trim())};
    const expectedPhone = ${JSON.stringify(expectedPhone.trim())};
    const clean = (value) => String(value || "")
      .replace(/\\r\\n/g, "\\n")
      .replace(/\\u00a0/g, " ")
      .replace(/\\u200b/g, "")
      .split("\\n")
      .map((line) => line.trimEnd())
      .join("\\n")
      .trim();
    const digits = (value) => String(value || "").replace(/\\D/g, "");
    const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
    const firstVisible = (root, selectors) => {
      for (const selector of selectors) {
        const match = Array.from(root.querySelectorAll(selector)).find(visible);
        if (match) return match;
      }
      return null;
    };
    const targetMarkers = (root) => Array.from(root.querySelectorAll('header [data-id], header [data-testid], header [href], header [title], header [aria-label]'))
      .flatMap((element) => [
        element.getAttribute("data-id"),
        element.getAttribute("data-testid"),
        element.getAttribute("href"),
        element.getAttribute("title"),
        element.getAttribute("aria-label")
      ])
      .map(digits)
      .filter(Boolean);
    const verifyTarget = (root) => {
      const target = digits(expectedPhone);
      if (!target) return true;
      const urlPhone = digits(new URL(location.href).searchParams.get("phone"));
      if (urlPhone === target) return true;
      return targetMarkers(root).some((marker) => marker.includes(target));
    };
    if (location.origin !== "https://web.whatsapp.com") {
      return { ok: false, code: "wrong_origin", message: "Güvenlik kontrolü: açık sayfa WhatsApp Web değil." };
    }
    const loginVisible = Boolean(document.querySelector('[data-testid="qrcode"], [data-testid="intro"], [aria-label*="QR"], [aria-label*="kod"]'));
    if (loginVisible) {
      return { ok: false, code: "login_required", message: "WhatsApp Web oturumu açık değil." };
    }
    const root = document.querySelector("#main");
    if (!root) {
      return { ok: false, code: "page_not_ready", message: "WhatsApp Web sohbet alanı henüz hazır değil." };
    }
    if (!verifyTarget(root)) {
      return { ok: false, code: "target_not_verified", message: "Hedef WhatsApp sohbeti güvenle doğrulanamadı.", targetVerified: false };
    }
    const composer = firstVisible(root, [
      'footer [contenteditable="true"][role="textbox"]',
      'footer [contenteditable="true"][data-tab]',
      '[contenteditable="true"][role="textbox"]'
    ]);
    if (!composer) {
      return { ok: false, code: "composer_missing", message: "WhatsApp mesaj kutusu bulunamadı." };
    }
    const composerText = clean(composer.innerText || composer.textContent);
    if (composerText !== clean(expectedMessage)) {
      return { ok: false, code: "message_mismatch", message: "WhatsApp mesaj kutusundaki metin beklenen mesajla eşleşmiyor.", composerText, targetVerified: true };
    }
    const titleNode = firstVisible(root, [
      'header [data-testid="conversation-info-header-chat-title"]',
      'header span[title]',
      'header [role="button"] span[dir="auto"]'
    ]);
    const chatTitle = clean(titleNode && (titleNode.getAttribute("title") || titleNode.textContent));
    if (!chatTitle) {
      return { ok: false, code: "recipient_missing", message: "Açık sohbetin alıcı bilgisi okunamadı.", targetVerified: true };
    }
    const sendIcon = firstVisible(root, ['footer span[data-icon="send"]', 'footer [data-testid="compose-btn-send"]']);
    const sendControl = firstVisible(root, [
      'footer button[aria-label="Send"]',
      'footer button[aria-label="Gönder"]',
      'footer [role="button"][aria-label="Send"]',
      'footer [role="button"][aria-label="Gönder"]'
    ]) || (sendIcon && sendIcon.closest('button, [role="button"]'));
    if (!sendControl || sendControl.hasAttribute("disabled") || sendControl.getAttribute("aria-disabled") === "true") {
      return { ok: false, code: "send_missing", message: "WhatsApp Gönder düğmesi hazır değil.", targetVerified: true };
    }
    return { ok: true, code: "ready", message: "Sohbet, hedef ve mesaj doğrulandı.", chatTitle, composerText, targetVerified: true };
  })()`;
}

export function createWhatsAppFillMessageScript(expectedMessage: string): string {
  return `(() => {
    const expectedMessage = ${JSON.stringify(expectedMessage.trim())};
    const clean = (value) => String(value || "")
      .replace(/\\r\\n/g, "\\n")
      .replace(/\\u00a0/g, " ")
      .replace(/\\u200b/g, "")
      .split("\\n")
      .map((line) => line.trimEnd())
      .join("\\n")
      .trim();
    const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
    const firstVisible = (root, selectors) => {
      for (const selector of selectors) {
        const match = Array.from(root.querySelectorAll(selector)).find(visible);
        if (match) return match;
      }
      return null;
    };
    const root = document.querySelector("#main");
    const composer = root && firstVisible(root, [
      'footer [contenteditable="true"][role="textbox"]',
      'footer [contenteditable="true"][data-tab]',
      '[contenteditable="true"][role="textbox"]'
    ]);
    if (!composer) return { ok: false, code: "composer_missing", message: "WhatsApp mesaj kutusu bulunamadı." };
    composer.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(composer);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const inserted = document.execCommand("insertText", false, expectedMessage);
    composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: inserted ? "insertText" : "insertText", data: expectedMessage }));
    const composerText = clean(composer.innerText || composer.textContent);
    return composerText === clean(expectedMessage)
      ? { ok: true, code: "filled", message: "Mesaj kutusuna yazıldı.", composerText }
      : { ok: false, code: "fill_failed", message: "WhatsApp mesaj kutusuna güvenli biçimde yazılamadı.", composerText };
  })()`;
}

export function createWhatsAppSendScript(expectedMessage: string, expectedChatTitle: string, expectedPhone = ""): string {
  return `(() => {
    const expectedMessage = ${JSON.stringify(expectedMessage.trim())};
    const expectedChatTitle = ${JSON.stringify(expectedChatTitle.trim())};
    const expectedPhone = ${JSON.stringify(expectedPhone.trim())};
    const clean = (value) => String(value || "")
      .replace(/\\r\\n/g, "\\n")
      .replace(/\\u00a0/g, " ")
      .replace(/\\u200b/g, "")
      .split("\\n")
      .map((line) => line.trimEnd())
      .join("\\n")
      .trim();
    const digits = (value) => String(value || "").replace(/\\D/g, "");
    const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
    const firstVisible = (root, selectors) => {
      for (const selector of selectors) {
        const match = Array.from(root.querySelectorAll(selector)).find(visible);
        if (match) return match;
      }
      return null;
    };
    const targetVerified = (root) => {
      const target = digits(expectedPhone);
      if (!target) return true;
      const urlPhone = digits(new URL(location.href).searchParams.get("phone"));
      if (urlPhone === target) return true;
      return Array.from(root.querySelectorAll('header [data-id], header [data-testid], header [href], header [title], header [aria-label]'))
        .flatMap((element) => [element.getAttribute("data-id"), element.getAttribute("data-testid"), element.getAttribute("href"), element.getAttribute("title"), element.getAttribute("aria-label")])
        .map(digits)
        .some((marker) => marker && marker.includes(target));
    };
    const outgoingMessageCount = (root) => Array.from(root.querySelectorAll('[data-pre-plain-text], .message-out, [data-testid="msg-container"]'))
      .filter((element) => clean(element.innerText || element.textContent).includes(clean(expectedMessage))).length;
    if (location.origin !== "https://web.whatsapp.com") {
      return { ok: false, code: "wrong_origin", message: "Güvenlik kontrolü: açık sayfa WhatsApp Web değil." };
    }
    const root = document.querySelector("#main");
    if (!root) return { ok: false, code: "chat_changed", message: "Sohbet gönderim öncesinde kayboldu." };
    if (!targetVerified(root)) return { ok: false, code: "target_changed", message: "Hedef WhatsApp sohbeti gönderim öncesinde değişti." };
    const composer = firstVisible(root, [
      'footer [contenteditable="true"][role="textbox"]',
      'footer [contenteditable="true"][data-tab]',
      '[contenteditable="true"][role="textbox"]'
    ]);
    const titleNode = firstVisible(root, [
      'header [data-testid="conversation-info-header-chat-title"]',
      'header span[title]',
      'header [role="button"] span[dir="auto"]'
    ]);
    const chatTitle = clean(titleNode && (titleNode.getAttribute("title") || titleNode.textContent));
    const composerText = clean(composer && (composer.innerText || composer.textContent));
    if (!composer || composerText !== clean(expectedMessage) || chatTitle !== clean(expectedChatTitle)) {
      return { ok: false, code: "approval_changed", message: "Sohbet veya mesaj gönderim öncesinde değişti; mesaj gönderilmedi." };
    }
    const beforeOutgoing = outgoingMessageCount(root);
    const sendIcon = firstVisible(root, ['footer span[data-icon="send"]', 'footer [data-testid="compose-btn-send"]']);
    const sendControl = firstVisible(root, [
      'footer button[aria-label="Send"]',
      'footer button[aria-label="Gönder"]',
      'footer [role="button"][aria-label="Send"]',
      'footer [role="button"][aria-label="Gönder"]'
    ]) || (sendIcon && sendIcon.closest('button, [role="button"]'));
    if (!sendControl || sendControl.hasAttribute("disabled") || sendControl.getAttribute("aria-disabled") === "true") {
      return { ok: false, code: "send_missing", message: "WhatsApp Gönder düğmesi hazır değil." };
    }
    sendControl.click();
    return new Promise((resolve) => {
      setTimeout(() => {
        const currentComposer = firstVisible(root, [
          'footer [contenteditable="true"][role="textbox"]',
          'footer [contenteditable="true"][data-tab]',
          '[contenteditable="true"][role="textbox"]'
        ]);
        const remainingText = clean(currentComposer && (currentComposer.innerText || currentComposer.textContent));
        const outgoingConfirmed = outgoingMessageCount(root) > beforeOutgoing;
        resolve(remainingText === "" && outgoingConfirmed
          ? { ok: true, code: "sent", message: "WhatsApp Web gönderimi ve giden mesaj doğrulandı.", chatTitle, composerText: remainingText, targetVerified: true }
          : { ok: false, code: "send_unconfirmed", message: "Gönderim sonucu güvenilir biçimde doğrulanamadı; sent kaydı yazılmadı.", chatTitle, composerText: remainingText, targetVerified: true });
      }, 1200);
    });
  })()`;
}
