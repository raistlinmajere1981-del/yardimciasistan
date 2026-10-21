import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Camera, Sparkles } from "lucide-react";
import { createPortal } from "react-dom";
import type { DesktopIdentityImageAnalyzeResult } from "../../../electron/database";
import { mergeIdentityImageAnalyses } from "../../app/identity-analysis-merge";
import { primeIdentityCameraFeedback } from "../../app/identity-camera-feedback";
import type { CustomerFormState } from "../../app/customer-model";
import { ActionButton } from "../ui/ActionButton";
import { PhoneInput } from "../ui/PhoneInput";
import { DatePicker } from "../ui/DateTimePicker";
import { CustomerCommercialProfileFields } from "./CustomerCommercialProfileFields";
import { IdentityCameraCapture } from "./IdentityCameraCapture";
import { DetailSectionCard } from "../workspace/DetailWorkspaceLayout";
import { useRequestGeneration } from "../workspace/use-request-generation";

type AnalysisState = "idle" | "loading" | "success" | "error";

const IDENTITY_FORM_FIELDS = {
  fullName: "full_name", identityType: "identity_type", identityNumber: "identity_number",
  nationality: "nationality", birthDate: "birth_date", gender: "gender",
  documentSerialNumber: "document_serial_number", documentExpiryDate: "document_expiry_date",
  birthPlace: "birth_place", motherName: "mother_name", fatherName: "father_name",
  issuingAuthority: "issuing_authority", address: "address"
} as const;
type IdentityFormField = keyof typeof IDENTITY_FORM_FIELDS;
const supersededAnalysis = () => ({
  ok: false, code: "analysis_superseded", message: "Kimlik analizi bu form için artık geçerli değil."
});

interface CustomerFormFieldsProps {
  form: CustomerFormState;
  aiEnabled: boolean;
  wholesaleEnabled?: boolean;
  identityExpanded?: boolean;
  identityActionsTarget: HTMLDivElement | null;
  identityActionsDisabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onChange: Dispatch<SetStateAction<CustomerFormState>>;
  isFormCurrent: () => boolean;
  onAnalyzeIdentity: (file: File, isCurrent?: () => boolean) => Promise<DesktopIdentityImageAnalyzeResult>;
}

export function CustomerFormFields({
  form,
  aiEnabled,
  wholesaleEnabled = false,
  identityExpanded = true,
  identityActionsTarget,
  identityActionsDisabled = false,
  onBusyChange,
  onChange,
  isFormCurrent,
  onAnalyzeIdentity
}: CustomerFormFieldsProps) {
  const [identityOpen, setIdentityOpen] = useState(identityExpanded);
  const identityFileRef = useRef<HTMLInputElement>(null);
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [analysisMessage, setAnalysisMessage] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanBackSide, setScanBackSide] = useState(false);
  const beginAnalysis = useRequestGeneration();
  useEffect(() => { onBusyChange?.(analysisState === "loading" || cameraOpen); }, [analysisState, cameraOpen, onBusyChange]);
  const mounted = useRef(false);
  const fieldEdits = useRef<Partial<Record<keyof CustomerFormState, number>>>({});
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const update = <K extends keyof CustomerFormState>(field: K, value: CustomerFormState[K]) => {
    fieldEdits.current[field] = (fieldEdits.current[field] ?? 0) + 1;
    onChange(current => ({ ...current, [field]: value }));
  };

  const updateCommercialProfile = (enabled: boolean) => {
    onChange(current => ({
      ...current,
      commercialProfileEnabled: enabled,
      commercialCompanyName: enabled && !current.commercialCompanyName
        ? current.fullName : current.commercialCompanyName,
      commercialAuthorizedPerson: enabled && !current.commercialAuthorizedPerson
        ? current.fullName : current.commercialAuthorizedPerson
    }));
  };

  const updateBirthDate = (value: string) => {
    fieldEdits.current.birthDate = (fieldEdits.current.birthDate ?? 0) + 1;
    onChange(current => ({
      ...current,
      birthDate: value,
      birthdayMessageEnabled: value ? current.birthdayMessageEnabled : false
    }));
  };

  async function analyzeIdentityFiles(files: File[]): Promise<{ ok: boolean; message: string; code?: string }> {
    // A callback retained by camera/file work cannot start again after its form expires.
    if (!mounted.current || !isFormCurrent()) return supersededAnalysis();
    const requestIsCurrent = beginAnalysis();
    const isCurrent = () => mounted.current && isFormCurrent() && requestIsCurrent();
    const baseline = form;
    const editsAtStart = { ...fieldEdits.current };
    if (!aiEnabled) {
      const message = "Kimlik görseli analizi için AI bağlantısını etkinleştirin.";
      setAnalysisState("error");
      setAnalysisMessage(message);
      return { ok: false, message };
    }
    if (files.length === 0) {
      return { ok: false, message: "Kimlik görseli alınamadı." };
    }

    for (const file of files) {
      const validationMessage = validateIdentityFile(file);
      if (validationMessage) {
        setAnalysisState("error");
        setAnalysisMessage(validationMessage);
        return { ok: false, message: validationMessage };
      }
    }

    setAnalysisState("loading");
    setAnalysisMessage(files.length > 1 ? "Kimliğin ön ve arka yüzü AI ile okunuyor..." : "Kimlik görseli AI ile okunuyor...");

    const analyses = [];
    for (const file of files) {
      let result: DesktopIdentityImageAnalyzeResult;
      try {
        result = await onAnalyzeIdentity(file, isCurrent);
      } catch {
        result = { ok: false, message: "Kimlik görseli okunamadı." };
      }
      if (!isCurrent()) return supersededAnalysis();
      if (!result.ok) {
        setAnalysisState("error");
        setAnalysisMessage(result.message);
        return { ok: false, message: result.message, ...(result.code ? { code: result.code } : {}) };
      }
      analyses.push(result.analysis);
    }

    const merged = mergeIdentityImageAnalyses(analyses);
    const fields = merged.fields;
    onChange(current => {
      // Recheck at the actual state update, including a reset queued in the same turn.
      if (!isCurrent() || current.id !== baseline.id) return current;
      const next = { ...current };
      for (const field of Object.keys(IDENTITY_FORM_FIELDS) as IdentityFormField[]) {
        const value = fields[IDENTITY_FORM_FIELDS[field]];
        if (value && fieldEdits.current[field] === editsAtStart[field] && current[field] === baseline[field]) {
          next[field] = value;
        }
      }
      return next;
    });

    const baseMessage = files.length > 1
      ? "Kimliğin ön ve arka yüzü okundu. Kaydetmeden önce bilgileri kontrol edin."
      : "Kimlik alanları okundu. Kaydetmeden önce bilgileri kontrol edin.";
    const message = merged.warnings.length > 0
      ? baseMessage + " Kontrol: " + merged.warnings.join(" ")
      : baseMessage;
    setAnalysisState("success");
    setAnalysisMessage(message);
    return { ok: true, message };
  }

  async function analyzeSelectedIdentity(file: File | undefined) {
    if (!file) return;
    const input = identityFileRef.current;
    const result = await analyzeIdentityFiles([file]);
    if (result.code !== "analysis_superseded" && input && identityFileRef.current === input) input.value = "";
  }

  return (
    <>
      <DetailSectionCard title="Temel bilgiler">
        <div className="form-grid form-grid--compact">
          <label className="form-field form-field--medium">Ad soyad<input required maxLength={160} value={form.fullName} onChange={(event) => update("fullName", event.target.value)} /></label>
          <label className="form-field form-field--short">Telefon<PhoneInput value={form.phone} onChange={(value) => update("phone", value)} placeholder="+90 5xx… / +44…" /></label>
          <label className="form-field form-field--medium">E-posta<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></label>
          <label className="form-field form-field--medium customer-note-field">Not<textarea aria-label="Not" rows={1} value={form.notes} onChange={(event) => update("notes", event.target.value)} /></label>
          <label className="form-field form-field--fluid form-field--span customer-address-field">Adres<textarea aria-label="Adres" rows={1} value={form.address} onChange={(event) => update("address", event.target.value)} /></label>
        </div>
      </DetailSectionCard>

      {wholesaleEnabled && form.commercialProfileEnabled && (
        <CustomerCommercialProfileFields form={form} onChange={onChange} />
      )}

      <input ref={identityFileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void analyzeSelectedIdentity(event.target.files?.[0])} />
      {identityActionsTarget && createPortal(
        <div className="customer-identity-quick-actions">
          <div className="customer-identity-quick-actions__row">
            <label className="form-check identity-back-side-toggle">
              <input
                checked={scanBackSide}
                disabled={!aiEnabled || identityActionsDisabled || analysisState === "loading"}
                onChange={(event) => setScanBackSide(event.target.checked)}
                type="checkbox"
              />
              <strong>Ön/arka</strong>
            </label>
            <ActionButton className="customer-identity-camera-button" aria-label="Kimliği kameradan tara" variant="secondary" size="sm" type="button" disabled={!aiEnabled || identityActionsDisabled || analysisState === "loading"} onClick={() => { primeIdentityCameraFeedback(); setCameraOpen(true); }}>
              <Camera size={15} aria-hidden="true" />Kameradan tara
            </ActionButton>
          </div>
          <ActionButton className="customer-identity-file-button" variant="secondary" size="sm" type="button" disabled={!aiEnabled || identityActionsDisabled || analysisState === "loading"} onClick={() => identityFileRef.current?.click()}>
            <Sparkles size={15} aria-hidden="true" />{analysisState === "loading" ? "Okunuyor" : "Dosyadan AI ile Doldur"}
          </ActionButton>
          <div className="customer-identity-quick-actions__flags">
            {wholesaleEnabled && <label className="form-check">
              <input
                type="checkbox"
                checked={form.commercialProfileEnabled}
                disabled={identityActionsDisabled}
                onChange={event => updateCommercialProfile(event.target.checked)}
              />
              <strong>Ticari / bayi müşterisi</strong>
            </label>}
            <label className="form-check customer-birthday-toggle">
              <input
                type="checkbox"
                checked={Boolean(form.birthDate) && form.birthdayMessageEnabled}
                disabled={!form.birthDate || identityActionsDisabled}
                onChange={event => update("birthdayMessageEnabled", event.target.checked)}
              />
              <strong>Mesaj gönder</strong>
            </label>
          </div>
          {analysisMessage && <p className={"form-status sync-" + analysisState} role={analysisState === "error" ? "alert" : "status"}>{analysisMessage}</p>}
        </div>,
        identityActionsTarget
      )}

      <details className="customer-identity-details" open={identityOpen} onToggle={event => setIdentityOpen(event.currentTarget.open)}>
      <summary>Kimlik bilgileri</summary>
      <DetailSectionCard title="Kimlik kartı bilgileri" className="identity-form-section">
        <div className="form-grid form-grid--compact">
          <label className="form-field form-field--medium">Belge türü<select value={form.identityType} onChange={(event) => update("identityType", event.target.value)}>
            <option value="">Seçilmedi</option><option value="tc_identity_card">T.C. Kimlik Kartı</option><option value="passport">Pasaport</option><option value="other">Diğer</option>
          </select></label>
          <label className="form-field form-field--medium">Kimlik / pasaport no<input value={form.identityNumber} onChange={(event) => update("identityNumber", event.target.value)} /></label>
          <label className="form-field form-field--medium">Uyruk<input value={form.nationality} onChange={(event) => update("nationality", event.target.value)} /></label>
          <div className="form-field form-field--short customer-birth-field">
            <span>Doğum tarihi</span>
            <DatePicker ariaLabel="Doğum tarihi" value={form.birthDate} presets={[]} onChange={updateBirthDate} />
          </div>
          <label className="form-field form-field--medium">Cinsiyet<select value={form.gender} onChange={(event) => update("gender", event.target.value)}>
            <option value="">Seçilmedi</option><option value="female">Kadın</option><option value="male">Erkek</option><option value="unspecified">Belirtilmemiş</option>
          </select></label>
          <label className="form-field form-field--medium">Seri / belge no<input value={form.documentSerialNumber} onChange={(event) => update("documentSerialNumber", event.target.value)} /></label>
          <div className="form-field form-field--short"><span>Son geçerlilik</span><DatePicker ariaLabel="Son geçerlilik" value={form.documentExpiryDate} presets={[]} onChange={(value) => update("documentExpiryDate", value)} /></div>
          <label className="form-field form-field--medium">Doğum yeri<input value={form.birthPlace} onChange={(event) => update("birthPlace", event.target.value)} /></label>
          <label className="form-field form-field--medium">Anne adı<input value={form.motherName} onChange={(event) => update("motherName", event.target.value)} /></label>
          <label className="form-field form-field--medium">Baba adı<input value={form.fatherName} onChange={(event) => update("fatherName", event.target.value)} /></label>
          <label className="form-field form-field--medium">Veren makam<input value={form.issuingAuthority} onChange={(event) => update("issuingAuthority", event.target.value)} /></label>
        </div>
      </DetailSectionCard>

      </details>

      {cameraOpen && <IdentityCameraCapture
        captureBackSide={scanBackSide}
        onClose={() => setCameraOpen(false)}
        onCaptured={analyzeIdentityFiles}
      />}
    </>
  );
}

function validateIdentityFile(file: File): string {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return "JPG, PNG veya WebP biçiminde bir kimlik görseli seçin.";
  }
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
    return "Kimlik görseli boş olamaz ve en fazla 10 MB olabilir.";
  }
  return "";
}
