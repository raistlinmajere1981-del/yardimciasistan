import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, MessageCircle, Phone, Save, Send, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { prepareWhatsAppAction, WHATSAPP_WEB_HOME_URL } from "@yardimci-asistan/whatsapp-bridge";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type { AiWorkspaceHistoryEntry, AiWorkspaceMode, DesktopDashboardData } from "../../../electron/database";
import { formatCustomerSource } from "../../app/customer-model";
import { formatDateTime, formatRequestStatus, formatRequestType } from "../../app/record-formatters";
import { ActionButton } from "../ui/ActionButton";
import { CompactList } from "../ui/CompactList";
import { CompactListButton } from "../ui/CompactListItem";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";

type SyncState = "idle" | "loading" | "success" | "error";

function getAiWorkspaceModeLabel(mode: AiWorkspaceMode) {
  const labels: Record<AiWorkspaceMode, string> = {
    reply: "Cevap taslağı",
    summary: "Talep özeti",
    daily: "Günlük değerlendirme"
  };
  return labels[mode];
}

interface AiWorkspaceProps {
  dashboardData: DesktopDashboardData;
  aiEnabled: boolean;
  customersEnabled: boolean;
  whatsappEnabled: boolean;
  mode: AiWorkspaceMode;
  selectedRequestId: string;
  instructions: string;
  entry: AiWorkspaceHistoryEntry | null;
  content: string;
  history: AiWorkspaceHistoryEntry[];
  state: SyncState;
  message: string;
  onModeChange: (mode: AiWorkspaceMode) => void;
  onRequestChange: (requestId: string) => void;
  onInstructionsChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onGenerate: () => void;
  onSave: () => void;
  onCopy: () => void;
  onWhatsApp: () => void;
  onSelectHistory: (entry: AiWorkspaceHistoryEntry) => void;
}

export function AiWorkspace({
  dashboardData,
  aiEnabled,
  customersEnabled,
  whatsappEnabled,
  mode,
  selectedRequestId,
  instructions,
  entry,
  content,
  history,
  state,
  message,
  onModeChange,
  onRequestChange,
  onInstructionsChange,
  onContentChange,
  onGenerate,
  onSave,
  onCopy,
  onWhatsApp,
  onSelectHistory
}: AiWorkspaceProps) {
  const needsRequest = mode !== "daily";
  const selectedRequest = dashboardData.requests.find((request) => request.id === selectedRequestId);
  const generateDisabled = !aiEnabled || state === "loading" || (needsRequest && !selectedRequest);
  const modes: Array<[AiWorkspaceMode, string, string]> = customersEnabled
    ? [
        ["reply", "Cevap taslağı", whatsappEnabled ? "WhatsApp için sıcak ve kontrollü yanıt" : "Sıcak ve kontrollü müşteri yanıtı"],
        ["summary", "Talebi özetle", "Eksikleri ve önemli noktaları çıkar"],
        ["daily", "Günü değerlendir", "İşleri, riskleri ve öncelikleri sırala"]
      ]
    : [["daily", "Günü değerlendir", "Etkin işletme alanlarını ve öncelikleri sırala"]];

  return (
    <section className="ai-workspace" aria-label="AI Yardımcı çalışma alanı">
      <div className="ai-status-grid">
        <article className="ai-status-card">
          <span>AI önerileri</span>
          <strong className={aiEnabled ? "is-online" : "is-offline"}>{aiEnabled ? "Kullanıma hazır" : "Kapalı"}</strong>
          <small>{customersEnabled ? "Hazır mesaj ve özetler" : "Günlük işletme değerlendirmesi"}</small>
        </article>
        <article className="ai-status-card">
          <span>Son çalışmalar</span>
          <strong>{history.length} kayıt</strong>
          <small>Bu bilgisayarda saklanır</small>
        </article>
        <article className="ai-status-card">
          <span>Gönderim kontrolü</span>
          <strong>Her zaman sizde</strong>
          <small>Metinler otomatik gönderilmez</small>
        </article>
      </div>

      <div className="ai-workspace-grid">
        <aside className="panel ai-tool-panel">
          <div className="panel-heading compact">
            <div>
              <p>Çalışma Türü</p>
              <h2>Ne hazırlayalım?</h2>
            </div>
          </div>
          <div className="ai-mode-list" role="tablist" aria-label="AI çalışma türleri">
            {modes.map(([value, label, description]) => (
              <button
                className={mode === value ? "ai-mode-button is-active" : "ai-mode-button"}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => onModeChange(value)}
                key={value}
              >
                <Sparkles size={17} aria-hidden="true" />
                <span><strong>{label}</strong><small>{description}</small></span>
              </button>
            ))}
          </div>

          {customersEnabled && <label className="ai-field">
            Talep / müşteri
            <select value={selectedRequestId} onChange={(event) => onRequestChange(event.target.value)} disabled={!needsRequest}>
              {dashboardData.requests.length === 0 && <option value="">Talep bulunmuyor</option>}
              {dashboardData.requests.map((request) => (
                <option value={request.id} key={request.id}>{request.customer_name} — {formatRequestType(request.request_type)}</option>
              ))}
            </select>
          </label>}
          {selectedRequest && needsRequest && (
            <div className="ai-request-context">
              <strong>{selectedRequest.customer_name}</strong>
              <span>{selectedRequest.date_text || selectedRequest.start_date || "Tarih yok"} • {selectedRequest.guest_count || "?"} kişi</span>
              <p>{selectedRequest.message || "Talep notu bulunmuyor."}</p>
            </div>
          )}
          <label className="ai-field">
            Ek talimat <small>isteğe bağlı</small>
            <textarea
              value={instructions}
              onChange={(event) => onInstructionsChange(event.target.value.slice(0, 800))}
              placeholder={mode === "reply" ? "Örn. Daha kısa ve samimi yaz." : "Örn. Öncelikli alanları öne al."}
              rows={4}
            />
            <small>{instructions.length}/800</small>
          </label>
          <button className="primary-command ai-generate-button" type="button" onClick={onGenerate} disabled={generateDisabled}>
            <Sparkles size={17} aria-hidden="true" />
            {state === "loading" ? "Hazırlanıyor" : "AI Sonucunu Hazırla"}
          </button>
        </aside>

        <article className="panel ai-result-panel">
          <div className="panel-heading compact">
            <div>
              <p>Düzenlenebilir Sonuç</p>
              <h2>{entry ? getAiWorkspaceModeLabel(entry.mode) : "Henüz sonuç yok"}</h2>
            </div>
            <span className={`status-badge ${state === "success" ? "ok" : state === "error" ? "wait" : "info"}`}>
              {state === "loading" ? "Çalışıyor" : entry?.fallback ? "Yerel güvenli" : entry ? "AI hazır" : "Bekliyor"}
            </span>
          </div>

          {entry ? (
            <>
              <div className="ai-result-meta">
                <span>{entry.requestLabel}</span>
                <span>{entry.fallback ? "Güvenli taslak" : "AI taslağı"}</span>
                <span>{formatDateTime(entry.createdAt)}</span>
              </div>
              {entry.missingFields.length > 0 && (
                <div className="ai-missing-fields"><strong>Eksik bilgiler:</strong> {entry.missingFields.join(", ")}</div>
              )}
              <textarea
                className="ai-result-editor"
                aria-label="AI sonucu"
                value={content}
                onChange={(event) => onContentChange(event.target.value)}
                rows={16}
              />
              <div className="ai-result-actions">
                <button type="button" onClick={onCopy}><Copy size={16} aria-hidden="true" />Kopyala</button>
                {customersEnabled && entry.mode !== "daily" && (
                  <button type="button" onClick={onSave}><Save size={16} aria-hidden="true" />Talebe Kaydet</button>
                )}
                {whatsappEnabled && (
                  <button className="whatsapp-action" type="button" onClick={onWhatsApp} disabled={entry.mode !== "reply"}>
                    <MessageCircle size={16} aria-hidden="true" />WhatsApp'a Hazırla
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state ai-empty-result">
              <Sparkles size={34} aria-hidden="true" />
              <strong>AI çalışma alanı hazır.</strong>
              <p>{customersEnabled
                ? "Sol taraftan araç ve talep seçip sonucu hazırlayın. Üretilen metin gönderilmeden önce mutlaka sizin kontrolünüzden geçer."
                : "Günlük işletme değerlendirmesini hazırlayın. Üretilen metin kullanılmadan önce mutlaka sizin kontrolünüzden geçer."}</p>
            </div>
          )}
          <p className={`ai-workspace-message sync-${state}`}>{message}</p>
          <div className="ai-guardrail-note">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>AI kesin işlem, müsaitlik veya fiyat onayı vermez. Son karar ve gönderim her zaman işletme sahibindedir.</span>
          </div>
        </article>
      </div>

      <article className="panel ai-history-panel">
        <div className="panel-heading compact">
          <div><p>Yerel Geçmiş</p><h2>Son çalışmalar</h2></div>
          <span className="status-badge info">{history.length} kayıt</span>
        </div>
        {history.length === 0 ? (
          <div className="empty-state compact-empty"><strong>Henüz geçmiş yok.</strong><p>Hazırlanan sonuçlar yalnız bu bilgisayarda saklanır.</p></div>
        ) : (
          <div className="ai-history-list">
            {history.map((historyEntry) => (
              <button type="button" onClick={() => onSelectHistory(historyEntry)} key={historyEntry.id}>
                <span className="ai-history-icon"><Sparkles size={16} aria-hidden="true" /></span>
                <span><strong>{getAiWorkspaceModeLabel(historyEntry.mode)}</strong><small>{historyEntry.requestLabel}</small></span>
                <time>{formatDateTime(historyEntry.createdAt)}</time>
              </button>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

interface WhatsAppWorkspaceProps {
  view: "safe" | "web";
  requests: SyncedCustomerRequest[];
  selectedRequest: SyncedCustomerRequest | undefined;
  selectedMessage: string;
  selectedUrl: string;
  aiEnabled: boolean;
  aiState: SyncState;
  aiMessage: string;
  getRequestStatusTone: (status: string) => StatusTone;
  onSelectRequest: (requestId: string) => void;
  onOpenExternal: () => void;
  onReturnToSafe?: () => void;
  onCall?: () => void;
  onRewrite: (instructions: string) => void;
  onMessageSent: (requestId: string, message: string) => Promise<{ ok: boolean; message: string }>;
  onDeleteMessage: (request: SyncedCustomerRequest) => void;
}

type WhatsAppWebViewElement = HTMLElement & {
  reload?: () => void;
  getURL?: () => string;
  executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>;
};

interface WhatsAppDomResult {
  ok: boolean;
  code: string;
  message: string;
  chatTitle?: string;
  composerText?: string;
}

function asWhatsAppDomResult(value: unknown): WhatsAppDomResult {
  if (!value || typeof value !== "object") {
    return {
      ok: false,
      code: "invalid_result",
      message: "WhatsApp Web beklenen doğrulama sonucunu döndürmedi."
    };
  }

  const result = value as Partial<WhatsAppDomResult>;
  return {
    ok: result.ok === true,
    code: String(result.code ?? "unknown"),
    message: String(result.message ?? "WhatsApp Web işlemi tamamlanamadı."),
    chatTitle: typeof result.chatTitle === "string" ? result.chatTitle : "",
    composerText: typeof result.composerText === "string" ? result.composerText : ""
  };
}

function createWhatsAppInspectionScript(expectedMessage: string) {
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
    if (location.origin !== "https://web.whatsapp.com") {
      return { ok: false, code: "wrong_origin", message: "Güvenlik kontrolü: açık sayfa WhatsApp Web değil." };
    }
    const root = document.querySelector("#main");
    if (!root) {
      return { ok: false, code: "chat_missing", message: "Açık bir WhatsApp sohbeti bulunamadı. Önce Müşteri Numarasına Git düğmesini kullanın." };
    }
    const composer = firstVisible(root, [
      'footer [contenteditable="true"][role="textbox"]',
      'footer [contenteditable="true"][data-tab]',
      '[contenteditable="true"][role="textbox"]'
    ]);
    if (!composer) {
      return { ok: false, code: "composer_missing", message: "WhatsApp mesaj kutusu bulunamadı. Oturumun açık ve sohbetin yüklenmiş olduğunu kontrol edin." };
    }
    const composerText = clean(composer.innerText || composer.textContent);
    if (composerText !== clean(expectedMessage)) {
      return { ok: false, code: "message_mismatch", message: "Güvenlik kontrolü: WhatsApp mesaj kutusundaki metin onaylanacak AI taslağıyla birebir eşleşmiyor.", composerText };
    }
    const titleNode = firstVisible(root, [
      'header [data-testid="conversation-info-header-chat-title"]',
      'header span[title]',
      'header [role="button"] span[dir="auto"]'
    ]);
    const chatTitle = clean(titleNode && (titleNode.getAttribute("title") || titleNode.textContent));
    if (!chatTitle) {
      return { ok: false, code: "recipient_missing", message: "Açık sohbetin alıcı bilgisi okunamadı; gönderim güvenlik nedeniyle durduruldu." };
    }
    const sendIcon = firstVisible(root, ['footer span[data-icon="send"]', 'footer [data-testid="compose-btn-send"]']);
    const sendControl = firstVisible(root, [
      'footer button[aria-label="Send"]',
      'footer button[aria-label="Gönder"]',
      'footer [role="button"][aria-label="Send"]',
      'footer [role="button"][aria-label="Gönder"]'
    ]) || (sendIcon && sendIcon.closest('button, [role="button"]'));
    if (!sendControl || sendControl.hasAttribute("disabled") || sendControl.getAttribute("aria-disabled") === "true") {
      return { ok: false, code: "send_missing", message: "WhatsApp Gönder düğmesi hazır değil. Sohbet ve mesaj kutusunu kontrol edin." };
    }
    return { ok: true, code: "ready", message: "Sohbet ve mesaj doğrulandı.", chatTitle, composerText };
  })()`;
}

function createWhatsAppSendScript(expectedMessage: string, expectedChatTitle: string) {
  return `(() => {
    const expectedMessage = ${JSON.stringify(expectedMessage.trim())};
    const expectedChatTitle = ${JSON.stringify(expectedChatTitle.trim())};
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
    if (location.origin !== "https://web.whatsapp.com") {
      return { ok: false, code: "wrong_origin", message: "Güvenlik kontrolü: açık sayfa WhatsApp Web değil." };
    }
    const root = document.querySelector("#main");
    if (!root) {
      return { ok: false, code: "chat_changed", message: "Sohbet onaydan sonra değişti; mesaj gönderilmedi." };
    }
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
      return { ok: false, code: "approval_changed", message: "Sohbet veya mesaj onaydan sonra değişti; mesaj gönderilmedi." };
    }
    const sendIcon = firstVisible(root, ['footer span[data-icon="send"]', 'footer [data-testid="compose-btn-send"]']);
    const sendControl = firstVisible(root, [
      'footer button[aria-label="Send"]',
      'footer button[aria-label="Gönder"]',
      'footer [role="button"][aria-label="Send"]',
      'footer [role="button"][aria-label="Gönder"]'
    ]) || (sendIcon && sendIcon.closest('button, [role="button"]'));
    if (!sendControl || sendControl.hasAttribute("disabled") || sendControl.getAttribute("aria-disabled") === "true") {
      return { ok: false, code: "send_missing", message: "WhatsApp Gönder düğmesi onaydan sonra kullanılamaz oldu; mesaj gönderilmedi." };
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
        resolve(remainingText === ""
          ? { ok: true, code: "sent", message: "WhatsApp Web mesaj kutusu temizlendi; gönderim tamamlandı.", chatTitle }
          : { ok: false, code: "send_unconfirmed", message: "Gönderim sonucu kesin doğrulanamadı. Yinelenen mesajı önlemek için tekrar göndermeden önce sohbeti kontrol edin.", chatTitle, composerText: remainingText });
      }, 1200);
    });
  })()`;
}

export function WhatsAppWorkspace({ view, requests, selectedRequest, selectedMessage, selectedUrl, aiEnabled, aiState, aiMessage, getRequestStatusTone, onSelectRequest, onOpenExternal, onReturnToSafe, onCall, onRewrite, onMessageSent, onDeleteMessage }: WhatsAppWorkspaceProps) {
  const webViewRef = useRef<WhatsAppWebViewElement | null>(null);
  const [copyMessage, setCopyMessage] = useState("Hazır mesaj bekliyor.");
  const [sendState, setSendState] = useState<SyncState>("idle");
  const [sendMessage, setSendMessage] = useState("");
  const [webViewUrl, setWebViewUrl] = useState(WHATSAPP_WEB_HOME_URL);
  const webViewAction = useMemo(
    () => (selectedRequest ? prepareWhatsAppAction({ phone: selectedRequest.customer_phone, message: selectedMessage, preferredMode: "webview" }) : null),
    [selectedMessage, selectedRequest]
  );
  const webViewPayload = webViewAction?.ok && webViewAction.mode === "webview" ? webViewAction : null;
  const phoneDisplay = webViewPayload?.phoneDisplay ?? selectedRequest?.customer_phone ?? "-";

  useEffect(() => {
    if (!selectedRequest) {
      setCopyMessage("Hazır mesaj bekliyor.");
      setSendState("idle");
      setSendMessage("Gönderim için talep seçin.");
      setWebViewUrl(WHATSAPP_WEB_HOME_URL);
      return;
    }

    if (!webViewPayload) {
      setCopyMessage("Mesaj elle kopyalanabilir.");
      setSendState("error");
      setSendMessage("Geçerli telefon ve hazır mesaj olmadan gönderim yapılamaz.");
      setWebViewUrl(WHATSAPP_WEB_HOME_URL);
      return;
    }

    setCopyMessage("Hazır mesaj bekliyor.");
    setSendState("idle");
    setSendMessage("");
    setWebViewUrl(webViewPayload.homeUrl);
  }, [selectedRequest, webViewAction, webViewPayload]);

  async function copyPreparedMessage() {
    if (!selectedMessage) {
      setCopyMessage("Kopyalanacak hazır mesaj yok.");
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedMessage);
      setCopyMessage("Hazır mesaj kopyalandı.");
    } catch {
      setCopyMessage("Mesaj elle kopyalanabilir.");
    }
  }

  function goToCustomerNumber() {
    if (!webViewPayload) {
      return;
    }

    setSendState("idle");
    setSendMessage("WhatsApp Web sohbeti ve hazır metin yükleniyor.");
    setWebViewUrl(webViewPayload.url);
  }

  async function approveAndSendMessage() {
    const webView = webViewRef.current;
    if (!selectedRequest || !selectedMessage.trim() || !webView?.executeJavaScript) {
      setSendState("error");
      setSendMessage("Onaylı gönderim yalnızca masaüstü uygulamasındaki hazır WhatsApp Web ekranında kullanılabilir.");
      return;
    }

    const currentUrl = webView.getURL?.() || webViewUrl;
    if (!currentUrl.startsWith(WHATSAPP_WEB_HOME_URL)) {
      setSendState("error");
      setSendMessage("Güvenlik kontrolü: açık sayfa WhatsApp Web olmadığı için gönderim durduruldu.");
      return;
    }

    setSendState("loading");
    setSendMessage("Açık sohbet ve mesaj metni doğrulanıyor...");

    try {
      const inspection = asWhatsAppDomResult(await webView.executeJavaScript(createWhatsAppInspectionScript(selectedMessage), true));
      if (!inspection.ok) {
        setSendState("error");
        setSendMessage(inspection.message);
        return;
      }

      const approved = window.confirm(
        [
          "WhatsApp Web üzerinden mesaj gönderilecek.",
          "",
          `Açık sohbet: ${inspection.chatTitle || "Bilinmeyen sohbet"}`,
          `Talep sahibi: ${selectedRequest.customer_name} (${selectedRequest.customer_phone})`,
          "",
          "Gönderilecek mesaj:",
          selectedMessage,
          "",
          "Bu mesajı göndermeyi onaylıyor musunuz?"
        ].join("\n")
      );

      if (!approved) {
        setSendState("idle");
        setSendMessage("Gönderim kullanıcı tarafından iptal edildi.");
        return;
      }

      setSendMessage("Onay alındı; WhatsApp Web gönderimi yapılıyor...");
      const sendResult = asWhatsAppDomResult(
        await webView.executeJavaScript(createWhatsAppSendScript(selectedMessage, inspection.chatTitle || ""), true)
      );
      if (!sendResult.ok) {
        setSendState("error");
        setSendMessage(sendResult.message);
        return;
      }

      const recordResult = await onMessageSent(selectedRequest.id, selectedMessage);
      setSendState("success");
      setSendMessage(
        recordResult.ok
          ? "Mesaj kullanıcı onayıyla WhatsApp Web üzerinden gönderildi."
          : `Mesaj WhatsApp Web'e gönderildi; yerel kayıt güncellenemedi: ${recordResult.message}`
      );
    } catch {
      setSendState("error");
      setSendMessage("WhatsApp Web güvenlik kontrolü tamamlanamadı. Sohbeti yeniden açıp tekrar deneyin.");
    }
  }

  return (
    <section className={`whatsapp-workspace whatsapp-view-${view}`} aria-label={view === "safe" ? "Güvenli mesaj alanı" : "WhatsApp Web alanı"}>
      <aside className="panel whatsapp-request-panel">
        <div className="panel-heading compact">
          <h2>Talepler</h2>
          <StatusBadge tone="info">{requests.length} kayıt</StatusBadge>
        </div>

        <CompactList className="manager-list operation-compact-list whatsapp-request-list">
          {requests.length === 0 ? (
            <div className="empty-state compact-empty">
              <MessageCircle size={24} aria-hidden="true" />
              <strong>Hazır talep yok.</strong>
              <p>Web talepleri çekildiğinde burada görünür.</p>
            </div>
          ) : (
            requests.map((request) => (
              <CompactListButton
                className="manager-row operation-list-item message-request-row"
                key={request.id}
                title={request.customer_name}
                leading={<span className={`status-dot tone-${getRequestStatusTone(request.status)}`} aria-hidden="true" />}
                meta={(
                  <>
                    <span>{request.customer_phone || "Telefon yok"}</span>
                    <span>{formatRequestType(request.request_type)}</span>
                  </>
                )}
                selected={selectedRequest?.id === request.id}
                aria-label={`${request.customer_name}, ${request.customer_phone || "telefon yok"}, ${formatRequestType(request.request_type)}, ${formatRequestStatus(request.status)}`}
                aria-pressed={selectedRequest?.id === request.id}
                onClick={() => onSelectRequest(request.id)}
              />
            ))
          )}
        </CompactList>
      </aside>

      {view === "web" && <section className="panel whatsapp-live-panel">
        <div className="whatsapp-web-control-bar">
          <div className="whatsapp-web-recipient">
            <div>
              <span>WhatsApp Web</span>
              <h2>{selectedRequest?.customer_name ?? "Talep seçin"}</h2>
              <small>{phoneDisplay}</small>
            </div>
            <StatusBadge tone={selectedMessage ? "ok" : "neutral"}>{selectedMessage ? "Hazır mesaj var" : "Hazır mesaj yok"}</StatusBadge>
          </div>

          <p className="whatsapp-web-message-preview">
            {selectedMessage || "Hazır mesaj oluşturmak veya düzenlemek için Güvenli Moda dönün."}
          </p>

          <div className="whatsapp-web-control-actions">
            <ActionButton variant="ghost" size="sm" type="button" onClick={copyPreparedMessage} disabled={!selectedMessage}>
              <Copy size={15} aria-hidden="true" />
              Hazır Mesajı Kopyala
            </ActionButton>
            <ActionButton variant="whatsapp" size="sm" type="button" onClick={goToCustomerNumber} disabled={!webViewPayload}>
              <MessageCircle size={15} aria-hidden="true" />
              Müşteri Numarasına Git
            </ActionButton>
            <ActionButton variant="secondary" size="sm" type="button" onClick={onOpenExternal} disabled={!selectedUrl}>
              <ExternalLink size={15} aria-hidden="true" />
              Dışarıda Aç
            </ActionButton>
            <ActionButton variant="secondary" size="sm" type="button" onClick={onReturnToSafe} disabled={!onReturnToSafe}>
              <ShieldCheck size={15} aria-hidden="true" />
              Güvenli Moda Dön
            </ActionButton>
            <ActionButton className="whatsapp-approved-send" size="sm" type="button" onClick={approveAndSendMessage} disabled={!webViewPayload || sendState === "loading"}>
              <Send size={15} aria-hidden="true" />
              {sendState === "loading" ? "Doğrulanıyor" : "Onayla ve Gönder"}
            </ActionButton>
          </div>

          <div className="whatsapp-web-feedback">
            <span className={copyMessage.includes("kopyalandı") ? "sync-success" : ""} role="status">{copyMessage}</span>
            {sendMessage && <span className={`whatsapp-send-status sync-${sendState}`} role="status">{sendMessage}</span>}
          </div>
        </div>

        <div className="whatsapp-webview-frame">
          {webViewUrl ? (
            <webview
              ref={webViewRef}
              className="whatsapp-webview"
              src={webViewUrl}
              partition="persist:yardimci-whatsapp"
              allowpopups
              webpreferences="contextIsolation=yes,nodeIntegration=no"
            />
          ) : (
            <div className="empty-state compact-empty">
              <MessageCircle size={24} aria-hidden="true" />
              <strong>WhatsApp bağlantısı hazır değil.</strong>
            </div>
          )}
        </div>
      </section>}

      {view === "safe" && <aside className="panel whatsapp-copy-panel">
        <div className="panel-heading compact">
          <div className="detail-title-group">
            <span className="detail-category-label">Hazır yanıt</span>
            <h2>{selectedRequest?.customer_name ?? "Talep seçin"}</h2>
          </div>
          {selectedRequest && <StatusBadge tone={getRequestStatusTone(selectedRequest.status)}>{formatRequestStatus(selectedRequest.status)}</StatusBadge>}
        </div>

        <dl className="info-list compact-detail-meta message-recipient-meta">
          <div>
            <dt>Telefon</dt>
            <dd>{phoneDisplay}</dd>
          </div>
          <div>
            <dt>Talep türü</dt>
            <dd>{selectedRequest ? formatRequestType(selectedRequest.request_type) : "-"}</dd>
          </div>
          <div>
            <dt>Kaynak</dt>
            <dd>{selectedRequest ? formatCustomerSource(selectedRequest.source) : "-"}</dd>
          </div>
        </dl>

        <label className="prepared-message-field">
          <span>Mesaj</span>
          <textarea className="prepared-whatsapp-message" readOnly value={selectedMessage} aria-label="Hazır WhatsApp mesajı" />
        </label>
        <p className={`menu-status whatsapp-copy-status ${copyMessage.includes("kopyalandı") ? "sync-success" : ""}`}>{copyMessage}</p>

        <div className="message-primary-actions">
          <ActionButton size="sm" type="button" onClick={copyPreparedMessage} disabled={!selectedMessage}>
            <Copy size={16} aria-hidden="true" />
            Hazır Mesajı Kopyala
          </ActionButton>
          <ActionButton variant="whatsapp" size="sm" type="button" onClick={onOpenExternal} disabled={!selectedUrl}>
            <ExternalLink size={16} aria-hidden="true" />
            WhatsApp Linkini Aç
          </ActionButton>
          <ActionButton variant="secondary" size="sm" type="button" onClick={onCall} disabled={!onCall}>
            <Phone size={16} aria-hidden="true" />
            Müşteriyi Ara
          </ActionButton>
          <ActionButton variant="danger" size="sm" type="button" onClick={() => selectedRequest && onDeleteMessage(selectedRequest)} disabled={!selectedRequest || !selectedMessage}>
            <Trash2 size={16} aria-hidden="true" />
            Mesajı Sil
          </ActionButton>
        </div>
        {aiEnabled && (
          <div className="message-ai-actions">
            <strong>AI ile mesajı düzenle</strong>
            <div>
              <ActionButton variant="ghost" size="sm" type="button" onClick={() => onRewrite("Mesajı daha kısa ve doğrudan yaz.")} disabled={aiState === "loading"}>Daha Kısa</ActionButton>
              <ActionButton variant="ghost" size="sm" type="button" onClick={() => onRewrite("Mesajı daha samimi ve sıcak yaz.")} disabled={aiState === "loading"}>Daha Samimi</ActionButton>
              <ActionButton variant="ghost" size="sm" type="button" onClick={() => onRewrite("Mesajı daha resmi ve ölçülü yaz.")} disabled={aiState === "loading"}>Daha Resmi</ActionButton>
              <ActionButton variant="ghost" size="sm" type="button" onClick={() => onRewrite("Mesajı mevcut talep bilgilerine göre yeniden hazırla.")} disabled={aiState === "loading"}>AI ile Yenile</ActionButton>
            </div>
            <p className={`menu-status sync-${aiState}`}>{aiMessage}</p>
          </div>
        )}
      </aside>}
    </section>
  );
}
