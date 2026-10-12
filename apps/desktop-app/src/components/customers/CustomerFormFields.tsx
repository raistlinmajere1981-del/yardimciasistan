import { useRef, useState } from "react";
import { Camera, Sparkles } from "lucide-react";
import type { DesktopIdentityImageAnalyzeResult } from "../../../electron/database";
import { mergeIdentityImageAnalyses } from "../../app/identity-analysis-merge";
import { primeIdentityCameraFeedback } from "../../app/identity-camera-feedback";
import type { CustomerFormState } from "../../app/customer-model";
import { ActionButton } from "../ui/ActionButton";
import { DatePicker } from "../ui/DateTimePicker";
import { CustomerCommercialProfileFields } from "./CustomerCommercialProfileFields";
import { IdentityCameraCapture } from "./IdentityCameraCapture";
import { DetailSectionCard } from "../workspace/DetailWorkspaceLayout";

type AnalysisState = "idle" | "loading" | "success" | "error";

interface CustomerFormFieldsProps {
  form: CustomerFormState;
  aiEnabled: boolean;
  wholesaleEnabled?: boolean;
  onChange: (form: CustomerFormState) => void;
  onAnalyzeIdentity: (file: File) => Promise<DesktopIdentityImageAnalyzeResult>;
}

export function CustomerFormFields({
  form,
  aiEnabled,
  wholesaleEnabled = false,
  onChange,
  onAnalyzeIdentity
}: CustomerFormFieldsProps) {
  const identityFileRef = useRef<HTMLInputElement>(null);
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [analysisMessage, setAnalysisMessage] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanBackSide, setScanBackSide] = useState(false);

  const update = <K extends keyof CustomerFormState>(field: K, value: CustomerFormState[K]) => {
    onChange({ ...form, [field]: value });
  };

  const updateBirthDate = (value: string) => {
    onChange({
      ...form,
      birthDate: value,
      birthdayMessageEnabled: value ? form.birthdayMessageEnabled : false
    });
  };

  async function analyzeIdentityFiles(files: File[]): Promise<{ ok: boolean; message: string; code?: string }> {
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
        result = await onAnalyzeIdentity(file);
      } catch {
        result = { ok: false, message: "Kimlik görseli okunamadı." };
      }
      if (!result.ok) {
        setAnalysisState("error");
        setAnalysisMessage(result.message);
        return { ok: false, message: result.message, ...(result.code ? { code: result.code } : {}) };
      }
      analyses.push(result.analysis);
    }

    const merged = mergeIdentityImageAnalyses(analyses);
    const fields = merged.fields;
    onChange({
      ...form,
      fullName: fields.full_name || form.fullName,
      identityType: fields.identity_type || form.identityType,
      identityNumber: fields.identity_number || form.identityNumber,
      nationality: fields.nationality || form.nationality,
      birthDate: fields.birth_date || form.birthDate,
      gender: fields.gender || form.gender,
      documentSerialNumber: fields.document_serial_number || form.documentSerialNumber,
      documentExpiryDate: fields.document_expiry_date || form.documentExpiryDate,
      birthPlace: fields.birth_place || form.birthPlace,
      motherName: fields.mother_name || form.motherName,
      fatherName: fields.father_name || form.fatherName,
      issuingAuthority: fields.issuing_authority || form.issuingAuthority,
      address: fields.address || form.address
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
    await analyzeIdentityFiles([file]);
    if (identityFileRef.current) identityFileRef.current.value = "";
  }

  return (
    <>
      <DetailSectionCard title="Temel bilgiler">
        <div className="form-grid">
          <label className="form-field form-field--medium">Ad soyad<input required maxLength={160} value={form.fullName} onChange={(event) => update("fullName", event.target.value)} /></label>
          <label className="form-field form-field--short">Telefon<input inputMode="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+90 5xx… / +44…" /></label>
          <label className="form-field form-field--medium">E-posta<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></label>
          <label className="form-field form-field--medium">Etiketler<input value={form.tags} onChange={(event) => update("tags", event.target.value)} placeholder="düzenli müşteri, özel not" /></label>
        </div>
      </DetailSectionCard>

      <DetailSectionCard title="Notlar ve adres">
        <div className="form-grid">
          <label className="form-field form-field--fluid customer-note-field">Not<textarea aria-label="Not" rows={2} value={form.notes} onChange={(event) => update("notes", event.target.value)} /></label>
          <label className="form-field form-field--fluid customer-address-field">Adres<textarea aria-label="Adres" rows={2} value={form.address} onChange={(event) => update("address", event.target.value)} /></label>
        </div>
      </DetailSectionCard>

      {wholesaleEnabled && (
        <CustomerCommercialProfileFields form={form} onChange={onChange} />
      )}

      <DetailSectionCard title="Kimlik kartı bilgileri" className="identity-form-section" actions={
          <div className="action-row identity-scan-actions">
            <input ref={identityFileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void analyzeSelectedIdentity(event.target.files?.[0])} />
            <label className="form-check identity-back-side-toggle">
              <input
                checked={scanBackSide}
                disabled={!aiEnabled || analysisState === "loading"}
                onChange={(event) => setScanBackSide(event.target.checked)}
                type="checkbox"
              />
              <strong>Ön/arka</strong>
            </label>
            <ActionButton variant="secondary" size="sm" type="button" disabled={!aiEnabled || analysisState === "loading"} onClick={() => { primeIdentityCameraFeedback(); setCameraOpen(true); }}>
              <Camera size={15} aria-hidden="true" />
              Kimliği kameradan tara
            </ActionButton>
            <ActionButton variant="secondary" size="sm" type="button" disabled={!aiEnabled || analysisState === "loading"} onClick={() => identityFileRef.current?.click()}>
              <Sparkles size={15} aria-hidden="true" />
              {analysisState === "loading" ? "Okunuyor" : "Dosyadan AI ile Doldur"}
            </ActionButton>
          </div>
      }>
        <div className="form-grid">
          <label className="form-field form-field--medium">Belge türü<select value={form.identityType} onChange={(event) => update("identityType", event.target.value)}>
            <option value="">Seçilmedi</option><option value="tc_identity_card">T.C. Kimlik Kartı</option><option value="passport">Pasaport</option><option value="other">Diğer</option>
          </select></label>
          <label className="form-field form-field--medium">Kimlik / pasaport no<input value={form.identityNumber} onChange={(event) => update("identityNumber", event.target.value)} /></label>
          <label className="form-field form-field--medium">Uyruk<input value={form.nationality} onChange={(event) => update("nationality", event.target.value)} /></label>
          <div className="form-field form-field--fluid customer-birth-field">
            <span>Doğum tarihi</span>
            <div className="customer-birth-controls">
              <DatePicker ariaLabel="Doğum tarihi" value={form.birthDate} presets={[]} onChange={updateBirthDate} />
              <label className="form-check customer-birthday-toggle">
                <input
                  checked={Boolean(form.birthDate) && form.birthdayMessageEnabled}
                  disabled={!form.birthDate}
                  onChange={(event) => update("birthdayMessageEnabled", event.target.checked)}
                  type="checkbox"
                />
                <strong>Mesaj gönder</strong>
              </label>
            </div>
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
        {analysisMessage && <p className={"form-status sync-" + analysisState} role={analysisState === "error" ? "alert" : "status"}>{analysisMessage}</p>}
      </DetailSectionCard>

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
