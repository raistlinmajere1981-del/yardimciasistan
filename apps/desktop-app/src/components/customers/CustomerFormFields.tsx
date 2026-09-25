import { useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { DesktopIdentityImageAnalyzeResult } from "../../../electron/database";
import type { CustomerFormState } from "../../app/customer-model";
import { ActionButton } from "../ui/ActionButton";
import { DatePicker } from "../ui/DateTimePicker";

type AnalysisState = "idle" | "loading" | "success" | "error";

interface CustomerFormFieldsProps {
  form: CustomerFormState;
  aiEnabled: boolean;
  onChange: (form: CustomerFormState) => void;
  onAnalyzeIdentity: (file: File) => Promise<DesktopIdentityImageAnalyzeResult>;
}

export function CustomerFormFields({ form, aiEnabled, onChange, onAnalyzeIdentity }: CustomerFormFieldsProps) {
  const identityFileRef = useRef<HTMLInputElement>(null);
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [analysisMessage, setAnalysisMessage] = useState("");

  const update = <K extends keyof CustomerFormState>(field: K, value: CustomerFormState[K]) => {
    onChange({ ...form, [field]: value });
  };

  async function analyzeIdentity(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setAnalysisState("error");
      setAnalysisMessage("JPG, PNG veya WebP biçiminde bir kimlik görseli seçin.");
      if (identityFileRef.current) identityFileRef.current.value = "";
      return;
    }
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
      setAnalysisState("error");
      setAnalysisMessage("Kimlik görseli boş olamaz ve en fazla 10 MB olabilir.");
      if (identityFileRef.current) identityFileRef.current.value = "";
      return;
    }

    setAnalysisState("loading");
    setAnalysisMessage("Kimlik görseli AI ile okunuyor...");
    let result: DesktopIdentityImageAnalyzeResult;
    try {
      result = await onAnalyzeIdentity(file);
    } catch {
      result = { ok: false, message: "Kimlik görseli okunamadı." };
    }
    if (identityFileRef.current) identityFileRef.current.value = "";

    if (!result.ok) {
      setAnalysisState("error");
      setAnalysisMessage(result.message);
      return;
    }

    const fields = result.analysis.fields;
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
    setAnalysisState("success");
    setAnalysisMessage(
      result.analysis.warnings.length > 0
        ? result.message + " Kontrol: " + result.analysis.warnings.join(" ")
        : result.message
    );
  }

  return (
    <>
      <section className="panel form-stack">
        <div className="page-toolbar">
          <div className="page-toolbar__copy">
            <strong>Temel bilgiler</strong>
            <small>İletişim ve kart görünümü</small>
          </div>
        </div>
        <div className="form-grid">
          <label className="form-field form-field--medium">Ad soyad<input required maxLength={160} value={form.fullName} onChange={(event) => update("fullName", event.target.value)} /></label>
          <label className="form-field form-field--short">Telefon<input inputMode="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+90 5xx… / +44…" /></label>
          <label className="form-field form-field--medium">E-posta<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></label>
          <label className="form-field form-field--medium">Etiketler<input value={form.tags} onChange={(event) => update("tags", event.target.value)} placeholder="düzenli müşteri, özel not" /></label>
          <label className="form-field--span form-field form-field--fluid">Not<input value={form.notes} onChange={(event) => update("notes", event.target.value)} /></label>
        </div>
        <label className="form-check customer-birthday-toggle">
          <input checked={form.birthdayMessageEnabled} onChange={(event) => update("birthdayMessageEnabled", event.target.checked)} type="checkbox" />
          <strong>Doğum günü mesajı gönder</strong>
        </label>
      </section>

      <section className="panel form-stack identity-form-section">
        <div className="page-toolbar">
          <div className="page-toolbar__copy">
            <strong>Kimlik kartı bilgileri</strong>
          </div>
          <div className="action-row">
            <input ref={identityFileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void analyzeIdentity(event.target.files?.[0])} />
            <ActionButton variant="secondary" size="sm" type="button" disabled={!aiEnabled || analysisState === "loading"} onClick={() => identityFileRef.current?.click()}>
              <Sparkles size={15} aria-hidden="true" />
              {analysisState === "loading" ? "Okunuyor" : "Kimlikten AI ile Doldur"}
            </ActionButton>
          </div>
        </div>
        {!aiEnabled && <p className="identity-ai-note">Kimlik görseli analizi için Ayarlar bölümünden AI bağlantısını etkinleştirin.</p>}
        <div className="form-grid">
          <label className="form-field form-field--medium">Belge türü<select value={form.identityType} onChange={(event) => update("identityType", event.target.value)}>
            <option value="">Seçilmedi</option><option value="tc_identity_card">T.C. Kimlik Kartı</option><option value="passport">Pasaport</option><option value="other">Diğer</option>
          </select></label>
          <label className="form-field form-field--medium">Kimlik / pasaport no<input value={form.identityNumber} onChange={(event) => update("identityNumber", event.target.value)} /></label>
          <label className="form-field form-field--medium">Uyruk<input value={form.nationality} onChange={(event) => update("nationality", event.target.value)} /></label>
          <div className="form-field form-field--short"><span>Doğum tarihi</span><DatePicker ariaLabel="Doğum tarihi" value={form.birthDate} presets={[]} onChange={(value) => update("birthDate", value)} /></div>
          <label className="form-field form-field--medium">Cinsiyet<select value={form.gender} onChange={(event) => update("gender", event.target.value)}>
            <option value="">Seçilmedi</option><option value="female">Kadın</option><option value="male">Erkek</option><option value="unspecified">Belirtilmemiş</option>
          </select></label>
          <label className="form-field form-field--medium">Seri / belge no<input value={form.documentSerialNumber} onChange={(event) => update("documentSerialNumber", event.target.value)} /></label>
          <div className="form-field form-field--short"><span>Son geçerlilik</span><DatePicker ariaLabel="Son geçerlilik" value={form.documentExpiryDate} presets={[]} onChange={(value) => update("documentExpiryDate", value)} /></div>
          <label className="form-field form-field--medium">Doğum yeri<input value={form.birthPlace} onChange={(event) => update("birthPlace", event.target.value)} /></label>
          <label className="form-field form-field--medium">Anne adı<input value={form.motherName} onChange={(event) => update("motherName", event.target.value)} /></label>
          <label className="form-field form-field--medium">Baba adı<input value={form.fatherName} onChange={(event) => update("fatherName", event.target.value)} /></label>
          <label className="form-field form-field--medium">Veren makam<input value={form.issuingAuthority} onChange={(event) => update("issuingAuthority", event.target.value)} /></label>
          <label className="form-field--span form-field form-field--fluid">Adres<textarea value={form.address} onChange={(event) => update("address", event.target.value)} /></label>
        </div>
        {analysisMessage && <p className={"form-status sync-" + analysisState} role={analysisState === "error" ? "alert" : "status"}>{analysisMessage}</p>}
      </section>
    </>
  );
}
