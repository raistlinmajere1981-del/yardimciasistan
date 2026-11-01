import type { AndroidPermissionGroups } from "@yardimci-asistan/sync-core";
import { isBusinessServiceAvailable, type BusinessCapability } from "@yardimci-asistan/shared";
import type { DesktopAndroidDevice, DesktopDashboardData, DesktopSetupData } from "../../../electron/database";
import type { SetupFormState } from "../../app/setup-model";
import { LocalCompanionPairingPanel } from "./LocalCompanionPairingPanel";
import { AndroidDevicesSection } from "./AndroidDevicesSection";
type SyncState = "idle" | "loading" | "success" | "error";
import { ServiceSettingsCard } from "./ServiceSettingsCard";
export interface ServicesSettingsProps {
  form: SetupFormState;
  enabledCapabilities: BusinessCapability[];
  setupData: DesktopSetupData;
  disabled?: boolean;
  dashboardData?: DesktopDashboardData;
  androidDeviceState?: SyncState;
  onFormChange: (form: SetupFormState) => void;
  onRefreshAndroidDevices?: () => void;
  onSetAndroidDeviceRole?: (deviceId: string, role: "admin" | "staff") => void;
  androidPermissionGroups?: Record<string, AndroidPermissionGroups>;
  onAndroidPermissionGroupsChange?: (deviceId: string, groups: AndroidPermissionGroups) => void;
  onSetAndroidDeviceActive?: (deviceId: string, active: boolean) => void;
  onResetAndroidDevicePermissions?: (deviceId: string) => void;
  onRevokeAndroidDevice?: (device: DesktopAndroidDevice) => void;
}

export function ServicesSettingsSection({
  form,
  enabledCapabilities,
  setupData,
  disabled = false,
  dashboardData,
  androidDeviceState = "idle",
  onFormChange,
  onRefreshAndroidDevices,
  onSetAndroidDeviceRole,
  androidPermissionGroups,
  onAndroidPermissionGroupsChange,
  onSetAndroidDeviceActive,
  onResetAndroidDevicePermissions,
  onRevokeAndroidDevice,
}: ServicesSettingsProps) {
  const update = <Key extends keyof SetupFormState,>(key: Key, value: SetupFormState[Key]) => {
    onFormChange({ ...form, [key]: value });
  };

  const updateBirthday = <Key extends keyof SetupFormState["birthdaySettings"],>(
    key: Key,
    value: SetupFormState["birthdaySettings"][Key]
  ) => {
    update("birthdaySettings", { ...form.birthdaySettings, [key]: value });
  };

  const androidReady = !setupData.setupRequired && setupData.servicePreferences.android
    && enabledCapabilities.includes("service.android");

  return (
        <>

          {isBusinessServiceAvailable("whatsapp", enabledCapabilities) && (
          <ServiceSettingsCard disabled={disabled} readiness="Test kullanılamıyor" id="settings-whatsapp" title="WhatsApp" enabled={form.whatsappEnabled} onEnabledChange={enabled => update("whatsappEnabled", enabled)}>
            <div className="setup-birthday-settings form-stack">
              <div className="setup-section-title setup-section-title--subsection">
                <h3>Doğum Günü Mesajları</h3>
              </div>
            <label className="form-check setup-checkline">
              <input
                checked={form.birthdaySettings.enabled}
                onChange={(event) => updateBirthday("enabled", event.target.checked)}
                type="checkbox"
              />
              Doğum günü mesajlarını kullan
            </label>
            <div className="form-grid">
              <label className="form-field form-field--span form-field--fluid">
                Mesaj
                <textarea
                  value={form.birthdaySettings.messageTemplate}
                  onChange={(event) => updateBirthday("messageTemplate", event.target.value)}
                  maxLength={4000}
                  disabled={!form.birthdaySettings.enabled}
                />
                <small>{"{ad}"} ve {"{işletme}"} yer tutucuları desteklenir.</small>
              </label>
            </div>
            </div>
          </ServiceSettingsCard>
          )}

          {isBusinessServiceAvailable("android", enabledCapabilities) && (
          <ServiceSettingsCard disabled={disabled} readiness="Test kullanılamıyor" id="settings-android" title="Android" enabled={form.androidEnabled}
            status={`${(dashboardData?.androidDevices ?? []).filter(device => device.isActive && !device.revokedAt).length} etkin cihaz`}
            onEnabledChange={enabled => update("androidEnabled", enabled)}>
              <div className="form-stack">
                <div className="form-stack">
                  <label className="form-check setup-checkline">
                    <input
                      checked={form.localNetworkEnabled}
                      onChange={(event) => update("localNetworkEnabled", event.target.checked)}
                      type="checkbox"
                    />
                    Yerel ağ bağlantısı
                  </label>
                </div>
                {form.androidEnabled && <>
                  {!androidReady && <p className="settings-service-empty" role="status">
                    Cihaz işlemleri için Android servisini Kaydet ile etkinleştirin.
                  </p>}
                  {androidReady && setupData.localNetworkEnabled !== false && form.localNetworkEnabled
                    && <LocalCompanionPairingPanel disabled={disabled} />}
                  <AndroidDevicesSection
                    operationsEnabled={androidReady && !disabled}
                    devices={dashboardData?.androidDevices ?? []}
                    enabledCapabilities={enabledCapabilities}
                    state={androidDeviceState}
                    {...(onRefreshAndroidDevices === undefined ? {} : { onRefresh: onRefreshAndroidDevices })}
                    {...(onSetAndroidDeviceRole === undefined ? {} : { onSetRole: onSetAndroidDeviceRole })}
                    {...(androidPermissionGroups === undefined ? {} : { permissionGroupsByDevice: androidPermissionGroups })}
                    {...(onAndroidPermissionGroupsChange === undefined ? {} : { onPermissionGroupsChange: onAndroidPermissionGroupsChange })}
                    {...(onSetAndroidDeviceActive === undefined ? {} : { onSetActive: onSetAndroidDeviceActive })}
                    {...(onResetAndroidDevicePermissions === undefined ? {} : { onResetPermissions: onResetAndroidDevicePermissions })}
                    {...(onRevokeAndroidDevice === undefined ? {} : { onRevoke: onRevokeAndroidDevice })}
                  />
                </>}
              </div>
          </ServiceSettingsCard>
          )}

          {isBusinessServiceAvailable("productData", enabledCapabilities) && (
          <ServiceSettingsCard disabled={disabled} readiness="Test kullanılamıyor" id="settings-product-data" title="Ürün Verisi"
            enabled={form.productDataEnabled} onEnabledChange={(enabled) => update("productDataEnabled", enabled)}>
              <div className="settings-service-empty">
                Veri kaynağı: Open Food Facts · Veri lisansı: ODbL · Görseller: CC BY-SA
              </div>
              <label className="form-check setup-checkline">
                <input
                  checked={form.productDataAutoSearch}
                  onChange={(event) => update("productDataAutoSearch", event.target.checked)}
                  type="checkbox"
                />
                Bilinmeyen barkodu otomatik ara
              </label>
              <label className="form-check setup-checkline">
                <input
                  checked={form.productDataIncludeImages}
                  onChange={(event) => update("productDataIncludeImages", event.target.checked)}
                  type="checkbox"
                />
                Görselleri ekle
              </label>
              <small>
                Otomatik arama kapalıysa ürün kartındaki “Ürün Bilgilerini Ara” düğmesiyle manuel sorgu yapılabilir.
              </small>
          </ServiceSettingsCard>
          )}

        </>
  );
}
