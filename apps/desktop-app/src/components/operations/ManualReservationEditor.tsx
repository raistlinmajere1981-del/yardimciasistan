import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Save, X } from "lucide-react";
import type {
  DesktopDashboardData,
  DesktopStatusUpdateResult,
  SaveManualReservationInput
} from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";

type EditorState = "idle" | "loading" | "error";

interface ManualReservationEditorProps {
  open: boolean;
  customers: DesktopDashboardData["customers"];
  rooms: DesktopDashboardData["rooms"];
  onClose: () => void;
  onSave: (input: SaveManualReservationInput) => Promise<DesktopStatusUpdateResult>;
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

function createInitialForm(customers: DesktopDashboardData["customers"]): ManualReservationFormState {
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
  onClose,
  onSave
}: ManualReservationEditorProps) {
  const [form, setForm] = useState<ManualReservationFormState>(() => createInitialForm(customers));
  const [state, setState] = useState<EditorState>("idle");
  const [message, setMessage] = useState("");
  const activeRooms = useMemo(
    () => rooms.filter((room) => room.isActive),
    [rooms]
  );
  const selectedCustomer = customers.find((customer) => customer.id === form.customerId);

  useEffect(() => {
    if (!open) return;
    setForm(createInitialForm(customers));
    setState("idle");
    setMessage("");
  }, [customers, open]);

  if (!open) return null;

  return (
    <div
      className="manual-request-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && state !== "loading") onClose();
      }}
    >
      <aside className="manual-request-drawer" role="dialog" aria-modal="true" aria-labelledby="manual-reservation-editor-title">
        <header className="manual-request-drawer-header">
          <div className="manual-request-heading">
            <p>Pansiyon rezervasyonları</p>
            <h2 id="manual-reservation-editor-title">Yeni rezervasyon ekle</h2>
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
          className="manager-form manual-request-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setState("loading");
            setMessage("Rezervasyon kaydediliyor...");
            const result = await onSave({
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
          <div className="manual-request-core-grid">
            <label className="manual-request-note-field">
              Müşteri
              <select
                autoFocus
                required
                value={form.customerId}
                onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))}
              >
                {customers.length === 0 ? (
                  <option value="">Önce müşteri kaydı ekleyin</option>
                ) : (
                  customers.map((customer) => (
                    <option value={customer.id} key={customer.id}>
                      {customer.fullName}{customer.phone ? ` · ${customer.phone}` : ""}
                    </option>
                  ))
                )}
              </select>
              <small>
                {selectedCustomer
                  ? "Kayıtlı müşteri seçildi."
                  : "Yeni müşteri gerekiyorsa önce Müşteri İşleri bölümünden ekleyin."}
              </small>
            </label>

            <label>
              Giriş tarihi
              <input
                type="date"
                lang="tr"
                required
                value={form.startDate}
                onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
              />
            </label>

            <label>
              Çıkış tarihi
              <input
                type="date"
                lang="tr"
                required
                min={form.startDate || undefined}
                value={form.endDate}
                onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
              />
            </label>

            <label>
              Kişi sayısı
              <input
                type="number"
                min={1}
                max={99}
                required
                value={form.guestCount}
                onChange={(event) => setForm((current) => ({ ...current, guestCount: Number(event.target.value) }))}
              />
            </label>

            <label className="manual-request-note-field">
              Oda
              <select
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
              <small>Seçilen odada aynı tarihlerde aktif rezervasyon varsa kayıt engellenir.</small>
            </label>

            <label className="manual-request-note-field">
              Not
              <textarea
                maxLength={2000}
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Örn. Telefonla alındı, geç giriş yapacak."
              />
            </label>
          </div>

          {customers.length === 0 && (
            <p className="form-status sync-error">Rezervasyon açmak için önce bir müşteri kaydı oluşturun.</p>
          )}
          {message && <p className={`form-status sync-${state}`}>{message}</p>}

          <div className="manual-request-actions">
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
              {state === "loading" ? "Kaydediliyor" : "Rezervasyonu Kaydet"}
            </ActionButton>
          </div>
        </form>
      </aside>
    </div>
  );
}
