import { useDialogFocus } from "../ui/useDialogFocus";
import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Save, X } from "lucide-react";
import type {
  DesktopCustomerMutationResult,
  DesktopDashboardData,
  DesktopStatusUpdateResult,
  SaveCustomerInput,
  SaveManualReservationInput
} from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";
import { QuickCustomerCreator } from "./QuickCustomerCreator";

type EditorState = "idle" | "loading" | "error";
type Reservation = DesktopDashboardData["reservations"][number];

interface ManualReservationEditorProps {
  open: boolean;
  customers: DesktopDashboardData["customers"];
  rooms: DesktopDashboardData["rooms"];
  reservation?: Reservation | null;
  onClose: () => void;
  onSave: (input: SaveManualReservationInput) => Promise<DesktopStatusUpdateResult>;
  onSaveCustomer: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
}

interface ManualReservationFormState {
  customerId: string;
  roomId: string;
  startDate: string;
  endDate: string;
  guestCount: number;
  notes: string;
}

function localDateKey(dayOffset = 0) {
  const now = new Date();
  now.setDate(now.getDate() + dayOffset);
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function createInitialForm(
  customers: DesktopDashboardData["customers"],
  reservation?: Reservation | null
): ManualReservationFormState {
  if (reservation) {
    return {
      customerId: reservation.customerId,
      roomId: reservation.roomIds[0] ?? "",
      startDate: reservation.startDate,
      endDate: reservation.endDate,
      guestCount: Math.max(1, reservation.guestCount || 1),
      notes: reservation.notes
    };
  }

  return {
    customerId: customers[0]?.id ?? "",
    roomId: "",
    startDate: localDateKey(),
    endDate: localDateKey(1),
    guestCount: 1,
    notes: ""
  };
}

export function ManualReservationEditor({
  open,
  customers,
  rooms,
  reservation = null,
  onClose,
  onSave,
  onSaveCustomer
}: ManualReservationEditorProps) {
  const [form, setForm] = useState<ManualReservationFormState>(() => createInitialForm(customers, reservation));
  const [state, setState] = useState<EditorState>("idle");
  const [message, setMessage] = useState("");
  const isEditing = Boolean(reservation);
  const isManualReservation = Boolean(reservation?.requestId.startsWith("manual:"));
  const detailsEditable = !isEditing || isManualReservation;
  const activeRooms = useMemo(
    () => rooms.filter((room) => room.isActive || reservation?.roomIds.includes(room.id)),
    [reservation, rooms]
  );
  const selectedCustomer = customers.find((customer) => customer.id === form.customerId);

  useEffect(() => {
    if (!open) return;
    setForm(createInitialForm(customers, reservation));
    setState("idle");
    setMessage("");
  }, [customers, open, reservation]);

  const dialogRef = useDialogFocus(open);

  if (!open) return null;

  return (
    <div
      className="manual-request-backdrop overlay overlay--drawer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && state !== "loading") onClose();
      }}
    >
      <aside ref={dialogRef} className="drawer drawer--form drawer--scroll" role="dialog" aria-modal="true" aria-labelledby="manual-reservation-editor-title">
        <header className="overlay-header overlay-header--sticky">
          <div className="overlay-heading">
            <p>Pansiyon rezervasyonları</p>
            <h2 id="manual-reservation-editor-title">{isEditing ? "Rezervasyonu düzenle" : "Yeni rezervasyon ekle"}</h2>
          </div>
          <button
            className="drawer-close-button"
            type="button"
            aria-label="Rezervasyon formunu kapat"
            onClick={onClose}
            disabled={state === "loading"}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form
          className="form-stack overlay-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setState("loading");
            setMessage(isEditing ? "Rezervasyon güncelleniyor..." : "Rezervasyon kaydediliyor...");
            const result = await onSave({
              reservationId: reservation?.id,
              customerId: form.customerId,
              roomId: form.roomId || undefined,
              startDate: form.startDate,
              endDate: form.endDate,
              guestCount: form.guestCount,
              notes: form.notes
            });
            if (!result.ok) {
              setState("error");
              setMessage(result.message);
              return;
            }
            onClose();
          }}
        >
          <div className="form-grid">
            <label className="form-field--span form-field form-field--long">
              Müşteri
              <select
                autoFocus={!isEditing}
                required
                disabled={isEditing}
                value={form.customerId}
                onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))}
              >
                {customers.length === 0 ? (
                  <option value="">Henüz müşteri kaydı yok</option>
                ) : (
                  customers.map((customer) => (
                    <option value={customer.id} key={customer.id}>
                      {customer.fullName}{customer.phone ? ` · ${customer.phone}` : ""}
                    </option>
                  ))
                )}
              </select>
              <small>
                {isEditing
                  ? "Rezervasyonun müşteri kaydı değiştirilmez."
                  : selectedCustomer
                    ? "Kayıtlı müşteri seçildi."
                    : "Listede yoksa aşağıdan yeni müşteri ekleyebilirsiniz."}
              </small>
            </label>

            {!isEditing && (
              <div className="form-field--span">
                <QuickCustomerCreator
                  disabled={state === "loading"}
                  onSave={onSaveCustomer}
                  onCreated={(customerId) => setForm((current) => ({ ...current, customerId }))}
                />
              </div>
            )}

            <label className="form-field form-field--short">
              Giriş tarihi
              <input
                type="date"
                lang="tr-TR"
                required
                disabled={!detailsEditable}
                value={form.startDate}
                onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
              />
            </label>

            <label className="form-field form-field--short">
              Çıkış tarihi
              <input
                type="date"
                lang="tr-TR"
                required
                disabled={!detailsEditable}
                min={form.startDate || undefined}
                value={form.endDate}
                onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
              />
            </label>

            <label className="form-field form-field--xs">
              Kişi sayısı
              <input
                type="number"
                min={1}
                max={99}
                required
                disabled={!detailsEditable}
                value={form.guestCount}
                onChange={(event) => setForm((current) => ({ ...current, guestCount: Number(event.target.value) }))}
              />
            </label>

            <label className="form-field--span form-field form-field--long">
              Oda
              <select
                autoFocus={isEditing}
                value={form.roomId}
                onChange={(event) => setForm((current) => ({ ...current, roomId: event.target.value }))}
              >
                <option value="">Odayı daha sonra ata</option>
                {activeRooms.map((room) => (
                  <option value={room.id} key={room.id}>
                    {room.name} · {room.capacity} kişi · {room.status === "available" ? "Boş" : room.status}
                  </option>
                ))}
              </select>
              <small>Oda değişikliğinde kapasite, aktif konaklama ve tarih çakışmaları yeniden kontrol edilir.</small>
            </label>

            <label className="form-field--span form-field form-field--fluid">
              Not
              <textarea
                maxLength={2000}
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Örn. Telefonla alındı, geç giriş yapacak."
              />
            </label>
          </div>

          {isEditing && !isManualReservation && (
            <p className="form-status">
              Web talebinden oluşan rezervasyonda tarih ve kişi bilgisi talep kaydıyla bağlıdır; burada oda ve not değiştirilebilir.
            </p>
          )}
          {customers.length === 0 && !isEditing && (
            <p className="form-status">Müşteri listeniz boş. Yeni Müşteri Ekle ile ilk kaydı oluşturabilirsiniz.</p>
          )}
          {message && <p className={`form-status sync-${state}`}>{message}</p>}

          <div className="overlay-footer overlay-footer--inset form-actions">
            <ActionButton variant="secondary" type="button" onClick={onClose} disabled={state === "loading"}>
              Vazgeç
            </ActionButton>
            <ActionButton
              type="submit"
              disabled={
                state === "loading"
                || !form.customerId
                || !form.startDate
                || !form.endDate
                || form.guestCount < 1
              }
            >
              {state === "loading" ? <CalendarPlus size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
              {state === "loading"
                ? (isEditing ? "Güncelleniyor" : "Kaydediliyor")
                : (isEditing ? "Değişiklikleri Kaydet" : "Rezervasyonu Kaydet")}
            </ActionButton>
          </div>
        </form>
      </aside>
    </div>
  );
}
