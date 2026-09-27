import { CalendarDays, CircleAlert, CircleCheck, Clock3, CookingPot, ReceiptText, UtensilsCrossed, Wallet, Wrench } from "lucide-react";
import { useRef, useState } from "react";
import type { DesktopDashboardData, DesktopStatusUpdateResult } from "../../../electron/database";
import type { DesktopTable, DesktopTableOperations } from "../../../electron/database-types";
import { ResourceCard } from "../operations/ResourceCard";
import { ActionButton } from "../ui/ActionButton";
import { useConfirmDialog } from "../ui/useConfirmDialog";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { useRequestGeneration } from "../workspace/use-request-generation";
import { getTableCardModel } from "./table-card-model";
import { closeTableOrder, startTableOrder, setTableOrderStatus } from "./table-order-operations";
import { formatMoney, formatTableStatus, getOrderBadge, getOrderCurrency } from "./table-presentation";

export function TableResourceCard({ table, summary, capabilities, onDashboard, onUpdateTableStatus }: {
  table: DesktopTable; summary?: DesktopTableOperations;
  capabilities: { ordersEnabled: boolean; reservationsEnabled: boolean; menuEnabled: boolean };
  onDashboard: (data: DesktopDashboardData) => void;
  onUpdateTableStatus: (id: string, status: string) => Promise<DesktopStatusUpdateResult>;
}) {
  const navigation = useWorkspaceNavigation();
  const { order, upcoming, blocked, conflict, quickAction } = getTableCardModel(table, summary, capabilities, new Date().toLocaleDateString("sv-SE"));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const running = useRef(false);
  const begin = useRequestGeneration();
  const { confirm, confirmDialog } = useConfirmDialog();
  const open = () => navigation.openWorkspace({
    entityType: "table",
    entityId: table.id,
    returnContext: { page: "restaurant", view: "floor", entityId: table.id }
  });

  async function runQuickAction() {
    if (running.current || !quickAction) return;
    const action = quickAction;
    const nextLabel: Record<typeof action.kind, string> = {
      clean: "Boş / servise hazır",
      start: "Açık adisyon",
      preparing: "Hazırlanıyor",
      served: "Servis edildi",
      payment: "Hesap bekliyor",
      paid: "Ödendi / kapalı"
    };
    const approved = await confirm({
      eyebrow: table.name,
      title: action.label,
      description: action.kind === "paid"
        ? "Tahsilatın alındığını onayladığınızda adisyon kapatılacak."
        : action.kind === "start"
          ? "Bu masa için yeni ve boş bir adisyon açılacak."
          : action.kind === "clean"
            ? "Masa tekrar servise hazır olarak işaretlenecek."
            : "Adisyonun servis durumu güncellenecek.",
      confirmLabel: action.label,
      tone: action.kind === "paid" ? "warning" : "info",
      details: <dl className="operation-facts">
        <div><dt>Masa</dt><dd>{table.name} · {table.area || "Genel"}</dd></div>
        {order && <div><dt>Adisyon</dt><dd>{order.itemCount} ürün · {formatMoney(order.total, getOrderCurrency(order))}</dd></div>}
        {upcoming && !order && <div><dt>Yaklaşan rezervasyon</dt><dd>{upcoming.customerName || upcoming.title} · {upcoming.time}</dd></div>}
        <div><dt>Yeni durum</dt><dd>{nextLabel[action.kind]}</dd></div>
      </dl>
    });
    if (!approved) return;

    running.current = true;
    setBusy(true);
    setFeedback("");
    const current = begin();
    try {
      const result = action.kind === "clean"
        ? await onUpdateTableStatus(table.id, "available")
        : action.kind === "start"
          ? await startTableOrder(table.id)
          : action.kind === "paid"
            ? await closeTableOrder(order!.id, "paid")
            : await setTableOrderStatus(order!.id, action.kind);
      if (!current()) return;
      if (!result.ok) {
        setFeedback(result.message);
        return;
      }
      if ("dashboardData" in result && result.dashboardData) onDashboard(result.dashboardData);
    } catch {
      if (current()) setFeedback("İşlem sonucu doğrulanamadı. Yenileyip kontrol edin.");
    } finally {
      running.current = false;
      if (current()) setBusy(false);
    }
  }

  const tone = !summary ? "neutral" : blocked ? "warning" : order?.status === "payment" || conflict ? "warning" : order ? "info" : upcoming ? "warning" : "success";
  const StateIcon = blocked ? Wrench : order?.status === "payment" ? Wallet : order?.status === "preparing" ? CookingPot : order ? ReceiptText : CircleCheck;

  return <>
    <ResourceCard
      title={table.name}
      subtitle={[table.area, table.capacity > 0 ? `${table.capacity} kişi` : ""].filter(Boolean).join(" · ")}
      icon={<UtensilsCrossed size={22} />}
      tone={tone}
      busy={busy}
      error={Boolean(feedback)}
      feedback={feedback}
      status={<span><StateIcon size={16} />{!summary ? "Durum doğrulanamadı" : !table.isActive ? "Etkin değil" : blocked ? formatTableStatus(table.status) : order ? getOrderBadge(order.status).label : formatTableStatus(table.status)}</span>}
      onOpen={open}
      openLabel={`${table.name} masasını aç`}
      action={quickAction && <ActionButton disabled={busy} onClick={() => void runQuickAction()}>{quickAction.label}</ActionButton>}
    >
      {!summary ? <p className="resource-card__notice"><CircleAlert size={16} />Güncel adisyon bilgisi alınamadı.</p> : <>
        {order && <><div className="resource-card__fact"><span><ReceiptText size={16} />{order.itemCount > 0 ? `${order.itemCount} ürün` : "Sipariş alınıyor"}</span>
          <small><Clock3 size={14} />Açılış {new Date(order.openedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</small></div>
          {order.total > 0 && <div className="resource-card__balance"><span>Adisyon toplamı</span><strong>{formatMoney(order.total, order.currency)}</strong></div>}</>}
        {upcoming && <div className="resource-card__fact"><span><CalendarDays size={15} />Rezervasyon{upcoming.status === "pending" && " · Onay bekliyor"}</span><strong>{upcoming.customerName || upcoming.title}</strong><small>{new Date(`${upcoming.startDate}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} · {upcoming.time} · {upcoming.guestCount} kişi</small></div>}
        {conflict && <p className="resource-card__notice"><CircleAlert size={16} />Masa atamalarını kontrol edin.</p>}
        {!order && !upcoming && !blocked && table.status === "available" && <p className="resource-card__notice">Servise hazır</p>}
      </>}
    </ResourceCard>
    {confirmDialog}
  </>;
}
