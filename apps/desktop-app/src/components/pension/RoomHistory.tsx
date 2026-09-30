import { formatCustomerRoomStayStatus, formatStayDateRange } from "../../app/customer-model";
import { ActionButton } from "../ui/ActionButton";
import { minorMoney, formatDateRange, formatDateTime, paymentMethodLabel } from "./folio-format";
import type { RoomWorkspaceModel } from "./room-workspace-model";
import type { RoomStayOperations } from "./use-room-stay-operations";
import type { RoomFolioController } from "./use-room-folio-controller";

export function RoomHistory({ model, operations, account, disabled }: {
  model: RoomWorkspaceModel; operations: RoomStayOperations; account: RoomFolioController; disabled: boolean;
}) {
  return <section className="operation-history form-stack" aria-label="Oda geçmişi">
    <h3>Yakın dönem kayıtları</h3><p>Yakın dönem konaklamalar ve mevcut hesaplar gösterilir; tam geçmiş değildir.</p>
    {model.stays.map(stay => <article className="operation-section" key={stay.id}><strong>{stay.customerName}</strong>
      <p>{formatCustomerRoomStayStatus(stay.status)} · {formatStayDateRange(stay)}</p>
      {(stay.guests ?? []).map(guest => <p key={guest.id}>{guest.customerName} · {guest.checkedInAt ? formatDateTime(guest.checkedInAt) : "Giriş yok"} → {guest.checkedOutAt ? formatDateTime(guest.checkedOutAt) : "Çıkış yok"}</p>)}
      {stay.pendingNotificationCount > 0 && <p>Kimlik bildirimi bekleyen: {stay.pendingNotificationCount} · Otomatik gönderim bağlı değil.</p>}
      {stay.status === "cancelled" && model.canCreate && <ActionButton variant="secondary" disabled={disabled}
        onClick={() => void operations.mutate("operations", () => window.yardimciDesktop!.updateCustomerRoomStayStatus({ stayId: stay.id, status: "planned" }))}>Yeniden Planla</ActionButton>}
    </article>)}
    {account.folios.map(folio => <details className="operation-section" key={folio.id}>
      <summary>{folio.customerName} · {folio.status === "open" ? "Açık hesap" : "Kapalı hesap"} · {formatDateRange(folio.checkInDate, folio.plannedCheckOutDate)} · {minorMoney(folio.remainingMinor)} kalan</summary>
      <dl className="operation-facts"><div><dt>Konaklama</dt><dd>{minorMoney(folio.lodgingTotalMinor)}</dd></div>
        <div><dt>Toplam</dt><dd>{minorMoney(folio.chargeTotalMinor)}</dd></div><div><dt>Ödenen</dt><dd>{minorMoney(folio.paidTotalMinor)}</dd></div></dl>
      {folio.items.map(item => <p key={item.id}>{item.label} · {minorMoney(item.lineTotalMinor)}</p>)}
      {folio.payments.map(payment => <p key={payment.id}>{paymentMethodLabel(payment.paymentMethod)} · {formatDateTime(payment.paidAt)} · {minorMoney(payment.amountMinor)}</p>)}
    </details>)}
  </section>;
}
