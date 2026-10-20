import type { CustomerFormState } from "../../app/customer-model";
import { DetailSectionCard } from "../workspace/DetailWorkspaceLayout";

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

  return (
    <DetailSectionCard title="Ticari bilgiler" className="customer-commercial-profile">
      <div className="form-grid">
          <label className="form-field form-field--medium">
            Firma / unvan
            <input
              aria-label="Firma / unvan"
              required
              maxLength={180}
              value={form.commercialCompanyName}
              onChange={(event) => update("commercialCompanyName", event.target.value)}
            />
          </label>
          <label className="form-field form-field--medium">
            Yetkili kişi
            <input
              aria-label="Yetkili kişi"
              maxLength={160}
              value={form.commercialAuthorizedPerson}
              onChange={(event) => update("commercialAuthorizedPerson", event.target.value)}
            />
          </label>
          <label className="form-field form-field--medium">
            Vergi dairesi
            <input
              aria-label="Vergi dairesi"
              maxLength={120}
              value={form.commercialTaxOffice}
              onChange={(event) => update("commercialTaxOffice", event.target.value)}
            />
          </label>
          <label className="form-field form-field--medium">
            Vergi no
            <input
              aria-label="Vergi no"
              maxLength={32}
              value={form.commercialTaxNumber}
              onChange={(event) => update("commercialTaxNumber", event.target.value)}
            />
          </label>
          <label className="form-field form-field--medium">
            Bayi durumu
            <select
              aria-label="Bayi durumu"
              value={form.commercialDealerStatus}
              onChange={(event) => update(
                "commercialDealerStatus",
                event.target.value as CustomerFormState["commercialDealerStatus"]
              )}
            >
              <option value="active">Aktif</option>
              <option value="inactive">Pasif</option>
            </select>
          </label>
          <label className="form-field form-field--medium">
            Fiyat grubu
            <select
              aria-label="Fiyat grubu"
              value={form.commercialPriceGroup}
              onChange={(event) => update(
                "commercialPriceGroup",
                event.target.value as CustomerFormState["commercialPriceGroup"]
              )}
            >
              <option value="retail">Perakende</option>
              <option value="dealer_a">Bayi A</option>
              <option value="dealer_b">Bayi B</option>
            </select>
          </label>
          <label className="form-field form-field--short">
            Ödeme vadesi (gün)
            <input
              aria-label="Ödeme vadesi (gün)"
              type="number"
              min={0}
              max={3650}
              step={1}
              inputMode="numeric"
              value={form.commercialPaymentTermDays}
              onChange={(event) => update("commercialPaymentTermDays", event.target.value)}
            />
          </label>

      </div>
    </DetailSectionCard>
  );
}
