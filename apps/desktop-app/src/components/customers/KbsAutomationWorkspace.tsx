import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BadgeCheck, BedDouble, IdCard, UserRound } from "lucide-react";
import type { DesktopDashboardData } from "../../../electron/database";
import type { KbsNotificationController } from "../../app/use-kbs-notification-controller";
import { ActionButton } from "../ui/ActionButton";
import { DataList, DataListItem } from "../ui/DataList";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";
import { useConfirmDialog } from "../ui/useConfirmDialog";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";

type KbsFilter = "attention" | "pending" | "failed" | "sent" | "all";

type KbsWebViewElement = HTMLElement & {
  getWebContentsId?: () => number;
  reload?: () => void;
};

const EGM_KBS_PORTAL_URL = "https://kbs.egm.gov.tr";

interface KbsAutomationWorkspaceProps {
  data: Pick<DesktopDashboardData, "hospitalityNotifications" | "kbsOverview">;
  selectedCustomerId?: string;
  controller: KbsNotificationController;
  egmSessionRequest?: number;
  sessionRetryNotificationId?: string;
  onSessionRetryConsumed?: () => void;
}

export function KbsAutomationWorkspace({
  data,
  selectedCustomerId = "",
  controller,
  egmSessionRequest = 0,
  sessionRetryNotificationId = "",
  onSessionRetryConsumed
}: KbsAutomationWorkspaceProps) {
  const navigation = useWorkspaceNavigation();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [filter, setFilter] = useState<KbsFilter>("attention");
  const [egmSessionOpen, setEgmSessionOpen] = useState(false);
  const [egmSessionMessage, setEgmSessionMessage] = useState("");
  const [egmSessionError, setEgmSessionError] = useState("");
  const egmWebviewRef = useRef<KbsWebViewElement | null>(null);
  const registeredWebviewId = useRef<number | null>(null);
  const credentialsAttempted = useRef(false);
  const pendingSessionRetryId = useRef("");
  const sessionRetryAttempted = useRef(false);
  const sendRef = useRef(controller.send);
  const consumeRetryRef = useRef(onSessionRetryConsumed);
  sendRef.current = controller.send;
  consumeRetryRef.current = onSessionRetryConsumed;
  const overview = data.kbsOverview;

  useEffect(() => {
    if (!egmSessionRequest || overview.provider !== "egm") return;
    credentialsAttempted.current = false;
    sessionRetryAttempted.current = false;
    pendingSessionRetryId.current = sessionRetryNotificationId;
    setEgmSessionOpen(true);
    setEgmSessionMessage("EGM KBS oturumu hazırlanıyor...");
    setEgmSessionError("");
  }, [egmSessionRequest, overview.provider, sessionRetryNotificationId]);

  useEffect(() => {
    if (!egmSessionOpen || overview.provider !== "egm") return;
    const webview = egmWebviewRef.current;
    if (!webview) return;
    let active = true;

    const unregister = () => {
      const id = registeredWebviewId.current;
      if (id === null) return;
      try {
        window.yardimciDesktop?.unregisterKbsWebview?.(id);
      } finally {
        if (registeredWebviewId.current === id) registeredWebviewId.current = null;
      }
    };

    const register = () => {
      try {
        const id = webview.getWebContentsId?.();
        if (!id || !Number.isInteger(id) || id <= 0 || registeredWebviewId.current === id) return;
        unregister();
        window.yardimciDesktop?.registerKbsWebview?.(id);
        registeredWebviewId.current = id;
      } catch {
        setEgmSessionError("EGM KBS web oturumu otomasyon sürücüsüne bağlanamadı.");
      }
    };

    const drive = async () => {
      register();
      setEgmSessionError("");
      const inspected = await window.yardimciDesktop!.inspectEgmKbsSession();
      if (!active) return;

      if (inspected.state === "authenticated") {
        setEgmSessionMessage(inspected.message);
        const retryId = pendingSessionRetryId.current;
        if (retryId && !sessionRetryAttempted.current) {
          sessionRetryAttempted.current = true;
          pendingSessionRetryId.current = "";
          consumeRetryRef.current?.();
          const retryResult = await sendRef.current(retryId);
          if (!active) return;
          setEgmSessionMessage(retryResult?.message || inspected.message);
        }
        return;
      }
      if (inspected.state === "otp_required") {
        setEgmSessionMessage("EGMSEC uygulamasındaki geçici şifreyi bu sayfaya girin. Doğrulama tamamlandığında aynı oturum sonraki bildirimlerde kullanılacak.");
        return;
      }
      if (inspected.state === "login_required") {
        if (credentialsAttempted.current) {
          setEgmSessionMessage("EGM KBS giriş formu yeniden göründü. Kayıtlı bilgileri kontrol edin veya bu sayfadan giriş yapın.");
          return;
        }
        credentialsAttempted.current = true;
        const result = await window.yardimciDesktop!.prepareStoredEgmKbsLogin();
        if (active) setEgmSessionMessage(result.message);
        return;
      }
      setEgmSessionMessage(inspected.message);
    };

    const onAttach = () => register();
    const onReady = () => { void drive(); };
    const onFail = (event: Event) => {
      const detail = event as Event & { errorCode?: number; errorDescription?: string };
      if (detail.errorCode === -3) return;
      setEgmSessionError(detail.errorDescription
        ? "EGM KBS sayfası yüklenemedi: " + detail.errorDescription
        : "EGM KBS sayfası yüklenemedi.");
    };

    webview.addEventListener("did-attach", onAttach);
    webview.addEventListener("dom-ready", onReady);
    webview.addEventListener("did-fail-load", onFail);
    return () => {
      active = false;
      webview.removeEventListener("did-attach", onAttach);
      webview.removeEventListener("dom-ready", onReady);
      webview.removeEventListener("did-fail-load", onFail);
      unregister();
    };
  }, [egmSessionOpen, overview.provider]);

  async function sendNotification(notificationId: string) {
    const result = await controller.send(notificationId);
    if (result?.state === "interaction_required" && overview.provider === "egm") {
      credentialsAttempted.current = false;
      sessionRetryAttempted.current = false;
      pendingSessionRetryId.current = notificationId;
      setEgmSessionOpen(true);
      setEgmSessionMessage("EGM KBS oturumu hazırlanıyor...");
    }
  }

  async function markExternal(notification: DesktopDashboardData["hospitalityNotifications"][number]) {
    const approved = await confirm({
      eyebrow: "Kimlik Bildirim Sistemi",
      title: "Haricen bildirildi olarak işaretle",
      tone: "warning",
      confirmLabel: "Bildirildi Olarak İşaretle",
      description: "Bu işlem yalnızca yerel kaydı tamamlanmış sayar; resmi KBS sistemine yeni bir bildirim göndermez.",
      details: <dl className="info-list">
        <div><dt>Misafir</dt><dd>{notification.customerName}</dd></div>
        <div><dt>Oda</dt><dd>{roomLabel(notification.roomNumber, notification.roomName)}</dd></div>
        <div><dt>İşlem</dt><dd>{kindLabel(notification.kind)}</dd></div>
      </dl>
    });
    if (approved) await controller.markExternallySent(notification.id);
  }

  const notifications = useMemo(() => data.hospitalityNotifications.filter((item) => {
    if (filter === "attention") return item.status !== "sent";
    if (filter === "all") return true;
    return item.status === filter;
  }), [data.hospitalityNotifications, filter]);

  return <section className="kbs-automation-workspace" aria-label="Kimlik bildirimleri">
    {confirmDialog}
    <div className="kbs-overview-grid">
      <article className="panel kbs-overview-card">
        <span>Bağlantı</span>
        <strong>{overview.enabled ? (overview.provider === "egm" ? "Emniyet KBS" : "Jandarma KBS") : "Kapalı"}</strong>
        <StatusBadge tone={!overview.enabled ? "neutral" : overview.configured ? "success" : "wait"}>
          {!overview.enabled ? "Servis kapalı" : overview.configured ? "Ayarlar hazır" : "Ayarlar eksik"}
        </StatusBadge>
      </article>
      <article className="panel kbs-overview-card">
        <span>Konaklayan</span>
        <strong>{overview.checkedInGuestCount}</strong>
        <small>şu anda giriş yapmış misafir</small>
      </article>
      <article className="panel kbs-overview-card">
        <span>Bildirim bekleyen</span>
        <strong>{overview.activeUnsentCount}</strong>
        <small>{overview.activeMissingIdentityCount > 0 ? String(overview.activeMissingIdentityCount) + " misafirde kimlik bilgisi eksik" : "aktif konaklayanlarda eksik kimlik yok"}</small>
      </article>
      <article className="panel kbs-overview-card">
        <span>Gönderim durumu</span>
        <strong>{overview.failedCount > 0 ? String(overview.failedCount) + " hata" : String(overview.sentCount) + " gönderildi"}</strong>
        <small>{overview.pendingCount} kuyrukta</small>
      </article>
    </div>

    {!overview.enabled && <div className="panel empty-state">
      <IdCard size={28} aria-hidden="true" />
      <strong>Kimlik Bildirim Sistemi kapalı.</strong>
      <p>Ayarlar → Servisler bölümünden Emniyet veya Jandarma KBS bağlantısını etkinleştirin.</p>
    </div>}

    {overview.enabled && <>
      <div className="page-toolbar kbs-automation-toolbar">
        <div className="page-toolbar__copy">
          <strong>Bildirim kayıtları</strong>
          <small>Giriş, çıkış ve oda değişikliği kayıtları konaklama misafiri bazında izlenir.</small>
        </div>
        <div className="action-row">
          {overview.provider === "egm" && <ActionButton
            size="sm"
            variant="secondary"
            disabled={!overview.configured}
            onClick={() => {
              credentialsAttempted.current = false;
              setEgmSessionOpen((open) => !open);
              setEgmSessionMessage("EGM KBS oturumu hazırlanıyor...");
              setEgmSessionError("");
            }}
          >
            {egmSessionOpen ? "EGM Oturumunu Kapat" : "EGM Oturumunu Aç"}
          </ActionButton>}
          <div className="action-row" role="group" aria-label="Kimlik bildirimi filtresi">
          {([
            ["attention", "İlgi Bekleyen"],
            ["pending", "Bekleyen"],
            ["failed", "Hatalı"],
            ["sent", "Gönderilen"],
            ["all", "Tümü"]
          ] as const).map(([id, label]) => (
            <ActionButton key={id} size="sm" variant={filter === id ? "primary" : "secondary"} onClick={() => setFilter(id)}>
              {label}
            </ActionButton>
          ))}
          </div>
        </div>
      </div>

      {egmSessionOpen && overview.provider === "egm" && <div className="panel kbs-operations-session">
        <div className="page-toolbar compact">
          <div className="page-toolbar__copy">
            <strong>EGM KBS oturumu</strong>
            <small>Kayıtlı kullanıcı bilgileriyle giriş hazırlanır; EGMSEC geçici şifresi gerekirse bu resmi sayfada siz girersiniz.</small>
          </div>
          <ActionButton variant="ghost" size="sm" onClick={() => setEgmSessionOpen(false)}>Kapat</ActionButton>
        </div>
        {egmSessionMessage && <p className="form-status" role="status">{egmSessionMessage}</p>}
        {egmSessionError && <div className="status-message status-message--danger" role="alert">
          <span>{egmSessionError}</span>
          <ActionButton size="sm" variant="secondary" onClick={() => egmWebviewRef.current?.reload?.()}>Yeniden Yükle</ActionButton>
        </div>}
        <webview
          ref={egmWebviewRef}
          className="kbs-operations-webview"
          src={EGM_KBS_PORTAL_URL}
          partition="persist:yardimci-kbs-egm"
          allowpopups
          webpreferences="contextIsolation=yes,nodeIntegration=no"
        />
      </div>}

      <DataList className="kbs-notification-list">
        {notifications.length === 0 ? <div className="empty-state empty-state--compact">
          <BadgeCheck size={24} aria-hidden="true" />
          <strong>Bu filtrede bildirim yok.</strong>
          <p>Yeni konaklama işlemleri oluştuğunda kayıtlar burada görünür.</p>
        </div> : notifications.map((notification) => (
          <DataListItem
            key={notification.id}
            className={selectedCustomerId === notification.customerId ? "is-selected" : ""}
            leading={notification.status === "failed"
              ? <AlertTriangle size={17} aria-hidden="true" />
              : notification.kind === "arrival"
                ? <IdCard size={17} aria-hidden="true" />
                : <BedDouble size={17} aria-hidden="true" />}
            title={notification.customerName || "Misafir"}
            meta={<>
              <span>{kindLabel(notification.kind)}</span>
              <span>{roomLabel(notification.roomNumber, notification.roomName)}</span>
              <StatusBadge tone={statusTone(notification.status)}>{statusLabel(notification.status)}</StatusBadge>
              {!notification.identityReady && <StatusBadge tone="danger">Kimlik eksik</StatusBadge>}
            </>}
            description={notification.status === "sent"
              ? "Gönderim: " + formatDateTime(notification.sentAt || notification.occurredAt) + (notification.provider ? " · " + providerLabel(notification.provider) : "")
              : "İşlem zamanı: " + formatDateTime(notification.occurredAt)}
            actions={<>
              <ActionButton
                variant="secondary"
                size="sm"
                onClick={() => navigation.openWorkspace({
                  entityType: "customer",
                  entityId: notification.customerId,
                  mode: "main",
                  returnContext: { page: "customerWork", entityId: notification.customerId }
                })}
              >
                <UserRound size={15} aria-hidden="true" />
                {notification.identityReady ? "Müşteriyi Aç" : "Kimliği Tamamla"}
              </ActionButton>
              {notification.status !== "sent" && <ActionButton
                variant="primary"
                size="sm"
                disabled={!overview.configured || !notification.identityReady || controller.busyNotificationId === notification.id}
                onClick={() => { void sendNotification(notification.id); }}
              >
                <IdCard size={15} aria-hidden="true" />
                {controller.busyNotificationId === notification.id ? "Gönderiliyor" : "Bildir"}
              </ActionButton>}
              {notification.status === "failed" && <ActionButton
                variant="secondary"
                size="sm"
                disabled={controller.busyNotificationId === notification.id}
                onClick={() => { void controller.retry(notification.id); }}
              >
                Kuyruğa Al
              </ActionButton>}
              {notification.status !== "sent" && <ActionButton
                variant="ghost"
                size="sm"
                disabled={controller.busyNotificationId === notification.id}
                onClick={() => { void markExternal(notification); }}
              >
                Haricen Bildirildi
              </ActionButton>}
            </>}
          />
        ))}
      </DataList>
    </>}
  </section>;
}

function kindLabel(kind: DesktopDashboardData["hospitalityNotifications"][number]["kind"]) {
  if (kind === "departure") return "Çıkış bildirimi";
  if (kind === "room_change") return "Oda değişikliği";
  return "Giriş bildirimi";
}

function statusLabel(status: DesktopDashboardData["hospitalityNotifications"][number]["status"]) {
  if (status === "sent") return "Bildirildi";
  if (status === "failed") return "Hata";
  return "Bekliyor";
}

function statusTone(status: DesktopDashboardData["hospitalityNotifications"][number]["status"]): StatusTone {
  if (status === "sent") return "success";
  if (status === "failed") return "danger";
  return "wait";
}

function providerLabel(provider: string) {
  return provider === "jandarma" ? "Jandarma KBS" : "Emniyet KBS";
}

function roomLabel(number: string, name: string) {
  return number ? "Oda " + number : name || "Oda";
}

function formatDateTime(value: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Date(value).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}
