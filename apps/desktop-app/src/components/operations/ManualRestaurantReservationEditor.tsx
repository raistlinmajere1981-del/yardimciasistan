import { useEffect, useMemo, useState } from "react";
import { Save, UtensilsCrossed, X } from "lucide-react";
import type {
  DesktopCustomerMutationResult,
  DesktopDashboardData,
  DesktopStatusUpdateResult,
  SaveCustomerInput,
  SaveManualRestaurantReservationInput
} from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";
import { QuickCustomerCreator } from "./QuickCustomerCreator";

type EditorState = "idle" | "loading" | "error";

interface ManualRestaurantReservationEditorProps {
  open: boolean;
  customers: DesktopDashboardData["customers"];
  tables: DesktopDashboardData["tables"];
  onClose: () => void;
  onSave: (input: SaveManualRestaurantReservationInput) => Promise<DesktopStatusUpdateResult>;
  onSaveCustomer: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
}

interface RestaurantReservationFormState {
  customerId: string;
  tableId: string;
  date: string;
  time: string;
  guestCount: number;
  notes: string;
}

function localDateKey() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function createInitialForm(customers: DesktopDashboardData["customers"]): RestaurantReservationFormState {
  return {
    customerId: customers[0]?.id ?? "",
    tableId: "",
    date: localDateKey(),
    time: "19:00",
    guestCount: 2,
    notes: ""
  };
}

export function ManualRestaurantReservationEditor({
  open,
  customers,
  tables,
  onClose,
  onSave,
  onSaveCustomer
}: ManualRestaurantReservationEditorProps) {
  const [form, setForm] = useState<RestaurantReservationFormState>(() => createInitialForm(customers));
  const [state, setState] = useState<EditorState>("idle");
  const [message, setMessage] = useState("");
  const activeTables = useMemo(() => tables.filter((table) => table.isActive), [tables]);
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
      className="manual-request-backdrop overlay overlay--drawer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && state !== "loading") onClose();
      }}
    >
      <aside className="manual-request-drawer drawer drawer--scroll" role="dialog" aria-modal="true" aria-labelledby="manual-restaurant-reservation-title">
        <header className="manual-request-drawer-header overlay-header overlay-header--sticky">
          <div className="manual-request-heading">
            <p>Restoran rezervasyonları</p>
            <h2 id="manual-restaurant-reservation-title">Yeni masa rezervasyonu</h2>
          </div>
          <button
            className="drawer-close-button"
            type="button"
            aria-label="Restoran rezervasyon formunu kapat"
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
            setMessage("Restoran rezervasyonu kaydediliyor...");
            const result = await onSave({
              customerId: form.customerId,
              tableId: form.tableId || undefined,
              date: form.date,
              time: form.time,
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
                  <option value="">Henüz müşteri kaydı yok</option>
                ) : (
                  customers.map((customer) => (
                    <option value={customer.id} key={customer.id}>
                      {customer.fullName}{customer.phone ? ` · ${customer.phone}` : ""}
                    </option>
                  ))
                )}
              </select>
              <small>{selectedCustomer ? "Kayıtlı müşteri seçildi." : "Listede yoksa aşağıdan yeni müşteri ekleyebilirsiniz."}</small>
            </label>

            <div className="manual-request-note-field">
              <QuickCustomerCreator
                disabled={state === "loading"}
                onSave={onSaveCustomer}
                onCreated={(customerId) => setForm((current) => ({ ...current, customerId }))}
              />
            </div>

            <label>
              Tarih
              <input
                type="date"
                lang="tr"
                required
                value={form.date}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
              />
            </label>

            <label>
              Saat
              <input
                type="time"
                required
                value={form.time}
                onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))}
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
              Masa
              <select
                value={form.tableId}
                onChange={(event) => setForm((current) => ({ ...current, tableId: event.target.value }))}
              >
                <option value="">Masayı daha sonra ata</option>
                {activeTables.map((table) => (
                  <option value={table.id} key={table.id}>
                    {table.name} · {table.capacity} kişi{table.area ? ` · ${table.area}` : ""}
                  </option>
                ))}
              </select>
              <small>Masa seçilirse kapasite ile aynı tarih ve saatteki rezervasyon çakışması kontrol edilir.</small>
            </label>

            <label className="manual-request-note-field">
              Not
              <textarea
                maxLength={2000}
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Örn. Telefonla alındı, çocuk sandalyesi gerekli."
              />
            </label>
          </div>

          {customers.length === 0 && (
            <p className="form-status">Müşteri listeniz boş. Yeni Müşteri Ekle ile ilk kaydı oluşturabilirsiniz.</p>
          )}
          {message && <p className={`form-status sync-${state}`}>{message}</p>}

          <div className="manual-request-actions">
            <ActionButton variant="secondary" type="button" onClick={onClose} disabled={state === "loading"}>
              Vazgeç
            </ActionButton>
            <ActionButton
              type="submit"
              disabled={state === "loading" || !form.customerId || !form.date || !form.time || form.guestCount < 1}
            >
              {state === "loading" ? <UtensilsCrossed size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
              {state === "loading" ? "Kaydediliyor" : "Rezervasyonu Kaydet"}
            </ActionButton>
          </div>
        </form>
      </aside>
    </div>
  );
}
