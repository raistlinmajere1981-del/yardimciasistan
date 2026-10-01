import { useMemo, useState } from "react";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData } from "../../../electron/database";
import { formatCustomerRoomStayStatus, formatStayDateRange } from "../../app/customer-model";
import { formatRequestStatus, formatRequestType, formatReservationDate, formatReservationStatus } from "../../app/record-formatters";
import { HistoryList, HistoryRecord } from "../history/HistoryRecord";
import { ActionButton } from "../ui/ActionButton";
import { ChoiceChips } from "../ui/ChoiceChips";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";

type Filter = "all" | "requests" | "reservations" | "stays";

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stayTone(status: string): StatusTone {
  if (status === "checked_in") return "success";
  if (status === "planned") return "info";
  if (status === "cancelled") return "danger";
  return "neutral";
}

function reservationTone(status: string): StatusTone {
  if (status === "approved") return "success";
  if (status === "pending") return "warning";
  if (status === "rejected" || status === "cancelled") return "danger";
  return "neutral";
}

function requestTone(status: string): StatusTone {
  if (["approved", "answered", "converted_to_reservation"].includes(status)) return "success";
  if (["rejected", "cancelled"].includes(status)) return "danger";
  if (["new", "waiting_owner", "waiting_customer"].includes(status)) return "warning";
  return "neutral";
}

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
  const [filter, setFilter] = useState<Filter>("all");
  const records = useMemo(() => [
    ...requests.map(request => ({
      id: `request:${request.id}`,
      type: "requests" as const,
      sort: timestamp(request.updated_at || request.created_at || request.start_date),
      node: <HistoryRecord
        key={`request:${request.id}`}
        kind="Talep"
        title={formatRequestType(request.request_type)}
        status={<StatusBadge tone={requestTone(request.status)}>{formatRequestStatus(request.status)}</StatusBadge>}
        meta={<span>{request.date_text || request.start_date || request.created_at || "-"}</span>}
        description={request.message || request.ai_summary || undefined}
      />
    })),
    ...(reservationsEnabled ? reservations.map(reservation => ({
      id: `reservation:${reservation.id}`,
      type: "reservations" as const,
      sort: timestamp(reservation.updatedAt || reservation.startDate),
      node: <HistoryRecord
        key={`reservation:${reservation.id}`}
        kind="Rezervasyon"
        title={reservation.title}
        status={<StatusBadge tone={reservationTone(reservation.status)}>{formatReservationStatus(reservation.status)}</StatusBadge>}
        meta={<>
          <span>{formatReservationDate(reservation)}</span>
          {reservation.guestCount > 0 && <span>{reservation.guestCount} kişi</span>}
        </>}
        description={reservation.notes || undefined}
      />
    })) : []),
    ...(staysEnabled ? stays.map(stay => {
      const active = ["planned", "checked_in"].includes(stay.status);
      return {
        id: `stay:${stay.id}`,
        type: "stays" as const,
        sort: timestamp(stay.updatedAt || stay.checkedOutAt || stay.checkedInAt || stay.checkInDate),
        node: <HistoryRecord
          key={`stay:${stay.id}`}
          kind="Konaklama"
          title={stay.roomNumber ? `Oda ${stay.roomNumber}` : stay.roomName}
          status={<StatusBadge tone={stayTone(stay.status)}>{formatCustomerRoomStayStatus(stay.status)}</StatusBadge>}
          meta={<>
            <span>{formatStayDateRange(stay)}</span>
            <span>{stay.guestCount} kişi</span>
          </>}
          description={stay.notes || undefined}
          actions={active ? <ActionButton variant="secondary" size="sm" onClick={() => onOpenStay(stay)}>Konaklamayı Aç</ActionButton> : undefined}
        />
      };
    }) : [])
  ].sort((a, b) => b.sort - a.sort), [onOpenStay, requests, reservations, reservationsEnabled, stays, staysEnabled]);

  const visible = filter === "all" ? records : records.filter(record => record.type === filter);
  const options = [
    { id: "all" as const, label: `Tümü (${records.length})` },
    { id: "requests" as const, label: `Talepler (${requests.length})` },
    ...(reservationsEnabled ? [{ id: "reservations" as const, label: `Rezervasyonlar (${reservations.length})` }] : []),
    ...(staysEnabled ? [{ id: "stays" as const, label: `Konaklamalar (${stays.length})` }] : [])
  ];

  return <section className="customer-history-view history-surface" aria-label="Müşteri geçmişi">
    <div className="history-toolbar">
      <ChoiceChips ariaLabel="Müşteri geçmişi filtresi" value={filter} onChange={setFilter} options={options} />
      <span className="history-toolbar__summary">{visible.length} kayıt</span>
    </div>
    <HistoryList empty="Bu filtrede geçmiş kaydı yok.">
      {visible.map(record => record.node)}
    </HistoryList>
  </section>;
}
