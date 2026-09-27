import { BedDouble, CalendarDays, CircleAlert, UserRound, Wallet } from "lucide-react";
import { useRef, useState } from "react";
import type { DesktopRoom, DesktopDashboardData } from "../../../electron/database";
import type { RoomFolioPaymentMethod } from "../../../electron/room-folio";
import type { DesktopRoomOperations } from "../../../electron/database-types";
import { ResourceCard } from "../operations/ResourceCard";
import { ActionButton } from "../ui/ActionButton";
import { ChoiceChips } from "../ui/ChoiceChips";
import { useConfirmDialog } from "../ui/useConfirmDialog";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { useRequestGeneration } from "../workspace/use-request-generation";
import { getRoomCardModel, roomIdentity, type RoomCardCapabilities } from "./room-card-model";
import { setRoomOperationalStatus } from "./room-operations";
import { roomToday } from "./room-presentation";
import { formatDateRange, minorMoney } from "./folio-format";
import { RoomCheckoutConfirmationDetails } from "./RoomCheckoutConfirmation";

export function RoomResourceCard({ room, summary, capabilities, onDashboard }: {
  room: DesktopRoom; summary?: DesktopRoomOperations; capabilities: RoomCardCapabilities;
  onDashboard: (data: DesktopDashboardData) => void;
}) {
  const navigation = useWorkspaceNavigation();
  const model = getRoomCardModel(room, summary, capabilities, roomToday());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const running = useRef(false);
  const checkoutMethod = useRef<RoomFolioPaymentMethod>("cash");
  const begin = useRequestGeneration();
  const { confirm, confirmDialog } = useConfirmDialog();
  const isOutOfService = model.physical === "out_of_service" || room.status === "out_of_service";
  const canSetPhysicalStatus = Boolean(summary && room.isActive && !isOutOfService && !model.current.length && !model.planned.length);
  const physicalValue = model.physical === "ready" ? "available" : model.physical;
  const tone = !summary ? "neutral" : model.physical === "cleaning" ? "warning" : model.physical !== "ready" ? "danger"
    : model.current.length || room.status === "occupied" ? "info" : model.planned.length || model.upcoming ? "warning" : "success";
  const open = () => navigation.openWorkspace({
    entityType: "room",
    entityId: room.id,
    returnContext: { page: "pension", view: "rooms", entityId: room.id }
  });

  async function updatePhysicalStatus(status: string) {
    if (running.current || !canSetPhysicalStatus || status === physicalValue || status === "inactive" || status === "out_of_service") return;
    running.current = true;
    setBusy(true);
    setFeedback("");
    const current = begin();
    try {
      const result = await setRoomOperationalStatus(room.id, status);
      if (!current()) return;
      if (result.ok) onDashboard(result.dashboardData);
      else setFeedback(result.message);
    } catch {
      if (current()) setFeedback("İşlem sonucu doğrulanamadı. Yenileyip kontrol edin.");
    } finally {
      running.current = false;
      if (current()) setBusy(false);
    }
  }

  async function quickAction() {
    const action = model.quickAction;
    if (running.current || !action) return;
    const stay = model.current.find(item => item.id === action.stayId);
    checkoutMethod.current = "cash";
    const approved = await confirm({
      eyebrow: roomIdentity(room),
      title: "Misafir çıkışı",
      description: model.currentAccount?.remainingMinor
        ? "Kalan tutar seçilen ödeme yöntemiyle tahsil edilir; çıkış ve hesap kapanışı birlikte tamamlanır."
        : "Misafir çıkışı tamamlanır; varsa oda hesabı kapatılır ve oda temizlik durumuna geçer.",
      confirmLabel: "Çıkış ve Hesabı Kapat",
      tone: model.currentAccount?.remainingMinor ? "warning" : "info",
      details: stay
        ? <RoomCheckoutConfirmationDetails
            roomLabel={roomIdentity(room)}
            stay={stay}
            account={model.currentAccount}
            onPaymentMethodChange={method => { checkoutMethod.current = method; }}
          />
        : undefined
    });
    if (!approved) return;

    running.current = true;
    setBusy(true);
    setFeedback("");
    const current = begin();
    try {
      if (action.kind === "checkout" && model.currentAccount?.remainingMinor) {
        const payment = await window.yardimciDesktop!.addRoomFolioPayment({
          folioId: model.currentAccount.folioId,
          amountMinor: model.currentAccount.remainingMinor,
          paymentMethod: checkoutMethod.current
        });
        if (!current()) return;
        if (!payment.ok) { setFeedback(payment.message); return; }
      }
      const result = await window.yardimciDesktop!.checkoutStay(action.stayId);
      if (!current()) return;
      if (result.ok) onDashboard(result.dashboardData);
      else setFeedback(result.message);
    } catch {
      if (current()) setFeedback("İşlem sonucu doğrulanamadı. Yenileyip kontrol edin.");
    } finally {
      running.current = false;
      if (current()) setBusy(false);
    }
  }

  return <>
    <ResourceCard
      title={roomIdentity(room)}
      subtitle={[room.capacity > 0 ? `${room.capacity} kişi` : "", room.floor].filter(Boolean).join(" · ")}
      icon={<BedDouble size={22} />}
      tone={tone}
      busy={busy}
      error={Boolean(feedback)}
      feedback={feedback}
      onOpen={open}
      openLabel={`${room.name} odasını aç`}
      status={<>
        {isOutOfService ? (
          <span className="resource-card__out-of-service">Hizmet dışı</span>
        ) : (
          <ChoiceChips
            ariaLabel={`${roomIdentity(room)} fiziksel durumunu değiştir`}
            value={physicalValue}
            disabled={busy || !canSetPhysicalStatus}
            onChange={value => void updatePhysicalStatus(value)}
            options={[
              ...(model.physical === "inactive" ? [{ id: "inactive", label: "Etkin değil", disabled: true }] : []),
              { id: "available", label: "Hazır" },
              { id: "cleaning", label: "Temizlik" },
              { id: "maintenance", label: "Bakımda" }
            ]}
          />
        )}
        {model.current.length > 0 && <span><UserRound size={16} />Misafir içeride</span>}
      </>}
      action={model.quickAction && <ActionButton disabled={busy} onClick={() => void quickAction()}>{model.quickAction.label}</ActionButton>}
    >
      {!summary ? <p className="resource-card__notice"><CircleAlert size={16} />Güncel özet alınamadı.</p> : <>
        {model.current.map(stay => <div className="resource-card__fact" key={stay.id}><span>Mevcut misafir</span><strong>{stay.customerName}</strong><small>{formatDateRange(stay.checkInDate, stay.checkOutDate)}</small></div>)}
        {model.planned[0] && <div className="resource-card__fact"><span><CalendarDays size={15} />Planlı giriş</span><strong>{model.planned[0].customerName}</strong><small>{formatDateRange(model.planned[0].checkInDate, model.planned[0].checkOutDate)}</small></div>}
        {model.upcoming && <div className="resource-card__fact"><span><CalendarDays size={15} />Yaklaşan rezervasyon{model.upcoming.status === "pending" && " · Onay bekliyor"}</span><strong>{model.upcoming.customerName || model.upcoming.title}</strong><small>{formatDateRange(model.upcoming.startDate, model.upcoming.endDate)}</small></div>}
        {model.currentAccount && <div className="resource-card__balance"><span><Wallet size={16} />Mevcut hesap</span><strong>{model.currentAccount.remainingMinor > 0 ? minorMoney(model.currentAccount.remainingMinor, model.currentAccount.currency) : "Ödendi"}</strong></div>}
        {model.previousAccounts.map(account => <div className="resource-card__balance resource-card__balance--previous" key={account.folioId}><span>Önceki misafir · {account.customerName}</span><strong>{minorMoney(account.remainingMinor, account.currency)}</strong></div>)}
        {!model.current.length && !model.planned.length && !model.upcoming && model.physical === "ready" && <p className="resource-card__notice">{room.status === "occupied" ? "Oda dolu" : room.status === "reserved" ? "Oda ayrılmış" : "Konaklamaya hazır"}</p>}
      </>}
    </ResourceCard>
    {confirmDialog}
  </>;
}
