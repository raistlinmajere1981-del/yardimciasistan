import { useConfirmDialog } from "../ui/useConfirmDialog";
import { RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import {
  androidAvailablePermissionGroupIds,
  type AndroidPermissionGroupId,
  type AndroidPermissionGroups
} from "@yardimci-asistan/sync-core";
import {
  BUSINESS_CAPABILITIES,
  hasBusinessCapability,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type { DesktopAndroidDevice } from "../../../electron/database";
import type {
  DesktopAndroidInstallDevice,
  DesktopAndroidInstallationSnapshot
} from "../../../electron/android-installation-service";
import { formatDateTime } from "../../app/record-formatters";
import { ActionButton } from "../ui/ActionButton";

type SyncState = "idle" | "loading" | "success" | "error";

const ANDROID_PERMISSION_GROUP_OPTIONS: Array<{
  id: AndroidPermissionGroupId;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  { id: "voice_dictation", label: "Ses / Dikte", shortLabel: "Dikte", description: "Ses kaydını Hosting üzerinden metne çevirme; metin yalnız açık onayla kullanılır" },
  { id: "commerce_orders_view", label: "Ticari Sipariş / Görüntüleme", shortLabel: "Ticari sipariş", description: "Ticari sipariş durum özetleri" },
  { id: "commerce_orders_manage", label: "Ticari Sipariş / Karar", shortLabel: "Sipariş kararı", description: "Ticari siparişi onaylama ve iptal etme" },
  { id: "dealer_view", label: "Bayi / Durum", shortLabel: "Bayi", description: "Ticari profil ve fiyat grubu özeti" },
  { id: "shipment_view", label: "Gönderi / Durum", shortLabel: "Gönderi", description: "Siparişe bağlı gönderi ve takip durumu" },
  { id: "online_sales_view", label: "Online Satış / Durum", shortLabel: "Online satış", description: "Online sipariş kaynağı ve katalog yayın durumu" },
  { id: "marketing_status_view", label: "Pazarlama / Durum", shortLabel: "Pazarlama", description: "Yayın, plan ve kampanya sonuçları" },
  { id: "service_orders", label: "Servis / Sipariş", shortLabel: "Servis", description: "Masa, sipariş ve servis akışı" },
  { id: "cashier", label: "Kasa / Hesap", shortLabel: "Kasa", description: "Ödendi / Kapat işlemi" },
  { id: "rooms_tasks", label: "Oda / Günlük İşler", shortLabel: "Oda işleri", description: "Oda durumu ve günlük işler" },
  { id: "customer_reservation", label: "Müşteri / Rezervasyon", shortLabel: "Müşteri / Rezervasyon", description: "Talep yanıtı ve rezervasyon onayı" },
  { id: "market_sales", label: "Market / Mobil Satış", shortLabel: "Mobil satış", description: "Sepeti son satış kaydına dönüştürme; kart ödemesi harici POS'ta alınır" },
  { id: "customer_credit_view", label: "Cari / Görüntüleme", shortLabel: "Cari görüntüleme", description: "Müşteri adı, para birimine göre borç ve son hareketler" },
  { id: "customer_credit_payment", label: "Cari / Tahsilat", shortLabel: "Cari tahsilat", description: "Müşteri borcuna nakit, harici kart, havale veya diğer tahsilatı kaydetme" },
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
  installState: SyncState;
  installSnapshot: DesktopAndroidInstallationSnapshot | null;
  onRefreshInstallDevices?: () => void;
  onInstallApp?: (serial: string) => void;
  onProvisionApp?: (serial: string) => void;
  onSetRole?: (deviceId: string, role: "admin" | "staff") => void;
  permissionGroupsByDevice?: Record<string, AndroidPermissionGroups>;
  onPermissionGroupsChange?: (deviceId: string, groups: AndroidPermissionGroups) => void;
  onSetActive?: (deviceId: string, active: boolean) => void;
  onResetPermissions?: (deviceId: string) => void;
  onRevoke?: (device: DesktopAndroidDevice) => void;
}

export function AndroidDevicesSection({
  devices,
  enabledCapabilities,
  state,
  installState,
  installSnapshot,
  onRefreshInstallDevices,
  onInstallApp,
  onProvisionApp,
  onSetRole,
  permissionGroupsByDevice,
  onPermissionGroupsChange,
  onSetActive,
  onResetPermissions,
  onRevoke
}: AndroidDevicesSectionProps) {
  const busy = state === "loading";
  const installBusy = installState === "loading";
  const { confirm, confirmDialog } = useConfirmDialog();
  const availableDevices = devices.filter((device) => !device.revokedAt);
  const removedDevices = devices.filter((device) => Boolean(device.revokedAt));
  const usbDevices = installSnapshot?.devices ?? [];
  const availableGroupIds = new Set(androidAvailablePermissionGroupIds(enabledCapabilities));
  const permissionGroupOptions = ANDROID_PERMISSION_GROUP_OPTIONS
    .filter((group) => availableGroupIds.has(group.id))
    .map((group) => capabilityAwareAndroidGroupCopy(group, enabledCapabilities));

  const matchedDeviceIds = new Set<string>();
  const usbRows = usbDevices.map((usbDevice) => {
    const registeredDevice = findRegisteredDeviceForUsb(usbDevice, availableDevices);
    if (registeredDevice) matchedDeviceIds.add(registeredDevice.deviceId);
    return { usbDevice, registeredDevice };
  });
  const offlineRegisteredDevices = availableDevices.filter((device) => !matchedDeviceIds.has(device.deviceId));

  const restoreDevice = async (device: DesktopAndroidDevice) => {
    if (!onSetActive) return;
    const shortId = compactAndroidDeviceId(device.deviceId);
    const deviceName = device.deviceName || "Android Telefon";
    const roleLabel = device.role === "admin" ? "Yönetici" : "Personel";
    if (!(await confirm({
      title: "Telefonu geri yükle",
      description: `${deviceName} (${shortId}) ${roleLabel} rolü ve kayıtlı görev alanlarıyla geri yüklensin mi?`,
      tone: "warning",
      confirmLabel: "Geri Yükle"
    }))) {
      return;
    }
    onSetActive(device.deviceId, true);
  };

  const renderManagement = (device: DesktopAndroidDevice) => {
    const permissionGroups = permissionGroupsByDevice?.[device.deviceId] ?? device.permissionGroups;
    return (
      <>
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
                const checked = Boolean(permissionGroups?.[group.id]);
                return (
                  <label className={`android-permission-group${checked ? " is-selected" : ""}`} key={group.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => onPermissionGroupsChange?.(
                        device.deviceId,
                        androidPermissionGroupsWith(permissionGroups, group.id, event.target.checked)
                      )}
                      disabled={busy || !onPermissionGroupsChange}
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
          <ActionButton
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => onSetRole?.(device.deviceId, "admin")}
            disabled={busy || device.role === "admin"}
          >
            <ShieldCheck size={15} aria-hidden="true" /> Yönetici Yap
          </ActionButton>
          <ActionButton
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => onSetRole?.(device.deviceId, "staff")}
            disabled={busy || device.role === "staff"}
          >
            Personel Yap
          </ActionButton>
          <ActionButton
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => onSetActive?.(device.deviceId, !device.isActive)}
            disabled={busy}
          >
            {device.isActive ? "Pasifleştir" : "Aktif Et"}
          </ActionButton>
          <ActionButton
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => onResetPermissions?.(device.deviceId)}
            disabled={busy}
          >
            Yetkileri Sıfırla
          </ActionButton>
          <ActionButton
            variant="secondary"
            size="sm"
            className="android-device-remove"
            type="button"
            onClick={() => onRevoke?.(device)}
            disabled={busy}
          >
            Kaldır
          </ActionButton>
        </div>
      </>
    );
  };

  return (
    <section id="settings-devices" tabIndex={-1} className="settings-android-devices-section">
      {confirmDialog}

      <div className="android-devices-heading">
        <div>
          <h3>Telefonlar</h3>
        </div>
        <div className="android-devices-heading-actions">
          <span>{availableDevices.length} kayıtlı</span>
          <ActionButton
            variant="secondary"
            size="sm"
            type="button"
            onClick={onRefreshInstallDevices}
            disabled={!onRefreshInstallDevices || installBusy}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {installBusy ? "Taranıyor" : "Yenile"}
          </ActionButton>
        </div>
      </div>

      {usbRows.length === 0 && offlineRegisteredDevices.length === 0 ? (
        <div className="android-devices-empty">
          <Smartphone size={22} aria-hidden="true" />
          <div>
            <strong>Henüz telefon yok.</strong>
            <span>{installSnapshot?.message || "Kurulum için telefonu USB ile bağlayıp USB hata ayıklamasını açın."}</span>
          </div>
        </div>
      ) : (
        <div className="android-device-list">
          {usbRows.map(({ usbDevice, registeredDevice }) => {
            const installAction = usbDevice.action === "install" || usbDevice.action === "update";
            const canInstall = Boolean(installSnapshot?.apkAvailable && installAction);
            const canCompleteSetup = usbDevice.appInstalled
              && usbDevice.state === "device"
              && !registeredDevice;
            const primaryLabel = installAction && !installSnapshot?.apkAvailable
              ? "APK Hazır Değil"
              : usbDevice.action === "install"
                ? "Uygulamayı Kur"
                : usbDevice.action === "update"
                  ? "Güncelle"
                  : canCompleteSetup
                    ? "Kurulumu Tamamla"
                    : "";
            const primaryDisabled = installBusy
              || (installAction
                ? !canInstall || !onInstallApp
                : canCompleteSetup
                  ? !onProvisionApp
                  : true);
            return (
              <article
                className={`android-device-card${registeredDevice && !registeredDevice.isActive ? " is-inactive" : ""}`}
                key={usbDevice.serial}
              >
                <div className="android-device-identity">
                  <span className="android-device-icon"><Smartphone size={18} aria-hidden="true" /></span>
                  <div>
                    <strong>{registeredDevice?.deviceName || usbDevice.model || "Android Telefon"}</strong>
                    <code title={registeredDevice?.deviceId || usbDevice.serial}>
                      {registeredDevice
                        ? compactAndroidDeviceId(registeredDevice.deviceId)
                        : usbDevice.deviceId
                          ? compactAndroidDeviceId(usbDevice.deviceId)
                          : usbDevice.serial}
                    </code>
                  </div>
                  <div className="android-device-badges">
                    <span className={`device-state${usbDevice.state === "device" ? " is-active" : " is-inactive"}`}>
                      USB · {usbDevice.state === "device" ? "Hazır" : usbDevice.state}
                    </span>
                    {registeredDevice && (
                      <>
                        <span className={`device-role role-${registeredDevice.role}`}>
                          {registeredDevice.role === "admin" ? "Yönetici" : "Personel"}
                        </span>
                        <span className={`device-state${registeredDevice.isActive ? " is-active" : " is-inactive"}`}>
                          {registeredDevice.isActive ? "Bağlı" : "Pasif"}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <dl className="android-device-details">
                  <div>
                    <dt>Uygulama</dt>
                    <dd>{usbDevice.appInstalled ? usbDevice.installedVersionName || "Kurulu" : "Kurulu değil"}</dd>
                  </div>
                  <div>
                    <dt>Bağlantı</dt>
                    <dd>{registeredDevice
                      ? registeredDevice.lastSeenAt ? formatDateTime(registeredDevice.lastSeenAt) : "Hazır"
                      : usbDevice.appInstalled ? "Kurulum tamamlanmadı" : "Uygulama bekleniyor"}</dd>
                  </div>
                  <div>
                    <dt>Durum</dt>
                    <dd>{registeredDevice
                      ? androidDevicePermissionSummary(registeredDevice, permissionGroupOptions)
                      : usbDevice.message}</dd>
                  </div>
                </dl>

                {primaryLabel && (
                  <div className="android-device-actions">
                    <ActionButton
                      size="sm"
                      type="button"
                      onClick={() => {
                        if (canInstall) {
                          onInstallApp?.(usbDevice.serial);
                        } else if (canCompleteSetup) {
                          onProvisionApp?.(usbDevice.serial);
                        }
                      }}
                      disabled={primaryDisabled}
                    >
                      {primaryLabel}
                    </ActionButton>
                  </div>
                )}

                {registeredDevice && renderManagement(registeredDevice)}
              </article>
            );
          })}

          {offlineRegisteredDevices.map((device) => {
            const permissionGroups = permissionGroupsByDevice?.[device.deviceId] ?? device.permissionGroups;
            return (
              <article className={`android-device-card${device.isActive ? "" : " is-inactive"}`} key={device.deviceId}>
                <div className="android-device-identity">
                  <span className="android-device-icon"><Smartphone size={18} aria-hidden="true" /></span>
                  <div>
                    <strong>{device.deviceName || "Android Telefon"}</strong>
                    <code title={device.deviceId}>{compactAndroidDeviceId(device.deviceId)}</code>
                  </div>
                  <div className="android-device-badges">
                    <span className="device-state is-inactive">USB · Bağlı değil</span>
                    <span className={`device-role role-${device.role}`}>{device.role === "admin" ? "Yönetici" : "Personel"}</span>
                    <span className={`device-state${device.isActive ? " is-active" : " is-inactive"}`}>
                      {device.isActive ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                </div>
                <dl className="android-device-details">
                  <div><dt>Son bağlantı</dt><dd>{device.lastSeenAt ? formatDateTime(device.lastSeenAt) : "Henüz yok"}</dd></div>
                  <div><dt>Uygulama</dt><dd>{device.appVersion || "Sürüm bilinmiyor"}</dd></div>
                  <div><dt>Görev özeti</dt><dd>{androidDevicePermissionSummary({ ...device, permissionGroups }, permissionGroupOptions)}</dd></div>
                </dl>
                {renderManagement(device)}
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
                  type="button"
                  onClick={() => void restoreDevice(device)}
                  disabled={busy || !onSetActive}
                >
                  Geri Yükle
                </ActionButton>
              </article>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function findRegisteredDeviceForUsb(
  usbDevice: DesktopAndroidInstallDevice,
  devices: DesktopAndroidDevice[]
): DesktopAndroidDevice | undefined {
  if (usbDevice.deviceId) {
    const exact = devices.find((device) => device.deviceId === usbDevice.deviceId);
    if (exact) return exact;
  }

  const model = normalizeDeviceName(usbDevice.model);
  if (!model) return undefined;
  const matches = devices.filter((device) => normalizeDeviceName(device.deviceName) === model);
  return matches.length === 1 ? matches[0] : undefined;
}

function normalizeDeviceName(value: string): string {
  return String(value ?? "").trim().toLocaleLowerCase("tr-TR");
}

function compactAndroidDeviceId(deviceId: string): string {
  return deviceId.length > 22
    ? `${deviceId.slice(0, 12)}…${deviceId.slice(-6)}`
    : deviceId;
}

function androidPermissionGroupsWith(
  current: AndroidPermissionGroups,
  changedGroupId: AndroidPermissionGroupId,
  enabled: boolean
): AndroidPermissionGroups {
  return Object.fromEntries(ANDROID_PERMISSION_GROUP_OPTIONS.map((group) => [
    group.id,
    group.id === changedGroupId ? enabled : Boolean(current?.[group.id])
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
