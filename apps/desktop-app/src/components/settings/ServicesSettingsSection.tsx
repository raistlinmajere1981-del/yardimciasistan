import type { AndroidPermissionGroups } from "@yardimci-asistan/sync-core";
import { isBusinessServiceAvailable, type BusinessCapability } from "@yardimci-asistan/shared";
import type { DesktopAndroidDevice, DesktopDashboardData, DesktopSetupData } from "../../../electron/database";
import type { DesktopAndroidInstallationSnapshot } from "../../../electron/android-installation-service";
import type { SetupFormState } from "../../app/setup-model";
import { AndroidDevicesSection } from "./AndroidDevicesSection";
type SyncState = "idle" | "loading" | "success" | "error";
import { AiSettingsSection } from "./AiSettingsSection";
import { WebSettingsSection } from "./WebSettingsSection";
import { ServiceSettingsCard } from "./ServiceSettingsCard";
export interface ServicesSettingsProps {
  form: SetupFormState;
  enabledCapabilities: BusinessCapability[];
  setupData: DesktopSetupData;
  dashboardData?: DesktopDashboardData;
  androidDeviceState?: SyncState;
  androidInstallState?: SyncState;
  androidInstallSnapshot?: DesktopAndroidInstallationSnapshot | null;
  aiConnectionTestState: SyncState;
  aiConnectionTestMessage: string;
  onFormChange: (form: SetupFormState) => void;
  onTestAiConnection: () => void;
  onRefreshAndroidInstallDevices?: () => void;
  onInstallAndroidApp?: (serial: string) => void;
  onProvisionAndroidApp?: (serial: string) => void;
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
  dashboardData,
  androidDeviceState = "idle",
  androidInstallState = "idle",
  androidInstallSnapshot = null,
  aiConnectionTestState,
  aiConnectionTestMessage,
  onFormChange,
  onTestAiConnection,
  onRefreshAndroidInstallDevices,
  onInstallAndroidApp,
  onProvisionAndroidApp,
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

  return (
        <div id="settings-connections" className="settings-services-workspace">
          <WebSettingsSection form={form} onFormChange={onFormChange} />

          {isBusinessServiceAvailable("whatsapp", enabledCapabilities) && (
          <ServiceSettingsCard id="settings-whatsapp" title="WhatsApp" enabled={form.whatsappEnabled} onEnabledChange={enabled => update("whatsappEnabled", enabled)}>
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
          <ServiceSettingsCard id="settings-android" title="Android" enabled={form.androidEnabled} onEnabledChange={enabled => update("androidEnabled", enabled)}>
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
                {setupData.setupRequired || !setupData.servicePreferences.android ? (
                  <p className="settings-service-empty">
                    Android servisini Kaydet ile etkinleştirdikten sonra cihaz yönetimi kullanılabilir.
                  </p>
                ) : (
                  <AndroidDevicesSection
                    devices={dashboardData?.androidDevices ?? []}
                    enabledCapabilities={enabledCapabilities}
                    state={androidDeviceState}
                                  installState={androidInstallState}
                                  installSnapshot={androidInstallSnapshot}
                    onRefreshInstallDevices={onRefreshAndroidInstallDevices}
                    onInstallApp={onInstallAndroidApp}
                    onProvisionApp={onProvisionAndroidApp}
                    onSetRole={onSetAndroidDeviceRole}
                    permissionGroupsByDevice={androidPermissionGroups}
                    onPermissionGroupsChange={onAndroidPermissionGroupsChange}
                    onSetActive={onSetAndroidDeviceActive}
                    onResetPermissions={onResetAndroidDevicePermissions}
                    onRevoke={onRevokeAndroidDevice}
                  />
                )}
              </div>
          </ServiceSettingsCard>
          )}

          {isBusinessServiceAvailable("productData", enabledCapabilities) && (
          <ServiceSettingsCard id="settings-product-data" title="Ürün Verisi"
            enabled={form.productDataEnabled} onEnabledChange={(enabled) => update("productDataEnabled", enabled)}>
              <label className="form-field form-field--medium">
                Sağlayıcı
                <select
                  value={form.productDataProvider}
                  onChange={() => update("productDataProvider", "open_food_facts")}
                >
                  <option value="open_food_facts">Open Food Facts</option>
                </select>
              </label>
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

          {isBusinessServiceAvailable("ai", enabledCapabilities) && (
          <AiSettingsSection
            form={form}
            onFormChange={onFormChange}
            onTestAiConnection={onTestAiConnection}
            aiConnectionTestState={aiConnectionTestState}
            aiConnectionTestMessage={aiConnectionTestMessage}
          />
          )}
        </div>
  );
}
