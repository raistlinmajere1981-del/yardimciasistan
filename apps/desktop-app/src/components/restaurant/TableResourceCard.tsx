import { CalendarDays, CircleAlert, Clock3, ReceiptText, UtensilsCrossed } from "lucide-react";
import { useRef, useState } from "react";
import type { DesktopDashboardData, DesktopStatusUpdateResult } from "../../../electron/database";
import type { DesktopTable, DesktopTableOperations } from "../../../electron/database-types";
import { ResourceCard } from "../operations/ResourceCard";
import { ActionButton } from "../ui/ActionButton";
import { ChoiceChips } from "../ui/ChoiceChips";
import { useConfirmDialog } from "../ui/useConfirmDialog";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { useRequestGeneration } from "../workspace/use-request-generation";
import { getTableCardModel } from "./table-card-model";
import { closeTableOrder, startTableOrder, setTableOrderStatus } from "./table-order-operations";
import { formatMoney, formatTableStatus, getTableStatusAction } from "./table-presentation";

export function TableResourceCard({ table, summary, capabilities, onDashboard, onUpdateTableStatus, imageSrc }: {
  table: DesktopTable; summary?: DesktopTableOperations;
  capabilities: { ordersEnabled: boolean; reservationsEnabled: boolean; menuEnabled: boolean };
  onDashboard: (data: DesktopDashboardData) => void;
  onUpdateTableStatus: (id: string, status: string) => Promise<DesktopStatusUpdateResult>;
  imageSrc?: string;
}) {
  const navigation = useWorkspaceNavigation();
  const { order, upcoming, blocked, conflict, quickAction } = getTableCardModel(table, summary, capabilities, new Date().toLocaleDateString("sv-SE"));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const running = useRef(false);
  const begin = useRequestGeneration();
  const { confirm, confirmDialog } = useConfirmDialog();
  const tableStatus = getTableStatusAction(table.status) || table.status;
  const open = () => navigation.openWorkspace({
    entityType: "table",
    entityId: table.id,
    returnContext: { page: "restaurant", view: "floor", entityId: table.id }
  });

  async function runQuickAction() {
    if (running.current || !quickAction) return;
    const action = quickAction;
    const approved = await confirm({
      eyebrow: table.name,
      title: action.label,
      description: action.kind === "paid"
        ? "Tahsilatın alındığını onayladığınızda adisyon kapatılacak."
        : "Bu masa için yeni ve boş bir adisyon açılacak.",
      confirmLabel: action.label,
      tone: action.kind === "paid" ? "warning" : "info",
      details: <dl className="operation-facts">
        <div><dt>Masa</dt><dd>{table.name} · {table.area || "Genel"}</dd></div>
        {order && <div><dt>Adisyon</dt><dd>{order.itemCount} ürün · {formatMoney(order.total, order.currency)}</dd></div>}
        {upcoming && !order && <div><dt>Yaklaşan rezervasyon</dt><dd>{upcoming.customerName || upcoming.title} · {upcoming.time}</dd></div>}
        <div><dt>Yeni durum</dt><dd>{action.kind === "paid" ? "Ödendi / kapalı" : "Açık adisyon"}</dd></div>
      </dl>
    });
    if (!approved) return;

    running.current = true;
    setBusy(true);
    setFeedback("");
    const current = begin();
    try {
      const result = action.kind === "start"
        ? await startTableOrder(table.id)
        : await closeTableOrder(order!.id, "paid");
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

  async function updatePhysicalStatus(status: string) {
    if (running.current || !summary || !table.isActive || order || status === tableStatus) return;
    running.current = true;
    setBusy(true);
    setFeedback("");
    const current = begin();
    try {
      const result = await onUpdateTableStatus(table.id, status);
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

  async function updateOrderStatus(status: "preparing" | "served" | "payment") {
    if (running.current || !order || order.status === status) return;
    running.current = true;
    setBusy(true);
    setFeedback("");
    const current = begin();
    try {
      const result = await setTableOrderStatus(order.id, status);
      if (!current()) return;
      if (result.ok && "dashboardData" in result && result.dashboardData) onDashboard(result.dashboardData);
      else if (!result.ok) setFeedback(result.message);
    } catch {
      if (current()) setFeedback("İşlem sonucu doğrulanamadı. Yenileyip kontrol edin.");
    } finally {
      running.current = false;
      if (current()) setBusy(false);
    }
  }

  const tone = !summary ? "neutral" : blocked ? "warning" : order?.status === "payment" || conflict ? "warning" : order ? "info" : upcoming ? "warning" : "success";

  return <>
    <ResourceCard
      imageSrc={imageSrc || "./assets/default-table.png"}
      title={table.name}
      subtitle={[table.area, table.capacity > 0 ? `${table.capacity} kişi` : ""].filter(Boolean).join(" · ")}
      icon={<UtensilsCrossed size={22} />}
      tone={tone}
      busy={busy}
      error={Boolean(feedback)}
      feedback={feedback}
      status={!summary ? <span>Durum doğrulanamadı</span> : !table.isActive ? <span>Etkin değil</span> : order
        ? <ChoiceChips
            ariaLabel={`${table.name} sipariş durumu`}
            value={order.status}
            disabled={busy}
            onChange={value => { if (value !== "open") void updateOrderStatus(value as "preparing" | "served" | "payment"); }}
            options={[
              { id: "open", label: "Açık", disabled: order.status !== "open" },
              { id: "preparing", label: "Hazırlanıyor" },
              { id: "served", label: "Servis edildi" },
              { id: "payment", label: "Hesap bekliyor" }
            ]}
          />
        : <ChoiceChips
            ariaLabel={`${table.name} durumunu değiştir`}
            value={tableStatus}
            disabled={busy}
            onChange={value => void updatePhysicalStatus(value)}
            options={[
              ...(!["available", "occupied", "reserved", "bill_waiting", "cleaning"].includes(tableStatus)
                ? [{ id: tableStatus, label: formatTableStatus(table.status), disabled: true }]
                : []),
              { id: "available", label: "Boş" },
              { id: "occupied", label: "Dolu" },
              ...(capabilities.reservationsEnabled ? [{ id: "reserved", label: "Rezerve" }] : []),
              ...(capabilities.ordersEnabled ? [{ id: "bill_waiting", label: "Hesap" }] : []),
              { id: "cleaning", label: "Temizlik" }
            ]}
          />}
      onOpen={open}
      openLabel={`${table.name} masasını aç`}
      action={<><ActionButton variant="secondary" disabled={busy} onClick={open}>Detay Gör</ActionButton>
        {quickAction && <ActionButton busy={busy} busyLabel="İşleniyor…" onClick={() => void runQuickAction()}>{quickAction.label}</ActionButton>}</>}
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
