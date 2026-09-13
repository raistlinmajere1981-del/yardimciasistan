import {
  BUSINESS_CAPABILITIES,
  getBusinessCapabilityDependencies,
  getBusinessProfile,
  getEnabledBusinessCapabilityDependents,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../../electron/business-capability-store";
import type { SyncState } from "../../app/runtime-state";

const C = BUSINESS_CAPABILITIES;

const CAPABILITY_LABELS: Readonly<Record<BusinessCapability, string>> = {
  [C.CUSTOMERS]: "Müşteriler",
  [C.TASKS]: "Günlük işler",
  [C.CALENDAR]: "Takvim",
  [C.NOTIFICATIONS]: "Bildirimler",
  [C.FINANCE]: "Kasa / Finans",
  [C.REPORTS]: "Raporlar",
  [C.WEB]: "Web",
  [C.SYNC]: "Senkron",
  [C.BACKUPS]: "Yedekleme",
  [C.DEVICES]: "Cihazlar",
  [C.WHATSAPP]: "WhatsApp",
  [C.AI]: "AI Yardımcı",
  [C.ANDROID]: "Android",
  [C.ACCOMMODATION_ROOMS]: "Odalar",
  [C.ACCOMMODATION_RESERVATIONS]: "Oda rezervasyonları",
  [C.ACCOMMODATION_STAYS]: "Konaklamalar",
  [C.ACCOMMODATION_FOLIO]: "Oda hesabı",
  [C.FOOD_TABLES]: "Masalar",
  [C.FOOD_RESERVATIONS]: "Masa rezervasyonları",
  [C.FOOD_ORDERS]: "Adisyon / Sipariş",
  [C.FOOD_MENU]: "Menü",
  [C.QR_MENU]: "QR Menü",
  [C.CATALOG]: "Ürün kataloğu",
  [C.INVENTORY]: "Stok",
  [C.SALES]: "Satış",
  [C.CUSTOMER_CREDIT]: "Veresiye / Müşteri Hesabı",
  [C.RETAIL_BARCODE]: "Barkod",
  [C.RETAIL_PURCHASING]: "Satın alma",
  [C.RETAIL_SUPPLIERS]: "Tedarikçiler",
  [C.RETAIL_LABELS]: "Etiketler"
};

const CAPABILITY_GROUPS: ReadonlyArray<{
  title: string;
  description: string;
  capabilities: readonly BusinessCapability[];
}> = [
  {
    title: "Konaklama",
    description: "Oda ve konaklama işlerinde kullandığınız alanları seçin.",
    capabilities: [
      C.ACCOMMODATION_ROOMS,
      C.ACCOMMODATION_RESERVATIONS,
      C.ACCOMMODATION_STAYS,
      C.ACCOMMODATION_FOLIO
    ]
  },
  {
    title: "Restoran / Kafe",
    description: "Masa, rezervasyon, menü ve adisyon alanlarını seçin.",
    capabilities: [
      C.FOOD_TABLES,
      C.FOOD_RESERVATIONS,
      C.FOOD_MENU,
      C.FOOD_ORDERS,
      C.QR_MENU
    ]
  },
  {
    title: "Satış ve Stok",
    description: "Ürün, stok, satış ve müşteri hesabı alanlarını seçin.",
    capabilities: [C.CATALOG, C.INVENTORY, C.SALES, C.CUSTOMER_CREDIT]
  },
  {
    title: "Market",
    description: "Barkod, satın alma, tedarikçi ve etiket alanlarını seçin.",
    capabilities: [
      C.RETAIL_BARCODE,
      C.RETAIL_PURCHASING,
      C.RETAIL_SUPPLIERS,
      C.RETAIL_LABELS
    ]
  }
];

export function getEffectiveSetupCapabilities(
  profileId: string,
  snapshot: BusinessCapabilitySnapshot | null | undefined
): BusinessCapability[] {
  if (snapshot?.businessId && snapshot.profileId === profileId) {
    return snapshot.enabledCapabilities;
  }
  return getBusinessProfile(profileId).defaultCapabilities;
}

interface BusinessCapabilityEditorProps {
  profileId: string;
  snapshot?: BusinessCapabilitySnapshot | null;
  state?: SyncState;
  message?: string;
  onSetCapability?: (capability: BusinessCapability, enabled: boolean) => void;
  onClearOverride?: (capability: BusinessCapability) => void;
}

export function BusinessCapabilityEditor({
  profileId,
  snapshot,
  state = "idle",
  message = "",
  onSetCapability,
  onClearOverride
}: BusinessCapabilityEditorProps) {
  if (!snapshot?.businessId) {
    return null;
  }

  const profilePendingSave = snapshot.profileId !== profileId;
  const enabled = new Set(snapshot.enabledCapabilities);
  const entries = new Map(snapshot.capabilities.map((entry) => [entry.capability, entry]));
  const busy = state === "loading";

  return (
    <div className="setup-section settings-capabilities-section">
      <div className="setup-section-title">
        <h2>İşletme Özellikleri</h2>
      </div>
      <p className="setup-section-description">
        Seçtiğiniz sektör için önerilen özellikler otomatik gelir. Yalnız ihtiyacınız olan ek alanları buradan açıp kapatın.
      </p>
      {profilePendingSave && (
        <p className="menu-status sync-error" role="status">
          Önce üst bölümdeki sektör değişikliğini kaydedin.
        </p>
      )}
      <div className="settings-section-grid">
        {CAPABILITY_GROUPS.map((group) => (
          <fieldset className="setup-section" key={group.title} disabled={busy || profilePendingSave}>
            <legend>{group.title}</legend>
            <small>{group.description}</small>
            <div className="setup-grid two">
              {group.capabilities.map((capability) => {
                const entry = entries.get(capability);
                const checked = enabled.has(capability);
                const missingDependencies = getBusinessCapabilityDependencies(capability)
                  .filter((dependency) => !enabled.has(dependency));
                const enabledDependents = getEnabledBusinessCapabilityDependents(capability, enabled);
                const blockedReason = checked && enabledDependents.length > 0
                  ? `Önce kapatın: ${enabledDependents.map(capabilityLabel).join(", ")}`
                  : !checked && missingDependencies.length > 0
                    ? `Önce açın: ${missingDependencies.map(capabilityLabel).join(", ")}`
                    : "";
                const toggleDisabled = busy || profilePendingSave || Boolean(blockedReason) || !onSetCapability;

                return (
                  <div className="setup-field" key={capability}>
                    <label className="setup-checkline">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={toggleDisabled}
                        onChange={(event) => onSetCapability?.(capability, event.target.checked)}
                      />
                      {capabilityLabel(capability)}
                    </label>
                    {(blockedReason || capability === C.CUSTOMER_CREDIT) && <small>{blockedReason || "Kayıtlı müşterilerin veresiye satış ve tahsilat hareketlerini takip eder."}</small>}
                    {entry?.source === "user" && (
                      <button
                        className="setup-secondary"
                        type="button"
                        disabled={busy || profilePendingSave || !onClearOverride}
                        onClick={() => onClearOverride?.(capability)}
                      >
                        Önerilen Ayara Dön
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      {state !== "idle" && message && <p className={`menu-status sync-${state}`} role="status" aria-live="polite">{message}</p>}
    </div>
  );
}

function capabilityLabel(capability: BusinessCapability): string {
  return CAPABILITY_LABELS[capability] ?? capability;
}
