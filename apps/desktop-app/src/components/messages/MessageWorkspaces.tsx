import { useConfirmDialog } from "../ui/useConfirmDialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, ExternalLink, MessageCircle, Send, ShieldCheck, Trash2 } from "lucide-react";
import {
  createWhatsAppInspectionScript,
  createWhatsAppSendScript,
  prepareWhatsAppAction,
  WHATSAPP_WEB_HOME_URL,
  type WhatsAppDomResult
} from "@yardimci-asistan/whatsapp-bridge";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import { formatCustomerSource } from "../../app/customer-model";
import { formatRequestStatus, formatRequestType } from "../../app/record-formatters";
import { reportAppStatus } from "../../app/runtime-state";
import { ActionButton } from "../ui/ActionButton";
import { DataList, DataListButton, DataListItem } from "../ui/DataList";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";
import type { EphemeralWhatsAppHandoff } from "../../app/whatsapp-handoff";

type SyncState = "idle" | "loading" | "success" | "error";

interface WhatsAppWorkspaceProps {
  preparedMessage?: EphemeralWhatsAppHandoff | null;
  view: "safe" | "web";
  requests: SyncedCustomerRequest[];
  selectedRequest: SyncedCustomerRequest | undefined;
  selectedMessage: string;
  selectedUrl: string;
  getRequestStatusTone: (status: string) => StatusTone;
  onSelectRequest: (requestId: string) => void;
  onOpenExternal: () => void;
  onOpenWeb?: () => void;
  onReturnToSafe?: () => void;
  onMessageSent: (requestId: string, message: string) => Promise<{ ok: boolean; message: string }>;
  onDeleteMessage: (request: SyncedCustomerRequest) => void;
}

type WhatsAppWebViewElement = HTMLElement & {
  reload?: () => void;
  loadURL?: (url: string) => Promise<void>;
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

export function WhatsAppWorkspace({ view, requests, selectedRequest, selectedMessage, selectedUrl, getRequestStatusTone, onSelectRequest, onOpenExternal, onOpenWeb, onReturnToSafe, onMessageSent, onDeleteMessage, preparedMessage }: WhatsAppWorkspaceProps) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const webViewRef = useRef<WhatsAppWebViewElement | null>(null);
  const registeredGuestIdRef = useRef<number | null>(null);
  const [sendState, setSendState] = useState<SyncState>("idle");
  const [webViewUrl, setWebViewUrl] = useState(WHATSAPP_WEB_HOME_URL);
  const [webViewError, setWebViewError] = useState("");
  const recipientPhone = preparedMessage?.phone ?? selectedRequest?.customer_phone;
  const recipientName = preparedMessage?.customerName || selectedRequest?.customer_name || (preparedMessage ? "Müşteri" : "Talep seçin");
  const preparedMessageLabel = preparedMessage?.source === "birthday"
    ? "Doğum günü mesajı"
    : preparedMessage?.source === "reservation"
      ? preparedMessage.reservationType === "table"
        ? "Masa rezervasyonu"
        : preparedMessage.reservationType === "room"
          ? "Pansiyon rezervasyonu"
          : "Rezervasyon mesajı"
      : "Veresiye hesabı";
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

    const readGuestId = (): number | null => {
      try {
        const id = webView.getWebContentsId?.();
        return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null;
      } catch {
        return null;
      }
    };
    const unregisterRegisteredWebview = () => {
      const id = registeredGuestIdRef.current;
      if (id === null) return;
      try {
        window.yardimciDesktop?.unregisterWhatsAppWebview?.(id);
      } catch {
        // Ignore bridge failures during teardown.
      } finally {
        if (registeredGuestIdRef.current === id) registeredGuestIdRef.current = null;
      }
    };
    const registerWebview = () => {
      const id = readGuestId();
      if (id === null || registeredGuestIdRef.current === id) return;
      unregisterRegisteredWebview();
      try {
        window.yardimciDesktop?.registerWhatsAppWebview?.(id);
        registeredGuestIdRef.current = id;
      } catch {
        // Registration is best-effort automation wiring; the visible page
        // must keep working even if the bridge call fails.
      }
    };
    const handleLoad = () => {
      setWebViewError("");
    };
    const handleFail = (event: Event) => {
      const detail = event as Event & { errorCode?: number; errorDescription?: string };
      if (detail?.errorCode === -3) return;
      setWebViewError(
        typeof detail?.errorDescription === "string" && detail.errorDescription
          ? `WhatsApp Web yüklenemedi: ${detail.errorDescription}`
          : "WhatsApp Web yüklenemedi. Bağlantıyı kontrol edip tekrar deneyin."
      );
    };
    const handleCrash = () => {
      setWebViewError("WhatsApp Web beklenmedik şekilde kapandı. Yeniden yükleyip tekrar deneyin.");
    };

    webView.addEventListener("did-attach", registerWebview);
    webView.addEventListener("dom-ready", registerWebview);
    webView.addEventListener("did-detach", unregisterRegisteredWebview);
    webView.addEventListener("did-finish-load", handleLoad);
    webView.addEventListener("did-fail-load", handleFail);
    webView.addEventListener("crashed", handleCrash);
    webView.addEventListener("unresponsive", handleCrash);
    registerWebview();
    return () => {
      webView.removeEventListener("did-attach", registerWebview);
      webView.removeEventListener("dom-ready", registerWebview);
      webView.removeEventListener("did-detach", unregisterRegisteredWebview);
      webView.removeEventListener("did-finish-load", handleLoad);
      webView.removeEventListener("did-fail-load", handleFail);
      webView.removeEventListener("crashed", handleCrash);
      webView.removeEventListener("unresponsive", handleCrash);
      unregisterRegisteredWebview();
    };
  }, [view]);

  useEffect(() => {
    if (!selectedRequest && !preparedMessage) {
      setSendState("idle");
      setWebViewUrl(WHATSAPP_WEB_HOME_URL);
      return;
    }

    if (!webViewPayload) {
      setSendState("idle");
      setWebViewUrl(WHATSAPP_WEB_HOME_URL);
      return;
    }

    setSendState("idle");
    setWebViewUrl(webViewPayload.homeUrl);
  }, [selectedRequest, webViewAction, webViewPayload, preparedMessage]);

  async function copyPreparedMessage() {
    if (!selectedMessage) {
      reportAppStatus("error", "Kopyalanacak hazır mesaj yok.");
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedMessage);
      reportAppStatus("success", "Hazır mesaj panoya kopyalandı.");
    } catch {
      reportAppStatus("error", "Mesaj panoya kopyalanamadı. Metni elle kopyalayabilirsiniz.");
    }
  }

  function goToCustomerNumber() {
    if (!webViewPayload) return;

    setSendState("idle");
    setWebViewError("");
    setWebViewUrl(webViewPayload.url);

    const webView = webViewRef.current;
    if (!webView?.loadURL) return;
    try {
      if (webView.getURL?.() === webViewPayload.url) return;
    } catch {
      // A detached guest will be handled by the load attempt below.
    }
    void webView.loadURL(webViewPayload.url).catch(() => {
      setWebViewError("WhatsApp Web müşteri sohbetine yönlendirilemedi. Yeniden deneyin.");
    });
  }

  function reloadWebView() {
    setWebViewError("");
    try {
      webViewRef.current?.reload?.();
    } catch {
      setWebViewError("WhatsApp Web yeniden yüklenemedi. Dışarıda Aç seçeneğini deneyin.");
    }
  }

  async function approveAndSendMessage() {
    // Generic credit shares are prepared only; the operator sends in WhatsApp itself.
    if (preparedMessage) return;
    const webView = webViewRef.current;
    if (!selectedRequest || !selectedMessage.trim() || !webView?.executeJavaScript) {
      setSendState("error");
      reportAppStatus("error", "Onaylı gönderim yalnızca masaüstü uygulamasındaki hazır WhatsApp Web ekranında kullanılabilir.");
      return;
    }

    const currentUrl = (() => {
      try {
        return webView.getURL?.() || webViewUrl;
      } catch {
        return webViewUrl;
      }
    })();
    if (!currentUrl.startsWith(WHATSAPP_WEB_HOME_URL)) {
      setSendState("error");
      reportAppStatus("error", "Güvenlik kontrolü: açık sayfa WhatsApp Web olmadığı için gönderim durduruldu.");
      return;
    }

    setSendState("loading");
    reportAppStatus("loading", "WhatsApp sohbeti ve mesaj metni doğrulanıyor.");

    try {
      const inspection = asWhatsAppDomResult(await webView.executeJavaScript(createWhatsAppInspectionScript(selectedMessage), true));
      if (!inspection.ok) {
        setSendState("error");
        reportAppStatus("error", inspection.message);
        return;
      }

      const approved = await confirm({ title: "WhatsApp mesajını gönder", tone: "warning", confirmLabel: "Gönder", description:
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
      });

      if (!approved) {
        setSendState("idle");
        return;
      }

      reportAppStatus("loading", "WhatsApp Web üzerinden mesaj gönderiliyor.");
      const sendResult = asWhatsAppDomResult(
        await webView.executeJavaScript(createWhatsAppSendScript(selectedMessage, inspection.chatTitle || ""), true)
      );
      if (!sendResult.ok) {
        setSendState("error");
        reportAppStatus("error", sendResult.message);
        return;
      }

      const recordResult = await onMessageSent(selectedRequest.id, selectedMessage);
      setSendState(recordResult.ok ? "success" : "error");
      reportAppStatus(
        recordResult.ok ? "success" : "error",
        recordResult.ok
          ? "Mesaj kullanıcı onayıyla WhatsApp Web üzerinden gönderildi."
          : `Mesaj WhatsApp Web'e gönderildi; yerel kayıt güncellenemedi: ${recordResult.message}`
      );
    } catch {
      setSendState("error");
      reportAppStatus("error", "WhatsApp Web güvenlik kontrolü tamamlanamadı. Sohbeti yeniden açıp tekrar deneyin.");
    }
  }

  return (
    <section className={`whatsapp-workspace whatsapp-view-${view}`} aria-label={view === "safe" ? "Güvenli mesaj alanı" : "WhatsApp Web alanı"}>
      {confirmDialog}
      <aside className="panel whatsapp-request-panel">
        {preparedMessage && <div className="panel-heading compact"><div><strong>{recipientName}</strong><p>{preparedMessageLabel} · mesaj hazırlandı</p><small>Gönderim WhatsApp içinde sizin kontrolünüzde.</small></div></div>}
        <div className="panel-heading compact">
          <h2>Hazır Mesajlar</h2>
          <StatusBadge tone="info">{requests.length + (preparedMessage ? 1 : 0)} kayıt</StatusBadge>
        </div>

        <DataList className="whatsapp-request-list">
          {preparedMessage && (
            <DataListItem
              className="message-request-row"
              title={recipientName}
              leading={<MessageCircle size={16} aria-hidden="true" />}
              meta={(
                <>
                  <span>{preparedMessage.phone || "Telefon yok"}</span>
                  <span>{preparedMessageLabel}</span>
                </>
              )}
              selected
            />
          )}
          {requests.map((request) => (
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
              selected={!preparedMessage && selectedRequest?.id === request.id}
              aria-label={`${request.customer_name}, ${request.customer_phone || "telefon yok"}, ${formatRequestType(request.request_type)}, ${formatRequestStatus(request.status)}`}
              aria-pressed={!preparedMessage && selectedRequest?.id === request.id}
              onClick={() => onSelectRequest(request.id)}
            />
          ))}
          {requests.length === 0 && !preparedMessage && (
            <div className="empty-state empty-state--compact">
              <MessageCircle size={24} aria-hidden="true" />
              <strong>Hazır mesaj yok.</strong>
              <p>Bir talep cevabı veya müşteri mesajı hazırlandığında burada görünür.</p>
            </div>
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

        </div>

        <div className="whatsapp-webview-frame">
          {webViewError && (
            <div className="whatsapp-webview-fallback status-message status-message--danger" role="alert">
              <span>{webViewError}</span>
              <div className="whatsapp-webview-fallback-actions">
                <ActionButton size="sm" type="button" onClick={reloadWebView}>
                  Yeniden Yükle
                </ActionButton>
                <ActionButton variant="secondary" size="sm" type="button" onClick={onOpenExternal} disabled={!selectedUrl}>
                  <ExternalLink size={15} aria-hidden="true" />
                  Dışarıda Aç
                </ActionButton>
                <ActionButton variant="secondary" size="sm" type="button" onClick={onReturnToSafe} disabled={!onReturnToSafe}>
                  <ShieldCheck size={15} aria-hidden="true" />
                  Güvenli Moda Dön
                </ActionButton>
              </div>
            </div>
          )}
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
            <dd>{preparedMessage
              ? preparedMessage.source === "reservation" ? "Rezervasyon" : "Müşteri kartı"
              : selectedRequest ? formatCustomerSource(selectedRequest.source) : "-"}</dd>
          </div>
        </dl>

        <label className="form-field form-field--fluid prepared-message-field">
          <span>Mesaj</span>
          <textarea className="prepared-whatsapp-message" readOnly value={selectedMessage} aria-label="Hazır WhatsApp mesajı" />
        </label>
        <div className="message-primary-actions">
          <ActionButton size="sm" type="button" onClick={copyPreparedMessage} disabled={!selectedMessage}>
            <Copy size={16} aria-hidden="true" />
            Hazır Mesajı Kopyala
          </ActionButton>
          <ActionButton variant="whatsapp" size="sm" type="button" onClick={onOpenWeb} disabled={!selectedUrl || !onOpenWeb}>
            <MessageCircle size={16} aria-hidden="true" />
            WhatsApp'a Geç
          </ActionButton>
          {!preparedMessage && <ActionButton variant="danger" size="sm" type="button" onClick={() => selectedRequest && onDeleteMessage(selectedRequest)} disabled={!selectedRequest || !selectedMessage}>
            <Trash2 size={16} aria-hidden="true" />
            Mesajı Sil
          </ActionButton>}
        </div>
      </aside>}
    </section>
  );
}
