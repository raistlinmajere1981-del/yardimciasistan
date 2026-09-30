import { useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, BedDouble, IdCard, UserRound } from "lucide-react";
import type { DesktopDashboardData } from "../../../electron/database";
import type { KbsNotificationController } from "../../app/use-kbs-notification-controller";
import { ActionButton } from "../ui/ActionButton";
import { DataList, DataListItem } from "../ui/DataList";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";
import { useConfirmDialog } from "../ui/useConfirmDialog";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";

type KbsFilter = "attention" | "pending" | "failed" | "sent" | "all";

interface KbsAutomationWorkspaceProps {
  data: Pick<DesktopDashboardData, "hospitalityNotifications" | "kbsOverview">;
  selectedCustomerId?: string;
  controller: KbsNotificationController;
}

export function KbsAutomationWorkspace({ data, selectedCustomerId = "", controller }: KbsAutomationWorkspaceProps) {
  const navigation = useWorkspaceNavigation();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [filter, setFilter] = useState<KbsFilter>("attention");
  const overview = data.kbsOverview;

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

      {controller.message && <p className="form-status" role="status">{controller.message}</p>}
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
            actions={<ActionButton
              variant="secondary"
              size="sm"
              onClick={() => navigation.openWorkspace({
                entityType: "customer",
                entityId: notification.customerId,
                mode: notification.identityReady ? "summary" : "details",
                returnContext: { page: "customerWork", entityId: notification.customerId }
              })}
            >
              <UserRound size={15} aria-hidden="true" />
              {notification.identityReady ? "Müşteriyi Aç" : "Kimliği Tamamla"}
            </ActionButton>}
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
