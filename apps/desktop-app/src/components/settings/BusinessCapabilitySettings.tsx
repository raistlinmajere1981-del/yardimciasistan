import { LockKeyhole, RotateCcw } from "lucide-react";
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
  capabilities: readonly BusinessCapability[];
}> = [
  {
    title: "Konaklama",
    capabilities: [
      C.ACCOMMODATION_ROOMS,
      C.ACCOMMODATION_RESERVATIONS,
      C.ACCOMMODATION_STAYS,
      C.ACCOMMODATION_FOLIO
    ]
  },
  {
    title: "Restoran / Kafe",
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
    capabilities: [C.CATALOG, C.INVENTORY, C.SALES, C.CUSTOMER_CREDIT]
  },
  {
    title: "Market",
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
    <div id="settings-capabilities" className="setup-section settings-capabilities-section">
      <div className="setup-section-title">
        <h2>İşletme Özellikleri</h2>
      </div>
      {profilePendingSave && (
        <p className="menu-status sync-error" role="status">
          Önce üst bölümdeki sektör değişikliğini kaydedin.
        </p>
      )}
      <div className="settings-capability-groups">
        {CAPABILITY_GROUPS.map((group) => {
          const enabledCount = group.capabilities.filter((capability) => enabled.has(capability)).length;
          return (
          <fieldset className="settings-capability-group-card" key={group.title} disabled={busy || profilePendingSave}>
            <legend>
              <span>{group.title}</span>
              <small>{enabledCount}/{group.capabilities.length} açık</small>
            </legend>
            <div className="settings-capability-list">
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

                const detail = blockedReason
                  || (capability === C.CUSTOMER_CREDIT
                    ? "Kayıtlı müşterilerin veresiye satış ve tahsilat hareketlerini takip eder."
                    : "");
                const sourceLabel = entry?.source === "user"
                  ? "Özel"
                  : entry?.source === "profile"
                    ? "Önerilen"
                    : "";

                return (
                  <div className={`settings-capability-row${checked ? " is-enabled" : ""}${blockedReason ? " is-blocked" : ""}`} key={capability}>
                    <div className="settings-capability-copy">
                      <div className="settings-capability-title-row">
                        <strong>{capabilityLabel(capability)}</strong>
                        {sourceLabel && <span className={`settings-capability-source source-${entry?.source}`}>{sourceLabel}</span>}
                        {blockedReason && <span className="settings-capability-lock"><LockKeyhole size={13} aria-hidden="true" /> Bağımlı</span>}
                      </div>
                      {detail && <small>{detail}</small>}
                    </div>
                    <div className="settings-capability-actions">
                      {entry?.source === "user" && (
                        <button
                          className="settings-capability-reset"
                          type="button"
                          disabled={busy || profilePendingSave || !onClearOverride}
                          onClick={() => onClearOverride?.(capability)}
                        >
                          <RotateCcw size={14} aria-hidden="true" />
                          Önerilene dön
                        </button>
                      )}
                      <button
                        className={`settings-capability-toggle${checked ? " is-on" : ""}`}
                        type="button"
                        role="switch"
                        aria-checked={checked}
                        aria-label={`${capabilityLabel(capability)}: ${checked ? "Açık" : "Kapalı"}`}
                        disabled={toggleDisabled}
                        onClick={() => onSetCapability?.(capability, !checked)}
                      >
                        <span className="settings-capability-toggle-track" aria-hidden="true">
                          <span className="settings-capability-toggle-thumb" />
                        </span>
                        <span>{checked ? "Açık" : "Kapalı"}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>
          );
        })}
      </div>
      {state === "error" && message && <p className="menu-status sync-error" role="alert">{message}</p>}
    </div>
  );
}

function capabilityLabel(capability: BusinessCapability): string {
  return CAPABILITY_LABELS[capability] ?? capability;
}
