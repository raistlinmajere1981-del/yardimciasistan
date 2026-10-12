import {
  BUSINESS_CAPABILITIES,
  getBusinessProfile,
  getEnabledBusinessCapabilityDependents,
  toggleBusinessProfileOption,
  type BusinessCapability
} from "@yardimci-asistan/shared";

const C = BUSINESS_CAPABILITIES;

const CAPABILITY_LABELS: Partial<Record<BusinessCapability, string>> = {
  [C.REQUESTS]: "Talepler",
  [C.MARKETING_STUDIO]: "Pazarlama",
  [C.MESSAGING_CAMPAIGNS]: "WhatsApp / SMS Kampanyaları",
  [C.ACCOMMODATION_RESERVATIONS]: "Oda rezervasyonları",
  [C.FOOD_RESERVATIONS]: "Masa rezervasyonları",
  [C.QR_MENU]: "QR Menü",
  [C.INVENTORY]: "Stok takibi",
  [C.CUSTOMER_CREDIT]: "Veresiye / Müşteri Hesabı",
  [C.ONLINE_SALES]: "Online Satış",
  [C.WHOLESALE]: "Bayi / Toptan Satış",
  [C.RETAIL_PURCHASING]: "Satın alma",
  [C.RETAIL_SUPPLIERS]: "Tedarikçiler",
  [C.RETAIL_LABELS]: "Etiketler"
};

interface BusinessProfileOptionEditorProps {
  profileId: string;
  selectedCapabilities: BusinessCapability[];
  onChange: (capabilities: BusinessCapability[]) => void;
  disabled?: boolean;
}

export function BusinessProfileOptionEditor({
  profileId,
  selectedCapabilities,
  onChange,
  disabled = false
}: BusinessProfileOptionEditorProps) {
  const profile = getBusinessProfile(profileId);
  const options = profile.optionalCapabilities;
  // Expose user-visible prerequisites as checked and locked instead of hiding them.
  const visiblePrerequisites = new Set<BusinessCapability>([C.MARKETING_STUDIO, C.RETAIL_PURCHASING]);
  const independentOptions = options.filter(capability =>
    visiblePrerequisites.has(capability) || getEnabledBusinessCapabilityDependents(capability, selectedCapabilities).length === 0);
  const requiredPrerequisites = new Set([...visiblePrerequisites].filter(capability =>
    getEnabledBusinessCapabilityDependents(capability, selectedCapabilities).length > 0));

  return (
    <fieldset id="settings-options" tabIndex={-1} className="settings-profile-options" disabled={disabled}>
      <legend>Ek özellikler</legend>
      {options.length === 0 ? (
        <p>Bu sektör için ek özellik bulunmuyor.</p>
      ) : (
        <div className="settings-profile-option-list">
          {independentOptions.map((capability) => (
            <label className="settings-profile-option" key={capability}>
              <input
                type="checkbox"
                aria-label={CAPABILITY_LABELS[capability] ?? capability}
                value={capability}
                checked={selectedCapabilities.includes(capability) || requiredPrerequisites.has(capability)}
                disabled={requiredPrerequisites.has(capability)}
                onChange={(event) => onChange(toggleBusinessProfileOption(profileId, selectedCapabilities, capability, event.target.checked))}
              />
              <span>{CAPABILITY_LABELS[capability] ?? capability}</span>
              {capability !== C.MESSAGING_CAMPAIGNS && selectedCapabilities.includes(capability) && options.some(option =>
                !visiblePrerequisites.has(option) && getEnabledBusinessCapabilityDependents(option, [capability]).length > 0) && (
                <small>{options.filter(option => !visiblePrerequisites.has(option) && getEnabledBusinessCapabilityDependents(option, [capability]).length > 0)
                  .map(option => CAPABILITY_LABELS[option]).join(", ")} dahil</small>
              )}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
