import {
  BUSINESS_CAPABILITIES,
  getBusinessProfile,
  type BusinessCapability
} from "@yardimci-asistan/shared";

const C = BUSINESS_CAPABILITIES;

const CAPABILITY_LABELS: Partial<Record<BusinessCapability, string>> = {
  [C.REQUESTS]: "Talepler",
  [C.ACCOMMODATION_RESERVATIONS]: "Oda rezervasyonları",
  [C.FOOD_RESERVATIONS]: "Masa rezervasyonları",
  [C.QR_MENU]: "QR Menü",
  [C.INVENTORY]: "Stok takibi",
  [C.CUSTOMER_CREDIT]: "Veresiye / Müşteri Hesabı",
  [C.RETAIL_PURCHASING]: "Satın alma",
  [C.RETAIL_SUPPLIERS]: "Tedarikçiler",
  [C.RETAIL_LABELS]: "Etiketler"
};

interface BusinessProfileOptionEditorProps {
  profileId: string;
  selectedCapabilities: BusinessCapability[];
  onChange: (capabilities: BusinessCapability[]) => void;
}

export function BusinessProfileOptionEditor({
  profileId,
  selectedCapabilities,
  onChange
}: BusinessProfileOptionEditorProps) {
  const profile = getBusinessProfile(profileId);
  const selected = new Set(selectedCapabilities);
  const options = profile.optionalCapabilities;

  const setOption = (capability: BusinessCapability, enabled: boolean) => {
    const next = new Set(selected);
    if (enabled) {
      next.add(capability);
    } else {
      next.delete(capability);
    }
    onChange(options.filter((candidate) => next.has(candidate)));
  };

  return (
    <fieldset id="settings-options" tabIndex={-1} className="settings-profile-options">
      <legend>Ek özellikler</legend>
      {options.length === 0 ? (
        <p>Bu sektör için ek özellik bulunmuyor.</p>
      ) : (
        <div className="settings-profile-option-list">
          {options.map((capability) => (
            <label className="settings-profile-option" key={capability}>
              <input
                type="checkbox"
                value={capability}
                checked={selected.has(capability)}
                onChange={(event) => setOption(capability, event.target.checked)}
              />
              <span>{CAPABILITY_LABELS[capability] ?? capability}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
