import type { CustomerFormState } from "../../app/customer-model";

interface CustomerCommercialProfileFieldsProps {
  form: CustomerFormState;
  onChange: (form: CustomerFormState) => void;
}

export function CustomerCommercialProfileFields({
  form,
  onChange
}: CustomerCommercialProfileFieldsProps) {
  const update = <K extends keyof CustomerFormState>(field: K, value: CustomerFormState[K]) => {
    onChange({ ...form, [field]: value });
  };

  const toggleProfile = (enabled: boolean) => {
    onChange({
      ...form,
      commercialProfileEnabled: enabled,
      commercialCompanyName: enabled && !form.commercialCompanyName
        ? form.fullName
        : form.commercialCompanyName,
      commercialAuthorizedPerson: enabled && !form.commercialAuthorizedPerson
        ? form.fullName
        : form.commercialAuthorizedPerson
    });
  };

  return (
    <section className="panel form-stack customer-commercial-profile">
      <div className="page-toolbar">
        <div className="page-toolbar__copy">
          <strong>Ticari bilgiler</strong>
        </div>
        <label className="form-check">
          <input
            type="checkbox"
            checked={form.commercialProfileEnabled}
            onChange={(event) => toggleProfile(event.target.checked)}
          />
          <strong>Ticari / bayi müşterisi</strong>
        </label>
      </div>

      {form.commercialProfileEnabled && (
        <div className="form-grid">
          <label className="form-field form-field--medium">
            Firma / unvan
            <input
              required
              maxLength={180}
              value={form.commercialCompanyName}
              onChange={(event) => update("commercialCompanyName", event.target.value)}
            />
          </label>
          <label className="form-field form-field--medium">
            Yetkili kişi
            <input
              maxLength={160}
              value={form.commercialAuthorizedPerson}
              onChange={(event) => update("commercialAuthorizedPerson", event.target.value)}
            />
          </label>
          <label className="form-field form-field--medium">
            Vergi dairesi
            <input
              maxLength={120}
              value={form.commercialTaxOffice}
              onChange={(event) => update("commercialTaxOffice", event.target.value)}
            />
          </label>
          <label className="form-field form-field--medium">
            Vergi no
            <input
              maxLength={32}
              value={form.commercialTaxNumber}
              onChange={(event) => update("commercialTaxNumber", event.target.value)}
            />
          </label>
          <label className="form-field form-field--medium">
            Bayi durumu
            <select
              value={form.commercialDealerStatus}
              onChange={(event) => update(
                "commercialDealerStatus",
                event.target.value as CustomerFormState["commercialDealerStatus"]
              )}
            >
              <option value="candidate">Aday</option>
              <option value="active">Aktif</option>
              <option value="inactive">Pasif</option>
            </select>
          </label>
          <label className="form-field form-field--short">
            Ödeme vadesi (gün)
            <input
              type="number"
              min={0}
              max={3650}
              step={1}
              inputMode="numeric"
              value={form.commercialPaymentTermDays}
              onChange={(event) => update("commercialPaymentTermDays", event.target.value)}
            />
          </label>
          <label className="form-field form-field--fluid">
            Ticari not
            <textarea
              rows={2}
              maxLength={2000}
              value={form.commercialNotes}
              onChange={(event) => update("commercialNotes", event.target.value)}
            />
          </label>
        </div>
      )}
    </section>
  );
}
