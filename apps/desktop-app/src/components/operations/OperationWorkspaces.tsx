import { useMemo, useState } from "react";
import {
  BedDouble,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
  Users
} from "lucide-react";
import type {
  AssignCustomerRoomInput,
  DesktopCustomerMutationResult,
  DesktopDashboardData,
  DesktopStatusUpdateResult,
  SaveCustomerInput,
  SaveDailyTaskInput,
  SaveManualReservationInput
} from "../../../electron/database";
import {
  formatCustomerRoomStayStatus,
  formatStayDateRange
} from "../../app/customer-model";
import {
  formatDateForDisplay,
  formatReservationDate,
  formatReservationStatus,
  formatRoomStatus
} from "../../app/record-formatters";
import { getRoomDisplayInfo } from "../../app/operations";
import { CustomerRoomStayActions, RoomAssignmentDrawer } from "../customers/CustomersWorkspace";
import { DailyTaskEditor, type DailyTaskScope } from "./DailyTaskEditor";
import { ManualReservationEditor } from "./ManualReservationEditor";
import { ActionButton } from "../ui/ActionButton";
import { CompactListItem } from "../ui/CompactListItem";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";

function getCustomerRoomStayTone(value: string): StatusTone {
  if (value === "checked_in") return "ok";
  if (value === "planned") return "wait";
  if (value === "cancelled") return "danger";
  return "neutral";
}

function getReservationStatusTone(status: string): StatusTone {
  if (["rejected", "cancelled"].includes(status)) return "danger";
  if (status === "pending") return "wait";
  if (["approved", "completed"].includes(status)) return "ok";
  return "info";
}

function formatTaskStatus(value: string) {
  const labels: Record<string, string> = {
    pending: "Bekliyor",
    done: "Tamamlandı",
    cancelled: "İptal",
    archived: "Arşiv"
  };
  return labels[value] ?? "Bekliyor";
}

export function formatTaskDue(task: DesktopDashboardData["dailyTasks"][number]) {
  return [formatDateForDisplay(task.dueDate), task.dueTime].filter(Boolean).join(" · ") || "Zaman yok";
}

function formatTaskRelation(task: DesktopDashboardData["dailyTasks"][number]) {
  if (!task.relatedType && !task.relatedId) return "İlgili kayıt yok";
  const labels: Record<string, string> = {
    reservation: "İlgili rezervasyon",
    room: "İlgili oda",
    table: "İlgili masa",
    customer: "İlgili müşteri",
    request: "İlgili talep"
  };
  return labels[task.relatedType] ?? "İlgili kayıt";
}

function getResourceStatusTone(value: string): StatusTone {
  if (value === "available") return "ok";
  if (["reserved", "bill_waiting", "waiting_bill", "checkout", "payment"].includes(value)) return "wait";
  if (value === "maintenance") return "danger";
  return "info";
}

function matchesReservationDate(reservation: DesktopDashboardData["reservations"][number], date: string) {
  const startDate = reservation.startDate || reservation.endDate;
  const endDate = reservation.endDate || reservation.startDate;
  if (!startDate && !endDate) return false;
  return date >= startDate && date <= endDate;
}

function formatReservationRooms(
  reservation: DesktopDashboardData["reservations"][number],
  rooms: DesktopDashboardData["rooms"]
) {
  const names = reservation.roomIds.map((roomId) => rooms.find((room) => room.id === roomId)?.name).filter(Boolean);
  return names.length > 0 ? names.join(", ") : "Henüz oda atanmadı";
}

interface DailyTasksWorkspaceProps {
  scope: DailyTaskScope;
  tasks: DesktopDashboardData["dailyTasks"];
  onSave: (input: SaveDailyTaskInput) => Promise<DesktopStatusUpdateResult>;
  onDelete: (taskId: string) => Promise<DesktopStatusUpdateResult>;
  onUpdateStatus: (taskId: string, status: string) => void;
}

export function DailyTasksWorkspace({ scope, tasks, onSave, onDelete, onUpdateStatus }: DailyTasksWorkspaceProps) {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<DesktopDashboardData["dailyTasks"][number] | null>(null);
  const filteredTasks = useMemo(
    () => tasks.filter((task) => statusFilter === "all" || task.status === statusFilter),
    [statusFilter, tasks]
  );

  return (
    <section className="reservations-workspace" aria-label="Günlük işler">
      <div className="reservation-toolbar">
        <div className="operation-filter-summary" aria-label="Günlük iş özeti">
          <StatusBadge tone="wait">{tasks.filter((task) => task.status === "pending").length} bekleyen</StatusBadge>
          <StatusBadge tone="ok">{tasks.filter((task) => task.status === "done").length} tamamlanan</StatusBadge>
          <ActionButton
            size="sm"
            type="button"
            onClick={() => {
              setEditingTask(null);
              setEditorOpen(true);
            }}
          >
            <Plus size={15} aria-hidden="true" />
            Yeni İş
          </ActionButton>
        </div>
        <div className="reservation-filters task-filters">
          <label>
            Durum
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="pending">Bekleyen</option>
              <option value="done">Tamamlanan</option>
              <option value="cancelled">İptal</option>
              <option value="all">Tümü</option>
            </select>
          </label>
          <ActionButton variant="secondary" size="sm" type="button" onClick={() => setStatusFilter("all")}>
            Tümünü Göster
          </ActionButton>
        </div>
      </div>

      <section className="operations-grid compact-record-list" aria-label="Günlük iş listesi">
        {tasks.length === 0 ? (
          <div className="panel empty-state">
            <ClipboardList size={28} aria-hidden="true" />
            <strong>Günlük iş yok.</strong>
            <p>Yeni işler ve sizin eklediğiniz notlar burada görünür.</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="panel empty-state">
            <ClipboardList size={28} aria-hidden="true" />
            <strong>Filtreye uygun iş yok.</strong>
            <p>Durum filtresini değiştirin.</p>
          </div>
        ) : (
          filteredTasks.map((task) => (
            <CompactListItem
              className="operation-record-row task-record-row"
              key={task.id}
              leading={(
                <StatusBadge tone={task.status === "done" ? "ok" : task.status === "pending" ? "wait" : "info"}>
                  {formatTaskStatus(task.status)}
                </StatusBadge>
              )}
              title={task.title}
              meta={(
                <>
                  <span>{formatTaskDue(task)}</span>
                  <span>{formatTaskRelation(task)}</span>
                </>
              )}
              description={task.description || "Açıklama yok."}
              actions={(
                <>
                  <ActionButton size="sm" type="button" onClick={() => onUpdateStatus(task.id, "done")} disabled={task.status === "done"}>
                    <CheckCircle2 size={15} aria-hidden="true" />
                    Tamamla
                  </ActionButton>
                  <details className="expandable-details compact-action-details">
                    <summary>Diğer işlemler</summary>
                    <div className="expanded-record-content compact-secondary-menu">
                      <div className="secondary-detail-actions">
                        {task.taskType.startsWith("manual_") && (
                          <>
                            <ActionButton
                              variant="secondary"
                              size="sm"
                              type="button"
                              onClick={() => {
                                setEditingTask(task);
                                setEditorOpen(true);
                              }}
                            >
                              <Pencil size={14} aria-hidden="true" />
                              Düzenle
                            </ActionButton>
                            <ActionButton
                              variant="danger"
                              size="sm"
                              type="button"
                              onClick={() => {
                                if (window.confirm(`“${task.title}” günlük işi silinsin mi?`)) {
                                  void onDelete(task.id);
                                }
                              }}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              Sil
                            </ActionButton>
                          </>
                        )}
                        <ActionButton variant="danger" size="sm" type="button" onClick={() => onUpdateStatus(task.id, "cancelled")} disabled={task.status === "cancelled"}>İptal Et</ActionButton>
                        <ActionButton variant="secondary" size="sm" type="button" onClick={() => onUpdateStatus(task.id, "pending")} disabled={task.status === "pending"}>Yeniden Aç</ActionButton>
                      </div>
                    </div>
                  </details>
                </>
              )}
            />
          ))
        )}
      </section>
      <DailyTaskEditor
        open={editorOpen}
        scope={scope}
        task={editingTask}
        onClose={() => {
          setEditorOpen(false);
          setEditingTask(null);
        }}
        onSave={onSave}
      />
    </section>
  );
}

interface ReservationsWorkspaceProps {
  reservations: DesktopDashboardData["reservations"];
  rooms: DesktopDashboardData["rooms"];
  customers: DesktopDashboardData["customers"];
  whatsappEnabled: boolean;
  onSaveCustomer: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  onSaveManual: (input: SaveManualReservationInput) => Promise<DesktopStatusUpdateResult>;
  onUpdateStatus: (reservationId: string, status: string) => void;
  onOpenWhatsApp: (reservation: DesktopDashboardData["reservations"][number]) => void;
}

export function ReservationsWorkspace({
  reservations,
  rooms,
  customers,
  whatsappEnabled,
  onSaveCustomer,
  onSaveManual,
  onUpdateStatus,
  onOpenWhatsApp
}: ReservationsWorkspaceProps) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [manualEditorOpen, setManualEditorOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<DesktopDashboardData["reservations"][number] | null>(null);
  const filteredReservations = useMemo(
    () =>
      reservations.filter((reservation) => {
        const statusMatches = statusFilter === "all" || reservation.status === statusFilter;
        const dateMatches = !dateFilter || matchesReservationDate(reservation, dateFilter);
        return statusMatches && dateMatches;
      }),
    [dateFilter, reservations, statusFilter]
  );

  return (
    <section className="reservations-workspace" aria-label="Rezervasyon yönetimi">
      <div className="reservation-toolbar">
        <div className="operation-filter-summary" aria-label="Rezervasyon özeti">
          <StatusBadge tone="info">{filteredReservations.length} görünen kayıt</StatusBadge>
          <StatusBadge tone="wait">{reservations.filter((reservation) => reservation.status === "pending").length} onay bekleyen</StatusBadge>
          <ActionButton
            size="sm"
            type="button"
            onClick={() => {
              setEditingReservation(null);
              setManualEditorOpen(true);
            }}
          >
            <Plus size={15} aria-hidden="true" />
            Yeni Rezervasyon
          </ActionButton>
        </div>
        <div className="reservation-filters">
          <label className="reservation-status-filter">
            <span className="reservation-control-label">Durum</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Tümü</option>
              <option value="pending">Onay bekleyen</option>
              <option value="approved">Onaylandı</option>
              <option value="rejected">Reddedildi</option>
              <option value="cancelled">İptal edildi</option>
              <option value="completed">Tamamlandı</option>
            </select>
          </label>
          <label className="reservation-date-filter">
            <span className="reservation-filter-label">
              <span>Tarih</span>
              <small className="date-field-hint" id="reservation-date-hint">Gün / Ay / Yıl</small>
            </span>
            <div className="localized-date-input">
              <input
                lang="tr"
                type="date"
                value={dateFilter}
                aria-label="Tarih"
                aria-describedby="reservation-date-hint"
                onChange={(event) => setDateFilter(event.target.value)}
              />
              <span className={dateFilter ? "localized-date-display has-value" : "localized-date-display"} aria-hidden="true">
                {dateFilter ? formatDateForDisplay(dateFilter) : "Tarih seç"}
              </span>
            </div>
          </label>
          <ActionButton
            variant="ghost"
            size="sm"
            type="button"
            disabled={statusFilter === "all" && !dateFilter}
            onClick={() => { setStatusFilter("all"); setDateFilter(""); }}
          >
            Filtreyi Temizle
          </ActionButton>
        </div>
      </div>

      <section className="operations-grid compact-record-list" aria-label="Rezervasyon listesi">
        {reservations.length === 0 ? (
          <div className="panel empty-state">
            <CalendarCheck size={28} aria-hidden="true" />
            <strong>Rezervasyon yok.</strong>
            <p>Web talepleri veya sizin eklediğiniz rezervasyonlar burada görünür.</p>
          </div>
        ) : filteredReservations.length === 0 ? (
          <div className="panel empty-state">
            <CalendarCheck size={28} aria-hidden="true" />
            <strong>Filtreye uygun rezervasyon yok.</strong>
            <p>Durum veya tarih filtresini değiştirin.</p>
          </div>
        ) : (
          filteredReservations.map((reservation) => (
            <CompactListItem
              className="operation-record-row reservation-record-row"
              key={reservation.id}
              leading={<StatusBadge tone={getReservationStatusTone(reservation.status)}>{formatReservationStatus(reservation.status)}</StatusBadge>}
              title={reservation.title || reservation.customerName || "Misafir"}
              meta={(
                <>
                  <span>{formatReservationDate(reservation)}</span>
                  <span>{reservation.guestCount} kişi</span>
                  <span>{formatReservationRooms(reservation, rooms)}</span>
                </>
              )}
              description={reservation.notes || reservation.priceNote || "Rezervasyon notu yok."}
              actions={(
                <>
                  <ActionButton size="sm" type="button" onClick={() => onUpdateStatus(reservation.id, "approved")} disabled={reservation.status === "approved"}>
                    <CheckCircle2 size={15} aria-hidden="true" />
                    Onayla
                  </ActionButton>
                  {whatsappEnabled && (
                    <ActionButton variant="whatsapp" size="sm" type="button" onClick={() => onOpenWhatsApp(reservation)} disabled={!reservation.customerPhone}>
                      <MessageCircle size={15} aria-hidden="true" />
                      WhatsApp
                    </ActionButton>
                  )}
                  <details className="expandable-details compact-action-details">
                    <summary>Detay</summary>
                    <div className="expanded-record-content compact-secondary-menu">
                      <p>{reservation.notes || reservation.priceNote || "Rezervasyon notu yok."}</p>
                      <div className="secondary-detail-actions">
                        {reservation.reservationType === "room"
                          && ["pending", "approved"].includes(reservation.status)
                          && reservation.roomIds.length <= 1 && (
                            <ActionButton
                              variant="secondary"
                              size="sm"
                              type="button"
                              onClick={() => {
                                setEditingReservation(reservation);
                                setManualEditorOpen(true);
                              }}
                            >
                              <Pencil size={14} aria-hidden="true" />
                              Düzenle / Oda Ata
                            </ActionButton>
                          )}
                        <ActionButton variant="danger" size="sm" type="button" onClick={() => onUpdateStatus(reservation.id, "rejected")}>Reddet</ActionButton>
                        <ActionButton variant="secondary" size="sm" type="button" onClick={() => onUpdateStatus(reservation.id, "cancelled")}>İptal Et</ActionButton>
                      </div>
                    </div>
                  </details>
                </>
              )}
            />
          ))
        )}
      </section>
      <ManualReservationEditor
        open={manualEditorOpen}
        customers={customers}
        rooms={rooms}
        reservation={editingReservation}
        onClose={() => {
          setManualEditorOpen(false);
          setEditingReservation(null);
        }}
        onSave={onSaveManual}
        onSaveCustomer={onSaveCustomer}
      />
    </section>
  );
}

interface RoomsWorkspaceProps {
  rooms: DesktopDashboardData["rooms"];
  reservations: DesktopDashboardData["reservations"];
  customers: DesktopDashboardData["customers"];
  stays: DesktopDashboardData["customerRoomStays"];
  reservationsEnabled: boolean;
  staysEnabled: boolean;
  onUpdateStatus: (roomId: string, status: string) => void;
  onAssignRoom: (input: AssignCustomerRoomInput) => Promise<DesktopCustomerMutationResult>;
  onUpdateStayStatus: (
    stayId: string,
    status: "planned" | "checked_in" | "checked_out" | "cancelled"
  ) => Promise<DesktopCustomerMutationResult>;
}

export function RoomsWorkspace({
  rooms,
  reservations,
  customers,
  stays,
  reservationsEnabled,
  staysEnabled,
  onUpdateStatus,
  onAssignRoom,
  onUpdateStayStatus
}: RoomsWorkspaceProps) {
  const [assignmentRoomId, setAssignmentRoomId] = useState("");
  return (
    <>
      <section className="operations-grid compact-resource-grid" aria-label="Oda yönetimi">
        {rooms.length === 0 && (
          <div className="panel empty-state"><BedDouble size={28} aria-hidden="true" /><strong>Oda kaydı yok.</strong><p>Oda sayısını Temel Ayarlar bölümünden belirleyebilirsiniz.</p></div>
        )}
        {rooms.map((room) => {
          const displayInfo = getRoomDisplayInfo(room, reservations);
          const activeStay = stays.find((stay) => stay.roomId === room.id && ["planned", "checked_in"].includes(stay.status));
          const knownRoomStatuses = ["available", "occupied", "cleaning", "maintenance"];
          return <article className="compact-card resource-compact-card" key={room.id}>
            <div className="resource-card-heading">
              <div>
                <h2>{room.number ? `Oda ${room.number} — ${room.name}` : room.name}</h2>
              </div>
              <StatusBadge tone={getResourceStatusTone(displayInfo.status)}>{formatRoomStatus(displayInfo.status)}</StatusBadge>
            </div>
            <div className="compact-meta-row">
              <span>{room.capacity} kişi</span>
              <span>{room.floor || "Kat bilgisi yok"}</span>
              <span>{room.bedInfo || "Yatak bilgisi yok"}</span>
            </div>
            {staysEnabled && activeStay ? (
              <div className="room-customer-assignment">
                <strong>{activeStay.customerName}</strong>
                <span>{formatCustomerRoomStayStatus(activeStay.status)} · {formatStayDateRange(activeStay)}</span>
                <CustomerRoomStayActions stay={activeStay} onUpdateStatus={onUpdateStayStatus} />
              </div>
            ) : reservationsEnabled ? (
              <p className="compact-reservation-line line-clamp-1"><strong>Rezervasyon:</strong> {displayInfo.reservationTitle}</p>
            ) : null}
            {(room.description || room.features.length > 0) && <p className="resource-description line-clamp-1">{room.description || room.features.join(", ")}</p>}
            <div className="room-card-actions">
              {staysEnabled && !activeStay && (
                <ActionButton
                  size="sm"
                  type="button"
                  onClick={() => setAssignmentRoomId(room.id)}
                  disabled={customers.length === 0 || ["cleaning", "maintenance", "out_of_service"].includes(displayInfo.status)}
                >
                  <Users size={15} aria-hidden="true" />
                  Müşteri Ata
                </ActionButton>
              )}
              <label className="room-status-select">
                <span>Durum</span>
                <select
                  aria-label={`${room.name} durumunu değiştir`}
                  value={displayInfo.status}
                  disabled={Boolean(activeStay)}
                  onChange={(event) => onUpdateStatus(room.id, event.target.value)}
                >
                  {!knownRoomStatuses.includes(displayInfo.status) && (
                    <option value={displayInfo.status}>{formatRoomStatus(displayInfo.status)}</option>
                  )}
                  <option value="available">Boş</option>
                  <option value="occupied">Dolu</option>
                  <option value="cleaning">Temizlik</option>
                  <option value="maintenance">Bakım</option>
                </select>
              </label>
            </div>
          </article>;
        })}
      </section>
      {staysEnabled && (
        <RoomAssignmentDrawer
          open={Boolean(assignmentRoomId)}
          customers={customers}
          rooms={rooms}
          initialCustomerId=""
          initialRoomId={assignmentRoomId}
          onClose={() => setAssignmentRoomId("")}
          onAssign={async (input) => {
            const result = await onAssignRoom(input);
            if (result.ok) setAssignmentRoomId("");
            return result;
          }}
        />
      )}
    </>
  );
}

export function CustomerRoomStaysWorkspace({
  stays,
  onUpdateStatus
}: {
  stays: DesktopDashboardData["customerRoomStays"];
  onUpdateStatus: (
    stayId: string,
    status: "planned" | "checked_in" | "checked_out" | "cancelled"
  ) => Promise<DesktopCustomerMutationResult>;
}) {
  const [filter, setFilter] = useState("active");
  const visible = stays.filter((stay) =>
    filter === "all"
      || (filter === "active" && ["planned", "checked_in"].includes(stay.status))
      || stay.status === filter
  );
  return (
    <section className="customer-room-stays-workspace" aria-label="Konaklama arşivi">
      <div className="reservation-toolbar">
        <div className="operation-filter-summary">
          <StatusBadge tone="info">{stays.filter((stay) => stay.status === "checked_in").length} içeride</StatusBadge>
          <StatusBadge tone="wait">{stays.filter((stay) => stay.status === "planned").length} planlı</StatusBadge>
        </div>
        <label>Durum<select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="active">Aktif kayıtlar</option>
          <option value="checked_in">Giriş yaptı</option>
          <option value="planned">Planlandı</option>
          <option value="checked_out">Çıkış yaptı</option>
          <option value="cancelled">İptal</option>
          <option value="all">Tüm arşiv</option>
        </select></label>
      </div>
      <div className="compact-record-list customer-stay-list">
        {visible.length === 0 ? (
          <div className="empty-state compact-empty"><BedDouble size={24} aria-hidden="true" /><strong>Konaklama kaydı yok.</strong><p>Oda kartından veya müşteri kartından atama yapabilirsiniz.</p></div>
        ) : visible.map((stay) => (
          <CompactListItem
            className="operation-record-row customer-stay-row"
            key={stay.id}
            leading={<StatusBadge tone={getCustomerRoomStayTone(stay.status)}>{formatCustomerRoomStayStatus(stay.status)}</StatusBadge>}
            title={`${stay.customerName} · ${stay.roomNumber ? `Oda ${stay.roomNumber}` : stay.roomName}`}
            meta={<><span>{formatStayDateRange(stay)}</span><span>{stay.guestCount} kişi</span></>}
            description={stay.notes || "Konaklama notu yok."}
            actions={<CustomerRoomStayActions stay={stay} onUpdateStatus={onUpdateStatus} />}
          />
        ))}
      </div>
    </section>
  );
}
