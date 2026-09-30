import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData } from "../../../electron/database";
import { formatCustomerRoomStayStatus, formatStayDateRange } from "../../app/customer-model";
import { formatRequestStatus, formatRequestType, formatReservationDate, formatReservationStatus } from "../../app/record-formatters";
import { ActionButton } from "../ui/ActionButton";

export function CustomerHistoryView({
  requests,
  reservations,
  stays,
  reservationsEnabled,
  staysEnabled,
  onOpenStay
}: {
  requests: SyncedCustomerRequest[];
  reservations: DesktopDashboardData["reservations"];
  stays: DesktopDashboardData["customerRoomStays"];
  reservationsEnabled: boolean;
  staysEnabled: boolean;
  onOpenStay: (stay: DesktopDashboardData["customerRoomStays"][number]) => void;
}) {
  return <section className="customer-history-view" aria-label="Müşteri geçmişi">
    <div className="customer-history-grid">
      <section className="panel">
        <h3>Talep geçmişi</h3>
        {requests.length === 0 ? <p>Talep yok.</p> : requests.map((request) => <article key={request.id}>
          <strong>{formatRequestType(request.request_type)}</strong>
          <span>{formatRequestStatus(request.status)} · {request.date_text || request.start_date || "-"}</span>
          {request.message && <p>{request.message}</p>}
        </article>)}
      </section>

      {reservationsEnabled && <section className="panel">
        <h3>Rezervasyon geçmişi</h3>
        {reservations.length === 0 ? <p>Rezervasyon yok.</p> : reservations.map((reservation) => <article key={reservation.id}>
          <strong>{reservation.title}</strong>
          <span>{formatReservationStatus(reservation.status)} · {formatReservationDate(reservation)}</span>
        </article>)}
      </section>}

      {staysEnabled && <section className="panel customer-stay-history">
        <h3>Oda / konaklama geçmişi</h3>
        {stays.length === 0 ? <p>Oda kaydı yok.</p> : stays.map((stay) => <article key={stay.id}>
          <strong>{stay.roomNumber ? "Oda " + stay.roomNumber : stay.roomName}</strong>
          <span>{formatCustomerRoomStayStatus(stay.status)} · {formatStayDateRange(stay)}</span>
          {stay.notes && <p>{stay.notes}</p>}
          <ActionButton variant="secondary" size="sm" onClick={() => onOpenStay(stay)}>Odayı Aç</ActionButton>
        </article>)}
      </section>}
    </div>
  </section>;
}
