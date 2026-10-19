import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
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
  wholesaleEnabled?: boolean;
  withinWorkspace?: boolean;
  onClose: () => void;
  onSave: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  onAnalyzeIdentity: (file: File, isCurrent?: () => boolean) => Promise<DesktopIdentityImageAnalyzeResult>;
  onCreated?: (customerId: string) => void;
}

export function CustomerCreateEditor({
  open,
  aiEnabled,
  wholesaleEnabled = false,
  withinWorkspace = false,
  onClose,
  onSave,
  onAnalyzeIdentity,
  onCreated
}: CustomerCreateEditorProps) {
  const [form, setForm] = useState<CustomerFormState>(() => toCustomerForm(null));
  const [formRevision, setFormRevision] = useState(0);
  const formGeneration = useRef(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useLayoutEffect(() => {
    formGeneration.current++;
    if (!open) return;
    setForm(toCustomerForm(null));
    setFormRevision(formGeneration.current);
    setSaveState("idle");
  }, [open]);

  if (!open) return null;

  function closeForm() {
    formGeneration.current++;
    onClose();
  }

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
    const result = await onSave(customerFormToInput(form, wholesaleEnabled));
    if (!result.ok) {
      setSaveState("error");
      return;
    }

    if (mode === "continue") {
      setFormRevision(++formGeneration.current);
      setForm(toCustomerForm(null));
      setSaveState("success");
      return;
    }

    onCreated?.(result.savedId);
    closeForm();
  }

  const body = <div className="form-stack customer-create-form">
    <CustomerFormFields
      key={formRevision}
      form={form}
      aiEnabled={aiEnabled}
      wholesaleEnabled={wholesaleEnabled}
      onChange={setForm}
      isFormCurrent={() => formGeneration.current === formRevision}
      onAnalyzeIdentity={onAnalyzeIdentity}
    />
  </div>;

  const footer = <div className="action-row">
      <ActionButton variant="secondary" type="button" disabled={saveState === "loading"} onClick={closeForm}>Vazgeç</ActionButton>
      <ActionButton variant="secondary" type="submit" name="saveMode" value="continue" disabled={saveState === "loading"}>
        <Plus size={16} aria-hidden="true" />Kaydet ve Yeni Ekle
      </ActionButton>
      <ActionButton type="submit" name="saveMode" value="close" disabled={saveState === "loading"}>
        <Save size={16} aria-hidden="true" />{saveState === "loading" ? "Kaydediliyor" : "Kaydet"}
      </ActionButton>
    </div>;

  return withinWorkspace
    ? <WorkspaceFormOverlay title="Yeni müşteri ekle" onClose={closeForm} closeBlocked={saveState === "loading"} onSubmit={(event) => void submit(event)} footer={footer}>{body}</WorkspaceFormOverlay>
    : <FormDialog title="Yeni müşteri ekle" onClose={closeForm} closeBlocked={saveState === "loading"} dismissOnBackdrop onSubmit={(event) => void submit(event)} footer={footer}>{body}</FormDialog>;
}
