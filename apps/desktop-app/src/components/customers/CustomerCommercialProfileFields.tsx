import { useEffect } from "react";
import type { CustomerFormState } from "../../app/customer-model";
import { DetailSectionCard } from "../workspace/DetailWorkspaceLayout";

interface CustomerCommercialProfileFieldsProps {
  form: CustomerFormState;
  wholesaleEnabled?: boolean;
  onChange: (form: CustomerFormState) => void;
}

function priceGroupForDealerStatus(
  status: CustomerFormState["commercialDealerStatus"],
  priceGroup: CustomerFormState["commercialPriceGroup"]
): CustomerFormState["commercialPriceGroup"] {
  return status === "active" ? (priceGroup === "retail" ? "dealer_a" : priceGroup) : "retail";
}

export function CustomerCommercialProfileFields({
  form,
  wholesaleEnabled = false,
  onChange
}: CustomerCommercialProfileFieldsProps) {
  // A disabled wholesale feature hides dealer controls without modifying the
  // stored dealer price group during an unrelated company/tax edit.
  const priceGroup = wholesaleEnabled
    ? priceGroupForDealerStatus(form.commercialDealerStatus, form.commercialPriceGroup)
    : form.commercialPriceGroup;

  useEffect(() => {
    if (form.commercialPriceGroup !== priceGroup) {
      onChange({ ...form, commercialPriceGroup: priceGroup });
    }
  }, [form, onChange, priceGroup]);

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
          {wholesaleEnabled && <>
          <label className="form-field form-field--medium">
            Bayi yetkisi
            <select aria-label="Bayi yetkisi" value={form.commercialDealerStatus}
              onChange={event => {
                const status = event.target.value as CustomerFormState["commercialDealerStatus"];
                onChange({ ...form, commercialDealerStatus: status,
                  commercialPriceGroup: priceGroupForDealerStatus(status, form.commercialPriceGroup) });
              }}>
              <option value="inactive">Bayi değil</option>
              <option value="active">Aktif bayi</option>
            </select>
          </label>
          {form.commercialDealerStatus === "active" && <label className="form-field form-field--medium">
            Bayi fiyat grubu
            <select aria-label="Bayi fiyat grubu" value={priceGroup}
              onChange={event => update("commercialPriceGroup", event.target.value as CustomerFormState["commercialPriceGroup"])}>
              <option value="dealer_a">Bayi A</option>
              <option value="dealer_b">Bayi B</option>
            </select>
          </label>}
          </>}
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
