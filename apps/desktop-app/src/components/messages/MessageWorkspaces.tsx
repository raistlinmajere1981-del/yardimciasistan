import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { CheckCircle2, Copy, ExternalLink, MessageCircle, Phone, Save, Send, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import {
  createWhatsAppInspectionScript,
  createWhatsAppSendScript,
  prepareWhatsAppAction,
  WHATSAPP_WEB_HOME_URL,
  type WhatsAppDomResult
} from "@yardimci-asistan/whatsapp-bridge";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type { AiWorkspaceHistoryEntry, AiWorkspaceMode, DesktopDashboardData } from "../../../electron/database";
import { formatCustomerSource } from "../../app/customer-model";
import { formatDateTime, formatRequestStatus, formatRequestType } from "../../app/record-formatters";
import { ActionButton } from "../ui/ActionButton";
import { DataList, DataListButton } from "../ui/DataList";
import { Panel } from "../ui/Panel";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";
import type { PreparedWhatsAppMessage } from "../../app/whatsapp-handoff";

type SyncState = "idle" | "loading" | "success" | "error";

function getAiWorkspaceModeLabel(mode: AiWorkspaceMode) {
  const labels: Record<AiWorkspaceMode, string> = {
    reply: "Cevap taslağı",
    summary: "Talep özeti",
    daily: "Günlük değerlendirme"
  };
  return labels[mode];
}

function getAiStatusTone(state: SyncState, fallback = false): StatusTone {
  if (state === "loading") return "info";
  if (state === "error") return "danger";
  if (state === "success") return fallback ? "warning" : "success";
  return "neutral";
}

function getAiStatusMessageClass(state: SyncState) {
  if (state === "loading") return "status-message status-message--info";
  if (state === "error") return "status-message status-message--danger";
  if (state === "success") return "status-message status-message--success";
  return "status-message";
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

  const handleModeKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, currentMode: AiWorkspaceMode) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowRight" && event.key !== "ArrowUp" && event.key !== "ArrowLeft") {
      return;
    }
    event.preventDefault();
    const currentIndex = modes.findIndex(([value]) => value === currentMode);
    const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
    onModeChange(modes[(currentIndex + direction + modes.length) % modes.length][0]);
  };

  return (
    <section className="ai-workspace" aria-label="AI Yardımcı çalışma alanı">
      <div className="ai-status-grid">
        <Panel className="ai-status-card" padding="compact">
          <span>AI önerileri</span>
          <StatusBadge tone={aiEnabled ? "success" : "danger"}>{aiEnabled ? "Kullanıma hazır" : "Kapalı"}</StatusBadge>
          <small>{customersEnabled ? "Hazır mesaj ve özetler" : "Günlük işletme değerlendirmesi"}</small>
        </Panel>
        <Panel className="ai-status-card" padding="compact">
          <span>Son çalışmalar</span>
          <strong>{history.length} kayıt</strong>
          <small>Bu bilgisayarda saklanır</small>
        </Panel>
        <Panel className="ai-status-card" padding="compact">
          <span>Gönderim kontrolü</span>
          <strong>Her zaman sizde</strong>
          <small>Metinler otomatik gönderilmez</small>
        </Panel>
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
                tabIndex={mode === value ? 0 : -1}
                onKeyDown={(event) => handleModeKeyDown(event, value)}
                onClick={() => onModeChange(value)}
                key={value}
              >
                <Sparkles size={17} aria-hidden="true" />
                <span><strong>{label}</strong><small>{description}</small></span>
              </button>
            ))}
          </div>

          {customersEnabled && <label className="form-field form-field--fluid ai-field">
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
          <label className="form-field form-field--fluid ai-field">
            Ek talimat <small>isteğe bağlı</small>
            <textarea
              value={instructions}
              onChange={(event) => onInstructionsChange(event.target.value.slice(0, 800))}
              placeholder={mode === "reply" ? "Örn. Daha kısa ve samimi yaz." : "Örn. Öncelikli alanları öne al."}
              rows={4}
            />
            <small>{instructions.length}/800</small>
          </label>
          <ActionButton className="ai-generate-button" type="button" onClick={onGenerate} disabled={generateDisabled}>
            <Sparkles size={17} aria-hidden="true" />
            {state === "loading" ? "Hazırlanıyor" : "AI Sonucunu Hazırla"}
          </ActionButton>
        </aside>

        <article className="panel ai-result-panel">
          <div className="panel-heading compact">
            <div>
              <p>Düzenlenebilir Sonuç</p>
              <h2>{entry ? getAiWorkspaceModeLabel(entry.mode) : "Henüz sonuç yok"}</h2>
            </div>
            <StatusBadge tone={getAiStatusTone(state, Boolean(entry?.fallback))}>
              {state === "loading" ? "Çalışıyor" : entry?.fallback ? "Yerel güvenli" : entry ? "AI hazır" : "Bekliyor"}
            </StatusBadge>
          </div>

          {entry ? (
            <>
              <div className="ai-result-meta">
                <span>{entry.requestLabel}</span>
                <span>{entry.fallback ? "Güvenli taslak" : "AI taslağı"}</span>
                <span>{formatDateTime(entry.createdAt)}</span>
              </div>
              {entry.missingFields.length > 0 && (
                <div className="status-message status-message--warning ai-missing-fields"><strong>Eksik bilgiler:</strong> {entry.missingFields.join(", ")}</div>
              )}
              <textarea
                className="ai-result-editor"
                aria-label="AI sonucu"
                value={content}
                onChange={(event) => onContentChange(event.target.value)}
                rows={16}
              />
              <div className="ai-result-actions">
                <ActionButton variant="secondary" size="sm" type="button" onClick={onCopy}><Copy size={16} aria-hidden="true" />Kopyala</ActionButton>
                {customersEnabled && entry.mode !== "daily" && (
                  <ActionButton variant="secondary" size="sm" type="button" onClick={onSave}><Save size={16} aria-hidden="true" />Talebe Kaydet</ActionButton>
                )}
                {whatsappEnabled && (
                  <ActionButton variant="whatsapp" size="sm" type="button" onClick={onWhatsApp} disabled={entry.mode !== "reply"}>
                    <MessageCircle size={16} aria-hidden="true" />WhatsApp'a Hazırla
                  </ActionButton>
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
          <p className={`${getAiStatusMessageClass(state)} ai-workspace-message`} role={state === "error" ? "alert" : "status"} aria-live="polite">{message}</p>
          <div className="status-message status-message--info ai-guardrail-note">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>AI kesin işlem, müsaitlik veya fiyat onayı vermez. Son karar ve gönderim her zaman işletme sahibindedir.</span>
          </div>
        </article>
      </div>

      <Panel className="ai-history-panel" padding="compact">
        <div className="panel-heading compact">
          <div><p>Yerel Geçmiş</p><h2>Son çalışmalar</h2></div>
          <StatusBadge tone="info">{history.length} kayıt</StatusBadge>
        </div>
        {history.length === 0 ? (
          <div className="empty-state empty-state--compact"><strong>Henüz geçmiş yok.</strong><p>Hazırlanan sonuçlar yalnız bu bilgisayarda saklanır.</p></div>
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
      </Panel>
    </section>
  );
}

interface WhatsAppWorkspaceProps {
  preparedMessage?: PreparedWhatsAppMessage | null;
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
  getWebContentsId?: () => number;
  executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>;
};

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

export function WhatsAppWorkspace({ view, requests, selectedRequest, selectedMessage, selectedUrl, aiEnabled, aiState, aiMessage, getRequestStatusTone, onSelectRequest, onOpenExternal, onReturnToSafe, onCall, onRewrite, onMessageSent, onDeleteMessage, preparedMessage }: WhatsAppWorkspaceProps) {
  const webViewRef = useRef<WhatsAppWebViewElement | null>(null);
  const [copyMessage, setCopyMessage] = useState("Hazır mesaj bekliyor.");
  const [sendState, setSendState] = useState<SyncState>("idle");
  const [sendMessage, setSendMessage] = useState("");
  const [webViewUrl, setWebViewUrl] = useState(WHATSAPP_WEB_HOME_URL);
  const recipientPhone = preparedMessage?.phone ?? selectedRequest?.customer_phone;
  const recipientName = preparedMessage?.customerName || selectedRequest?.customer_name || (preparedMessage ? "Müşteri" : "Talep seçin");
  const preparedMessageLabel = preparedMessage?.source === "birthday" ? "Doğum günü mesajı" : "Veresiye hesabı";
  const webViewAction = useMemo(
    () => (recipientPhone ? prepareWhatsAppAction({ phone: recipientPhone, message: selectedMessage, preferredMode: "webview" }) : null),
    [selectedMessage, recipientPhone]
  );
  const webViewPayload = webViewAction?.ok && webViewAction.mode === "webview" ? webViewAction : null;
  const phoneDisplay = webViewPayload?.phoneDisplay ?? recipientPhone ?? "-";

  useEffect(() => {
    if (view !== "web") return;
    const webView = webViewRef.current;
    if (!webView) return;

    const registerWebview = () => {
      const id = webView.getWebContentsId?.();
      if (Number.isInteger(id) && id && window.yardimciDesktop?.registerWhatsAppWebview) {
        window.yardimciDesktop.registerWhatsAppWebview(id);
      }
    };
    const unregisterWebview = () => {
      const id = webView.getWebContentsId?.();
      if (Number.isInteger(id) && id && window.yardimciDesktop?.unregisterWhatsAppWebview) {
        window.yardimciDesktop.unregisterWhatsAppWebview(id);
      }
    };

    webView.addEventListener("did-attach", registerWebview);
    webView.addEventListener("dom-ready", registerWebview);
    webView.addEventListener("did-detach", unregisterWebview);
    registerWebview();
    return () => {
      webView.removeEventListener("did-attach", registerWebview);
      webView.removeEventListener("dom-ready", registerWebview);
      webView.removeEventListener("did-detach", unregisterWebview);
      unregisterWebview();
    };
  }, [view, webViewUrl]);

  useEffect(() => {
    if (!selectedRequest && !preparedMessage) {
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
  }, [selectedRequest, webViewAction, webViewPayload, preparedMessage]);

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
    // Generic credit shares are prepared only; the operator sends in WhatsApp itself.
    if (preparedMessage) return;
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
        {preparedMessage && <div className="panel-heading compact"><div><strong>{recipientName}</strong><p>{preparedMessageLabel} · mesaj hazırlandı</p><small>Gönderim WhatsApp içinde sizin kontrolünüzde.</small></div></div>}
        <div className="panel-heading compact">
          <h2>Talepler</h2>
          <StatusBadge tone="info">{requests.length} kayıt</StatusBadge>
        </div>

        <DataList className="whatsapp-request-list">
          {requests.length === 0 ? (
            <div className="empty-state empty-state--compact">
              <MessageCircle size={24} aria-hidden="true" />
              <strong>Hazır talep yok.</strong>
              <p>Web talepleri çekildiğinde burada görünür.</p>
            </div>
          ) : (
            requests.map((request) => (
              <DataListButton
                className="message-request-row"
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
        </DataList>
      </aside>

      {view === "web" && <section className="panel whatsapp-live-panel">
        <div className="whatsapp-web-control-bar">
          <div className="whatsapp-web-recipient">
            <div>
              <span>WhatsApp Web</span>
              <h2>{recipientName}</h2>
              <small>{phoneDisplay}</small>
            </div>
            <StatusBadge tone={selectedMessage ? "success" : "neutral"}>{selectedMessage ? "Hazır mesaj var" : "Hazır mesaj yok"}</StatusBadge>
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
            {!preparedMessage && <ActionButton className="whatsapp-approved-send" size="sm" type="button" onClick={approveAndSendMessage} disabled={!webViewPayload || sendState === "loading"}>
              <Send size={15} aria-hidden="true" />
              {sendState === "loading" ? "Doğrulanıyor" : "Onayla ve Gönder"}
            </ActionButton>}
          </div>

          <div className="whatsapp-web-feedback">
            <StatusBadge tone={copyMessage.includes("kopyalandı") ? "success" : "neutral"} role="status" aria-live="polite">{copyMessage}</StatusBadge>
            {sendMessage && <StatusBadge className="whatsapp-send-status" tone={getAiStatusTone(sendState)} role="status" aria-live="polite">{sendMessage}</StatusBadge>}
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
            <div className="empty-state empty-state--compact">
              <MessageCircle size={24} aria-hidden="true" />
              <strong>WhatsApp bağlantısı hazır değil.</strong>
            </div>
          )}
        </div>
      </section>}

      {view === "safe" && <aside className="panel whatsapp-copy-panel">
        <div className="panel-heading compact">
          <div className="message-detail-title-group">
            <span className="message-detail-category-label">Hazır yanıt</span>
            <h2>{recipientName}</h2>
          </div>
          {!preparedMessage && selectedRequest && <StatusBadge tone={getRequestStatusTone(selectedRequest.status)}>{formatRequestStatus(selectedRequest.status)}</StatusBadge>}
        </div>

        <dl className="info-list message-recipient-meta">
          <div>
            <dt>Telefon</dt>
            <dd>{phoneDisplay}</dd>
          </div>
          <div>
            <dt>{preparedMessage ? "İşlem" : "Talep türü"}</dt>
            <dd>{preparedMessage ? preparedMessageLabel : selectedRequest ? formatRequestType(selectedRequest.request_type) : "-"}</dd>
          </div>
          <div>
            <dt>Kaynak</dt>
            <dd>{preparedMessage ? "Müşteri kartı" : selectedRequest ? formatCustomerSource(selectedRequest.source) : "-"}</dd>
          </div>
        </dl>

        <label className="form-field form-field--fluid prepared-message-field">
          <span>Mesaj</span>
          <textarea className="prepared-whatsapp-message" readOnly value={selectedMessage} aria-label="Hazır WhatsApp mesajı" />
        </label>
        <p className={`status-message whatsapp-copy-status ${copyMessage.includes("kopyalandı") ? "status-message--success" : ""}`} role="status" aria-live="polite">{copyMessage}</p>

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
          {!preparedMessage && <ActionButton variant="danger" size="sm" type="button" onClick={() => selectedRequest && onDeleteMessage(selectedRequest)} disabled={!selectedRequest || !selectedMessage}>
            <Trash2 size={16} aria-hidden="true" />
            Mesajı Sil
          </ActionButton>}
        </div>
        {aiEnabled && !preparedMessage && (
          <div className="message-ai-actions">
            <strong>AI ile mesajı düzenle</strong>
            <div>
              <ActionButton variant="ghost" size="sm" type="button" onClick={() => onRewrite("Mesajı daha kısa ve doğrudan yaz.")} disabled={aiState === "loading"}>Daha Kısa</ActionButton>
              <ActionButton variant="ghost" size="sm" type="button" onClick={() => onRewrite("Mesajı daha samimi ve sıcak yaz.")} disabled={aiState === "loading"}>Daha Samimi</ActionButton>
              <ActionButton variant="ghost" size="sm" type="button" onClick={() => onRewrite("Mesajı daha resmi ve ölçülü yaz.")} disabled={aiState === "loading"}>Daha Resmi</ActionButton>
              <ActionButton variant="ghost" size="sm" type="button" onClick={() => onRewrite("Mesajı mevcut talep bilgilerine göre yeniden hazırla.")} disabled={aiState === "loading"}>AI ile Yenile</ActionButton>
            </div>
            <p className={`${getAiStatusMessageClass(aiState)} ai-message-status`} role={aiState === "error" ? "alert" : "status"} aria-live="polite">{aiMessage}</p>
          </div>
        )}
      </aside>}
    </section>
  );
}
