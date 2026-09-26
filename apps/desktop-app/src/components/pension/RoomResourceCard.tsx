import { BedDouble, CalendarDays, CircleCheck, CircleAlert, UserRound, Wallet, Wrench, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import type { DesktopRoom, DesktopDashboardData } from "../../../electron/database";
import type { DesktopRoomOperations } from "../../../electron/database-types";
import { ResourceCard } from "../operations/ResourceCard";
import { ActionButton } from "../ui/ActionButton";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { useRequestGeneration } from "../workspace/use-request-generation";
import { getRoomCardModel, roomIdentity, type RoomCardCapabilities } from "./room-card-model";
import { setRoomOperationalStatus } from "./room-operations";
import { roomToday } from "./room-presentation";
import { formatDateRange, minorMoney } from "./folio-format";

export function RoomResourceCard({ room, summary, capabilities, onDashboard }: {
  room: DesktopRoom; summary?: DesktopRoomOperations; capabilities: RoomCardCapabilities;
  onDashboard: (data: DesktopDashboardData) => void;
}) {
  const navigation = useWorkspaceNavigation();
  const model = getRoomCardModel(room, summary, capabilities, roomToday());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const running = useRef(false);
  const begin = useRequestGeneration();
  const physicalLabels: Record<string, string> = { ready: "Hazır", cleaning: "Temizlik bekliyor", maintenance: "Bakımda", out_of_service: "Hizmet dışı", inactive: "Etkin değil" };
  const tone = !summary ? "neutral" : model.physical === "cleaning" ? "warning" : model.physical !== "ready" ? "danger"
    : model.current.length || room.status === "occupied" ? "info" : model.planned.length || model.upcoming ? "warning" : "success";
  const open = (intent = {}) => navigation.openWorkspace({ entityType: "room", entityId: room.id,
    returnContext: { page: "pension", view: "rooms", entityId: room.id }, ...intent });
  async function quickAction() {
    if (running.current || !model.action || model.action.disabledReason) return;
    if ("intent" in model.action) { open(model.action.intent); return; }
    running.current = true; setBusy(true); setFeedback("");
    const current = begin();
    try {
      const result = await setRoomOperationalStatus(room.id, "available");
      if (!current()) return;
      if (result.ok) onDashboard(result.dashboardData);
      else setFeedback(result.message);
    } catch { if (current()) setFeedback("Temizlik sonucu doğrulanamadı. Yenileyip kontrol edin."); }
    finally { running.current = false; if (current()) setBusy(false); }
  }
  return <ResourceCard title={roomIdentity(room)} subtitle={[room.capacity > 0 ? `${room.capacity} kişi` : "", room.floor].filter(Boolean).join(" · ")}
    icon={<BedDouble size={22} />} tone={tone} busy={busy} error={Boolean(feedback)} feedback={feedback || model.action?.disabledReason}
    onOpen={() => open()} openLabel={`${room.name} odasını aç`}
    status={<><span>{model.physical === "cleaning" ? <Sparkles size={16} /> : model.physical !== "ready" ? <Wrench size={16} /> : <CircleCheck size={16} />}{physicalLabels[model.physical]}</span>
      {model.current.length > 0 && <span><UserRound size={16} />Misafir içeride</span>}</>}
    action={model.action && <ActionButton disabled={busy || Boolean(model.action.disabledReason)} onClick={() => void quickAction()}>{model.action.label}</ActionButton>}>
    {!summary ? <p className="resource-card__notice"><CircleAlert size={16} />Güncel özet alınamadı.</p> : <>
      {model.current.map(stay => <div className="resource-card__fact" key={stay.id}><span>Mevcut misafir</span><strong>{stay.customerName}</strong><small>{formatDateRange(stay.checkInDate, stay.checkOutDate)}</small></div>)}
      {model.planned[0] && <div className="resource-card__fact"><span><CalendarDays size={15} />Planlı giriş</span><strong>{model.planned[0].customerName}</strong><small>{formatDateRange(model.planned[0].checkInDate, model.planned[0].checkOutDate)}</small></div>}
      {model.upcoming && <div className="resource-card__fact"><span><CalendarDays size={15} />Yaklaşan rezervasyon{model.upcoming.status === "pending" && " · Onay bekliyor"}</span><strong>{model.upcoming.customerName || model.upcoming.title}</strong><small>{formatDateRange(model.upcoming.startDate, model.upcoming.endDate)}</small></div>}
      {model.currentAccount && <div className="resource-card__balance"><span><Wallet size={16} />Mevcut hesap</span><strong>{model.currentAccount.remainingMinor > 0 ? minorMoney(model.currentAccount.remainingMinor, model.currentAccount.currency) : "Ödendi"}</strong></div>}
      {model.previousAccounts.map(account => <div className="resource-card__balance resource-card__balance--previous" key={account.folioId}><span>Önceki misafir · {account.customerName}</span><strong>{minorMoney(account.remainingMinor, account.currency)}</strong></div>)}
      {!model.current.length && !model.planned.length && !model.upcoming && model.physical === "ready" && <p className="resource-card__notice">{room.status === "occupied" ? "Oda dolu" : room.status === "reserved" ? "Oda ayrılmış" : "Konaklamaya hazır"}</p>}
    </>}
  </ResourceCard>;
}
