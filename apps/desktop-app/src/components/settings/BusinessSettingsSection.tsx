import { getBusinessProfiles } from "@yardimci-asistan/shared";
import type { SetupFormState } from "../../app/setup-model";
import type { SetupFieldsProps } from "./setup-fields";
import { BusinessProfileOptionEditor } from "./BusinessCapabilitySettings";

export function BusinessSettingsSection({ form, onFormChange, persistedProfileId }: SetupFieldsProps & { persistedProfileId: string }) {
  const profileChanged = form.profileId !== persistedProfileId;
  const update = <Key extends keyof SetupFormState,>(key: Key, value: SetupFormState[Key]) => {
    onFormChange({ ...form, [key]: value });
  };

  return (
        <section id="settings-business" tabIndex={-1} className="setup-section settings-panel settings-identity-section">
          <div className="settings-panel-header">
            <div>
              <h2>İşletme Bilgileri</h2>
            </div>
          </div>
          <div className="settings-panel-body">
          <div className="form-row">
            <label className="form-field form-field--long">
              Firma adı
            <input value={form.businessName} onChange={(event) => update("businessName", event.target.value)} placeholder="İşletme adı" />
            </label>
            <label className="form-field form-field--medium">
              Sektör tipi
              <select value={form.profileId} onChange={(event) => update("profileId", event.target.value)}>
                {getBusinessProfiles().map((profile) => (
                  <option value={profile.id} key={profile.id}>{profile.label}</option>
                ))}
              </select>
            </label>
            <BusinessProfileOptionEditor
              profileId={form.profileId}
              selectedCapabilities={form.profileOptions}
              disabled={profileChanged}
              onChange={(profileOptions) => update("profileOptions", profileOptions)}
            />
            {profileChanged && <p className="settings-profile-transition-warning" role="status">
              İşletme tipi değiştirildi. Kaydettiğinizde yeni işletme tipinin varsayılan özellikleri uygulanacak.
            </p>}
          </div>
          <div className="form-row">
            <label className="form-field form-field--short">
              Telefon
              <input value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+90 5xx xxx xx xx" />
            </label>
            <label className="form-field form-field--short">
              WhatsApp
              <input value={form.whatsapp} onChange={(event) => update("whatsapp", event.target.value)} placeholder="+90 5xx xxx xx xx" />
            </label>
            <label className="form-field form-field--medium">
              E-posta
              <input value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="info@firma.com" />
            </label>
          </div>
          <div className="form-row">
            <label className="form-field form-field--long">
              Adres
              <input value={form.address} onChange={(event) => update("address", event.target.value)} placeholder="İşletme adresi" />
            </label>
          </div>
          </div>
        </section>

  );
}
