import { useConfirmDialog } from "../ui/useConfirmDialog";
import { DatePicker } from "../ui/DateTimePicker";
import { useMemo, useState } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type {
  DesktopCustomerMutationResult,
  DesktopDashboardData,
  DesktopStatusUpdateResult,
  SaveCustomerInput,
  SaveDailyTaskInput,
  SaveManualReservationInput
} from "../../../electron/database";
import {
  formatDateForDisplay,
  formatReservationDate,
  formatReservationStatus
} from "../../app/record-formatters";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { usePensionPage } from "../pension/pension-page-state";
import { ReservationAssignmentDialog } from "../pension/ReservationRoomAssignment";
import { DailyTaskEditor, type DailyTaskScope } from "./DailyTaskEditor";
import { ManualReservationEditor } from "./ManualReservationEditor";
import { ActionButton } from "../ui/ActionButton";
import { DataListItem } from "../ui/DataList";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";

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
  const { confirm, confirmDialog } = useConfirmDialog();
  const pension = usePensionPage();
  const [localStatus, setLocalStatus] = useState("pending");
  const statusFilter = pension?.filters.taskStatus ?? localStatus;
  const setStatusFilter = (value: string) => pension ? pension.setFilters(current => ({ ...current, taskStatus: value })) : setLocalStatus(value);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<DesktopDashboardData["dailyTasks"][number] | null>(null);
  const filteredTasks = useMemo(
    () => tasks.filter((task) => statusFilter === "all" || task.status === statusFilter),
    [statusFilter, tasks]
  );

  return (
    <section className="record-stack" aria-label="Günlük işler">
      <div className="page-toolbar">
        <div className="page-toolbar__start" aria-label="Günlük iş özeti">
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
        <div className="form-row filter-row">
          <label className="form-field form-field--medium">
            Durum
            <select aria-label="Durum" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
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

      <section className="data-records" aria-label="Günlük iş listesi">
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
            <DataListItem
              className="task-record-row"
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
                  {task.status === "pending" && (
                    <ActionButton size="sm" type="button" onClick={() => onUpdateStatus(task.id, "done")}>
                      <CheckCircle2 size={15} aria-hidden="true" />
                      Tamamla
                    </ActionButton>
                  )}
                  {task.taskType.startsWith("manual_") && (
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
                  )}
                  {task.status === "pending" && (
                    <ActionButton variant="danger" size="sm" type="button" onClick={() => onUpdateStatus(task.id, "cancelled")}>
                      İptal Et
                    </ActionButton>
                  )}
                  {["done", "cancelled", "archived"].includes(task.status) && (
                    <ActionButton variant="secondary" size="sm" type="button" onClick={() => onUpdateStatus(task.id, "pending")}>
                      Yeniden Aç
                    </ActionButton>
                  )}
                  {task.taskType.startsWith("manual_") && (
                    <ActionButton
                      variant="danger"
                      size="sm"
                      type="button"
                      onClick={async () => {
                        if (await confirm({ title: "Günlük işi sil", description: `“${task.title}” günlük işi silinsin mi?`, tone: "danger", confirmLabel: "Sil" })) {
                          void onDelete(task.id);
                        }
                      }}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      Sil
                    </ActionButton>
                  )}
                </>
              )}
            />
          ))
        )}
      </section>
      {confirmDialog}
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
  const pension = usePensionPage();
  const navigation = useWorkspaceNavigation();
  const [localStatus, setLocalStatus] = useState("all");
  const [localDate, setLocalDate] = useState("");
  const statusFilter = pension?.filters.reservationStatus ?? localStatus;
  const dateFilter = pension?.filters.reservationDate ?? localDate;
  const setStatusFilter = (value: string) => pension ? pension.setFilters(current => ({ ...current, reservationStatus: value })) : setLocalStatus(value);
  const setDateFilter = (value: string) => pension ? pension.setFilters(current => ({ ...current, reservationDate: value })) : setLocalDate(value);
  const [assignment, setAssignment] = useState<DesktopDashboardData["reservations"][number] | null>(null);
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
    <section className="record-stack" aria-label="Rezervasyon yönetimi">
      <div className="page-toolbar">
        <div className="page-toolbar__start" aria-label="Rezervasyon özeti">
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
        <div className="form-row filter-row">
          <label className="reservation-status-filter form-field form-field--short">
            <span className="reservation-control-label">Durum</span>
            <select aria-label="Durum" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Tümü</option>
              <option value="pending">Onay bekleyen</option>
              <option value="approved">Onaylandı</option>
              <option value="rejected">Reddedildi</option>
              <option value="cancelled">İptal edildi</option>
              <option value="completed">Tamamlandı</option>
            </select>
          </label>
          <div className="reservation-date-filter form-field form-field--short">
            <span className="reservation-filter-label">Tarih</span>
            <DatePicker
              ariaLabel="Tarih"
              value={dateFilter}
              onChange={setDateFilter}
            />
          </div>
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

      <section className="data-records" aria-label="Rezervasyon listesi">
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
            <DataListItem
              className="reservation-record-row"
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
                  {reservation.status === "pending" && (
                    <ActionButton size="sm" type="button" onClick={() => onUpdateStatus(reservation.id, "approved")}>
                      <CheckCircle2 size={15} aria-hidden="true" />
                      Onayla
                    </ActionButton>
                  )}
                  {reservation.roomIds.length === 1 && rooms.some(room => room.id === reservation.roomIds[0]) && (
                    <ActionButton
                      variant="secondary"
                      size="sm"
                      onClick={() => navigation.openWorkspace({
                        entityType: "room",
                        entityId: reservation.roomIds[0],
                        mode: "stay",
                        returnContext: { page: "pension", view: "reservations", entityId: reservation.id }
                      })}
                    >
                      Odayı Aç
                    </ActionButton>
                  )}
                  {reservation.reservationType === "room" && ["pending", "approved"].includes(reservation.status) && reservation.roomIds.length <= 1 && (
                    <ActionButton variant="secondary" size="sm" onClick={() => setAssignment(reservation)}>
                      Oda Ata / Düzenle
                    </ActionButton>
                  )}
                  {whatsappEnabled && (
                    <ActionButton variant="whatsapp" size="sm" type="button" onClick={() => onOpenWhatsApp(reservation)} disabled={!reservation.customerPhone}>
                      <MessageCircle size={15} aria-hidden="true" />
                      WhatsApp'a Hazırla
                    </ActionButton>
                  )}
                  {reservation.reservationType === "room" && ["pending", "approved"].includes(reservation.status) && reservation.roomIds.length <= 1 && (
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
                      Düzenle
                    </ActionButton>
                  )}
                  {["pending", "approved"].includes(reservation.status) && (
                    <ActionButton variant="danger" size="sm" type="button" onClick={() => onUpdateStatus(reservation.id, "rejected")}>
                      Reddet
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
      </section>
      {assignment && <ReservationAssignmentDialog reservation={assignment} rooms={rooms} onSave={onSaveManual} onClose={() => setAssignment(null)} />}
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
