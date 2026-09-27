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
import { DatePicker, TimePicker } from "../ui/DateTimePicker";
import { SearchSelect } from "../ui/SearchSelect";
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
            <div className="form-field form-field--long form-field--span">
              <span>Müşteri</span>
              <SearchSelect
                ariaLabel="Müşteri"
                value={form.customerId}
                onChange={(customerId) => setForm((current) => ({ ...current, customerId }))}
                placeholder={customers.length === 0 ? "Henüz müşteri kaydı yok" : "Müşteri seçin"}
                searchPlaceholder="Müşteri adı veya telefon ara"
                options={customers.map((customer) => ({
                  id: customer.id,
                  label: customer.fullName,
                  description: customer.phone || customer.email || undefined,
                  keywords: `${customer.phone || ""} ${customer.email || ""}`
                }))}
              />
              <small>{selectedCustomer ? "Kayıtlı müşteri seçildi." : "Listede yoksa aşağıdan yeni müşteri ekleyebilirsiniz."}</small>
            </div>

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

            <div className="form-field form-field--short">
              <span>Tarih</span>
              <DatePicker
                ariaLabel="Tarih"
                value={form.date}
                onChange={(value) => setForm((current) => ({ ...current, date: value }))}
              />
            </div>

            <div className="form-field form-field--xs">
              <span>Saat</span>
              <TimePicker
                ariaLabel="Saat"
                value={form.time}
                onChange={(value) => setForm((current) => ({ ...current, time: value }))}
              />
            </div>

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

            <div className="form-field form-field--medium form-field--span">
              <span>Masa</span>
              <SearchSelect
                ariaLabel="Masa"
                value={form.tableId}
                onChange={(tableId) => setForm((current) => ({ ...current, tableId }))}
                placeholder="Masayı daha sonra ata"
                searchPlaceholder="Masa adı veya bölüm ara"
                options={activeTables.map((table) => ({
                  id: table.id,
                  label: table.name,
                  description: `${table.capacity} kişi${table.area ? ` · ${table.area}` : ""}`,
                  keywords: table.area
                }))}
              />
              <small>Masa seçilirse kapasite ile aynı tarih ve saatteki rezervasyon çakışması kontrol edilir.</small>
            </div>

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
