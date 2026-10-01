import { useMemo, useState } from "react";
import { formatCustomerRoomStayStatus, formatStayDateRange } from "../../app/customer-model";
import { HistoryList, HistoryRecord } from "../history/HistoryRecord";
import { ActionButton } from "../ui/ActionButton";
import { ChoiceChips } from "../ui/ChoiceChips";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";
import { minorMoney, formatDateRange, formatDateTime, paymentMethodLabel } from "./folio-format";
import type { RoomWorkspaceModel } from "./room-workspace-model";
import type { RoomStayOperations } from "./use-room-stay-operations";
import type { RoomFolioController } from "./use-room-folio-controller";

type Filter = "all" | "stays" | "open";

function stamp(...values: string[]) {
  for (const value of values) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function stayTone(status: string): StatusTone {
  if (status === "checked_in") return "success";
  if (status === "planned") return "info";
  if (status === "cancelled") return "danger";
  return "neutral";
}

export function RoomHistory({ model, operations, account, disabled }: {
  model: RoomWorkspaceModel; operations: RoomStayOperations; account: RoomFolioController; disabled: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const foliosByStay = useMemo(() => new Map(account.folios.map(folio => [folio.stayId, folio])), [account.folios]);
  const stayIds = useMemo(() => new Set(model.stays.map(stay => stay.id)), [model.stays]);

  const records = useMemo(() => {
    const stayRecords = model.stays.map(stay => {
      const folio = foliosByStay.get(stay.id);
      const openDebt = Boolean(folio && folio.status === "open" && folio.remainingMinor > 0);
      return {
        id: `stay:${stay.id}`,
        kind: "stay" as const,
        openDebt,
        sort: stamp(stay.updatedAt, stay.checkedOutAt, stay.checkedInAt, stay.checkInDate),
        node: <HistoryRecord
          key={`stay:${stay.id}`}
          kind="Konaklama"
          title={stay.customerName}
          status={<StatusBadge tone={stayTone(stay.status)}>{formatCustomerRoomStayStatus(stay.status)}</StatusBadge>}
          meta={<>
            <span>{formatStayDateRange(stay)}</span>
            <span>{stay.guestCount} misafir</span>
            {folio && <span>{folio.status === "open" ? "Hesap açık" : "Hesap kapalı"}</span>}
          </>}
          trailing={folio ? minorMoney(folio.remainingMinor, folio.currency) + " kalan" : undefined}
          actions={stay.status === "cancelled" && model.canCreate ? <ActionButton variant="secondary" size="sm" disabled={disabled}
            onClick={() => void operations.mutate("operations", () => window.yardimciDesktop!.updateCustomerRoomStayStatus({ stayId: stay.id, status: "planned" }))}>
            Yeniden Planla
          </ActionButton> : undefined}
        >
          {(stay.guests?.length > 0 || folio) && <details className="history-record__details">
            <summary>Ayrıntılar</summary>
            <div className="history-record__detail-list">
              {(stay.guests ?? []).map(guest => <span key={guest.id}>
                {guest.customerName} · {guest.checkedInAt ? formatDateTime(guest.checkedInAt) : "Giriş yok"} → {guest.checkedOutAt ? formatDateTime(guest.checkedOutAt) : "Çıkış yok"}
              </span>)}
              {folio && <div className="history-record__facts">
                <span>Konaklama <strong>{minorMoney(folio.lodgingTotalMinor, folio.currency)}</strong></span>
                <span>Toplam <strong>{minorMoney(folio.chargeTotalMinor, folio.currency)}</strong></span>
                <span>Ödenen <strong>{minorMoney(folio.paidTotalMinor, folio.currency)}</strong></span>
                <span>Kalan <strong>{minorMoney(folio.remainingMinor, folio.currency)}</strong></span>
              </div>}
              {folio?.items.map(item => <span key={item.id}>{item.label} · {minorMoney(item.lineTotalMinor, folio.currency)}</span>)}
              {folio?.payments.map(payment => <span key={payment.id}>
                {paymentMethodLabel(payment.paymentMethod)} · {formatDateTime(payment.paidAt)} · {minorMoney(payment.amountMinor, folio.currency)}
              </span>)}
            </div>
          </details>}
        </HistoryRecord>
      };
    });

    const orphanFolios = account.folios.filter(folio => !stayIds.has(folio.stayId)).map(folio => ({
      id: `folio:${folio.id}`,
      kind: "folio" as const,
      openDebt: folio.status === "open" && folio.remainingMinor > 0,
      sort: stamp(folio.closedAt, folio.openedAt, folio.plannedCheckOutDate),
      node: <HistoryRecord
        key={`folio:${folio.id}`}
        kind="Hesap"
        title={folio.customerName}
        status={<StatusBadge tone={folio.status === "open" ? "warning" : "neutral"}>{folio.status === "open" ? "Açık hesap" : "Kapalı hesap"}</StatusBadge>}
        meta={<span>{formatDateRange(folio.checkInDate, folio.plannedCheckOutDate)}</span>}
        trailing={minorMoney(folio.remainingMinor, folio.currency) + " kalan"}
      >
        <details className="history-record__details">
          <summary>Hesap ayrıntıları</summary>
          <div className="history-record__detail-list">
            <div className="history-record__facts">
              <span>Konaklama <strong>{minorMoney(folio.lodgingTotalMinor, folio.currency)}</strong></span>
              <span>Toplam <strong>{minorMoney(folio.chargeTotalMinor, folio.currency)}</strong></span>
              <span>Ödenen <strong>{minorMoney(folio.paidTotalMinor, folio.currency)}</strong></span>
            </div>
          </div>
        </details>
      </HistoryRecord>
    }));

    return [...stayRecords, ...orphanFolios].sort((a, b) => b.sort - a.sort);
  }, [account.folios, disabled, foliosByStay, model.canCreate, model.stays, operations, stayIds]);

  const visible = filter === "all" ? records
    : filter === "open" ? records.filter(record => record.openDebt)
      : records.filter(record => record.kind === "stay");

  return <section className="operation-history history-surface" aria-label="Oda geçmişi">
    <div className="history-toolbar">
      <ChoiceChips ariaLabel="Oda geçmişi filtresi" value={filter} onChange={setFilter} options={[
        { id: "all", label: `Tümü (${records.length})` },
        { id: "stays", label: `Konaklamalar (${model.stays.length})` },
        { id: "open", label: `Açık hesaplar (${records.filter(record => record.openDebt).length})` }
      ]} />
      <span className="history-toolbar__summary">{visible.length} kayıt</span>
    </div>
    <HistoryList empty="Bu filtrede oda geçmişi yok.">
      {visible.map(record => record.node)}
    </HistoryList>
  </section>;
}
