import { useEffect, useMemo, useState } from "react";
import { Save, UtensilsCrossed } from "lucide-react";
import type {
  DesktopCustomerMutationResult,
  DesktopDashboardData,
  DesktopStatusUpdateResult,
  SaveCustomerInput,
  SaveManualRestaurantReservationInput
} from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";
import { FormDialog } from "../ui/FormDialog";
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
  const [customerSaving, setCustomerSaving] = useState(false);
  const busy = state === "loading" || customerSaving;
  const activeTables = useMemo(() => tables.filter((table) => table.isActive), [tables]);
  const selectedCustomer = customers.find((customer) => customer.id === form.customerId);

  useEffect(() => {
    if (!open) return;
    setForm(createInitialForm(customers));
    setState("idle");
    setMessage("");
    // Reset only on a new open lifetime; quick customer creation must preserve the draft.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <FormDialog title="Yeni masa rezervasyonu" onClose={onClose} closeBlocked={busy}
      footer={<>
        <ActionButton variant="secondary" onClick={onClose} disabled={busy}>Vazgeç</ActionButton>
        <ActionButton type="submit" disabled={busy || !form.customerId || !form.date || !form.time || form.guestCount < 1}>
          {state === "loading" ? <UtensilsCrossed size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          {state === "loading" ? "Kaydediliyor" : "Rezervasyonu Kaydet"}
        </ActionButton>
      </>}
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setState("loading");
            setMessage("Restoran rezervasyonu kaydediliyor...");
            try {
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
            } catch { setState("error"); setMessage("Restoran rezervasyonu kaydedilemedi."); }
          }}
        >
          <div className="form-grid restaurant-reservation-form-grid">
            <label className="form-field form-field--long form-field--span">
              Müşteri
              <select
                aria-label="Müşteri"
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

            <div className="form-field--span">
              <QuickCustomerCreator
                disabled={busy}
                onSave={async input => {
                  setCustomerSaving(true);
                  try { return await onSaveCustomer(input); }
                  catch { return { ok: false, message: "Müşteri kaydedilemedi." }; }
                  finally { setCustomerSaving(false); }
                }}
                onCreated={(customerId) => setForm((current) => ({ ...current, customerId }))}
              />
            </div>

            <label className="form-field form-field--short">
              Tarih
              <input
                type="date"
                lang="tr-TR"
                required
                value={form.date}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
              />
            </label>

            <label className="form-field form-field--xs">
              Saat
              <input
                type="time"
                lang="tr-TR"
                required
                value={form.time}
                onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))}
              />
            </label>

            <label className="form-field form-field--xs">
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

            <label className="form-field form-field--medium form-field--span">
              Masa
              <select
                aria-label="Masa"
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

            <label className="form-field form-field--fluid form-field--span">
              Not
              <textarea
                aria-label="Not"
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
          {message && <p className={state === "error" ? "status-message status-message--danger" : "form-status"} role="status">{message}</p>}

    </FormDialog>
  );
}
