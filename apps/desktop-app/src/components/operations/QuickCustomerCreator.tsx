import { useEffect, useState } from "react";
import { Save, UserPlus, X } from "lucide-react";
import type {
  DesktopCustomerMutationResult,
  SaveCustomerInput
} from "../../../electron/database";
import { customerFormToInput, toCustomerForm } from "../../app/customer-model";
import { ActionButton } from "../ui/ActionButton";

type QuickCustomerState = "idle" | "loading" | "success" | "error";

interface QuickCustomerCreatorProps {
  disabled?: boolean;
  initialOpen?: boolean;
  showTrigger?: boolean;
  onSave: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  onCreated: (customerId: string) => void;
  onDirty?: (dirty: boolean) => void;
  onClose?: () => void;
}

function createQuickCustomerInput(fullName: string, phone: string): SaveCustomerInput {
  return customerFormToInput({
    ...toCustomerForm(null),
    fullName: fullName.trim(),
    phone: phone.trim()
  });
}

export function QuickCustomerCreator({
  disabled = false,
  initialOpen = false,
  showTrigger = true,
  onSave,
  onCreated,
  onDirty,
  onClose
}: QuickCustomerCreatorProps) {
  const [open, setOpen] = useState(initialOpen);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<QuickCustomerState>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (initialOpen) onDirty?.(true);
    // initialOpen is a mount-time mode used by workspace quick actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function closeEditor() {
    if (state === "loading") return;
    setOpen(false);
    setFullName("");
    setPhone("");
    setState("idle");
    setMessage("");
    onDirty?.(false);
    onClose?.();
  }

  if (!open) {
    if (!showTrigger) return null;
    return (
      <div className="reservation-quick-customer-entry">
        <ActionButton
          variant="ghost"
          size="sm"
          type="button"
          disabled={disabled}
          onClick={() => {
            setOpen(true);
            onDirty?.(true);
            setState("idle");
            setMessage("");
          }}
        >
          <UserPlus size={15} aria-hidden="true" />
          Yeni Müşteri Ekle
        </ActionButton>
        {state === "success" && message && <small className="reservation-quick-customer-success">{message}</small>}
      </div>
    );
  }

  return (
    <section className="reservation-quick-customer" aria-label="Hızlı müşteri ekleme">
      <div className="page-toolbar">
        <div>
          <strong>Yeni müşteri</strong>
          <small>Her misafir için ayrı kayıt oluşturun. Telefon zorunlu değildir.</small>
        </div>
        <button
          className="drawer-close-button"
          type="button"
          aria-label="Hızlı müşteri formunu kapat"
          disabled={state === "loading"}
          onClick={closeEditor}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="form-row">
        <label className="form-field form-field--medium">
          Ad soyad
          <input
            autoFocus
            required
            maxLength={160}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Müşteri adı soyadı"
          />
        </label>
        <label className="form-field form-field--short">
          Telefon
          <input
            type="tel"
            maxLength={32}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+90 5xx… / +44…"
          />
        </label>
      </div>

      {message && state === "error" && <p className="form-status sync-error">{message}</p>}

      <div className="form-actions">
        <ActionButton variant="secondary" size="sm" type="button" disabled={state === "loading"} onClick={closeEditor}>
          Vazgeç
        </ActionButton>
        <ActionButton
          size="sm"
          type="button"
          disabled={disabled || state === "loading" || !fullName.trim()}
          onClick={async () => {
            setState("loading");
            setMessage("Müşteri kaydediliyor...");
            let result: DesktopCustomerMutationResult;
            try { result = await onSave(createQuickCustomerInput(fullName, phone)); }
            catch { setState("error"); setMessage("Müşteri kaydedilemedi; yeniden deneyin."); return; }
            if (!result.ok) {
              setState("error");
              setMessage(result.message);
              return;
            }

            const savedCustomer = result.dashboardData.customers.find((customer) => customer.id === result.savedId);
            onDirty?.(false);
            onCreated(result.savedId);
            setOpen(false);
            setFullName("");
            setPhone("");
            setState("success");
            setMessage(`${savedCustomer?.fullName || "Yeni müşteri"} eklendi ve seçildi.`);
          }}
        >
          <Save size={15} aria-hidden="true" />
          {state === "loading" ? "Kaydediliyor" : "Kaydet ve Seç"}
        </ActionButton>
      </div>
    </section>
  );
}
