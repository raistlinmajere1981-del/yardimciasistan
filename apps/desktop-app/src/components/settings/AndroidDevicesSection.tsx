import { RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { androidAvailablePermissionGroupIds, type AndroidPermissionGroupId, type AndroidPermissionGroups } from "@yardimci-asistan/sync-core";
import { BUSINESS_CAPABILITIES, hasBusinessCapability, type BusinessCapability } from "@yardimci-asistan/shared";
import type { DesktopAndroidDevice } from "../../../electron/database";
import type { DesktopAndroidInstallationSnapshot } from "../../../electron/android-installation-service";
import { formatDateTime } from "../../app/record-formatters";
import { ActionButton } from "../ui/ActionButton";
type SyncState = "idle" | "loading" | "success" | "error";
const ANDROID_PERMISSION_GROUP_OPTIONS: Array<{
  id: AndroidPermissionGroupId;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  { id: "service_orders", label: "Servis / Sipariş", shortLabel: "Servis", description: "Masa, sipariş ve servis akışı" },
  { id: "cashier", label: "Kasa / Hesap", shortLabel: "Kasa", description: "Ödendi / Kapat işlemi" },
  { id: "rooms_tasks", label: "Oda / Günlük İşler", shortLabel: "Oda işleri", description: "Oda durumu ve günlük işler" },
  { id: "customer_reservation", label: "Müşteri / Rezervasyon", shortLabel: "Müşteri / Rezervasyon", description: "Talep yanıtı ve rezervasyon onayı" },
  {
    id: "market_operations",
    label: "Market / El Terminali",
    shortLabel: "Market",
    description: "Barkod, stok sayımı, mal kabulü, ürün kaydı ve sepet hazırlama"
  }
];

interface AndroidDevicesSectionProps {
  devices: DesktopAndroidDevice[];
  enabledCapabilities: BusinessCapability[];
  state: SyncState;
  message: string;
  installState: SyncState;
  installMessage: string;
  installSnapshot: DesktopAndroidInstallationSnapshot | null;
  onRefreshInstallDevices?: () => void;
  onInstallApp?: (serial: string) => void;
  onSetRole?: (deviceId: string, role: "admin" | "staff") => void;
  onSetPermissionGroups?: (deviceId: string, groups: AndroidPermissionGroups) => void;
  onSetActive?: (deviceId: string, active: boolean) => void;
  onResetPermissions?: (deviceId: string) => void;
  onRevoke?: (device: DesktopAndroidDevice) => void;
}

export function AndroidDevicesSection({
  devices,
  enabledCapabilities,
  state,
  message,
  installState,
  installMessage,
  installSnapshot,
  onRefreshInstallDevices,
  onInstallApp,
  onSetRole,
  onSetPermissionGroups,
  onSetActive,
  onResetPermissions,
  onRevoke
}: AndroidDevicesSectionProps) {
  const busy = state === "loading";
  const availableGroupIds = new Set(androidAvailablePermissionGroupIds(enabledCapabilities));
  const permissionGroupOptions = ANDROID_PERMISSION_GROUP_OPTIONS
    .filter((group) => availableGroupIds.has(group.id))
    .map((group) => capabilityAwareAndroidGroupCopy(group, enabledCapabilities));
  const availableDevices = devices.filter((device) => !device.revokedAt);
  const removedDevices = devices.filter((device) => Boolean(device.revokedAt));
  const restoreDevice = (device: DesktopAndroidDevice) => {
    if (!onSetActive) return;
    const shortId = compactAndroidDeviceId(device.deviceId);
    const deviceName = device.deviceName || "Android Telefon";
    const roleLabel = device.role === "admin" ? "Yönetici" : "Personel";
    if (!window.confirm(`${deviceName} (${shortId}) ${roleLabel} rolü ve kayıtlı görev alanlarıyla geri yüklensin mi?`)) {
      return;
    }
    onSetActive(device.deviceId, true);
  };
  return (
    <section id="settings-devices" tabIndex={-1} className="settings-android-devices-section">
      <div className="android-devices-heading">
        <div>
          <h3>Telefon Kurulumu</h3>
        </div>
        <div className="android-devices-heading-actions">
          {installSnapshot?.bundledVersionName && <span>APK {installSnapshot.bundledVersionName}</span>}
          <ActionButton
            variant="secondary"
            className="setup-secondary"
            type="button"
            onClick={onRefreshInstallDevices}
            disabled={!onRefreshInstallDevices || installState === "loading"}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {installState === "loading" ? "Taranıyor" : "USB Cihazları Yenile"}
          </ActionButton>
        </div>
      </div>
      <p className="settings-service-note">
        USB hata ayıklaması açık Android cihazlara Yardımcı Asistanı doğrudan kurabilir veya güncelleyebilirsiniz.
      </p>
      {installSnapshot?.devices?.length ? (
        <div className="android-device-list android-install-device-list">
          {installSnapshot.devices.map((device) => {
            const canInstall = installSnapshot.apkAvailable
              && (device.action === "install" || device.action === "update");
            const actionLabel = device.action === "install"
              ? "Uygulamayı Kur"
              : device.action === "update"
                ? "Güncelle"
                : device.action === "authorize"
                  ? "USB Onayı Bekleniyor"
                  : device.action === "offline"
                    ? "Cihaz Hazır Değil"
                    : device.action === "newer"
                      ? "Daha Yeni Sürüm Kurulu"
                      : "Güncel";
            return (
              <article className="android-device-card android-install-device-card" key={device.serial}>
                <div className="android-device-identity">
                  <span className="android-device-icon"><Smartphone size={18} aria-hidden="true" /></span>
                  <div>
                    <strong>{device.model || "Android Cihaz"}</strong>
                    <code title={device.serial}>{device.serial}</code>
                  </div>
                  <div className="android-device-badges">
                    <span className={`device-state${device.state === "device" ? " is-active" : " is-inactive"}`}>
                      USB · {device.state === "device" ? "Hazır" : device.state}
                    </span>
                  </div>
                </div>
                <dl className="android-device-details">
                  <div><dt>Telefon</dt><dd>{device.appInstalled ? device.installedVersionName || "Kurulu" : "Uygulama kurulu değil"}</dd></div>
                  <div><dt>Desktop APK</dt><dd>{device.bundledVersionName || "Hazır değil"}</dd></div>
                  <div><dt>Durum</dt><dd>{device.message}</dd></div>
                </dl>
                <div className="android-device-actions">
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    className="setup-secondary"
                    type="button"
                    onClick={() => onInstallApp?.(device.serial)}
                    disabled={!canInstall || !onInstallApp || installState === "loading"}
                  >
                    {actionLabel}
                  </ActionButton>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="android-devices-empty">
          <Smartphone size={22} aria-hidden="true" />
          <div>
            <strong>USB Android cihazı bekleniyor.</strong>
            <span>{installSnapshot?.message || "Telefonu USB ile bağlayın ve USB hata ayıklamasını açın."}</span>
          </div>
        </div>
      )}
      <p className={`menu-status sync-${installState}`} role={installState === "error" ? "alert" : "status"} aria-live="polite">{installMessage}</p>

      <div className="android-devices-heading">
        <div>
          <h3>Cihazlar ve Yetkiler</h3>
        </div>
        <div className="android-devices-heading-actions">
          <span>{availableDevices.length} cihaz</span>
        </div>
      </div>
      <p className="settings-service-note">Rol ve görev alanları yalnız bu bilgisayardan değiştirilebilir.</p>
      {availableDevices.length === 0 ? (
        <div className="android-devices-empty">
          <Smartphone size={22} aria-hidden="true" />
          <div>
            <strong>{removedDevices.length > 0 ? "Etkin Android cihaz yok." : "Henüz Android cihaz görülmedi."}</strong>
            <span>{removedDevices.length > 0 ? "Gerekirse kaldırılan cihazlardan birini geri yükleyin." : "Telefon web modülüne bağlandığında burada personel olarak görünür."}</span>
          </div>
        </div>
      ) : (
        <div className="android-device-list">
          {availableDevices.map((device) => {
            const shortId = compactAndroidDeviceId(device.deviceId);
            return (
              <article className={`android-device-card${device.isActive ? "" : " is-inactive"}`} key={device.deviceId}>
                <div className="android-device-identity">
                  <span className="android-device-icon"><Smartphone size={18} aria-hidden="true" /></span>
                  <div>
                    <strong>{device.deviceName || "Android Telefon"}</strong>
                    <code title={device.deviceId}>{shortId}</code>
                  </div>
                  <div className="android-device-badges">
                    <span className={`device-role role-${device.role}`}>{device.role === "admin" ? "Yönetici" : "Personel"}</span>
                    <span className={`device-state${device.isActive ? " is-active" : " is-inactive"}`}>{device.isActive ? "Aktif" : "Pasif"}</span>
                  </div>
                </div>
                <dl className="android-device-details">
                  <div><dt>Son bağlantı</dt><dd>{device.lastSeenAt ? formatDateTime(device.lastSeenAt) : "Henüz yok"}</dd></div>
                  <div><dt>Uygulama</dt><dd>{device.appVersion || "Sürüm bilinmiyor"}</dd></div>
                  <div><dt>Görev özeti</dt><dd>{androidDevicePermissionSummary(device, permissionGroupOptions)}</dd></div>
                </dl>
                {device.role === "admin" ? (
                  <div className="android-device-all-permissions">
                    <ShieldCheck size={18} aria-hidden="true" />
                    <div>
                      <strong>Etkin alanlarda yönetici</strong>
                      <span>Yalnız işletmede etkin yeteneklerin izinleri kullanılabilir.</span>
                    </div>
                  </div>
                ) : (
                  <fieldset className="android-device-permission-groups" disabled={busy}>
                    <legend>Görev alanları</legend>
                    <div className="android-device-permission-grid">
                      {permissionGroupOptions.map((group) => {
                        const checked = Boolean(device.permissionGroups?.[group.id]);
                        return (
                          <label className={`android-permission-group${checked ? " is-selected" : ""}`} key={group.id}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => onSetPermissionGroups?.(
                                device.deviceId,
                                androidPermissionGroupsWith(device, group.id, event.target.checked)
                              )}
                              disabled={busy || !onSetPermissionGroups}
                            />
                            <span>
                              <strong>{group.label}</strong>
                              <small>{group.description}</small>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
                <div className="android-device-actions">
                  <ActionButton variant="secondary" size="sm" className="setup-secondary" type="button" onClick={() => onSetRole?.(device.deviceId, "admin")} disabled={busy || device.role === "admin"}>
                    <ShieldCheck size={15} aria-hidden="true" /> Yönetici Yap
                  </ActionButton>
                  <ActionButton variant="secondary" size="sm" className="setup-secondary" type="button" onClick={() => onSetRole?.(device.deviceId, "staff")} disabled={busy || device.role === "staff"}>Personel Yap</ActionButton>
                  <ActionButton variant="secondary" size="sm" className="setup-secondary" type="button" onClick={() => onSetActive?.(device.deviceId, !device.isActive)} disabled={busy}>{device.isActive ? "Pasifleştir" : "Aktif Et"}</ActionButton>
                  <ActionButton variant="secondary" size="sm" className="setup-secondary" type="button" onClick={() => onResetPermissions?.(device.deviceId)} disabled={busy}>Yetkileri Sıfırla</ActionButton>
                  <ActionButton variant="secondary" size="sm" className="setup-secondary android-device-remove" type="button" onClick={() => onRevoke?.(device)} disabled={busy}>Kaldır</ActionButton>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {removedDevices.length > 0 && (
        <details className="android-removed-devices">
          <summary>
            <span>Kaldırılan cihazlar</span>
            <strong>{removedDevices.length}</strong>
          </summary>
          <div className="android-removed-device-list">
            {removedDevices.map((device) => (
              <article className="android-removed-device-row" key={device.deviceId}>
                <div className="android-device-identity">
                  <span className="android-device-icon"><Smartphone size={17} aria-hidden="true" /></span>
                  <div>
                    <strong>{device.deviceName || "Android Telefon"}</strong>
                    <code title={device.deviceId}>{compactAndroidDeviceId(device.deviceId)}</code>
                  </div>
                  <span className={`device-role role-${device.role}`}>{device.role === "admin" ? "Yönetici" : "Personel"}</span>
                </div>
                <span>{device.revokedAt ? `${formatDateTime(device.revokedAt)} tarihinde kaldırıldı` : "Erişimi kapalı"}</span>
                <ActionButton
                  variant="secondary"
                  size="sm"
                  aria-label={`${device.deviceName || "Android Telefon"} (${compactAndroidDeviceId(device.deviceId)}) cihazını geri yükle`}
                  className="setup-secondary"
                  type="button"
                  onClick={() => restoreDevice(device)}
                  disabled={busy || !onSetActive}
                >
                  Geri Yükle
                </ActionButton>
              </article>
            ))}
          </div>
        </details>
      )}
      <p className={`menu-status sync-${state}`} role={state === "error" ? "alert" : "status"} aria-live="polite">{message}</p>
    </section>
  );
}

function compactAndroidDeviceId(deviceId: string): string {
  return deviceId.length > 22
    ? `${deviceId.slice(0, 12)}…${deviceId.slice(-6)}`
    : deviceId;
}

function androidPermissionGroupsWith(
  device: DesktopAndroidDevice,
  changedGroupId: AndroidPermissionGroupId,
  enabled: boolean
): AndroidPermissionGroups {
  return Object.fromEntries(ANDROID_PERMISSION_GROUP_OPTIONS.map((group) => [
    group.id,
    group.id === changedGroupId ? enabled : Boolean(device.permissionGroups?.[group.id])
  ])) as AndroidPermissionGroups;
}

function androidDevicePermissionSummary(
  device: DesktopAndroidDevice,
  groupOptions: typeof ANDROID_PERMISSION_GROUP_OPTIONS = ANDROID_PERMISSION_GROUP_OPTIONS
): string {
  if (!device.isActive) {
    return "Yetkisiz / Pasif";
  }
  if (device.role === "admin") {
    return "Etkin yeteneklerde tüm izinler";
  }
  const selected = groupOptions
    .filter((group) => device.permissionGroups?.[group.id])
    .map((group) => group.shortLabel);
  return selected.length > 0 ? selected.join(" + ") : "Görev alanı seçilmedi";
}

function capabilityAwareAndroidGroupCopy(
  group: typeof ANDROID_PERMISSION_GROUP_OPTIONS[number],
  capabilities: Iterable<BusinessCapability>
): typeof ANDROID_PERMISSION_GROUP_OPTIONS[number] {
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  if (group.id === "service_orders") {
    const hasService = hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.FOOD_TABLES)
      || hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.FOOD_ORDERS);
    if (!hasService) {
      const inventory = hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.INVENTORY);
      return {
        ...group,
        label: inventory ? "Menü / Stok" : "Menü",
        shortLabel: inventory ? "Menü / Stok" : "Menü",
        description: inventory ? "Menü ve stok durumunu görüntüleme" : "Menü kayıtlarını görüntüleme"
      };
    }
  }
  if (group.id === "cashier") {
    const hasDomainCheckout = hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.FOOD_ORDERS)
      || hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.ACCOMMODATION_FOLIO);
    return hasDomainCheckout
      ? group
      : { ...group, label: "Kasa / Finans", shortLabel: "Kasa", description: "Finans kayıtlarını görüntüleme ve ekleme" };
  }
  if (group.id === "rooms_tasks"
      && !hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS)) {
    return {
      ...group,
      label: "Günlük İşler",
      shortLabel: "İşler",
      description: "Genel günlük işleri görüntüleme ve tamamlama"
    };
  }
  if (group.id === "customer_reservation"
      && !hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS)
      && !hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.FOOD_RESERVATIONS)) {
    return {
      ...group,
      label: "Müşteri Talepleri",
      shortLabel: "Müşteri",
      description: "Talepleri görüntüleme ve yanıtlama"
    };
  }
  return group;
}
