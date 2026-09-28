import { useEffect, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import type {
  DesktopCustomerMutationResult,
  DesktopIdentityImageAnalyzeResult,
  SaveCustomerInput
} from "../../../electron/database";
import { customerFormToInput, toCustomerForm, type CustomerFormState } from "../../app/customer-model";
import { ActionButton } from "../ui/ActionButton";
import { FormDialog } from "../ui/FormDialog";
import { WorkspaceFormOverlay } from "../workspace/WorkspaceFormOverlay";
import { CustomerFormFields } from "./CustomerFormFields";

type SaveState = "idle" | "loading" | "error";

interface CustomerCreateEditorProps {
  open: boolean;
  aiEnabled: boolean;
  withinWorkspace?: boolean;
  onClose: () => void;
  onSave: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  onAnalyzeIdentity: (file: File) => Promise<DesktopIdentityImageAnalyzeResult>;
  onCreated: (customerId: string) => void;
}

export function CustomerCreateEditor({
  open,
  aiEnabled,
  withinWorkspace = false,
  onClose,
  onSave,
  onAnalyzeIdentity,
  onCreated
}: CustomerCreateEditorProps) {
  const [form, setForm] = useState<CustomerFormState>(() => toCustomerForm(null));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(toCustomerForm(null));
    setSaveState("idle");
    setSaveMessage("");
  }, [open]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState("loading");
    setSaveMessage("Müşteri kartı kaydediliyor...");
    const result = await onSave(customerFormToInput(form));
    if (!result.ok) {
      setSaveState("error");
      setSaveMessage(result.message);
      return;
    }
    onCreated(result.savedId);
    onClose();
  }

  const body = <div className="form-stack customer-create-form">
    <CustomerFormFields form={form} aiEnabled={aiEnabled} onChange={setForm} onAnalyzeIdentity={onAnalyzeIdentity} />
  </div>;

  const footer = <>
    {saveMessage && <p className={"form-status sync-" + saveState} role="status">{saveMessage}</p>}
    <div className="action-row">
      <ActionButton variant="secondary" type="button" disabled={saveState === "loading"} onClick={onClose}>Vazgeç</ActionButton>
      <ActionButton type="submit" disabled={saveState === "loading"}>
        <Save size={16} aria-hidden="true" />{saveState === "loading" ? "Kaydediliyor" : "Müşteri Kartını Kaydet"}
      </ActionButton>
    </div>
  </>;

  return withinWorkspace
    ? <WorkspaceFormOverlay title="Yeni müşteri ekle" onClose={onClose} closeBlocked={saveState === "loading"} onSubmit={submit} footer={footer}>{body}</WorkspaceFormOverlay>
    : <FormDialog title="Yeni müşteri ekle" onClose={onClose} closeBlocked={saveState === "loading"} dismissOnBackdrop onSubmit={submit} footer={footer}>{body}</FormDialog>;
}
