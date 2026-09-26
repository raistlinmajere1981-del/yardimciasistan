import { useMemo, useState } from "react";
import { CalendarCheck, CheckCircle2, MessageCircle, Plus } from "lucide-react";
import { getReservationDomain } from "@yardimci-asistan/shared";
import type {
  DesktopCustomerMutationResult,
  DesktopDashboardData,
  DesktopStatusUpdateResult,
  SaveCustomerInput,
  SaveManualRestaurantReservationInput
} from "../../../electron/database";
import { formatDateForDisplay, formatReservationStatus } from "../../app/record-formatters";
import { ManualRestaurantReservationEditor } from "./ManualRestaurantReservationEditor";
import { ActionButton } from "../ui/ActionButton";
import { DataList, DataListItem } from "../ui/DataList";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";

interface RestaurantReservationsWorkspaceProps {
  reservations: DesktopDashboardData["reservations"];
  accommodationReservationsEnabled: boolean;
  customers: DesktopDashboardData["customers"];
  tables: DesktopDashboardData["tables"];
  whatsappEnabled: boolean;
  customersEnabled?: boolean;
  onSave: (input: SaveManualRestaurantReservationInput) => Promise<DesktopStatusUpdateResult>;
  onSaveCustomer: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  onUpdateStatus: (reservationId: string, status: string) => void;
  onOpenWhatsApp: (reservation: DesktopDashboardData["reservations"][number]) => void;
}

function reservationTone(status: string): StatusTone {
  if (["cancelled", "rejected"].includes(status)) return "danger";
  if (status === "pending") return "warning";
  if (["approved", "completed"].includes(status)) return "success";
  return "info";
}

function formatRestaurantReservationWhen(reservation: DesktopDashboardData["reservations"][number]) {
  return [formatDateForDisplay(reservation.startDate), reservation.time].filter(Boolean).join(" · ") || "Tarih yok";
}

function formatRestaurantReservationTable(
  reservation: DesktopDashboardData["reservations"][number],
  tables: DesktopDashboardData["tables"]
) {
  const tableNames = reservation.tableIds
    .map((id) => tables.find((table) => table.id === id)?.name)
    .filter(Boolean);
  return tableNames.length > 0 ? tableNames.join(", ") : "Masa daha sonra atanacak";
}

export function RestaurantReservationsWorkspace({
  reservations,
  accommodationReservationsEnabled,
  customers,
  tables,
  whatsappEnabled,
  customersEnabled = true,
  onSave,
  onSaveCustomer,
  onUpdateStatus,
  onOpenWhatsApp
}: RestaurantReservationsWorkspaceProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const restaurantReservations = useMemo(
    () => reservations
      .filter((reservation) => {
        const domain = getReservationDomain(reservation.reservationType, {
          roomIds: reservation.roomIds,
          tableIds: reservation.tableIds
        });
        return domain === "food_service"
          || domain === "mixed"
          || (domain === "generic" && !accommodationReservationsEnabled);
      })
      .sort((left, right) => `${left.startDate} ${left.time}`.localeCompare(`${right.startDate} ${right.time}`)),
    [accommodationReservationsEnabled, reservations]
  );
  const activeReservations = restaurantReservations.filter((reservation) => !["cancelled", "rejected", "completed"].includes(reservation.status));
  const visibleReservations = showAll ? restaurantReservations : activeReservations;

  return (
    <div className="restaurant-reservations-workspace">
      <div className="reservation-toolbar page-toolbar">
        <div className="restaurant-reservation-summary" aria-label="Restoran rezervasyon özeti">
          <StatusBadge tone="info">{activeReservations.length} aktif rezervasyon</StatusBadge>
          <StatusBadge tone="warning">{activeReservations.filter((reservation) => reservation.status === "pending").length} onay bekleyen</StatusBadge>
          {customersEnabled && <ActionButton size="sm" type="button" onClick={() => setEditorOpen(true)}>
            <Plus size={15} aria-hidden="true" />
            Yeni Rezervasyon
          </ActionButton>}
        </div>
        <ActionButton variant="ghost" size="sm" type="button" onClick={() => setShowAll((current) => !current)}>
          {showAll ? "Aktifleri Göster" : "Geçmişi Göster"}
        </ActionButton>
      </div>

      <DataList className="restaurant-reservation-list" aria-label="Restoran rezervasyon listesi">
        {visibleReservations.length === 0 ? (
          <div className="panel empty-state empty-state--compact">
            <CalendarCheck size={24} aria-hidden="true" />
            <strong>Restoran rezervasyonu yok.</strong>
            <p>Telefonla veya yüz yüze gelen rezervasyonu Yeni Rezervasyon ile ekleyebilirsiniz.</p>
          </div>
        ) : (
          visibleReservations.map((reservation) => (
            <DataListItem
              className="restaurant-reservation-record"
              key={reservation.id}
              leading={<StatusBadge tone={reservationTone(reservation.status)}>{formatReservationStatus(reservation.status)}</StatusBadge>}
              title={reservation.title || reservation.customerName || "Misafir"}
              meta={(
                <>
                  <span>{formatRestaurantReservationWhen(reservation)}</span>
                  <span>{reservation.guestCount} kişi</span>
                  <span>{formatRestaurantReservationTable(reservation, tables)}</span>
                </>
              )}
              description={reservation.notes || "Rezervasyon notu yok."}
              actions={(
                <>
                  {reservation.status === "pending" && (
                    <ActionButton size="sm" type="button" onClick={() => onUpdateStatus(reservation.id, "approved")}>
                      <CheckCircle2 size={15} aria-hidden="true" />
                      Onayla
                    </ActionButton>
                  )}
                  {whatsappEnabled && (
                    <ActionButton
                      variant="whatsapp"
                      size="sm"
                      type="button"
                      onClick={() => onOpenWhatsApp(reservation)}
                      disabled={!reservation.customerPhone}
                    >
                      <MessageCircle size={15} aria-hidden="true" />
                      WhatsApp'a Hazırla
                    </ActionButton>
                  )}
                  {["pending", "approved"].includes(reservation.status) && (
                    <ActionButton variant="secondary" size="sm" type="button" onClick={() => onUpdateStatus(reservation.id, "cancelled")}>
                      İptal Et
                    </ActionButton>
                  )}
                </>
              )}
            />
          ))
        )}
      </DataList>

      <ManualRestaurantReservationEditor
        open={editorOpen}
        customers={customers}
        tables={tables}
        onClose={() => setEditorOpen(false)}
        onSave={onSave}
        onSaveCustomer={onSaveCustomer}
      />
    </div>
  );
}
