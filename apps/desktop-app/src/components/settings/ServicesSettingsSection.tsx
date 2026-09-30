import type { AndroidPermissionGroups } from "@yardimci-asistan/sync-core";
import { BUSINESS_CAPABILITIES, hasBusinessCapability, type BusinessCapability } from "@yardimci-asistan/shared";
import type { DesktopAndroidDevice, DesktopDashboardData, DesktopSetupData } from "../../../electron/database";
import type { DesktopAndroidInstallationSnapshot } from "../../../electron/android-installation-service";
import type { SetupFormState } from "../../app/setup-model";
import { AndroidDevicesSection } from "./AndroidDevicesSection";
type SyncState = "idle" | "loading" | "success" | "error";
import { AiSettingsSection } from "./AiSettingsSection";
import { WebSettingsSection } from "./WebSettingsSection";
import { TimePicker } from "../ui/DateTimePicker";
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

          <section id="settings-whatsapp" tabIndex={-1} className={`settings-service-card${form.whatsappEnabled ? " is-enabled" : " is-disabled"}`}>
            <div className="settings-service-card-header">
              <div>
                <strong>WhatsApp</strong>
                <span>{form.whatsappEnabled ? "Açık" : "Kapalı"}</span>
              </div>
              <label className="settings-service-toggle">
                <input aria-label="WhatsApp servisi" checked={form.whatsappEnabled} onChange={(event) => update("whatsappEnabled", event.target.checked)} type="checkbox" />
                <span>{form.whatsappEnabled ? "Açık" : "Kapalı"}</span>
              </label>
            </div>
            {form.whatsappEnabled && (
            <fieldset className="settings-service-card-body setup-birthday-settings form-stack">
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
              <fieldset className="form-stack birthday-mode-fieldset">
                <legend>Gönderim:</legend>
                <label className="form-check">
                  <input
                    checked={form.birthdaySettings.mode === "manual"}
                    onChange={() => updateBirthday("mode", "manual")}
                    name="birthday-mode"
                    type="radio"
                  />
                  Manuel
                </label>
                <label className="form-check">
                  <input
                    checked={form.birthdaySettings.mode === "automatic"}
                    onChange={() => updateBirthday("mode", "automatic")}
                    name="birthday-mode"
                    type="radio"
                  />
                  Otomatik
                </label>
              </fieldset>
              <div className="form-field form-field--short">
                <span>Gönderim saati</span>
                <TimePicker
                  ariaLabel="Gönderim saati"
                  value={form.birthdaySettings.sendTime}
                  onChange={(value) => updateBirthday("sendTime", value)}
                  disabled={!form.birthdaySettings.enabled}
                  clearable={false}
                />
              </div>
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
            </fieldset>
            )}
          </section>

          <section id="settings-android" tabIndex={-1} className={`settings-service-card${form.androidEnabled ? " is-enabled" : " is-disabled"}`}>
            <div className="settings-service-card-header">
              <div>
                <strong>Android</strong>
                <span>{form.androidEnabled ? `${dashboardData?.androidDevices.length ?? 0} cihaz` : "Kapalı"}</span>
              </div>
              <label className="settings-service-toggle">
                <input aria-label="Android servisi" checked={form.androidEnabled} onChange={(event) => update("androidEnabled", event.target.checked)} type="checkbox" />
                <span>{form.androidEnabled ? "Açık" : "Kapalı"}</span>
              </label>
            </div>
            {form.androidEnabled && (
              <div className="settings-service-card-body">
                <div className="form-stack">
                  <label className="form-check setup-checkline">
                    <input
                      checked={form.localNetworkEnabled}
                      onChange={(event) => update("localNetworkEnabled", event.target.checked)}
                      type="checkbox"
                    />
                    Yerel ağ bağlantısı
                  </label>
                  <small>
                    Aynı ağda masaüstü bulunursa Android doğrudan bağlanır; ulaşılamazsa web bağlantısı otomatik kullanılır.
                  </small>
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
            )}
          </section>

          {hasBusinessCapability(enabledCapabilities, BUSINESS_CAPABILITIES.RETAIL_BARCODE) && (
          <section id="settings-product-data" tabIndex={-1} className={`settings-service-card${form.productDataEnabled ? " is-enabled" : " is-disabled"}`}>
            <div className="settings-service-card-header">
              <div>
                <strong>Ürün Verisi</strong>
                <span>{form.productDataEnabled ? "Açık" : "Kapalı"}</span>
              </div>
              <label className="settings-service-toggle">
                <input
                  aria-label="Ürün Verisi servisi"
                  checked={form.productDataEnabled}
                  onChange={(event) => update("productDataEnabled", event.target.checked)}
                  type="checkbox"
                />
                <span>{form.productDataEnabled ? "Açık" : "Kapalı"}</span>
              </label>
            </div>
            <fieldset className="settings-service-card-body form-stack" disabled={!form.productDataEnabled}>
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
            </fieldset>
          </section>
          )}

          <AiSettingsSection
            form={form}
            onFormChange={onFormChange}
            onTestAiConnection={onTestAiConnection}
            aiConnectionTestState={aiConnectionTestState}
            aiConnectionTestMessage={aiConnectionTestMessage}
          />
        </div>
  );
}
