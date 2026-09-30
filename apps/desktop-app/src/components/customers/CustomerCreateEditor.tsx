import { useEffect, useState, type FormEvent } from "react";
import { Plus, Save } from "lucide-react";
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

type SaveState = "idle" | "loading" | "success" | "error";
type SaveMode = "close" | "continue";

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
  const [formRevision, setFormRevision] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    if (!open) return;
    setForm(toCustomerForm(null));
    setFormRevision((revision) => revision + 1);
    setSaveState("idle");
  }, [open]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const mode: SaveMode = submitter instanceof HTMLButtonElement && submitter.value === "continue"
      ? "continue"
      : "close";
    await saveCustomer(mode);
  }

  async function saveCustomer(mode: SaveMode) {
    setSaveState("loading");
    const result = await onSave(customerFormToInput(form));
    if (!result.ok) {
      setSaveState("error");
      return;
    }

    if (mode === "continue") {
      setForm(toCustomerForm(null));
      setFormRevision((revision) => revision + 1);
      setSaveState("success");
      return;
    }

    onCreated(result.savedId);
    onClose();
  }

  const body = <div className="form-stack customer-create-form">
    <CustomerFormFields
      key={formRevision}
      form={form}
      aiEnabled={aiEnabled}
      onChange={setForm}
      onAnalyzeIdentity={onAnalyzeIdentity}
    />
  </div>;

  const footer = <div className="action-row">
      <ActionButton variant="secondary" type="button" disabled={saveState === "loading"} onClick={onClose}>Vazgeç</ActionButton>
      <ActionButton variant="secondary" type="submit" name="saveMode" value="continue" disabled={saveState === "loading"}>
        <Plus size={16} aria-hidden="true" />Kaydet ve Yeni Ekle
      </ActionButton>
      <ActionButton type="submit" name="saveMode" value="close" disabled={saveState === "loading"}>
        <Save size={16} aria-hidden="true" />{saveState === "loading" ? "Kaydediliyor" : "Kaydet"}
      </ActionButton>
    </div>;

  return withinWorkspace
    ? <WorkspaceFormOverlay title="Yeni müşteri ekle" onClose={onClose} closeBlocked={saveState === "loading"} onSubmit={submit} footer={footer}>{body}</WorkspaceFormOverlay>
    : <FormDialog title="Yeni müşteri ekle" onClose={onClose} closeBlocked={saveState === "loading"} dismissOnBackdrop onSubmit={submit} footer={footer}>{body}</FormDialog>;
}
